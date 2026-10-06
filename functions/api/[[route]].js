// Accounts and per-user sync for the Deutsch-Lernen site (Cloudflare Pages Functions).
//
// Needs, in the Pages project settings:
//   D1 binding  DB              -> a D1 database (tables are created on first use)
//   variable    BREVO_API_KEY   -> Brevo API key (secret), used to email password-reset codes
//   variable    MAIL_FROM       -> the sender address verified in Brevo
//   variable    MAIL_NAME       -> optional sender name (default "Deutsch lernen")
//   variable    ALLOWED_ORIGINS -> optional, extra comma-separated origins allowed to call the API
//   variable    SITE_URL        -> optional, site root used in the reset link (default: this deployment's origin)
//   AI binding  AI              -> optional, Workers AI: default sentence translation for users without their own link
//
// Routes (JSON in, JSON out; auth = "Authorization: Bearer <token>"):
//   POST /api/register        {email, password}            -> {pending, email}  (emails a confirmation link; 409 code "exists")
//   POST /api/verify          {token}                      -> {token, email, id}   (the link from that email; signs in)
//   POST /api/verify/resend   {email}                      -> {ok}
//   POST /api/login           {email, password}            -> {token, email, id}   (403 code "unverified" before confirming)
//   POST /api/logout          (auth)                                                (this device only)
//   GET  /api/me              (auth)                       -> {email, id}
//   POST /api/password        (auth) {password}            -> {token, email, id}   (other devices are signed out)
//   POST /api/reset/request   {email}                      -> {ok}     (emails a reset link + 6-digit code)
//   POST /api/reset/confirm   {email, code, password}      -> {token, email, id}
//   GET  /api/data?since=T    (auth)                       -> {docs:[{path,data,t}], now}
//   POST /api/data            (auth) {docs:[{path,data}]}  -> {now}    (data null deletes)
//   GET  /api/translate/config (auth)                      -> {provider, url, model, keyHint}
//   POST /api/translate/config (auth) {provider, url, model, key}  (key omitted = keep; provider '' = remove)
//   GET  /api/translate/status (auth optional)             -> {custom, default}
//   POST /api/translate       (auth optional) {text, to?}  -> {text, source: 'custom' | 'default'}
//                             or, from the dictionary page: {text, dir: 'de2zh'|'zh2de', prompt, model?: {url, name, key}}
//                             -> {ok: true, result: {tr, alt, words, notes}, source: 'custom'|'workers-ai'} | {ok: false, error}
//                             model in the request (kept on the device) > the account's saved source > Workers AI

const ORIGINS = ['https://yuquanzhao9.github.io'];
const SESSION_DAYS = 180;
const PBKDF2_ITER = 100000; // the Workers runtime caps PBKDF2 at 100k iterations
const MAX_DOC = 512 * 1024;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_USER_BYTES = 50 * 1024 * 1024;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pw TEXT NOT NULL,
     created INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL, last INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS resets (email TEXT PRIMARY KEY, code TEXT NOT NULL, expires INTEGER NOT NULL,
     tries INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL, day TEXT NOT NULL, day_count INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS docs (user_id TEXT NOT NULL, path TEXT NOT NULL, data TEXT, t INTEGER NOT NULL,
     PRIMARY KEY (user_id, path))`,
  `CREATE INDEX IF NOT EXISTS docs_user_t ON docs(user_id, t)`,
  `CREATE TABLE IF NOT EXISTS settings (user_id TEXT PRIMARY KEY, translate TEXT)`,
  `CREATE TABLE IF NOT EXISTS verifies (user_id TEXT PRIMARY KEY, token TEXT NOT NULL, expires INTEGER NOT NULL, sent INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS verifies_token ON verifies(token)`,
];
let schemaReady = null;
// columns added after the first release: ALTER fails harmlessly once they exist
const MIGRATIONS = [`ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0`];
const ensureSchema = db => schemaReady || (schemaReady = (async () => {
  await db.batch(SCHEMA.map(s => db.prepare(s)));
  for (const m of MIGRATIONS) try { await db.prepare(m).run(); } catch (e) { if (!/duplicate column/i.test(String(e.message || e))) throw e; }
})().catch(e => { schemaReady = null; throw e; }));

class HttpError extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code; } }
const fail = (status, msg, code) => { throw new HttpError(status, msg, code); };

const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITER))}`;
}
async function checkPassword(password, stored) {
  const [, iter, salt, want] = stored.split('$');
  const got = b64(await pbkdf2(password, unb64(salt), +iter));
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

const normEmail = e => String(e || '').trim().toLowerCase();
function checkEmail(email) {
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, '邮箱格式不对');
}
function checkNewPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) fail(400, '密码至少 8 位');
  if (pw.length > 200) fail(400, '密码太长');
}

async function newSession(db, userId) {
  const token = randomHex(32), now = Date.now();
  await db.prepare('INSERT INTO sessions (token, user_id, created, last) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now).run();
  return token;
}
async function auth(request, db) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '');
  if (!m) fail(401, '请先登录');
  const th = await sha256(m[1]), now = Date.now();
  const row = await db.prepare('SELECT s.user_id, s.last, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').bind(th).first();
  if (!row || now - row.last > SESSION_DAYS * 864e5) fail(401, '登录已过期，请重新登录');
  if (now - row.last > 36e5) await db.prepare('UPDATE sessions SET last = ? WHERE token = ?').bind(now, th).run();
  return { id: row.user_id, email: row.email, token: th };
}

async function maybeAuth(request, db) {
  if (!request.headers.get('Authorization')) return null;
  try { return await auth(request, db); } catch { return null; }
}

// ---- sentence translation: the user's own endpoint (proxied, so the key never reaches the page) or Workers AI
const MAX_TR = 2000;
const hasCJK = t => /[\u3400-\u9fff]/.test(t);
async function trConfig(db, userId) {
  const row = await db.prepare('SELECT translate FROM settings WHERE user_id = ?').bind(userId).first();
  return row && row.translate ? JSON.parse(row.translate) : null;
}
function chatUrl(u) {
  u = u.replace(/\/+$/, '');
  return /\/chat\/completions$/.test(u) ? u : u + '/chat/completions';
}
async function upstream(r, what) {
  if (r.ok) return r.json();
  const t = (await r.text()).slice(0, 300);
  console.error(what, r.status, t);
  fail(502, `${what}返回错误（${r.status}）${r.status === 401 || r.status === 403 ? '：密钥不对或没有权限' : ''}`);
}
async function translateWith(cfg, text, to) {
  if (cfg.provider === 'deepl') {
    const host = /:fx$/.test(cfg.key) ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
    const j = await upstream(await fetch(host + '/v2/translate', {
      method: 'POST', headers: { Authorization: 'DeepL-Auth-Key ' + cfg.key, 'content-type': 'application/json' },
      body: JSON.stringify({ text: [text], target_lang: to === 'de' ? 'DE' : 'ZH' }),
    }), 'DeepL ');
    return j.translations && j.translations[0] && j.translations[0].text;
  }
  // OpenAI-compatible chat API (DeepSeek, 通义千问, Kimi, 智谱, OpenAI, …)
  const j = await upstream(await fetch(chatUrl(cfg.url), {
    method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {}),
    body: JSON.stringify({ model: cfg.model, temperature: 0.2, messages: [
      { role: 'system', content: to === 'de'
        ? '把用户给的中文翻译成自然、地道的德语。只输出译文，不要解释。'
        : 'Übersetze den Text des Nutzers ins Chinesische (vereinfacht), genau und natürlich. Gib nur die Übersetzung aus, ohne Erklärungen.' },
      { role: 'user', content: text } ] }),
  }), '你的翻译接口');
  return j.choices && j.choices[0] && j.choices[0].message && String(j.choices[0].message.content || '').trim();
}
// Workers AI (free daily allowance): a multilingual chat model first, the dedicated translation model as fallback
const AI_CHAT = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
async function defaultTranslate(ai, text, to) {
  try {
    const r = await ai.run(AI_CHAT, { temperature: 0.2, max_tokens: 1024, messages: [
      { role: 'system', content: to === 'de'
        ? 'You are a translator. Translate the user text from Chinese into natural German. Output only the German translation.'
        : 'You are a translator. Translate the user text from German into Simplified Chinese (简体中文). Output only the Chinese translation.' },
      { role: 'user', content: text } ] });
    const out = r && String(r.response || '').trim();
    if (out) return out;
  } catch (e) { console.error('workers ai chat', e); }
  const r = await ai.run('@cf/meta/m2m100-1.2b', { text, source_lang: to === 'de' ? 'chinese' : 'german', target_lang: to === 'de' ? 'german' : 'chinese' });
  if (!r || !r.translated_text) fail(502, '默认翻译暂时不可用，请稍后再试');
  return r.translated_text;
}

// the dictionary page sends its own prompt asking for a JSON object {tr, alt, words, notes}
const parseJsonReply = t => {
  if (t && typeof t === 'object') return t; // Workers AI with a json_schema already returns an object
  t = String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  try { return JSON.parse(i >= 0 && j > i ? t.slice(i, j + 1) : t); } catch { return { tr: t }; }
};
// models sometimes nest fields ({tr: {zh: '…'}}) or skip them: always hand the page {tr, alt, words, notes} with tr a string
const flat = v => typeof v === 'string' ? v.trim() : v && typeof v === 'object'
  ? flat(Object.values(v).find(x => typeof x === 'string' && x.trim()) || '') : v == null ? '' : String(v);
function pageResult(res) {
  if (!res || typeof res !== 'object') return null;
  const tr = flat(res.tr);
  if (!tr) return null;
  return { tr, alt: flat(res.alt),
    words: (Array.isArray(res.words) ? res.words : []).filter(w => w && typeof w === 'object').map(w => ({ de: flat(w.de), form: flat(w.form), zh: flat(w.zh) })).filter(w => w.de),
    notes: (Array.isArray(res.notes) ? res.notes : []).map(flat).filter(Boolean) };
}
const str = { type: 'string' };
const PAGE_SCHEMA = { type: 'json_schema', json_schema: { type: 'object', required: ['tr'], properties: { tr: str, alt: str,
  words: { type: 'array', items: { type: 'object', properties: { de: str, form: str, zh: str } } }, notes: { type: 'array', items: str } } } };
async function chat(cfg, prompt, json) {
  const req = { model: cfg.model, temperature: 0.2, messages: [{ role: 'user', content: prompt }] };
  const send = body => fetch(chatUrl(cfg.url), { method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {}), body: JSON.stringify(body) });
  let r = await send(json ? { ...req, response_format: { type: 'json_object' } } : req);
  if (json && r.status === 400) r = await send(req); // providers without response_format
  const j = await upstream(r, '你的翻译接口');
  return j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
}
async function pageTranslate(b, u, db, env) {
  try {
    const text = String(b.text || '').trim(), prompt = String(b.prompt || '');
    if (!text || !prompt) fail(400, '没有要翻译的内容');
    if (text.length > MAX_TR || prompt.length > MAX_TR + 4000) fail(413, `一次最多翻译 ${MAX_TR} 个字`);
    const to = b.dir === 'zh2de' ? 'de' : b.dir === 'de2zh' ? 'zh' : hasCJK(text) ? 'de' : 'zh';
    let cfg = null;
    if (b.model && b.model.url) {
      cfg = { provider: 'openai', url: String(b.model.url).trim(), model: String(b.model.name || '').trim(), key: String(b.model.key || '').trim() };
      checkTrConfig(cfg);
    } else if (u) cfg = await trConfig(db, u.id);
    if (cfg && cfg.provider === 'deepl') return { ok: true, result: { tr: await translateWith(cfg, text, to), alt: '', words: [], notes: [] }, source: 'custom' };
    if (cfg) {
      const res = pageResult(parseJsonReply(await chat(cfg, prompt, true)));
      if (!res) fail(502, '你的翻译接口没有返回译文');
      return { ok: true, result: res, source: 'custom' };
    }
    if (!env.AI) fail(503, '网站的免费翻译还没有开通');
    let res = null;
    const ask = extra => env.AI.run(AI_CHAT, { temperature: 0.2, max_tokens: 1500, messages: [{ role: 'user', content: prompt }], ...extra });
    try {
      let r;
      try { r = await ask({ response_format: PAGE_SCHEMA }); } catch (e) { console.error('workers ai json_schema', e); r = await ask({}); }
      res = r && pageResult(parseJsonReply(r.response));
    } catch (e) { console.error('workers ai chat', e); }
    if (!res) res = { tr: await defaultTranslate(env.AI, text, to), alt: '', words: [], notes: [] };
    return { ok: true, result: res, source: 'workers-ai' };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: '翻译出错了，请稍后再试' };
  }
}

function checkTrConfig(c) {
  if (!['openai', 'deepl'].includes(c.provider)) fail(400, '不支持这种接口');
  if (c.provider === 'openai') {
    let u; try { u = new URL(c.url); } catch { fail(400, '接口地址格式不对'); }
    const local = u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname); // for local testing
    if ((u.protocol !== 'https:' && !local) || u.username || u.password) fail(400, '接口地址必须是 https:// 开头的网址');
    if (!c.model) fail(400, '请填写模型名');
  }
  if (!c.key && c.provider === 'deepl') fail(400, '请填写 DeepL 密钥');
  if (!c.key && c.provider === 'openai' && !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(c.url)) fail(400, '请填写 API 密钥');
  if (String(c.key || '').length > 500 || String(c.url || '').length > 500 || String(c.model || '').length > 200) fail(400, '内容太长');
}

async function body(request) {
  const len = +request.headers.get('Content-Length') || 0;
  if (len > MAX_BODY) fail(413, '数据太大');
  const text = await request.text();
  if (text.length > MAX_BODY) fail(413, '数据太大');
  try { return JSON.parse(text || '{}'); } catch { fail(400, '请求格式不对'); }
}

async function sendMail(env, to, subject, text) {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM) fail(503, '邮件服务还没有配置，暂时不能发送邮件');
  const r = await fetch(env.MAIL_API_URL || 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: env.MAIL_FROM, name: env.MAIL_NAME || 'Deutsch lernen' }, to: [{ email: to }], subject, textContent: text }),
  });
  if (!r.ok) {
    console.error('brevo', r.status, await r.text());
    fail(502, '邮件没有发出去，请稍后再试');
  }
}
const siteUrl = (env, url) => String(env.SITE_URL || url.origin).replace(/\/+$/, '');

// registration confirmation: a link valid for 24 hours; resend at most once a minute
async function sendVerify(db, env, url, userId, email) {
  const now = Date.now();
  const v = await db.prepare('SELECT sent FROM verifies WHERE user_id = ?').bind(userId).first();
  if (v && now - v.sent < 60e3) fail(429, '确认邮件刚发过，请 1 分钟后再试');
  const token = randomHex(32);
  await sendMail(env, email, '请确认你的 Deutsch lernen 账号',
    `你好！\n\n欢迎注册 Deutsch lernen。打开下面的链接确认邮箱，就能登录了：\n\n${siteUrl(env, url)}/konto/?verify=${token}\n\n链接 24 小时内有效。如果不是你本人注册，忽略这封邮件即可。\n\nDeutsch lernen`);
  await db.prepare(`INSERT INTO verifies (user_id, token, expires, sent) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, expires = excluded.expires, sent = excluded.sent`)
    .bind(userId, await sha256(token), now + 864e5, now).run();
}

const routes = {
  async 'POST /api/register'({ request, db, env, url }) {
    const b = await body(request), email = normEmail(b.email);
    checkEmail(email); checkNewPassword(b.password);
    const old = await db.prepare('SELECT id, verified FROM users WHERE email = ?').bind(email).first();
    if (old && old.verified) fail(409, '此邮箱已经注册，请直接登录。', 'exists');
    if (!env.BREVO_API_KEY || !env.MAIL_FROM) fail(503, '邮件服务还没有配置，暂时不能注册');
    let id = old && old.id;
    // registering again before confirming: take the new password and send a fresh link
    if (id) await db.prepare('UPDATE users SET pw = ? WHERE id = ?').bind(await hashPassword(b.password), id).run();
    else {
      id = crypto.randomUUID();
      await db.prepare('INSERT INTO users (id, email, pw, created, verified) VALUES (?, ?, ?, ?, 0)').bind(id, email, await hashPassword(b.password), Date.now()).run();
    }
    await sendVerify(db, env, url, id, email);
    return { pending: true, email };
  },

  async 'POST /api/verify'({ request, db }) {
    const b = await body(request), now = Date.now();
    const v = /^[0-9a-f]{64}$/.test(b.token || '') && await db.prepare('SELECT * FROM verifies WHERE token = ?').bind(await sha256(b.token)).first();
    if (!v) fail(400, '确认链接无效或已经用过。直接登录试试，或者重新发送确认邮件。');
    if (v.expires < now) fail(400, '确认链接已过期，请重新发送确认邮件。');
    const u = await db.prepare('SELECT id, email FROM users WHERE id = ?').bind(v.user_id).first();
    await db.batch([
      db.prepare('UPDATE users SET verified = 1 WHERE id = ?').bind(u.id),
      db.prepare('DELETE FROM verifies WHERE user_id = ?').bind(u.id),
    ]);
    return { token: await newSession(db, u.id), email: u.email, id: u.id };
  },

  async 'POST /api/verify/resend'({ request, db, env, url }) {
    const b = await body(request), email = normEmail(b.email);
    checkEmail(email);
    const u = await db.prepare('SELECT id, verified FROM users WHERE email = ?').bind(email).first();
    if (!u) fail(404, '这个邮箱还没有注册');
    if (u.verified) fail(409, '这个邮箱已经确认过了，可以直接登录。');
    await sendVerify(db, env, url, u.id, email);
    return { ok: true };
  },

  async 'POST /api/login'({ request, db }) {
    const b = await body(request), email = normEmail(b.email), now = Date.now();
    const u = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!u) fail(401, '邮箱或密码不正确。');
    if (u.locked_until > now) fail(429, `密码错误次数太多，请 ${Math.ceil((u.locked_until - now) / 6e4)} 分钟后再试，或用“忘记密码”`);
    if (!(await checkPassword(String(b.password || ''), u.pw))) {
      const fails = u.fails + 1;
      await db.prepare('UPDATE users SET fails = ?, locked_until = ? WHERE id = ?').bind(fails >= 5 ? 0 : fails, fails >= 5 ? now + 15 * 6e4 : 0, u.id).run();
      fail(401, '邮箱或密码不正确。');
    }
    if (u.fails) await db.prepare('UPDATE users SET fails = 0 WHERE id = ?').bind(u.id).run();
    if (!u.verified) fail(403, '请先打开邮箱中的确认邮件，再登录。', 'unverified');
    return { token: await newSession(db, u.id), email, id: u.id };
  },

  async 'POST /api/logout'({ request, db }) {
    const u = await auth(request, db);
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(u.token).run();
    return { ok: true };
  },

  async 'GET /api/me'({ request, db }) {
    const u = await auth(request, db);
    return { email: u.email, id: u.id };
  },

  async 'POST /api/password'({ request, db }) {
    const u = await auth(request, db), b = await body(request);
    checkNewPassword(b.password);
    await db.batch([
      db.prepare('UPDATE users SET pw = ?, fails = 0, locked_until = 0 WHERE id = ?').bind(await hashPassword(b.password), u.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
    ]);
    return { token: await newSession(db, u.id), email: u.email, id: u.id };
  },

  async 'POST /api/reset/request'({ request, db, env, url }) {
    const b = await body(request), email = normEmail(b.email), now = Date.now();
    checkEmail(email);
    const u = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (!u) fail(404, '这个邮箱还没有注册');
    const day = new Date(now).toISOString().slice(0, 10);
    const r = await db.prepare('SELECT * FROM resets WHERE email = ?').bind(email).first();
    if (r && now - r.sent < 60e3) fail(429, '验证码刚发过，请 1 分钟后再试');
    const dayCount = r && r.day === day ? r.day_count : 0;
    if (dayCount >= 10) fail(429, '今天发送次数太多了，请明天再试');
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0');
    const link = `${siteUrl(env, url)}/konto/?password-reset=1&email=${encodeURIComponent(email)}&code=${code}`;
    await sendMail(env, email, `重设 Deutsch lernen 密码（验证码 ${code}）`,
      `你好！\n\n你正在重设 Deutsch lernen 的登录密码。打开下面的链接设置新密码：\n\n${link}\n\n也可以在重设密码页面输入验证码：${code}\n\n15 分钟内有效。如果不是你本人操作，忽略这封邮件即可，密码不会改变。\n\nDeutsch lernen`);
    await db.prepare(`INSERT INTO resets (email, code, expires, tries, sent, day, day_count) VALUES (?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires = excluded.expires, tries = 0, sent = excluded.sent, day = excluded.day, day_count = excluded.day_count`)
      .bind(email, await sha256(email + ':' + code), now + 15 * 6e4, now, day, dayCount + 1).run();
    return { ok: true };
  },

  async 'POST /api/reset/confirm'({ request, db }) {
    const b = await body(request), email = normEmail(b.email), now = Date.now();
    checkNewPassword(b.password);
    const r = await db.prepare('SELECT * FROM resets WHERE email = ?').bind(email).first();
    if (!r || r.expires < now || r.tries >= 5) fail(400, '验证码已失效，请重新获取');
    if (await sha256(email + ':' + String(b.code || '').trim()) !== r.code) {
      await db.prepare('UPDATE resets SET tries = tries + 1 WHERE email = ?').bind(email).run();
      fail(400, r.tries + 1 >= 5 ? '验证码错误次数太多，请重新获取' : '验证码不对');
    }
    const u = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (!u) fail(404, '这个邮箱还没有注册');
    await db.batch([
      // the reset code came by email, so this also confirms the address
      db.prepare('UPDATE users SET pw = ?, fails = 0, locked_until = 0, verified = 1 WHERE id = ?').bind(await hashPassword(b.password), u.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
      db.prepare('DELETE FROM resets WHERE email = ?').bind(email),
    ]);
    return { token: await newSession(db, u.id), email, id: u.id };
  },

  async 'GET /api/data'({ request, db, url }) {
    const u = await auth(request, db);
    const since = Math.max(0, +url.searchParams.get('since') || 0);
    const now = Date.now();
    const { results } = await db.prepare('SELECT path, data, t FROM docs WHERE user_id = ? AND t >= ? ORDER BY t').bind(u.id, since).all();
    return { docs: results.map(r => ({ path: r.path, data: r.data == null ? null : JSON.parse(r.data), t: r.t })), now };
  },

  async 'POST /api/data'({ request, db }) {
    const u = await auth(request, db), b = await body(request);
    const docs = Array.isArray(b.docs) ? b.docs : fail(400, '请求格式不对');
    if (docs.length > 500) fail(413, '一次提交太多');
    const now = Date.now();
    let added = 0;
    const stmts = docs.map(d => {
      if (typeof d.path !== 'string' || !d.path || d.path.length > 300) fail(400, '路径不对');
      const data = d.data == null ? null : JSON.stringify(d.data);
      if (data && data.length > MAX_DOC) fail(413, '单条数据太大');
      added += data ? data.length : 0;
      return db.prepare(`INSERT INTO docs (user_id, path, data, t) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, path) DO UPDATE SET data = excluded.data, t = excluded.t`).bind(u.id, d.path, data, now);
    });
    if (!stmts.length) return { now };
    const used = await db.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM docs WHERE user_id = ?').bind(u.id).first();
    if (used.n + added > MAX_USER_BYTES) fail(413, '云端空间已满');
    await db.batch(stmts);
    return { now };
  },
};

Object.assign(routes, {
  async 'GET /api/translate/config'({ request, db }) {
    const u = await auth(request, db), c = await trConfig(db, u.id);
    if (!c) return { provider: '' };
    return { provider: c.provider, url: c.url || '', model: c.model || '', keyHint: c.key ? '••••' + c.key.slice(-4) : '' };
  },
  async 'POST /api/translate/config'({ request, db }) {
    const u = await auth(request, db), b = await body(request);
    if (!b.provider) { await db.prepare('DELETE FROM settings WHERE user_id = ?').bind(u.id).run(); return { provider: '' }; }
    const old = await trConfig(db, u.id) || {};
    const c = { provider: b.provider, url: String(b.url || '').trim(), model: String(b.model || '').trim(),
      key: b.key ? String(b.key).trim() : (old.provider === b.provider && (b.provider === 'deepl' || old.url === String(b.url || '').trim()) ? old.key || '' : '') };
    checkTrConfig(c);
    await db.prepare('INSERT INTO settings (user_id, translate) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET translate = excluded.translate')
      .bind(u.id, JSON.stringify(c)).run();
    return { provider: c.provider, url: c.url, model: c.model, keyHint: c.key ? '••••' + c.key.slice(-4) : '' };
  },
  async 'GET /api/translate/status'({ request, db, env }) {
    const u = await maybeAuth(request, db);
    return { custom: !!(u && await trConfig(db, u.id)), default: !!env.AI };
  },
  async 'POST /api/translate'({ request, db, env }) {
    const u = await maybeAuth(request, db), b = await body(request);
    if (b.prompt != null) return pageTranslate(b, u, db, env);
    const text = String(b.text || '').trim();
    if (!text) fail(400, '没有要翻译的内容');
    if (text.length > MAX_TR) fail(413, `一次最多翻译 ${MAX_TR} 个字`);
    const to = b.to === 'de' || b.to === 'zh' ? b.to : hasCJK(text) ? 'de' : 'zh';
    const cfg = u && await trConfig(db, u.id);
    if (cfg) {
      const out = await translateWith(cfg, text, to);
      if (!out) fail(502, '你的翻译接口没有返回译文');
      return { text: out, source: 'custom' };
    }
    if (!env.AI) fail(503, '还没有可用的句子翻译：请在账号页填写你自己的翻译接口');
    return { text: await defaultTranslate(env.AI, text, to), source: 'default' };
  },
});

function cors(request, env) {
  const origin = request.headers.get('Origin');
  const extra = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = origin && (ORIGINS.includes(origin) || extra.includes(origin) || origin === new URL(request.url).origin
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return ok ? {
    'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400',
  } : {};
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const headers = { ...cors(request, env), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers });
  const route = routes[`${request.method} ${url.pathname.replace(/\/+$/, '')}`];
  if (!route) return json({ error: '没有这个接口' }, 404);
  if (!env.DB) return json({ error: '账号服务还没有配置好（缺少数据库）' }, 503);
  try {
    await ensureSchema(env.DB);
    return json(await route({ request, env, db: env.DB, url }));
  } catch (e) {
    if (e instanceof HttpError) return json(e.code ? { error: e.message, code: e.code } : { error: e.message }, e.status);
    console.error(e);
    return json({ error: '服务器出错了，请稍后再试' }, 500);
  }
}

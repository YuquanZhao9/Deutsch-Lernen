// Accounts and per-user sync for the Deutsch-Lernen site (Cloudflare Pages Functions).
//
// Needs, in the Pages project settings:
//   D1 binding  DB              -> a D1 database (tables are created on first use)
//   variable    BREVO_API_KEY   -> Brevo API key (secret), used to email password-reset codes
//   variable    MAIL_FROM       -> the sender address verified in Brevo
//   variable    MAIL_NAME       -> optional sender name (default "Deutsch lernen")
//   variable    ALLOWED_ORIGINS -> optional, extra comma-separated origins allowed to call the API
//
// Routes (JSON in, JSON out; auth = "Authorization: Bearer <token>"):
//   POST /api/register        {email, password}            -> {token, email}
//   POST /api/login           {email, password}            -> {token, email}
//   POST /api/logout          (auth)
//   GET  /api/me              (auth)                       -> {email}
//   POST /api/password        (auth) {old, password}       -> {token}  (other devices are signed out)
//   POST /api/reset/request   {email}                      -> {ok}     (emails a 6-digit code)
//   POST /api/reset/confirm   {email, code, password}      -> {token, email}
//   GET  /api/data?since=T    (auth)                       -> {docs:[{path,data,t}], now}
//   POST /api/data            (auth) {docs:[{path,data}]}  -> {now}    (data null deletes)

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
];
let schemaReady = null;
const ensureSchema = db => schemaReady || (schemaReady = db.batch(SCHEMA.map(s => db.prepare(s))).catch(e => { schemaReady = null; throw e; }));

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

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

async function body(request) {
  const len = +request.headers.get('Content-Length') || 0;
  if (len > MAX_BODY) fail(413, '数据太大');
  const text = await request.text();
  if (text.length > MAX_BODY) fail(413, '数据太大');
  try { return JSON.parse(text || '{}'); } catch { fail(400, '请求格式不对'); }
}

async function sendMail(env, to, subject, text) {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM) fail(503, '邮件服务还没有配置，暂时不能找回密码');
  const r = await fetch(env.MAIL_API_URL || 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: env.MAIL_FROM, name: env.MAIL_NAME || 'Deutsch lernen' }, to: [{ email: to }], subject, textContent: text }),
  });
  if (!r.ok) {
    console.error('brevo', r.status, await r.text());
    fail(502, '验证码邮件没有发出去，请稍后再试');
  }
}

const routes = {
  async 'POST /api/register'({ request, db }) {
    const b = await body(request), email = normEmail(b.email);
    checkEmail(email); checkNewPassword(b.password);
    if (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) fail(409, '这个邮箱已经注册过了，可以直接登录或找回密码');
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO users (id, email, pw, created) VALUES (?, ?, ?, ?)').bind(id, email, await hashPassword(b.password), Date.now()).run();
    return { token: await newSession(db, id), email };
  },

  async 'POST /api/login'({ request, db }) {
    const b = await body(request), email = normEmail(b.email), now = Date.now();
    const u = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!u) fail(401, '邮箱或密码不对');
    if (u.locked_until > now) fail(429, `密码错误次数太多，请 ${Math.ceil((u.locked_until - now) / 6e4)} 分钟后再试，或用“忘记密码”`);
    if (!(await checkPassword(String(b.password || ''), u.pw))) {
      const fails = u.fails + 1;
      await db.prepare('UPDATE users SET fails = ?, locked_until = ? WHERE id = ?').bind(fails >= 5 ? 0 : fails, fails >= 5 ? now + 15 * 6e4 : 0, u.id).run();
      fail(401, '邮箱或密码不对');
    }
    if (u.fails) await db.prepare('UPDATE users SET fails = 0 WHERE id = ?').bind(u.id).run();
    return { token: await newSession(db, u.id), email };
  },

  async 'POST /api/logout'({ request, db }) {
    const u = await auth(request, db);
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(u.token).run();
    return { ok: true };
  },

  async 'GET /api/me'({ request, db }) {
    const u = await auth(request, db);
    return { email: u.email };
  },

  async 'POST /api/password'({ request, db }) {
    const u = await auth(request, db), b = await body(request);
    checkNewPassword(b.password);
    const row = await db.prepare('SELECT pw FROM users WHERE id = ?').bind(u.id).first();
    if (!(await checkPassword(String(b.old || ''), row.pw))) fail(401, '原密码不对');
    await db.batch([
      db.prepare('UPDATE users SET pw = ?, fails = 0, locked_until = 0 WHERE id = ?').bind(await hashPassword(b.password), u.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
    ]);
    return { token: await newSession(db, u.id), email: u.email };
  },

  async 'POST /api/reset/request'({ request, db, env }) {
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
    await sendMail(env, email, `验证码 ${code} · Deutsch lernen 重设密码`,
      `你好！\n\n你正在重设 Deutsch lernen 的登录密码，验证码是：\n\n    ${code}\n\n15 分钟内有效。如果不是你本人操作，忽略这封邮件即可，密码不会改变。\n\nDeutsch lernen`);
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
      db.prepare('UPDATE users SET pw = ?, fails = 0, locked_until = 0 WHERE id = ?').bind(await hashPassword(b.password), u.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
      db.prepare('DELETE FROM resets WHERE email = ?').bind(email),
    ]);
    return { token: await newSession(db, u.id), email };
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
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: '服务器出错了，请稍后再试' }, 500);
  }
}

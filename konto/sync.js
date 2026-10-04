/* Account + cloud sync client for the Deutsch-Lernen site (window.DLSync).
   The API runs as Cloudflare Pages Functions (functions/api). On the pages.dev mirror it is same-origin;
   from GitHub Pages the pages call the mirror's API (CORS + bearer token).

   Pages register an adapter for the data they keep:
     DLSync.bind(prefix, { apply(path, data) })
   and report each local change with DLSync.changed(prefix + path, data). Changes are queued in
   localStorage, sent in batches, and pulled from the server when a page opens or comes back into view.
   Conflicts: the last write to reach the server wins, per document.

   Local data spaces (as in 昱时): the learner data the pages keep in localStorage (LOCAL_KEYS) belongs to the
   space that is active on this device: "local" while signed out, "u:<user id>" for each account. Signing in
   or out swaps the active space; the inactive ones are kept under "dl-space:<id>". Nothing from the signed-out
   space goes into an account unless the learner chooses to (DLSync.mergeLocal). */
(() => {
  'use strict';
  if (window.DLSync) return;
  const MIRROR = 'https://deutsch-lernen-1ca.pages.dev';
  const h = location.hostname;
  const API = (window.DL_API != null ? window.DL_API
    : (h.endsWith('.pages.dev') || h === 'localhost' || h === '127.0.0.1') ? '' : MIRROR) + '/api';
  const ROOT = (() => { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/konto\/sync\.js.*$/, '') : '../'; })();

  const SK = 'dl-account', QK = 'dl-sync-queue', CUR = 'dl-space';
  // everything the site keeps per learner (plus the upload queue): swapped as one space
  const TK = 'deutsch-taeglich-db-v1';
  const LOCAL_KEYS = [TK, 'deutsch-taeglich-cache-v1', 'ww.book', 'ww.history', QK];
  const rawSet = Storage.prototype.setItem;
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { rawSet.call(localStorage, k, JSON.stringify(v)); } catch (e) {} };
  let acct = load(SK, {}); // {token, email, id, since, fresh}
  let queue = load(QK, {}); // {path: data}
  const saveAcct = () => save(SK, acct);

  async function call(method, path, payload, token) {
    let r;
    try {
      r = await fetch(API + path, {
        method, cache: 'no-store',
        headers: Object.assign(payload ? { 'Content-Type': 'application/json' } : {}, token ? { Authorization: 'Bearer ' + token } : {}),
        body: payload ? JSON.stringify(payload) : undefined,
      });
    } catch (e) { throw Object.assign(new Error('无法连接同步服务；本机记录仍已保留。'), { offline: true }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && token && token === acct.token) expired();
      throw Object.assign(new Error(j.error || (r.status === 429 ? '操作太频繁，请稍后再试。' : '服务器出错（' + r.status + '）')), { status: r.status, code: j.code });
    }
    return j;
  }

  const listeners = [];
  let state = 'idle'; // idle | syncing | ok | offline | error
  const fire = () => listeners.forEach(f => { try { f(state, acct.email || null); } catch (e) {} });
  const setState = s => { state = s; fire(); };

  const adapters = {};
  function applyRemote(docs) {
    for (const d of docs) {
      if (Object.prototype.hasOwnProperty.call(queue, d.path)) continue; // a local edit is waiting to go up
      const p = Object.keys(adapters).find(k => d.path.startsWith(k));
      if (p) try { adapters[p].apply(d.path.slice(p.length), d.data); } catch (e) { console.warn('sync apply', e); }
    }
  }

  let pulling = null;
  function pull() {
    if (!acct.token) return Promise.resolve();
    return pulling || (pulling = (async () => {
      setState('syncing');
      try {
        const fresh = acct.fresh;
        const r = await call('GET', '/data?since=' + (fresh ? 0 : (acct.since || 0)), null, acct.token);
        applyRemote(r.docs);
        acct.since = r.now; if (fresh) delete acct.fresh; saveAcct();
        await push();
        setState('ok');
      } catch (e) { setState(e.offline ? 'offline' : 'error'); console.warn('sync pull', e); }
      finally { pulling = null; }
    })());
  }

  let pushing = null, timer = 0;
  async function push() {
    if (!acct.token || pushing) return pushing;
    const paths = Object.keys(queue);
    if (!paths.length) return;
    const batch = paths.slice(0, 200).map(path => ({ path, data: queue[path] }));
    pushing = call('POST', '/data', { docs: batch }, acct.token).then(() => {
      for (const d of batch) if (queue[d.path] === d.data) delete queue[d.path];
      save(QK, queue);
      setState('ok');
    }).catch(e => { setState(e.offline ? 'offline' : 'error'); throw e; }).finally(() => { pushing = null; });
    await pushing;
    if (Object.keys(queue).length) return push();
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => push().catch(() => {}), 1200); };

  const curSpace = () => localStorage.getItem(CUR) || 'local';
  function switchSpace(to) {
    const from = curSpace();
    if (from === to) return;
    const stash = {};
    for (const k of LOCAL_KEYS) { const v = localStorage.getItem(k); if (v != null) stash[k] = v; localStorage.removeItem(k); }
    if (Object.keys(stash).length) save('dl-space:' + from, stash); else localStorage.removeItem('dl-space:' + from);
    const next = load('dl-space:' + to, {});
    for (const [k, v] of Object.entries(next)) try { rawSet.call(localStorage, k, v); } catch (e) {}
    localStorage.removeItem('dl-space:' + to);
    rawSet.call(localStorage, CUR, to);
    queue = load(QK, {});
  }
  function signedIn(r) {
    acct = { token: r.token, email: r.email, id: r.id, since: 0, fresh: true };
    saveAcct();
    switchSpace('u:' + r.id);
    fire();
    return r.email;
  }
  function expired() {
    acct = {}; saveAcct();
    switchSpace('local');
    fire();
    // a page that already read the account's data must reload into the signed-out space
    if (Object.keys(adapters).some(p => p !== 'w/') || window.__wwReload) location.reload();
  }
  // signed in, and this browser also holds learner data from while it was signed out?
  function localPending() {
    if (!acct.token) return false;
    const sp = load('dl-space:local', {});
    const has = v => { try { const x = JSON.parse(v); return Array.isArray(x) ? x.length > 0 : x && typeof x === 'object' && Object.keys(x).length > 0; } catch (e) { return false; } };
    return [TK, 'ww.book', 'ww.history'].some(k => sp[k] != null && has(sp[k]));
  }
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  // values from b win; objects are merged key by key
  const deepMerge = (a, b) => {
    if (!isObj(a) || !isObj(b)) return b === undefined ? a : b;
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = deepMerge(a[k], v);
    return out;
  };
  const histNorm = a => (Array.isArray(a) ? a : []).map(h => typeof h === 'string' ? { k: h, n: 1, t: 0 } : h).filter(h => h && (h.k || h.q));
  const histKey = h => h.k ? 'k:' + h.k : 'q:' + h.q;
  function histMerge(a, b) {
    const m = new Map();
    for (const h of histNorm(a).concat(histNorm(b))) {
      const o = m.get(histKey(h));
      m.set(histKey(h), !o ? h : { ...(h.t >= o.t ? h : o), n: Math.max(h.n || 1, o.n || 1), t: Math.max(h.t || 0, o.t || 0) });
    }
    return [...m.values()].sort((x, y) => (y.t || 0) - (x.t || 0)).slice(0, 200);
  }
  // 把未登录时的学习记录并入此账号: the account's own records win where both have the same item
  async function mergeLocal() {
    if (!acct.token) throw new Error('请先登录');
    const sp = load('dl-space:local', {});
    const parse = (v, d) => { try { return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
    const r = await call('GET', '/data?since=0', null, acct.token);
    const server = {};
    for (const d of r.docs) server[d.path] = d.data;
    const own = (path, live) => Object.prototype.hasOwnProperty.call(queue, path) ? queue[path]
      : Object.prototype.hasOwnProperty.call(server, path) ? server[path] : live;
    const mem = load(TK, {});
    for (const [path, doc] of Object.entries(parse(sp[TK], {}))) {
      const mine = own('t/' + path, mem[path]);
      mem[path] = mine == null ? doc : deepMerge(doc, mine);
      queue['t/' + path] = mem[path];
    }
    save(TK, mem);
    const lb = parse(sp['ww.book'], []);
    if (lb.length) {
      const mine = own('w/book', load('ww.book', [])) || [];
      const book = mine.concat(lb.filter(k => !mine.includes(k)));
      save('ww.book', book); queue['w/book'] = book;
    }
    const lh = parse(sp['ww.history'], []);
    if (lh.length) {
      const hist = histMerge(own('w/history', load('ww.history', [])), lh);
      save('ww.history', hist); queue['w/history'] = hist;
    }
    save(QK, queue);
    localStorage.removeItem('dl-space:local');
    await push();
  }

  // first pull: pages wait for it (briefly) before reading their data
  let readyResolve;
  const ready = new Promise(r => { readyResolve = r; });
  let started = false;
  const startup = () => { if (!started) { started = true; (acct.token ? pull() : Promise.resolve()).then(readyResolve, readyResolve); } return ready; };
  setTimeout(() => readyResolve(), 6000);
  // adapters are bound by the scripts that follow this one; start once the page has parsed
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startup); else setTimeout(startup, 0);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pull();
    else push().catch(() => {});
  });
  window.addEventListener('online', () => pull());
  window.addEventListener('pagehide', () => {
    // last chance to send queued edits when the page closes
    if (!acct.token || !Object.keys(queue).length) return;
    try {
      fetch(API + '/data', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + acct.token },
        body: JSON.stringify({ docs: Object.keys(queue).slice(0, 200).map(path => ({ path, data: queue[path] })) }) });
    } catch (e) {}
  });

  window.DLSync = {
    ready, root: ROOT,
    user: () => acct.token ? acct.email : null,
    state: () => state,
    onChange(f) { listeners.push(f); },
    bind(prefix, adapter) { adapters[prefix] = adapter; },
    changed(path, data) {
      if (!acct.token) return; // signed out: the data stays in this device's signed-out space
      queue[path] = data === undefined ? null : JSON.parse(JSON.stringify(data));
      save(QK, queue);
      if (acct.token) schedule();
    },
    pull,
    register: (email, password) => call('POST', '/register', { email, password }), // -> {pending, email}: confirm by email first
    verify: token => call('POST', '/verify', { token }).then(signedIn),
    resendVerify: email => call('POST', '/verify/resend', { email }),
    login: (email, password) => call('POST', '/login', { email, password }).then(signedIn),
    requestReset: email => call('POST', '/reset/request', { email }),
    confirmReset: (email, code, password) => call('POST', '/reset/confirm', { email, code, password }).then(signedIn),
    changePassword: password => call('POST', '/password', { password }, acct.token).then(r => { acct.token = r.token; saveAcct(); }),
    localPending, mergeLocal,
    // sentence translation through the account's own endpoint (or the site default); see functions/api
    translate: text => call('POST', '/translate', { text }, acct.token),
    translateAvailable: () => call('GET', '/translate/status', null, acct.token).then(r => !!(r.custom || r.default), () => false),
    getTranslateConfig: () => call('GET', '/translate/config', null, acct.token),
    setTranslateConfig: cfg => call('POST', '/translate/config', cfg, acct.token),
    // signs out this device only; the account's copy on this device is kept for the next sign-in
    async logout() {
      try { await push(); } catch (e) {}
      const t = acct.token;
      acct = {}; saveAcct(); switchSpace('local'); fire();
      if (t) call('POST', '/logout', null, t).catch(() => {});
    },
  };

  // the dictionary keeps 生词本 and 查词历史 in localStorage (ww.book / ww.history)
  const WW = { 'ww.book': 'book', 'ww.history': 'history' };
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === localStorage && WW[k]) { try { window.DLSync.changed('w/' + WW[k], JSON.parse(v)); } catch (e) {} }
  };
  const WWINV = { book: 'ww.book', history: 'ww.history' };
  window.DLSync.bind('w/', {
    apply(path, data) {
      if (!WWINV[path]) return;
      if (path === 'history' && Array.isArray(data)) {
        // merge with this device's history by entry ({k} headword or {q} text): keep the higher count and the latest time
        const merged = histMerge(data, load('ww.history', []));
        if (JSON.stringify(merged) !== JSON.stringify(data)) setTimeout(() => window.DLSync.changed('w/history', merged), 0);
        data = merged;
      }
      if (data == null) localStorage.removeItem(WWINV[path]); else rawSet.call(localStorage, WWINV[path], JSON.stringify(data));
      if (typeof window.__wwReload === 'function') window.__wwReload();
    },
  });

  // signed in or out in another tab, or in the embedded account panel (iframe): follow along
  window.addEventListener('storage', e => {
    if (e.key !== SK) return;
    const was = acct.token;
    acct = load(SK, {}); queue = load(QK, {});
    if (was === acct.token) return;
    if (Object.keys(adapters).some(p => p !== 'w/')) { location.reload(); return; } // the daily page holds the old space in memory
    if (typeof window.__wwReload === 'function') window.__wwReload();
    fire();
    if (acct.token) pull();
  });

  // account panel inside a page: <div data-dl-settings></div> (or data-dl-settings="translate" to open 句子翻译设置)
  function embedPanels() {
    document.querySelectorAll('[data-dl-settings]:not([data-dl-filled])').forEach(el => {
      el.setAttribute('data-dl-filled', '');
      const f = document.createElement('iframe');
      f.src = ROOT + 'konto/?embed=1' + (el.getAttribute('data-dl-settings') === 'translate' ? '&setup=translate' : '');
      f.title = '账号与同步';
      f.style.cssText = 'width:100%;border:0;display:block;height:420px;background:transparent';
      f.setAttribute('allowtransparency', 'true');
      el.appendChild(f);
    });
  }
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'dl-konto-height') return;
    document.querySelectorAll('[data-dl-settings] iframe').forEach(f => { if (f.contentWindow === e.source) f.style.height = e.data.h + 'px'; });
  });
  const startEmbeds = () => { embedPanels(); new MutationObserver(embedPanels).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startEmbeds); else startEmbeds();

  // "登录 / 同步" link: any element with class .sync (the daily page's status line) or [data-dl-account]
  const kontoUrl = () => ROOT + 'konto/?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('.sync, [data-dl-account]');
    if (el) { e.preventDefault(); location.href = kontoUrl(); }
  });
  const label = () => document.querySelectorAll('[data-dl-account]').forEach(el => { el.textContent = acct.token ? '已同步' : '登录'; el.title = acct.email || '登录后可在手机和电脑间同步'; });
  listeners.push(label);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', label); else label();
  const style = document.createElement('style');
  style.textContent = '.sync,[data-dl-account]{cursor:pointer}';
  document.head ? document.head.appendChild(style) : document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
})();

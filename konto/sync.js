/* Account + cloud sync client for the Deutsch-Lernen site (window.DLSync).
   The API runs as Cloudflare Pages Functions (functions/api). On the pages.dev mirror it is same-origin;
   from GitHub Pages the pages call the mirror's API (CORS + bearer token).

   Pages register an adapter for the data they keep:
     DLSync.bind(prefix, { apply(path, data), dump() -> {path: data} })
   and report each local change with DLSync.changed(prefix + path, data). Changes are queued in
   localStorage, sent in batches, and pulled from the server when a page opens or comes back into view.
   Conflicts: the last write to reach the server wins, per document. */
(() => {
  'use strict';
  if (window.DLSync) return;
  const MIRROR = 'https://deutsch-lernen-1ca.pages.dev';
  const h = location.hostname;
  const API = (window.DL_API != null ? window.DL_API
    : (h.endsWith('.pages.dev') || h === 'localhost' || h === '127.0.0.1') ? '' : MIRROR) + '/api';
  const ROOT = (() => { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/konto\/sync\.js.*$/, '') : '../'; })();

  const SK = 'dl-account', QK = 'dl-sync-queue';
  // everything the site keeps per learner; cleared when a different account signs in on this device
  const LOCAL_KEYS = ['deutsch-taeglich-db-v1', 'deutsch-taeglich-cache-v1', 'ww.book', 'ww.history'];
  const rawSet = Storage.prototype.setItem;
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { rawSet.call(localStorage, k, JSON.stringify(v)); } catch (e) {} };
  let acct = load(SK, {}); // {token, email, since, owner, fresh}
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
    } catch (e) { throw Object.assign(new Error('连不上服务器，请检查网络后再试'), { offline: true }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && token && token === acct.token) { acct = { owner: acct.owner }; saveAcct(); fire(); }
      throw Object.assign(new Error(j.error || ('服务器出错（' + r.status + '）')), { status: r.status });
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
        if (fresh) {
          // first sync on this device: upload what was kept here and is not in the account yet
          const remote = new Set(r.docs.map(d => d.path));
          for (const [p, a] of Object.entries(adapters))
            for (const [k, v] of Object.entries(a.dump() || {})) if (!remote.has(p + k) && v != null) queue[p + k] = v;
          save(QK, queue);
        }
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

  function clearLocal() {
    for (const k of LOCAL_KEYS) try { localStorage.removeItem(k); } catch (e) {}
    queue = {}; save(QK, queue);
  }
  function signedIn(r) {
    if (acct.owner && acct.owner !== r.email) clearLocal(); // this device held another account's data
    acct = { token: r.token, email: r.email, owner: r.email, since: 0, fresh: true };
    saveAcct(); fire();
    return r.email;
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
      if (!acct.token && !acct.owner) return; // never signed in here: nothing to sync
      queue[path] = data === undefined ? null : JSON.parse(JSON.stringify(data));
      save(QK, queue);
      if (acct.token) schedule();
    },
    pull,
    register: (email, password) => call('POST', '/register', { email, password }).then(signedIn),
    login: (email, password) => call('POST', '/login', { email, password }).then(signedIn),
    requestReset: email => call('POST', '/reset/request', { email }),
    confirmReset: (email, code, password) => call('POST', '/reset/confirm', { email, code, password }).then(signedIn),
    changePassword: (old, password) => call('POST', '/password', { old, password }, acct.token).then(r => { acct.token = r.token; saveAcct(); }),
    async logout() {
      try { await push(); } catch (e) {}
      const t = acct.token;
      acct = {}; saveAcct(); clearLocal(); fire();
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
      if (data == null) localStorage.removeItem(WWINV[path]); else rawSet.call(localStorage, WWINV[path], JSON.stringify(data));
      if (typeof window.__wwReload === 'function') window.__wwReload();
    },
    dump() {
      const out = {};
      for (const [k, p] of Object.entries(WW)) { const v = load(k, null); if (v != null) out[p] = v; }
      return out;
    },
  });

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

/* Stand-in for the claude.ai runtime (window.claude) so the Deutsch täglich page runs as a plain website.
   - Daily content (content/<date>) is read from content/<date>.json published next to this page.
   - Everything the learner writes (progress, calendar, wordbook, settings) is kept in this browser's localStorage.
   - There is no Claude here: use('sample') resolves to null, so the page falls back to its no-Claude behaviour. */
(() => {
  'use strict';
  const KEY = 'deutsch-taeglich-db-v1';
  let mem = {};
  try { mem = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} };
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const merge = (a, b) => {
    const out = isObj(a) ? { ...a } : {};
    for (const [k, v] of Object.entries(b)) {
      if (isObj(v) && v.__delete__ === true) delete out[k];
      else out[k] = isObj(v) ? merge(out[k], v) : clone(v);
    }
    return out;
  };

  // published daily content
  const remote = {};
  const fetchJSON = url => fetch(url, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  let index = null;
  const getIndex = () => index || (index = fetchJSON('content/index.json').then(x => x || { dates: [], seen: [] }));
  const getRemote = path => {
    const m = /^content\/(\d{4}-\d{2}-\d{2})$/.exec(path);
    if (!m) return Promise.resolve(null);
    return remote[path] || (remote[path] = fetchJSON('content/' + m[1] + '.json'));
  };

  const snap = (id, data) => ({ id, exists: data != null, data: () => clone(data), metadata: { hasPendingWrites: false } });
  const listeners = {};
  const emit = path => (listeners[path] || []).forEach(f => { try { f(snap(path.split('/').pop(), mem[path])); } catch (e) {} });

  function doc(path) {
    return {
      id: path.split('/').pop(), path,
      async get() {
        let data = mem[path];
        if (path.startsWith('content/')) { const r = await getRemote(path); if (r) data = data && data.source === 'page' ? data : r; }
        if (path === 'settings/main') {
          const ix = await getIndex();
          const base = data || { level: 'B2–C1', seen: [], dates: [] };
          data = { ...base,
            seen: Array.from(new Set((base.seen || []).concat(ix.seen || []))),
            dates: Array.from(new Set((base.dates || []).concat(ix.dates || []))).sort() };
        }
        return snap(this.id, data);
      },
      async set(data) { mem[path] = clone(data); persist(); emit(path); },
      async update(patch) {
        if (mem[path] == null && !path.startsWith('content/') && path !== 'settings/main') throw { code: 'not_found' };
        mem[path] = merge(mem[path], patch); persist(); emit(path);
      },
      async delete() { delete mem[path]; persist(); emit(path); },
      onSnapshot(cb) { (listeners[path] = listeners[path] || []).push(cb); return () => { listeners[path] = listeners[path].filter(f => f !== cb); }; },
      collection: name => collection(path + '/' + name)
    };
  }
  function collection(path, order, lim) {
    return {
      doc: id => doc(path + '/' + id),
      orderBy: (f, dir) => collection(path, [f, dir || 'asc'], lim),
      limit: n => collection(path, order, n),
      async get() {
        const pre = path + '/';
        let docs = Object.keys(mem).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/'))
          .map(k => ({ id: k.slice(pre.length), d: mem[k] }));
        if (order) { const [f, dir] = order; docs.sort((a, b) => ((a.d[f] > b.d[f]) - (a.d[f] < b.d[f])) * (dir === 'desc' ? -1 : 1)); }
        if (lim) docs = docs.slice(0, lim);
        return { docs: docs.map(x => snap(x.id, x.d)) };
      }
    };
  }

  const db = { doc };
  const user = { id: async () => 'local' };
  window.claude = { use: async name => name === 'db' ? db : name === 'user' ? user : null };
})();

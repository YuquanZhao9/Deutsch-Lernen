const { chromium } = require('playwright');
const txt = async (p, sel = '#view') => (await p.textContent(sel)).replace(/\s+/g, ' ');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('ww.trLast', JSON.stringify({ src: 'ich bin gerade auf dem weg', dir: 'de2zh', tr: '[object Object]', alt: '', words: [], notes: [] }));
    localStorage.setItem('ww.history', JSON.stringify([{ q: 'ich bin gerade auf dem weg', tr: '[object Object]', n: 1, t: 1 }]));
  } catch {} });
  await p.route('**/api/translate', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { tr: { zh: '我正在路上。' } }, source: 'workers-ai' }) }));
  await p.goto('http://localhost:8766/papi.html'); await p.waitForTimeout(3500);
  console.log('home:', (await txt(p)).slice(0, 80), '| trLast:', await p.evaluate(() => localStorage.getItem('ww.trLast')));
  await p.fill('#q', 'ich bin gerade auf dem weg'); await p.waitForTimeout(150); console.log('typed:', (await txt(p)).slice(0, 90));
  await p.press('#q', 'Enter'); await p.waitForTimeout(600); const r = await txt(p); console.log('after enter:', r.slice(r.indexOf('译文'), r.indexOf('译文') + 20));
  await p.reload(); await p.waitForTimeout(3000); await p.fill('#q', 'ich bin gerade auf dem weg'); await p.waitForTimeout(150); const r2 = await txt(p); console.log('cached good after reload:', r2.includes('我正在路上'));
  console.log('errors', errs); await b.close();
})();

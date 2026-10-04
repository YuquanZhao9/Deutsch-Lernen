const { chromium } = require('playwright');
const FAKE = `window.claude = { use: async (n) => n !== 'sample' ? null : Object.assign(async () => ({ text: '', truncated: false }), {
  json: async () => { await new Promise(r => setTimeout(r, 200)); return { tr: '他克服了自己的偏见。', alt: '', words: [], notes: [] }; }, limits: async () => ({}) }) };`;
const txt = async (p, sel = '#view') => (await p.textContent(sel)).replace(/\s+/g, ' ');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(FAKE);
  // old-format history must migrate
  await p.addInitScript(() => { try { localStorage.setItem('ww.history', JSON.stringify(['Vorurteil'])); } catch {} });
  await p.goto('http://localhost:8766/ptest.html'); await p.waitForTimeout(3500);
  console.log('home:', (await txt(p)).slice(0, 120));
  await p.fill('#q', 'glauben'); await p.press('#q', 'Enter'); await p.waitForTimeout(200);
  await p.click('#back'); await p.waitForTimeout(100);
  await p.fill('#q', 'glauben'); await p.press('#q', 'Enter'); await p.waitForTimeout(200); await p.click('#back'); await p.waitForTimeout(100);
  await p.fill('#q', 'Entwurfautomatisierung'); await p.press('#q', 'Enter'); await p.waitForTimeout(200);
  await p.fill('#q', 'Er überwand seine Vorurteile.'); await p.press('#q', 'Enter'); await p.waitForTimeout(600);
  await p.fill('#q', ''); await p.waitForTimeout(200);
  console.log('home after:', (await txt(p)).slice(0, 300));
  console.log('stored:', JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem('ww.history')))).slice(0, 300));
  await p.click('.row.h2[data-q]'); await p.waitForTimeout(200); console.log('tap miss row:', await p.inputValue('#q'), '|', (await txt(p)).slice(0, 40));
  await p.fill('#q', ''); await p.waitForTimeout(100); await p.click('.row.h2[data-open]'); await p.waitForTimeout(200); console.log('tap word row:', (await txt(p)).slice(0, 30));
  await p.click('#back'); await p.screenshot({ path: 'hist.png' });
  await p.click('#clearhist'); await p.waitForTimeout(100); console.log('cleared:', (await txt(p)).slice(0, 40));
  console.log('errors', errs); await b.close();
})();

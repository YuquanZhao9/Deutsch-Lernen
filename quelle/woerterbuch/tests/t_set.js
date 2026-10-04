const { chromium } = require('playwright');
const txt = async (p, sel = '#view') => (await p.textContent(sel)).replace(/\s+/g, ' ');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { window.__ev = 0; document.addEventListener('ww:settings', () => window.__ev++); });
  await p.route('**/api/translate', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { tr: '早上好！', alt: '', words: [], notes: [] } }) }));
  await p.goto('http://localhost:8766/papi.html'); await p.waitForTimeout(3500);
  console.log('tabs:', await txt(p, 'nav.tabs'));
  console.log('home has srcline/button:', await p.$('.srcline') !== null, await p.$('[data-setup]') !== null);
  await p.fill('#q', 'Er überwand seine Vorurteile.'); await p.waitForTimeout(150); console.log('sentence card:', (await txt(p)).slice(0, 160), '| button:', await p.$('[data-setup]') !== null);
  await p.click('nav.tabs button[data-tab="lib"]'); await p.waitForTimeout(150);
  console.log('settings:', (await txt(p)).slice(0, 420)); console.log('cards:', await p.$$eval('#view .card h3', h => h.map(x => x.textContent)), '| ev:', await p.evaluate(() => window.__ev));
  await p.click('[data-setup]'); await p.waitForTimeout(150); console.log('guide:', (await txt(p)).slice(0, 40), '| tab lib:', await p.getAttribute('nav.tabs button[data-tab="lib"]', 'aria-selected'));
  await p.click('[data-preset="zhipu"]'); await p.fill('#m-key', 'k'); await p.click('#m-save'); await p.waitForTimeout(400); console.log('after save:', (await txt(p)).slice(0, 120));
  await p.click('#setup-back').catch(() => {}); await p.waitForTimeout(100); console.log('back on:', (await txt(p)).slice(0, 20));
  // imports
  await p.setInputFiles('#file', 'wt/ext/list.txt'); await p.waitForTimeout(500); console.log('txt:', await p.textContent('#toast'));
  await p.setInputFiles('#file', 'wt/ext/eudic.csv'); await p.waitForTimeout(500); console.log('csv:', await p.textContent('#toast'));
  await p.setInputFiles('#file', 'wt/ext/anki.json'); await p.waitForTimeout(500); console.log('json:', await p.textContent('#toast'));
  console.log('extcard:', await txt(p, '#extcard'));
  console.log('count:', await txt(p, '#count'));
  await p.click('nav.tabs button[data-tab="search"]'); await p.fill('#q', 'Hund'); await p.waitForTimeout(150); console.log('Hund:', (await txt(p)).slice(0, 80));
  await p.press('#q', 'Enter'); await p.waitForTimeout(150); console.log('Hund entry:', (await txt(p)).slice(0, 120));
  await p.fill('#q', 'Vorurteil'); await p.press('#q', 'Enter'); await p.waitForTimeout(150); const v = await txt(p); console.log('Vorurteil has 其他词典:', v.includes('其他词典'), v.slice(v.indexOf('其他词典'), v.indexOf('其他词典') + 40));
  await p.fill('#q', 'Katze'); await p.waitForTimeout(150); console.log('Katze:', (await txt(p)).slice(0, 60));
  await p.fill('#q', 'schnell'); await p.waitForTimeout(150); console.log('schnell:', (await txt(p)).slice(0, 90));
  await p.fill('#q', 'Fahrrad'); await p.press('#q', 'Enter'); await p.waitForTimeout(150); console.log('Fahrrad:', (await txt(p)).slice(0, 60));
  // persists across reload
  await p.reload(); await p.waitForTimeout(3000); await p.fill('#q', 'Zumutung'); await p.press('#q', 'Enter'); await p.waitForTimeout(150); const z = await txt(p); console.log('Zumutung after reload has 其他词典:', z.includes('Anki'));
  await p.click('nav.tabs button[data-tab="lib"]'); await p.waitForTimeout(150); await p.screenshot({ path: 'set1.png' });
  await p.click('[data-extdel="0"]'); await p.waitForTimeout(200); console.log('after delete:', await txt(p, '#extcard'));
  await p.screenshot({ path: 'set2.png', fullPage: false });
  console.log('errors', errs); await b.close();
})();

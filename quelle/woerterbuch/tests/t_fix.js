const { chromium } = require('playwright');
const txt = async (p, sel = '#view') => (await p.textContent(sel)).replace(/\s+/g, ' ');
(async () => {
  const b = await chromium.launch(); const errs = []; let mode = 'ok', n = 0;
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', e => errs.push(e.message));
  await p.route('**/api/translate', async route => {
    n++; const body = route.request().postDataJSON();
    if (mode === '503') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '网站的免费翻译还没有开通' }) });
    if (mode === 'flaky' && n % 2 === 1) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { alt: '' } }) });
    if (mode === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>oops</html>' });
    if (mode === 'obj') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { tr: { zh: '我正在路上。' }, alt: { zh: '我正在路上。' }, words: ['gerade', { de: 'der Weg', form: 'Weg', zh: '路' }], notes: '口语里常这样说。' }, source: 'workers-ai' }) });
    if (mode === 'fence') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { tr: '```json\n{"tr":"我在路上","words":[]}\n```' }, source: 'workers-ai' }) });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { tr: '译文：' + body.text, alt: '', words: [], notes: [] }, source: 'workers-ai' }) });
  });
  await p.goto('http://localhost:8766/papi.html'); await p.waitForTimeout(3500);
  // 2-word German, not a headword, no punctuation: Enter should translate instead of a dead end
  await p.fill('#q', 'Ich komme'); await p.waitForTimeout(150); console.log('typing:', (await txt(p)).slice(0, 90), '| button:', await p.$('#trforce') !== null);
  await p.press('#q', 'Enter'); await p.waitForTimeout(500); console.log('enter:', (await txt(p)).slice(0, 90));
  // typing on clears the forced mode
  await p.fill('#q', 'Ich komme morgen'); await p.waitForTimeout(150); console.log('3 words:', (await txt(p)).slice(0, 40));
  // result rows + button for a phrase that has hits
  await p.fill('#q', 'guten Morgen'); await p.waitForTimeout(150); console.log('hits:', (await txt(p)).slice(0, 60), '| button:', await p.$('#trforce') !== null);
  await p.click('#trforce'); await p.waitForTimeout(500); console.log('forced:', (await txt(p)).slice(0, 80));
  // short Chinese
  await p.fill('#q', '我累了'); await p.waitForTimeout(150); console.log('zh3:', (await txt(p)).slice(0, 60), '| button:', await p.$('#trforce') !== null);
  await p.press('#q', 'Enter'); await p.waitForTimeout(500); console.log('zh enter:', (await txt(p)).slice(0, 70));
  // server error text reaches the toast
  mode = '503'; await p.fill('#q', 'Er überwand seine Vorurteile heute.'); await p.press('#q', 'Enter'); await p.waitForTimeout(500); console.log('503 toast:', await p.textContent('#toast'));
  // retry once on an empty result
  mode = 'flaky'; n = 0; await p.click('#trgo'); await p.waitForTimeout(600); console.log('flaky calls:', n, '|', (await txt(p)).slice(60, 110));
  mode = 'html'; await p.fill('#q', 'Das ist ein Test.'); await p.press('#q', 'Enter'); await p.waitForTimeout(600); console.log('html toast:', await p.textContent('#toast'));
  mode = 'obj'; await p.fill('#q', 'ich bin gerade auf dem weg'); await p.press('#q', 'Enter'); await p.waitForTimeout(600); const o = await txt(p); console.log('obj:', o.slice(o.indexOf('译文'), o.indexOf('译文') + 60), '| object?', o.includes('[object'));
  mode = 'fence'; await p.fill('#q', 'Ich bin auf dem Weg nach Hause.'); await p.press('#q', 'Enter'); await p.waitForTimeout(600); const f = await txt(p); console.log('fence:', f.slice(f.indexOf('译文'), f.indexOf('译文') + 30));
  console.log('errors', errs); await b.close();
})();

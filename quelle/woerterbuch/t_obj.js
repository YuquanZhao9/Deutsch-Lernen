const { chromium } = require('playwright');
const txt = async (p, sel = '#view') => (await p.textContent(sel)).replace(/\s+/g, ' ');
(async () => {
  const b = await chromium.launch(); const errs = []; let mode = 'objstr', calls = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', e => errs.push(e.message));
  await p.route('**/api/translate', async route => {
    const body = route.request().postDataJSON(); calls.push(body.prompt != null ? 'page' : 'plain:' + body.to);
    if (body.prompt == null) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'plainbad' ? { text: '[object Object]', source: 'default' } : { text: body.to === 'de' ? 'Ich bin müde.' : '我在回家的路上。', source: 'default' }) });
    if (mode === 'good') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { tr: '我在路上。', alt: '', words: [{ de: 'der Weg', form: 'Weg', zh: '路' }], notes: [] }, source: 'workers-ai' }) });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { tr: '[object Object]', alt: '', words: [], notes: [] }, source: 'workers-ai' }) });
  });
  await p.goto('http://localhost:8766/papi.html'); await p.waitForTimeout(3500);
  const run = async (s) => { calls = []; await p.fill('#q', s); await p.press('#q', 'Enter'); await p.waitForTimeout(700); const o = await txt(p); return o.slice(o.indexOf('译文'), o.indexOf('译文') + 40) + ' | calls ' + calls.join(',') + ' | object? ' + o.includes('[object'); };
  console.log('objstr de:', await run('Ich bin auf dem Weg nach Hause.'));
  console.log('objstr zh:', await run('我累了，想休息一下。'));
  mode = 'good'; console.log('good:', await run('Ich bin gerade auf dem Weg.'));
  mode = 'plainbad'; console.log('plainbad:', await run('Das ist wirklich ein Test.'), '| toast', await p.textContent('#toast'));
  const hist = await p.evaluate(() => JSON.stringify(localStorage)); console.log('stored [object?', hist.includes('[object'));
  console.log('errors', errs); await b.close();
})();

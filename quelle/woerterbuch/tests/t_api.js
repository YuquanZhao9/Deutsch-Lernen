// website mode: TRANSLATE_API set, no window.claude; /api/translate is faked with page.route
const { chromium } = require('playwright');
const txt = async (p, sel = '#view') => (await p.textContent(sel)).replace(/\s+/g, ' ');
(async () => {
  const b = await chromium.launch(); const errs = []; const calls = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', e => errs.push(e.message));
  await p.route('**/api/translate', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (body.model && body.model.key === 'bad') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: '密钥无效 (401)' }) });
    const result = body.text === 'Guten Morgen!' ? { tr: '早上好！', alt: '', words: [], notes: [] }
      : { tr: '他克服了自己的偏见。', alt: '', words: body.model ? [{ de: 'überwinden', form: 'überwand', zh: '克服' }] : [], notes: [] };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result, source: body.model ? 'custom' : 'workers-ai' }) });
  });
  await p.goto('http://localhost:8766/papi.html'); await p.waitForTimeout(3500);
  console.log('home:', (await txt(p)).slice(0, 120));
  // home sentence box → translation
  await p.fill('#hin', 'Er überwand seine Vorurteile.'); await p.click('#hgo'); await p.waitForTimeout(500);
  console.log('from home box:', await p.inputValue('#q'), '|', (await txt(p)).slice(0, 110));
  console.log('button under box:', await p.$('[data-setup]') !== null);
  // 设置 tab → 立即设置 → guide
  await p.click('nav.tabs button[data-tab="lib"]'); await p.waitForTimeout(100); await p.click('[data-setup]'); await p.waitForTimeout(150);
  const g = await txt(p); console.log('guide:', g.slice(0, 200)); console.log('has cn list:', g.includes('智谱 GLM') && g.includes('硅基流动'), '| intl:', g.includes('Groq'), '| other:', g.includes('自己填接口'), '| form yet:', await p.$('#modelform') !== null);
  await p.click('[data-preset="deepseek"]'); await p.waitForTimeout(150);
  console.log('picked:', await p.inputValue('#m-url'), await p.inputValue('#m-name'), '| links:', await p.$$eval('#modelform a', a => a.map(x => x.textContent + ' ' + x.href)));
  await p.fill('#m-key', 'bad'); await p.click('#m-save'); await p.waitForTimeout(400);
  console.log('bad key:', await p.textContent('#toast'), '| saved?', await p.evaluate(() => localStorage.getItem('ww.model')), '| still on guide:', await p.$('#modelform') !== null);
  await p.fill('#m-key', 'sk-good'); await p.click('#m-save'); await p.waitForTimeout(400);
  console.log('good key:', await p.textContent('#toast'), '| back to:', (await txt(p)).slice(0, 60));
  await p.click('nav.tabs button[data-tab="search"]'); await p.waitForTimeout(100); console.log('note now:', (await txt(p)).slice(60, 130));
  await p.click('#trgo'); await p.waitForTimeout(500);
  console.log('custom result:', (await txt(p)).slice(0, 130), '| model sent:', JSON.stringify(calls.at(-1).model));
  // other option
  await p.click('nav.tabs button[data-tab="lib"]'); await p.waitForTimeout(100); await p.click('[data-setup]'); await p.waitForTimeout(100); await p.click('[data-preset="other"]'); await p.waitForTimeout(100);
  console.log('other form:', await p.inputValue('#m-url'), '|', (await txt(p, '#modelform')).slice(0, 40));
  await p.click('#m-clear'); await p.waitForTimeout(100); console.log('cleared:', await p.evaluate(() => localStorage.getItem('ww.model')), '|', (await txt(p)).slice(0, 50));
  await p.click('#setup-back'); await p.waitForTimeout(100); console.log('back:', (await txt(p)).slice(0, 40));
  // lib card
  console.log('lib card:', await txt(p, '#modelcard'));
  await p.click('#modelcard [data-setup]'); await p.waitForTimeout(100); console.log('from lib:', (await txt(p)).slice(0, 30), '| tab:', await p.getAttribute('nav.tabs button[data-tab="search"]', 'aria-selected')); await p.screenshot({ path: 'setup.png', fullPage: false });
  await p.click('[data-preset="zhipu"]'); await p.waitForTimeout(150); await p.screenshot({ path: 'setup2.png' });
  await p.click('#setup-back'); await p.fill('#q', ''); await p.waitForTimeout(150); await p.screenshot({ path: 'home2.png' });
  console.log('errors', errs); await b.close();
})();

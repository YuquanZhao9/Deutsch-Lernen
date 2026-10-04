const { chromium } = require('playwright');
const FAKE = `window.claude = { use: async (n) => n !== 'sample' ? null : Object.assign(async () => ({ text: '', truncated: false }), {
  json: async (prompt, opts) => { window.__calls = (window.__calls || 0) + 1; window.__opts = { tier: opts.modelTier, hasSignal: !!opts.signal }; await new Promise(r => setTimeout(r, 300));
    return prompt.includes('句子：我') ? { tr: 'Ich habe das Vorurteil überwunden.', alt: 'Ich bin über das Vorurteil hinweggekommen.', words: [{ de: 'das Vorurteil', form: 'das Vorurteil', zh: '偏见' }, { de: 'überwinden', form: 'überwunden', zh: '克服' }], notes: ['überwinden 是不可分动词，第二分词 überwunden。'] }
      : { tr: '他克服了自己的偏见。', alt: '', words: [{ de: 'das Vorurteil', form: 'Vorurteile', zh: '偏见' }, { de: 'überwinden', form: 'überwand', zh: '克服' }], notes: ['überwand 是 überwinden 的过去时。'] }; },
  limits: async () => ({ maxPromptBytes: 262144 }) }) };`;
const txt = async (p, sel = '#view') => (await p.textContent(sel)).replace(/\s+/g, ' ');
(async () => {
  const b = await chromium.launch(); const errs = [];
  let p = await b.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(FAKE);
  await p.goto('http://localhost:8766/ptest.html'); await p.waitForTimeout(3500);
  console.log('tabs:', await txt(p, 'nav.tabs'));
  // a word -> dictionary
  await p.fill('#q', 'Vorurteil'); await p.waitForTimeout(150); console.log('word:', (await txt(p)).slice(0, 60));
  // two-word phrase -> dictionary
  await p.fill('#q', 'sich einstellen'); await p.waitForTimeout(150); console.log('phrase:', (await txt(p)).slice(0, 60));
  // a sentence -> sentence mode, not translated until Enter
  await p.fill('#q', 'Er überwand seine Vorurteile.'); await p.waitForTimeout(150);
  console.log('sentence:', (await txt(p)).slice(0, 200), '| calls:', await p.evaluate(() => window.__calls || 0));
  await p.press('#q', 'Enter'); await p.waitForTimeout(100); console.log('busy:', await p.textContent('#trgo'));
  await p.waitForTimeout(600); console.log('result:', (await txt(p)).slice(0, 330));
  console.log('opts:', await p.evaluate(() => window.__opts));
  await p.click('.trw .chip'); await p.waitForTimeout(300); console.log('chip ->', (await txt(p)).slice(0, 50));
  await p.click('#back'); await p.waitForTimeout(200); console.log('back keeps result:', (await txt(p)).includes('他克服了自己的偏见'));
  // Chinese word vs Chinese sentence
  await p.fill('#q', '影响'); await p.waitForTimeout(150); console.log('zh word:', (await txt(p)).slice(0, 50));
  await p.fill('#q', '我克服了偏见。'); await p.waitForTimeout(150); console.log('zh sentence:', (await txt(p)).slice(0, 80));
  await p.click('#trgo'); await p.waitForTimeout(800); console.log('zh2de:', (await txt(p)).slice(0, 220), '| say:', await p.$('#trsay') !== null);
  // 3-word fixed expression that is a headword
  await p.fill('#q', 'zur Verfügung stellen'); await p.waitForTimeout(150); console.log('expr:', (await txt(p)).slice(0, 160));
  // switch button
  const nav = await p.evaluate(() => { let href = ''; const d = Object.getOwnPropertyDescriptor(window, 'location'); return document.querySelector('[data-go="daily"]') ? 'present' : 'missing'; });
  console.log('switch:', nav);
  await p.screenshot({ path: 'tr1.png' }); await p.close();
  // without Claude
  p = await b.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8766/ptest.html'); await p.waitForTimeout(3500);
  await p.fill('#q', 'Er überwand seine Vorurteile und ging.'); await p.waitForTimeout(150);
  console.log('no-claude:', (await txt(p)).slice(0, 260)); console.log('deepl:', await p.getAttribute('.note a', 'href'));
  await p.screenshot({ path: 'tr2.png' }); await p.close();
  console.log('errors', errs); await b.close();
})();

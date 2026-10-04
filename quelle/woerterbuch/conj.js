// CONJ-START
// Builds a full conjugation table from the entry's headword and principal parts
// ("gibt · gab · hat gegeben"). Returns null when the parts can't be parsed safely.
const CONJ = (() => {
  const PRON = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'];
  const RACC = ['mich', 'dich', 'sich', 'uns', 'euch', 'sich'];
  const RDAT = ['mir', 'dir', 'sich', 'uns', 'euch', 'sich'];
  const HABEN = ['habe', 'hast', 'hat', 'haben', 'habt', 'haben'];
  const SEIN = ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'];
  const WERDEN = ['werde', 'wirst', 'wird', 'werden', 'werdet', 'werden'];
  const MODAL = ['können', 'müssen', 'dürfen', 'sollen', 'wollen', 'mögen'];
  const MODAL_UML = ['können', 'müssen', 'dürfen', 'mögen'];
  const UML_WEAK = ['denken', 'bringen', 'wissen', 'haben'];
  const MIXED_PLAIN = ['kennen', 'nennen', 'brennen', 'rennen', 'senden', 'wenden'];
  const KONJ_EXC = { stehen: 'stünde', helfen: 'hülfe', sterben: 'stürbe', werfen: 'würfe', verderben: 'verdürbe', beginnen: 'begänne', schwimmen: 'schwömme', gewinnen: 'gewönne', empfehlen: 'empföhle', befehlen: 'beföhle' };
  const ends = (w, list) => list.find(x => w === x || (w.endsWith(x) && w.length > x.length));
  const sib = s => /[sßzx]$/.test(s);
  const needE = s => /[td]$/.test(s) || /[^aeiouäöülrhmn][mn]$/.test(s);
  const umlaut = s => {
    const m = s.match(/^(.*?)(au|a|o|u)([^aeiouäöü]*)$/);
    if (!m || (m[2] === 'u' && /[ea]$/.test(m[1]))) return s;
    return m[1] + ({ au: 'äu', a: 'ä', o: 'ö', u: 'ü' })[m[2]] + m[3];
  };

  function parse(e) {
    let f = String(e.forms || '');
    const VAR = /[（(；;／]|\s\/\s/;
    const variants = VAR.test(f);
    f = f.split(VAR)[0];
    const parts = f.split('·').map(s => s.trim()).filter(Boolean);
    if (parts.length !== 3) return null;
    const t3 = parts[0].split(/\s+/), tp = parts[1].split(/\s+/), tpp = parts[2].split(/\s+/).filter(x => x !== 'sich');
    const aux = tpp[0];
    if (!/^(hat|ist)(\/(hat|ist))?$/.test(aux) || tpp.length < 2) return null;
    const refl = /^sich\s/.test(e.w);
    const base = e.w.replace(/^sich\s+/, '');
    if (/\s/.test(base)) return null;
    const particle = t3.slice(1).filter(x => x !== 'sich').join(' ');
    let main = base;
    if (particle) { const p = particle.replace(/\s/g, ''); if (!base.startsWith(p)) return null; main = base.slice(p.length); }
    let stem, type = '';
    if (/(eln|ern)$/.test(main)) { stem = main.slice(0, -1); type = main.slice(-3); }
    else if (main.endsWith('en')) stem = main.slice(0, -2);
    else if (main.endsWith('n')) stem = main.slice(0, -1);
    else return null;
    const dat = refl && /sich\s*\(D\)|sich³|sich\s*\(Dat/i.test(JSON.stringify([e.use, e.senses, e.tip]));
    return { base, main, stem, type, refl, dat, particle, f3: t3[0], fp: tp[0], aux, pp: tpp[1], variants };
  }

  function build(e) {
    const p = parse(e); if (!p) return null;
    const { main, stem, type, f3, fp } = p;
    let pres, prat, konj, imp;
    if (main === 'sein') {
      pres = ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'];
      prat = ['war', 'warst', 'war', 'waren', 'wart', 'waren'];
      konj = ['wäre', 'wärst', 'wäre', 'wären', 'wärt', 'wären'];
      imp = ['sei', 'seid', 'seien Sie'];
    } else {
      const modalLike = !f3.endsWith('t') || main === 'werden';
      const ich = main === 'werden' ? 'werde' : !f3.endsWith('t') ? f3 : type === 'eln' ? stem.slice(0, -2) + 'le' : stem + 'e';
      let du;
      if (main === 'werden') du = 'wirst';
      else if (!f3.endsWith('t')) du = sib(f3) ? f3 + 't' : f3 + 'st';
      else if (f3 === stem + 'et') du = stem + 'est';
      else if (stem.endsWith('t')) du = f3 + 'st';
      else { const b = f3.slice(0, -1); du = sib(b) ? b + 't' : b + 'st'; }
      const ihr = needE(stem) && !type ? stem + 'et' : stem + 't';
      pres = [ich, du, f3, main, ihr, main];

      if (fp.endsWith('e')) prat = [fp, fp + 'st', fp, fp + 'n', fp + 't', fp];
      else prat = [fp, fp + (sib(fp) ? 'est' : 'st'), fp, fp + 'en', fp + (/[td]$/.test(fp) ? 'et' : 't'), fp + 'en'];
      prat[5] = prat[3];

      const strong = /n$/.test(p.pp) && !/te$/.test(fp);
      let ks = null;
      const exc = ends(main, Object.keys(KONJ_EXC));
      if (exc) ks = main.slice(0, main.length - exc.length) + KONJ_EXC[exc].slice(0, -1);
      else if (strong) ks = umlaut(fp.replace(/e$/, ''));
      else if (MODAL_UML.includes(main) || ends(main, UML_WEAK)) ks = umlaut(fp.replace(/e$/, ''));
      if (ks) konj = [ks + 'e', ks + 'est', ks + 'e', ks + 'en', ks + 'et', ks + 'en'];
      else if (ends(main, MIXED_PLAIN)) { const t = stem + (needE(stem) ? 'ete' : 'te'); konj = [t, t + 'st', t, t + 'n', t + 't', t + 'n']; }
      else konj = prat.slice();

      if (MODAL.includes(main)) imp = null;
      else if (main === 'werden') imp = ['werde', 'werdet', 'werden Sie'];
      else {
        let b = stem.endsWith('t') && f3 !== stem + 'et' ? f3 : f3.slice(0, -1), ei = false;
        for (let i = 0; i < Math.min(b.length, stem.length); i++) if (b[i] !== stem[i]) { ei = stem[i] === 'e' && b[i] === 'i'; break; }
        const du2 = !modalLike && ei ? b : type === 'eln' ? stem.slice(0, -2) + 'le' : type === 'ern' ? stem + 'e' : needE(stem) ? stem + 'e' : stem + '(e)';
        imp = [du2, ihr, main + ' Sie'];
      }
    }
    const rp = p.refl ? (p.dat ? RDAT : RACC) : null;
    const tail = i => (rp ? ' ' + rp[i] : '') + (p.particle ? ' ' + p.particle : '');
    const fin = arr => arr.map((v, i) => ({ who: PRON[i], form: v + tail(i), key: v }));
    const auxs = p.aux.split('/').map(a => a === 'ist' ? SEIN : HABEN);
    const perf = PRON.map((who, i) => ({ who, form: auxs.map(a => a[i]).join('/') + (rp ? ' ' + rp[i] : '') + ' ' + p.pp }));
    const fut = PRON.map((who, i) => ({ who, form: WERDEN[i] + (rp ? ' ' + rp[i] : '') + ' ' + p.base }));
    const p1 = (/[^e]n$/.test(p.base) && !/(eln|ern)$/.test(p.base) ? p.base.slice(0, -1) + 'end' : p.base + 'd');
    let impRows = null;
    if (imp) {
      const r = p.refl ? [p.dat ? 'dir' : 'dich', 'euch', 'sich'] : ['', '', ''];
      impRows = [['du', imp[0]], ['ihr', imp[1]], ['Sie', imp[2]]].map(([who, v], i) => {
        const [verb, sie] = v.split(' ');
        return { who, form: verb + (sie ? ' Sie' : '') + (r[i] ? ' ' + r[i] : '') + (p.particle ? ' ' + p.particle : '') , key: verb };
      });
    }
    const tables = [
      { name: '现在时 Präsens', rows: fin(pres) },
      { name: '过去时 Präteritum', rows: fin(prat) },
      { name: '现在完成时 Perfekt', rows: perf },
      { name: '将来时 Futur I', rows: fut },
      { name: '第二虚拟式 Konjunktiv II', rows: fin(konj), note: konj.join() === prat.join() ? '与过去时同形，口语里多用 würde + 不定式。' : '' },
    ];
    if (impRows) tables.push({ name: '命令式 Imperativ', rows: impRows });
    return { tables, p1, p2: p.pp, aux: p.aux, refl: p.refl, particle: p.particle, variants: p.variants, pres, prat, konj, imp };
  }

  // Every inflected form of a verb, with a Chinese label, for the search index.
  function formsOf(e, c) {
    const out = [];
    const add = (form, label) => { if (form && form !== e.w) out.push([form, label]); };
    const who = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'];
    const tense = [['pres', '现在时'], ['prat', '过去时'], ['konj', '第二虚拟式']];
    for (const [k, name] of tense) c[k].forEach((v, i) => {
      add(v, `${name} · ${who[i]}`);
      if (c.particle) add(v + ' ' + c.particle, `${name} · ${who[i]}`);
    });
    if (c.imp) [['du', 0], ['ihr', 1]].forEach(([w, i]) => {
      const v = c.imp[i].replace('(e)', ''); add(v, `命令式 · ${w}`); if (c.imp[i].includes('(e)')) add(v + 'e', `命令式 · ${w}`);
      if (c.particle) add(v + ' ' + c.particle, `命令式 · ${w}`);
    });
    add(c.p2, '第二分词（完成时用）');
    add(c.p1, '第一分词');
    return out;
  }
  return { build, formsOf };
})();
// CONJ-END

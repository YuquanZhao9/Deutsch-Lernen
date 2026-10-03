import json, glob, sys, os, re
from collections import Counter
ents = []
for p in sorted(glob.glob('parts/[A-D][12].json')):
    d = json.load(open(p)); print(p, len(d)); ents += d
seen = {}
probs = []
for e in ents:
    w = e.get('w')
    if w in seen: probs.append(f'dup {w}'); continue
    seen[w] = e
    if e.get('pos') == 'n':
        for k in ('gen','pl','gs'):
            if not e.get(k): probs.append(f'{w}: missing {k}')
        if e.get('gen') not in ('m','f','n','pl'): probs.append(f'{w}: gen {e.get("gen")}')
    if e.get('pos') == 'v' and not e.get('forms'): probs.append(f'{w}: no forms')
    for k in ('senses','root','ety','ipa'):
        if not e.get(k): probs.append(f'{w}: missing {k}')
    for s in e.get('senses', []):
        if not s.get('zh'): probs.append(f'{w}: sense without zh')
for e in seen.values():
    if e.get('ipa'): e['ipa'] = e['ipa'].replace('r','ʁ')
entries = sorted(seen.values(), key=lambda e: e['w'].replace('sich ','').lower())
dic = {"name": "Wortwurzel 德语词典（B2–C1）", "version": "2026.10.03", "format": "wortwurzel-1", "entries": entries}
json.dump(dic, open('wortwurzel.json','w'), ensure_ascii=False, separators=(',',':'))
print('entries', len(entries)); print('\n'.join(probs) or 'no problems')
print(Counter(e.get('pos') for e in entries))
# offline standalone
page = open('index.html').read()
data = json.dumps(dic, ensure_ascii=False, separators=(',',':')).replace('</', '<\\/')
page = page.replace('<script id="embedded-dict" type="application/json">null</script>', '<script id="embedded-dict" type="application/json">' + data + '</script>')
full = '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>\n' + page.replace('<div class="app">', '</head><body>\n<div class="app">', 1) + '\n</body></html>'
open('Wortwurzel离线版.html','w').write(full)
print('offline html', len(full.encode())//1024, 'KB')

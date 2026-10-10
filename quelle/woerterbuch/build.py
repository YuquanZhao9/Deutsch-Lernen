import json, glob, sys, os, re
from collections import Counter
ents = []
for p in sorted(glob.glob('parts/[A-D][12].json'))+sorted(glob.glob('parts/[0-9][0-9][0-9].json'))+sorted(glob.glob('parts/X[0-9][0-9].json')):
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
LV = {}
for p in sorted(glob.glob('lv/[0-9][0-9].json')): LV.update(json.load(open(p)))
for e in seen.values():
    if e.get('ipa'): e['ipa'] = e['ipa'].replace('r','ʁ')
    lv = LV.get(e['w'])
    if lv: e['lvl'] = re.sub(r'\s*[-/~—]\s*', '–', lv)
print('levels from lv/:', sum(1 for e in seen.values() if e['w'] in LV))
entries = sorted(seen.values(), key=lambda e: e['w'].replace('sich ','').lower())
dic = {"name": "Wortwurzel 德语词典", "version": __import__("datetime").date.today().strftime("%Y.%m.%d"), "format": "wortwurzel-1", "entries": entries}
json.dump(dic, open('wortwurzel.json','w'), ensure_ascii=False, separators=(',',':'))
print('entries', len(entries)); print(len(probs), 'problems'); print('\n'.join([p for p in probs if not p.startswith('dup')][:40] or probs[:5]))
print(Counter(e.get('pos') for e in entries))
# offline standalone
page = open('index.html').read()
data = json.dumps(dic, ensure_ascii=False, separators=(',',':')).replace('</', '<\\/')
page = page.replace('<script id="embedded-dict" type="application/json">null</script>', '<script id="embedded-dict" type="application/json">' + data + '</script>')
full = '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>\n' + page.replace('<div class="app">', '</head><body>\n<div class="app">', 1) + '\n</body></html>'
open('Wortwurzel离线版.html','w').write(full)
print('offline html', len(full.encode())//1024, 'KB')

# web/: split copy for the artifact (each published file must stay under 16MB)
os.makedirs('web', exist_ok=True)
for f in glob.glob('web/wortwurzel*.json'): os.remove(f)
N = max(1, -(-len(json.dumps(dic, ensure_ascii=False).encode()) // 9_000_000))  # ~9MB per part, well under the 16MB per-file limit
k = -(-len(entries) // N)
parts = []
for i in range(N):
    fn = f'wortwurzel-{i+1}.json'; parts.append(fn)
    json.dump({"entries": entries[i*k:(i+1)*k]}, open('web/' + fn, 'w'), ensure_ascii=False, separators=(',',':'))
json.dump({k2: v for k2, v in dic.items() if k2 != 'entries'} | {"parts": parts, "count": len(entries)}, open('web/wortwurzel.json', 'w'), ensure_ascii=False)
print('web parts', [(p, os.path.getsize('web/' + p) // 1024) for p in parts])

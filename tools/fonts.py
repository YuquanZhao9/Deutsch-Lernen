#!/usr/bin/env python3
"""Download the Google Fonts the pages use into fonts/, so the site does not
depend on fonts.googleapis.com (blocked in mainland China, where a blocked
stylesheet keeps the page blank until the request times out).

Keeps only the latin and latin-ext subsets (German text; Chinese uses system fonts).
Writes fonts/<id>.css and fonts/map.json {google css url: "<id>.css"}; build_site.py
uses the map to point the pages at the local copies. Needs network; run it again
only when a page starts using a different Google Fonts URL.

Run from the repo root:  python3 tools/fonts.py
"""
import hashlib, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
PAGES = ['index.html', 'quelle/taeglich/artifact.html', 'quelle/woerterbuch/index.html']
KEEP = {'latin', 'latin-ext'}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60).read()

urls = sorted({u.replace('&amp;', '&') for p in PAGES
               for u in re.findall(r'https://fonts\.googleapis\.com/css2\?[^"\']+', open(p, encoding='utf-8').read())})
os.makedirs('fonts', exist_ok=True)
mapping = {}
for url in urls:
    css = get(url).decode()
    out = []
    # blocks look like: /* latin */\n@font-face { ... }
    for subset, block in re.findall(r'/\* ([\w-]+) \*/\s*(@font-face\s*\{[^}]*\})', css):
        if subset not in KEEP:
            continue
        def local(m):
            src = m.group(1)
            name = hashlib.sha1(src.encode()).hexdigest()[:12] + '.woff2'
            if not os.path.exists(f'fonts/{name}'):
                open(f'fonts/{name}', 'wb').write(get(src))
            return f'url({name})'
        out.append(f'/* {subset} */\n' + re.sub(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', local, block))
    if not out:
        sys.exit(f'no font blocks found for {url}')
    cid = hashlib.sha1(url.encode()).hexdigest()[:10] + '.css'
    open(f'fonts/{cid}', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    mapping[url] = cid
    print(cid, url)
json.dump(mapping, open('fonts/map.json', 'w', encoding='utf-8'), indent=1)

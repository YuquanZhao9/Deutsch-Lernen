#!/usr/bin/env python3
"""Build the website (GitHub Pages) from the sources in quelle/.

  taeglich/index.html    <- quelle/taeglich/artifact.html (the claude.ai Artifact page) + shim.js
  woerterbuch/index.html <- quelle/woerterbuch/index.html (dictionary page; loads wortwurzel.json)
  taeglich/content/index.json <- list of published days in taeglich/content/

Run from the repo root:  python3 tools/build_site.py
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

HEAD = ('<link rel="manifest" href="../manifest.webmanifest">'
        '<link rel="icon" href="../icon.svg" type="image/svg+xml">'
        '<link rel="apple-touch-icon" href="../apple-touch-icon.png">'
        '<meta name="apple-mobile-web-app-capable" content="yes">'
        '<meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">')

# Texts in the Artifact page that only make sense inside claude.ai
TAEGLICH_REPLACE = [
    ("ok:['ok','已同步 · 手机电脑通用','已同步']", "ok:['ok','进度保存在这台设备上','本机']"),
    ("'正在连接云端…','连接中'", "'正在载入…','载入中'"),
    ("<span id=\"sync-txt\">正在连接云端…</span>", "<span id=\"sync-txt\">正在载入…</span>"),
    ("warn:['warn','云端不可用，仅保存在本次打开','未同步']", "warn:['warn','本机存储不可用，进度只保留在本次打开','未保存']"),
    ("出好后这里会自动更新。", "出好后刷新一下这个页面就能看到。"),
    ("S.err.grade = '无法批改简答题：Claude 不可用。'", "S.err.grade = '网页版不能自动批改简答题，请对照下面的参考答案自己检查。'"),
    ("<div style=\"margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center\"><button class=\"btn primary\" data-act=\"retry-words\">现在就在页面里生成</button><span style=\"font-size:13px\">会用你自己的 Claude 额度</span></div>",
     "<div style=\"margin-top:12px\"><button class=\"btn\" onclick=\"location.reload()\">刷新看看</button></div>"),
    ("Claude 会按你的水平提前出好当天的 30 个单词（含词意、用法、词根、词源）和一篇阅读，打开页面就能直接开始。如果打开时还没出好，可以点“现在就在页面里生成”。",
     "Claude 会提前出好当天的 30 个单词（含词意、用法、词根、词源）和一篇阅读，发布到这个网站，打开页面就能直接开始。如果打开时还没出好，稍后刷新即可。"),
    ("'题目、进度、打卡记录和生词本都保存在云端。手机和电脑打开同一个链接、登录同一个 claude.ai 账号即可同步；切回这个页面时会自动拉取最新内容。'",
     "'这是网页版：每天的题目从网站读取，你的进度、打卡记录和生词本保存在这台设备的浏览器里，手机和电脑各自记录，不互相同步。需要跨设备同步时，请用 claude.ai 上的版本。'"),
    ("简答题的批改，以及在页面里手动生成题目时，用的是你自己的 Claude 额度，第一次使用时页面会请求允许。",
     "网页版不调用 Claude：选择题自动判分，简答题显示参考答案供你自查。"),
]

def must_replace(s, old, new, name):
    if old not in s:
        print(f'WARNING {name}: text not found, skipped: {old[:70]}…', file=sys.stderr)
        return s
    return s.replace(old, new)

def build_taeglich():
    s = open('quelle/taeglich/artifact.html', encoding='utf-8').read()
    for old, new in TAEGLICH_REPLACE:
        s = must_replace(s, old, new, 'taeglich')
    # hide the "re-generate today with another level" controls: they need Claude
    s = re.sub(r'(<button class="btn" data-act="ask-regen">)', r'<button class="btn" data-act="ask-regen" hidden>', s)
    s = s.replace('<html>', '<html lang="zh-CN">', 1)
    s = must_replace(s, '<body>', '<body>\n' + HEAD + '<meta name="theme-color" content="#f2c200">\n<script src="shim.js"></script>', 'taeglich')
    os.makedirs('taeglich/content', exist_ok=True)
    open('taeglich/index.html', 'w', encoding='utf-8').write(s)
    shutil.copy('tools/shim.js', 'taeglich/shim.js')

def build_index():
    days = sorted(f[:-5] for f in os.listdir('taeglich/content') if re.fullmatch(r'\d{4}-\d{2}-\d{2}\.json', f))
    seen = []
    for d in days:
        c = json.load(open(f'taeglich/content/{d}.json', encoding='utf-8'))
        seen += c.get('lemmas') or []
    json.dump({'dates': days, 'seen': list(dict.fromkeys(seen))}, open('taeglich/content/index.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print('published days:', ', '.join(days) or '(none)')

def build_woerterbuch():
    page = open('quelle/woerterbuch/index.html', encoding='utf-8').read()
    full = ('<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + HEAD +
            '\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>\n'
            + page.replace('<div class="app">', '</head><body>\n<div class="app">', 1) + '\n</body></html>')
    open('woerterbuch/index.html', 'w', encoding='utf-8').write(full)

build_taeglich()
build_index()
build_woerterbuch()
print('ok')

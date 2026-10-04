# Deutsch lernen

网页版：https://yuquanzhao9.github.io/Deutsch-Lernen/ （手机用 Safari 打开，点分享 → 添加到主屏幕）

- **Deutsch täglich**（`taeglich/`）：每天 30 个词（释义、用法、词根、词源）+ 一篇阅读和 5 道德语题，打卡日历，生词本。
- **Wortwurzel**（`woerterbuch/`）：德汉词典（14162 词），可输德语或中文，打开过一次后可离线使用。`Wortwurzel离线版.html` 下载后直接打开也能用。

## 网页版和 claude.ai 版的区别

每日学习页原本是 claude.ai 上的 Artifact（https://claude.ai/artifact/Q59g6KiDtPyirydA3PfDTo），那里的进度在手机和电脑间同步，简答题由 Claude 批改。网页版：

- 每天的题目从 `taeglich/content/<日期>.json` 读取，由每日任务出好后发布到这里。
- 进度、打卡记录和生词本保存在当前设备的浏览器里，不跨设备同步。
- 选择题自动判分；简答题显示参考答案供自查，不自动批改。

## 目录

- `index.html`、`manifest.webmanifest`、图标：网站首页
- `taeglich/`：每日学习页（由构建脚本生成）和每日内容
- `woerterbuch/`：词典页（由构建脚本生成）、词库 `wortwurzel.json`、离线版
- `quelle/taeglich/artifact.html`：每日学习页的 claude.ai 原版源码；`Deutsch-taeglich.bat` 是打开 claude.ai 版的 Windows 启动器
- `quelle/woerterbuch/`：词典源文件（SCHEMA.md、页面模板、build.py、分批词条 parts/）
- `tools/build_site.py`：从 `quelle/` 生成网页；`tools/shim.js`：让原版页面脱离 claude.ai 运行的本地存储层

更新网页：改 `quelle/` 里的源文件后运行 `python3 tools/build_site.py`，提交推送即可。

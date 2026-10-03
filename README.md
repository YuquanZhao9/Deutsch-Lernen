# 德语学习（Deutsch lernen）

Yuquan 的德语学习项目，水平 B2–C1。包含两个网页工具：

## 1. Deutsch täglich：每日德语
- 在线版：https://claude.ai/artifact/Q59g6KiDtPyirydA3PfDTo
- 每天 30 个词（释义、用法、词根、词源），一篇德语阅读加 5 道德语题，打卡日历和生词本。
- 内容由每天凌晨（北京时间 2:23）运行的定时任务预先生成，存在网页自带的云端数据库里，手机和电脑同步。
- `deutsch-taeglich/index.html`：网页源代码（依赖 claude.ai 的 db / user / sample 能力，单独打开不能使用云端功能）。
- `deutsch-taeglich/Deutsch-taeglich.bat`：Windows 启动器，用 Edge 独立窗口打开在线版，首次运行会在桌面建快捷方式。

## 2. Wortwurzel：德汉词典
- 在线版：https://claude.ai/artifact/Fkmyc6Kp1nx7QRgFyZ54RM （手机全屏）
- `wortwurzel/wortwurzel.json`：词库本身。
- `wortwurzel/Wortwurzel离线版.html`：词库已内嵌，下载后用浏览器打开即可离线查词。
- `wortwurzel/源文件/`：SCHEMA.md（词条格式和准确性规则）、index.html（页面模板）、build.py（合并 parts/*.json 并生成上面两个文件）、lists.txt（已收录词表）、parts/（分批词条）。

重新生成词典：`cd wortwurzel/源文件 && python3 build.py`

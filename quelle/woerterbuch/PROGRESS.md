Expansion to 10000 words (user asked 2026-10-03 16:20). Rolling agents, ~15 concurrent, each: "Read AGENT.md, ID=NNN". next.txt = next batch ID to launch (000-199 total).
Reserve batches 200-219 exist (cands2[12000:13200]); run them only if total after 000-199 is < 10000.
Done-check: ls parts/[0-9]*.json | wc -l. Build: python3 build.py; then copy outputs to /mnt/project-files/德语词典/ and republish page.html (cp index.html page.html) with files wortwurzel.json.
JSON will be ~14MB -> may need sharding (16MB file limit) and IndexedDB cache (done in index.html).
When fully done: send_message to upload thread session cse_01MF6dx24diNXdNx75UWJzMA with final file paths (coordinator asked).

2026-10-04 00:20 UTC: user asked (cmsg_01FG35ZLhWUaSCWukQturg1rQCtRQ7T93VBr6ooEGDZU9R) to stop after batch 120 and wait for their reply. Agents died ~19:58 UTC (session pause). Relaunched 112–120 in resume mode. Do NOT launch 121+ until the user says so. tmp/ holds partial chunks for 121–129 from the dead run; reuse them (resume-mode prompt) when continuing.

2026-10-04 06:03 UTC: user said "做到150" (cmsg_01FG35ZLhWUaSCWukQturg1rDgEtjftMfRerFwWUYKv2ME). Running 121–135 (121–129 resume mode). Launch up to 150 only, then rebuild/publish and wait for user. stop.txt holds the limit.

2026-10-04 06:30 UTC: user said 做到180. Launched 151–165; roll to 180 then rebuild/publish and wait.

2026-10-10 15:33 UTC: user said 扩充词汇到20000 (cmsg_01FG35ZLhWUaSCWukQturg1r1DwQaL3WtS2fko7ciqHzUe). From 14162: 281 (resume, tmp/281_1.json), queue 282–409 (320+k = cands2[18660+k*60:+60]). ~51 entries/batch → ~115 batches. Stop launching once build count >= 20000. Full JSON will be ~23MB: under Cloudflare's 25MiB/file, web split into 3 parts.

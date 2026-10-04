# Task: re-estimate CEFR levels for one chunk of dictionary headwords

Do NOT call any mcp__hearthbot__ tools. Do not install anything.

Input: lv/<ID>.txt — one headword per line: `headword<TAB>pos<TAB>current level<TAB>first Chinese gloss`.
Output: lv/<ID>.json — ONE strict JSON object mapping every headword (exactly as given) to its level.

Rules:
- Levels follow the Goethe-Institut / Profile Deutsch scale A1, A2, B1, B2, C1, C2 (the level at which a learner is expected to know the word).
- When a word sits between two levels (e.g. it appears in the A2 word list but is already common at A1, or is borderline B2/C1), give the range with an en dash: "A1–A2", "B2–C1". Only adjacent levels in a range. Use a single level when you are fairly sure.
- Judge by the word's most common meaning. Very basic words (der, und, sein, Haus, gut, essen, danke) are A1. Specialised, literary or rare words are C1/C2.
- The current level is only a rough first guess; correct it where it is off.
- Cover every line; do not skip any headword.
- Validate: python3 -c "import json;d=json.load(open('lv/<ID>.json'));print(len(d))" must equal the line count of lv/<ID>.txt.
- Final reply: ONE line only: "<ID>: <n> levels".

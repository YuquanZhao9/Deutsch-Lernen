# Task: write one batch of German–Chinese dictionary entries

You write entries for a German–Chinese learner's dictionary (user: native Chinese, level B2–C1). Do NOT call any mcp__hearthbot__ tools. Do not install anything.

1. Read the schema and accuracy rules in SCHEMA.md (same folder as this file). Follow them exactly. Output is strict JSON, no comments.
2. Your word list is batches/<ID>.txt (comma-separated, frequency-ordered, auto-extracted from a corpus so it contains noise). For each item:
   - Proper names (people, places, brands, teams), English words, abbreviations, interjections like "hahaha": SKIP. But everyday words are wanted even when very simple: greetings and courtesy words (bitte, danke, hallo, tschüss), numbers, colours, food, body parts etc. always get full entries — this is a general dictionary, not only for hard words.
   - Wrong lemma from the extractor (e.g. "Fachleut" → Fachmann/Fachleute, "scheiben" → Scheibe, "höhlen" → Höhle/aushöhlen, a participle like "geprägt" when it is not an established adjective) → write the entry under the correct dictionary headword instead. Established participial adjectives (e.g. "gewandt", "verdichtet" only if lexicalised) may stay.
   - Swiss spelling (naturgemäss) → standard spelling (naturgemäß).
   - Function words (articles, pronouns, prepositions, conjunctions, modal particles) get full entries too: explain cases governed, word order, declension table in "use" (compact), and nuances.
3. Depth: keep the full schema for every entry, but be economical: 1–3 senses (more only for truly polysemous core words), 1 example per sense (2 for the main sense of core words), 2–4 "use" lines. For transparent compounds (Kaufhaus, Krankenwagen) the "ety" may be one short line pointing to the components' origin.
4. "lvl": estimate A1/A2/B1/B2/C1/C2 (Goethe/Profile Deutsch). If a word sits between two levels, give the range with an en dash, e.g. "A1–A2" or "B2–C1".
5. Write chunks to tmp/<ID>_*.json while working; the final result is ONE strict JSON array at parts/<ID>.json. Validate: python3 -c "import json;print(len(json.load(open('parts/<ID>.json'))))"
6. Self-review every entry once for factual errors (gender, plural, genitive, principal parts, haben/sein, separable, IPA stress with ʁ for r, etymology). Accuracy over completeness: hedge (一说/一般认为) or drop any etymological claim you are not sure of; never invent reconstructed roots.
7. Delete your tmp/<ID>_* files. Your final reply must be ONE line only: "<ID>: <n> entries, <k> skipped".

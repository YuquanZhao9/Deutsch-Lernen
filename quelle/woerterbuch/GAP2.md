# Task: second, fuller check for basic German words the dictionary is missing

Do NOT call any mcp__hearthbot__ tools. Do not install anything.

A first check (about 1200 words) produced gap.txt. Now be thorough, aiming at the full Goethe-Zertifikat A1, A2 and B1 word lists (about 2400 headwords together), plus very common everyday words an A2–B1 learner meets that are not on those lists.

1. Work topic by topic and write about 2600 headwords (lemmas only: nouns without article, verbs in the infinitive, reflexive verbs without "sich"). Topics: personal details and forms; family and relationships; home, furniture, household, cleaning; food, cooking, restaurant; shopping, money, bank, post; clothes; body, health, doctor, pharmacy; town, directions, buildings; transport, car, travel, hotel, holidays; school, studies, courses; work, office, job application; communication, phone, internet, media; leisure, sport, hobbies, music, culture; nature, weather, environment, animals, plants; time, dates, frequency; feelings and character; quantities, measures, shapes, colours; politics and society (B1 level); and every common verb, adjective, adverb, preposition, conjunction, pronoun, question word and particle.
2. Load wortwurzel.json (same folder). A word is present if its lowercase form equals an entry's lowercase "w", or "w" with a leading "sich " removed.
3. Also treat as present anything listed in gap.txt or in batches/181.txt … batches/199.txt and batches/220.txt … batches/222.txt (comma-separated).
4. Write the remaining missing words, one per line, deduplicated case-insensitively, most basic first, to gap2.txt. Leave out proper names, abbreviations and pure inflected forms.
5. Your final reply must be one line only: "gap2: <n> missing (checked <m>)".

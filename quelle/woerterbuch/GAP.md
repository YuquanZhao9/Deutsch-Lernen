# Task: list basic German words the dictionary is missing

Do NOT call any mcp__hearthbot__ tools. Do not install anything.

1. From your knowledge of the Goethe-Institut / Profile Deutsch word lists for A1, A2 and B1, write down about 1200 common headwords (lemmas only, nouns without article, verbs in the infinitive). Cover everyday areas: greetings and courtesy, numbers and ordinals, time and calendar, family, body and health, food and drink, home and furniture, clothes, town, transport and travel, shopping and money, school and work, weather and nature, animals, colours, feelings, hobbies and sport, common verbs, adjectives, adverbs, prepositions, conjunctions, pronouns, question words, particles.
2. Load wortwurzel.json (same folder). A word is present if its lowercase form equals an entry's lowercase "w", or "w" with a leading "sich " removed.
3. Write the missing words, one per line, deduplicated, most basic first, to gap.txt. Leave out proper names and abbreviations.
4. Your final reply must be one line only: "gap: <n> missing".

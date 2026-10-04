# 词条格式（每个词条一个 JSON 对象，整批写成一个 JSON 数组）

{
  "w": "Auseinandersetzung",          // 词头。动词不定式；反身动词写成 "sich auseinandersetzen"；名词不带冠词
  "pos": "n",                          // n 名词 / v 动词 / adj 形容词 / adv 副词 / konj 连词 / präp 介词 / part 小品词
  "gen": "f",                          // 仅名词：m / f / n / pl（只有复数）
  "pl": "Auseinandersetzungen",        // 仅名词：完整复数形式；无复数写 "—"
  "gs": "der Auseinandersetzung",      // 仅名词：单数第二格（带冠词）
  "ipa": "aʊ̯sʔaɪ̯ˈnandɐˌzɛt͡sʊŋ",        // IPA，按 Duden 标准音，标重音
  "lvl": "C1",                         // A1…C2（按 Goethe/Profile Deutsch 大致归类）；介于两级之间时写成范围，如 "A1–A2"（用 en dash –）
  "forms": "setzt sich auseinander · setzte sich auseinander · hat sich auseinandergesetzt",
                                       // 动词：第三人称单数现在时 · 过去时 · 完成时（haben/sein 要对）；强变化/不规则必须准确
                                       // 形容词：比较级 · 最高级（不能比较的写 "—"）；名词/其他：省略此字段
  "sep": true,                         // 仅动词：是否可分（可分写 true，不可分写 false）
  "senses": [                          // 义项，按常用度排序，1–4 个
    {
      "zh": "争论，争执；（与问题的）深入探讨",   // 中文释义，准确、地道，分号分隔近义
      "de": "Streit, Konflikt; intensive Beschäftigung mit etw.",   // 简短德语释义
      "ex": [                          // 1–2 个例句，B2–C1 水平，自然、真实语境（新闻/职场/学术）
        {"de": "Die Auseinandersetzung mit der eigenen Geschichte ist schmerzhaft.", "zh": "直面自身的历史是痛苦的。"}
      ]
    }
  ],
  "use": [                             // 用法：支配的格、固定介词搭配、句型、常见搭配；每条一行，德语+中文
    "sich mit etw.(D) auseinandersetzen — 深入研究/探讨某事",
    "eine heftige / politische Auseinandersetzung — 激烈的/政治上的争论"
  ],
  "root": "aus·einander·setz·ung：auseinander（分开）+ setzen（放置）+ -ung（名词化后缀）→“把（观点）分开摆出来” → 争论、剖析",
                                       // 构词拆解：前缀/词根/后缀各自含义，以及由此推出的词义逻辑
  "fam": ["auseinandersetzen", "Satz", "Gesetz", "Besetzung"],   // 同族词 2–5 个
  "ety": "setzen < 中古高地德语 setzen < 古高地德语 sezzen < 原始日耳曼语 *satjaną（使坐下，setzen 是 sitzen 的使役动词）。",
                                       // 词源：沿历史阶段追溯（古高地德语 ahd./中古高地德语 mhd./原始日耳曼语/原始印欧语 或 拉丁语/法语借词等）
  "cog": "英 set, sit；荷 zetten",     // 同源词（英语优先）；借词写出其来源词，如 拉 conditio
  "tip": "与 Diskussion 不同，Auseinandersetzung 常带冲突色彩；德语母语者中高频，“eine Auseinandersetzung führen”。"
                                       // 易错点/辨析/中国学习者常见错误，可省略
}

## 准确性要求（最重要）
- 用户之所以要这个词典，是因为“德语助手”APP 里很多词条有错误。准确性第一，宁缺毋滥。
- 名词词性、复数、第二格，动词三种形式和完成时助动词，必须准确无误。
- IPA 按 Duden 标准。
- 词源：只写你确定的历史阶段与形式。不确定的环节不要编造；可写“词源不详”或只写到你确定的那一层，并在不确定处注明“（一说……）”。不要编造原始印欧语词根。
- 借词（拉丁/法语/希腊）要写清借入途径。
- 例句要地道，不要中式德语；中文译文要通顺自然。
- 所有中文用简体。

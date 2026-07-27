# Third-Party Notices

## Oxford Chinese Dictionary

Lexical facts in `public/data/lexicon/words.json` are extracted locally from the macOS dictionary bundle `com.apple.dictionary.zh_CN-en.OCD` (version 1.1), displayed as 《牛津英汉汉英词典》 / Oxford Chinese Dictionary.

- Copyright: Copyright © 2010, 2025 Oxford University Press and Foreign Language Teaching and Research Publishing Co., Ltd. All rights reserved.
- Extraction interface: macOS DictionaryServices exact-record XML

Each generated sense retains its Oxford record and sense identifiers. The source dictionary bundle itself is not vendored in this repository.

## Official Exam Membership Sources

High-school membership comes from the Ministry of Education's 《普通高中英语课程标准（2017年版2020年修订）》, notice `教材〔2020〕3号`. CET membership comes from 《全国大学英语四、六级考试大纲（2016年修订版）》 published by the National Education Examinations Authority. The source PDFs are not vendored; generated source-location metadata and hashes are stored under `scripts/data/official-membership/`.

## ECDICT Membership/Order Bridge

The pinned ECDICT version is used only to preserve the historical IELTS/TOEFL curated membership and journey order where words overlap:

- Repository: https://github.com/skywind3000/ECDICT
- Commit: `82c9872576b23118d7c42e920c11beb77f510ae2`
- Source date: 2025-01-02
- License: MIT
- Copyright: Copyright (c) 2025 Linwei

The complete license text is distributed at `public/data/exam-banks/LICENSE-ECDICT.txt`.

No ECDICT pronunciation, part of speech, definition, translation, or example is used as lexical authority in schema v3. Word Quest does not claim that IELTS or TOEFL publish an official exhaustive vocabulary list.

## fast-xml-parser

Oxford DictionaryServices XML is parsed with fast-xml-parser:

- Repository: https://github.com/NaturalIntelligence/fast-xml-parser
- License: MIT

## pdfplumber

Official exam PDF coordinates are extracted at build time with pdfplumber:

- Repository: https://github.com/jsvine/pdfplumber
- License: MIT

## canvas-confetti

Achievement celebrations use canvas-confetti:

- Repository: https://github.com/catdad/canvas-confetti
- License: ISC
- Copyright: Copyright (c) 2020, Kiril Vatev

The library is loaded only when an achievement is unlocked and respects the user's reduced-motion preference.

## en-inflectors and en-stemmer

Local word-coach validation uses en-inflectors and its en-stemmer dependency to recognize English noun, verb, and adjective inflections without guessing tense from suffix regular expressions:

- en-inflectors: https://github.com/finnlp/en-inflectors
- en-stemmer: https://github.com/finnlp/en-stemmer
- License: MIT
- Copyright: Copyright (c) Alex Corvi
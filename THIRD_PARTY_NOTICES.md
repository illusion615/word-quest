# Third-Party Notices

## ECDICT

The generated exam vocabulary files in `public/data/exam-banks/` are derived from ECDICT:

- Repository: https://github.com/skywind3000/ECDICT
- Commit: `82c9872576b23118d7c42e920c11beb77f510ae2`
- Source date: 2025-01-02
- License: MIT
- Copyright: Copyright (c) 2025 Linwei

The complete license text is distributed at `public/data/exam-banks/LICENSE-ECDICT.txt`.

WordBuddy filters ECDICT exam tags, normalizes display fields, combines CET-4 and CET-6 tags for the cumulative CET-6 bank, and sorts entries by available corpus frequency. It also removes spurious denominal verb glosses that ECDICT occasionally appends to noun/adjective entries (for example the bogus `vt. 保护, 防护` on `safety`), validated against WordNet part-of-speech membership (see below). WordBuddy does not claim that IELTS or TOEFL publish an official exhaustive vocabulary list.

## WordNet

The part-of-speech classifier in `scripts/data/wordnet-pos.json` is derived from Princeton WordNet 3.0 and is used at build time to decide whether a Chinese verb sense is legitimate for a given word:

- Project: https://wordnet.princeton.edu/
- Version: WordNet 3.0
- License: WordNet License (BSD-style; free to use with attribution)

Only a small derived lemma→POS table is committed; the raw WordNet database is not vendored. Princeton University makes no warranties regarding WordNet and is not liable for its use.

## canvas-confetti

Achievement celebrations use canvas-confetti:

- Repository: https://github.com/catdad/canvas-confetti
- License: ISC
- Copyright: Copyright (c) 2020, Kiril Vatev

The library is loaded only when an achievement is unlocked and respects the user's reduced-motion preference.
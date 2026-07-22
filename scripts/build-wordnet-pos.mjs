// Generate a compact WordNet POS classifier for every word that appears in the
// exam banks. Output maps each known lemma to "v" (WordNet has it as a verb) or
// "n" (WordNet knows it, but NOT as a verb). Lemmas WordNet does not know at all
// are omitted (callers must treat "absent" as "unknown → do not judge").
//
// This derived table is the authoritative validator used by build-exam-banks.mjs
// to strip spurious denominal verb glosses from ECDICT Chinese definitions
// (e.g. "safety … ；vt. 保护, 防护"). WordNet raw files are NOT vendored; only
// this small derived artifact is committed for reproducible builds.
//
// Usage: node scripts/build-wordnet-pos.mjs [/path/to/wordnet/dict]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wnDir = resolve(process.argv[2] ?? '/tmp/dict');
const banksDir = resolve(projectRoot, 'public/data/exam-banks');
const bankFiles = ['gaokao.json', 'cet4.json', 'cet6.json', 'ielts.json', 'toefl.json'];
const outputPath = resolve(projectRoot, 'scripts/data/wordnet-pos.json');

function lemmasFrom(text) {
  const set = new Set();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith(' ')) continue; // skip DB copyright header lines
    const lemma = line.split(' ', 1)[0];
    if (lemma) set.add(lemma);
  }
  return set;
}

const verbLemmas = lemmasFrom(await readFile(resolve(wnDir, 'index.verb'), 'utf8'));
const knownLemmas = new Set(verbLemmas);
for (const file of ['index.noun', 'index.adj', 'index.adv']) {
  for (const lemma of lemmasFrom(await readFile(resolve(wnDir, file), 'utf8'))) knownLemmas.add(lemma);
}

const bankWords = new Set();
for (const file of bankFiles) {
  const entries = JSON.parse(await readFile(resolve(banksDir, file), 'utf8'));
  for (const entry of entries) bankWords.add(String(entry.word).trim());
}

function wnKey(word) {
  return word.trim().toLowerCase().replace(/\s+/g, '_');
}

const table = {};
for (const word of bankWords) {
  const key = wnKey(word);
  if (verbLemmas.has(key)) table[key] = 'v';
  else if (knownLemmas.has(key)) table[key] = 'n';
}

const sorted = Object.fromEntries(Object.keys(table).sort().map((k) => [k, table[k]]));
const payload = {
  source: 'WordNet 3.0 (Princeton)',
  license: 'WordNet License (BSD-like)',
  generated: new Date().toISOString().slice(0, 10),
  note: 'v = WordNet lists this lemma as a verb; n = known lemma but not a verb; absent = unknown to WordNet.',
  pos: sorted,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 0)}\n`, 'utf8');

const counts = Object.values(sorted).reduce((acc, v) => ((acc[v] = (acc[v] ?? 0) + 1), acc), {});
console.log(`Wrote ${Object.keys(sorted).length} classified lemmas to scripts/data/wordnet-pos.json (verb=${counts.v ?? 0}, known-non-verb=${counts.n ?? 0}); ${bankWords.size - Object.keys(sorted).length} bank words unknown to WordNet.`);

import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';

const SOURCE_COMMIT = '82c9872576b23118d7c42e920c11beb77f510ae2';
const SOURCE_DATE = '2025-01-02';
const sourcePath = process.argv[2];

if (!sourcePath) {
  console.error('Usage: npm run data:build -- /absolute/path/to/ecdict.csv');
  process.exit(1);
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, 'public/data/exam-banks');
const metadataPath = resolve(projectRoot, 'src/data/exam-bank-metadata.generated.ts');

// Authoritative WordNet POS classifier for exam vocabulary (see
// scripts/build-wordnet-pos.mjs). Used to strip spurious denominal verb glosses
// that ECDICT occasionally appends to noun/adjective entries — e.g.
// "safety … ；vt. 保护, 防护" (the verb sense actually belongs to "safeguard").
const wordNetPos = JSON.parse(
  await readFile(resolve(projectRoot, 'scripts/data/wordnet-pos.json'), 'utf8'),
).pos;

const SPURIOUS_VERB_TAG = /^(vt|vi|v)\.\s*/i;
// A segment that opens a new part-of-speech sense (POS label or [domain] tag).
// ECDICT sometimes puts each gloss word of one sense on its own line, which
// normalizeText joins with '；'; those continuation segments carry no head tag.
const SENSE_HEAD = /^(?:adj|adv|aux|abbr|art|conj|int|num|prep|pron|vt|vi|v|ad|a|n)\.\s|^\[[^\]]+\]/i;

function wordNetKey(word) {
  return String(word).trim().toLowerCase().replace(/\s+/g, '_');
}

// Drop verb (vt./vi./v.) senses from a word that WordNet knows but NOT as a
// verb. Segments are grouped into sense-groups (a tagged head plus its untagged
// continuation glosses) so a group is only removed as a whole — never orphaning
// the trailing glosses of a single verb sense. Modal auxiliaries (aux.) and
// every other part of speech are left untouched, and the original string is
// preserved whenever filtering would add no value or remove everything.
function filterSpuriousVerbSenses(definitionZh, word) {
  if (!definitionZh || wordNetPos[wordNetKey(word)] !== 'n') return definitionZh;
  const groups = [];
  for (const segment of definitionZh.split('；')) {
    if (groups.length === 0 || SENSE_HEAD.test(segment.trim())) groups.push([segment]);
    else groups[groups.length - 1].push(segment);
  }
  const kept = groups.filter((group) => !SPURIOUS_VERB_TAG.test(group[0].trim()));
  if (kept.length === 0 || kept.length === groups.length) return definitionZh;
  return kept.flat().join('；');
}

const definitions = [
  {
    id: 'gaokao',
    name: '高考词汇',
    file: 'gaokao.json',
    minimumCount: 2500,
    membership: (tags) => tags.has('gk'),
    basis: 'ECDICT 高考大纲标签汇编',
    status: 'syllabus-indexed',
  },
  {
    id: 'cet4',
    name: 'CET-4',
    file: 'cet4.json',
    minimumCount: 2000,
    membership: (tags) => tags.has('cet4'),
    basis: 'ECDICT CET-4 大纲标签汇编',
    status: 'syllabus-indexed',
  },
  {
    id: 'cet6',
    name: 'CET-6',
    file: 'cet6.json',
    minimumCount: 4000,
    membership: (tags) => tags.has('cet4') || tags.has('cet6'),
    basis: 'ECDICT CET-4 基础与 CET-6 增量合集',
    status: 'syllabus-indexed',
  },
  {
    id: 'ielts',
    name: 'IELTS',
    file: 'ielts.json',
    minimumCount: 2500,
    membership: (tags) => tags.has('ielts'),
    basis: 'ECDICT IELTS 备考标签汇编',
    status: 'curated',
  },
  {
    id: 'toefl',
    name: 'TOEFL',
    file: 'toefl.json',
    minimumCount: 3000,
    membership: (tags) => tags.has('toefl'),
    basis: 'ECDICT TOEFL 备考标签汇编',
    status: 'curated',
  },
];

const entriesByBank = new Map(definitions.map((definition) => [definition.id, new Map()]));

function normalizeText(value) {
  return String(value ?? '')
    .split(/\\n|\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('[网络]'))
    .join('；')
    .replace(/\s+/g, ' ')
    .trim();
}

const partOfSpeechNames = {
  a: 'adjective',
  c: 'conjunction',
  d: 'determiner',
  i: 'preposition',
  j: 'adjective',
  m: 'number',
  n: 'noun',
  p: 'pronoun',
  r: 'adverb',
  t: 'infinitive marker',
  u: 'interjection',
  v: 'verb',
  vi: 'verb',
  vt: 'verb',
  aux: 'verb',
};

function derivePartOfSpeech(pos, translation) {
  const candidates = String(pos ?? '')
    .split('/')
    .map((item) => {
      const [name, weight] = item.split(':');
      return { name, weight: Number(weight) || 0 };
    })
    .filter((item) => item.name);
  candidates.sort((left, right) => right.weight - left.weight);
  const fromCorpus = partOfSpeechNames[candidates[0]?.name];
  if (fromCorpus) return fromCorpus;

  const prefix = String(translation ?? '').match(/^(adj|adv|aux|conj|int|n|num|prep|pron|vi|vt|v)\./i)?.[1]?.toLowerCase();
  return prefix ? (partOfSpeechNames[prefix] ?? prefix) : '';
}

function rank(row) {
  const contemporary = Number(row.frq);
  if (Number.isFinite(contemporary) && contemporary > 0) return contemporary;
  const historical = Number(row.bnc);
  if (Number.isFinite(historical) && historical > 0) return 1_000_000 + historical;
  return Number.MAX_SAFE_INTEGER;
}

const parser = createReadStream(resolve(sourcePath)).pipe(parse({
  bom: true,
  columns: true,
  relax_column_count: true,
  relax_quotes: true,
  skip_empty_lines: true,
}));

for await (const row of parser) {
  const word = String(row.word ?? '').trim();
  if (!word) continue;
  const tags = new Set(String(row.tag ?? '').split(/\s+/).filter(Boolean));
  const matchedBanks = definitions.filter((definition) => definition.membership(tags));
  if (matchedBanks.length === 0) continue;

  const definitionZh = filterSpuriousVerbSenses(normalizeText(row.translation), word);
  const entry = {
    id: word.toLocaleLowerCase('en-US'),
    word,
    phonetic: row.phonetic ? `/${String(row.phonetic).trim()}/` : '',
    partOfSpeech: derivePartOfSpeech(row.pos, definitionZh),
    definition: normalizeText(row.definition),
    definitionZh,
    sourceTags: [...tags].sort(),
    sourceRank: rank(row),
  };

  for (const bank of matchedBanks) {
    entriesByBank.get(bank.id).set(entry.id, { ...entry, banks: [bank.id] });
  }
}

await mkdir(outputDirectory, { recursive: true });

const manifestBanks = [];
for (const definition of definitions) {
  const entries = [...entriesByBank.get(definition.id).values()]
    .sort((left, right) => left.sourceRank - right.sourceRank || left.word.localeCompare(right.word, 'en'))
    .map(({ sourceRank, ...entry }) => entry);

  if (entries.length < definition.minimumCount) {
    throw new Error(`${definition.id} only produced ${entries.length} entries; expected at least ${definition.minimumCount}`);
  }

  const outputPath = resolve(outputDirectory, definition.file);
  await writeFile(outputPath, JSON.stringify(entries), 'utf8');
  const missingEnglish = entries.filter((entry) => !entry.definition).length;
  const missingChinese = entries.filter((entry) => !entry.definitionZh).length;
  manifestBanks.push({
    id: definition.id,
    name: definition.name,
    file: definition.file,
    count: entries.length,
    basis: definition.basis,
    status: definition.status,
    missingEnglish,
    missingChinese,
  });
}

const manifest = {
  schemaVersion: 1,
  source: {
    name: 'ECDICT',
    repository: 'https://github.com/skywind3000/ECDICT',
    license: 'MIT',
    commit: SOURCE_COMMIT,
    date: SOURCE_DATE,
  },
  banks: manifestBanks,
};

const bankOrder = definitions.map((definition) => definition.id);
const memberships = {};
definitions.forEach((definition, position) => {
  for (const wordId of entriesByBank.get(definition.id).keys()) {
    memberships[wordId] = (memberships[wordId] ?? 0) | (1 << position);
  }
});
const coverageIndex = {
  schemaVersion: 1,
  bankOrder,
  bankCounts: Object.fromEntries(manifestBanks.map((bank) => [bank.id, bank.count])),
  memberships: Object.fromEntries(
    Object.entries(memberships).sort(([left], [right]) => left.localeCompare(right, 'en')),
  ),
};

await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDirectory, 'coverage-index.json'), JSON.stringify(coverageIndex), 'utf8');
await writeFile(metadataPath, [
  '// Generated by scripts/build-exam-banks.mjs. Do not edit manually.',
  `export const EXAM_BANK_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;`,
  '',
].join('\n'), 'utf8');

console.table(manifestBanks.map(({ id, count, missingEnglish, missingChinese }) => ({
  id,
  count,
  missingEnglish,
  missingChinese,
})));
console.log(`Coverage index: ${Object.keys(memberships).length} unique words across ${bankOrder.length} banks.`);
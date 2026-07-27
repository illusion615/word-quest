import { createReadStream } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse } from 'csv-parse';

const sourcePath = process.argv[2];
const outputPath = resolve(process.argv[3] ?? 'scripts/data/legacy-membership-order.json');
if (!sourcePath) {
  throw new Error('Usage: node scripts/extract-legacy-membership-order.mjs /path/to/ecdict.csv');
}

const SOURCE_COMMIT = '82c9872576b23118d7c42e920c11beb77f510ae2';
const definitions = [
  { id: 'gaokao', membership: (tags) => tags.has('gk'), expected: 3677 },
  { id: 'cet4', membership: (tags) => tags.has('cet4'), expected: 3849 },
  { id: 'cet6', membership: (tags) => tags.has('cet4') || tags.has('cet6'), expected: 5805 },
  { id: 'ielts', membership: (tags) => tags.has('ielts'), expected: 5040 },
  { id: 'toefl', membership: (tags) => tags.has('toefl'), expected: 6974 },
];

function rank(row) {
  const contemporary = Number(row.frq);
  if (Number.isFinite(contemporary) && contemporary > 0) return contemporary;
  const historical = Number(row.bnc);
  if (Number.isFinite(historical) && historical > 0) return 1_000_000 + historical;
  return Number.MAX_SAFE_INTEGER;
}

const entriesByBank = new Map(definitions.map((definition) => [definition.id, new Map()]));
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
  const item = { id: word.toLocaleLowerCase('en-US'), word, sourceRank: rank(row) };
  for (const definition of definitions) {
    if (definition.membership(tags)) entriesByBank.get(definition.id).set(item.id, item);
  }
}

const banks = {};
for (const definition of definitions) {
  banks[definition.id] = [...entriesByBank.get(definition.id).values()]
    .sort((left, right) => (
      left.sourceRank - right.sourceRank || left.word.localeCompare(right.word, 'en')
    ))
    .map(({ sourceRank: _sourceRank, ...item }) => item);
  if (banks[definition.id].length !== definition.expected) {
    throw new Error(
      `${definition.id} produced ${banks[definition.id].length}; expected ${definition.expected}`,
    );
  }
}

const output = {
  schemaVersion: 1,
  source: {
    name: 'ECDICT',
    repository: 'https://github.com/skywind3000/ECDICT',
    commit: SOURCE_COMMIT,
    purpose: 'Legacy membership and journey-order bridge only',
    lexicalAuthority: false,
  },
  banks,
};
await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.table(Object.fromEntries(Object.entries(banks).map(([bankId, entries]) => [
  bankId,
  entries.length,
])));
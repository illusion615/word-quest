import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEXICON_SCHEMA_VERSION,
  buildCoverageIndex,
  projectBank,
} from './lib/lexiconArtifacts.mjs';
import { lexiconShardId } from './lib/lexiconShard.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const oxfordPath = resolve(
  projectRoot,
  process.argv[2] ?? '.lexicon-cache/oxford-source.json',
);
const outputDirectory = resolve(projectRoot, 'public/data/exam-banks');
const lexiconPath = resolve(projectRoot, 'public/data/lexicon/words.json');
const senseShardDirectory = resolve(projectRoot, 'public/data/lexicon/senses/v1');
const metadataPath = resolve(projectRoot, 'src/data/exam-bank-metadata.generated.ts');
export const DICTIONARY_SENSE_SCHEMA_VERSION = 1;
const MAX_RUNTIME_EXAMPLES = 3;

const [oxford, highSchool, cet, legacyMembership] = await Promise.all([
  readFile(oxfordPath, 'utf8').then(JSON.parse),
  readFile(resolve(projectRoot, 'scripts/data/official-membership/high-school.json'), 'utf8').then(JSON.parse),
  readFile(resolve(projectRoot, 'scripts/data/official-membership/cet.json'), 'utf8').then(JSON.parse),
  readFile(resolve(projectRoot, 'scripts/data/legacy-membership-order.json'), 'utf8').then(JSON.parse),
]);

if (oxford.schemaVersion !== 1 || highSchool.schemaVersion !== 1 || cet.schemaVersion !== 1) {
  throw new Error('Oxford or official membership source version is unsupported.');
}

function normalizeQuery(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function baseWordId(query) {
  return normalizeQuery(query).toLocaleLowerCase('en-US');
}

function caseSuffix(query) {
  if (query === query.toLocaleUpperCase('en-US')) return 'upper';
  if (query[0] === query[0]?.toLocaleUpperCase('en-US')) return 'proper';
  return 'case';
}

const queries = Object.keys(oxford.entries);
const caseGroups = Map.groupBy(queries, (query) => baseWordId(query));
const proposedIds = new Map();
for (const [baseId, forms] of caseGroups) {
  const exactForms = [...new Set(forms)];
  for (const query of exactForms) {
    const id = exactForms.length === 1 || query === query.toLocaleLowerCase('en-US')
      ? baseId
      : `${baseId}:${caseSuffix(query)}`;
    proposedIds.set(query, id);
  }
}

const queryGroups = new Map();
for (const query of queries) {
  const id = proposedIds.get(query);
  const grouped = queryGroups.get(id) ?? [];
  grouped.push(query);
  queryGroups.set(id, grouped);
}

const preferredQueries = new Set([
  ...highSchool.entries.map((entry) => normalizeQuery(entry.headword)),
  ...cet.entries.map((entry) => normalizeQuery(entry.headword)),
]);
const resolutionPriority = {
  direct: 7,
  variant: 6,
  sourceAlias: 5,
  orthographic: 4,
  inflection: 3,
  phrase: 2,
  redirect: 1,
  missing: 0,
};

function flattenResult(result) {
  const groups = result.entries.flatMap((entry) => entry.groups ?? []);
  const senses = groups.flatMap((group) => group.senses ?? []);
  const phrases = result.entries.flatMap((entry) => entry.phrases ?? []);
  return { groups, senses, phrases };
}

function lexicalSourceHash(senses) {
  return createHash('sha256').update(JSON.stringify(senses.map((sense) => ({
    id: sense.id,
    partOfSpeech: sense.partOfSpeech,
    definitionZh: sense.definitionZh,
    glossesEn: sense.glossesEn,
    labels: sense.labels,
    contexts: sense.contexts,
    patterns: sense.patterns,
    examples: sense.examples,
    source: sense.source,
  })))).digest('hex');
}

function canonicalSense(wordId, sense, namespace = 'o') {
  const sourceKey = sense.source.subsenseId ?? sense.source.senseId;
  const digest = createHash('sha256').update(JSON.stringify([
    wordId,
    sense.source.recordId,
    sourceKey,
    sense.definitionZh,
  ])).digest('hex').slice(0, 12);
  return { ...sense, id: `${wordId}:${namespace}:${digest}` };
}

function canonicalPhrases(wordId, phrases) {
  return phrases.map((phrase) => {
    const groups = phrase.groups.map((group) => ({
      ...group,
      senses: group.senses.map((sense) => canonicalSense(wordId, sense, 'p')),
    }));
    return { ...phrase, groups };
  });
}

function mergePronunciations(entries) {
  const values = {};
  for (const entry of entries) {
    for (const [dialect, pronunciations] of Object.entries(entry.pronunciations ?? {})) {
      values[dialect] = [...new Set([...(values[dialect] ?? []), ...pronunciations])];
    }
  }
  return values;
}

function preferredResult(groupedQueries) {
  return [...groupedQueries].sort((left, right) => {
    const leftResult = oxford.entries[left];
    const rightResult = oxford.entries[right];
    return Number(preferredQueries.has(right)) - Number(preferredQueries.has(left))
      || (resolutionPriority[rightResult.resolution.type] ?? 0)
        - (resolutionPriority[leftResult.resolution.type] ?? 0)
      || flattenResult(rightResult).senses.length - flattenResult(leftResult).senses.length;
  })[0];
}

const queryToWordId = new Map();
const words = {};
for (const [wordId, groupedQueries] of queryGroups) {
  groupedQueries.forEach((query) => queryToWordId.set(query, wordId));
  const query = preferredResult(groupedQueries);
  const result = oxford.entries[query];
  const flattened = flattenResult(result);
  const groups = flattened.groups;
  const senses = flattened.senses.map((sense) => canonicalSense(wordId, sense));
  const phrases = canonicalPhrases(wordId, flattened.phrases);
  const pronunciations = mergePronunciations(result.entries);
  const partsOfSpeech = [...new Set(groups.map((group) => group.partOfSpeech).filter(Boolean))];
  const englishGlosses = [...new Set(senses.flatMap((sense) => sense.glossesEn ?? []))];
  const firstExample = senses.flatMap((sense) => sense.examples ?? [])[0];
  words[wordId] = {
    id: wordId,
    word: query,
    aliases: groupedQueries.filter((alias) => alias !== query),
    phonetic: pronunciations.british?.[0]
      ? `/${pronunciations.british[0]}/`
      : pronunciations.american?.[0]
        ? `/${pronunciations.american[0]}/`
        : '',
    pronunciations,
    partOfSpeech: partsOfSpeech.join(' / '),
    definition: englishGlosses.join('; '),
    ...(firstExample ? {
      example: firstExample.english,
      exampleZh: firstExample.chinese,
    } : {}),
    definitionStatus: senses.length > 0 ? 'available' : 'missing',
    lexicalSourceHash: lexicalSourceHash(senses),
    resolution: result.resolution,
    dictionaryEntries: result.entries.map((entry) => ({
      sourceId: entry.sourceId,
      sourceWord: entry.sourceWord ?? entry.word,
      homograph: entry.homograph,
    })),
    senses,
    phrases,
    sourceTags: [],
  };
}

function wordIdForQuery(query) {
  const normalized = normalizeQuery(query);
  const id = queryToWordId.get(normalized);
  if (!id) throw new Error(`Membership references a word absent from Oxford extraction: ${query}`);
  return id;
}

const membershipQueries = {
  gaokao: highSchool.entries.map((entry) => entry.headword),
  cet4: cet.entries.filter((entry) => entry.level === 'cet4').map((entry) => entry.headword),
  cet6: cet.entries.map((entry) => entry.headword),
  ielts: legacyMembership.banks.ielts.map((entry) => entry.word),
  toefl: legacyMembership.banks.toefl.map((entry) => entry.word),
};
const legacyRanks = Object.fromEntries(Object.entries(legacyMembership.banks).map(([bankId, entries]) => [
  bankId,
  new Map(entries.map((entry, index) => [entry.id, index])),
]));

function orderedPlayableIds(bankId, sourceQueries) {
  const seen = new Set();
  const sourceIds = sourceQueries.map(wordIdForQuery).filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return sourceIds
    .map((id, sourceOrder) => ({ id, sourceOrder }))
    .filter(({ id }) => words[id].senses.length > 0)
    .sort((left, right) => {
      const leftLegacy = legacyRanks[bankId]?.get(left.id.split(':')[0]);
      const rightLegacy = legacyRanks[bankId]?.get(right.id.split(':')[0]);
      if (leftLegacy !== undefined && rightLegacy !== undefined) return leftLegacy - rightLegacy;
      if (leftLegacy !== undefined) return -1;
      if (rightLegacy !== undefined) return 1;
      return left.sourceOrder - right.sourceOrder;
    })
    .map(({ id }) => id);
}

const bankIndex = {
  schemaVersion: 1,
  banks: Object.fromEntries(Object.entries(membershipQueries).map(([bankId, sourceQueries]) => [
    bankId,
    orderedPlayableIds(bankId, sourceQueries),
  ])),
};
for (const [bankId, ids] of Object.entries(bankIndex.banks)) {
  ids.forEach((id) => words[id].sourceTags.push(bankId));
}

const lexicon = {
  schemaVersion: LEXICON_SCHEMA_VERSION,
  source: {
    ...oxford.source,
    generatedFrom: oxfordPath.replace(`${projectRoot}/`, ''),
    membershipSources: oxford.membershipSources,
  },
  coverage: oxford.coverage,
  words: Object.fromEntries(Object.entries(words).sort(([left], [right]) => (
    left.localeCompare(right, 'en')
  ))),
};

const bankDefinitions = [
  {
    id: 'gaokao',
    name: '高中课标词汇',
    file: 'gaokao.json',
    status: 'syllabus-indexed',
    basis: '教育部《普通高中英语课程标准（2017年版2020年修订）》附录2',
    sourceName: highSchool.source.name,
    sourceUrl: highSchool.source.url,
    sourceVersion: highSchool.source.notice,
    sourceEntryCount: highSchool.entries.length,
  },
  {
    id: 'cet4',
    name: 'CET-4',
    file: 'cet4.json',
    status: 'syllabus-indexed',
    basis: '《全国大学英语四、六级考试大纲（2016年修订版）》未标★词目',
    sourceName: cet.source.name,
    sourceUrl: cet.source.url,
    sourceVersion: '2016年修订版',
    sourceEntryCount: cet.entries.filter((entry) => entry.level === 'cet4').length,
  },
  {
    id: 'cet6',
    name: 'CET-6',
    file: 'cet6.json',
    status: 'syllabus-indexed',
    basis: '《全国大学英语四、六级考试大纲（2016年修订版）》完整词目（含★增量）',
    sourceName: cet.source.name,
    sourceUrl: cet.source.url,
    sourceVersion: '2016年修订版',
    sourceEntryCount: cet.entries.length,
  },
  {
    id: 'ielts',
    name: 'IELTS 备考词汇',
    file: 'ielts.json',
    status: 'curated',
    basis: '沿用旧版 curated 成员范围；释义已统一替换为 Oxford',
    sourceName: 'Legacy curated membership bridge',
    sourceUrl: 'https://github.com/skywind3000/ECDICT',
    sourceVersion: 'membership only',
    sourceEntryCount: membershipQueries.ielts.length,
  },
  {
    id: 'toefl',
    name: 'TOEFL 备考词汇',
    file: 'toefl.json',
    status: 'curated',
    basis: '沿用旧版 curated 成员范围；释义已统一替换为 Oxford',
    sourceName: 'Legacy curated membership bridge',
    sourceUrl: 'https://github.com/skywind3000/ECDICT',
    sourceVersion: 'membership only',
    sourceEntryCount: membershipQueries.toefl.length,
  },
];

const manifestBanks = bankDefinitions.map((definition) => {
  const indexedIds = bankIndex.banks[definition.id];
  const sourceIds = [...new Set(membershipQueries[definition.id].map(wordIdForQuery))];
  const omittedMissingDefinitions = sourceIds.filter((id) => words[id].senses.length === 0).length;
  return {
    ...definition,
    count: indexedIds.length,
    uniqueLexemes: sourceIds.length,
    duplicateEntriesMerged: definition.sourceEntryCount - sourceIds.length,
    omittedMissingDefinitions,
    missingEnglishGlosses: indexedIds.filter((id) => !words[id].definition).length,
    missingChinese: 0,
  };
});
const manifest = {
  schemaVersion: 2,
  dataModel: {
    schemaVersion: 2,
    lexiconFile: '../lexicon/words.json',
    bankIndexFile: 'bank-index.json',
    journeyOrderVersion: 2,
  },
  source: lexicon.source,
  banks: manifestBanks,
};
const bankOrder = bankDefinitions.map((definition) => definition.id);
const coverageIndex = buildCoverageIndex(bankOrder, bankIndex);

function runtimeSense(sense) {
  const registers = [
    ...(sense.labels?.level ?? []),
    ...(sense.labels?.register ?? []),
  ];
  const domains = sense.labels?.domain ?? [];
  return {
    id: sense.id,
    label: sense.label,
    definitionZh: sense.definitionZh,
    ...(sense.glossesEn?.length ? { glossesEn: sense.glossesEn } : {}),
    ...(registers.length ? { registers } : {}),
    ...(domains.length ? { domains } : {}),
    ...(sense.contexts?.length ? { contexts: sense.contexts } : {}),
    ...(sense.patterns?.length ? { patterns: sense.patterns } : {}),
    ...(sense.examples?.length
      ? {
        examples: sense.examples.slice(0, MAX_RUNTIME_EXAMPLES).map((example) => ({
          english: example.english,
          chinese: example.chinese,
        })),
      }
      : {}),
  };
}

const senseShards = new Map();
for (const wordId of new Set(Object.values(bankIndex.banks).flat())) {
  const shardId = lexiconShardId(wordId);
  const shard = senseShards.get(shardId) ?? {};
  shard[wordId] = { senses: words[wordId].senses.map(runtimeSense) };
  senseShards.set(shardId, shard);
}

await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(dirname(lexiconPath), { recursive: true }),
  mkdir(senseShardDirectory, { recursive: true }),
]);
for (const [shardId, shardWords] of senseShards) {
  const destination = resolve(senseShardDirectory, `${shardId}.json`);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, JSON.stringify({
    schemaVersion: DICTIONARY_SENSE_SCHEMA_VERSION,
    words: Object.fromEntries(
      Object.entries(shardWords).sort(([left], [right]) => left.localeCompare(right, 'en')),
    ),
  }), 'utf8');
  await rename(temporary, destination);
}
for (const bank of bankDefinitions) {
  await writeFile(
    resolve(outputDirectory, bank.file),
    JSON.stringify(projectBank(lexicon, bankIndex, bank.id)),
    'utf8',
  );
}
const outputs = [
  [lexiconPath, JSON.stringify(lexicon)],
  [resolve(outputDirectory, 'bank-index.json'), JSON.stringify(bankIndex)],
  [resolve(outputDirectory, 'coverage-index.json'), JSON.stringify(coverageIndex)],
  [resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`],
  [metadataPath, [
    '// Generated by scripts/build-canonical-lexicon.mjs. Do not edit manually.',
    `export const EXAM_BANK_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;`,
    '',
  ].join('\n')],
];
for (const [path, content] of outputs) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, path);
}

console.table(manifestBanks.map((bank) => ({
  id: bank.id,
  sourceEntries: bank.sourceEntryCount,
  uniqueLexemes: bank.uniqueLexemes,
  playable: bank.count,
  omitted: bank.omittedMissingDefinitions,
  missingEnglishGlosses: bank.missingEnglishGlosses,
})));
console.log(`Canonical Oxford lexicon: ${Object.keys(words).length} words, ${oxford.coverage.totalSenses} source senses.`);
console.log(`Runtime dictionary senses: ${senseShards.size} shards for ${new Set(Object.values(bankIndex.banks).flat()).size} playable words.`);
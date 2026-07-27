import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectBank } from './lib/lexiconArtifacts.mjs';
import { lexiconShardId } from './lib/lexiconShard.mjs';

const bankDirectory = resolve('public/data/exam-banks');
const manifest = JSON.parse(await readFile(resolve(bankDirectory, 'manifest.json'), 'utf8'));
const lexicon = JSON.parse(await readFile(resolve('public/data/lexicon/words.json'), 'utf8'));
const bankIndex = JSON.parse(await readFile(resolve(bankDirectory, 'bank-index.json'), 'utf8'));
const coverageIndex = JSON.parse(await readFile(resolve(bankDirectory, 'coverage-index.json'), 'utf8'));
const highSchool = JSON.parse(await readFile(
  resolve('scripts/data/official-membership/high-school.json'),
  'utf8',
));
const cet = JSON.parse(await readFile(
  resolve('scripts/data/official-membership/cet.json'),
  'utf8',
));
const legacyMembership = JSON.parse(await readFile(
  resolve('scripts/data/legacy-membership-order.json'),
  'utf8',
));

const expectedBanks = ['gaokao', 'cet4', 'cet6', 'ielts', 'toefl'];
const expectedCounts = {
  gaokao: 3000,
  cet4: 4039,
  cet6: 5295,
  ielts: 5015,
  toefl: 6805,
};
const expectedSourceCounts = {
  gaokao: 3000,
  cet4: 4114,
  cet6: 5377,
  ielts: 5040,
  toefl: 6974,
};
const expectedOrderHashes = {
  gaokao: 'a120aefa389fcd779b5f7f07593ca47da36089c2f91f2307de69b56a00d3c3f1',
  cet4: '93fb4c8892d85e66aadbe9b69f41d474d88acb08aa408e62ccd352a534fc9767',
  cet6: '1f03038e9b63b861b0c909e04407b1dcfd7dfd6992eca1386cb6f905f42da706',
  ielts: '5f16456f48832de4e9cd278d816923eb3a872af883b4514072d3f3fcd7f169cb',
  toefl: 'c6c39ab4d2c956fa7d11b1f5dab1f2b9a9302f5374d852bb8603c634513f6360',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

assert(manifest.schemaVersion === 2, 'Unsupported exam-bank manifest version.');
assert(
  manifest.dataModel?.schemaVersion === 2
    && manifest.dataModel.lexiconFile === '../lexicon/words.json'
    && manifest.dataModel.bankIndexFile === 'bank-index.json'
    && manifest.dataModel.journeyOrderVersion === 2,
  'Exam-bank data model is missing or invalid.',
);
assert(lexicon.schemaVersion === 3, 'Canonical lexicon must use schema v3.');
assert(bankIndex.schemaVersion === 1, 'Unsupported bank-index version.');
assert(coverageIndex.schemaVersion === 1, 'Unsupported coverage-index version.');
assert(
  manifest.source?.bundleIdentifier === 'com.apple.dictionary.zh_CN-en.OCD'
    && manifest.source.bundleVersion === '1.1'
    && /Oxford University Press/.test(manifest.source.contentCopyright),
  'Oxford dictionary provenance is missing or changed.',
);
assert(
  manifest.banks.map((bank) => bank.id).join(',') === expectedBanks.join(','),
  'Manifest bank order changed.',
);
assert(
  coverageIndex.bankOrder.join(',') === expectedBanks.join(','),
  'Coverage-index bank order changed.',
);

assert(highSchool.entries.length === 3000, 'High-school source must contain 3,000 entries.');
assert(
  JSON.stringify(highSchool.declaredCounts) === JSON.stringify({
    total: 3000,
    compulsoryFoundation: 1500,
    mandatory: 500,
    selectiveMandatory: 1000,
  }),
  'High-school declared tier counts changed.',
);
assert(
  JSON.stringify(highSchool.observedPrintedCounts) === JSON.stringify({
    total: 3000,
    compulsoryFoundation: 1500,
    mandatory: 499,
    selectiveMandatory: 1001,
  }),
  'High-school printed marker counts changed.',
);
assert(
  Object.keys(highSchool.caseInsensitiveCollisions).sort().join(',')
    === 'china,march,may,miss,us',
  'High-school case-distinct lexeme collisions changed.',
);
assert(
  highSchool.entries[0].display === 'a (an)'
    && highSchool.entries.at(-1).headword === 'zoo'
    && highSchool.entries.some((entry) => entry.headword === 'I')
    && highSchool.entries.some((entry) => entry.display === 'kilo (kilogramme, kilogram)'),
  'High-school extraction edge records are incomplete.',
);

assert(cet.declaredCounts.entries === 5418, 'CET declared entry count changed.');
assert(cet.entries.length === 5377, 'CET physical word-family row count changed.');
assert(
  cet.observedStructure.physicalRows === 5377
    && cet.observedStructure.starredRows === 1263
    && cet.observedStructure.expandedForms === 8107
    && cet.observedStructure.uniqueNormalizedForms === 8013,
  'CET spatial extraction totals changed.',
);
assert(
  cet.entries[0].forms.map((form) => form.word).join(',') === 'a,an'
    && cet.entries.at(-1).headword === 'zoom'
    && cet.entries.at(-1).marker === '★',
  'CET first/last source rows are invalid.',
);
const legacyCounts = { gaokao: 3677, cet4: 3849, cet6: 5805, ielts: 5040, toefl: 6974 };
assert(
  Object.entries(legacyMembership.banks).every(([bankId, entries]) => (
    entries.length === legacyCounts[bankId]
  )),
  'Legacy membership/order bridge counts changed.',
);
assert(legacyMembership.source.lexicalAuthority === false, 'Legacy bridge cannot be lexical authority.');

const globalSenseIds = new Set();
let canonicalSenseCount = 0;
let missingWordCount = 0;
for (const [wordId, word] of Object.entries(lexicon.words)) {
  assert(word.id === wordId, `${wordId} has a mismatched canonical ID.`);
  assert(!('banks' in word) && !('definitionZh' in word), `${wordId} stores runtime-only fields.`);
  assert(Array.isArray(word.senses), `${wordId} has no structured senses array.`);
  assert(Array.isArray(word.phrases), `${wordId} has no structured phrases array.`);
  assert(word.lexicalSourceHash === lexicalSourceHash(word.senses), `${wordId} lexical source hash is stale.`);
  assert(
    word.definitionStatus === (word.senses.length > 0 ? 'available' : 'missing'),
    `${wordId} has an invalid definition status.`,
  );
  if (word.senses.length === 0) missingWordCount += 1;
  const localIds = new Set();
  for (const sense of word.senses) {
    assert(typeof sense.id === 'string' && sense.id.includes(':o:'), `${wordId} has an invalid sense ID.`);
    assert(!localIds.has(sense.id), `${wordId} contains duplicate sense ID ${sense.id}.`);
    assert(!globalSenseIds.has(sense.id), `Sense ID ${sense.id} is reused by multiple words.`);
    assert(
      typeof sense.partOfSpeech === 'string'
        && typeof sense.label === 'string'
        && sense.separator === ' '
        && sense.text === sense.definitionZh
        && sense.definitionZh.length > 0,
      `${wordId} has an invalid structured sense.`,
    );
    assert(
      sense.source?.dictionary === 'Oxford Chinese Dictionary'
        && typeof sense.source.recordId === 'string'
        && typeof sense.source.senseId === 'string',
      `${wordId}/${sense.id} lacks Oxford source provenance.`,
    );
    for (const example of sense.examples ?? []) {
      assert(
        typeof example.english === 'string' && example.english.length > 0
          && typeof example.chinese === 'string' && example.chinese.length > 0,
        `${wordId}/${sense.id} has an invalid Oxford example.`,
      );
    }
    localIds.add(sense.id);
    globalSenseIds.add(sense.id);
    canonicalSenseCount += 1;
  }
}
assert(Object.keys(lexicon.words).length === 11846, 'Canonical word count changed unexpectedly.');
assert(canonicalSenseCount === 53488, 'Canonical structured sense count changed unexpectedly.');
assert(missingWordCount === 212, 'Canonical missing-definition count changed unexpectedly.');
assert(lexicon.coverage.missing === missingWordCount, 'Oxford coverage missing count diverges.');

assert(
  Object.keys(coverageIndex.memberships).length
    === new Set(Object.values(bankIndex.banks).flat()).size,
  'Coverage index and bank indexes contain different identities.',
);
for (const [position, bank] of manifest.banks.entries()) {
  assert(bank.count === expectedCounts[bank.id], `${bank.id} playable count changed.`);
  assert(bank.sourceEntryCount === expectedSourceCounts[bank.id], `${bank.id} source count changed.`);
  assert(
    bank.count === bank.uniqueLexemes - bank.omittedMissingDefinitions,
    `${bank.id} playable/omitted arithmetic is invalid.`,
  );
  assert(
    bank.sourceEntryCount === bank.uniqueLexemes + bank.duplicateEntriesMerged,
    `${bank.id} source/duplicate arithmetic is invalid.`,
  );
  assert(bank.missingChinese === 0, `${bank.id} contains blank Chinese definitions.`);
  const indexedIds = bankIndex.banks[bank.id];
  assert(Array.isArray(indexedIds) && indexedIds.length === bank.count, `${bank.id} index count mismatch.`);
  assert(new Set(indexedIds).size === indexedIds.length, `${bank.id} contains duplicate IDs.`);
  const orderHash = createHash('sha256').update(`${indexedIds.join('\n')}\n`).digest('hex');
  assert(orderHash === expectedOrderHashes[bank.id], `${bank.id} journey order changed.`);

  const entries = JSON.parse(await readFile(resolve(bankDirectory, bank.file), 'utf8'));
  assert(entries.length === bank.count, `${bank.id} runtime count mismatch.`);
  assert(
    JSON.stringify(entries) === JSON.stringify(projectBank(lexicon, bankIndex, bank.id)),
    `${bank.id} runtime cache diverges from canonical projection.`,
  );
  assert(coverageIndex.bankCounts[bank.id] === bank.count, `${bank.id} coverage count mismatch.`);
  const coverageMembers = Object.values(coverageIndex.memberships)
    .filter((membership) => (membership & (1 << position)) !== 0).length;
  assert(coverageMembers === bank.count, `${bank.id} coverage membership mismatch.`);

  for (const entry of entries) {
    assert(entry.banks?.length === 1 && entry.banks[0] === bank.id, `${entry.id} has invalid bank tags.`);
    assert(entry.definitionZh && entry.lexicalSourceHash, `${entry.id} lacks projected dictionary facts.`);
    assert(
      entry.senseIds.length === entry.definitionZh.split('；').length,
      `${entry.id} runtime senses and IDs are misaligned.`,
    );
    assert(lexicon.words[entry.id].sourceTags.includes(bank.id), `${entry.id} lacks canonical membership.`);
  }
}

console.log(
  `Verified ${manifest.banks.length} banks, ${Object.keys(lexicon.words).length} Oxford words, `
  + `${canonicalSenseCount} structured senses, and official high-school/CET membership sources.`,
);

const senseShardDirectory = resolve('public/data/lexicon/senses/v1');
const playableIds = new Set(Object.values(bankIndex.banks).flat());
const shardFiles = (await readdir(senseShardDirectory))
  .filter((filename) => /^[0-9a-f]{2}\.json$/.test(filename));
const shardedIds = new Set();
let runtimeSenseCount = 0;
let runtimeExampleCount = 0;
for (const filename of shardFiles) {
  const shardId = filename.slice(0, 2);
  const shard = JSON.parse(await readFile(resolve(senseShardDirectory, filename), 'utf8'));
  assert(shard.schemaVersion === 1, `Unsupported dictionary sense shard ${filename}.`);
  for (const [wordId, entry] of Object.entries(shard.words)) {
    assert(lexiconShardId(wordId) === shardId, `${wordId} is stored in the wrong sense shard.`);
    assert(playableIds.has(wordId), `${wordId} has dictionary senses but is not playable.`);
    assert(!shardedIds.has(wordId), `${wordId} appears in more than one sense shard.`);
    shardedIds.add(wordId);
    const canonical = lexicon.words[wordId].senses;
    assert(
      entry.senses.length === canonical.length
        && entry.senses.every((sense, index) => (
          sense.id === canonical[index].id
          && sense.label === canonical[index].label
          && sense.definitionZh === canonical[index].definitionZh
        )),
      `${wordId} runtime dictionary senses diverge from the canonical lexicon.`,
    );
    for (const sense of entry.senses) {
      runtimeSenseCount += 1;
      for (const example of sense.examples ?? []) {
        assert(
          typeof example.english === 'string' && example.english.length > 0
            && typeof example.chinese === 'string' && example.chinese.length > 0,
          `${wordId}/${sense.id} has an invalid runtime example.`,
        );
        runtimeExampleCount += 1;
      }
    }
  }
}
assert(shardedIds.size === playableIds.size, 'Dictionary sense shards do not cover every playable word.');

console.log(
  `Verified ${shardFiles.length} dictionary sense shards covering ${shardedIds.size} playable words, `
  + `${runtimeSenseCount} runtime senses and ${runtimeExampleCount} Oxford examples.`,
);
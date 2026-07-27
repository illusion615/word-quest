import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const allowPartial = args.includes('--allow-partial');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bankDirectory = resolve(projectRoot, 'public/data/exam-banks');
const directoryIndex = args.indexOf('--coach-dir');
const coachDirectory = directoryIndex >= 0
  ? resolve(projectRoot, args[directoryIndex + 1] ?? '')
  : resolve(projectRoot, 'public/data/word-coach');
const shardDirectory = resolve(coachDirectory, 'v1');
const lexicon = JSON.parse(await readFile(resolve(projectRoot, 'public/data/lexicon/words.json'), 'utf8'));
const bankManifest = JSON.parse(await readFile(resolve(bankDirectory, 'manifest.json'), 'utf8'));
const coachManifest = JSON.parse(await readFile(resolve(coachDirectory, 'manifest.json'), 'utf8'));
const words = new Map();

for (const bank of bankManifest.banks) {
  for (const word of JSON.parse(await readFile(resolve(bankDirectory, bank.file), 'utf8'))) {
    words.set(word.id, word);
  }
}

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});

try {
  const aiClient = await vite.ssrLoadModule('/src/services/aiClient.ts');
  const coachContract = await vite.ssrLoadModule('/src/domain/wordCoach.ts');
  const wordText = await vite.ssrLoadModule('/src/domain/wordText.ts');
  const {
    WORD_COACH_PROMPT_VERSION,
    WORD_COACH_SCHEMA_VERSION,
    WORD_COACH_SHARD_COUNT,
    assessWordCoachQuality,
    wordCoachShardId,
    wordCoachSourceHash,
  } = coachContract;
  const { parseStoredWordExplanation } = aiClient;
  const { parseWordSenses } = wordText;

  if (coachManifest.schemaVersion !== WORD_COACH_SCHEMA_VERSION
    || coachManifest.shardCount !== WORD_COACH_SHARD_COUNT) {
    throw new Error('Word coach manifest does not match the current corpus contract.');
  }
  if (lexicon.schemaVersion !== 3) {
    throw new Error('Word coach requires canonical lexicon schema v3.');
  }
  const manifestIsCurrent = coachManifest.promptVersion === WORD_COACH_PROMPT_VERSION
    && coachManifest.lexiconSchemaVersion === lexicon.schemaVersion
    && coachManifest.dictionarySource?.bundleIdentifier === lexicon.source.bundleIdentifier
    && coachManifest.dictionarySource?.bundleVersion === lexicon.source.bundleVersion;
  if (!manifestIsCurrent && !allowPartial) {
    throw new Error('Word coach manifest is not bound to the current generation contract.');
  }

  let byteCount = 0;
  let recordCount = 0;
  let staleCount = 0;
  const seen = new Set();
  const shardFiles = (await readdir(shardDirectory)).filter((filename) => (
    /^[0-9a-f]{2}\.json$/.test(filename)
  ));

  for (const filename of shardFiles) {
    const shardId = filename.slice(0, 2);
    const path = resolve(shardDirectory, filename);
    const shard = JSON.parse(await readFile(path, 'utf8'));
    byteCount += (await stat(path)).size;
    if (shard.schemaVersion !== WORD_COACH_SCHEMA_VERSION || !shard.records) {
      throw new Error(`Invalid word coach shard ${filename}.`);
    }

    for (const [wordId, record] of Object.entries(shard.records)) {
      const word = words.get(wordId);
      if (seen.has(wordId)) throw new Error(`${wordId} appears in more than one shard.`);
      seen.add(wordId);
      if (wordCoachShardId(wordId) !== shardId) {
        throw new Error(`${wordId} is stored in the wrong shard (${shardId}).`);
      }
      if (!word) {
        if (allowPartial) {
          staleCount += 1;
          continue;
        }
        throw new Error(`${wordId} is not present in any exam bank.`);
      }
      if (record.promptVersion !== WORD_COACH_PROMPT_VERSION) {
        if (allowPartial) {
          staleCount += 1;
          continue;
        }
        throw new Error(`${wordId} has stale coach metadata.`);
      }
      if (record.sourceHash !== wordCoachSourceHash(word)) {
        if (allowPartial) {
          staleCount += 1;
          continue;
        }
        throw new Error(`${wordId} has stale coach metadata.`);
      }
      const explanation = parseStoredWordExplanation(
        record,
        parseWordSenses(word),
        word.word,
      );
      const hardIssues = assessWordCoachQuality(
        word,
        explanation,
        coachManifest.outputLanguage,
      ).filter((issue) => issue.severity === 'error');
      if (hardIssues.length > 0) {
        throw new Error(`${wordId} failed deterministic quality checks: ${hardIssues.map((issue) => issue.message).join(' ')}`);
      }
      recordCount += 1;
    }
  }

  if (!allowPartial && coachManifest.generatedCount !== recordCount) {
    throw new Error(`Coach manifest count ${coachManifest.generatedCount} does not match ${recordCount}.`);
  }
  if (!allowPartial && (recordCount !== words.size || coachManifest.complete !== true)) {
    throw new Error(`Static coach corpus is incomplete (${recordCount}/${words.size}).`);
  }

  console.log(
    `Verified ${recordCount}/${words.size} static word coaches across ${shardFiles.length} shards `
    + `(${staleCount} stale records pending regeneration) `
    + `(${(byteCount / 1048576).toFixed(2)} MB raw JSON).`,
  );
} finally {
  await vite.close();
}
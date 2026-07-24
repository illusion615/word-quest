import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examBankDirectory = resolve(projectRoot, 'public/data/exam-banks');
let outputRoot = resolve(projectRoot, 'public/data/word-coach');
const failureDirectory = resolve(projectRoot, '.word-coach');
const failurePath = resolve(failureDirectory, 'failures.json');
const lockPath = resolve(failureDirectory, 'generation.lock');
const validBankIds = new Set(['gaokao', 'cet4', 'cet6', 'ielts', 'toefl']);

const args = process.argv.slice(2);
let bankOption = 'all';
let concurrency = 2;
let execute = false;
let force = false;
let jsonEvents = false;
let limit = Number.POSITIVE_INFINITY;
let qualityMode = 'unreviewed';
let retries = 1;
let onlyWordIds = null;

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--bank') bankOption = args[index += 1] ?? '';
  else if (argument === '--concurrency') concurrency = Number(args[index += 1]);
  else if (argument === '--execute') execute = true;
  else if (argument === '--force') force = true;
  else if (argument === '--json-events') jsonEvents = true;
  else if (argument === '--limit') limit = Number(args[index += 1]);
  else if (argument === '--quality-mode') qualityMode = args[index += 1] ?? '';
  else if (argument === '--retries') retries = Number(args[index += 1]);
  else if (argument === '--only') {
    onlyWordIds = new Set((args[index += 1] ?? '').split(',').map((id) => id.trim()).filter(Boolean));
  } else if (argument === '--output') outputRoot = resolve(projectRoot, args[index += 1] ?? '');
  else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

const shardDirectory = resolve(outputRoot, 'v1');

function emit(type, data = {}, message = '') {
  const event = { type, timestamp: new Date().toISOString(), ...data };
  if (jsonEvents) console.log(JSON.stringify(event));
  else if (message) console.log(message);
}

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
  throw new Error('--concurrency must be an integer from 1 to 16');
}
if ((!Number.isFinite(limit) && limit !== Number.POSITIVE_INFINITY) || limit < 0) {
  throw new Error('--limit must be a non-negative number');
}
if (!Number.isInteger(retries) || retries < 0 || retries > 8) {
  throw new Error('--retries must be an integer from 0 to 8');
}
if (!['unreviewed', 'balanced', 'strict'].includes(qualityMode)) {
  throw new Error('--quality-mode must be unreviewed, balanced, or strict');
}
const requestedBanks = bankOption === 'all'
  ? [...validBankIds]
  : bankOption.split(',').map((id) => id.trim()).filter(Boolean);
if (requestedBanks.length === 0 || requestedBanks.some((id) => !validBankIds.has(id))) {
  throw new Error(`--bank must be "all" or a comma-separated subset of ${[...validBankIds].join(', ')}`);
}

const bankManifest = JSON.parse(await readFile(resolve(examBankDirectory, 'manifest.json'), 'utf8'));
const allWords = new Map();
const entriesByBank = new Map();
const targetWordIds = new Set();

for (const bank of bankManifest.banks) {
  const entries = JSON.parse(await readFile(resolve(examBankDirectory, bank.file), 'utf8'));
  entriesByBank.set(bank.id, entries);
  for (const entry of entries) {
    const existing = allWords.get(entry.id);
    if (existing) {
      for (const key of ['word', 'phonetic', 'partOfSpeech', 'definition', 'definitionZh']) {
        if (existing[key] !== entry[key]) {
          throw new Error(`Shared word ${entry.id} differs between exam banks (${key})`);
        }
      }
    } else {
      allWords.set(entry.id, entry);
    }
    if (requestedBanks.includes(bank.id)) targetWordIds.add(entry.id);
  }
}

let targetWords = [];

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});

let lockHandle = null;

async function acquireGenerationLock() {
  await mkdir(failureDirectory, { recursive: true });
  try {
    lockHandle = await open(lockPath, 'wx');
    await lockHandle.writeFile(JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
      outputRoot,
    }));
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existingText = await readFile(lockPath, 'utf8').catch(() => '');
    let ownerIsAlive = true;
    try {
      const owner = JSON.parse(existingText);
      if (!Number.isInteger(owner.pid)) ownerIsAlive = false;
      else process.kill(owner.pid, 0);
    } catch {
      ownerIsAlive = false;
    }
    if (!ownerIsAlive) {
      await rm(lockPath, { force: true });
      return acquireGenerationLock();
    }
    throw new Error(`Another word-coach generator holds ${lockPath}: ${existingText}`);
  }
}

async function releaseGenerationLock() {
  if (!lockHandle) return;
  await lockHandle.close().catch(() => {});
  lockHandle = null;
  await rm(lockPath, { force: true });
}

async function terminate(exitCode) {
  await releaseGenerationLock();
  await vite.close().catch(() => {});
  process.exit(exitCode);
}

process.once('SIGTERM', () => { void terminate(143); });
process.once('SIGINT', () => { void terminate(130); });

try {
  const aiClient = await vite.ssrLoadModule('/src/services/aiClient.ts');
  const coachContract = await vite.ssrLoadModule('/src/domain/wordCoach.ts');
  const wordText = await vite.ssrLoadModule('/src/domain/wordText.ts');
  const journey = await vite.ssrLoadModule('/src/domain/journey.ts');
  const {
    WORD_COACH_PROMPT_VERSION,
    WORD_COACH_REVIEW_VERSION,
    WORD_COACH_SCHEMA_VERSION,
    WORD_COACH_SHARD_COUNT,
    assessWordCoachQuality,
    wordCoachContentHash,
    wordCoachRecordHasSourceConflict,
    wordCoachRequiresSemanticReview,
    wordCoachShardId,
    wordCoachSourceHash,
  } = coachContract;
  const {
    evaluateWordExplanation,
    explainWord,
    isAiConfigured,
    parseStoredWordExplanation,
  } = aiClient;
  const { parseDefinitionSenses } = wordText;
  const { orderWordsByJourney } = journey;

  const orderedTargetIds = [];
  const queuedIds = new Set();
  for (const bankId of requestedBanks) {
    const bankEntries = entriesByBank.get(bankId) ?? [];
    for (const word of orderWordsByJourney(bankEntries, bankId)) {
      if (!targetWordIds.has(word.id) || queuedIds.has(word.id)) continue;
      queuedIds.add(word.id);
      orderedTargetIds.push(word.id);
    }
  }
  targetWords = orderedTargetIds
    .map((id) => allWords.get(id))
    .filter((word) => !onlyWordIds || onlyWordIds.has(word.id));

  const shards = new Map();
  for (const filename of await readdir(shardDirectory).catch(() => [])) {
    if (!/^[0-9a-f]{2}\.json$/.test(filename)) continue;
    const value = JSON.parse(await readFile(resolve(shardDirectory, filename), 'utf8'));
    if (value.schemaVersion !== WORD_COACH_SCHEMA_VERSION || !value.records) {
      throw new Error(`Invalid existing coach shard: ${filename}`);
    }
    shards.set(filename.slice(0, 2), value.records);
  }

  function recordFor(word) {
    return shards.get(wordCoachShardId(word.id))?.[word.id];
  }

  function explanationFor(word, record) {
    if (!record
      || record.promptVersion !== WORD_COACH_PROMPT_VERSION
      || record.sourceHash !== wordCoachSourceHash(word)) return null;
    try {
      return parseStoredWordExplanation(
        record,
        parseDefinitionSenses(word.definitionZh).length,
        word.word,
      );
    } catch {
      return null;
    }
  }

  function passesDeterministicQuality(word, explanation) {
    return !assessWordCoachQuality(
      word,
      explanation,
      process.env.WORDBUDDY_AI_OUTPUT_LANGUAGE ?? 'Simplified Chinese',
    ).some((issue) => issue.severity === 'error');
  }

  function currentReview(record, explanation) {
    const review = record?.qualityReview;
    return review
      && review.reviewVersion === WORD_COACH_REVIEW_VERSION
      && review.contentHash === wordCoachContentHash(explanation)
      ? review
      : null;
  }

  function recordIsCurrent(word, record) {
    const explanation = explanationFor(word, record);
    if (!explanation || !passesDeterministicQuality(word, explanation)) return false;
    const review = currentReview(record, explanation);
    if (review?.verdict === 'fail') return false;
    return !wordCoachRequiresSemanticReview(word, qualityMode) || Boolean(review);
  }

  const pending = targetWords
    .filter((word) => {
      const record = recordFor(word);
      if (wordCoachRecordHasSourceConflict(word, record)) return false;
      const explanation = explanationFor(word, record);
      if (!force && explanation && currentReview(record, explanation)?.verdict === 'fail') {
        return false;
      }
      return force || !recordIsCurrent(word, record);
    })
    .slice(0, limit);
  const blocked = targetWords.filter((word) => {
    const record = recordFor(word);
    return Boolean(record && wordCoachRecordHasSourceConflict(word, record));
  }).length;
  const rejected = targetWords.filter((word) => {
    const record = recordFor(word);
    const explanation = explanationFor(word, record);
    const review = explanation ? currentReview(record, explanation) : null;
    return Boolean(review?.verdict === 'fail' && !wordCoachRecordHasSourceConflict(word, record));
  }).length;
  const pendingReview = pending.filter((word) => (
    !force
    && wordCoachRequiresSemanticReview(word, qualityMode)
    && Boolean(explanationFor(word, recordFor(word)))
  )).length;
  const alreadyCurrent = targetWords.length - targetWords.filter((word) => (
    !recordIsCurrent(word, recordFor(word))
  )).length;

  const plan = {
    mode: execute ? 'execute' : 'dry-run',
    requestedBanks,
    uniqueCorpusWords: allWords.size,
    targetWords: targetWords.length,
    alreadyCurrent,
    blocked,
    rejected,
    pending: pending.length,
    pendingGeneration: pending.length - pendingReview,
    pendingReview,
    totalSenseExamples: pending.reduce((sum, word) => (
      sum
      + parseDefinitionSenses(word.definitionZh).length
    ), 0),
    shardCount: WORD_COACH_SHARD_COUNT,
    promptVersion: WORD_COACH_PROMPT_VERSION,
    qualityMode,
    ordering: 'journey-level',
    nextWordIds: pending.slice(0, 10).map((word) => word.id),
    outputRoot,
  };
  emit('plan', plan, JSON.stringify(plan, null, 2));

  if (!execute || pending.length === 0) process.exitCode = 0;
  else {
    const config = {
      endpoint: process.env.WORDBUDDY_AI_ENDPOINT ?? '',
      model: process.env.WORDBUDDY_AI_MODEL ?? '',
      apiKey: process.env.WORDBUDDY_AI_API_KEY ?? '',
      authMode: process.env.WORDBUDDY_AI_AUTH_MODE === 'api-key' ? 'api-key' : 'bearer',
      outputLanguage: process.env.WORDBUDDY_AI_OUTPUT_LANGUAGE ?? 'Simplified Chinese',
    };
    if (!isAiConfigured(config)) {
      throw new Error(
        'Set WORDBUDDY_AI_ENDPOINT and WORDBUDDY_AI_API_KEY before using --execute. '
        + 'For a keyless local server, use a non-secret placeholder key accepted by that server.',
      );
    }
    await acquireGenerationLock();
    await mkdir(shardDirectory, { recursive: true });

    const failures = [];
    let completed = 0;

    async function generateWithRetry(word) {
      let lastError;
      const startedAt = Date.now();
      const existingRecord = recordFor(word);
      let reusableExplanation = force ? null : explanationFor(word, existingRecord);
      if (reusableExplanation && !passesDeterministicQuality(word, reusableExplanation)) {
        reusableExplanation = null;
      }
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const phase = reusableExplanation ? 'review' : 'generate';
        emit('word-start', {
          wordId: word.id,
          word: word.word,
          phase,
          attempt: attempt + 1,
          maxAttempts: retries + 1,
        });
        try {
          let explanation = reusableExplanation ?? await explainWord(config, word, {
            repairFeedback: lastError
              ? lastError instanceof Error ? lastError.message : String(lastError)
              : undefined,
          });
          const qualityIssues = assessWordCoachQuality(
            word,
            explanation,
            config.outputLanguage,
          );
          const hardErrors = qualityIssues.filter((issue) => issue.severity === 'error');
          if (hardErrors.length > 0) {
            explanation = null;
            reusableExplanation = null;
            throw new Error(hardErrors.map((issue) => issue.message).join(' '));
          }
          reusableExplanation = explanation;
          const semanticReview = wordCoachRequiresSemanticReview(word, qualityMode)
            ? await evaluateWordExplanation(config, word, explanation)
            : null;
          return {
            explanation,
            semanticReview,
            qualityWarnings: [
              ...qualityIssues.filter((issue) => issue.severity === 'warning'),
              ...(semanticReview?.issues ?? []).filter((issue) => issue.severity === 'warning'),
            ],
            attempts: attempt + 1,
            durationMs: Date.now() - startedAt,
            phase,
            blocked: semanticReview?.verdict === 'fail',
            blockKind: semanticReview
              ? semanticReview.issues.some((issue) => issue.code === 'source_conflict')
                ? 'source-conflict'
                : 'review-failed'
              : null,
          };
        } catch (error) {
          lastError = error;
          if (attempt < retries) {
            emit('word-retry', {
              wordId: word.id,
              word: word.word,
              attempt: attempt + 1,
              message: error instanceof Error ? error.message : String(error),
            });
            await new Promise((resolveDelay) => {
              setTimeout(resolveDelay, Math.min(8000, 500 * (2 ** attempt)));
            });
          }
        }
      }
      throw lastError;
    }

    async function writeShard(shardId) {
      const records = shards.get(shardId) ?? {};
      const sorted = Object.fromEntries(
        Object.entries(records).sort(([left], [right]) => left.localeCompare(right, 'en')),
      );
      const destination = resolve(shardDirectory, `${shardId}.json`);
      const temporary = `${destination}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({
        schemaVersion: WORD_COACH_SCHEMA_VERSION,
        records: sorted,
      }), 'utf8');
      await rename(temporary, destination);
    }

    for (let offset = 0; offset < pending.length; offset += concurrency) {
      const batch = pending.slice(offset, offset + concurrency);
      const results = await Promise.allSettled(batch.map(generateWithRetry));
      const dirtyShards = new Set();
      const completedEvents = [];
      const blockedEvents = [];
      const failedEvents = [];

      results.forEach((result, index) => {
        const word = batch[index];
        if (result.status === 'rejected') {
          failures.push({
            wordId: word.id,
            message: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
          failedEvents.push({
            wordId: word.id,
            word: word.word,
            message: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
          return;
        }
        const shardId = wordCoachShardId(word.id);
        const records = shards.get(shardId) ?? {};
        records[word.id] = {
          promptVersion: WORD_COACH_PROMPT_VERSION,
          sourceHash: wordCoachSourceHash(word),
          coachMarkdown: result.value.explanation.markdown,
          senseExamples: result.value.explanation.senseExamples,
          ...(result.value.semanticReview ? {
            qualityReview: {
              reviewVersion: WORD_COACH_REVIEW_VERSION,
              contentHash: wordCoachContentHash(result.value.explanation),
              verdict: result.value.semanticReview.verdict,
              issues: result.value.semanticReview.issues,
              model: config.model,
              reviewedAt: new Date().toISOString(),
            },
          } : {}),
        };
        shards.set(shardId, records);
        dirtyShards.add(shardId);
        const event = {
          wordId: word.id,
          word: word.word,
          shardId,
          attempts: result.value.attempts,
          durationMs: result.value.durationMs,
          qualityWarnings: result.value.qualityWarnings,
          senseCount: result.value.explanation.senseExamples.length,
          phase: result.value.phase,
          semanticIssues: result.value.semanticReview?.issues ?? [],
          blockKind: result.value.blockKind,
        };
        if (result.value.blocked) blockedEvents.push(event);
        else {
          completed += 1;
          completedEvents.push(event);
        }
      });

      await Promise.all([...dirtyShards].map(writeShard));
      completedEvents.forEach((event) => emit('word-complete', event));
      blockedEvents.forEach((event) => emit('word-blocked', event));
      failedEvents.forEach((event) => emit('word-failed', event));
      const progress = {
        processed: Math.min(offset + batch.length, pending.length),
        pending: pending.length,
        saved: completed,
        blocked: blockedEvents.length,
        failed: failures.length,
      };
      emit(
        'batch-complete',
        progress,
        `Generated ${progress.processed}/${progress.pending} (${progress.saved} saved, ${progress.failed} failed)`,
      );
    }

    const generatedCount = [...allWords.values()].filter((word) => (
      recordIsCurrent(word, recordFor(word))
    )).length;
    const sourceConflictCount = [...allWords.values()].filter((word) => (
      wordCoachRecordHasSourceConflict(word, recordFor(word))
    )).length;
    await writeFile(resolve(outputRoot, 'manifest.json'), `${JSON.stringify({
      schemaVersion: WORD_COACH_SCHEMA_VERSION,
      promptVersion: WORD_COACH_PROMPT_VERSION,
      shardCount: WORD_COACH_SHARD_COUNT,
      dictionaryCommit: bankManifest.source.commit,
      outputLanguage: config.outputLanguage,
      model: config.model,
      qualityMode,
      generatedAt: new Date().toISOString(),
      uniqueWordCount: allWords.size,
      generatedCount,
      blockedCount: sourceConflictCount,
      rejectedCount: [...allWords.values()].filter((word) => {
        const record = recordFor(word);
        const explanation = explanationFor(word, record);
        const review = explanation ? currentReview(record, explanation) : null;
        return Boolean(review?.verdict === 'fail' && !wordCoachRecordHasSourceConflict(word, record));
      }).length,
      complete: generatedCount === allWords.size,
    }, null, 2)}\n`, 'utf8');

    await mkdir(failureDirectory, { recursive: true });
    await writeFile(failurePath, `${JSON.stringify(failures, null, 2)}\n`, 'utf8');
    emit('complete', {
      generatedCount,
      corpusWordCount: allWords.size,
      failureCount: failures.length,
      blockedCount: sourceConflictCount,
    }, `Corpus coverage: ${generatedCount}/${allWords.size}. Failures: ${failures.length}.`);
    if (failures.length > 0) process.exitCode = 1;
  }
} finally {
  await releaseGenerationLock();
  await vite.close();
}
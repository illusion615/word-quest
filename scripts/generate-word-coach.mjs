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
const lexiconPath = resolve(projectRoot, 'public/data/lexicon/words.json');
let outputRoot = resolve(projectRoot, 'public/data/word-coach');
const failureDirectory = resolve(projectRoot, '.word-coach');
const failurePath = resolve(failureDirectory, 'failures.json');
const partialPath = resolve(failureDirectory, 'partial-sense-content.json');
const lockPath = resolve(failureDirectory, 'generation.lock');
const validBankIds = new Set(['gaokao', 'cet4', 'cet6', 'ielts', 'toefl']);

const args = process.argv.slice(2);
let bankOption = 'all';
let concurrency = 2;
let execute = false;
let force = false;
let jsonEvents = false;
let limit = Number.POSITIVE_INFINITY;
let retries = 1;
let onlyWordIds = null;
let onlySenseIds = null;

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--bank') bankOption = args[index += 1] ?? '';
  else if (argument === '--concurrency') concurrency = Number(args[index += 1]);
  else if (argument === '--execute') execute = true;
  else if (argument === '--force') force = true;
  else if (argument === '--json-events') jsonEvents = true;
  else if (argument === '--limit') limit = Number(args[index += 1]);
  else if (argument === '--retries') retries = Number(args[index += 1]);
  else if (argument === '--only') {
    onlyWordIds = new Set((args[index += 1] ?? '').split(',').map((id) => id.trim()).filter(Boolean));
  } else if (argument === '--sense') {
    onlySenseIds = new Set((args[index += 1] ?? '').split(',').map((id) => id.trim()).filter(Boolean));
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
const requestedBanks = bankOption === 'all'
  ? [...validBankIds]
  : bankOption.split(',').map((id) => id.trim()).filter(Boolean);
if (requestedBanks.length === 0 || requestedBanks.some((id) => !validBankIds.has(id))) {
  throw new Error(`--bank must be "all" or a comma-separated subset of ${[...validBankIds].join(', ')}`);
}

const bankManifest = JSON.parse(await readFile(resolve(examBankDirectory, 'manifest.json'), 'utf8'));
const lexicon = JSON.parse(await readFile(lexiconPath, 'utf8'));
if (lexicon.schemaVersion !== 3) {
  throw new Error('Canonical Oxford lexicon is incompatible.');
}
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
    WORD_COACH_SCHEMA_VERSION,
    WORD_COACH_SHARD_COUNT,
    assessWordCoachQuality,
    wordCoachShardId,
    wordCoachSourceHash,
  } = coachContract;
  const {
    explainWord,
    isAiConfigured,
    PartialWordExplanationError,
    parseStoredWordExplanation,
  } = aiClient;
  const { parseDefinitionSenses, parseWordSenses } = wordText;
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
  const partialDocument = JSON.parse(
    await readFile(partialPath, 'utf8').catch(() => '{"records":{}}'),
  );
  const partialRecords = partialDocument.records ?? {};

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
        parseWordSenses(word),
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

  function recordIsCurrent(word, record) {
    const explanation = explanationFor(word, record);
    if (!explanation || !passesDeterministicQuality(word, explanation)) return false;
    return true;
  }

  const staleShardIds = new Set();
  for (const [shardId, records] of shards) {
    for (const [wordId, record] of Object.entries(records)) {
      const word = allWords.get(wordId);
      if (word && recordIsCurrent(word, record)) continue;
      delete records[wordId];
      staleShardIds.add(shardId);
    }
  }
  for (const [wordId, partial] of Object.entries(partialRecords)) {
    const word = allWords.get(wordId);
    if (word
      && partial.promptVersion === WORD_COACH_PROMPT_VERSION
      && partial.sourceHash === wordCoachSourceHash(word)) continue;
    delete partialRecords[wordId];
  }

  const pending = targetWords
    .filter((word) => force || onlySenseIds || !recordIsCurrent(word, recordFor(word)))
    .slice(0, limit);
  const alreadyCurrent = targetWords.length - targetWords.filter((word) => (
    !recordIsCurrent(word, recordFor(word))
  )).length;

  const plan = {
    mode: execute ? 'execute' : 'dry-run',
    requestedBanks,
    uniqueCorpusWords: allWords.size,
    targetWords: targetWords.length,
    alreadyCurrent,
    pending: pending.length,
    pendingGeneration: pending.length,
    totalSenseExamples: pending.reduce((sum, word) => (
      sum
      + parseDefinitionSenses(word.definitionZh).length
    ), 0),
    shardCount: WORD_COACH_SHARD_COUNT,
    promptVersion: WORD_COACH_PROMPT_VERSION,
    lexiconSchemaVersion: lexicon.schemaVersion,
    dictionarySource: lexicon.source.bundleIdentifier,
    ordering: 'journey-level',
    nextWordIds: pending.slice(0, 10).map((word) => word.id),
    outputRoot,
  };
  emit('plan', plan, JSON.stringify(plan, null, 2));

  if (!execute || (pending.length === 0 && staleShardIds.size === 0)) process.exitCode = 0;
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

    async function generateWithRetry(word, laneId, queuePosition) {
      let lastError;
      const startedAt = Date.now();
      const senses = parseWordSenses(word);
      const availableSenseIds = new Set(senses.map((sense) => sense.id));
      if (onlySenseIds && [...onlySenseIds].some((senseId) => !availableSenseIds.has(senseId))) {
        throw new Error('Requested sense ID is not part of the target word.');
      }
      const sourceHash = wordCoachSourceHash(word);
      const savedPartial = partialRecords[word.id];
      const publishedContent = explanationFor(word, recordFor(word))?.senseContent ?? {};
      const partialContent = savedPartial?.promptVersion === WORD_COACH_PROMPT_VERSION
        && savedPartial.sourceHash === sourceHash
        ? savedPartial.senseContent
        : {};
      const accumulated = { ...publishedContent, ...partialContent };
      onlySenseIds?.forEach((senseId) => { delete accumulated[senseId]; });
      const unresolvedSenseIds = () => senses
        .map((sense) => sense.id)
        .filter((senseId) => !accumulated[senseId]);
      const requestedUnresolvedSenseIds = () => onlySenseIds
        ? [...onlySenseIds].filter((senseId) => !accumulated[senseId])
        : unresolvedSenseIds();
      let remainingSenseIds = requestedUnresolvedSenseIds();

      if (remainingSenseIds.length === 0) {
        const explanation = parseStoredWordExplanation(
          { senseContent: accumulated },
          senses,
          word.word,
        );
        const qualityIssues = assessWordCoachQuality(word, explanation, config.outputLanguage);
        const hardErrors = qualityIssues.filter((issue) => issue.severity === 'error');
        if (hardErrors.length === 0) {
          delete partialRecords[word.id];
          return {
            explanation,
            qualityWarnings: qualityIssues.filter((issue) => issue.severity === 'warning'),
            attempts: 0,
            durationMs: Date.now() - startedAt,
            phase: 'generate',
          };
        }
        remainingSenseIds = senses.map((sense) => sense.id);
        remainingSenseIds.forEach((senseId) => { delete accumulated[senseId]; });
      }

      for (let attempt = 0; attempt <= retries; attempt += 1) {
        emit('word-start', {
          wordId: word.id,
          word: word.word,
          laneId,
          queuePosition,
          phase: 'generate',
          attempt: attempt + 1,
          maxAttempts: retries + 1,
          senseIds: remainingSenseIds,
        });
        try {
          const generated = await explainWord(config, word, {
            repairFeedback: lastError
              ? lastError instanceof Error ? lastError.message : String(lastError)
              : undefined,
            lexicalSenses: lexicon.words[word.id]?.senses ?? [],
            senseIds: remainingSenseIds,
          });
          Object.assign(accumulated, generated.senseContent);
          remainingSenseIds = requestedUnresolvedSenseIds();
          if (remainingSenseIds.length > 0) {
            throw new Error(`AI 未返回 ${remainingSenseIds[0]} 的学习内容。`);
          }
          const unresolved = unresolvedSenseIds();
          if (onlySenseIds && unresolved.length > 0) {
            partialRecords[word.id] = {
              promptVersion: WORD_COACH_PROMPT_VERSION,
              sourceHash,
              senseContent: accumulated,
              failedSenseIds: unresolved,
              updatedAt: new Date().toISOString(),
            };
            return {
              partialOnly: true,
              senseIds: [...onlySenseIds],
              attempts: attempt + 1,
              durationMs: Date.now() - startedAt,
              phase: 'generate',
            };
          }
          const explanation = parseStoredWordExplanation(
            { senseContent: accumulated },
            senses,
            word.word,
          );
          const qualityIssues = assessWordCoachQuality(
            word,
            explanation,
            config.outputLanguage,
          );
          const hardErrors = qualityIssues.filter((issue) => issue.severity === 'error');
          if (hardErrors.length > 0) {
            const failedIndexes = hardErrors.flatMap((issue) => {
              const match = issue.code.match(/-(\d+)$/);
              return match ? [Number(match[1])] : [];
            });
            remainingSenseIds = failedIndexes.length > 0
              ? failedIndexes.map((index) => senses[index]?.id).filter(Boolean)
              : senses.map((sense) => sense.id);
            remainingSenseIds.forEach((senseId) => { delete accumulated[senseId]; });
            throw new Error(hardErrors.map((issue) => issue.message).join(' '));
          }
          delete partialRecords[word.id];
          return {
            explanation,
            qualityWarnings: qualityIssues.filter((issue) => issue.severity === 'warning'),
            attempts: attempt + 1,
            durationMs: Date.now() - startedAt,
            phase: 'generate',
          };
        } catch (error) {
          lastError = error;
          if (error instanceof PartialWordExplanationError) {
            Object.assign(accumulated, error.partialSenseContent);
            remainingSenseIds = requestedUnresolvedSenseIds();
          }
          if (attempt < retries) {
            emit('word-retry', {
              wordId: word.id,
              word: word.word,
              laneId,
              queuePosition,
              attempt: attempt + 1,
              senseIds: remainingSenseIds,
              message: error instanceof Error ? error.message : String(error),
            });
            await new Promise((resolveDelay) => {
              setTimeout(resolveDelay, Math.min(8000, 500 * (2 ** attempt)));
            });
          }
        }
      }
      const terminalError = new Error(
        lastError instanceof Error ? lastError.message : String(lastError),
      );
      terminalError.partialSenseContent = accumulated;
      terminalError.failedSenseIds = remainingSenseIds;
      throw terminalError;
    }

    async function writeShard(shardId) {
      const records = shards.get(shardId) ?? {};
      const destination = resolve(shardDirectory, `${shardId}.json`);
      if (Object.keys(records).length === 0) {
        shards.delete(shardId);
        await rm(destination, { force: true });
        return;
      }
      const sorted = Object.fromEntries(
        Object.entries(records).sort(([left], [right]) => left.localeCompare(right, 'en')),
      );
      const temporary = `${destination}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({
        schemaVersion: WORD_COACH_SCHEMA_VERSION,
        records: sorted,
      }), 'utf8');
      await rename(temporary, destination);
    }

    async function writeJsonAtomic(destination, value, pretty = false) {
      const temporary = `${destination}.${process.pid}.tmp`;
      const serialized = pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value);
      await writeFile(temporary, serialized, 'utf8');
      await rename(temporary, destination);
    }

    async function writeCheckpoint() {
      const generatedCount = [...allWords.values()].filter((word) => (
        recordIsCurrent(word, recordFor(word))
      )).length;
      await mkdir(failureDirectory, { recursive: true });
      await Promise.all([
        writeJsonAtomic(resolve(outputRoot, 'manifest.json'), {
          schemaVersion: WORD_COACH_SCHEMA_VERSION,
          promptVersion: WORD_COACH_PROMPT_VERSION,
          shardCount: WORD_COACH_SHARD_COUNT,
          lexiconSchemaVersion: lexicon.schemaVersion,
          dictionarySource: {
            bundleIdentifier: lexicon.source.bundleIdentifier,
            bundleVersion: lexicon.source.bundleVersion,
            contentCopyright: lexicon.source.contentCopyright,
          },
          outputLanguage: config.outputLanguage,
          model: config.model,
          generatedAt: new Date().toISOString(),
          uniqueWordCount: allWords.size,
          generatedCount,
          complete: generatedCount === allWords.size,
        }, true),
        writeJsonAtomic(failurePath, failures, true),
        writeJsonAtomic(partialPath, { version: 1, records: partialRecords }, true),
      ]);
      return { generatedCount };
    }

    await Promise.all([...staleShardIds].map(writeShard));
    await writeCheckpoint();
    for (let offset = 0; offset < pending.length; offset += concurrency) {
      const batch = pending.slice(offset, offset + concurrency);
      const results = await Promise.allSettled(batch.map((word, laneId) => (
        generateWithRetry(word, laneId, offset + laneId)
      )));
      const dirtyShards = new Set();
      const completedEvents = [];
      const partialCompletedEvents = [];
      const failedEvents = [];

      results.forEach((result, index) => {
        const word = batch[index];
        const laneId = index;
        const queuePosition = offset + index;
        if (result.status === 'rejected') {
          if (result.reason?.partialSenseContent) {
            partialRecords[word.id] = {
              promptVersion: WORD_COACH_PROMPT_VERSION,
              sourceHash: wordCoachSourceHash(word),
              senseContent: result.reason.partialSenseContent,
              failedSenseIds: result.reason.failedSenseIds ?? [],
              updatedAt: new Date().toISOString(),
            };
          }
          failures.push({
            wordId: word.id,
            message: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
          failedEvents.push({
            wordId: word.id,
            word: word.word,
            laneId,
            queuePosition,
            message: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
          return;
        }
        if (result.value.partialOnly) {
          partialCompletedEvents.push({
            wordId: word.id,
            word: word.word,
            laneId,
            queuePosition,
            senseIds: result.value.senseIds,
            attempts: result.value.attempts,
            durationMs: result.value.durationMs,
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
          senseContent: result.value.explanation.senseContent,
        };
        shards.set(shardId, records);
        dirtyShards.add(shardId);
        const event = {
          wordId: word.id,
          word: word.word,
          laneId,
          queuePosition,
          shardId,
          attempts: result.value.attempts,
          durationMs: result.value.durationMs,
          qualityWarnings: result.value.qualityWarnings,
          senseCount: result.value.explanation.senseExamples.length,
          phase: result.value.phase,
        };
        completed += 1;
        completedEvents.push(event);
      });

      completedEvents.forEach((event) => emit('word-writing', {
        wordId: event.wordId,
        word: event.word,
        laneId: event.laneId,
        queuePosition: event.queuePosition,
        phase: 'write',
      }));
      await Promise.all([...dirtyShards].map(writeShard));
      await writeCheckpoint();
      completedEvents.forEach((event) => emit('word-complete', event));
      partialCompletedEvents.forEach((event) => emit('word-partial-complete', event));
      failedEvents.forEach((event) => emit('word-failed', event));
      const progress = {
        processed: Math.min(offset + batch.length, pending.length),
        pending: pending.length,
        saved: completed,
        blocked: 0,
        failed: failures.length,
      };
      emit(
        'batch-complete',
        progress,
        `Generated ${progress.processed}/${progress.pending} (${progress.saved} saved, ${progress.failed} failed)`,
      );
    }

    const { generatedCount } = await writeCheckpoint();
    emit('complete', {
      generatedCount,
      corpusWordCount: allWords.size,
      failureCount: failures.length,
      blockedCount: 0,
    }, `Corpus coverage: ${generatedCount}/${allWords.size}. Failures: ${failures.length}.`);
    if (failures.length > 0) process.exitCode = 1;
  }
} finally {
  await releaseGenerationLock();
  await vite.close();
}
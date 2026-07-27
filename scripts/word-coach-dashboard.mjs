import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { resolveWordGridState, wordGridDeltaForEvent } from './lib/wordGridState.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bankDirectory = resolve(projectRoot, 'public/data/exam-banks');
const coachDirectory = resolve(projectRoot, 'public/data/word-coach');
const shardDirectory = resolve(coachDirectory, 'v1');
const internalDirectory = resolve(projectRoot, '.word-coach');
const statePath = resolve(internalDirectory, 'dashboard-state.json');
const credentialsPath = resolve(internalDirectory, 'credentials.json');
const partialSensePath = resolve(internalDirectory, 'partial-sense-content.json');
const dashboardPath = resolve(projectRoot, 'scripts/word-coach-dashboard.html');
const lexiconPath = resolve(projectRoot, 'public/data/lexicon/words.json');
const wordQuestLogoPath = resolve(projectRoot, 'scripts/assets/word-quest-lexicon-forge-logo.png');
const lilitaFontPath = resolve(projectRoot, 'node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2');
const pipelinePath = resolve(projectRoot, 'scripts/run-word-coach-pipeline.mjs');
const port = Number(process.env.WORDBUDDY_COACH_DASHBOARD_PORT ?? 4175);
const host = process.env.WORDBUDDY_COACH_DASHBOARD_HOST ?? '127.0.0.1';
const MAX_EVENTS = 160;
const QUEUE_ORDER_VERSION = 'journey-level-v1';

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('WORDBUDDY_COACH_DASHBOARD_PORT must be a valid port.');
}

const defaultState = {
  version: 4,
  settings: {
    endpoint: process.env.WORDBUDDY_AI_ENDPOINT ?? 'http://127.0.0.1:8191/v1',
    model: process.env.WORDBUDDY_AI_MODEL ?? 'Qwen3.6-35B-A3B-4bit',
    apiKey: process.env.WORDBUDDY_AI_API_KEY ?? '',
    authMode: process.env.WORDBUDDY_AI_AUTH_MODE === 'api-key' ? 'api-key' : 'bearer',
    outputLanguage: process.env.WORDBUDDY_AI_OUTPUT_LANGUAGE ?? 'Simplified Chinese',
    concurrency: 2,
  },
  job: {
    status: 'idle',
    scope: 'pilot',
    bank: 'gaokao',
    pilotSize: 20,
    targetWordIds: [],
    promptVersion: null,
    queueOrderVersion: null,
    startedAt: null,
    pausedAt: null,
    finishedAt: null,
    lastError: null,
    pauseRequested: false,
  },
  events: [],
};

async function loadState() {
  try {
    const stored = JSON.parse(await readFile(statePath, 'utf8'));
    const state = {
      ...defaultState,
      ...stored,
      settings: { ...defaultState.settings, ...stored.settings },
      job: { ...defaultState.job, ...stored.job },
      events: Array.isArray(stored.events) ? stored.events.slice(-MAX_EVENTS) : [],
    };
    if (Number(stored.version ?? 0) < 4) {
      state.version = 4;
      delete state.settings.qualityMode;
    }
    if (state.job.status === 'running') {
      state.job.status = 'paused';
      state.job.pausedAt = new Date().toISOString();
      state.job.lastError = '控制台服务曾中断，已从磁盘检查点恢复为暂停状态。';
    } else if (state.job.status === 'failed') {
      // A freshly started console owns no live generator, so a prior non-zero
      // exit (e.g. a handful of hard words that miss the quality gate) is
      // resumable rather than terminal. Present it as paused and drop the stale
      // process-exit banner; per-word failures still surface in the failures list.
      state.job.status = 'paused';
      state.job.pausedAt = new Date().toISOString();
      state.job.lastError = null;
    }
    return state;
  } catch {
    return structuredClone(defaultState);
  }
}

let dashboardState = await loadState();
dashboardState.settings.apiKey = await loadStoredApiKey() || dashboardState.settings.apiKey;
let persistChain = Promise.resolve();
let storageError = null;
let childProcess = null;
let childLineBuffer = '';
let generatorCompleteEvent = null;
let generationOverride = null;
let wordGridRevision = 0;
let canonicalLexicon = { schemaVersion: 3, words: {} };
let corpusScan = {
  generatedIds: new Set(),
  invalid: [],
  records: new Map(),
  staleCount: 0,
  storageBytes: 0,
  shardCount: 0,
  scannedAt: null,
};
const activeWords = new Map();
const sseClients = new Set();

const bankManifest = JSON.parse(await readFile(resolve(bankDirectory, 'manifest.json'), 'utf8'));
canonicalLexicon = JSON.parse(await readFile(lexiconPath, 'utf8'));
const wordsById = new Map();
const wordIdsByBank = new Map();

for (const bank of bankManifest.banks) {
  const entries = JSON.parse(await readFile(resolve(bankDirectory, bank.file), 'utf8'));
  wordIdsByBank.set(bank.id, entries.map((entry) => entry.id));
  entries.forEach((entry) => wordsById.set(entry.id, entry));
}

const vite = await createViteServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});
const aiClient = await vite.ssrLoadModule('/src/services/aiClient.ts');
const coachContract = await vite.ssrLoadModule('/src/domain/wordCoach.ts');
const wordText = await vite.ssrLoadModule('/src/domain/wordText.ts');
const journey = await vite.ssrLoadModule('/src/domain/journey.ts');
const {
  WORD_COACH_PROMPT_VERSION,
  WORD_COACH_SCHEMA_VERSION,
  assessWordCoachQuality,
  wordCoachShardId,
  wordCoachSourceHash,
} = coachContract;
const { parseStoredWordExplanation, requestCompletion } = aiClient;
const { parseDefinitionSenses, parseWordSenses } = wordText;
const { orderWordsByJourney } = journey;
const orderedWordIdsByBank = new Map(bankManifest.banks.map((bank) => [
  bank.id,
  orderWordsByJourney(
    (wordIdsByBank.get(bank.id) ?? []).map((wordId) => wordsById.get(wordId)),
    bank.id,
  ).map((word) => word.id),
]));
const allJourneyWordIds = [];
const allJourneyWordIdSet = new Set();
for (const bank of bankManifest.banks) {
  for (const wordId of orderedWordIdsByBank.get(bank.id) ?? []) {
    if (allJourneyWordIdSet.has(wordId)) continue;
    allJourneyWordIdSet.add(wordId);
    allJourneyWordIds.push(wordId);
  }
}

if (dashboardState.job.promptVersion !== WORD_COACH_PROMPT_VERSION
  || dashboardState.job.queueOrderVersion !== QUEUE_ORDER_VERSION) {
  dashboardState.job = {
    ...dashboardState.job,
    status: dashboardState.job.targetWordIds.length > 0 ? 'paused' : 'idle',
    promptVersion: WORD_COACH_PROMPT_VERSION,
    queueOrderVersion: QUEUE_ORDER_VERSION,
    targetWordIds: [],
    startedAt: null,
    pausedAt: dashboardState.job.targetWordIds.length > 0 ? new Date().toISOString() : null,
    finishedAt: null,
    lastError: null,
    pauseRequested: false,
  };
  dashboardState.events = [];
}

async function loadStoredApiKey() {
  try {
    const stored = JSON.parse(await readFile(credentialsPath, 'utf8'));
    return String(stored.apiKey ?? '').trim();
  } catch {
    return '';
  }
}

/**
 * Credentials live outside dashboard-state.json so the shareable state file
 * never carries a secret, and the key file stays owner-only.
 */
async function persistApiKey(apiKey) {
  await mkdir(internalDirectory, { recursive: true });
  const temporary = `${credentialsPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ apiKey }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, credentialsPath);
}

/**
 * A failed write must never take the console down or wedge the queue: the
 * in-memory state stays authoritative and the reason surfaces in the UI.
 */
function persistState() {
  const sanitized = {
    ...dashboardState,
    settings: Object.fromEntries(
      Object.entries(dashboardState.settings).filter(([key]) => !/key|token|secret/i.test(key)),
    ),
  };
  const snapshot = JSON.stringify(sanitized, null, 2);
  persistChain = persistChain.catch(() => {}).then(async () => {
    try {
      await mkdir(internalDirectory, { recursive: true });
      const temporary = `${statePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${snapshot}\n`, 'utf8');
      await rename(temporary, statePath);
      storageError = null;
    } catch (error) {
      storageError = error.code === 'ENOSPC'
        ? '磁盘空间不足，控制台状态无法写盘；进度仍在内存中，请清理磁盘后重试。'
        : `控制台状态写盘失败：${error.message}`;
    }
  });
  return persistChain;
}

function addEvent(type, data = {}) {
  dashboardState.events.push({
    type,
    timestamp: new Date().toISOString(),
    ...data,
  });
  dashboardState.events = dashboardState.events.slice(-MAX_EVENTS);
}

function chineseSenseCount(word) {
  return parseDefinitionSenses(word.definitionZh).length;
}

function humanizeSenseIds(message, wordId) {
  if (typeof message !== 'string' || !message || !wordId) return message;
  const word = wordsById.get(wordId);
  if (!word) return message;
  let readable = message;
  parseWordSenses(word).forEach((sense, index) => {
    if (!sense.id || !readable.includes(sense.id)) return;
    const description = [sense.label, sense.text].filter(Boolean).join(' ');
    readable = readable.split(sense.id).join(`第 ${index + 1} 个义项（${description}）`);
  });
  return readable
    .replace(/缺少\s*(第 \d+ 个义项（[^）]+）)\s*例句/gu, '缺少$1的例句')
    .replace(/为\s*(第 \d+ 个义项（[^）]+）)\s*返回/gu, '为$1返回');
}

function presentEvent(event) {
  if (!event || typeof event !== 'object') return event;
  return {
    ...event,
    message: humanizeSenseIds(event.message, event.wordId),
  };
}

/** The stored key wins; the launch environment stays a fallback. */
function resolvedApiKey() {
  return String(dashboardState.settings.apiKey || process.env.WORDBUDDY_AI_API_KEY || '').trim();
}

/** Connection config for a live model call. Never leaves the server process. */
function connectionConfig(overrides = {}) {
  return {
    endpoint: String(overrides.endpoint ?? dashboardState.settings.endpoint).trim(),
    model: String(overrides.model ?? dashboardState.settings.model).trim(),
    apiKey: String(overrides.apiKey ?? resolvedApiKey()).trim(),
    authMode: (overrides.authMode ?? dashboardState.settings.authMode) === 'api-key'
      ? 'api-key'
      : 'bearer',
    outputLanguage: String(overrides.outputLanguage ?? dashboardState.settings.outputLanguage).trim(),
  };
}

function senseGapSummary(wordIds) {
  let senses = 0;
  let fromDictionary = 0;
  for (const wordId of wordIds) {
    for (const sense of canonicalLexicon.words?.[wordId]?.senses ?? []) {
      senses += 1;
      if (sense.examples?.length > 0) fromDictionary += 1;
    }
  }
  return { senses, fromDictionary, generated: senses - fromDictionary };
}

function selectPilotWordIds(bankId, size) {
  const sourceIds = orderedWordIdsByBank.get(bankId) ?? [];
  const targetSize = Math.min(Math.max(1, size), sourceIds.length);
  return sourceIds.slice(0, targetSize);
}

function targetWordIds(scope, bank, pilotSize) {
  if (scope === 'all') return [...allJourneyWordIds];
  if (scope === 'bank') return [...(orderedWordIdsByBank.get(bank) ?? [])];
  return selectPilotWordIds(bank, pilotSize);
}

function inspectRecord(wordId, record, outputLanguage) {
  const word = wordsById.get(wordId);
  if (!word) throw new Error('词条不在考试词库中。');
  if (record.sourceHash !== wordCoachSourceHash(word)) throw new Error('词典指纹已过期。');
  const explanation = parseStoredWordExplanation(
    record,
    parseWordSenses(word),
    word.word,
  );
  if (record.promptVersion !== WORD_COACH_PROMPT_VERSION) throw new Error('提示词版本已过期。');
  const heuristicIssues = assessWordCoachQuality(word, explanation, outputLanguage);
  const issues = heuristicIssues;
  const hasError = issues.some((issue) => issue.severity === 'error');
  return {
    word,
    record,
    explanation,
    issues,
    status: hasError
        ? 'invalid'
      : issues.some((issue) => issue.severity === 'warning')
        ? 'warning'
        : 'pass',
  };
}

async function scanCorpus() {
  const generatedIds = new Set();
  const invalid = [];
  const records = new Map();
  let staleCount = 0;
  let storageBytes = 0;
  const filenames = (await readdir(shardDirectory).catch(() => []))
    .filter((filename) => /^[0-9a-f]{2}\.json$/.test(filename));
  let outputLanguage = dashboardState.settings.outputLanguage;
  try {
    const manifest = JSON.parse(await readFile(resolve(coachDirectory, 'manifest.json'), 'utf8'));
    outputLanguage = manifest.outputLanguage ?? outputLanguage;
  } catch {
    // A fresh corpus has no manifest yet.
  }

  for (const filename of filenames) {
    const path = resolve(shardDirectory, filename);
    const shard = JSON.parse(await readFile(path, 'utf8'));
    storageBytes += (await stat(path)).size;
    if (shard.schemaVersion !== WORD_COACH_SCHEMA_VERSION || !shard.records) {
      invalid.push({ wordId: filename, message: '分片格式或版本无效。' });
      continue;
    }
    for (const [wordId, record] of Object.entries(shard.records)) {
      try {
        if (wordCoachShardId(wordId) !== filename.slice(0, 2)) {
          throw new Error('词条存放在错误分片。');
        }
        const word = wordsById.get(wordId);
        if (!word) throw new Error('词条不在考试词库中。');
        if (record.promptVersion !== WORD_COACH_PROMPT_VERSION) {
          staleCount += 1;
          continue;
        }
        const inspected = inspectRecord(wordId, record, outputLanguage);
        records.set(wordId, inspected);
        if (inspected.status === 'pass' || inspected.status === 'warning') generatedIds.add(wordId);
        else if (inspected.status === 'invalid') {
          invalid.push({ wordId, message: inspected.issues.map((issue) => issue.message).join(' ') });
        }
      } catch (error) {
        invalid.push({
          wordId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  corpusScan = {
    generatedIds,
    invalid,
    records,
    staleCount,
    storageBytes,
    shardCount: filenames.length,
    scannedAt: new Date().toISOString(),
  };
}

async function refreshWord(wordId) {
  const shardId = wordCoachShardId(wordId);
  try {
    corpusScan.invalid = corpusScan.invalid.filter((record) => record.wordId !== wordId);
    corpusScan.generatedIds.delete(wordId);
    const shard = JSON.parse(await readFile(resolve(shardDirectory, `${shardId}.json`), 'utf8'));
    const record = shard.records?.[wordId];
    if (!record) return;
    const inspected = inspectRecord(wordId, record, dashboardState.settings.outputLanguage);
    corpusScan.records.set(wordId, inspected);
    if (inspected.status === 'pass' || inspected.status === 'warning') {
      corpusScan.generatedIds.add(wordId);
    } else if (inspected.status === 'invalid') {
      corpusScan.invalid.push({
        wordId,
        message: inspected.issues.map((issue) => issue.message).join(' '),
      });
    }
  } catch (error) {
    corpusScan.invalid.push({
      wordId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function targetIds() {
  return dashboardState.job.targetWordIds.length > 0
    ? dashboardState.job.targetWordIds
    : targetWordIds(
        dashboardState.job.scope,
        dashboardState.job.bank,
        dashboardState.job.pilotSize,
      );
}

function recordIsGenerated(inspected) {
  return Boolean(inspected && ['pass', 'warning'].includes(inspected.status));
}

function reconcileJobWithCorpus() {
  if (childProcess || ['running', 'pausing'].includes(dashboardState.job.status)) return false;
  const targets = targetIds();
  const resolved = targets.length > 0 && targets.every((wordId) => (
    recordIsGenerated(corpusScan.records.get(wordId))
  ));
  if (!resolved) {
    if (dashboardState.job.status !== 'completed') return false;
    dashboardState.job.status = 'paused';
    dashboardState.job.pausedAt = new Date().toISOString();
    dashboardState.job.finishedAt = null;
    return true;
  }
  const changed = dashboardState.job.status !== 'completed'
    || dashboardState.job.lastError !== null;
  dashboardState.job.status = 'completed';
  dashboardState.job.pausedAt = null;
  dashboardState.job.finishedAt ??= new Date().toISOString();
  dashboardState.job.lastError = null;
  dashboardState.job.pauseRequested = false;
  return changed;
}

function statusPayload() {
  const targets = targetIds();
  const targetSet = new Set(targets);
  const completedIds = targets.filter((wordId) => (
    recordIsGenerated(corpusScan.records.get(wordId))
  ));
  const inspectedTargets = [...corpusScan.records.entries()]
    .filter(([wordId]) => targetSet.has(wordId));
  const quality = {
    pass: inspectedTargets.filter(([, record]) => record.status === 'pass').length,
    warning: inspectedTargets.filter(([, record]) => record.status === 'warning').length,
    invalid: corpusScan.invalid.filter((record) => targetSet.has(record.wordId)).length,
  };
  const completionEvents = dashboardState.events.filter((event) => (
    event.type === 'word-complete'
  ));
  const recentCompletions = completionEvents.slice(-30);
  let wordsPerMinute = 0;
  if (recentCompletions.length >= 2) {
    const elapsedMs = Date.parse(recentCompletions.at(-1).timestamp)
      - Date.parse(recentCompletions[0].timestamp);
    if (elapsedMs > 0) wordsPerMinute = ((recentCompletions.length - 1) * 60000) / elapsedMs;
  } else if (recentCompletions.length === 1 && recentCompletions[0].durationMs > 0) {
    wordsPerMinute = (60000 / recentCompletions[0].durationMs)
      * dashboardState.settings.concurrency;
  }
  const resolved = completedIds.length;
  const remaining = Math.max(0, targets.length - resolved);
  const etaSeconds = wordsPerMinute > 0 ? (remaining / wordsPerMinute) * 60 : null;
  const recentIds = completionEvents
    .map((event) => event.wordId)
    .filter((wordId, index, values) => values.lastIndexOf(wordId) === index)
    .slice(-20)
    .reverse();
  const fallbackIds = completedIds.slice(-20).reverse();
  const recentRecords = (recentIds.length > 0 ? recentIds : fallbackIds)
    .map((wordId) => corpusScan.records.get(wordId))
    .filter(Boolean)
    .map((record) => ({
      wordId: record.word.id,
      word: record.word.word,
      status: record.status,
      senseCount: record.explanation.senseExamples.length,
      issueCount: record.issues.length,
      preview: record.explanation.markdown.replace(/[#*`_\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140),
    }));
  const failureEvents = dashboardState.events
    .filter((event) => event.type === 'word-failed')
    .slice(-20)
    .reverse()
    .map(presentEvent);

  return {
    serverTime: new Date().toISOString(),
    wordGridRevision,
    storageError,
    settings: {
      // The key itself never leaves the server; the client only learns whether one exists.
      ...dashboardState.settings,
      apiKey: undefined,
      apiKeyConfigured: Boolean(resolvedApiKey()),
    },
    job: {
      ...dashboardState.job,
      pid: childProcess?.pid ?? null,
      targetTotal: targets.length,
      completed: completedIds.length,
      resolved,
      remaining,
      generationPending: remaining,
      progressPercent: targets.length > 0 ? (resolved / targets.length) * 100 : 0,
      wordsPerMinute,
      etaSeconds,
    },
    activeWords: [...activeWords.values()].map(presentEvent),
    quality,
    corpus: {
      generatedCount: corpusScan.generatedIds.size,
      uniqueWordCount: wordsById.size,
      coveragePercent: wordsById.size > 0
        ? (corpusScan.generatedIds.size / wordsById.size) * 100
        : 0,
      coverageByBank: Object.fromEntries(bankManifest.banks.map((bank) => {
        const bankWordIds = wordIdsByBank.get(bank.id) ?? [];
        const covered = bankWordIds.filter((wordId) => corpusScan.generatedIds.has(wordId)).length;
        return [bank.id, {
          covered,
          total: bankWordIds.length,
          percent: bankWordIds.length > 0 ? (covered / bankWordIds.length) * 100 : 0,
        }];
      })),
      invalidCount: corpusScan.invalid.length,
      staleCount: corpusScan.staleCount,
      shardCount: corpusScan.shardCount,
      storageBytes: corpusScan.storageBytes,
      scannedAt: corpusScan.scannedAt,
    },
    senseGap: senseGapSummary(targets),
    recentRecords,
    failures: failureEvents,
    events: dashboardState.events.slice(-40).reverse().map(presentEvent),
    pilotWords: targets.slice(0, dashboardState.job.scope === 'pilot' ? targets.length : 20)
      .map((wordId) => ({
        wordId,
        word: wordsById.get(wordId)?.word ?? wordId,
        senseCount: wordsById.has(wordId) ? chineseSenseCount(wordsById.get(wordId)) : 0,
        completed: corpusScan.generatedIds.has(wordId),
      })),
  };
}

function latestFailedWordIds() {
  const failed = new Set();
  for (const event of dashboardState.events) {
    if (!event.wordId) continue;
    if (event.type === 'word-failed') failed.add(event.wordId);
    else if (event.type === 'word-complete') failed.delete(event.wordId);
  }
  return failed;
}

function wordGridSnapshot() {
  const targets = targetIds();
  const failures = latestFailedWordIds();
  const invalid = new Set(corpusScan.invalid.map((item) => item.wordId));
  const cells = targets.map((wordId, index) => {
    const word = wordsById.get(wordId);
    const active = activeWords.get(wordId) ?? null;
    const recordStatus = corpusScan.records.get(wordId)?.status ?? (invalid.has(wordId) ? 'invalid' : null);
    const state = resolveWordGridState({
      active,
      recordStatus,
      failed: failures.has(wordId),
    });
    return {
      index,
      wordId,
      word: word?.word ?? wordId,
      state,
      senseCount: word ? chineseSenseCount(word) : 0,
      laneId: active?.laneId ?? null,
      phase: active?.phase ?? null,
      attempt: active?.attempt ?? null,
      maxAttempts: active?.maxAttempts ?? null,
      startedAt: active?.startedAt ?? active?.timestamp ?? null,
    };
  });
  const counts = Object.fromEntries(
    ['pending', 'processing', 'retrying', 'pass', 'warning', 'failed']
      .map((state) => [state, cells.filter((cell) => cell.state === state).length]),
  );
  return {
    revision: wordGridRevision,
    generatedAt: new Date().toISOString(),
    total: cells.length,
    bank: dashboardState.job.bank,
    scope: dashboardState.job.scope,
    counts,
    cells,
  };
}

async function wordGridDetail(wordId) {
  const snapshot = wordGridSnapshot();
  const cell = snapshot.cells.find((candidate) => candidate.wordId === wordId);
  if (!cell) return null;
  const word = wordsById.get(wordId);
  const inspected = corpusScan.records.get(wordId);
  const partialDocument = JSON.parse(
    await readFile(partialSensePath, 'utf8').catch(() => '{"records":{}}'),
  );
  const partialRecord = partialDocument.records?.[wordId];
  const currentPartial = partialRecord?.promptVersion === WORD_COACH_PROMPT_VERSION
    && partialRecord.sourceHash === wordCoachSourceHash(word)
    ? partialRecord
    : null;
  const active = activeWords.get(wordId) ?? null;
  const events = dashboardState.events
    .filter((event) => event.wordId === wordId)
    .slice(-12)
    .reverse()
    .map(presentEvent);
  const senses = word ? parseWordSenses(word) : [];
  const targetSenseIds = new Set(active?.senseIds
    ?? currentPartial?.failedSenseIds
    ?? []);
  if (cell.state === 'failed' && targetSenseIds.size === 0) {
    const failureMessage = events.find((event) => event.type === 'word-failed')?.message ?? '';
    for (const match of failureMessage.matchAll(/第\s*(\d+)\s*个义项/gu)) {
      const sense = senses[Number(match[1]) - 1];
      if (sense?.id) targetSenseIds.add(sense.id);
    }
  }
  return {
    cell,
    word,
    // Same sense spine the record dialog uses, so both views split glosses
    // through one parser instead of re-deriving them in the browser.
    senses,
    dictionarySenses: canonicalLexicon.words?.[wordId]?.senses ?? [],
    partialSenseContent: currentPartial?.senseContent ?? {},
    targetSenseIds: [...targetSenseIds],
    levelNumber: Math.floor(cell.index / 25) + 1,
    positionInLevel: (cell.index % 25) + 1,
    active,
    senseGap: senseGapSummary([wordId]),
    events,
    record: inspected ? {
      status: inspected.status,
      issues: inspected.issues,
      explanation: inspected.explanation,
    } : null,
  };
}

function broadcast(gridDelta = null) {
  const payload = statusPayload();
  if (gridDelta) payload.wordGridDelta = gridDelta;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach((response) => response.write(data));
}

async function handleGeneratorEvent(event) {
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') return;
  if (event.type === 'word-start') {
    activeWords.set(event.wordId, { ...event, startedAt: event.timestamp });
  } else if (event.type === 'word-retry') {
    activeWords.set(event.wordId, { ...activeWords.get(event.wordId), ...event });
  } else if (event.type === 'word-writing') {
    activeWords.set(event.wordId, { ...activeWords.get(event.wordId), ...event });
  } else if (event.type === 'word-complete') {
    activeWords.delete(event.wordId);
    await refreshWord(event.wordId);
  } else if (event.type === 'word-partial-complete') {
    activeWords.delete(event.wordId);
  } else if (event.type === 'word-failed') {
    activeWords.delete(event.wordId);
  } else if (event.type === 'complete') {
    generatorCompleteEvent = event;
  }
  const gridDelta = wordGridDeltaForEvent(event);
  const partialRefresh = event.type === 'word-partial-complete';
  if (gridDelta || partialRefresh) wordGridRevision += 1;
  addEvent(event.type, event);
  await persistState();
  broadcast(gridDelta
    ? presentEvent({ revision: wordGridRevision, ...gridDelta })
    : partialRefresh
      ? { revision: wordGridRevision, type: 'refresh' }
      : null);
}

function childArguments() {
  const bank = generationOverride?.bank
    ?? (dashboardState.job.scope === 'all' ? 'all' : dashboardState.job.bank);
  const args = [
    pipelinePath,
    '--bank', bank,
    '--concurrency', String(dashboardState.settings.concurrency),
    '--retries', '1',
    '--json-events',
    '--execute',
  ];
  if (generationOverride?.wordIds.length) {
    args.push('--only', generationOverride.wordIds.join(','));
    if (generationOverride.senseIds?.length) {
      args.push('--sense', generationOverride.senseIds.join(','));
    }
  } else if (dashboardState.job.scope === 'pilot') {
    args.push('--only', dashboardState.job.targetWordIds.join(','));
  }
  return args;
}

async function startGeneration() {
  if (childProcess) throw new Error('生成任务已经在运行。');
  if (!dashboardState.settings.endpoint.trim() || !dashboardState.settings.model.trim()) {
    throw new Error('请先在「模型设置」里填写模型端点和模型 ID。');
  }
  if (!resolvedApiKey()) {
    throw new Error('请先在「模型设置」里填写并测试 API Key。');
  }

  dashboardState.job.status = 'running';
  dashboardState.job.promptVersion = WORD_COACH_PROMPT_VERSION;
  dashboardState.job.queueOrderVersion = QUEUE_ORDER_VERSION;
  dashboardState.job.startedAt ??= new Date().toISOString();
  dashboardState.job.pausedAt = null;
  dashboardState.job.finishedAt = null;
  dashboardState.job.lastError = null;
  dashboardState.job.pauseRequested = false;
  activeWords.clear();
  generatorCompleteEvent = null;
  addEvent('job-started', {
    scope: dashboardState.job.scope,
    bank: dashboardState.job.bank,
    targetTotal: dashboardState.job.targetWordIds.length,
  });
  await persistState();

  childProcess = spawn(process.execPath, childArguments(), {
    cwd: projectRoot,
    env: {
      ...process.env,
      WORDBUDDY_AI_ENDPOINT: dashboardState.settings.endpoint,
      WORDBUDDY_AI_MODEL: dashboardState.settings.model,
      WORDBUDDY_AI_API_KEY: resolvedApiKey(),
      WORDBUDDY_AI_AUTH_MODE: dashboardState.settings.authMode,
      WORDBUDDY_AI_OUTPUT_LANGUAGE: dashboardState.settings.outputLanguage,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  childLineBuffer = '';
  childProcess.stdout.setEncoding('utf8');
  childProcess.stdout.on('data', (chunk) => {
    childLineBuffer += chunk;
    const lines = childLineBuffer.split('\n');
    childLineBuffer = lines.pop() ?? '';
    lines.filter(Boolean).forEach((line) => {
      try {
        void handleGeneratorEvent(JSON.parse(line));
      } catch {
        addEvent('log', { message: line });
      }
    });
  });
  childProcess.stderr.setEncoding('utf8');
  childProcess.stderr.on('data', (chunk) => {
    addEvent('stderr', { message: String(chunk).trim().slice(0, 1000) });
    broadcast();
  });
  childProcess.on('exit', async (code, signal) => {
    const wasPaused = dashboardState.job.pauseRequested;
    const usedOverride = Boolean(generationOverride);
    const failedWordCount = Number(generatorCompleteEvent?.failureCount ?? 0);
    childProcess = null;
    generationOverride = null;
    activeWords.clear();
    await scanCorpus();
    const recoverableFailure = !wasPaused
      && code === 1
      && !signal
      && failedWordCount > 0;
    dashboardState.job.status = wasPaused
      ? 'paused'
      : recoverableFailure
        ? 'paused'
        : code === 0
          ? 'completed'
          : 'failed';
    dashboardState.job.pausedAt = (wasPaused || recoverableFailure) ? new Date().toISOString() : null;
    dashboardState.job.finishedAt = (wasPaused || recoverableFailure)
      ? null
      : new Date().toISOString();
    if (!wasPaused && code !== 0) {
      dashboardState.job.lastError = recoverableFailure
        ? `本轮结束：${failedWordCount} 个词生成失败，可继续重试。`
        : `生成进程退出（code=${code}, signal=${signal ?? 'none'}）。`;
    }
    dashboardState.job.pauseRequested = false;
    generatorCompleteEvent = null;
    if (usedOverride) reconcileJobWithCorpus();
    addEvent(wasPaused ? 'job-paused' : 'job-finished', { code, signal });
    await persistState();
    wordGridRevision += 1;
    broadcast({ revision: wordGridRevision, type: 'refresh' });
  });
  broadcast();
}

async function pauseGeneration() {
  if (!childProcess) return;
  dashboardState.job.pauseRequested = true;
  dashboardState.job.status = 'pausing';
  addEvent('pause-requested', { pid: childProcess.pid });
  await persistState();
  childProcess.kill('SIGTERM');
  broadcast();
}

function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/status') {
    json(response, 200, statusPayload());
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/grid') {
    json(response, 200, wordGridSnapshot());
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/grid/word') {
    const wordId = url.searchParams.get('id') ?? '';
    const detail = await wordGridDetail(wordId);
    if (!detail) {
      json(response, 404, { error: '该词不在当前生成任务中。' });
      return;
    }
    json(response, 200, detail);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/record') {
    const wordId = url.searchParams.get('id') ?? '';
    const inspected = corpusScan.records.get(wordId);
    if (!inspected) {
      json(response, 404, { error: '未找到该词的已生成讲解。' });
      return;
    }
    json(response, 200, {
      word: inspected.word,
      // The dialog renders one card per sense, so it needs the sense spine
      // (id/label/text) alongside the generated content keyed by the same ids.
      senses: parseWordSenses(inspected.word),
      explanation: inspected.explanation,
      status: inspected.status,
      issues: inspected.issues,
      metadata: {
        promptVersion: inspected.record.promptVersion,
        sourceHash: inspected.record.sourceHash,
      },
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    sseClients.add(response);
    response.write(`data: ${JSON.stringify(statusPayload())}\n\n`);
    request.on('close', () => sseClients.delete(response));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/start') {
    try {
      const body = await readJsonBody(request);
      const scope = ['pilot', 'bank', 'all'].includes(body.scope) ? body.scope : 'pilot';
      const bank = wordIdsByBank.has(body.bank) ? body.bank : 'gaokao';
      const pilotSize = Math.min(200, Math.max(1, Number(body.pilotSize) || 20));
      const concurrency = Math.min(16, Math.max(1, Number(body.concurrency) || 1));
      const changedJob = dashboardState.job.scope !== scope
        || dashboardState.job.bank !== bank
        || dashboardState.job.pilotSize !== pilotSize;
      dashboardState.settings = {
        ...dashboardState.settings,
        endpoint: String(body.endpoint ?? dashboardState.settings.endpoint).trim(),
        model: String(body.model ?? dashboardState.settings.model).trim(),
        outputLanguage: String(body.outputLanguage ?? dashboardState.settings.outputLanguage).trim(),
        authMode: body.authMode === 'api-key' ? 'api-key' : 'bearer',
        concurrency,
      };
      if (changedJob || dashboardState.job.targetWordIds.length === 0) {
        dashboardState.job = {
          ...defaultState.job,
          scope,
          bank,
          pilotSize,
          targetWordIds: targetWordIds(scope, bank, pilotSize),
        };
      }
      await startGeneration();
      json(response, 202, statusPayload());
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/target') {
    try {
      if (childProcess) throw new Error('生成进行中，请先暂停再切换目标。');
      const body = await readJsonBody(request);
      const scope = ['pilot', 'bank', 'all'].includes(body.scope) ? body.scope : dashboardState.job.scope;
      const bank = wordIdsByBank.has(body.bank) ? body.bank : dashboardState.job.bank;
      const pilotSize = Math.min(200, Math.max(1, Number(body.pilotSize) || dashboardState.job.pilotSize));
      const concurrency = Math.min(16, Math.max(1, Number(body.concurrency)
        || dashboardState.settings.concurrency));
      dashboardState.settings = { ...dashboardState.settings, concurrency };
      dashboardState.job = {
        ...dashboardState.job,
        scope,
        bank,
        pilotSize,
        status: 'idle',
        targetWordIds: [],
        startedAt: null,
        pausedAt: null,
        finishedAt: null,
        lastError: null,
        pauseRequested: false,
      };
      reconcileJobWithCorpus();
      await persistState();
      wordGridRevision += 1;
      broadcast({ revision: wordGridRevision, type: 'refresh' });
      json(response, 200, statusPayload());
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/connection/test') {
    try {
      const body = await readJsonBody(request);
      const candidate = connectionConfig({
        endpoint: body.endpoint,
        model: body.model,
        // An empty field means "keep the stored key" so the UI never has to echo it back.
        apiKey: String(body.apiKey ?? '').trim() || resolvedApiKey(),
        authMode: body.authMode,
      });
      if (!candidate.endpoint) throw new Error('请填写模型端点。');
      if (!candidate.model) throw new Error('请填写模型 ID。');
      if (!candidate.apiKey) throw new Error('请填写 API Key（本地模型可填任意占位值）。');
      const started = Date.now();
      const reply = await requestCompletion(
        candidate,
        [{ role: 'user', content: 'Reply with the single word: ready' }],
        fetch,
        { temperature: 0, maxTokens: 16 },
      );
      dashboardState.settings = {
        ...dashboardState.settings,
        endpoint: candidate.endpoint,
        model: candidate.model,
        apiKey: candidate.apiKey,
        authMode: candidate.authMode,
      };
      await persistApiKey(candidate.apiKey);
      await persistState();
      addEvent('connection-verified', { model: candidate.model, endpoint: candidate.endpoint });
      broadcast();
      json(response, 200, {
        ...statusPayload(),
        connectionTest: {
          ok: true,
          latencyMs: Date.now() - started,
          reply: String(reply).replace(/\s+/g, ' ').trim().slice(0, 80),
        },
      });
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/retry') {
    try {
      if (childProcess) throw new Error('生成进行中，请先暂停再重跑单个词。');
      const body = await readJsonBody(request);
      const wordId = String(body.wordId ?? '').trim();
      const word = wordsById.get(wordId);
      if (!word) throw new Error('该词不在考试词库中。');
      const senseId = String(body.senseId ?? '').trim();
      if (senseId && !parseWordSenses(word).some((sense) => sense.id === senseId)) {
        throw new Error('该义项不属于当前词条。');
      }
      const bank = bankManifest.banks
        .find((candidate) => (wordIdsByBank.get(candidate.id) ?? []).includes(wordId))?.id
        ?? dashboardState.job.bank;
      generationOverride = {
        bank,
        wordIds: [wordId],
        senseIds: senseId ? [senseId] : [],
      };
      try {
        await startGeneration();
      } catch (error) {
        generationOverride = null;
        throw error;
      }
      wordGridRevision += 1;
      broadcast({ revision: wordGridRevision, type: 'refresh' });
      json(response, 202, statusPayload());
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/pause') {
    await pauseGeneration();
    json(response, 202, statusPayload());
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/rescan') {
    await scanCorpus();
    const jobReconciled = reconcileJobWithCorpus();
    addEvent('corpus-rescanned', { generatedCount: corpusScan.generatedIds.size });
    if (jobReconciled) addEvent('job-reconciled', { status: dashboardState.job.status });
    await persistState();
    wordGridRevision += 1;
    broadcast({ revision: wordGridRevision, type: 'refresh' });
    json(response, 200, statusPayload());
    return;
  }
  json(response, 404, { error: 'Unknown API endpoint.' });
}

await scanCorpus();
reconcileJobWithCorpus();
await persistState();

const [dashboardHtml, wordQuestLogo, lilitaFont] = await Promise.all([
  readFile(dashboardPath, 'utf8'),
  readFile(wordQuestLogoPath),
  readFile(lilitaFontPath),
]);
const server = createHttpServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(dashboardHtml);
      return;
    }
    if (url.pathname === '/word-quest-lexicon-forge-logo.png') {
      response.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      });
      response.end(wordQuestLogo);
      return;
    }
    if (url.pathname === '/lilita-one.woff2') {
      response.writeHead(200, {
        'Content-Type': 'font/woff2',
        'Cache-Control': 'public, max-age=86400',
      });
      response.end(lilitaFont);
      return;
    }
    if (url.pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(404);
    response.end('Not found');
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Word coach dashboard: http://${host}:${port}/`);
  console.log(`Model: ${dashboardState.settings.model || '(not configured)'}`);
  console.log(`Endpoint: ${dashboardState.settings.endpoint || '(not configured)'}`);
});

async function shutdown() {
  if (childProcess) childProcess.kill('SIGTERM');
  sseClients.forEach((response) => response.end());
  server.close();
  await vite.close();
}

// A long-running console must survive transient I/O faults (a full disk, a
// vanished shard) instead of exiting and leaving the browser with "Failed to
// fetch". Report the reason and keep serving from memory.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  storageError = `控制台后台任务出错：${message}`;
  addEvent('stderr', { message });
  broadcast();
});

process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
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

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bankDirectory = resolve(projectRoot, 'public/data/exam-banks');
const coachDirectory = resolve(projectRoot, 'public/data/word-coach');
const shardDirectory = resolve(coachDirectory, 'v1');
const internalDirectory = resolve(projectRoot, '.word-coach');
const statePath = resolve(internalDirectory, 'dashboard-state.json');
const failurePath = resolve(internalDirectory, 'failures.json');
const dashboardPath = resolve(projectRoot, 'scripts/word-coach-dashboard.html');
const generatorPath = resolve(projectRoot, 'scripts/generate-word-coach.mjs');
const port = Number(process.env.WORDBUDDY_COACH_DASHBOARD_PORT ?? 4175);
const host = process.env.WORDBUDDY_COACH_DASHBOARD_HOST ?? '127.0.0.1';
const MAX_EVENTS = 160;
const QUEUE_ORDER_VERSION = 'journey-level-v1';

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('WORDBUDDY_COACH_DASHBOARD_PORT must be a valid port.');
}

const defaultState = {
  version: 2,
  settings: {
    endpoint: process.env.WORDBUDDY_AI_ENDPOINT ?? 'http://127.0.0.1:8191/v1',
    model: process.env.WORDBUDDY_AI_MODEL ?? 'Qwen3.6-35B-A3B-4bit',
    authMode: process.env.WORDBUDDY_AI_AUTH_MODE === 'api-key' ? 'api-key' : 'bearer',
    outputLanguage: process.env.WORDBUDDY_AI_OUTPUT_LANGUAGE ?? 'Simplified Chinese',
    concurrency: 2,
    qualityMode: 'unreviewed',
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
    if (Number(stored.version ?? 0) < 2 || state.settings.qualityMode === 'fast') {
      state.version = 2;
      state.settings.qualityMode = 'unreviewed';
    }
    if (state.job.status === 'running') {
      state.job.status = 'paused';
      state.job.pausedAt = new Date().toISOString();
      state.job.lastError = '控制台服务曾中断，已从磁盘检查点恢复为暂停状态。';
    }
    return state;
  } catch {
    return structuredClone(defaultState);
  }
}

let dashboardState = await loadState();
let persistChain = Promise.resolve();
let childProcess = null;
let childLineBuffer = '';
let generatorCompleteEvent = null;
let corpusScan = {
  generatedIds: new Set(),
  invalid: [],
  records: new Map(),
  storageBytes: 0,
  shardCount: 0,
  scannedAt: null,
};
const activeWords = new Map();
const sseClients = new Set();

const bankManifest = JSON.parse(await readFile(resolve(bankDirectory, 'manifest.json'), 'utf8'));
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
  WORD_COACH_REVIEW_VERSION,
  WORD_COACH_SCHEMA_VERSION,
  assessWordCoachQuality,
  wordCoachContentHash,
  wordCoachRecordHasSourceConflict,
  wordCoachRequiresSemanticReview,
  wordCoachShardId,
  wordCoachSourceHash,
} = coachContract;
const { parseStoredWordExplanation } = aiClient;
const { parseDefinitionSenses } = wordText;
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

function persistState() {
  const sanitized = {
    ...dashboardState,
    settings: Object.fromEntries(
      Object.entries(dashboardState.settings).filter(([key]) => !/key|token|secret/i.test(key)),
    ),
  };
  const snapshot = JSON.stringify(sanitized, null, 2);
  persistChain = persistChain.then(async () => {
    await mkdir(internalDirectory, { recursive: true });
    const temporary = `${statePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${snapshot}\n`, 'utf8');
    await rename(temporary, statePath);
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
    chineseSenseCount(word),
    word.word,
  );
  if (wordCoachRecordHasSourceConflict(word, record)) {
    return {
      word,
      record,
      explanation,
      issues: record.qualityReview?.issues ?? [],
      status: 'source-conflict',
    };
  }
  if (record.promptVersion !== WORD_COACH_PROMPT_VERSION) throw new Error('提示词版本已过期。');
  const heuristicIssues = assessWordCoachQuality(word, explanation, outputLanguage);
  const review = record.qualityReview;
  const reviewIsCurrent = review
    && review.reviewVersion === WORD_COACH_REVIEW_VERSION
    && review.contentHash === wordCoachContentHash(explanation);
  const semanticIssues = reviewIsCurrent ? review.issues : [];
  const issues = [...heuristicIssues, ...semanticIssues];
  const hasError = issues.some((issue) => issue.severity === 'error')
    || (reviewIsCurrent && review.verdict === 'fail');
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

function recordSatisfiesQualityMode(inspected) {
  if (!inspected || !['pass', 'warning'].includes(inspected.status)) return false;
  if (!wordCoachRequiresSemanticReview(
    inspected.word,
    dashboardState.settings.qualityMode,
  )) return true;
  const review = inspected.record.qualityReview;
  return Boolean(review
    && review.reviewVersion === WORD_COACH_REVIEW_VERSION
    && review.contentHash === wordCoachContentHash(inspected.explanation)
    && review.verdict !== 'fail');
}

function recordHasCurrentFailedReview(inspected) {
  if (!inspected) return false;
  const review = inspected.record.qualityReview;
  return Boolean(review
    && review.reviewVersion === WORD_COACH_REVIEW_VERSION
    && review.contentHash === wordCoachContentHash(inspected.explanation)
    && review.verdict === 'fail');
}

function reconcileJobWithCorpus() {
  if (childProcess || ['running', 'pausing'].includes(dashboardState.job.status)) return false;
  const targets = targetIds();
  const resolved = targets.length > 0 && targets.every((wordId) => {
    const inspected = corpusScan.records.get(wordId);
    return recordSatisfiesQualityMode(inspected)
      || inspected?.status === 'source-conflict'
      || recordHasCurrentFailedReview(inspected);
  });
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
    recordSatisfiesQualityMode(corpusScan.records.get(wordId))
  ));
  const inspectedTargets = [...corpusScan.records.entries()]
    .filter(([wordId]) => targetSet.has(wordId));
  const sourceConflictIds = inspectedTargets
    .filter(([, record]) => record.status === 'source-conflict')
    .map(([wordId]) => wordId);
  const reviewRejectedIds = inspectedTargets
    .filter(([, record]) => (
      record.status !== 'source-conflict' && recordHasCurrentFailedReview(record)
    ))
    .map(([wordId]) => wordId);
  const reviewPendingIds = inspectedTargets
    .filter(([, record]) => (
      ['pass', 'warning'].includes(record.status)
      && wordCoachRequiresSemanticReview(record.word, dashboardState.settings.qualityMode)
      && !recordSatisfiesQualityMode(record)
    ))
    .map(([wordId]) => wordId);
  const quality = {
    pass: inspectedTargets.filter(([, record]) => record.status === 'pass').length,
    warning: inspectedTargets.filter(([, record]) => record.status === 'warning').length,
    sourceConflict: sourceConflictIds.length,
    invalid: corpusScan.invalid.filter((record) => targetSet.has(record.wordId)).length,
  };
  const completionEvents = dashboardState.events.filter((event) => (
    event.type === 'word-complete' || event.type === 'word-blocked'
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
  const resolved = completedIds.length + sourceConflictIds.length + reviewRejectedIds.length;
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
    .reverse();

  return {
    serverTime: new Date().toISOString(),
    settings: {
      ...dashboardState.settings,
      apiKeyConfigured: Boolean(process.env.WORDBUDDY_AI_API_KEY),
    },
    job: {
      ...dashboardState.job,
      pid: childProcess?.pid ?? null,
      targetTotal: targets.length,
      completed: completedIds.length,
      resolved,
      sourceConflict: sourceConflictIds.length,
      remaining,
      generationPending: Math.max(0, remaining - reviewPendingIds.length),
      reviewPending: reviewPendingIds.length,
      progressPercent: targets.length > 0 ? (resolved / targets.length) * 100 : 0,
      wordsPerMinute,
      etaSeconds,
    },
    activeWords: [...activeWords.values()],
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
      sourceConflictCount: [...corpusScan.records.values()]
        .filter((record) => record.status === 'source-conflict').length,
      shardCount: corpusScan.shardCount,
      storageBytes: corpusScan.storageBytes,
      scannedAt: corpusScan.scannedAt,
    },
    recentRecords,
    failures: failureEvents,
    events: dashboardState.events.slice(-40).reverse(),
    pilotWords: targets.slice(0, dashboardState.job.scope === 'pilot' ? targets.length : 20)
      .map((wordId) => ({
        wordId,
        word: wordsById.get(wordId)?.word ?? wordId,
        senseCount: wordsById.has(wordId) ? chineseSenseCount(wordsById.get(wordId)) : 0,
        completed: corpusScan.generatedIds.has(wordId),
        reviewPending: reviewPendingIds.includes(wordId),
        sourceConflict: corpusScan.records.get(wordId)?.status === 'source-conflict',
        reviewRejected: reviewRejectedIds.includes(wordId),
      })),
  };
}

function broadcast() {
  const data = `data: ${JSON.stringify(statusPayload())}\n\n`;
  sseClients.forEach((response) => response.write(data));
}

async function handleGeneratorEvent(event) {
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') return;
  if (event.type === 'word-start') {
    activeWords.set(event.wordId, event);
  } else if (event.type === 'word-retry') {
    activeWords.set(event.wordId, { ...activeWords.get(event.wordId), ...event });
  } else if (event.type === 'word-complete') {
    activeWords.delete(event.wordId);
    await refreshWord(event.wordId);
  } else if (event.type === 'word-failed') {
    activeWords.delete(event.wordId);
  } else if (event.type === 'word-blocked') {
    activeWords.delete(event.wordId);
    await refreshWord(event.wordId);
  } else if (event.type === 'complete') {
    generatorCompleteEvent = event;
  }
  addEvent(event.type, event);
  await persistState();
  broadcast();
}

function childArguments() {
  const args = [
    generatorPath,
    '--bank', dashboardState.job.scope === 'all' ? 'all' : dashboardState.job.bank,
    '--concurrency', String(dashboardState.settings.concurrency),
    '--retries', '1',
    '--quality-mode', dashboardState.settings.qualityMode,
    '--json-events',
    '--execute',
  ];
  if (dashboardState.job.scope === 'pilot') {
    args.push('--only', dashboardState.job.targetWordIds.join(','));
  }
  return args;
}

async function startGeneration() {
  if (childProcess) throw new Error('生成任务已经在运行。');
  if (!dashboardState.settings.endpoint.trim() || !dashboardState.settings.model.trim()) {
    throw new Error('请先填写模型端点和模型 ID。');
  }
  if (!process.env.WORDBUDDY_AI_API_KEY) {
    throw new Error('启动控制台时必须通过 WORDBUDDY_AI_API_KEY 提供密钥或本地占位值。');
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
    const failedWordCount = Number(generatorCompleteEvent?.failureCount ?? 0);
    childProcess = null;
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
    addEvent(wasPaused ? 'job-paused' : 'job-finished', { code, signal });
    await persistState();
    broadcast();
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
  if (request.method === 'GET' && url.pathname === '/api/record') {
    const wordId = url.searchParams.get('id') ?? '';
    const inspected = corpusScan.records.get(wordId);
    if (!inspected) {
      json(response, 404, { error: '未找到该词的已生成讲解。' });
      return;
    }
    json(response, 200, {
      word: inspected.word,
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
        qualityMode: ['unreviewed', 'balanced', 'strict'].includes(body.qualityMode)
          ? body.qualityMode
          : 'unreviewed',
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
    broadcast();
    json(response, 200, statusPayload());
    return;
  }
  json(response, 404, { error: 'Unknown API endpoint.' });
}

await scanCorpus();
reconcileJobWithCorpus();
await persistState();

const dashboardHtml = await readFile(dashboardPath, 'utf8');
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

process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
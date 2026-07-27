import type { CombatState } from './combat';
import type { BankId } from './models';

export interface LevelGameResult {
  stars: 0 | 1 | 2 | 3;
  bestCombo: number;
  bestScore: number;
  wins: number;
  attempts: number;
  updatedAt: string;
}

export interface GameProgressV1 {
  version: 1;
  journeyLayoutVersion: 2;
  levelResults: Record<string, LevelGameResult>;
  clearedLevels: string[];
  clearedBossLevels: string[];
  totals: {
    monstersDefeated: number;
    criticalHits: number;
    highestCombo: number;
  };
}

export function createEmptyGameProgress(): GameProgressV1 {
  return {
    version: 1,
    journeyLayoutVersion: 2,
    levelResults: {},
    clearedLevels: [],
    clearedBossLevels: [],
    totals: { monstersDefeated: 0, criticalHits: 0, highestCombo: 0 },
  };
}

export function levelResultKey(bankId: BankId, levelNumber: number): string {
  return `${bankId}:level:${Math.max(1, Math.floor(levelNumber))}`;
}

export function calculateStars(combat: CombatState): 0 | 1 | 2 | 3 {
  if (combat.phase !== 'victory' || combat.answersResolved === 0) return 0;
  const accuracy = (combat.correctAnswers / combat.answersResolved) * 100;
  if (accuracy >= 90 && combat.bestCombo >= 5) return 3;
  if (accuracy >= 80) return 2;
  return 1;
}

export function recordLevelResult(
  progress: GameProgressV1,
  bankId: BankId,
  levelNumber: number,
  combat: CombatState,
  levelKind: 'normal' | 'boss' = 'normal',
  clearLevel = combat.phase === 'victory',
  updatedAt = new Date().toISOString(),
): GameProgressV1 {
  const key = levelResultKey(bankId, levelNumber);
  const previous = progress.levelResults[key];
  const won = combat.phase === 'victory';
  const result: LevelGameResult = {
    stars: Math.max(previous?.stars ?? 0, calculateStars(combat)) as LevelGameResult['stars'],
    bestCombo: Math.max(previous?.bestCombo ?? 0, combat.bestCombo),
    bestScore: Math.max(previous?.bestScore ?? 0, combat.score),
    wins: (previous?.wins ?? 0) + (won ? 1 : 0),
    attempts: (previous?.attempts ?? 0) + 1,
    updatedAt,
  };

  const bossKey = levelResultKey(bankId, levelNumber);
  const clearedLevels = won && clearLevel
    ? Array.from(new Set([...progress.clearedLevels, key]))
    : progress.clearedLevels;
  const clearedBossLevels = levelKind === 'boss' && won && clearLevel
    ? Array.from(new Set([...progress.clearedBossLevels, bossKey]))
    : progress.clearedBossLevels;

  return {
    version: 1,
    journeyLayoutVersion: 2,
    levelResults: { ...progress.levelResults, [key]: result },
    clearedLevels,
    clearedBossLevels,
    totals: {
      monstersDefeated: progress.totals.monstersDefeated + (won ? 1 : 0),
      criticalHits: progress.totals.criticalHits + combat.criticalHits,
      highestCombo: Math.max(progress.totals.highestCombo, combat.bestCombo),
    },
  };
}

export function getClearedBossLevelSet(progress: GameProgressV1): Set<string> {
  return new Set(progress.clearedBossLevels);
}

export function getClearedLevelNumberSet(
  progress: GameProgressV1,
  bankId: BankId,
): Set<number> {
  const prefix = `${bankId}:level:`;
  return new Set(
    progress.clearedLevels
      .filter((key) => key.startsWith(prefix))
      .map((key) => Number.parseInt(key.slice(prefix.length), 10))
      .filter((levelNumber) => Number.isFinite(levelNumber)),
  );
}

export function getLatestChallengeAt(
  progress: GameProgressV1,
  bankId: BankId,
): string | null {
  const prefix = `${bankId}:level:`;
  let latestAt: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const [key, result] of Object.entries(progress.levelResults)) {
    if (!key.startsWith(prefix)) continue;
    const challengeTime = Date.parse(result.updatedAt);
    if (Number.isFinite(challengeTime) && challengeTime > latestTime) {
      latestAt = result.updatedAt;
      latestTime = challengeTime;
    }
  }

  return latestAt;
}

function isGameProgress(value: unknown): value is GameProgressV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GameProgressV1>;
  return candidate.version === 1
    && Boolean(candidate.levelResults)
    && typeof candidate.levelResults === 'object'
    && Boolean(candidate.totals)
    && typeof candidate.totals === 'object';
}

function remapLegacyWordLevelKey(key: string): string {
  const match = /^(.*:level:)(\d+)$/.exec(key);
  if (!match) return key;
  const legacyLevelNumber = Number.parseInt(match[2], 10);
  if (!Number.isFinite(legacyLevelNumber) || legacyLevelNumber < 1) return key;
  const insertedBossesBefore = Math.floor((legacyLevelNumber - 1) / 4);
  return `${match[1]}${legacyLevelNumber + insertedBossesBefore}`;
}

function migrateJourneyLayout(value: Omit<GameProgressV1, 'journeyLayoutVersion'>): GameProgressV1 {
  const clearedBossLevels = Array.isArray(value.clearedBossLevels)
    ? value.clearedBossLevels
    : [];
  const historicalWins = Object.entries(value.levelResults)
    .filter(([, result]) => result.wins > 0)
    .map(([key]) => key);
  const legacyCleared = Array.isArray(value.clearedLevels)
    ? value.clearedLevels
    : historicalWins;
  const levelResults = Object.fromEntries(Object.entries(value.levelResults).flatMap(([key, result]) => {
    const migrated = [[remapLegacyWordLevelKey(key), result] as const];
    return clearedBossLevels.includes(key) ? [...migrated, [key, result] as const] : migrated;
  }));

  return {
    ...value,
    journeyLayoutVersion: 2,
    levelResults,
    clearedLevels: Array.from(new Set([
      ...legacyCleared.map(remapLegacyWordLevelKey),
      ...clearedBossLevels,
    ])),
    clearedBossLevels,
  };
}

export function parseGameProgress(raw: string | null): GameProgressV1 {
  if (!raw) return createEmptyGameProgress();
  try {
    const value: unknown = JSON.parse(raw);
    if (!isGameProgress(value)) return createEmptyGameProgress();
    const wonLevelKeys = Object.entries(value.levelResults)
      .filter(([, result]) => result.wins > 0)
      .map(([key]) => key);
    const normalized = {
      ...value,
      clearedLevels: Array.isArray(value.clearedLevels)
        ? value.clearedLevels
        : wonLevelKeys,
      clearedBossLevels: Array.isArray(value.clearedBossLevels)
        ? value.clearedBossLevels
        : [],
    };
    return value.journeyLayoutVersion === 2
      ? { ...normalized, journeyLayoutVersion: 2 }
      : migrateJourneyLayout(normalized);
  } catch {
    return createEmptyGameProgress();
  }
}
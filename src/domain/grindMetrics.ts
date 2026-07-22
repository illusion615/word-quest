import { State } from 'ts-fsrs';
import type { AnswerRecord, LearningState, WordProgress } from './models';
import { STABLE_MASTERY_DAYS } from './learningSchedule';
import { localDateKey } from './progress';

/**
 * "卷王" motivation metrics. Everything here is derived from the persisted
 * LearningState (per-word FSRS cards + answer history), so it adds fast-moving
 * feedback loops without touching the scientific FSRS schedule or the durable
 * "稳定掌握" definition.
 */

// A word climbs this ladder as its memory strengthens. "new" is bank-level only
// (a word with no progress yet) and never appears for a WordProgress.
export type MasteryTier = 'new' | 'seen' | 'reinforcing' | 'stable' | 'ace';

/** Memory stability (days) at which a stable word becomes "炉火纯青". */
export const ACE_STABILITY_DAYS = 60;

export interface MasteryLadder {
  seen: number;
  reinforcing: number;
  stable: number;
  ace: number;
  /** seen + reinforcing + stable + ace — every word that has any progress. */
  learned: number;
}

export interface GrindRank {
  id: string;
  name: string;
  min: number;
}

export interface GrindStanding {
  total: number;
  rank: GrindRank;
  nextRank: GrindRank | null;
  /** 0–100 progress from the current rank floor toward the next rank. */
  progressToNext: number;
  pointsToNext: number;
}

export interface DailyGoal {
  done: number;
  goal: number;
  /** 0–1, clamped. */
  ratio: number;
  closed: boolean;
}

export interface DailyGoals {
  newWords: DailyGoal;
  reviews: DailyGoal;
  minutes: DailyGoal;
  closedCount: number;
  allClosed: boolean;
}

export interface TodayReport {
  answered: number;
  correct: number;
  accuracy: number;
  newWords: number;
  reviews: number;
  bestStreak: number;
  grind: number;
  minutes: number;
}

// Point weights. Tuned so a focused session visibly moves the score while
// durable mastery still dwarfs raw grinding.
export const GRIND_WEIGHTS = {
  attempt: 1,
  correctBonus: 2,
  newWord: 5,
  reinforcing: 10,
  stable: 40,
  ace: 80,
} as const;

export const GRIND_RANKS: GrindRank[] = [
  { id: 'apprentice', name: '卷徒', min: 0 },
  { id: 'scholar', name: '卷士', min: 500 },
  { id: 'ranger', name: '卷侠', min: 2_000 },
  { id: 'general', name: '卷将', min: 6_000 },
  { id: 'king', name: '卷王', min: 15_000 },
  { id: 'god', name: '卷神', min: 40_000 },
];

export const DEFAULT_DAILY_GOALS = {
  newWords: 10,
  reviews: 20,
  minutes: 15,
} as const;

export function masteryTierOf(progress: WordProgress): Exclude<MasteryTier, 'new'> {
  const { state, stability } = progress.card;
  if (state !== State.Review) return 'seen';
  if (stability >= ACE_STABILITY_DAYS) return 'ace';
  if (stability >= STABLE_MASTERY_DAYS) return 'stable';
  return 'reinforcing';
}

export function buildMasteryLadder(state: LearningState): MasteryLadder {
  const ladder: MasteryLadder = { seen: 0, reinforcing: 0, stable: 0, ace: 0, learned: 0 };
  for (const progress of Object.values(state.progress)) {
    ladder.learned += 1;
    ladder[masteryTierOf(progress)] += 1;
  }
  return ladder;
}

/** Cumulative ladder bonus for a word at a given tier (each tier includes the
 * lower tiers' bonuses, rewarding progression). */
function ladderBonus(tier: Exclude<MasteryTier, 'new'>): number {
  switch (tier) {
    case 'ace':
      return GRIND_WEIGHTS.reinforcing + GRIND_WEIGHTS.stable + GRIND_WEIGHTS.ace;
    case 'stable':
      return GRIND_WEIGHTS.reinforcing + GRIND_WEIGHTS.stable;
    case 'reinforcing':
      return GRIND_WEIGHTS.reinforcing;
    default:
      return 0;
  }
}

function historyPoints(records: AnswerRecord[]): number {
  let points = 0;
  for (const record of records) {
    points += GRIND_WEIGHTS.attempt;
    if (record.correct) points += GRIND_WEIGHTS.correctBonus;
  }
  return points;
}

/** Total, only-goes-up "卷力值" from every answer plus each word's ladder tier. */
export function computeGrindTotal(state: LearningState): number {
  let total = historyPoints(state.history);
  for (const progress of Object.values(state.progress)) {
    total += GRIND_WEIGHTS.newWord + ladderBonus(masteryTierOf(progress));
  }
  return total;
}

export function grindStanding(total: number): GrindStanding {
  let rank = GRIND_RANKS[0];
  for (const candidate of GRIND_RANKS) {
    if (total >= candidate.min) rank = candidate;
    else break;
  }
  const nextRank = GRIND_RANKS.find((candidate) => candidate.min > rank.min) ?? null;
  if (!nextRank) {
    return { total, rank, nextRank: null, progressToNext: 100, pointsToNext: 0 };
  }
  const span = nextRank.min - rank.min;
  const gained = total - rank.min;
  return {
    total,
    rank,
    nextRank,
    progressToNext: Math.min(100, Math.round((gained / span) * 100)),
    pointsToNext: Math.max(0, nextRank.min - total),
  };
}

function firstSeenDayByWord(history: AnswerRecord[]): Map<string, string> {
  const firstSeen = new Map<string, string>();
  for (const record of history) {
    const day = localDateKey(new Date(record.answeredAt));
    const existing = firstSeen.get(record.wordId);
    if (existing === undefined || day < existing) firstSeen.set(record.wordId, day);
  }
  return firstSeen;
}

export function buildTodayReport(state: LearningState, now = new Date()): TodayReport {
  const todayKey = localDateKey(now);
  const firstSeen = firstSeenDayByWord(state.history);
  const todays = state.history
    .filter((record) => localDateKey(new Date(record.answeredAt)) === todayKey)
    .sort((left, right) => left.answeredAt.localeCompare(right.answeredAt));

  const answered = todays.length;
  let correct = 0;
  let reviews = 0;
  let bestStreak = 0;
  let run = 0;
  let ms = 0;
  const newWordIds = new Set<string>();

  for (const record of todays) {
    if (record.correct) {
      correct += 1;
      run += 1;
      if (run > bestStreak) bestStreak = run;
    } else {
      run = 0;
    }
    ms += Math.max(0, record.responseTimeMs || 0);
    if (firstSeen.get(record.wordId) === todayKey) newWordIds.add(record.wordId);
    else reviews += 1;
  }

  return {
    answered,
    correct,
    accuracy: answered > 0 ? Math.round((correct / answered) * 100) : 0,
    newWords: newWordIds.size,
    reviews,
    bestStreak,
    grind: historyPoints(todays) + newWordIds.size * GRIND_WEIGHTS.newWord,
    minutes: Math.round(ms / 60_000),
  };
}

function goal(done: number, target: number): DailyGoal {
  const safeTarget = Math.max(1, target);
  return {
    done,
    goal: safeTarget,
    ratio: Math.min(1, done / safeTarget),
    closed: done >= safeTarget,
  };
}

export function buildDailyGoals(
  report: TodayReport,
  targets: { newWords: number; reviews: number; minutes: number } = DEFAULT_DAILY_GOALS,
): DailyGoals {
  const newWords = goal(report.newWords, targets.newWords);
  const reviews = goal(report.reviews, targets.reviews);
  const minutes = goal(report.minutes, targets.minutes);
  const closedCount = [newWords, reviews, minutes].filter((ring) => ring.closed).length;
  return { newWords, reviews, minutes, closedCount, allClosed: closedCount === 3 };
}

export interface GrindMetrics {
  ladder: MasteryLadder;
  standing: GrindStanding;
  today: TodayReport;
  goals: DailyGoals;
}

export function buildGrindMetrics(state: LearningState, now = new Date()): GrindMetrics {
  const today = buildTodayReport(state, now);
  return {
    ladder: buildMasteryLadder(state),
    standing: grindStanding(computeGrindTotal(state)),
    today,
    goals: buildDailyGoals(today),
  };
}

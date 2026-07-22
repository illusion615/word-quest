import { State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import type { AnswerRecord, LearningState, WordProgress } from './models';
import { STABLE_MASTERY_DAYS } from './learningSchedule';
import {
  ACE_STABILITY_DAYS,
  buildDailyGoals,
  buildMasteryLadder,
  buildTodayReport,
  computeGrindTotal,
  grindStanding,
  masteryTierOf,
} from './grindMetrics';

function progress(
  wordId: string,
  card: Partial<WordProgress['card']> = {},
): WordProgress {
  return {
    wordId,
    attempts: 1,
    correct: 1,
    mastery: 100,
    card: {
      due: '2026-08-01T00:00:00.000Z',
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: State.Review,
      ...card,
    },
  };
}

function answer(overrides: Partial<AnswerRecord> = {}): AnswerRecord {
  return {
    wordId: 'w1',
    mode: 'choice',
    correct: true,
    answeredAt: '2026-07-22T09:00:00.000Z',
    responseTimeMs: 6_000,
    ...overrides,
  };
}

function stateWith(
  progressList: WordProgress[],
  history: AnswerRecord[] = [],
): LearningState {
  return {
    version: 1,
    progress: Object.fromEntries(progressList.map((item) => [item.wordId, item])),
    history,
  };
}

describe('masteryTierOf', () => {
  it('classifies by FSRS state and stability', () => {
    expect(masteryTierOf(progress('a', { state: State.Learning }))).toBe('seen');
    expect(masteryTierOf(progress('a', { state: State.Relearning }))).toBe('seen');
    expect(masteryTierOf(progress('a', { state: State.Review, stability: 5 }))).toBe('reinforcing');
    expect(masteryTierOf(progress('a', { state: State.Review, stability: STABLE_MASTERY_DAYS }))).toBe('stable');
    expect(masteryTierOf(progress('a', { state: State.Review, stability: ACE_STABILITY_DAYS }))).toBe('ace');
  });
});

describe('buildMasteryLadder', () => {
  it('counts each tier and total learned', () => {
    const ladder = buildMasteryLadder(stateWith([
      progress('a', { state: State.Learning }),
      progress('b', { state: State.Review, stability: 5 }),
      progress('c', { state: State.Review, stability: 30 }),
      progress('d', { state: State.Review, stability: 90 }),
    ]));
    expect(ladder).toEqual({ seen: 1, reinforcing: 1, stable: 1, ace: 1, learned: 4 });
  });
});

describe('computeGrindTotal + grindStanding', () => {
  it('sums history points, new-word and ladder bonuses', () => {
    // 2 answers (1 correct, 1 wrong) = (1+2) + 1 = 4 history points.
    // 1 word, reinforcing tier = newWord 5 + reinforcing 10 = 15.
    const total = computeGrindTotal(stateWith(
      [progress('w1', { state: State.Review, stability: 5 })],
      [answer({ correct: true }), answer({ correct: false })],
    ));
    expect(total).toBe(4 + 15);
  });

  it('maps totals to ranks with progress to next', () => {
    expect(grindStanding(0).rank.name).toBe('卷徒');
    expect(grindStanding(500).rank.name).toBe('卷士');
    const mid = grindStanding(1_250); // halfway between 卷士(500) and 卷侠(2000)
    expect(mid.rank.name).toBe('卷士');
    expect(mid.nextRank?.name).toBe('卷侠');
    expect(mid.progressToNext).toBe(50);
    expect(mid.pointsToNext).toBe(750);
    const top = grindStanding(50_000);
    expect(top.rank.name).toBe('卷神');
    expect(top.nextRank).toBeNull();
    expect(top.progressToNext).toBe(100);
  });
});

describe('buildTodayReport', () => {
  const now = new Date('2026-07-22T12:00:00.000Z');

  it('separates new words from reviews and tracks the best streak', () => {
    const report = buildTodayReport(stateWith([], [
      // w1 first seen yesterday -> today's w1 answer is a review
      answer({ wordId: 'w1', answeredAt: '2026-07-21T09:00:00.000Z', correct: true }),
      answer({ wordId: 'w1', answeredAt: '2026-07-22T09:00:00.000Z', correct: true }),
      // w2, w3 first seen today -> new words
      answer({ wordId: 'w2', answeredAt: '2026-07-22T09:05:00.000Z', correct: true }),
      answer({ wordId: 'w3', answeredAt: '2026-07-22T09:10:00.000Z', correct: false }),
    ], ), now);
    expect(report.answered).toBe(3);
    expect(report.correct).toBe(2);
    expect(report.accuracy).toBe(67);
    expect(report.newWords).toBe(2); // w2, w3
    expect(report.reviews).toBe(1); // w1
    expect(report.bestStreak).toBe(2); // w1, w2 correct in a row before w3 wrong
  });

  it('accumulates study minutes from today only', () => {
    const report = buildTodayReport(stateWith([], [
      answer({ answeredAt: '2026-07-21T09:00:00.000Z', responseTimeMs: 600_000 }),
      answer({ wordId: 'w2', answeredAt: '2026-07-22T09:00:00.000Z', responseTimeMs: 90_000 }),
      answer({ wordId: 'w2', answeredAt: '2026-07-22T09:02:00.000Z', responseTimeMs: 90_000 }),
    ]), now);
    expect(report.minutes).toBe(3); // 180_000ms today
  });
});

describe('buildDailyGoals', () => {
  it('reports ring completion', () => {
    const goals = buildDailyGoals(
      { answered: 0, correct: 0, accuracy: 0, newWords: 10, reviews: 5, bestStreak: 0, grind: 0, minutes: 20 },
      { newWords: 10, reviews: 20, minutes: 15 },
    );
    expect(goals.newWords.closed).toBe(true);
    expect(goals.reviews.closed).toBe(false);
    expect(goals.reviews.ratio).toBeCloseTo(0.25);
    expect(goals.minutes.closed).toBe(true);
    expect(goals.closedCount).toBe(2);
    expect(goals.allClosed).toBe(false);
  });
});

import { Rating, State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import type { AnswerRecord, WordProgress } from './models';
import {
  STABLE_MASTERY_DAYS,
  getLearningSignal,
  getStudyAvailability,
  isDurablyMastered,
  rateAnswer,
} from './learningSchedule';

function progress(overrides: Partial<WordProgress['card']> = {}): WordProgress {
  return {
    wordId: 'word',
    attempts: 3,
    correct: 3,
    mastery: 100,
    card: {
      due: '2026-08-01T00:00:00.000Z',
      stability: STABLE_MASTERY_DAYS,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 21,
      learning_steps: 0,
      reps: 3,
      lapses: 0,
      state: State.Review,
      ...overrides,
    },
  };
}

function answer(overrides: Partial<AnswerRecord> = {}): AnswerRecord {
  return {
    wordId: 'word',
    mode: 'sentence',
    correct: true,
    answeredAt: '2026-07-21T00:00:00.000Z',
    responseTimeMs: 5_000,
    timeLimitMs: 20_000,
    usedHint: false,
    ...overrides,
  };
}

describe('FSRS learning schedule', () => {
  it('requires review-state stability instead of same-session accuracy for mastery', () => {
    expect(isDurablyMastered(progress())).toBe(true);
    expect(isDurablyMastered(progress({ stability: 20.99 }))).toBe(false);
    expect(isDurablyMastered(progress({ state: State.Learning, stability: 30 }))).toBe(false);
  });

  it('keeps durable mastery separate from whether review is due today', () => {
    const signal = getLearningSignal(
      progress({ due: '2026-07-20T00:00:00.000Z' }),
      new Date('2026-07-21T00:00:00.000Z'),
    );

    expect(signal).toMatchObject({ status: 'due', due: true, stable: true });
  });

  it('maps answer quality to all four FSRS grades', () => {
    expect(rateAnswer(answer({ correct: false }))).toBe(Rating.Again);
    expect(rateAnswer(answer({ usedHint: true }))).toBe(Rating.Hard);
    expect(rateAnswer(answer({ responseTimeMs: 16_000 }))).toBe(Rating.Hard);
    expect(rateAnswer(answer({ responseTimeMs: 8_000 }))).toBe(Rating.Good);
    expect(rateAnswer(answer({ responseTimeMs: 4_000 }))).toBe(Rating.Easy);
  });

  it('never awards Easy for recognition-only choice questions', () => {
    expect(rateAnswer(answer({ mode: 'choice', responseTimeMs: 500 }))).toBe(Rating.Good);
  });

  it('summarizes due, new, stable and next-review signals independently', () => {
    const stableDue = progress({ due: '2026-07-20T00:00:00.000Z' });
    const learningScheduled = progress({
      due: '2026-07-25T00:00:00.000Z',
      state: State.Learning,
      stability: 1,
    });
    const availability = getStudyAvailability(
      TEST_WORDS,
      {
        version: 1,
        progress: {
          [TEST_WORDS[0].id]: { ...stableDue, wordId: TEST_WORDS[0].id },
          [TEST_WORDS[1].id]: { ...learningScheduled, wordId: TEST_WORDS[1].id },
        },
        history: [],
      },
      new Date('2026-07-21T00:00:00.000Z'),
    );

    expect(availability).toMatchObject({ dueCount: 1, newCount: 1, stableCount: 1 });
    expect(availability.nextReviewAt?.toISOString()).toBe('2026-07-25T00:00:00.000Z');
  });
});
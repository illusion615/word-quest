import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import type { LearningState, SerializedFsrsCard, WordProgress } from './models';
import {
  calculateBankCoverage,
  getWordBankIds,
  isWordMastered,
  type CoverageIndexData,
} from './coverage';

const card: SerializedFsrsCard = {
  due: '2026-07-20T00:00:00.000Z',
  stability: 1,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 1,
  learning_steps: 0,
  reps: 3,
  lapses: 0,
  state: 2,
};

function progress(
  wordId: string,
  attempts: number,
  mastery: number,
  cardOverrides: Partial<SerializedFsrsCard> = {},
): WordProgress {
  return { wordId, attempts, correct: attempts, mastery, card: { ...card, ...cardOverrides } };
}

const index: CoverageIndexData = {
  schemaVersion: 1,
  bankOrder: ['gaokao', 'cet4', 'cet6', 'ielts', 'toefl'],
  bankCounts: { gaokao: 10, cet4: 20, cet6: 25, ielts: 40, toefl: 50 },
  memberships: {
    achieve: 0b01011,
    benefit: 0b10100,
  },
};

describe('cross-bank coverage', () => {
  it('uses durable FSRS review stability instead of same-session accuracy', () => {
    expect(isWordMastered(progress('achieve', 1, 0, { stability: 21 }))).toBe(true);
    expect(isWordMastered(progress('achieve', 8, 100, { stability: 20 }))).toBe(false);
    expect(isWordMastered(progress('achieve', 8, 100, {
      stability: 30,
      state: State.Learning,
    }))).toBe(false);
  });

  it('credits one mastered word to every bank containing it', () => {
    const state: LearningState = {
      version: 1,
      progress: {
        achieve: progress('achieve', 3, 100, { stability: 21 }),
        benefit: progress('benefit', 1, 100, { stability: 1 }),
      },
      history: [],
    };

    const coverage = calculateBankCoverage(state, index);
    expect(coverage.gaokao).toMatchObject({ learned: 1, mastered: 1, learningPercentage: 10, masteryPercentage: 10 });
    expect(coverage.cet4).toMatchObject({ learned: 1, mastered: 1, learningPercentage: 5, masteryPercentage: 5 });
    expect(coverage.ielts).toMatchObject({ learned: 1, mastered: 1, learningPercentage: 2.5, masteryPercentage: 2.5 });
    expect(coverage.cet6).toMatchObject({ learned: 1, mastered: 0 });
    expect(coverage.toefl).toMatchObject({ learned: 1, mastered: 0 });
    expect(getWordBankIds(index, 'achieve')).toEqual(['gaokao', 'cet4', 'ielts']);
  });

  it('credits a first attempt to learning coverage before mastery', () => {
    const state: LearningState = {
      version: 1,
      progress: { benefit: progress('benefit', 1, 100, { stability: 1 }) },
      history: [],
    };
    const coverage = calculateBankCoverage(state, index);
    expect(coverage.cet6).toMatchObject({ learned: 1, mastered: 0, learningPercentage: 4, masteryPercentage: 0 });
    expect(coverage.toefl).toMatchObject({ learned: 1, mastered: 0, learningPercentage: 2, masteryPercentage: 0 });
  });

  it('keeps the first mastered word visible in a large bank', () => {
    const largeIndex: CoverageIndexData = {
      ...index,
      bankCounts: { ...index.bankCounts, gaokao: 3677 },
      memberships: { achieve: 0b00001 },
    };
    const state: LearningState = {
      version: 1,
      progress: { achieve: progress('achieve', 3, 100, { stability: 21 }) },
      history: [],
    };
    expect(calculateBankCoverage(state, largeIndex).gaokao.masteryPercentage).toBe(0.03);
  });
});
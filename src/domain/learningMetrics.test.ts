import { describe, expect, it } from 'vitest';
import { createEmptyCard } from 'ts-fsrs';
import type { LearningState, WordEntry, WordProgress } from './models';
import {
  calculateLevelLearningMetrics,
  calculateWordLearningMetrics,
} from './learningMetrics';

const word: WordEntry = {
  id: 'accept',
  word: 'accept',
  phonetic: '/əkˈsept/',
  partOfSpeech: 'verb',
  definition: 'receive willingly',
  definitionZh: 'vt. 接受；vt. 采用；vt. 忍受',
  banks: ['gaokao'],
};

const card = createEmptyCard(new Date('2026-07-27T00:00:00.000Z'));
const progress: WordProgress = {
  wordId: word.id,
  attempts: 4,
  correct: 3,
  mastery: 75,
  card: {
    ...card,
    due: card.due.toISOString(),
    last_review: undefined,
  },
  senses: {
    'accept:s0': { attempts: 2, correct: 2, lastReviewedAt: '2026-07-27T00:00:00.000Z' },
    'accept:s2': { attempts: 2, correct: 1, lastReviewedAt: '2026-07-27T00:00:00.000Z' },
  },
};

describe('learning metrics', () => {
  it('calculates word coverage separately from answer accuracy', () => {
    const metrics = calculateWordLearningMetrics(word, progress);

    expect(metrics.coveredSenseCount).toBe(2);
    expect(metrics.totalSenseCount).toBe(3);
    expect(metrics.coveragePercentage).toBe(66.67);
    expect(metrics.accuracyPercentage).toBe(75);
    expect(metrics.senses.map((sense) => ({
      id: sense.id,
      coverage: sense.coveragePercentage,
      accuracy: sense.accuracyPercentage,
    }))).toEqual([
      { id: 'accept:s0', coverage: 100, accuracy: 100 },
      { id: 'accept:s1', coverage: 0, accuracy: null },
      { id: 'accept:s2', coverage: 100, accuracy: 50 },
    ]);
  });

  it('aggregates level coverage by sense and accuracy by answer', () => {
    const state: LearningState = {
      version: 1,
      progress: { [word.id]: progress },
      history: [],
    };

    expect(calculateLevelLearningMetrics([word], state)).toMatchObject({
      wordCount: 1,
      coveredSenseCount: 2,
      totalSenseCount: 3,
      coveragePercentage: 66.67,
      attempts: 4,
      correct: 3,
      accuracyPercentage: 75,
    });
  });
});
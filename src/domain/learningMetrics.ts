import type { LearningState, WordEntry, WordProgress } from './models';
import { parseWordSenses } from './wordText';

export interface AccuracyMetric {
  attempts: number;
  correct: number;
  accuracyPercentage: number | null;
}

export interface SenseLearningMetric extends AccuracyMetric {
  id: string;
  label: string;
  text: string;
  covered: boolean;
  coveragePercentage: 0 | 100;
  lastReviewedAt: string | null;
}

export interface WordLearningMetrics extends AccuracyMetric {
  wordId: string;
  coveredSenseCount: number;
  totalSenseCount: number;
  coveragePercentage: number;
  senses: SenseLearningMetric[];
}

export interface LevelLearningMetrics extends AccuracyMetric {
  wordCount: number;
  coveredSenseCount: number;
  totalSenseCount: number;
  coveragePercentage: number;
}

function percentage(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 10_000) / 100 : 0;
}

function accuracy(correct: number, attempts: number): number | null {
  return attempts > 0 ? percentage(correct, attempts) : null;
}

export function calculateWordLearningMetrics(
  word: WordEntry,
  progress: WordProgress | undefined,
): WordLearningMetrics {
  const senses = parseWordSenses(word).map((sense): SenseLearningMetric => {
    const senseProgress = progress?.senses?.[sense.id];
    const attempts = senseProgress?.attempts ?? 0;
    const correct = senseProgress?.correct ?? 0;
    const covered = attempts > 0;
    return {
      ...sense,
      covered,
      coveragePercentage: covered ? 100 : 0,
      attempts,
      correct,
      accuracyPercentage: accuracy(correct, attempts),
      lastReviewedAt: senseProgress?.lastReviewedAt ?? null,
    };
  });
  const coveredSenseCount = senses.filter((sense) => sense.covered).length;
  const attempts = progress?.attempts ?? 0;
  const correct = progress?.correct ?? 0;

  return {
    wordId: word.id,
    coveredSenseCount,
    totalSenseCount: senses.length,
    coveragePercentage: percentage(coveredSenseCount, senses.length),
    attempts,
    correct,
    accuracyPercentage: accuracy(correct, attempts),
    senses,
  };
}

export function calculateLevelLearningMetrics(
  words: readonly WordEntry[],
  state: LearningState,
): LevelLearningMetrics {
  const wordMetrics = words.map((word) => (
    calculateWordLearningMetrics(word, state.progress[word.id])
  ));
  const coveredSenseCount = wordMetrics.reduce(
    (sum, metrics) => sum + metrics.coveredSenseCount,
    0,
  );
  const totalSenseCount = wordMetrics.reduce(
    (sum, metrics) => sum + metrics.totalSenseCount,
    0,
  );
  const attempts = wordMetrics.reduce((sum, metrics) => sum + metrics.attempts, 0);
  const correct = wordMetrics.reduce((sum, metrics) => sum + metrics.correct, 0);

  return {
    wordCount: words.length,
    coveredSenseCount,
    totalSenseCount,
    coveragePercentage: percentage(coveredSenseCount, totalSenseCount),
    attempts,
    correct,
    accuracyPercentage: accuracy(correct, attempts),
  };
}
import type { BankId, LearningState, WordProgress } from './models';
import { isDurablyMastered } from './learningSchedule';

export interface CoverageIndexData {
  schemaVersion: 1;
  bankOrder: BankId[];
  bankCounts: Record<BankId, number>;
  memberships: Record<string, number>;
}

export interface BankCoverage {
  bankId: BankId;
  learned: number;
  mastered: number;
  total: number;
  learningPercentage: number;
  masteryPercentage: number;
}

export type BankCoverageMap = Record<BankId, BankCoverage>;

export function isWordMastered(progress: WordProgress | undefined): boolean {
  return isDurablyMastered(progress);
}

export function calculateBankCoverage(
  state: LearningState,
  index: CoverageIndexData,
): BankCoverageMap {
  const learnedByBank = Object.fromEntries(
    index.bankOrder.map((bankId) => [bankId, 0]),
  ) as Record<BankId, number>;
  const masteredByBank = { ...learnedByBank };

  for (const progress of Object.values(state.progress)) {
    const membership = index.memberships[progress.wordId] ?? 0;
    index.bankOrder.forEach((bankId, position) => {
      if ((membership & (1 << position)) === 0) return;
      learnedByBank[bankId] += 1;
      if (isWordMastered(progress)) masteredByBank[bankId] += 1;
    });
  }

  return Object.fromEntries(index.bankOrder.map((bankId) => {
    const total = index.bankCounts[bankId];
    const learned = learnedByBank[bankId];
    const mastered = masteredByBank[bankId];
    return [bankId, {
      bankId,
      learned,
      mastered,
      total,
      learningPercentage: total > 0 ? Math.round((learned / total) * 10_000) / 100 : 0,
      masteryPercentage: total > 0 ? Math.round((mastered / total) * 10_000) / 100 : 0,
    }];
  })) as BankCoverageMap;
}

export function getWordBankIds(
  index: CoverageIndexData,
  wordId: string,
): BankId[] {
  const membership = index.memberships[wordId] ?? 0;
  return index.bankOrder.filter((_, position) => (membership & (1 << position)) !== 0);
}
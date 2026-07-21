import { useCallback, useEffect, useState } from 'react';
import { loadCoverageIndex } from '../data/bankRepository';
import {
  calculateBankCoverage,
  getWordBankIds,
  type BankCoverageMap,
  type CoverageIndexData,
} from '../domain/coverage';
import type { BankId, LearningState } from '../domain/models';

export function useBankCoverage(learningState: LearningState, progressHydrated: boolean) {
  const [index, setIndex] = useState<CoverageIndexData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    void loadCoverageIndex()
      .then((loadedIndex) => {
        if (active) setIndex(loadedIndex);
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : '覆盖率加载失败。');
        }
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);
  const coverage: BankCoverageMap | null = index && progressHydrated
    ? calculateBankCoverage(learningState, index)
    : null;
  const getMemberships = useCallback(
    (wordId: string): BankId[] => index ? getWordBankIds(index, wordId) : [],
    [index],
  );

  return {
    coverage,
    loading: !coverage && !error,
    error,
    retry,
    getMemberships,
  };
}
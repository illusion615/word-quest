import { useCallback, useEffect, useState } from 'react';
import { loadBankWordIds } from '../data/bankRepository';
import type { BankId, ResourceLoadProgress } from '../domain/models';

const INITIAL_PROGRESS: ResourceLoadProgress = {
  phase: 'connecting',
  loadedBytes: 0,
  totalBytes: null,
  percentage: null,
};

interface BankWordIdState {
  bankId: BankId | null;
  ids: string[];
  loading: boolean;
  error: string | null;
  progress: ResourceLoadProgress;
}

export function useBankWordIds(bankId: BankId) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<BankWordIdState>({
    bankId: null,
    ids: [],
    loading: true,
    error: null,
    progress: INITIAL_PROGRESS,
  });

  useEffect(() => {
    let active = true;
    let latestProgress = INITIAL_PROGRESS;
    setState({
      bankId,
      ids: [],
      loading: true,
      error: null,
      progress: INITIAL_PROGRESS,
    });
    void loadBankWordIds(bankId, (progress) => {
      latestProgress = progress;
      if (active) {
        setState((current) => current.bankId === bankId
          ? { ...current, progress }
          : current);
      }
    })
      .then((ids) => {
        if (active) {
          setState({
            bankId,
            ids,
            loading: false,
            error: null,
            progress: latestProgress,
          });
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            bankId,
            ids: [],
            loading: false,
            error: error instanceof Error ? error.message : '关卡索引加载失败。',
            progress: latestProgress,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [bankId, reloadToken]);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);
  const currentState = state.bankId === bankId
    ? state
    : {
        bankId,
        ids: [],
        loading: true,
        error: null,
        progress: INITIAL_PROGRESS,
      };

  return { ...currentState, retry };
}

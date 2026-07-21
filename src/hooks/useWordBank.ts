import { useCallback, useEffect, useState } from 'react';
import type { BankId, WordEntry } from '../domain/models';
import { loadWordBank } from '../data/bankRepository';

interface WordBankState {
  entries: WordEntry[];
  loading: boolean;
  error: string | null;
}

export function useWordBank(bankId: BankId) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<WordBankState>({
    entries: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState({ entries: [], loading: true, error: null });
    void loadWordBank(bankId)
      .then((entries) => {
        if (active) setState({ entries, loading: false, error: null });
      })
      .catch((error) => {
        if (active) {
          setState({
            entries: [],
            loading: false,
            error: error instanceof Error ? error.message : '词库加载失败。',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [bankId, reloadToken]);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  return { ...state, retry };
}
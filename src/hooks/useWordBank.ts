import { useCallback, useEffect, useState } from 'react';
import type { BankId, WordEntry } from '../domain/models';
import { loadWordBank } from '../data/bankRepository';

interface WordBankState {
  bankId: BankId | null;
  entries: WordEntry[];
  loading: boolean;
  error: string | null;
}

export function useWordBank(bankId: BankId, enabled = true) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<WordBankState>({
    bankId: null,
    entries: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState({ bankId, entries: [], loading: true, error: null });
    if (!enabled) return () => {
      active = false;
    };
    void loadWordBank(bankId)
      .then((entries) => {
        if (active) setState({ bankId, entries, loading: false, error: null });
      })
      .catch((error) => {
        if (active) {
          setState({
            bankId,
            entries: [],
            loading: false,
            error: error instanceof Error ? error.message : '词库加载失败。',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [bankId, enabled, reloadToken]);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);
  const currentState = state.bankId === bankId
    ? state
    : { bankId, entries: [], loading: true, error: null };

  return { ...currentState, retry };
}
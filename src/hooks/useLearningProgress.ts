import { useCallback, useEffect, useState } from 'react';
import { get as getStoredValue, set as setStoredValue } from 'idb-keyval';
import type { AnswerRecord, LearningState, WordEntry } from '../domain/models';
import {
  LEARNING_STORAGE_KEY,
  buildStudyQueue,
  createEmptyLearningState,
  getLearningStats,
  parseLearningState,
  recordAnswer,
} from '../domain/progress';

const INDEXED_DB_KEY = 'wordbuddy.learning.state.v1';

export function useLearningProgress() {
  const [learningState, setLearningState] = useState<LearningState>(createEmptyLearningState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      let state = createEmptyLearningState();
      const legacy = window.localStorage.getItem(LEARNING_STORAGE_KEY);
      try {
        const persisted = await getStoredValue<string>(INDEXED_DB_KEY);
        if (persisted) {
          state = parseLearningState(persisted);
        } else if (legacy) {
          state = parseLearningState(legacy);
          await setStoredValue(INDEXED_DB_KEY, JSON.stringify(state));
          window.localStorage.removeItem(LEARNING_STORAGE_KEY);
        }
      } catch {
        state = parseLearningState(legacy);
      }

      if (active) {
        setLearningState(state);
        setHydrated(true);
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const serialized = JSON.stringify(learningState);
    void setStoredValue(INDEXED_DB_KEY, serialized).catch(() => {
      try {
        window.localStorage.setItem(LEARNING_STORAGE_KEY, serialized);
      } catch {
        // The current session remains usable when persistent storage is unavailable.
      }
    });
  }, [hydrated, learningState]);

  const addAnswer = useCallback((answer: AnswerRecord) => {
    setLearningState((current) => recordAnswer(current, answer));
  }, []);

  const getQueue = useCallback(
    (entries: WordEntry[], limit = 8) => buildStudyQueue(
      entries,
      learningState,
      new Date(),
      limit,
    ),
    [learningState],
  );

  const resetProgress = useCallback(() => {
    setLearningState(createEmptyLearningState());
  }, []);

  return {
    learningState,
    hydrated,
    stats: getLearningStats(learningState),
    addAnswer,
    getQueue,
    resetProgress,
  };
}
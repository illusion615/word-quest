import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { get as getStoredValue, set as setStoredValue } from 'idb-keyval';
import {
  achievementSnapshotKey,
  createEmptyAchievementState,
  newlyUnlockedAchievements,
  parseAchievementState,
  unlockAchievements,
  type AchievementDefinition,
  type AchievementSnapshot,
  type AchievementStateV1,
} from '../domain/achievements';

const ACHIEVEMENT_STORAGE_KEY = 'wordbuddy.achievements.v1';

export function useAchievements(
  snapshot: AchievementSnapshot,
  sourceHydrated: boolean,
) {
  const [state, setState] = useState<AchievementStateV1>(createEmptyAchievementState);
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState<AchievementDefinition[]>([]);
  const announcedRef = useRef(new Set<string>());
  const snapshotKey = achievementSnapshotKey(snapshot);

  useEffect(() => {
    let active = true;
    const fallback = (() => {
      try {
        return window.localStorage.getItem(ACHIEVEMENT_STORAGE_KEY);
      } catch {
        return null;
      }
    })();

    void getStoredValue<string>(ACHIEVEMENT_STORAGE_KEY)
      .then((raw) => {
        if (!active) return;
        const restored = parseAchievementState(raw ?? fallback);
        setState(restored);
        announcedRef.current = new Set(Object.keys(restored.unlockedAt));
      })
      .catch(() => {
        if (!active) return;
        const restored = parseAchievementState(fallback);
        setState(restored);
        announcedRef.current = new Set(Object.keys(restored.unlockedAt));
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const serialized = JSON.stringify(state);
    void setStoredValue(ACHIEVEMENT_STORAGE_KEY, serialized).catch(() => {
      try {
        window.localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, serialized);
      } catch {
        // The current session can keep awarding achievements without storage.
      }
    });
  }, [hydrated, state]);

  useEffect(() => {
    if (!hydrated || !sourceHydrated) return;
    const newlyUnlocked = newlyUnlockedAchievements(snapshot, state)
      .filter((achievement) => !announcedRef.current.has(achievement.id));
    if (newlyUnlocked.length === 0) return;

    for (const achievement of newlyUnlocked) announcedRef.current.add(achievement.id);
    const timestamp = new Date().toISOString();
    setState((current) => unlockAchievements(current, newlyUnlocked, timestamp));
    setPending((current) => [...current, ...newlyUnlocked]);
  }, [hydrated, snapshotKey, sourceHydrated, state]);

  const dismissCurrent = useCallback(() => {
    setPending((current) => current.slice(1));
  }, []);

  const unlockedCount = useMemo(
    () => Object.keys(state.unlockedAt).length,
    [state.unlockedAt],
  );

  return {
    state,
    hydrated,
    unlockedCount,
    currentAchievement: pending[0] ?? null,
    dismissCurrent,
  };
}

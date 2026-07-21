import { useCallback, useEffect, useRef, useState } from 'react';
import { get as getStoredValue, set as setStoredValue } from 'idb-keyval';
import type { CombatState } from '../domain/combat';
import {
  createEmptyGameProgress,
  levelResultKey,
  parseGameProgress,
  recordLevelResult,
  type GameProgressV1,
  type LevelGameResult,
} from '../domain/gameProgress';
import type { BankId } from '../domain/models';

const GAME_PROGRESS_KEY = 'wordbuddy.game.progress.v1';

export function useGameProgress() {
  const [progress, setProgress] = useState<GameProgressV1>(createEmptyGameProgress);
  const [hydrated, setHydrated] = useState(false);
  const recordedBattleRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void getStoredValue<string>(GAME_PROGRESS_KEY)
      .then((raw) => {
        if (active) setProgress(parseGameProgress(raw ?? null));
      })
      .catch(() => {
        if (active) setProgress(createEmptyGameProgress());
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
    void setStoredValue(GAME_PROGRESS_KEY, JSON.stringify(progress));
  }, [hydrated, progress]);

  const recordBattle = useCallback((
    bankId: BankId,
    levelNumber: number,
    combat: CombatState,
    levelKind: 'normal' | 'boss' = 'normal',
    clearLevel = combat.phase === 'victory',
  ) => {
    const battleId = combat.lastEvent?.id ?? combat.answersResolved;
    if (combat.phase !== 'victory' && combat.phase !== 'defeat') return;
    if (recordedBattleRef.current === battleId) return;
    recordedBattleRef.current = battleId;
    setProgress((current) => recordLevelResult(
      current,
      bankId,
      levelNumber,
      combat,
      levelKind,
      clearLevel,
    ));
  }, []);

  const beginBattle = useCallback(() => {
    recordedBattleRef.current = null;
  }, []);

  const getLevelResult = useCallback((
    bankId: BankId,
    levelNumber: number,
  ): LevelGameResult | undefined => progress.levelResults[levelResultKey(bankId, levelNumber)], [progress]);

  return { progress, hydrated, beginBattle, recordBattle, getLevelResult };
}
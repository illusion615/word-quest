import type { CombatState } from '../domain/combat';

export const MONSTER_HIT_DURATION_MS = 280;
export const MONSTER_ATTACK_DURATION_MS = 360;
export const MONSTER_KNOCKDOWN_DURATION_MS = 650;
export const MONSTER_RECOVERY_DURATION_MS = 350;

export type MonsterPose =
  | 'idle'
  | 'hit'
  | 'attacking'
  | 'knockdown'
  | 'recovering'
  | 'defeated';

export interface MonsterPresentationStep {
  pose: MonsterPose;
  durationMs?: number;
}

export function getMonsterPresentationSequence(
  state: CombatState,
): readonly MonsterPresentationStep[] {
  if (state.enemyHealth === 0 || state.phase === 'victory') {
    return [{ pose: 'defeated' }];
  }

  const event = state.lastEvent;
  if (!event) return [{ pose: 'idle' }];

  if (event.kind === 'hit' && event.critical) {
    return [
      { pose: 'knockdown', durationMs: MONSTER_KNOCKDOWN_DURATION_MS },
      { pose: 'recovering', durationMs: MONSTER_RECOVERY_DURATION_MS },
      { pose: 'idle' },
    ];
  }

  if (event.kind === 'hit') {
    return [
      { pose: 'hit', durationMs: MONSTER_HIT_DURATION_MS },
      { pose: 'idle' },
    ];
  }

  if (event.kind === 'hurt' || event.kind === 'defeat') {
    return [
      { pose: 'attacking', durationMs: MONSTER_ATTACK_DURATION_MS },
      { pose: 'idle' },
    ];
  }

  return [{ pose: 'idle' }];
}
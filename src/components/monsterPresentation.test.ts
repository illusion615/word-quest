import { describe, expect, it } from 'vitest';
import { createCombatState, type CombatEvent, type CombatState } from '../domain/combat';
import {
  MONSTER_KNOCKDOWN_DURATION_MS,
  MONSTER_RECOVERY_DURATION_MS,
  getMonsterPresentationSequence,
} from './monsterPresentation';

function event(overrides: Partial<CombatEvent>): CombatEvent {
  return {
    id: 1,
    kind: 'hit',
    damage: 15,
    critical: false,
    combo: 1,
    enemyDefeated: false,
    playerShield: 3,
    ...overrides,
  };
}

function fightingState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    ...createCombatState(10),
    phase: 'fighting',
    ...overrides,
  };
}

describe('monster presentation sequence', () => {
  it('recovers from a critical knockdown while health remains', () => {
    const sequence = getMonsterPresentationSequence(fightingState({
      enemyHealth: 40,
      lastEvent: event({ critical: true }),
    }));

    expect(sequence).toEqual([
      { pose: 'knockdown', durationMs: MONSTER_KNOCKDOWN_DURATION_MS },
      { pose: 'recovering', durationMs: MONSTER_RECOVERY_DURATION_MS },
      { pose: 'idle' },
    ]);
  });

  it('returns to idle after a normal hit or counterattack', () => {
    expect(getMonsterPresentationSequence(fightingState({
      lastEvent: event({ critical: false }),
    })).map((step) => step.pose)).toEqual(['hit', 'idle']);
    expect(getMonsterPresentationSequence(fightingState({
      lastEvent: event({ kind: 'hurt', damage: 0 }),
    })).map((step) => step.pose)).toEqual(['attacking', 'idle']);
  });

  it('keeps the defeated pose only when enemy health is zero', () => {
    expect(getMonsterPresentationSequence(fightingState({
      enemyHealth: 0,
      lastEvent: event({ critical: true, enemyDefeated: true }),
    }))).toEqual([{ pose: 'defeated' }]);
  });
});
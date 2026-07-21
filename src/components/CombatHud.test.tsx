import { describe, expect, it } from 'vitest';
import { createCombatState, type CombatEvent, type CombatState } from '../domain/combat';
import { getMonsterArtworkSources, resolveMonsterArtwork } from './combatArtwork';

function fightingState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    ...createCombatState(10),
    phase: 'fighting',
    ...overrides,
  };
}

function event(kind: CombatEvent['kind'], enemyDefeated = false): CombatEvent {
  return {
    id: 1,
    kind,
    damage: 10,
    critical: false,
    combo: 1,
    enemyDefeated,
    playerShield: 3,
  };
}

describe('combat monster artwork', () => {
  it('provides all four states for preloading each enemy kind', () => {
    expect(getMonsterArtworkSources('grunt')).toHaveLength(4);
    expect(getMonsterArtworkSources('boss')).toHaveLength(4);
  });

  it('maps grunt combat events to the matching artwork state', () => {
    expect(resolveMonsterArtwork(fightingState(), 'grunt')).toMatchObject({
      alt: '等待战斗的词怪',
      visualState: 'is-idle',
    });
    expect(resolveMonsterArtwork(fightingState({ lastEvent: event('hit') }), 'grunt', 'hit')).toMatchObject({
      alt: '受到攻击的词怪',
      visualState: 'is-hurt',
    });
    expect(resolveMonsterArtwork(fightingState({ lastEvent: event('hurt') }), 'grunt', 'attacking')).toMatchObject({
      alt: '正在反击的词怪',
      visualState: 'is-attacking',
    });
    expect(resolveMonsterArtwork(fightingState({ enemyHealth: 0 }), 'grunt', 'defeated')).toMatchObject({
      alt: '被击败的词怪',
      visualState: 'is-defeated',
    });
    expect(resolveMonsterArtwork(fightingState({ enemyHealth: 40 }), 'grunt', 'knockdown'))
      .toMatchObject({ alt: '被暴击击倒的词怪', visualState: 'is-knockdown' });
    expect(resolveMonsterArtwork(fightingState({ enemyHealth: 40 }), 'grunt', 'recovering'))
      .toMatchObject({ alt: '正在起身的词怪', visualState: 'is-recovering' });
  });

  it('switches boss artwork at 66 and 33 percent health', () => {
    expect(resolveMonsterArtwork(fightingState({ enemyHealth: 80, maxEnemyHealth: 100 }), 'boss'))
      .toMatchObject({ alt: '词怪领主', visualState: 'is-idle' });
    expect(resolveMonsterArtwork(fightingState({ enemyHealth: 60, maxEnemyHealth: 100 }), 'boss'))
      .toMatchObject({ alt: '受创失衡的词怪领主', visualState: 'is-wounded' });
    expect(resolveMonsterArtwork(fightingState({ enemyHealth: 30, maxEnemyHealth: 100 }), 'boss'))
      .toMatchObject({ alt: '进入狂暴阶段的词怪领主', visualState: 'is-enraged' });
    expect(resolveMonsterArtwork(fightingState({ enemyHealth: 0, maxEnemyHealth: 100 }), 'boss', 'defeated'))
      .toMatchObject({ alt: '倒下的词怪领主', visualState: 'is-defeated' });
  });
});
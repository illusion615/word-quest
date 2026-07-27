import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCombatState, type CombatEvent, type CombatState } from '../domain/combat';
import type { WaveMonster } from '../domain/monsterRoster';
import {
  getMonsterArtworkSources,
  monsterPoseArtwork,
  resolveMonsterArtwork,
} from './combatArtwork';
import { CombatHud } from './CombatHud';

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
  };
}

const commonMonster: WaveMonster = {
  wordId: 'basic',
  word: 'basic',
  phonetic: '/ˈbeɪsɪk/',
  definitionZh: '基本的',
  tier: 'common',
  difficultyScore: 0.2,
  rarity: 0.2,
  lengthScore: 0.1,
  learningStage: 'sound',
  attempts: 0,
  mistakes: 0,
  mastery: 0,
  status: 'pending',
};

describe('combat monster artwork', () => {
  it('preloads both the new roster character and legacy fallback frames', () => {
    expect(getMonsterArtworkSources('grunt')).toHaveLength(24);
    expect(getMonsterArtworkSources('boss')).toHaveLength(4);
  });

  it('keeps every pose of a word on one stable common-tier character', () => {
    const artwork = (['aloof', 'challenge', 'vanquished', 'triumphant'] as const)
      .map((pose) => monsterPoseArtwork(pose, 'common', 'basic'));

    expect(new Set(artwork.map((frame) => frame.characterId))).toHaveLength(1);
    expect(new Set(artwork.map((frame) => frame.src))).toHaveLength(4);
  });

  it('distributes common words across all available character designs', () => {
    const characterIds = new Set(
      ['basic', 'troop', 'rank', 'eighteen', 'cat', 'dog', 'word', 'battle']
        .map((wordId) => monsterPoseArtwork('aloof', 'common', wordId).characterId),
    );

    expect(characterIds).toEqual(new Set([
      'silkwind-quill-marten',
      'razorplume-marauder',
      'inkveil-duelist',
    ]));
    expect(monsterPoseArtwork('challenge', 'common', 'rank')).toMatchObject({
      characterId: 'inkveil-duelist',
      alt: '正在嚣张叫阵的墨幕决斗灵',
    });
  });

  it('uses dedicated silhouettes for uncommon and rare words', () => {
    const uncommon = (['aloof', 'challenge', 'vanquished', 'triumphant'] as const)
      .map((pose) => monsterPoseArtwork(pose, 'uncommon', 'credit'));
    const rare = (['aloof', 'challenge', 'vanquished', 'triumphant'] as const)
      .map((pose) => monsterPoseArtwork(pose, 'rare', 'achieve'));

    expect(new Set(uncommon.map((frame) => frame.characterId)))
      .toEqual(new Set(['shardback-knuckler']));
    expect(new Set(uncommon.map((frame) => frame.src))).toHaveLength(4);
    expect(uncommon[1].alt).toBe('正在嚣张叫阵的碎晶拳兽');
    expect(new Set(rare.map((frame) => frame.characterId)))
      .toEqual(new Set(['crownmaw-reliquary']));
    expect(new Set(rare.map((frame) => frame.src))).toHaveLength(4);
    expect(rare[2].alt).toBe('败退但不甘的冠匣吞金兽');
    expect(monsterPoseArtwork('aloof', 'elite', 'scholarship').characterId)
      .toBe('legacy-grunt');
  });

  it('starts the challenge pose only when the focused roster monster becomes active', () => {
    const preview = renderToStaticMarkup(
      <CombatHud
        state={fightingState()}
        levelNumber={1}
        roster={[commonMonster]}
        focusWordId="basic"
      />,
    );
    const fighting = renderToStaticMarkup(
      <CombatHud
        state={fightingState()}
        levelNumber={1}
        roster={[{ ...commonMonster, status: 'active' }]}
        focusWordId="basic"
      />,
    );

    expect(preview).toContain('pose-aloof');
    expect(fighting).toContain('pose-challenge');
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

  it('changes Boss artwork exactly at the 12-question stage boundaries', () => {
    expect(resolveMonsterArtwork(fightingState({ enemyHealth: 12, maxEnemyHealth: 12 }), 'boss'))
      .toMatchObject({ visualState: 'is-idle' });
    expect(resolveMonsterArtwork(fightingState({ enemyHealth: 8, maxEnemyHealth: 12 }), 'boss'))
      .toMatchObject({ visualState: 'is-wounded' });
    expect(resolveMonsterArtwork(fightingState({ enemyHealth: 4, maxEnemyHealth: 12 }), 'boss'))
      .toMatchObject({ visualState: 'is-enraged' });
  });
});
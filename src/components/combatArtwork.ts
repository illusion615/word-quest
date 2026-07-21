import bossDefeated from '../assets/monsters/boss/defeated.png';
import bossPhaseOne from '../assets/monsters/boss/phase-1.png';
import bossPhaseTwo from '../assets/monsters/boss/phase-2.png';
import bossPhaseThree from '../assets/monsters/boss/phase-3.png';
import gruntAttack from '../assets/monsters/grunt/attack.png';
import gruntDefeated from '../assets/monsters/grunt/defeated.png';
import gruntHurt from '../assets/monsters/grunt/hurt.png';
import gruntIdle from '../assets/monsters/grunt/idle.png';
import type { CombatState } from '../domain/combat';
import type { MonsterPose } from './monsterPresentation';

export type CombatEnemyKind = 'grunt' | 'boss';

interface MonsterArtwork {
  src: string;
  alt: string;
  visualState: string;
}

const ARTWORK_BY_ENEMY: Record<CombatEnemyKind, readonly string[]> = {
  grunt: [gruntIdle, gruntHurt, gruntAttack, gruntDefeated],
  boss: [bossPhaseOne, bossPhaseTwo, bossPhaseThree, bossDefeated],
};

function percentage(value: number, maximum: number): number {
  return maximum > 0 ? Math.round((value / maximum) * 100) : 0;
}

export function getMonsterArtworkSources(enemyKind: CombatEnemyKind): readonly string[] {
  return ARTWORK_BY_ENEMY[enemyKind];
}

export function resolveMonsterArtwork(
  state: CombatState,
  enemyKind: CombatEnemyKind,
  pose: MonsterPose = 'idle',
): MonsterArtwork {
  if (enemyKind === 'boss') {
    if (pose === 'defeated') {
      return { src: bossDefeated, alt: '倒下的词怪领主', visualState: 'is-defeated' };
    }
    if (pose === 'knockdown') {
      return { src: bossDefeated, alt: '被暴击击倒的词怪领主', visualState: 'is-knockdown' };
    }
    if (pose === 'attacking') {
      return { src: bossPhaseThree, alt: '正在反击的词怪领主', visualState: 'is-attacking' };
    }
    if (pose === 'hit' || pose === 'recovering') {
      return {
        src: bossPhaseTwo,
        alt: pose === 'recovering' ? '正在起身的词怪领主' : '受创失衡的词怪领主',
        visualState: pose === 'recovering' ? 'is-recovering' : 'is-hurt',
      };
    }
    const healthPercentage = percentage(state.enemyHealth, state.maxEnemyHealth);
    if (healthPercentage <= 33) {
      return { src: bossPhaseThree, alt: '进入狂暴阶段的词怪领主', visualState: 'is-enraged' };
    }
    if (healthPercentage <= 66) {
      return { src: bossPhaseTwo, alt: '受创失衡的词怪领主', visualState: 'is-wounded' };
    }
    return { src: bossPhaseOne, alt: '词怪领主', visualState: 'is-idle' };
  }

  if (pose === 'defeated') {
    return { src: gruntDefeated, alt: '被击败的词怪', visualState: 'is-defeated' };
  }
  if (pose === 'knockdown') {
    return { src: gruntDefeated, alt: '被暴击击倒的词怪', visualState: 'is-knockdown' };
  }
  if (pose === 'recovering') {
    return { src: gruntHurt, alt: '正在起身的词怪', visualState: 'is-recovering' };
  }
  if (pose === 'attacking') {
    return { src: gruntAttack, alt: '正在反击的词怪', visualState: 'is-attacking' };
  }
  if (pose === 'hit') {
    return { src: gruntHurt, alt: '受到攻击的词怪', visualState: 'is-hurt' };
  }
  return { src: gruntIdle, alt: '等待战斗的词怪', visualState: 'is-idle' };
}
import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../domain/combat';
import type { WaveMonster } from '../domain/monsterRoster';
import { monsterTauntLevel, resolveMonsterDialogue } from './monsterDialogue';

const monster: WaveMonster = {
  wordId: 'achieve',
  word: 'achieve',
  phonetic: '/əˈtʃiːv/',
  definitionZh: '实现；达成',
  tier: 'rare',
  difficultyScore: 0.68,
  rarity: 0.72,
  lengthScore: 0.38,
  learningStage: 'context',
  attempts: 2,
  mistakes: 1,
  mastery: 50,
  status: 'active',
};

function event(overrides: Partial<CombatEvent> = {}): CombatEvent {
  return {
    id: 1,
    kind: 'hit',
    damage: 10,
    critical: false,
    combo: 1,
    enemyDefeated: false,
    ...overrides,
  };
}

describe('monster dialogue', () => {
  it('lets only the focused monster speak', () => {
    expect(resolveMonsterDialogue(monster, null, false)).toBeNull();
    expect(resolveMonsterDialogue(monster, null, true)).toMatchObject({
      tone: 'taunt',
      level: 'assertive',
    });
  });

  it('escalates frequent mistakes into a personalized nemesis taunt', () => {
    const nemesis = { ...monster, attempts: 6, correct: 2, mistakes: 4, mastery: 33 };
    const dialogue = resolveMonsterDialogue(nemesis, null, true, { round: 2 });

    expect(monsterTauntLevel(nemesis)).toBe('nemesis');
    expect(dialogue).toMatchObject({ tone: 'taunt', level: 'nemesis' });
    expect(dialogue?.text).toMatch(/4 次|第 7 次/);
  });

  it('targets a live combo and varies the same word across rounds', () => {
    const easy = {
      ...monster,
      tier: 'common' as const,
      difficultyScore: 0.12,
      rarity: 0.08,
      lengthScore: 0.1,
      learningStage: 'sound' as const,
      attempts: 1,
      mistakes: 0,
      mastery: 100,
    };
    const first = resolveMonsterDialogue(easy, null, true, { combo: 7, round: 1 });
    const second = resolveMonsterDialogue(easy, null, true, { combo: 7, round: 2 });

    expect(first).toMatchObject({ level: 'fierce' });
    expect(first?.text).toContain('7');
    expect(second?.text).not.toBe(first?.text);
  });

  it('treats an unseen elite low-frequency word as a fierce opponent', () => {
    const elite = {
      ...monster,
      tier: 'elite' as const,
      difficultyScore: 0.91,
      rarity: 0.96,
      lengthScore: 0.82,
      learningStage: 'new' as const,
      attempts: 0,
      mistakes: 0,
      mastery: 0,
    };
    const dialogue = resolveMonsterDialogue(elite, null, true, { round: 0 });

    expect(monsterTauntLevel(elite)).toBe('fierce');
    expect(dialogue).toMatchObject({ level: 'fierce', tone: 'taunt' });
    expect(dialogue?.text).toMatch(/低频|少见|生僻/);
  });

  it('reacts to a correct answer instead of repeating the head word', () => {
    expect(resolveMonsterDialogue(
      { ...monster, status: 'defeated' },
      event(),
      true,
    )).toMatchObject({ tone: 'staggered' });
    expect(resolveMonsterDialogue(
      { ...monster, status: 'defeated' },
      event({ critical: true }),
      true,
    )).toMatchObject({ tone: 'staggered' });
  });

  it('gloats after a wrong answer and challenges during preview', () => {
    expect(resolveMonsterDialogue(
      { ...monster, attempts: 6, mistakes: 4, status: 'missed' },
      event({ kind: 'hurt', damage: 0 }),
      true,
    )).toMatchObject({ tone: 'gloating', level: 'nemesis', text: '第 4 次了，你还是没记住。' });
    expect(resolveMonsterDialogue(
      { ...monster, status: 'pending' },
      null,
      true,
    )).toMatchObject({ tone: 'taunt' });
  });
});
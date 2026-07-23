import { describe, expect, it } from 'vitest';
import type { WordEntry } from './models';
import { buildRarityIndex, buildWaveMonsters, monsterTier } from './monsterRoster';

function makeWord(word: string): WordEntry {
  return {
    id: word.toLowerCase(),
    word,
    phonetic: '',
    partOfSpeech: 'noun',
    definition: 'x',
    definitionZh: 'x',
    banks: ['gaokao'],
  };
}

describe('buildRarityIndex', () => {
  it('maps the first (most common) word to 0 and the last to 1', () => {
    const entries = [makeWord('the'), makeWord('cat'), makeWord('quay')];
    const index = buildRarityIndex(entries);
    expect(index.get('the')).toBe(0);
    expect(index.get('quay')).toBe(1);
    expect(index.get('cat')).toBeCloseTo(0.5, 5);
  });
});

describe('monsterTier', () => {
  it('rates a common short word weak and a rare long word elite', () => {
    const entries = [makeWord('cat'), makeWord('conscientious')];
    const index = buildRarityIndex(entries);
    expect(monsterTier(makeWord('cat'), index)).toBe('common');
    expect(monsterTier(makeWord('conscientious'), index)).toBe('elite');
  });
});

describe('buildWaveMonsters', () => {
  it('carries each word status through and assigns a tier', () => {
    const entries = [makeWord('cat'), makeWord('conscientious')];
    const index = buildRarityIndex(entries);
    const monsters = buildWaveMonsters(
      [
        { word: makeWord('cat'), stage: 'new', status: 'defeated' },
        {
          word: makeWord('conscientious'),
          stage: 'recall',
          progress: {
            wordId: 'conscientious',
            attempts: 5,
            correct: 2,
            mastery: 40,
            card: {
              due: '2026-07-23T00:00:00.000Z',
              stability: 1,
              difficulty: 5,
              elapsed_days: 1,
              scheduled_days: 1,
              learning_steps: 0,
              reps: 5,
              lapses: 3,
              state: 3,
            },
          },
          status: 'active',
        },
      ],
      index,
    );
    expect(monsters[0]).toMatchObject({
      wordId: 'cat',
      tier: 'common',
      learningStage: 'new',
      attempts: 0,
      mistakes: 0,
      mastery: 0,
      status: 'defeated',
    });
    expect(monsters[1]).toMatchObject({
      wordId: 'conscientious',
      tier: 'elite',
      learningStage: 'recall',
      attempts: 5,
      mistakes: 3,
      mastery: 40,
      status: 'active',
    });
    expect(monsters[1].difficultyScore).toBeGreaterThan(monsters[0].difficultyScore);
  });
});

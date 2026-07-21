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
        { word: makeWord('cat'), status: 'defeated' },
        { word: makeWord('conscientious'), status: 'active' },
      ],
      index,
    );
    expect(monsters).toEqual([
      { wordId: 'cat', word: 'cat', phonetic: '', definitionZh: 'x', tier: 'common', status: 'defeated' },
      { wordId: 'conscientious', word: 'conscientious', phonetic: '', definitionZh: 'x', tier: 'elite', status: 'active' },
    ]);
  });
});

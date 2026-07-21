import { describe, expect, it } from 'vitest';
import type { WordEntry } from './models';
import {
  computeWordDifficulty,
  letterCount,
  lengthScore,
  rarityFromRank,
  tierForScore,
} from './wordDifficulty';

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

describe('rarityFromRank', () => {
  it('maps the most common word to 0 and the rarest to 1', () => {
    expect(rarityFromRank(0, 1000)).toBe(0);
    expect(rarityFromRank(999, 1000)).toBe(1);
    expect(rarityFromRank(499, 1000)).toBeCloseTo(0.4995, 3);
  });

  it('is safe for degenerate bank sizes', () => {
    expect(rarityFromRank(0, 1)).toBe(0);
    expect(rarityFromRank(0, 0)).toBe(0);
  });
});

describe('letterCount / lengthScore', () => {
  it('counts letters only, ignoring spaces, hyphens and apostrophes', () => {
    expect(letterCount('cat')).toBe(3);
    expect(letterCount("mother-in-law")).toBe(11);
    expect(letterCount("don't")).toBe(4);
  });

  it('scores 4-letter words at 0 and saturates at 12 letters', () => {
    expect(lengthScore('care')).toBe(0);
    expect(lengthScore('cat')).toBe(0);
    expect(lengthScore('conscientious')).toBe(1);
    expect(lengthScore('academic')).toBeCloseTo(0.5, 5);
  });
});

describe('tierForScore', () => {
  it('assigns tiers by threshold', () => {
    expect(tierForScore(0)).toBe('common');
    expect(tierForScore(0.24)).toBe('common');
    expect(tierForScore(0.25)).toBe('uncommon');
    expect(tierForScore(0.49)).toBe('uncommon');
    expect(tierForScore(0.5)).toBe('rare');
    expect(tierForScore(0.74)).toBe('rare');
    expect(tierForScore(0.75)).toBe('elite');
    expect(tierForScore(1)).toBe('elite');
  });
});

describe('computeWordDifficulty', () => {
  it('rates a common short word as the weakest tier', () => {
    const result = computeWordDifficulty(makeWord('cat'), 0);
    expect(result.tier).toBe('common');
    expect(result.score).toBe(0);
  });

  it('rates a rare long word as an elite', () => {
    const result = computeWordDifficulty(makeWord('conscientious'), 1);
    expect(result.tier).toBe('elite');
    expect(result.score).toBe(1);
  });

  it('blends rarity and length with rarity leading', () => {
    // Rare (1) but short (4 letters → length 0): 0.55*1 + 0.45*0 = 0.55 → rare.
    const rareShort = computeWordDifficulty(makeWord('quay'), 1);
    expect(rareShort.score).toBeCloseTo(0.55, 5);
    expect(rareShort.tier).toBe('rare');

    // Common (0) but long (12 → length 1): 0.55*0 + 0.45*1 = 0.45 → uncommon.
    const commonLong = computeWordDifficulty(makeWord('relationship'), 0);
    expect(commonLong.score).toBeCloseTo(0.45, 5);
    expect(commonLong.tier).toBe('uncommon');
  });

  it('clamps out-of-range rarity input', () => {
    expect(computeWordDifficulty(makeWord('cat'), -5).rarity).toBe(0);
    expect(computeWordDifficulty(makeWord('cat'), 9).rarity).toBe(1);
  });
});

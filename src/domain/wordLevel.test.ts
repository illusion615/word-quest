import { describe, expect, it } from 'vitest';
import type { WordEntry } from './models';
import { isBelowBankLevel } from './wordLevel';

function word(id: string, sourceTags?: string[]): WordEntry {
  return {
    id,
    word: id,
    phonetic: '',
    partOfSpeech: '',
    definition: '',
    definitionZh: '',
    banks: ['gaokao'],
    sourceTags,
  };
}

describe('word level', () => {
  it('marks sub-college function words as below the 高考 level', () => {
    expect(isBelowBankLevel(word('the', ['gk', 'zk']), 'gaokao')).toBe(true);
    expect(isBelowBankLevel(word('and', ['gk', 'zk']), 'gaokao')).toBe(true);
  });

  it('keeps words that reach college scope at the 高考 level', () => {
    expect(isBelowBankLevel(word('achieve', ['cet4', 'cet6', 'gk', 'ky', 'zk']), 'gaokao')).toBe(false);
    expect(isBelowBankLevel(word('abandon', ['cet4', 'cet6', 'gk', 'gre', 'ky']), 'gaokao')).toBe(false);
  });

  it('treats words without scope tags as below level', () => {
    expect(isBelowBankLevel(word('mystery', undefined), 'gaokao')).toBe(true);
    expect(isBelowBankLevel(word('mystery', []), 'gaokao')).toBe(true);
  });

  it('requires the next tier up for each ladder bank', () => {
    expect(isBelowBankLevel(word('easy', ['cet4', 'gk']), 'cet4')).toBe(true);
    expect(isBelowBankLevel(word('harder', ['cet4', 'cet6']), 'cet4')).toBe(false);
    expect(isBelowBankLevel(word('mid', ['cet4', 'cet6']), 'cet6')).toBe(true);
    expect(isBelowBankLevel(word('deep', ['cet6', 'ky']), 'cet6')).toBe(false);
  });

  it('never demotes members of the top preparation banks', () => {
    expect(isBelowBankLevel(word('common', ['gk', 'ielts', 'zk']), 'ielts')).toBe(false);
    expect(isBelowBankLevel(word('common', ['gk', 'toefl', 'zk']), 'toefl')).toBe(false);
  });
});

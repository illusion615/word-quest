import { describe, expect, it } from 'vitest';
import {
  candidateLemmas,
  countTargetOccurrences,
  splitEnglishSentences,
  tokenizeEnglishSentence,
} from './sentencePolicy';

describe('sentence text helpers', () => {
  it('counts inflected forms of a target word as occurrences', () => {
    expect(countTargetOccurrences('The plan includes many steps.', 'include')).toBe(1);
    expect(countTargetOccurrences('She achieved goals while achieving more.', 'achieve')).toBe(2);
    expect(countTargetOccurrences('The benefit was clear.', 'include')).toBe(0);
  });

  it('tokenizes contractions and hyphenated words as complete vocabulary forms', () => {
    expect(tokenizeEnglishSentence("We can't re-use it.")).toEqual(['we', "can't", 're-use', 'it']);
  });

  it('splits a passage into its sentences', () => {
    const passage = 'We have one curious idea about it. We can learn today.';
    expect(splitEnglishSentences(passage)).toEqual([
      'We have one curious idea about it.',
      'We can learn today.',
    ]);
  });

  it('resolves common inflections and irregular verb forms to their base lemma', () => {
    expect(candidateLemmas('was')).toContain('be');
    expect(candidateLemmas('learning')).toContain('learn');
    expect(candidateLemmas('stood')).toContain('stand');
    expect(candidateLemmas('brought')).toContain('bring');
    expect(candidateLemmas('understood')).toContain('understand');
  });
});
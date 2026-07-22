import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import type { WordEntry } from './models';
import {
  frequencyBand,
  selectFrequencyMix,
  withFrequencyMetadata,
} from './frequencyMix';

function words(count: number): WordEntry[] {
  return withFrequencyMetadata(Array.from({ length: count }, (_, index) => ({
    ...TEST_WORDS[index % TEST_WORDS.length],
    id: `word-${index}`,
    word: `word${index}`,
  })));
}

describe('frequency mix', () => {
  it('keeps all four bands represented in a normal batch', () => {
    const entries = words(40);
    const selected = selectFrequencyMix(entries, 8, 'balanced');
    const bands = new Set(selected.map((word) => frequencyBand(word)));

    expect(selected).toHaveLength(8);
    expect(bands).toEqual(new Set([0, 1, 2, 3]));
  });

  it('biases relaxed toward common and hardcore toward rare without becoming one-note', () => {
    const entries = words(80);
    const relaxed = selectFrequencyMix(entries, 12, 'common-led');
    const hardcore = selectFrequencyMix(entries, 12, 'rare-led');
    const counts = (selected: WordEntry[]) => selected.reduce((out, word) => {
      out[frequencyBand(word)] += 1;
      return out;
    }, [0, 0, 0, 0]);
    const relaxedCounts = counts(relaxed);
    const hardcoreCounts = counts(hardcore);

    expect(relaxedCounts.every((count) => count > 0)).toBe(true);
    expect(hardcoreCounts.every((count) => count > 0)).toBe(true);
    expect(relaxedCounts[0]).toBeGreaterThan(relaxedCounts[3]);
    expect(hardcoreCounts[3]).toBeGreaterThan(hardcoreCounts[0]);
  });

  it('is deterministic and never duplicates a word', () => {
    const entries = words(40);
    const first = selectFrequencyMix(entries, 16, 'rare-led');
    const second = selectFrequencyMix(entries, 16, 'rare-led');

    expect(second.map((word) => word.id)).toEqual(first.map((word) => word.id));
    expect(new Set(first.map((word) => word.id)).size).toBe(first.length);
  });
});

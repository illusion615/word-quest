import type { WordEntry } from './models';

export interface FrequencyEntry {
  frequencyRank?: number;
  frequencyPercentile?: number;
}

export const FREQUENCY_BAND_COUNT = 4;

export type FrequencyProfile = 'common-led' | 'balanced' | 'rare-led';

const PROFILE_WEIGHTS: Record<FrequencyProfile, readonly number[]> = {
  'common-led': [0.45, 0.3, 0.15, 0.1],
  balanced: [0.25, 0.25, 0.25, 0.25],
  'rare-led': [0.1, 0.15, 0.3, 0.45],
};

export function withFrequencyMetadata<T extends FrequencyEntry>(entries: readonly T[]): T[] {
  return entries.map((entry, index) => ({
    ...entry,
    frequencyRank: index,
    frequencyPercentile: entries.length <= 1 ? 0 : index / (entries.length - 1),
  }));
}

export function frequencyBand(word: FrequencyEntry, fallbackIndex = 0, total = 1): number {
  const percentile = word.frequencyPercentile
    ?? (total <= 1 ? 0 : fallbackIndex / (total - 1));
  return Math.min(
    FREQUENCY_BAND_COUNT - 1,
    Math.max(0, Math.floor(percentile * FREQUENCY_BAND_COUNT)),
  );
}

export function splitFrequencyBands<T extends FrequencyEntry>(entries: readonly T[]): T[][] {
  const bands = Array.from({ length: FREQUENCY_BAND_COUNT }, () => [] as T[]);
  entries.forEach((entry, index) => {
    bands[frequencyBand(entry, index, entries.length)].push(entry);
  });
  return bands;
}

export function allocateFrequencyQuotas(
  available: readonly number[],
  size: number,
  weights: readonly number[],
): number[] {
  const quotas = available.map(() => 0);
  const activeBands = available
    .map((remaining, index) => ({ remaining, index }))
    .filter(({ remaining }) => remaining > 0)
    .map(({ index }) => index);
  let unassigned = Math.min(size, available.reduce((sum, count) => sum + count, 0));

  // A batch of at least four words always contains every available frequency
  // band before the profile applies its high/low-frequency preference.
  if (unassigned >= activeBands.length) {
    activeBands.forEach((index) => {
      quotas[index] = 1;
      unassigned -= 1;
    });
  }

  while (unassigned > 0) {
    const candidates = activeBands.filter((index) => quotas[index] < available[index]);
    if (candidates.length === 0) break;
    const chosen = candidates.reduce((best, index) => {
      const deficit = (weights[index] * size) - quotas[index];
      const bestDeficit = (weights[best] * size) - quotas[best];
      if (deficit !== bestDeficit) return deficit > bestDeficit ? index : best;
      return available[index] - quotas[index] > available[best] - quotas[best]
        ? index
        : best;
    });
    quotas[chosen] += 1;
    unassigned -= 1;
  }
  return quotas;
}

export function weaveFrequencyBands<T>(
  bandWords: readonly T[][],
  tieWeights: readonly number[] = PROFILE_WEIGHTS.balanced,
): T[] {
  const targetCounts = bandWords.map((words) => words.length);
  const used = bandWords.map(() => 0);
  const total = targetCounts.reduce((sum, count) => sum + count, 0);
  const mixed: T[] = [];

  for (let position = 0; position < total; position += 1) {
    const candidates = bandWords
      .map((words, index) => ({ index, remaining: words.length - used[index] }))
      .filter(({ remaining }) => remaining > 0);
    const chosen = candidates.reduce((best, candidate) => {
      const deficit = ((targetCounts[candidate.index] * (position + 1)) / total)
        - used[candidate.index];
      const bestDeficit = ((targetCounts[best.index] * (position + 1)) / total)
        - used[best.index];
      if (deficit !== bestDeficit) return deficit > bestDeficit ? candidate : best;
      return tieWeights[candidate.index] > tieWeights[best.index] ? candidate : best;
    });
    mixed.push(bandWords[chosen.index][used[chosen.index]]);
    used[chosen.index] += 1;
  }
  return mixed;
}

export function selectFrequencyMix(
  entries: readonly WordEntry[],
  size: number,
  profile: FrequencyProfile,
): WordEntry[] {
  if (size <= 0 || entries.length === 0) return [];
  const bands = splitFrequencyBands(entries);
  const quotas = allocateFrequencyQuotas(
    bands.map((band) => band.length),
    size,
    PROFILE_WEIGHTS[profile],
  );
  return weaveFrequencyBands(
    bands.map((band, index) => band.slice(0, quotas[index])),
    PROFILE_WEIGHTS[profile],
  );
}
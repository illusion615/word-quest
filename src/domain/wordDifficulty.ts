import type { WordEntry } from './models';

/**
 * Intrinsic word difficulty — how hard a word is to hold in memory, independent
 * of the current learner. It blends two signals the boss called out:
 *   - rarity: the word's frequency rank within its bank (rarer = harder)
 *   - length: longer words are heavier to memorise than short ones
 * The result drives which monster tier represents the word in battle.
 */
export type MonsterTier = 'common' | 'uncommon' | 'rare' | 'elite';

export const MONSTER_TIERS: readonly MonsterTier[] = [
  'common',
  'uncommon',
  'rare',
  'elite',
];

// Rarity leads slightly over length; both are tunable.
const RARITY_WEIGHT = 0.55;
const LENGTH_WEIGHT = 0.45;

// A 4-letter word scores 0 on length; 12+ letters saturates at 1.
const MIN_LETTERS = 4;
const MAX_LETTERS = 12;

const TIER_THRESHOLDS: readonly { max: number; tier: MonsterTier }[] = [
  { max: 0.25, tier: 'common' },
  { max: 0.5, tier: 'uncommon' },
  { max: 0.75, tier: 'rare' },
  { max: Number.POSITIVE_INFINITY, tier: 'elite' },
];

export interface WordDifficulty {
  /** Combined 0..1 difficulty. */
  score: number;
  tier: MonsterTier;
  /** 0 = most common word in the bank, 1 = rarest. */
  rarity: number;
  /** 0..1 contribution from word length. */
  lengthScore: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Rarity as a 0..1 percentile from a word's position in a frequency-sorted bank.
 * Banks are written most-common-first, so index 0 is the most common word.
 */
export function rarityFromRank(index: number, bankSize: number): number {
  if (bankSize <= 1) return 0;
  return clamp01(index / (bankSize - 1));
}

/** Letters only — hyphens, spaces and apostrophes do not add memory load. */
export function letterCount(word: string): number {
  return (word.match(/[a-z]/gi) ?? []).length;
}

export function lengthScore(word: string): number {
  const letters = letterCount(word);
  return clamp01((letters - MIN_LETTERS) / (MAX_LETTERS - MIN_LETTERS));
}

export function tierForScore(score: number): MonsterTier {
  return TIER_THRESHOLDS.find((threshold) => score < threshold.max)?.tier ?? 'elite';
}

/**
 * Combines a word's rarity (0..1, supplied by the caller from the frequency-
 * sorted bank position) with its length into a difficulty score and monster tier.
 */
export function computeWordDifficulty(word: WordEntry, rarity: number): WordDifficulty {
  const clampedRarity = clamp01(rarity);
  const length = lengthScore(word.word);
  const score = clamp01(RARITY_WEIGHT * clampedRarity + LENGTH_WEIGHT * length);
  return { score, tier: tierForScore(score), rarity: clampedRarity, lengthScore: length };
}

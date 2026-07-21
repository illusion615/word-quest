import type { WordEntry } from './models';
import { computeWordDifficulty, rarityFromRank, type MonsterTier } from './wordDifficulty';

/**
 * A wave's monsters, derived from its words. Intrinsic difficulty (rarity +
 * length) picks each monster's tier/art; the session drives its live status.
 */
export type MonsterStatus = 'pending' | 'active' | 'defeated' | 'missed';

export interface WaveMonster {
  wordId: string;
  word: string;
  phonetic: string;
  definitionZh: string;
  tier: MonsterTier;
  status: MonsterStatus;
}

export interface WaveMonsterInput {
  word: WordEntry;
  status: MonsterStatus;
}

/**
 * Maps each word to a 0..1 rarity from its position in the frequency-sorted
 * bank (index 0 = most common). Banks are written most-common-first, so this
 * needs no extra data.
 */
export function buildRarityIndex(entries: readonly WordEntry[]): Map<string, number> {
  const size = entries.length;
  const index = new Map<string, number>();
  entries.forEach((entry, position) => {
    index.set(entry.id, rarityFromRank(position, size));
  });
  return index;
}

export function monsterTier(word: WordEntry, rarityIndex: Map<string, number>): MonsterTier {
  return computeWordDifficulty(word, rarityIndex.get(word.id) ?? 0).tier;
}

export function buildWaveMonsters(
  inputs: readonly WaveMonsterInput[],
  rarityIndex: Map<string, number>,
): WaveMonster[] {
  return inputs.map(({ word, status }) => ({
    wordId: word.id,
    word: word.word,
    phonetic: word.phonetic,
    definitionZh: word.definitionZh,
    tier: monsterTier(word, rarityIndex),
    status,
  }));
}

export const LEXICON_SHARD_COUNT = 256;

export function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function lexiconShardId(wordId: string): string {
  return (fnv1a(wordId) & (LEXICON_SHARD_COUNT - 1))
    .toString(16)
    .padStart(2, '0');
}

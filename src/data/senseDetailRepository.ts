import type { DictionarySenseShard, DictionaryWordSenses } from '../domain/models';
import { lexiconShardId } from '../domain/lexiconShard';

export const DICTIONARY_SENSE_SCHEMA_VERSION = 1;

const shardPromises = new Map<string, Promise<DictionarySenseShard | null>>();

function validateShard(value: unknown): DictionarySenseShard {
  if (!value || typeof value !== 'object') throw new Error('词典义项分片格式无效。');
  const candidate = value as Partial<DictionarySenseShard>;
  if (candidate.schemaVersion !== DICTIONARY_SENSE_SCHEMA_VERSION
    || !candidate.words
    || typeof candidate.words !== 'object') {
    throw new Error('词典义项分片版本不匹配。');
  }
  return candidate as DictionarySenseShard;
}

function loadShard(
  shardId: string,
  fetcher: typeof fetch,
): Promise<DictionarySenseShard | null> {
  const request = fetcher(
    `${import.meta.env.BASE_URL}data/lexicon/senses/v1/${shardId}.json`,
  ).then(async (response) => {
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`词典义项加载失败 (${response.status})。`);
    if (response.headers.get('content-type')?.includes('text/html')) return null;
    return validateShard(await response.json());
  }).catch((error) => {
    shardPromises.delete(shardId);
    throw error;
  });
  shardPromises.set(shardId, request);
  return request;
}

export async function loadDictionarySenses(
  wordId: string,
  fetcher: typeof fetch = fetch,
): Promise<DictionaryWordSenses | null> {
  const shardId = lexiconShardId(wordId);
  const shard = shardPromises.get(shardId) ?? loadShard(shardId, fetcher);
  return (await shard)?.words[wordId] ?? null;
}

export function clearDictionarySenseCache(): void {
  shardPromises.clear();
}

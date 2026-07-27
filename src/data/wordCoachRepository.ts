import type {
  StaticWordCoachRecord,
  StaticWordCoachShard,
  WordEntry,
  WordExplanation,
} from '../domain/models';
import {
  WORD_COACH_PROMPT_VERSION,
  WORD_COACH_SCHEMA_VERSION,
  assessWordCoachQuality,
  wordCoachShardId,
  wordCoachSourceHash,
} from '../domain/wordCoach';
import { parseWordSenses } from '../domain/wordText';
import { parseStoredWordExplanation } from '../services/aiClient';

const shardPromises = new Map<string, Promise<StaticWordCoachShard | null>>();

export { wordCoachShardId, wordCoachSourceHash } from '../domain/wordCoach';

function validateShard(value: unknown): StaticWordCoachShard {
  if (!value || typeof value !== 'object') throw new Error('静态词汇讲解分片格式无效。');
  const candidate = value as Partial<StaticWordCoachShard>;
  if (candidate.schemaVersion !== WORD_COACH_SCHEMA_VERSION
    || !candidate.records
    || typeof candidate.records !== 'object') {
    throw new Error('静态词汇讲解分片版本不匹配。');
  }
  return candidate as StaticWordCoachShard;
}

async function loadShard(
  shardId: string,
  fetcher: typeof fetch,
): Promise<StaticWordCoachShard | null> {
  const request = fetcher(
    `${import.meta.env.BASE_URL}data/word-coach/v1/${shardId}.json`,
  ).then(async (response) => {
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`静态词汇讲解加载失败 (${response.status})。`);
    if (response.headers.get('content-type')?.includes('text/html')) return null;
    return validateShard(await response.json());
  }).catch((error) => {
    shardPromises.delete(shardId);
    throw error;
  });
  shardPromises.set(shardId, request);
  return request;
}

function parseRecord(word: WordEntry, record: StaticWordCoachRecord): WordExplanation | null {
  if (record.promptVersion !== WORD_COACH_PROMPT_VERSION
    || record.sourceHash !== wordCoachSourceHash(word)) return null;
  const explanation = parseStoredWordExplanation(
    record,
    parseWordSenses(word),
    word.word,
  );
  if (assessWordCoachQuality(word, explanation)
    .some((issue) => issue.severity === 'error')) return null;
  return explanation;
}

export async function loadStaticWordExplanation(
  word: WordEntry,
  fetcher: typeof fetch = fetch,
): Promise<WordExplanation | null> {
  const shardId = wordCoachShardId(word.id);
  const shard = shardPromises.get(shardId) ?? loadShard(shardId, fetcher);
  const record = (await shard)?.records[word.id];
  return record ? parseRecord(word, record) : null;
}

export function clearWordCoachCache(): void {
  shardPromises.clear();
}
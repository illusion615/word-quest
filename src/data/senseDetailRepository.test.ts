/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { lexiconShardId } from '../domain/lexiconShard';
import { clearDictionarySenseCache, loadDictionarySenses } from './senseDetailRepository';

function shardFetcher(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^.*data\//, 'public/data/');
    return new Response(readFileSync(resolve(path), 'utf8'), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('dictionary sense repository', () => {
  beforeEach(() => {
    clearDictionarySenseCache();
  });

  it('loads generated Oxford senses from the shard the app computes', async () => {
    const senses = await loadDictionarySenses('roof', shardFetcher());

    expect(senses?.senses.map((sense) => sense.definitionZh).slice(0, 3))
      .toEqual(['屋顶', '车顶', '洞顶']);
    const first = senses?.senses[0];
    expect(first?.label).toBe('n.');
    expect(first?.glossesEn).toEqual(['of building']);
    expect(first?.examples?.[0]).toEqual({
      english: 'a tiled/thatched/flat/sloping roof',
      chinese: '瓦屋顶/茅草屋顶/平屋顶/斜屋顶',
    });
  });

  it('separates usage labels, subject fields, and collocations', async () => {
    const senses = await loadDictionarySenses('huge', shardFetcher());
    const figurative = senses?.senses.find((sense) => sense.registers?.includes('figurative'));

    expect(figurative?.contexts).not.toContain('figurative');
    expect(figurative?.contexts?.length).toBeGreaterThan(0);
  });

  it('keeps runtime sense IDs aligned with the projected bank entry', async () => {
    const gaokao = JSON.parse(
      readFileSync(resolve('public/data/exam-banks/gaokao.json'), 'utf8'),
    ) as Array<{ id: string; senseIds: string[] }>;
    const entry = gaokao.find((candidate) => candidate.id === 'accept');
    const senses = await loadDictionarySenses('accept', shardFetcher());

    expect(senses?.senses.map((sense) => sense.id)).toEqual(entry?.senseIds);
  });

  it('stores every playable word in the shard its ID hashes to', () => {
    const shard = JSON.parse(
      readFileSync(resolve(`public/data/lexicon/senses/v1/${lexiconShardId('roof')}.json`), 'utf8'),
    ) as { words: Record<string, unknown> };

    expect(Object.keys(shard.words)).toContain('roof');
  });
});

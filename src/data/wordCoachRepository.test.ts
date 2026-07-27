import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseWordSenses } from '../domain/wordText';
import { WORD_COACH_PROMPT_VERSION } from '../domain/wordCoach';
import { TEST_WORDS } from '../test/fixtures/words';
import {
  clearWordCoachCache,
  loadStaticWordExplanation,
  wordCoachShardId,
  wordCoachSourceHash,
} from './wordCoachRepository';

const word = TEST_WORDS[0];
const senses = parseWordSenses(word);
const senseExamples = senses.map((_, senseIndex) => ({
    language: 'zh' as const,
    senseIndex,
    sentence: `I remember ${word.word} in context.`,
    translation: `我在语境中记住 ${word.word}。`,
  }));
const explanation = {
  markdown: '### 逐义助记',
  senseExamples,
  senseContent: Object.fromEntries(senses.map((sense, senseIndex) => [sense.id, {
    senseId: sense.id,
    mnemonic: `记住 ${word.word} 的第 ${senseIndex + 1} 个义项。`,
    example: senseExamples[senseIndex].sentence,
    translation: senseExamples[senseIndex].translation,
    usageTip: '结合自然语境使用这个义项。',
  }])),
};
const record = {
  promptVersion: WORD_COACH_PROMPT_VERSION,
  sourceHash: wordCoachSourceHash(word),
  coachMarkdown: explanation.markdown,
  senseExamples,
  senseContent: explanation.senseContent,
};

describe('word coach repository', () => {
  beforeEach(clearWordCoachCache);

  it('loads a valid explanation from the word hash shard', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      records: { [word.id]: record },
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(loadStaticWordExplanation(word, fetcher)).resolves.toMatchObject({
      markdown: expect.stringContaining('### 逐义助记'),
      senseExamples: record.senseExamples,
      senseContent: record.senseContent,
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/data/word-coach/v1/${wordCoachShardId(word.id)}.json`),
    );
  });

  it('returns null when a word has not been generated', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      records: {},
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(loadStaticWordExplanation(word, fetcher)).resolves.toBeNull();
  });

  it('treats a development-server HTML fallback as a missing shard', async () => {
    const fetcher = vi.fn(async () => new Response('<!doctype html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })) as unknown as typeof fetch;

    await expect(loadStaticWordExplanation(word, fetcher)).resolves.toBeNull();
  });

  it('rejects a stale explanation after the dictionary entry changes', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      records: { [word.id]: record },
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(loadStaticWordExplanation({
      ...word,
      definitionZh: `${word.definitionZh}；新增义项`,
    }, fetcher)).resolves.toBeNull();
  });

  it('rejects a record generated with an older prompt contract', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      records: {
        [word.id]: { ...record, promptVersion: 0 },
      },
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(loadStaticWordExplanation(word, fetcher)).resolves.toBeNull();
  });

  it('accepts a deterministically valid audit-first record without semantic review metadata', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      records: {
        [word.id]: record,
      },
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(loadStaticWordExplanation(word, fetcher)).resolves.toMatchObject({
      markdown: expect.stringContaining('### 逐义助记'),
    });
  });
});
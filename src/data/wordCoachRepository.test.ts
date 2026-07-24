import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDefinitionSenses } from '../domain/wordText';
import { WORD_COACH_PROMPT_VERSION, wordCoachContentHash } from '../domain/wordCoach';
import { TEST_WORDS } from '../test/fixtures/words';
import {
  clearWordCoachCache,
  loadStaticWordExplanation,
  wordCoachShardId,
  wordCoachSourceHash,
} from './wordCoachRepository';

const word = TEST_WORDS[0];
const senseExamples = parseDefinitionSenses(word.definitionZh).map((_, senseIndex) => ({
    language: 'zh' as const,
    senseIndex,
    sentence: `I remember ${word.word} in context.`,
    translation: `我在语境中记住 ${word.word}。`,
  }));
const explanation = {
  markdown: [
    '### 记忆钩子',
    '',
    '把 achieve 放进完成目标的画面中记忆。',
    '',
    '### 义项地图',
    '',
    ...parseDefinitionSenses(word.definitionZh).map((sense) => (
      `- **${sense.label} ${sense.text}**: 解释该义项。 **搭配:** achieve a goal`
    )),
    '',
    '### 使用提醒',
    '',
    '- **义项对比**: 根据词性和语境判断。',
    '- **常见混淆**: 不要混淆相近词。',
    '- **注意**: 结合搭配使用。',
  ].join('\n'),
  senseExamples,
};
const record = {
  promptVersion: WORD_COACH_PROMPT_VERSION,
  sourceHash: wordCoachSourceHash(word),
  coachMarkdown: explanation.markdown,
  senseExamples,
  qualityReview: {
    reviewVersion: 1,
    contentHash: wordCoachContentHash(explanation),
    verdict: 'pass' as const,
    issues: [],
    model: 'test-model',
    reviewedAt: '2026-07-24T00:00:00.000Z',
  },
};

describe('word coach repository', () => {
  beforeEach(clearWordCoachCache);

  it('loads a valid explanation from the word hash shard', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      records: { [word.id]: record },
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(loadStaticWordExplanation(word, fetcher)).resolves.toMatchObject({
      markdown: record.coachMarkdown,
      senseExamples: record.senseExamples,
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

  it('accepts a deterministically valid record before optional semantic review', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      records: {
        [word.id]: { ...record, qualityReview: undefined },
      },
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(loadStaticWordExplanation(word, fetcher)).resolves.toMatchObject({
      markdown: record.coachMarkdown,
    });
  });
});
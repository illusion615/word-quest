import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AI_CONFIG,
  explainWord,
  generateChainReading,
  parseChainReading,
  parseWordExplanation,
  requestCompletion,
  resolveCompletionUrl,
} from './aiClient';
import { TEST_WORDS } from '../test/fixtures/words';
import type { ChainBlueprint, WordBankManifest, WordEntry } from '../domain/models';
import { SENTENCE_LEVEL_POLICIES } from '../domain/sentencePolicy';

const GAOKAO_BANK: WordBankManifest = {
  id: 'gaokao',
  name: '高考词汇',
  description: '高中课程与高考大纲词汇范围',
  level: '高中 / 高考',
  count: 3677,
  basis: '测试',
  status: 'syllabus-indexed',
  sourceName: 'ECDICT',
  sourceUrl: 'https://example.com',
  sourceVersion: 'test',
  dataFile: 'gaokao.json',
};

const AI_CONFIG = {
  ...DEFAULT_AI_CONFIG,
  endpoint: 'https://api.example.com/v1',
  apiKey: 'session-secret',
};

const PERFECT_WORD: WordEntry = {
  id: 'perfect',
  word: 'perfect',
  phonetic: "/'pә:fikt/",
  partOfSpeech: 'noun',
  definition: 'v. make perfect or complete；a. complete without defect；s. precisely accurate',
  definitionZh: 'n. 完成时；a. 完美的, 完好的, 理想的；vt. 使完美, 改善',
  banks: ['gaokao'],
};

function entry(word: string, partOfSpeech = 'noun'): WordEntry {
  return { ...TEST_WORDS[0], id: word.toLowerCase(), word, partOfSpeech };
}

function blueprint(): ChainBlueprint {
  return {
    chainIndex: 0,
    seeds: [entry('achieve', 'verb'), entry('benefit', 'noun')],
    pool: [
      entry('achieve', 'verb'),
      entry('benefit', 'noun'),
      entry('goal', 'noun'),
      entry('practice', 'noun'),
      entry('meaning', 'noun'),
      entry('context', 'noun'),
    ],
    rationale: { kind: 'coverage', label: '覆盖混合语境', description: '测试' },
  };
}

const READING = 'A curious learner sets a clear goal and works hard through daily practice to achieve real progress. Each new word gains meaning from its context, and that lasting benefit keeps the learner motivated.';

function aiResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AI client', () => {
  it('adds the chat completions path to a base URL', () => {
    expect(resolveCompletionUrl('https://api.example.com/v1'))
      .toBe('https://api.example.com/v1/chat/completions');
  });

  it('preserves a complete endpoint and its query string', () => {
    const endpoint = 'https://example.openai.azure.com/openai/deployments/demo/chat/completions?api-version=2025-01-01';
    expect(resolveCompletionUrl(endpoint)).toBe(endpoint);
  });

  it('sends a session key using the selected auth header', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: 'OK' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

    await requestCompletion({
      ...DEFAULT_AI_CONFIG,
      endpoint: 'https://api.example.com/v1',
      apiKey: 'session-secret',
      authMode: 'api-key',
    }, [{ role: 'user', content: 'test' }], fetcher);

    const request = vi.mocked(fetcher).mock.calls[0][1];
    expect(request?.headers).toMatchObject({ 'api-key': 'session-secret' });
  });

  it('requests structured coaching and per-sense examples in the selected output language', async () => {
    const explanation = {
      coachMarkdown: '### Memory cue\n\n**Perfect** can describe a result or the act of improving it.',
      senseExamples: [
        { language: 'zh', senseIndex: 0, sentence: 'The present perfect connects a past action to the present.', translation: '現在完了形は過去の動作を現在につなげます。' },
        { language: 'zh', senseIndex: 1, sentence: 'Her pronunciation is nearly perfect.', translation: '彼女の発音はほぼ完璧です。' },
        { language: 'zh', senseIndex: 2, sentence: 'She perfected the design before launch.', translation: '彼女は発売前に設計を完成させました。' },
        { language: 'en', senseIndex: 0, sentence: 'Daily practice perfected his technique.', translation: '毎日の練習が彼の技術を完成させました。' },
        { language: 'en', senseIndex: 1, sentence: 'This is a perfect solution.', translation: 'これは完璧な解決策です。' },
        { language: 'en', senseIndex: 2, sentence: 'The copy is a perfect match.', translation: 'そのコピーは完全に一致しています。' },
      ],
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(explanation) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);

    try {
      const result = await explainWord({
        ...DEFAULT_AI_CONFIG,
        apiKey: 'session-secret',
        outputLanguage: 'Japanese',
      }, PERFECT_WORD);
      const request = fetcher.mock.calls[0][1];
      const body = JSON.parse(String(request?.body));
      const systemPrompt = body.messages[0].content;
      expect(systemPrompt).toContain('GitHub-flavored Markdown');
      expect(systemPrompt).toContain('exactly three level-3');
      expect(systemPrompt).toContain('raw HTML');
      expect(systemPrompt).toContain('explain EVERY supplied Chinese sense');
      expect(systemPrompt).toContain('grammar or technical term');
      expect(systemPrompt).toContain('standard form or pattern');
      expect(systemPrompt).toContain('common mistake or limitation');
      expect(systemPrompt).toContain('changes pronunciation or stress');
      expect(systemPrompt).toContain('exact part of speech');
      expect(systemPrompt).toContain('Respond in Japanese.');
      const userPayload = JSON.parse(body.messages[1].content);
      expect(userPayload.chineseSenses.map((sense: { label: string }) => sense.label))
        .toEqual(['n.', 'a.', 'vt.']);
      expect(body.response_format.json_schema.name).toBe('wordbuddy_word_explanation');
      expect(result.markdown).toContain('Memory cue');
      expect(result.senseExamples).toHaveLength(6);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a word explanation that misses a displayed sense', () => {
    const content = JSON.stringify({
      coachMarkdown: '### 记忆\n\n提示',
      senseExamples: [
        { language: 'zh', senseIndex: 0, sentence: 'She achieved her goal.', translation: '她实现了目标。' },
      ],
    });

    expect(() => parseWordExplanation(content, 2, 1))
      .toThrow('AI 未给出中文第 2 个义项的例句');
  });

  it('ignores additional examples outside the supplied sense indexes', () => {
    const content = JSON.stringify({
      coachMarkdown: '### 记忆\n\n提示',
      senseExamples: [
        { language: 'zh', senseIndex: 0, sentence: 'She achieved her goal.', translation: '她实现了目标。' },
        { language: 'en', senseIndex: 0, sentence: 'Practice helps you achieve more.', translation: '练习帮助你取得更多成果。' },
        { language: 'zh', senseIndex: 99, sentence: 'An extra generic example.', translation: '一条额外的通用例句。' },
      ],
    });

    const result = parseWordExplanation(content, 1, 1);
    expect(result.senseExamples).toHaveLength(2);
    expect(result.senseExamples.some((example) => example.senseIndex === 99)).toBe(false);
  });

  it('generates a natural reading and reports the words it used', async () => {
    const content = JSON.stringify({
      passage: READING,
      translation: '好奇的学习者……',
      usedWords: ['achieve', 'benefit', 'goal', 'practice', 'meaning', 'context'],
      senseHints: [
        { word: 'achieve', meaningZh: '实现' },
        { word: 'benefit', meaningZh: '益处' },
        { word: 'goal', meaningZh: '目标' },
        { word: 'practice', meaningZh: '练习' },
        { word: 'meaning', meaningZh: '意义' },
        { word: 'context', meaningZh: '语境' },
      ],
    });
    const fetcher = vi.fn(async () => aiResponse(content)) as unknown as typeof fetch;

    const reading = await generateChainReading(
      { ...AI_CONFIG, outputLanguage: 'Japanese' },
      blueprint(),
      GAOKAO_BANK,
      fetcher,
    );

    expect(reading.passage.source).toBe('ai');
    expect(reading.passage.levelLabel).toBe('高中 / 高考');
    expect(reading.passage.text).toContain('achieve');
    expect(reading.words.map((word) => word.word))
      .toEqual(expect.arrayContaining(['achieve', 'benefit', 'goal']));

    const body = JSON.parse(String(vi.mocked(fetcher).mock.calls[0][1]?.body));
    const systemPrompt = body.messages[0].content;
    expect(systemPrompt).toContain('reading-comprehension author');
    expect(systemPrompt).toContain('mustInclude');
    expect(systemPrompt).toContain('Translate the whole passage naturally into Japanese.');
    expect(body.response_format.json_schema.name).toBe('wordbuddy_chain_reading');
    expect(body.max_tokens).toBe(900);
    const payload = JSON.parse(body.messages[1].content);
    expect(payload.mustInclude.map((item: { word: string }) => item.word)).toEqual(['achieve', 'benefit']);
    expect(payload.mayInclude.map((item: { word: string }) => item.word)).toContain('goal');
  });

  it('counts every present word when the model omits its usedWords list', () => {
    const content = JSON.stringify({
      passage: READING,
      translation: '测试。',
      usedWords: [],
      senseHints: [
        { word: 'achieve', meaningZh: '实现' },
        { word: 'benefit', meaningZh: '益处' },
        { word: 'goal', meaningZh: '目标' },
        { word: 'practice', meaningZh: '练习' },
        { word: 'meaning', meaningZh: '意义' },
        { word: 'context', meaningZh: '语境' },
      ],
    });
    const reading = parseChainReading(content, blueprint(), SENTENCE_LEVEL_POLICIES.gaokao);
    expect(reading.words.map((word) => word.word)).toEqual(
      expect.arrayContaining(['achieve', 'benefit', 'goal', 'practice', 'meaning', 'context']),
    );
  });

  it('keeps contextual Chinese meanings aligned with the generated usage', () => {
    const content = JSON.stringify({
      passage: 'Even the shyest students can find a place where they belong when the class feels safe.',
      translation: '当课堂有安全感时，连最害羞的学生也能找到归属。',
      usedWords: ['even'],
      senseHints: [{ word: 'even', meaningZh: '甚至；连' }],
    });
    const reading = parseChainReading(content, {
      chainIndex: 1,
      seeds: [entry('even', 'adv')],
      pool: [entry('even', 'adv'), entry('shy', 'adj'), entry('belong', 'vi')],
      rationale: { kind: 'coverage', label: '测试', description: '测试' },
    }, SENTENCE_LEVEL_POLICIES.gaokao);

    expect(reading.words.map((word) => word.word)).toContain('even');
    const evenWord = reading.words.find((word) => word.word === 'even');
    expect(evenWord).toBeDefined();
    expect(reading.passage.contextualMeanings?.[evenWord!.id]).toBe('甚至；连');
  });

  it('keeps present seed words even when the model under-reports them', () => {
    const content = JSON.stringify({
      passage: READING,
      translation: '测试。',
      usedWords: ['goal', 'practice', 'meaning'],
      senseHints: [
        { word: 'achieve', meaningZh: '实现' },
        { word: 'benefit', meaningZh: '益处' },
        { word: 'goal', meaningZh: '目标' },
        { word: 'practice', meaningZh: '练习' },
        { word: 'meaning', meaningZh: '意义' },
      ],
    });
    const reading = parseChainReading(content, blueprint(), SENTENCE_LEVEL_POLICIES.gaokao);
    const words = reading.words.map((word) => word.word);
    expect(words).toContain('achieve');
    expect(words).toContain('benefit');
    expect(words).toContain('goal');
  });

  it('rejects a reading that omits a mandatory seed word', () => {
    const passage = 'A curious learner sets a clear goal and enjoys daily practice with real meaning in every context.';
    const content = JSON.stringify({
      passage,
      translation: '测试。',
      usedWords: ['goal', 'practice'],
      senseHints: [
        { word: 'goal', meaningZh: '目标' },
        { word: 'practice', meaningZh: '练习' },
      ],
    });
    expect(() => parseChainReading(content, blueprint(), SENTENCE_LEVEL_POLICIES.gaokao))
      .toThrow('achieve');
  });

  it('repairs one invalid reading before returning', async () => {
    const invalid = JSON.stringify({
      passage: 'A short note about a goal and some practice only.',
      translation: '无效。',
      usedWords: ['goal'],
      senseHints: [{ word: 'goal', meaningZh: '目标' }],
    });
    const repaired = JSON.stringify({
      passage: READING,
      translation: '测试。',
      usedWords: ['achieve', 'benefit', 'goal', 'practice', 'meaning', 'context'],
      senseHints: [
        { word: 'achieve', meaningZh: '实现' },
        { word: 'benefit', meaningZh: '益处' },
        { word: 'goal', meaningZh: '目标' },
        { word: 'practice', meaningZh: '练习' },
        { word: 'meaning', meaningZh: '意义' },
        { word: 'context', meaningZh: '语境' },
      ],
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(aiResponse(invalid))
      .mockResolvedValueOnce(aiResponse(repaired)) as unknown as typeof fetch;

    const reading = await generateChainReading(AI_CONFIG, blueprint(), GAOKAO_BANK, fetcher);

    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(2);
    expect(reading.passage.text).toContain('achieve');
  });

  it('throws after a failed repair so the caller can fall back offline', async () => {
    const bad = JSON.stringify({
      passage: 'A short note about a goal and some practice only.',
      translation: '无效。',
      usedWords: ['goal'],
      senseHints: [{ word: 'goal', meaningZh: '目标' }],
    });
    const fetcher = vi.fn(async () => aiResponse(bad)) as unknown as typeof fetch;

    await expect(generateChainReading(AI_CONFIG, blueprint(), GAOKAO_BANK, fetcher)).rejects.toThrow();
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(2);
  });
});
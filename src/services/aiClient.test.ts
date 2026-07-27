import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AI_CONFIG,
  explainWord,
  generateChainReading,
  PartialWordExplanationError,
  parseChainReading,
  parseWordExplanation,
  requestCompletion,
  resolveCompletionUrl,
  sentenceUsesTargetWord,
  wordExplanationMaxTokens,
} from './aiClient';
import { TEST_WORDS } from '../test/fixtures/words';
import type { ChainBlueprint, WordBankManifest, WordEntry } from '../domain/models';
import { SENTENCE_LEVEL_POLICIES } from '../domain/sentencePolicy';
import { parseDefinitionSenses } from '../domain/wordText';

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

function structuredExplanation(senseCount: number, targetWord = 'perfect') {
  return {
    senses: Array.from({ length: senseCount }, (_, senseIndex) => ({
      senseId: `${targetWord.toLowerCase()}:s${senseIndex}`,
      mnemonic: `この語義 ${senseIndex + 1} を明確な場面で覚えます。`,
      englishSentence: `This example uses ${targetWord} in sense ${senseIndex + 1}.`,
      localizedTranslation: `これは語義 ${senseIndex + 1} の例です。`,
      usageTip: `語義 ${senseIndex + 1} の自然な使い方を確認します。`,
    })),
  };
}

describe('AI client', () => {
  it('reserves output space for senses plus the examples it still has to write', () => {
    expect(wordExplanationMaxTokens(4)).toBe(2260);
    expect(wordExplanationMaxTokens(0, 4)).toBe(1620);
    expect(wordExplanationMaxTokens(16)).toBe(6000);
    expect(wordExplanationMaxTokens(100)).toBe(6000);
  });
  it('accepts common inflections but not unrelated prefix words', () => {
    expect(sentenceUsesTargetWord('She cleared the table.', 'clear', 'v.')).toBe(true);
    expect(sentenceUsesTargetWord('The snakes moved quietly.', 'snake', 'n.')).toBe(true);
    expect(sentenceUsesTargetWord('The runner is running.', 'run', 'v.')).toBe(true);
    expect(sentenceUsesTargetWord('They lost the final match.', 'lose', 'v.')).toBe(true);
    expect(sentenceUsesTargetWord('The letter was hidden inside the drawer.', 'hide', 'v.')).toBe(true);
    expect(sentenceUsesTargetWord('She is ready.', 'be', 'v.')).toBe(true);
    expect(sentenceUsesTargetWord('They were ready.', 'be', 'v.')).toBe(true);
    expect(sentenceUsesTargetWord('Candy is sweet.', 'can')).toBe(false);
    expect(sentenceUsesTargetWord('This sentence omits it.', 'clear')).toBe(false);
  });
  it('does not accept an inflection from the wrong part of speech', () => {
    expect(sentenceUsesTargetWord('The analyses were complete.', 'analysis', 'n.')).toBe(true);
    expect(sentenceUsesTargetWord('The analyses were complete.', 'analysis', 'v.')).toBe(false);
    expect(sentenceUsesTargetWord('The clearer explanation helped.', 'clear', 'a.')).toBe(true);
    expect(sentenceUsesTargetWord('The clearer explanation helped.', 'clear', 'v.')).toBe(false);
  });
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
    const explanation = structuredExplanation(3);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(explanation) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);

    try {
      const result = await explainWord({
        ...DEFAULT_AI_CONFIG,
        apiKey: 'session-secret',
        outputLanguage: 'Japanese',
      }, PERFECT_WORD, {
        lexicalSenses: [{
          id: 'perfect:s1',
          glossesEn: ['without defects'],
          labels: { register: ['formal'] },
          contexts: ['result'],
          patterns: ['perfect for sth'],
          examples: [{ english: 'The result is perfect.', chinese: '结果很完美。' }],
        }],
      });
      const request = fetcher.mock.calls[0][1];
      const body = JSON.parse(String(request?.body));
      const systemPrompt = body.messages[0].content;
      expect(systemPrompt).toContain('unmistakable productive affix visibly attached');
      expect(systemPrompt).toContain('copy the supplied stable ID exactly');
      expect(systemPrompt).toContain('exactly one object for every supplied senseId');
      expect(systemPrompt).toContain('mnemonic');
      expect(systemPrompt).toContain('usageTip');
      expect(systemPrompt).toContain('dangling lead-in');
      expect(systemPrompt).toContain('never invent roots, etymology, pronunciation claims');
      expect(systemPrompt).toContain('plain text without Markdown or HTML');
      expect(systemPrompt).toContain('grammar or technical term');
      expect(systemPrompt).toContain('standard form or pattern');
      expect(systemPrompt).toContain('common mistake or limitation');
      expect(systemPrompt).toContain('verb complementation, transitivity, articles');
      expect(systemPrompt).toContain('enjoys birding');
      expect(systemPrompt).toContain('Oxford-derived Chinese sense');
      expect(systemPrompt).toContain('sourceReference');
      expect(systemPrompt).toContain('already has an authoritative Oxford example');
      expect(systemPrompt).toContain('sensesNeedingExample');
      expect(systemPrompt).toContain('Respond in Japanese.');
      const userPayload = JSON.parse(body.messages[1].content);
      expect(userPayload.chineseSenses.map((sense: { label: string }) => sense.label))
        .toEqual(['n.', 'a.', 'vt.']);
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(userPayload.requiredSenseCount).toBe(3);
      expect(userPayload.requiredSenseIds).toEqual(['perfect:s0', 'perfect:s1', 'perfect:s2']);
      expect(userPayload.sensesNeedingExample).toEqual(['perfect:s0', 'perfect:s2']);
      expect(userPayload.chineseSenses[1].dictionaryExample)
        .toEqual({ english: 'The result is perfect.', chinese: '结果很完美。' });
      expect(userPayload.chineseSenses[0].dictionaryExample).toBeUndefined();
      expect(userPayload.chineseSenses[1].glossChecklist).toEqual(['完美的', '完好的', '理想的']);
      expect(userPayload.chineseSenses[1].sourceReference).toMatchObject({
        glossesEn: ['without defects'],
        labels: { register: ['formal'] },
        examples: [{ english: 'The result is perfect.', chinese: '结果很完美。' }],
      });
      expect(result.markdown).toContain('### 逐义助记');
      expect(result.markdown.match(/^- \*\*/gm)).toHaveLength(3);
      expect(result.senseExamples).toHaveLength(3);
      expect(Object.keys(result.senseContent ?? {})).toEqual(['perfect:s0', 'perfect:s1', 'perfect:s2']);
      expect(result.senseContent?.['perfect:s1']).toMatchObject({
        example: 'The result is perfect.',
        translation: '结果很完美。',
        exampleSource: 'dictionary',
      });
      expect(result.senseContent?.['perfect:s0'].exampleSource).toBe('ai');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a word explanation that misses a displayed sense', () => {
    const explanation = structuredExplanation(2);
    explanation.senses[1].englishSentence = '';

    expect(() => parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('v. 实现；n. 成就'),
      'perfect',
    ))
      .toThrow('缺少 perfect:s1 例句');
  });

  it('preserves valid sense content when another sense needs repair', () => {
    const explanation = structuredExplanation(2);
    explanation.senses[1].englishSentence = '';

    try {
      parseWordExplanation(
        JSON.stringify(explanation),
        parseDefinitionSenses('v. 实现；n. 成就'),
        'perfect',
      );
      throw new Error('Expected partial explanation validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(PartialWordExplanationError);
      const partial = error as PartialWordExplanationError;
      expect(Object.keys(partial.partialSenseContent)).toEqual(['perfect:s0']);
      expect(partial.failedSenseIds).toEqual(['perfect:s1']);
    }
  });

  it('rejects additional sense objects outside the supplied indexes', () => {
    const explanation = structuredExplanation(1);
    explanation.senses.push({
      senseId: 'perfect:s1',
      mnemonic: '追加の意味です。',
      englishSentence: 'An extra generic example.',
      localizedTranslation: '一条额外的通用例句。',
      usageTip: '追加の使い方です。',
    });

    expect(() => parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('v. 实现'),
      'perfect',
    )).toThrow('义项讲解数量不正确');
  });

  it('rejects a mismatched number of structured sense notes', () => {
    const explanation = structuredExplanation(2);
    explanation.senses.pop();
    expect(() => parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('v. 实现；n. 成就'),
      'perfect',
    )).toThrow('义项讲解数量不正确');
  });

  it('rejects raw HTML in a structured coach field', () => {
    const explanation = structuredExplanation(1);
    explanation.senses[0].mnemonic = '<p>不支持</p>';
    expect(() => parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('v. 实现'),
      'perfect',
    )).toThrow('必须是纯文本');
  });

  it('rejects a translated sentence placed in the English example field', () => {
    const explanation = structuredExplanation(1);
    explanation.senses[0].englishSentence = '这个句子使用了 perfect。';
    expect(() => parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('a. 完美的'),
      'perfect',
    )).toThrow('AI 为中文第 1 个义项返回的不是英文例句');
  });

  it('rejects an example that omits the target spelling', () => {
    const explanation = structuredExplanation(1);
    explanation.senses[0].englishSentence = 'This result has no defects at all.';
    expect(() => parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('a. 完美的'),
      'perfect',
    )).toThrow('AI 为中文第 1 个义项的例句未使用目标词');
  });

  it('keeps a dictionary example verbatim instead of asking the model for one', () => {
    const explanation = structuredExplanation(1);
    explanation.senses[0].englishSentence = 'A model sentence that should be ignored.';
    explanation.senses[0].localizedTranslation = '应被忽略的译文。';
    const [sense] = parseDefinitionSenses('a. 完美的');
    const result = parseWordExplanation(
      JSON.stringify(explanation),
      [{ ...sense, id: 'perfect:s0', dictionaryExample: { english: 'in perfect condition', chinese: '状况完好' } }],
      'perfect',
    );
    expect(result.senseContent?.['perfect:s0']).toMatchObject({
      example: 'in perfect condition',
      translation: '状况完好',
      exampleSource: 'dictionary',
    });
    expect(result.senseExamples[0].sentence).toBe('in perfect condition');
  });

  it('assembles a deterministic display view from per-sense content', () => {
    const explanation = structuredExplanation(1);
    const markdown = parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('a. 完美的'),
      'perfect',
    ).markdown;
    expect(markdown).toContain('### 逐义助记');
    expect(markdown).toContain('**a. 完美的**');
    expect(markdown.match(/^- \*\*/gm)).toHaveLength(1);
  });

  it('replaces a misspelled letter-by-letter mnemonic with a safe scene hook', () => {
    const explanation = structuredExplanation(1, 'bird');
    explanation.senses[0].mnemonic = '把 bird 记成 B-E-D。';

    expect(parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('n. 鸟'),
      'bird',
    ).markdown).toContain('把 “bird” 和「鸟」放进一个清晰、具体的场景中记忆。');
  });

  it('rejects content attached to the wrong stable sense ID', () => {
    const explanation = structuredExplanation(1, 'bird');
    explanation.senses[0].senseId = 'bird:s9';

    expect(() => parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('n. 鸟'),
      'bird',
    )).toThrow('错误的 senseId');
  });

  it('replaces pronunciation advice with a safe scene hook', () => {
    const explanation = structuredExplanation(1, 'the');
    explanation.senses[0].mnemonic = 'the 在元音前读 /ðiː/。';

    expect(parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('art. 那'),
      'the',
    ).markdown).toContain('把 “the” 和「那」放进一个清晰、具体的场景中记忆。');
  });

  it('replaces invented morphology for an opaque word with a safe scene hook', () => {
    const explanation = structuredExplanation(1, 'rigid');
    explanation.senses[0].mnemonic = '词根 rig- 表示坚硬。';

    expect(parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('a. 坚硬的'),
      'rigid',
    ).markdown).toContain('把 “rigid” 和「坚硬的」放进一个清晰、具体的场景中记忆。');
  });

  it('rejects a usage note ending with a dangling example lead-in', () => {
    const explanation = structuredExplanation(1);
    explanation.senses[0].usageTip = '学习者经常错误地说：';

    expect(() => parseWordExplanation(
      JSON.stringify(explanation),
      parseDefinitionSenses('a. 完美的'),
      'perfect',
    )).toThrow('以未完成的举例引导语结束');
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
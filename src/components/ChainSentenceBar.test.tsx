import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdaptiveStudyItem, ChainPassage, WordEntry } from '../domain/models';
import { TEST_WORDS } from '../test/fixtures/words';
import { ChainSentenceBar } from './ChainSentenceBar';

const CONTEXT_WORD: WordEntry = {
  ...TEST_WORDS[0],
  id: 'context',
  word: 'context',
};

describe('ChainSentenceBar', () => {
  it('keeps one passage and highlights only the current target word', () => {
    const passage: ChainPassage = {
      text: 'A curious learner can achieve a goal. The word brings benefit in context.',
      translation: '好奇的学习者能达成目标。单词在语境中带来益处。',
      source: 'ai',
      levelLabel: '高中 / 高考',
      grammarPatterns: ['simple', 'simple'],
    };
    const items: AdaptiveStudyItem[] = [...TEST_WORDS, CONTEXT_WORD].map((word, chainPosition) => ({
      word,
      mode: 'choice',
      stage: 'new',
      chainIndex: 0,
      chainPosition,
      chainRationale: { kind: 'coverage', label: '覆盖混合句', description: '测试' },
      chainPassage: passage,
    }));

    const html = renderToStaticMarkup(
      <ChainSentenceBar
        items={items}
        currentWordId="benefit"
        revealedWordIds={new Set(items.map((item) => item.word.id))}
      />,
    );

    expect(html).toContain('AI 阅读理解');
    expect(html).toContain('高中 / 高考词汇与语法');
    expect(html).toContain('<mark aria-current="true">benefit</mark>');
    expect(html).toContain('class="chain-target-word">achieve</span>');
    expect(html).not.toContain('<mark aria-current="true">achieve</mark>');
  });

  it('does not highlight a one-letter target inside another word', () => {
    const words: WordEntry[] = [
      { ...TEST_WORDS[0], id: 'a', word: 'a' },
      { ...TEST_WORDS[0], id: 'have', word: 'have' },
      { ...TEST_WORDS[0], id: 'plan', word: 'plan' },
      { ...TEST_WORDS[0], id: 'today', word: 'today' },
    ];
    const items: AdaptiveStudyItem[] = words.map((word, chainPosition) => ({
      word,
      mode: 'choice',
      stage: 'new',
      chainIndex: 0,
      chainPosition,
      chainRationale: { kind: 'coverage', label: '覆盖混合句', description: '测试' },
      chainPassage: {
        text: 'We have a plan. A practical step will help today.',
        translation: '我们有一个计划。今天一个实际步骤会有所帮助。',
        source: 'ai',
        grammarPatterns: ['simple', 'simple'],
      },
    }));

    const html = renderToStaticMarkup(
      <ChainSentenceBar
        items={items}
        currentWordId="a"
        revealedWordIds={new Set(items.map((item) => item.word.id))}
      />,
    );
    expect(html).toContain('<mark aria-current="true">a</mark>');
    expect(html).not.toContain('<mark aria-current="true">a</mark>ve');
    expect(html.match(/<mark aria-current="true">/g)).toHaveLength(1);
  });

  it('highlights an inflected form of the current target word', () => {
    const words: WordEntry[] = [
      { ...TEST_WORDS[0], id: 'include', word: 'include' },
      { ...TEST_WORDS[0], id: 'benefit', word: 'benefit' },
      { ...TEST_WORDS[0], id: 'plan', word: 'plan' },
      { ...TEST_WORDS[0], id: 'result', word: 'result' },
    ];
    const passage: ChainPassage = {
      text: 'The plan includes new steps. The result brings a clear benefit.',
      translation: '测试。',
      source: 'ai',
      grammarPatterns: ['simple', 'simple'],
    };
    const items: AdaptiveStudyItem[] = words.map((word, chainPosition) => ({
      word,
      mode: 'choice',
      stage: 'new',
      chainIndex: 0,
      chainPosition,
      chainRationale: { kind: 'coverage', label: '覆盖混合语境', description: '测试' },
      chainPassage: passage,
    }));

    const html = renderToStaticMarkup(
      <ChainSentenceBar
        items={items}
        currentWordId="include"
        revealedWordIds={new Set(items.map((item) => item.word.id))}
      />,
    );
    expect(html).toContain('<mark aria-current="true">includes</mark>');
    expect(html.match(/<mark aria-current="true">/g)).toHaveLength(1);
  });

  it('reveals completed words while hiding current and future targets throughout assessment', () => {
    const passage: ChainPassage = {
      text: 'A curious learner can achieve a goal. The word brings benefit in context.',
      translation: '好奇的学习者能达成目标。单词在语境中带来益处。',
      source: 'ai',
      levelLabel: '高中 / 高考',
      grammarPatterns: ['simple', 'simple'],
    };
    const items: AdaptiveStudyItem[] = [...TEST_WORDS, CONTEXT_WORD].map((word, chainPosition) => ({
      word,
      mode: 'boss',
      stage: 'recall',
      chainIndex: 0,
      chainPosition,
      chainRationale: { kind: 'coverage', label: '覆盖混合句', description: '测试' },
      chainPassage: passage,
    }));

    const html = renderToStaticMarkup(
      <ChainSentenceBar
        items={items}
        currentWordId="benefit"
        revealedWordIds={new Set(['achieve'])}
      />,
    );

    expect(html).toContain('chain-sentence-hidden');
    expect(html).toContain('3 个待考词已隐藏');
    expect(html).toContain('class="chain-target-word">achieve</span>');
    expect(html).not.toContain('<mark aria-current="true">benefit</mark>');
    expect(html).not.toContain('>benefit<');
    expect(html).not.toContain(passage.translation);
    expect(html).toContain('完成本组考核后解锁译文');
  });

  it('removes instructional metadata in compact preview mode', () => {
    const passage: ChainPassage = {
      text: 'A curious learner can achieve a goal.',
      translation: '好奇的学习者能达成目标。',
      source: 'ai',
    };
    const items: AdaptiveStudyItem[] = TEST_WORDS.slice(0, 2).map((word, chainPosition) => ({
      word,
      mode: 'choice',
      stage: 'new',
      chainIndex: 0,
      chainPosition,
      chainRationale: { kind: 'coverage', label: '测试', description: '测试' },
      chainPassage: passage,
    }));

    const html = renderToStaticMarkup(
      <ChainSentenceBar
        items={items}
        currentWordId={items[0].word.id}
        revealedWordIds={new Set()}
        compact
      />,
    );

    expect(html).toContain('阅读战场');
    expect(html).not.toContain('个待考词已隐藏');
    expect(html).not.toContain('完成本组考核后解锁译文');
  });
});
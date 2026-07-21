import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import type { AdaptiveStudyItem } from '../domain/models';
import { MemoryChainPreview } from './MemoryChainPreview';

describe('MemoryChainPreview', () => {
  it('shows why the words were placed in the same group', () => {
    const items: AdaptiveStudyItem[] = TEST_WORDS.map((word, chainPosition) => ({
      word,
      mode: 'choice',
      stage: 'new',
      chainIndex: 0,
      chainPosition,
      chainRationale: {
        kind: 'coverage',
        label: '覆盖混合句',
        description: '本组混合不同学习阶段。',
      },
      chainPassage: {
        text: 'A test sentence.',
        translation: '测试句子。',
        source: 'offline',
      },
    }));

    const html = renderToStaticMarkup(
      <MemoryChainPreview
        items={items}
        assessmentWordIds={new Set()}
        isSpeechSupported
        onStart={() => undefined}
        onSpeak={() => undefined}
        onToggleAssessment={() => undefined}
      />,
    );

    expect(html).toContain('本组单词卡牌');
    expect(html).toContain('开始挑战');
    expect(html).not.toContain('选词依据');
    expect(html).not.toContain('本组混合不同学习阶段');
  });

  it('prefers contextual meanings from the generated passage', () => {
    const first = TEST_WORDS[0];
    const items: AdaptiveStudyItem[] = [{
      word: first,
      mode: 'choice',
      stage: 'new',
      chainIndex: 0,
      chainPosition: 0,
      chainRationale: {
        kind: 'coverage',
        label: '语境一致',
        description: '测试语境释义优先显示。',
      },
      chainPassage: {
        text: 'Even the shyest students can find a place where they belong.',
        translation: '连最害羞的学生也能找到归属。',
        source: 'ai',
        contextualMeanings: { [first.id]: '甚至；连' },
      },
    }];

    const html = renderToStaticMarkup(
      <MemoryChainPreview
        items={items}
        assessmentWordIds={new Set()}
        isSpeechSupported
        onStart={() => undefined}
        onSpeak={() => undefined}
        onToggleAssessment={() => undefined}
      />,
    );

    expect(html).toContain('甚至；连');
  });

  it('exposes pronunciation and mastery shortcuts on each card', () => {
    const first = TEST_WORDS[0];
    const items: AdaptiveStudyItem[] = [{
      word: first,
      mode: 'choice',
      stage: 'new',
      chainIndex: 0,
      chainPosition: 0,
      chainRationale: {
        kind: 'coverage',
        label: '语境一致',
        description: '测试卡片快捷方式。',
      },
      chainPassage: {
        text: 'A test sentence.',
        translation: '测试句子。',
        source: 'ai',
      },
    }];

    const html = renderToStaticMarkup(
      <MemoryChainPreview
        items={items}
        assessmentWordIds={new Set([first.id])}
        isSpeechSupported
        onStart={() => undefined}
        onSpeak={() => undefined}
        onToggleAssessment={() => undefined}
      />,
    );

    expect(html).toContain('memory-card-grid');
    expect(html).toContain(`播放 ${first.word} 的发音`);
    expect(html).toContain('直接考核');
    expect(html).toContain('is-assessment');
    expect(html).not.toContain('点击查看释义');
  });
});
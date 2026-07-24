import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WordEntry } from '../domain/models';
import { TEST_WORDS } from '../test/fixtures/words';
import {
  AiCoachSenseExamples,
  GroupedCoachContent,
  InlineQuestionReview,
} from './InlineQuestionReview';

const perfect: WordEntry = {
  id: 'perfect',
  word: 'perfect',
  phonetic: "/'pә:fikt/",
  partOfSpeech: 'noun',
  definition: 'v. make perfect or complete；a. being complete without defect',
  definitionZh: 'n. 完成时；a. 完美的, 完好的, 理想的；vt. 使完美, 改善',
  banks: ['gaokao'],
};

describe('InlineQuestionReview', () => {
  it('keeps review controls and expandable learning feedback in one flow', () => {
    const html = renderToStaticMarkup(
      <InlineQuestionReview
        word={TEST_WORDS[0]}
        isLastQuestion={false}
        autoAdvancePercent={75}
        autoAdvanceEnabled
        onCoachOpenChange={() => undefined}
        onNext={() => undefined}
        aiConfigured={false}
        coachInsight={null}
        onOpenCoach={() => undefined}
        onRegenerateCoach={() => undefined}
        relatedBankNames={['高考词汇']}
        wordMastered={false}
        wordProgress={{ attempts: 3, correct: 2, mastery: 67 }}
        speechSupported
        speechSpeaking={false}
        onSpeak={() => undefined}
      />,
    );

    expect(html).not.toContain('回答正确');
    expect(html).not.toContain('这次没想起来');
    expect(html).toContain('下一题');
    expect(html).not.toContain('>AI 词汇教练<');
    expect(html).toContain(`aria-label="查看 ${TEST_WORDS[0].word} 词汇详情"`);
    expect(html).toContain('word-detail-toggle');
    expect(html).toContain(`aria-controls="word-coach-panel-${TEST_WORDS[0].id}"`);
    expect(html).not.toContain('inline-ai-coach');
    expect(html).toContain('inline-review-toolbar');
    expect(html).toContain('inline-review-word-title');
    expect(html).toContain('inline-review-pronunciation');
    expect(html).toContain('inline-review-next-progress is-enabled');
    expect(html).toContain('--auto-advance-progress:75%');
    expect(html).not.toContain('inline-auto-toggle');
    expect(html).toContain(TEST_WORDS[0].word);
    expect(html).toContain('播放单词发音');
    expect(html).toContain('高考词汇');
    expect(html).not.toContain('<dt>状态</dt>');
    expect(html).toContain('<dt>练习</dt><dd>3</dd>');
    expect(html).toContain('<dt>答对</dt><dd>2</dd>');
    expect(html).toContain('<dt>正确率</dt><dd>67%</dd>');
    expect(html.indexOf('inline-review-word-title')).toBeLessThan(html.indexOf('inline-review-pronunciation'));
    expect(html.indexOf('inline-review-pronunciation')).toBeLessThan(html.indexOf('inline-review-banks'));
    expect(html.indexOf('inline-review-banks')).toBeLessThan(html.indexOf('inline-review-kpis'));
    expect(html).not.toContain('查看该义项例句');
    expect(html).not.toContain('连接 AI 后生成此义项的用法例句');
  });

  it('renders an example and translation for every displayed sense in the coach', () => {
    const html = renderToStaticMarkup(
      <AiCoachSenseExamples
        word={perfect}
        examples={[
          {
            language: 'zh',
            senseIndex: 0,
            sentence: 'The present perfect connects a past action to the present.',
            translation: '现在完成时把过去的动作与现在联系起来。',
          },
          {
            language: 'zh',
            senseIndex: 1,
            sentence: 'Her pronunciation is nearly perfect.',
            translation: '她的发音近乎完美。',
          },
          {
            language: 'zh',
            senseIndex: 2,
            sentence: 'She perfected the design before launch.',
            translation: '她在发布前完善了设计。',
          },
        ]}
      />,
    );

    expect(html).toContain('逐义例句');
    expect(html).toContain('<span class="sense-label">n.</span>');
    expect(html).toContain('<span class="sense-label">a.</span>');
    expect(html).toContain('<span class="sense-label">vt.</span>');
    expect(html).toContain('The present perfect connects a past action to the present.');
    expect(html).toContain('现在完成时把过去的动作与现在联系起来。');
    expect(html).toContain('Her pronunciation is nearly perfect.');
    expect(html).toContain('She perfected the design before launch.');
  });

  it('renders each sense explanation, pattern, and example together', () => {
    const markdown = [
      '### 记忆钩子',
      '',
      '想象结果已经打磨得没有缺口。',
      '',
      '### 义项地图',
      '',
      '- **n. 完成时**: 语法中的完成时。 **搭配:** present perfect',
      '- **a. 完美的**: 没有缺陷。 **搭配:** a perfect result',
      '- **vt. 使完美**: 把事物改善到最佳状态。 **搭配:** perfect the design',
      '',
      '### 通用提醒',
      '',
      '- **义项对比**: 根据词性判断。',
      '- **常见混淆**: 不要混淆形容词和动词。',
      '- **注意**: 动词重音可能不同。',
    ].join('\n');
    const html = renderToStaticMarkup(
      <GroupedCoachContent
        word={perfect}
        markdown={markdown}
        examples={[{
          language: 'zh',
          senseIndex: 1,
          sentence: 'Her pronunciation is nearly perfect.',
          translation: '她的发音近乎完美。',
        }]}
      />,
    );

    const adjectiveStart = html.indexOf('a.');
    const exampleStart = html.indexOf('Her pronunciation is nearly perfect.');
    const guidanceStart = html.indexOf('通用提醒');
    expect(html).toContain('word-coach-sense-stack');
    expect(html).toContain('word-coach-pattern');
    expect(adjectiveStart).toBeGreaterThanOrEqual(0);
    expect(guidanceStart).toBeGreaterThanOrEqual(0);
    expect(guidanceStart).toBeLessThan(adjectiveStart);
    expect(exampleStart).toBeGreaterThan(adjectiveStart);
    expect(html.indexOf('记忆钩子')).toBeGreaterThan(exampleStart);
  });
});
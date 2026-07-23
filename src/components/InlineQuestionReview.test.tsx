import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WordEntry } from '../domain/models';
import { TEST_WORDS } from '../test/fixtures/words';
import { AiCoachSenseExamples, InlineQuestionReview } from './InlineQuestionReview';

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
        autoAdvancePaused={false}
        onToggleAutoAdvance={() => undefined}
        onNext={() => undefined}
        aiConfigured={false}
        aiInsight={null}
        onAskAi={() => undefined}
        relatedBankNames={['高考词汇']}
        wordMastered={false}
      />,
    );

    expect(html).not.toContain('回答正确');
    expect(html).not.toContain('这次没想起来');
    expect(html).toContain('暂停自动计时');
    expect(html).toContain('下一题');
    expect(html).toContain('AI 词汇教练');
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
});
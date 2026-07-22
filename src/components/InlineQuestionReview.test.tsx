import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import { InlineQuestionReview } from './InlineQuestionReview';

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

  it('no longer renders the inline sense card or per-sense examples', () => {
    const html = renderToStaticMarkup(
      <InlineQuestionReview
        word={TEST_WORDS[0]}
        isLastQuestion={false}
        autoAdvancePercent={75}
        autoAdvancePaused
        onToggleAutoAdvance={() => undefined}
        onNext={() => undefined}
        aiConfigured
        aiInsight={{
          wordId: TEST_WORDS[0].id,
          status: 'success',
          text: '### 记忆钩子\n测试',
          senseExamples: [{
            language: 'zh',
            senseIndex: 0,
            sentence: 'She achieved her goal.',
            translation: '她实现了目标。',
          }],
        }}
        onAskAi={() => undefined}
        relatedBankNames={['高考词汇']}
        wordMastered={false}
      />,
    );

    expect(html).not.toContain('inline-sense-review');
    expect(html).not.toContain('查看该义项例句');
    expect(html).not.toContain('She achieved her goal.');
  });
});
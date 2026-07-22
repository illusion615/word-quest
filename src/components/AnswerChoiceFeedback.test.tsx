import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnswerChoiceFeedback } from './AnswerChoiceFeedback';

describe('AnswerChoiceFeedback', () => {
  it('renders every verdict on its own line', () => {
    const html = renderToStaticMarkup(
      <AnswerChoiceFeedback choices={[
        { text: '正确且已选择', status: 'correct' },
        { text: '错误但已选择', status: 'incorrect' },
        { text: '正确但未选择', status: 'missed' },
      ]} />,
    );

    expect(html).toContain('选对');
    expect(html).toContain('选错');
    expect(html).toContain('漏选');
    expect((html.match(/<li/g) ?? [])).toHaveLength(3);
  });
});
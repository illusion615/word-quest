import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReviewableChoice } from './ReviewableChoice';

function renderChoice(correct: boolean): string {
  return renderToStaticMarkup(
    <ReviewableChoice
      index={0}
      text={correct ? '正确释义' : '错误释义'}
      correct={correct}
      selected={false}
      reviewState={correct ? 'correct-answer' : null}
      reviewed
      inspecting={false}
      onClick={() => undefined}
      detail={<p>释义详情</p>}
    />,
  );
}

describe('ReviewableChoice', () => {
  it('keeps reviewed wrong answers disabled', () => {
    const html = renderChoice(false);

    expect(html).toContain('disabled=""');
    expect(html).not.toContain('aria-expanded');
  });

  it('lets only reviewed correct answers expose a detail card', () => {
    const html = renderChoice(true);

    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-expanded="false"');
  });
});

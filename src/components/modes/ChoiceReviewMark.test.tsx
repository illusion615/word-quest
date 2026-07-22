import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChoiceReviewMark, resolveChoiceReviewState } from './ChoiceReviewMark';

describe('choice review state', () => {
  it('distinguishes selected correct, selected wrong, and missed correct options', () => {
    expect(resolveChoiceReviewState(true, true, true)).toBe('selected-correct');
    expect(resolveChoiceReviewState(false, true, true)).toBe('selected-wrong');
    expect(resolveChoiceReviewState(true, false, true)).toBe('correct-answer');
    expect(resolveChoiceReviewState(false, false, true)).toBeNull();
    expect(resolveChoiceReviewState(true, true, false)).toBeNull();
  });

  it('renders a check only for correct answers', () => {
    const correct = renderToStaticMarkup(<ChoiceReviewMark state="selected-correct" />);
    expect(correct).toContain('aria-label="正确答案"');
    expect(correct).not.toContain('选对');
    expect(renderToStaticMarkup(<ChoiceReviewMark state="selected-wrong" />)).toBe('');
  });
});
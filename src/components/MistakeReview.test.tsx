import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import type { SessionResult } from '../domain/models';
import { MistakeReview } from './MistakeReview';

const results: SessionResult[] = [
  {
    word: TEST_WORDS[0],
    mode: 'match-word',
    answer: {
      correct: false,
      response: 'benefit',
      correctAnswer: 'achieve',
    },
  },
  {
    word: TEST_WORDS[1],
    mode: 'choice',
    answer: {
      correct: true,
      response: '益处；好处',
      correctAnswer: '益处；好处',
    },
  },
  {
    word: TEST_WORDS[2],
    mode: 'listening',
    answer: {
      correct: false,
      response: '',
      correctAnswer: 'curious',
    },
  },
];

describe('MistakeReview', () => {
  it('shows only mistakes with meaning, player response and exact answer', () => {
    const html = renderToStaticMarkup(<MistakeReview results={results} />);

    expect(html).toContain('错题巩固');
    expect(html).toContain('2 题');
    expect(html).toContain('实现；达成');
    expect(html).toContain('你的答案');
    expect(html).toContain('benefit');
    expect(html).toContain('本题标准答案：achieve');
    expect(html).toContain('未作答');
    expect(html).not.toContain('益处；好处');
  });

  it('renders nothing for a perfect round', () => {
    const html = renderToStaticMarkup(<MistakeReview results={[results[1]]} />);
    expect(html).toBe('');
  });
});

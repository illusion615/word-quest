import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import {
  AUTO_ADVANCE_DELAY_MS,
  advanceSession,
  answerCurrentQuestion,
  completeSessionEarly,
  createGameSession,
  getRevealedChainWordIds,
  replaceUnavailableListening,
  resolveTimeoutSubmission,
  shouldPauseAfterAnswer,
  shuffleEntries,
  startChainGroup,
} from './session';
import type { AdaptiveStudyItem } from './models';

function plan(size: number): AdaptiveStudyItem[] {
  return Array.from({ length: size }, (_, index) => ({
    word: TEST_WORDS[index % TEST_WORDS.length],
    mode: index === 0 ? 'choice' : 'listening',
    stage: index === 0 ? 'new' : 'sound',
    chainIndex: Math.floor(index / 4),
    chainPosition: index % 4,
    chainRationale: {
      kind: 'priority',
      label: '测试组',
      description: '测试分组',
    },
    chainPassage: {
      text: 'Test sentence.',
      translation: '测试句子。',
      source: 'offline',
    },
  }));
}

describe('game session', () => {
  it('uses a three-second feedback delay by default', () => {
    expect(AUTO_ADVANCE_DELAY_MS).toBe(3000);
  });

  it('submits the current draft when time expires', () => {
    expect(resolveTimeoutSubmission({
      correct: false,
      response: '已选择的释义',
      correctAnswer: '正确释义',
      choiceFeedback: [{ text: '已选择的释义', status: 'incorrect' }],
    })).toEqual([
      false,
      '已选择的释义',
      '正确释义',
      [{ text: '已选择的释义', status: 'incorrect' }],
    ]);
    expect(resolveTimeoutSubmission(null)).toEqual([false, '']);
  });

  it('pauses feedback after a mistake but keeps correct answers moving', () => {
    expect(shouldPauseAfterAnswer(false)).toBe(true);
    expect(shouldPauseAfterAnswer(true)).toBe(false);
  });

  it('moves from asking to answered to the next question', () => {
    const preview = createGameSession(plan(2), 1000);
    const session = startChainGroup(preview, 1100);
    const answered = answerCurrentQuestion(session, {
      correct: true,
      response: '实现；达成',
      correctAnswer: '实现；达成',
    });
    const next = advanceSession(answered, 2000);

    expect(answered.phase).toBe('answered');
    expect(answered.correctCount).toBe(1);
    expect(answered.results).toEqual([{
      word: TEST_WORDS[0],
      mode: 'choice',
      answer: {
        correct: true,
        response: '实现；达成',
        correctAnswer: '实现；达成',
      },
    }]);
    expect(next.phase).toBe('asking');
    expect(next.index).toBe(1);
    expect(next.deadline).toBe(2000 + 12_000);
  });

  it('completes after the final answer', () => {
    const session = startChainGroup(createGameSession(plan(1), 1000), 1100);
    const answered = answerCurrentQuestion(session, {
      correct: false,
      response: '',
      correctAnswer: TEST_WORDS[0].word,
    });
    expect(advanceSession(answered, 2000).phase).toBe('complete');
  });

  it('can end a challenge early without fabricating answers for remaining words', () => {
    const session = startChainGroup(createGameSession(plan(5), 1000), 1100);
    const completed = completeSessionEarly(session);

    expect(completed.phase).toBe('complete');
    expect(completed.index).toBe(0);
    expect(completed.correctCount).toBe(0);
    expect(completed.queue).toHaveLength(5);
  });

  it('reveals only assessed words from the active chain', () => {
    const queue = plan(5);
    const asking = {
      ...startChainGroup(createGameSession(queue, 1000), 1100),
      index: 1,
    };
    const answered = answerCurrentQuestion(asking, {
      correct: true,
      response: 'answer',
      correctAnswer: 'answer',
    });

    expect([...getRevealedChainWordIds(asking)]).toEqual([queue[0].word.id]);
    expect([...getRevealedChainWordIds(answered)]).toEqual([
      queue[0].word.id,
      queue[1].word.id,
    ]);
  });

  it('replaces current and future listening questions when playback becomes unavailable', () => {
    const asking = startChainGroup(createGameSession(plan(3), 1000), 1100);
    const fallback = replaceUnavailableListening(asking, 2000);

    expect(fallback.queue.map((item) => item.mode)).toEqual(['choice', 'choice', 'choice']);
    expect(fallback.questionStartedAt).toBe(1100);

    const secondQuestion = {
      ...advanceSession(answerCurrentQuestion(asking, {
        correct: true,
        response: 'answer',
        correctAnswer: 'answer',
      }), 3000),
      phase: 'asking' as const,
    };
    const liveFallback = replaceUnavailableListening(secondQuestion, 4000);

    expect(liveFallback.queue[1].mode).toBe('choice');
    expect(liveFallback.deadline).toBe(4000 + 15_000);
  });

  it('pauses for a new memory-chain preview after four words', () => {
    let session = startChainGroup(createGameSession(plan(5), 1000), 1100);
    for (let index = 0; index < 4; index += 1) {
      session = answerCurrentQuestion(session, {
        correct: true,
        response: 'answer',
        correctAnswer: 'answer',
      });
      session = advanceSession(session, 2000 + index);
    }
    expect(session.index).toBe(4);
    expect(session.phase).toBe('preview');
    expect(startChainGroup(session, 3000).phase).toBe('asking');
  });

  it('supports deterministic shuffling for tests', () => {
    expect(shuffleEntries(TEST_WORDS, () => 0).map((entry) => entry.id))
      .toEqual(['benefit', 'curious', 'achieve']);
  });
});
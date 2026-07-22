import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCombatState } from '../domain/combat';
import type { AdaptiveStudyItem, GameSessionState } from '../domain/models';
import { TEST_WORDS } from '../test/fixtures/words';
import { PracticeSession } from './PracticeSession';

const completeSession: GameSessionState = {
  queue: [],
  results: [],
  index: 0,
  correctCount: 0,
  phase: 'complete',
  answer: null,
  startedAt: 0,
  questionStartedAt: 0,
  deadline: 0,
};

function renderPractice({
  completionAction = 'continue',
  session = completeSession,
  currentItem = null,
  currentChainItems = [],
  hidePassageDuringQuestions = false,
  autoAdvancePaused = false,
}: {
  completionAction?: 'next' | 'continue' | 'finished';
  session?: GameSessionState;
  currentItem?: AdaptiveStudyItem | null;
  currentChainItems?: AdaptiveStudyItem[];
  hidePassageDuringQuestions?: boolean;
  autoAdvancePaused?: boolean;
} = {}): string {
  return renderToStaticMarkup(
    <PracticeSession
      session={session}
      currentItem={currentItem}
      currentWord={currentItem?.word ?? null}
      currentChainItems={currentChainItems}
      entries={TEST_WORDS}
      remainingMs={0}
      autoAdvanceRemainingMs={0}
      autoAdvancePaused={autoAdvancePaused}
      onSubmit={() => undefined}
      onStartChain={() => undefined}
      onNext={() => undefined}
      onToggleAutoAdvance={() => undefined}
      onExit={() => undefined}
      levelNumber={12}
      enemyKind="grunt"
      combatState={createCombatState(1)}
      bestLevelResult={undefined}
      levelProgressPercentage={80}
      levelNewCount={completionAction === 'continue' ? 4 : 0}
      levelDueCount={0}
      nextReviewAt="2026-07-22T08:00:00.000Z"
      completionAction={completionAction}
      onCompleteAction={() => undefined}
      sessionPreparing={false}
      aiInsight={null}
      onAskAi={() => undefined}
      aiConfigured={false}
      missedWordIds={new Set()}
      relatedBankNames={[]}
      wordMastered={false}
      hideMonsterWord={false}
      hideAnswerCount={false}
      hidePassageDuringQuestions={hidePassageDuringQuestions}
      preferSimilarDistractors={false}
      extraOptionCount={0}
      boostCount={0}
      timeScale={1}
      speechSupported={false}
      speechSpeaking={false}
      speechError=""
      speechVoiceName="自动选择"
      onSpeak={() => undefined}
      onOpenSpeechSettings={() => undefined}
    />,
  );
}

function renderCompletion(
  completionAction: 'next' | 'continue' | 'finished',
  session = completeSession,
): string {
  return renderPractice({ completionAction, session });
}

describe('PracticeSession completion actions', () => {
  it('moves to the next unseen batch without repeating the completed group', () => {
    const html = renderCompletion('continue');
    expect(html).toContain('学习下一组');
    expect(html).toContain('下一轮不会重复本轮已学词');
  });

  it('offers the next level after the unlock threshold', () => {
    expect(renderCompletion('next')).toContain('挑战下一关');
  });

  it('returns to the map after the final level', () => {
    expect(renderCompletion('finished')).toContain('查看通关地图');
  });

  it('includes structured mistakes in the completed challenge', () => {
    const session: GameSessionState = {
      ...completeSession,
      results: [{
        word: TEST_WORDS[0],
        mode: 'match-word',
        answer: {
          correct: false,
          response: TEST_WORDS[1].word,
          correctAnswer: TEST_WORDS[0].word,
        },
      }],
    };

    const html = renderCompletion('continue', session);
    expect(html).toContain('错题巩固');
    expect(html).toContain('实现；达成');
    expect(html).toContain('你的答案');
  });

  it('shows the source passage in preview and hides it during questions when boosted', () => {
    const item: AdaptiveStudyItem = {
      word: TEST_WORDS[0],
      mode: 'choice',
      stage: 'new',
      chainIndex: 0,
      chainPosition: 0,
      chainRationale: {
        kind: 'priority',
        label: '测试串联',
        description: '测试断章效果',
      },
      chainPassage: {
        text: 'The source passage remains visible during preview.',
        translation: '预览时仍然显示原文。',
        source: 'ai',
      },
    };
    const session: GameSessionState = {
      ...completeSession,
      queue: [item],
      phase: 'preview',
    };
    const props = {
      currentItem: item,
      currentChainItems: [item],
      hidePassageDuringQuestions: true,
    };

    const previewHtml = renderPractice({ ...props, session });
    const askingHtml = renderPractice({ ...props, session: { ...session, phase: 'asking' } });

    expect(previewHtml).toContain('battle-passage-strip');
    expect(askingHtml).not.toContain('battle-passage-strip');
  });

  it('keeps the reviewed question and learning tools in one continuous card', () => {
    const item: AdaptiveStudyItem = {
      word: TEST_WORDS[0],
      mode: 'match-meaning',
      stage: 'new',
      chainIndex: 0,
      chainPosition: 0,
      chainRationale: {
        kind: 'priority',
        label: '测试串联',
        description: '测试连续阅卷',
      },
      chainPassage: {
        text: 'A learner can achieve a difficult goal.',
        translation: '学习者可以实现困难的目标。',
        source: 'ai',
      },
    };
    const session: GameSessionState = {
      ...completeSession,
      queue: [item],
      phase: 'answered',
      answer: {
        correct: false,
        response: '未选择',
        correctAnswer: TEST_WORDS[0].definitionZh,
      },
    };
    const html = renderPractice({
      session,
      currentItem: item,
      currentChainItems: [item],
      autoAdvancePaused: true,
    });

    expect(html).toContain('选择正确释义');
    expect(html).toContain('data-review-state="correct-answer"');
    expect(html).toContain('自动前进已暂停');
    expect(html).toContain('AI 词汇教练');
    expect(html).not.toContain('answer-columns');
  });
});

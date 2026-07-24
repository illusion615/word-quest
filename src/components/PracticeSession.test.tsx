import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCombatState, type CombatState } from '../domain/combat';
import { buildBossAssessmentPlan } from '../domain/boss';
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
  autoAdvanceEnabled = true,
  autoAdvancePaused = false,
  speechSupported = false,
  enemyKind = 'grunt',
  combatState = createCombatState(1),
  levelNewCount = completionAction === 'continue' ? 4 : 0,
}: {
  completionAction?: 'next' | 'continue' | 'finished';
  session?: GameSessionState;
  currentItem?: AdaptiveStudyItem | null;
  currentChainItems?: AdaptiveStudyItem[];
  hidePassageDuringQuestions?: boolean;
  autoAdvanceEnabled?: boolean;
  autoAdvancePaused?: boolean;
  speechSupported?: boolean;
  enemyKind?: 'grunt' | 'boss';
  combatState?: CombatState;
  levelNewCount?: number;
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
      autoAdvanceEnabled={autoAdvanceEnabled}
      autoAdvancePaused={autoAdvancePaused}
      onSubmit={() => undefined}
      onStartChain={() => undefined}
      onNext={() => undefined}
      onToggleAutoAdvance={() => undefined}
      onSetAutoAdvancePaused={() => undefined}
      onExit={() => undefined}
      levelNumber={12}
      enemyKind={enemyKind}
      combatState={combatState}
      bestLevelResult={undefined}
      levelProgressPercentage={80}
      levelWordCount={25}
      levelNewCount={levelNewCount}
      levelDueCount={0}
      nextReviewAt="2026-07-22T08:00:00.000Z"
      completionAction={completionAction}
      onCompleteAction={() => undefined}
      sessionPreparing={false}
      coachInsight={null}
      onOpenCoach={() => undefined}
      onRegenerateCoach={() => undefined}
      aiConfigured={false}
      missedWordIds={new Set()}
      relatedBankNames={[]}
      wordMastered={false}
      progressByWordId={{}}
      disableMonsterSpeech={false}
      hideAnswerCount={false}
      hidePassageDuringQuestions={hidePassageDuringQuestions}
      preferSimilarDistractors={false}
      extraOptionCount={0}
      boostCount={0}
      timeScale={1}
      speechSupported={speechSupported}
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
    expect(html).toContain('本关已引入 21 / 25 词');
    expect(html).toContain('还剩 4 个新词，预计 1 批');
    expect(html).toContain('继续本关 · 最多 4 新词');
  });

  it('offers the next level after the unlock threshold', () => {
    expect(renderCompletion('next')).toContain('挑战下一关');
  });

  it('offers a clearance retry after losing the final new-word batch', () => {
    const html = renderPractice({
      completionAction: 'continue',
      levelNewCount: 0,
      combatState: { ...createCombatState(8), phase: 'defeat' },
    });

    expect(html).toContain('25 个词已全部引入');
    expect(html).toContain('薄弱词重新进行通关复核');
    expect(html).toContain('重新挑战通关');
    expect(html).not.toContain('等待到期复习');
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
    expect(html).toContain('aria-label="关闭自动下一题"');
    expect(html).toContain('inline-review-next-progress is-enabled');
    expect(html).not.toContain('inline-auto-toggle');
    expect(html).toContain(`aria-label="查看 ${item.word.word} 词汇详情"`);
    expect(html).toContain('inline-review-word-summary');
    expect(html).not.toContain('<dt>状态</dt>');
    expect(html).not.toContain('answer-bank-note');
    expect(html.indexOf('question-kicker')).toBeLessThan(html.indexOf('choice-grid'));
    expect(html).not.toContain('answer-columns');
  });

  it('renders listening-to-meaning without revealing the target word', () => {
    const item: AdaptiveStudyItem = {
      word: TEST_WORDS[0],
      mode: 'listen-meaning',
      stage: 'sound',
      chainIndex: 0,
      chainPosition: 0,
      chainRationale: {
        kind: 'priority',
        label: 'Boss 识破',
        description: '听音识义',
      },
      chainPassage: {
        text: 'Boss assessment.',
        translation: 'Boss 考核。',
        source: 'offline',
      },
    };
    const html = renderPractice({
      session: { ...completeSession, queue: [item], phase: 'asking' },
      currentItem: item,
      currentChainItems: [item],
      speechSupported: true,
    });

    expect(html).toContain('听发音，选出全部正确释义');
    expect(html.match(/选出全部正确释义/g)).toHaveLength(1);
    expect(html).not.toContain('听发音，选出正确释义');
    expect(html).not.toContain(`<strong>${item.word.word}</strong>`);
    expect(html).toContain('aria-label="播放单词发音"');
  });

  it('shows a finite three-stage Boss preview with dedicated Boss artwork', () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      ...TEST_WORDS[index % TEST_WORDS.length],
      id: `boss-word-${index}`,
      word: `bossword${index}`,
    }));
    const plan = buildBossAssessmentPlan(
      entries,
      { version: 1, progress: {}, history: [] },
      { speechPlayback: true },
      new Date('2026-07-23T00:00:00Z'),
    );
    const html = renderPractice({
      session: { ...completeSession, queue: plan, phase: 'preview' },
      currentItem: plan[0],
      currentChainItems: plan.slice(0, 4),
      speechSupported: true,
      enemyKind: 'boss',
    });

    expect(html).toContain('Boss · 第 1 / 3 阶段 · 识破');
    expect(html).toContain('全场固定 12 题');
    expect(html).toContain('开始识破阶段');
    expect(html).not.toContain('只词怪已就位');
    expect(html).toContain('combat-monster');
    expect(html).not.toContain('monster-roster');
  });

  it('does not mislabel Boss victory as FSRS stable mastery', () => {
    const html = renderPractice({
      completionAction: 'next',
      enemyKind: 'boss',
      levelNewCount: 0,
      combatState: {
        ...createCombatState(12),
        phase: 'victory',
        answersResolved: 12,
        correctAnswers: 12,
      },
      session: { ...completeSession, correctCount: 12 },
    });

    expect(html).toContain('三阶段已完成');
    expect(html).not.toContain('稳定掌握 80%');
  });

  it('explains the Boss passing score after all twelve questions are answered', () => {
    const html = renderPractice({
      completionAction: 'continue',
      enemyKind: 'boss',
      levelNewCount: 0,
      combatState: {
        ...createCombatState(12, { requiredCorrectAnswers: 10 }),
        phase: 'defeat',
        answersResolved: 12,
        correctAnswers: 9,
      },
      session: { ...completeSession, correctCount: 9 },
    });

    expect(html).toContain('未达到 10 / 12 及格线');
    expect(html).toContain('至少答对 10 题才通过');
    expect(html).toContain('所有学习记录均已保留');
    expect(html).not.toContain('考核中止');
  });
});

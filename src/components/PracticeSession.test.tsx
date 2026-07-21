import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCombatState } from '../domain/combat';
import type { GameSessionState } from '../domain/models';
import { PracticeSession } from './PracticeSession';

const completeSession: GameSessionState = {
  queue: [],
  index: 0,
  correctCount: 0,
  phase: 'complete',
  answer: null,
  startedAt: 0,
  questionStartedAt: 0,
  deadline: 0,
};

function renderCompletion(completionAction: 'next' | 'continue' | 'finished'): string {
  return renderToStaticMarkup(
    <PracticeSession
      session={completeSession}
      currentItem={null}
      currentWord={null}
      currentChainItems={[]}
      entries={[]}
      remainingMs={0}
      autoAdvanceRemainingMs={0}
      autoAdvancePaused={false}
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
});

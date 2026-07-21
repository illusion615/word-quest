import { lazy, Suspense } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Layers3,
  LoaderCircle,
  Pause,
  Play,
  Sparkles,
  Star,
  XCircle,
} from '../icons';
import type {
  AdaptiveStudyItem,
  GameSessionState,
  LearningStage,
  WordEntry,
  WordProgress,
} from '../domain/models';
import type { CombatState } from '../domain/combat';
import { calculateStars, type LevelGameResult } from '../domain/gameProgress';
import {
  AUTO_ADVANCE_DELAY_MS,
  MODE_TIME_LIMITS,
  getRevealedChainWordIds,
} from '../domain/session';
import { BossQuestion } from './modes/BossQuestion';
import { ChainSentenceBar } from './ChainSentenceBar';
import { ChoiceQuestion } from './modes/ChoiceQuestion';
import { ListeningQuestion } from './modes/ListeningQuestion';
import { SentenceQuestion } from './modes/SentenceQuestion';
import { WordDefinitions } from './WordDefinitions';
import { MemoryChainPreview } from './MemoryChainPreview';
import type { CombatEnemyKind } from './CombatHud';
import { BattleScene } from './BattleScene';

const MarkdownContent = lazy(() => import('./MarkdownContent'));

interface PracticeSessionProps {
  session: GameSessionState;
  currentItem: AdaptiveStudyItem | null;
  currentWord: WordEntry | null;
  currentChainItems: AdaptiveStudyItem[];
  entries: WordEntry[];
  remainingMs: number;
  autoAdvanceRemainingMs: number;
  autoAdvancePaused: boolean;
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
  onStartChain: () => void;
  onNext: () => void;
  onToggleAutoAdvance: () => void;
  onExit: () => void;
  levelNumber: number;
  enemyKind: CombatEnemyKind;
  combatState: CombatState;
  bestLevelResult?: LevelGameResult;
  levelProgressPercentage: number;
  levelNewCount: number;
  levelDueCount: number;
  nextReviewAt: string | null;
  completionAction: 'next' | 'continue' | 'finished';
  onCompleteAction: () => void;
  sessionPreparing: boolean;
  aiInsight: {
    wordId: string;
    status: 'loading' | 'success' | 'error';
    text: string;
  } | null;
  onAskAi: (word: WordEntry) => void;
  assessmentWordIds: Set<string>;
  onToggleAssessment: (wordId: string) => void;
  relatedBankNames: string[];
  wordMastered: boolean;
  wordProgress?: WordProgress;
  speechSupported: boolean;
  speechSpeaking: boolean;
  speechError: string;
  speechVoiceName: string;
  onSpeak: (text: string) => void;
  onOpenSpeechSettings: () => void;
}

const MODE_META = {
  listening: '听音拼写',
  choice: '释义选择',
  sentence: '释义填空',
  boss: '极限挑战',
};

const STAGE_LABELS: Record<LearningStage, string> = {
  new: '建立识别',
  sound: '巩固音形',
  context: '放入语境',
  recall: '快速提取',
};

export function PracticeSession({
  session,
  currentItem,
  currentWord,
  currentChainItems,
  entries,
  remainingMs,
  autoAdvanceRemainingMs,
  autoAdvancePaused,
  onSubmit,
  onStartChain,
  onNext,
  onToggleAutoAdvance,
  onExit,
  levelNumber,
  enemyKind,
  combatState,
  bestLevelResult,
  levelProgressPercentage,
  levelNewCount,
  levelDueCount,
  nextReviewAt,
  completionAction,
  onCompleteAction,
  sessionPreparing,
  aiInsight,
  onAskAi,
  assessmentWordIds,
  onToggleAssessment,
  relatedBankNames,
  wordMastered,
  wordProgress,
  speechSupported,
  speechSpeaking,
  speechError,
  speechVoiceName,
  onSpeak,
  onOpenSpeechSettings,
}: PracticeSessionProps) {
  const mode = currentItem?.mode ?? 'choice';
  const modeName = MODE_META[mode];
  const questionNumber = Math.min(session.index + 1, session.queue.length);
  const timerPercent = (remainingMs / MODE_TIME_LIMITS[mode]) * 100;
  const autoAdvancePercent = (autoAdvanceRemainingMs / AUTO_ADVANCE_DELAY_MS) * 100;
  const autoAdvanceSeconds = Math.ceil(autoAdvanceRemainingMs / 1000);
  const autoAdvanceTarget = session.index + 1 >= session.queue.length ? '查看结果' : '下一题';
  const revealedWordIds = getRevealedChainWordIds(session);

  function handleStartChain() {
    if (speechSupported && currentItem?.mode === 'listening' && currentWord) {
      onSpeak(currentWord.word);
    }
    onStartChain();
  }

  if (session.phase === 'complete') {
    const resolvedAnswers = combatState.answersResolved;
    const score = resolvedAnswers > 0
      ? Math.round((session.correctCount / resolvedAnswers) * 100)
      : 0;
    const stars = calculateStars(combatState);
    const canContinue = levelNewCount > 0 || levelDueCount > 0;
    const nextReviewLabel = nextReviewAt
      ? new Date(nextReviewAt).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '暂无到期复习';
    return (
      <main className="practice-page is-complete page-width">
        <section className="completion-panel" aria-labelledby="complete-heading">
          <div className="completion-mark"><CheckCircle2 aria-hidden="true" /></div>
          <p className="eyebrow">第 {levelNumber} 关 · 本次挑战完成</p>
          <h1 id="complete-heading">{session.correctCount} / {resolvedAnswers}</h1>
          <p>已作答 {resolvedAnswers} 题 · 本次正确率 {score}% · 稳定掌握 {levelProgressPercentage}%</p>
          <p className="review-schedule-summary">
            {levelNewCount > 0
              ? `本关还有 ${levelNewCount} 个新词，下一轮不会重复本轮已学词。`
              : levelDueCount > 0
                ? `当前还有 ${levelDueCount} 个到期词需要复习。`
                : `本关当前已完成，下一次复习：${nextReviewLabel}。`}
          </p>
          <div className="battle-stars" aria-label={`本次获得 ${stars} 星`}>
            {[1, 2, 3].map((star) => (
              <Star key={star} className={star <= stars ? 'is-earned' : ''} aria-hidden="true" />
            ))}
          </div>
          <div className="combat-result-stats" aria-label="战斗表现">
            <div><span>战斗结果</span><strong>{combatState.phase === 'victory' ? '胜利' : '失败'}</strong></div>
            <div><span>最高连击</span><strong>{combatState.bestCombo}</strong></div>
            <div><span>暴击</span><strong>{combatState.criticalHits}</strong></div>
            <div><span>战斗分</span><strong>{combatState.score}</strong></div>
          </div>
          {bestLevelResult && (
            <p className="battle-best">
              历史最佳 · {bestLevelResult.stars} 星 · 连击 {bestLevelResult.bestCombo} · {bestLevelResult.bestScore} 分
            </p>
          )}
          <div className="completion-actions">
            <button type="button" className="secondary-button" onClick={onExit}>
              返回关卡地图
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={onCompleteAction}
              disabled={sessionPreparing || (completionAction === 'continue' && !canContinue)}
            >
              {sessionPreparing ? (
                <><LoaderCircle className="spin-icon" aria-hidden="true" /> 正在构建战场</>
              ) : completionAction === 'next' ? (
                <>挑战下一关 <ArrowRight aria-hidden="true" /></>
              ) : completionAction === 'finished' ? (
                <>查看通关地图 <CheckCircle2 aria-hidden="true" /></>
              ) : canContinue ? (
                <>学习下一组 <ArrowRight aria-hidden="true" /></>
              ) : (
                <>等待到期复习</>
              )}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!currentWord || !currentItem) return null;

  const totalChains = Math.max(...session.queue.map((item) => item.chainIndex)) + 1;

  if (session.phase === 'preview') {
    return (
      <main className="practice-page page-width">
        <BattleScene
          state={combatState}
          levelNumber={levelNumber}
          enemyKind={enemyKind}
          headerTitle={`记忆串联 · 第 ${currentItem.chainIndex + 1} / ${totalChains} 组`}
          currentQuestion={questionNumber}
          totalQuestions={session.queue.length}
          onExit={onExit}
          preview
          contextPanel={(
            <ChainSentenceBar
              items={currentChainItems}
              currentWordId={currentWord.id}
              revealedWordIds={revealedWordIds}
              compact
            />
          )}
        >
          <section className="question-card chain-preview-card">
            <MemoryChainPreview
              items={currentChainItems}
              assessmentWordIds={assessmentWordIds}
              isSpeechSupported={speechSupported}
              onStart={handleStartChain}
              onSpeak={onSpeak}
              onToggleAssessment={onToggleAssessment}
            />
          </section>
        </BattleScene>
      </main>
    );
  }

  return (
    <main className="practice-page page-width">
      <BattleScene
        state={combatState}
        levelNumber={levelNumber}
        enemyKind={enemyKind}
        headerTitle={`${modeName} · ${STAGE_LABELS[currentItem.stage]}`}
        currentQuestion={questionNumber}
        totalQuestions={session.queue.length}
        onExit={onExit}
        contextPanel={(
          <ChainSentenceBar
            items={currentChainItems}
            currentWordId={currentWord.id}
            revealedWordIds={revealedWordIds}
          />
        )}
      >
        <section className="question-card" aria-live="polite">
        <div className="timer-row">
          <span>本题剩余</span>
          <strong>{Math.ceil(remainingMs / 1000)} 秒</strong>
        </div>
        <div className="timer-track">
          <span style={{ width: `${timerPercent}%` }} />
        </div>

        {session.phase === 'asking' && (
          <div key={currentWord.id}>
            {mode === 'listening' && (
              <ListeningQuestion
                word={currentWord}
                autoPlay={currentItem.chainPosition !== 0}
                isSpeechSupported={speechSupported}
                isSpeaking={speechSpeaking}
                speechError={speechError}
                voiceName={speechVoiceName}
                onSpeak={onSpeak}
                onOpenSettings={onOpenSpeechSettings}
                onSubmit={onSubmit}
              />
            )}
            {mode === 'choice' && (
              <ChoiceQuestion word={currentWord} entries={entries} onSubmit={onSubmit} />
            )}
            {mode === 'sentence' && (
              <SentenceQuestion word={currentWord} onSubmit={onSubmit} />
            )}
            {mode === 'boss' && (
              <BossQuestion word={currentWord} onSubmit={onSubmit} />
            )}
          </div>
        )}

        {session.phase === 'answered' && session.answer && (
          <div className={`answer-panel ${session.answer.correct ? 'is-correct' : 'is-wrong'}`}>
            {session.answer.correct
              ? <CheckCircle2 aria-hidden="true" />
              : <XCircle aria-hidden="true" />}
            <p className="answer-title">{session.answer.correct ? '回答正确' : '这次没想起来'}</p>
            <p className="chain-position">
              串联 {currentItem.chainPosition + 1} / {currentChainItems.length} · {STAGE_LABELS[currentItem.stage]}
            </p>
            <div className="answer-word-heading">
              <strong>{currentWord.word} <small>{currentWord.phonetic}</small></strong>
              {currentWord.partOfSpeech && (
                <span className="word-pos">{currentWord.partOfSpeech}</span>
              )}
            </div>
            <WordDefinitions word={currentWord} />
            {!session.answer.correct && (
              <p className="your-answer">你的答案：{session.answer.response || '未作答'}</p>
            )}
            {wordProgress && (
              <div className="word-progress-summary" aria-label="本词学习进度">
                <div><span>练习</span><strong>{wordProgress.attempts} 次</strong></div>
                <div><span>答对</span><strong>{wordProgress.correct} 次</strong></div>
                <div><span>历史正确率</span><strong>{wordProgress.mastery}%</strong></div>
              </div>
            )}
            {relatedBankNames.length > 0 && (
              <div className={`coverage-reward ${wordMastered ? 'is-mastered' : ''}`}>
                <Layers3 aria-hidden="true" />
                <div>
                  <strong>
                    {wordMastered ? '已进入稳定掌握' : '本次作答已更新复习计划'}
                  </strong>
                  <span>{relatedBankNames.join(' · ')}</span>
                  {!wordMastered && <small>FSRS 会根据记忆稳定性安排下次复习</small>}
                </div>
              </div>
            )}
            <div className={`auto-advance-panel ${autoAdvancePaused ? 'is-paused' : ''}`}>
              <div className="auto-advance-heading">
                <span aria-live="polite">
                  {autoAdvancePaused
                    ? '自动前进已暂停'
                    : `${autoAdvanceSeconds} 秒后自动${autoAdvanceTarget}`}
                </span>
                <button type="button" onClick={onToggleAutoAdvance}>
                  {autoAdvancePaused
                    ? <><Play aria-hidden="true" /> 继续</>
                    : <><Pause aria-hidden="true" /> 暂停</>}
                </button>
              </div>
              <div
                className="auto-advance-track"
                role="progressbar"
                aria-label={`自动${autoAdvanceTarget}倒计时`}
                aria-valuemin={0}
                aria-valuemax={AUTO_ADVANCE_DELAY_MS}
                aria-valuenow={autoAdvanceRemainingMs}
              >
                <span style={{ width: `${autoAdvancePercent}%` }} />
              </div>
            </div>
            <div className="answer-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => onAskAi(currentWord)}
                disabled={aiInsight?.wordId === currentWord.id && aiInsight.status === 'loading'}
              >
                <Sparkles aria-hidden="true" />
                {aiInsight?.wordId === currentWord.id && aiInsight.status === 'loading'
                  ? '生成讲解中'
                  : 'AI 讲解'}
              </button>
              <button type="button" className="primary-button" onClick={onNext}>
                {session.index + 1 >= session.queue.length ? '立即查看结果' : '立即下一题'}
                <ArrowRight aria-hidden="true" />
              </button>
            </div>

            {aiInsight?.wordId === currentWord.id && aiInsight.status !== 'loading' && (
              <div className={`ai-insight is-${aiInsight.status}`} aria-live="polite">
                <div className="ai-insight-heading">
                  <Sparkles aria-hidden="true" /><strong>AI 词汇教练</strong>
                </div>
                {aiInsight.status === 'success'
                  ? (
                    <Suspense fallback={<p className="markdown-loading">正在排版讲解...</p>}>
                      <MarkdownContent content={aiInsight.text} />
                    </Suspense>
                  )
                  : <p>{aiInsight.text}</p>}
              </div>
            )}
          </div>
        )}
        </section>
      </BattleScene>
    </main>
  );
}
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Star,
} from '../icons';
import type {
  AdaptiveStudyItem,
  GameMode,
  GameSessionState,
  LearningStage,
  SessionAnswer,
  WordEntry,
  WordProgress,
  WordSenseExample,
} from '../domain/models';
import type { CombatState } from '../domain/combat';
import { calculateStars, type LevelGameResult } from '../domain/gameProgress';
import {
  buildRarityIndex,
  buildWaveMonsters,
  type WaveMonsterInput,
} from '../domain/monsterRoster';
import {
  AUTO_ADVANCE_DELAY_MS,
  MODE_TIME_LIMITS,
  getRevealedChainWordIds,
  resolveTimeoutSubmission,
} from '../domain/session';
import { BossQuestion } from './modes/BossQuestion';
import { ChainSentenceBar } from './ChainSentenceBar';
import { ChoiceQuestion } from './modes/ChoiceQuestion';
import { ListeningQuestion } from './modes/ListeningQuestion';
import { ListenWordQuestion } from './modes/ListenWordQuestion';
import { MatchMeaningQuestion } from './modes/MatchMeaningQuestion';
import { MatchWordQuestion } from './modes/MatchWordQuestion';
import { MistakeReview } from './MistakeReview';
import { SentenceQuestion } from './modes/SentenceQuestion';
import type { CombatEnemyKind } from './CombatHud';
import { BattleScene } from './BattleScene';
import { InlineQuestionReview } from './InlineQuestionReview';

interface PracticeSessionProps {
  session: GameSessionState;
  currentItem: AdaptiveStudyItem | null;
  currentWord: WordEntry | null;
  currentChainItems: AdaptiveStudyItem[];
  entries: WordEntry[];
  remainingMs: number;
  autoAdvanceRemainingMs: number;
  autoAdvancePaused: boolean;
  onSubmit: (
    correct: boolean,
    response: string,
    correctAnswer?: string,
    choiceFeedback?: SessionAnswer['choiceFeedback'],
  ) => void;
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
    senseExamples: WordSenseExample[];
  } | null;
  onAskAi: (word: WordEntry, pauseReview?: boolean) => void;
  aiConfigured: boolean;
  missedWordIds: Set<string>;
  relatedBankNames: string[];
  wordMastered: boolean;
  wordProgress?: WordProgress;
  hideMonsterWord: boolean;
  hideAnswerCount: boolean;
  hidePassageDuringQuestions: boolean;
  preferSimilarDistractors: boolean;
  extraOptionCount: number;
  boostCount: number;
  timeScale: number;
  speechSupported: boolean;
  speechSpeaking: boolean;
  speechError: string;
  speechVoiceName: string;
  onSpeak: (text: string) => void;
  onOpenSpeechSettings: () => void;
}

const MODE_META: Record<GameMode, string> = {
  listening: '听音拼写',
  choice: '释义选择',
  sentence: '释义填空',
  boss: '极限挑战',
  'match-meaning': '识义选择',
  'match-word': '中文辨形',
  'listen-word': '听音辨词',
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
  aiConfigured,
  missedWordIds,
  relatedBankNames,
  wordMastered,
  wordProgress,
  hideMonsterWord,
  hideAnswerCount,
  hidePassageDuringQuestions,
  preferSimilarDistractors,
  extraOptionCount,
  boostCount,
  timeScale,
  speechSupported,
  speechSpeaking,
  speechError,
  speechVoiceName,
  onSpeak,
  onOpenSpeechSettings,
}: PracticeSessionProps) {
  const mode = currentItem?.mode ?? 'choice';
  const modeName = MODE_META[mode];
  const timerPercent = (remainingMs / (MODE_TIME_LIMITS[mode] * timeScale)) * 100;
  const autoAdvancePercent = (autoAdvanceRemainingMs / AUTO_ADVANCE_DELAY_MS) * 100;
  const revealedWordIds = getRevealedChainWordIds(session);
  const rarityIndex = useMemo(() => buildRarityIndex(entries), [entries]);
  const questionDraftRef = useRef<SessionAnswer | null>(null);
  const submittedQuestionRef = useRef<string | null>(null);
  const questionKey = `${session.startedAt}:${session.index}:${currentWord?.id ?? ''}`;
  // Once a question is answered, the vocabulary coach is generated automatically
  // (only when a model is configured). Guarded so it fires just once per word.
  const autoAiWordRef = useRef<string | null>(null);
  useEffect(() => {
    if (session.phase !== 'answered') {
      autoAiWordRef.current = null;
      return;
    }
    if (!aiConfigured || !currentWord) return;
    if (autoAiWordRef.current === currentWord.id) return;
    autoAiWordRef.current = currentWord.id;
    onAskAi(currentWord, false);
  }, [session.phase, currentWord, aiConfigured, onAskAi]);
  // Spacebar pauses / resumes the auto-advance countdown while reviewing.
  useEffect(() => {
    if (session.phase !== 'answered') return;
    function handleKey(event: KeyboardEvent) {
      if (event.code !== 'Space' && event.key !== ' ') return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      event.preventDefault();
      onToggleAutoAdvance();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [session.phase, onToggleAutoAdvance]);

  useEffect(() => {
    questionDraftRef.current = null;
    submittedQuestionRef.current = null;
  }, [questionKey]);

  const handleDraftChange = useCallback((draft: SessionAnswer | null) => {
    questionDraftRef.current = draft;
  }, []);

  const handleQuestionSubmit = useCallback((
    correct: boolean,
    response: string,
    correctAnswer?: string,
    choiceFeedback?: SessionAnswer['choiceFeedback'],
  ) => {
    if (submittedQuestionRef.current === questionKey) return;
    submittedQuestionRef.current = questionKey;
    questionDraftRef.current = null;
    onSubmit(correct, response, correctAnswer, choiceFeedback);
  }, [onSubmit, questionKey]);

  useEffect(() => {
    if (session.phase !== 'asking' || remainingMs > 0) return;
    if (submittedQuestionRef.current === questionKey) return;
    submittedQuestionRef.current = questionKey;
    const submission = resolveTimeoutSubmission(questionDraftRef.current);
    questionDraftRef.current = null;
    onSubmit(...submission);
  }, [onSubmit, questionKey, remainingMs, session.phase]);
  const roster = buildWaveMonsters(
    currentChainItems.map((item): WaveMonsterInput => ({
      word: item.word,
      status: session.phase === 'asking' && item.word.id === currentWord?.id
        ? 'active'
        : revealedWordIds.has(item.word.id)
          ? (missedWordIds.has(item.word.id) ? 'missed' : 'defeated')
          : 'pending',
    })),
    rarityIndex,
  );
  // The reading passage only appears when the AI actually wrote one; offline runs
  // hide it entirely. It renders above the monsters inside BattleScene.
  const aiPassage = currentChainItems[0]?.chainPassage;
  const passageNode = currentWord && aiPassage?.source === 'ai'
    ? (
      <ChainSentenceBar
        items={currentChainItems}
        currentWordId={currentWord.id}
        revealedWordIds={revealedWordIds}
        missedWordIds={missedWordIds}
      />
    )
    : undefined;
  function handleStartChain() {
    const speaksOnStart = currentItem?.mode === 'listening'
      || currentItem?.mode === 'match-meaning'
      || currentItem?.mode === 'listen-word';
    if (speechSupported && speaksOnStart && currentWord) {
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
        <MistakeReview results={session.results} />
      </main>
    );
  }

  if (!currentWord || !currentItem) return null;

  const totalChains = Math.max(...session.queue.map((item) => item.chainIndex)) + 1;
  const reviewAnswer = session.phase === 'answered' ? session.answer : null;
  const reviewed = Boolean(reviewAnswer);

  if (session.phase === 'preview') {
    return (
      <main className="practice-page page-width">
        <BattleScene
          state={combatState}
          levelNumber={levelNumber}
          enemyKind={enemyKind}
          headerTitle={`记忆串联 · 第 ${currentItem.chainIndex + 1} / ${totalChains} 组`}
          onExit={onExit}
          preview
          roster={roster}
          passage={passageNode}
          onSpeak={onSpeak}
          hideWord={hideMonsterWord}
          boostCount={boostCount}
        >
          <div className="battle-start-panel">
            <p className="question-kicker">
              本组 {currentChainItems.length} 只词怪已就位，{hideMonsterWord ? '目标词已隐藏' : '头顶即目标词'}
            </p>
            <button type="button" className="primary-button" onClick={handleStartChain}>
              开始挑战 <ArrowRight aria-hidden="true" />
            </button>
          </div>
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
        onExit={onExit}
        roster={roster}
        passage={hidePassageDuringQuestions ? undefined : passageNode}
        onSpeak={onSpeak}
        hideWord={hideMonsterWord}
        boostCount={boostCount}
        rosterFocusWordId={currentWord.id}
      >
        <section className="question-card" aria-live="polite">
        {session.phase === 'asking' && (
          <>
            <div className="timer-row">
              <span>本题剩余</span>
              <strong>{Math.ceil(remainingMs / 1000)} 秒</strong>
            </div>
            <div className="timer-track">
              <span style={{ width: `${timerPercent}%` }} />
            </div>
          </>
        )}

        {(session.phase === 'asking' || session.phase === 'answered') && (
          <div key={questionKey}>
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
                onSubmit={handleQuestionSubmit}
                onDraftChange={handleDraftChange}
                reviewAnswer={reviewAnswer}
              />
            )}
            {mode === 'choice' && (
              <ChoiceQuestion
                word={currentWord}
                entries={entries}
                extraOptionCount={extraOptionCount}
                preferSimilarDistractors={preferSimilarDistractors}
                reviewed={reviewed}
                wordProgress={wordProgress}
                onSubmit={handleQuestionSubmit}
              />
            )}
            {mode === 'sentence' && (
              <SentenceQuestion
                word={currentWord}
                onSubmit={handleQuestionSubmit}
                onDraftChange={handleDraftChange}
                reviewAnswer={reviewAnswer}
              />
            )}
            {mode === 'boss' && (
              <BossQuestion
                word={currentWord}
                onSubmit={handleQuestionSubmit}
                onDraftChange={handleDraftChange}
                reviewAnswer={reviewAnswer}
              />
            )}
            {mode === 'match-meaning' && (
              <MatchMeaningQuestion
                word={currentWord}
                entries={entries}
                isSpeechSupported={speechSupported}
                isSpeaking={speechSpeaking}
                onSpeak={onSpeak}
                onSubmit={handleQuestionSubmit}
                onDraftChange={handleDraftChange}
                hideAnswerCount={hideAnswerCount}
                extraOptionCount={extraOptionCount}
                preferSimilarDistractors={preferSimilarDistractors}
                reviewed={reviewed}
                wordProgress={wordProgress}
              />
            )}
            {mode === 'match-word' && (
              <MatchWordQuestion
                word={currentWord}
                entries={entries}
                extraOptionCount={extraOptionCount}
                preferSimilarDistractors={preferSimilarDistractors}
                reviewed={reviewed}
                onSubmit={handleQuestionSubmit}
              />
            )}
            {mode === 'listen-word' && (
              <ListenWordQuestion
                word={currentWord}
                entries={entries}
                isSpeechSupported={speechSupported}
                isSpeaking={speechSpeaking}
                speechError={speechError}
                voiceName={speechVoiceName}
                extraOptionCount={extraOptionCount}
                preferSimilarDistractors={preferSimilarDistractors}
                reviewed={reviewed}
                onSpeak={onSpeak}
                onOpenSettings={onOpenSpeechSettings}
                onSubmit={handleQuestionSubmit}
              />
            )}
          </div>
        )}

        {reviewAnswer && (
          <InlineQuestionReview
            key={`review:${questionKey}`}
            word={currentWord}
            isLastQuestion={session.index + 1 >= session.queue.length}
            autoAdvancePercent={autoAdvancePercent}
            autoAdvancePaused={autoAdvancePaused}
            onToggleAutoAdvance={onToggleAutoAdvance}
            onNext={onNext}
            aiConfigured={aiConfigured}
            aiInsight={aiInsight}
            onAskAi={onAskAi}
            relatedBankNames={relatedBankNames}
            wordMastered={wordMastered}
          />
        )}
        </section>
      </BattleScene>
    </main>
  );
}
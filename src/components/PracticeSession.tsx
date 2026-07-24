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
  WordCoachInsight,
  WordProgress,
} from '../domain/models';
import type { CombatState } from '../domain/combat';
import { BOSS_QUESTION_COUNT, BOSS_STAGES, bossPassingScore } from '../domain/boss';
import { DEFAULT_NEW_WORD_LIMIT } from '../domain/progress';
import { calculateStars, type LevelGameResult } from '../domain/gameProgress';
import {
  buildRarityIndex,
  buildWaveMonsters,
  type WaveMonsterInput,
} from '../domain/monsterRoster';
import {
  AUTO_ADVANCE_DELAY_MS,
  getRevealedChainWordIds,
  resolveModeTimeLimit,
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
  autoAdvanceEnabled: boolean;
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
  onSetAutoAdvancePaused: (paused: boolean) => void;
  onExit: () => void;
  levelNumber: number;
  enemyKind: CombatEnemyKind;
  combatState: CombatState;
  bestLevelResult?: LevelGameResult;
  levelProgressPercentage: number;
  levelWordCount: number;
  levelNewCount: number;
  levelDueCount: number;
  nextReviewAt: string | null;
  completionAction: 'next' | 'continue' | 'finished';
  onCompleteAction: () => void;
  sessionPreparing: boolean;
  coachInsight: WordCoachInsight | null;
  onOpenCoach: (word: WordEntry) => void;
  onRegenerateCoach: (word: WordEntry) => void;
  aiConfigured: boolean;
  missedWordIds: Set<string>;
  relatedBankNames: string[];
  wordMastered: boolean;
  progressByWordId: Record<string, WordProgress>;
  disableMonsterSpeech: boolean;
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
  'listen-meaning': '听音识义',
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
  autoAdvanceEnabled,
  autoAdvancePaused,
  onSubmit,
  onStartChain,
  onNext,
  onToggleAutoAdvance,
  onSetAutoAdvancePaused,
  onExit,
  levelNumber,
  enemyKind,
  combatState,
  bestLevelResult,
  levelProgressPercentage,
  levelWordCount,
  levelNewCount,
  levelDueCount,
  nextReviewAt,
  completionAction,
  onCompleteAction,
  sessionPreparing,
  coachInsight,
  onOpenCoach,
  onRegenerateCoach,
  aiConfigured,
  missedWordIds,
  relatedBankNames,
  wordMastered,
  progressByWordId,
  disableMonsterSpeech,
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
  const timerPercent = (remainingMs / resolveModeTimeLimit(mode, timeScale)) * 100;
  const autoAdvancePercent = (autoAdvanceRemainingMs / AUTO_ADVANCE_DELAY_MS) * 100;
  const isBossBattle = enemyKind === 'boss';
  const introducedCount = Math.max(0, levelWordCount - levelNewCount);
  const remainingBatchCount = Math.ceil(levelNewCount / DEFAULT_NEW_WORD_LIMIT);
  const currentWordProgress = currentWord ? progressByWordId[currentWord.id] : undefined;
  const revealedWordIds = getRevealedChainWordIds(session);
  const rarityIndex = useMemo(() => buildRarityIndex(entries), [entries]);
  const questionDraftRef = useRef<SessionAnswer | null>(null);
  const submittedQuestionRef = useRef<string | null>(null);
  const reviewSurfaceOpenRef = useRef(new Set<'choice' | 'coach'>());
  const reviewSurfacePauseOwnedRef = useRef(false);
  const autoAdvancePausedRef = useRef(autoAdvancePaused);
  const previousAutoAdvancePausedRef = useRef(autoAdvancePaused);
  autoAdvancePausedRef.current = autoAdvancePaused;
  const questionKey = `${session.startedAt}:${session.index}:${currentWord?.id ?? ''}`;
  // Spacebar toggles auto advance while reviewing unless a control owns the keypress.
  useEffect(() => {
    if (session.phase !== 'answered') return;
    function handleKey(event: KeyboardEvent) {
      if (event.code !== 'Space' && event.key !== ' ') return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT'
        || tag === 'TEXTAREA'
        || tag === 'BUTTON'
        || tag === 'SELECT'
        || target?.isContentEditable
      ) return;
      event.preventDefault();
      onToggleAutoAdvance();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [session.phase, onToggleAutoAdvance]);

  useEffect(() => {
    questionDraftRef.current = null;
    submittedQuestionRef.current = null;
    reviewSurfaceOpenRef.current.clear();
    reviewSurfacePauseOwnedRef.current = false;
  }, [questionKey]);

  useEffect(() => {
    if (
      reviewSurfaceOpenRef.current.size > 0
      && reviewSurfacePauseOwnedRef.current
      && previousAutoAdvancePausedRef.current
      && !autoAdvancePaused
    ) {
      reviewSurfacePauseOwnedRef.current = false;
    }
    previousAutoAdvancePausedRef.current = autoAdvancePaused;
  }, [autoAdvancePaused]);

  const handleReviewSurfaceChange = useCallback((
    surface: 'choice' | 'coach',
    open: boolean,
  ) => {
    const wasEmpty = reviewSurfaceOpenRef.current.size === 0;
    if (open) reviewSurfaceOpenRef.current.add(surface);
    else reviewSurfaceOpenRef.current.delete(surface);
    if (open) {
      if (wasEmpty && !autoAdvancePausedRef.current) {
        reviewSurfacePauseOwnedRef.current = true;
        onSetAutoAdvancePaused(true);
      }
      return;
    }
    if (reviewSurfaceOpenRef.current.size === 0 && reviewSurfacePauseOwnedRef.current) {
      reviewSurfacePauseOwnedRef.current = false;
      onSetAutoAdvancePaused(false);
    }
  }, [onSetAutoAdvancePaused]);

  const handleChoiceInspectionChange = useCallback((inspecting: boolean) => {
    handleReviewSurfaceChange('choice', inspecting);
  }, [handleReviewSurfaceChange]);

  const handleCoachOpenChange = useCallback((open: boolean) => {
    handleReviewSurfaceChange('coach', open);
  }, [handleReviewSurfaceChange]);

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
      stage: item.stage,
      progress: progressByWordId[item.word.id],
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
    // ListeningQuestion suppresses its own autoplay on the first item; the
    // selection-based audio modes autoplay when they mount after this change.
    const speaksOnStart = currentItem?.mode === 'listening';
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
    const lostBattle = combatState.phase === 'defeat';
    const bossRequiredCorrect = combatState.requiredCorrectAnswers
      || bossPassingScore(resolvedAnswers || BOSS_QUESTION_COUNT);
    const canContinue = lostBattle || isBossBattle || levelNewCount > 0 || levelDueCount > 0;
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
          <p className="eyebrow">第 {levelNumber} 关 · {isBossBattle ? 'Boss 综合考核' : '本次挑战完成'}</p>
          <h1 id="complete-heading">{session.correctCount} / {resolvedAnswers}</h1>
          <p>{isBossBattle
            ? `已作答 ${resolvedAnswers} 题 · 本次正确率 ${score}% · ${combatState.phase === 'victory' ? '三阶段已完成' : `未达到 ${bossRequiredCorrect} / ${resolvedAnswers} 及格线`}`
            : `已作答 ${resolvedAnswers} 题 · 本次正确率 ${score}% · 稳定掌握 ${levelProgressPercentage}%`}</p>
          <p className="review-schedule-summary">
            {isBossBattle
              ? combatState.phase === 'victory'
                ? `Boss ${BOSS_QUESTION_COUNT} 题考核已通过，本关不引入新词。`
                : `本场答对 ${session.correctCount} / ${resolvedAnswers} 题，至少答对 ${bossRequiredCorrect} 题才通过；所有学习记录均已保留。`
              : lostBattle && levelNewCount === 0
                ? `本关 ${levelWordCount} 个词已全部引入；本场未通过，将用薄弱词重新进行通关复核。`
              : levelNewCount > 0
              ? `本关已引入 ${introducedCount} / ${levelWordCount} 词；还剩 ${levelNewCount} 个新词，预计 ${remainingBatchCount} 批。`
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
            <div>
              <span>{isBossBattle ? '考核结果' : '本轮结果'}</span>
              <strong>{isBossBattle
                ? combatState.phase === 'victory' ? '通过' : '未通过'
                : combatState.phase === 'victory' ? '本批完成' : '未完成'}</strong>
            </div>
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
                <>{isBossBattle
                  ? '重新挑战 Boss'
                  : lostBattle && levelNewCount === 0
                    ? '重新挑战通关'
                    : `继续本关 · 最多 ${Math.min(DEFAULT_NEW_WORD_LIMIT, levelNewCount)} 新词`} <ArrowRight aria-hidden="true" /></>
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
  const bossStage = BOSS_STAGES[currentItem.chainIndex];
  const reviewAnswer = session.phase === 'answered' ? session.answer : null;
  const reviewed = Boolean(reviewAnswer);
  const concealMonsterWords = session.phase === 'asking' && (
    mode === 'listening' || mode === 'listen-meaning' || mode === 'listen-word'
  );

  if (session.phase === 'preview') {
    return (
      <main className="practice-page page-width">
        <BattleScene
          state={combatState}
          levelNumber={levelNumber}
          enemyKind={enemyKind}
          headerTitle={isBossBattle
            ? `Boss · 第 ${currentItem.chainIndex + 1} / ${totalChains} 阶段 · ${bossStage?.name ?? ''}`
            : `记忆串联 · 第 ${currentItem.chainIndex + 1} / ${totalChains} 组`}
          onExit={onExit}
          preview
          roster={isBossBattle ? undefined : roster}
          passage={passageNode}
          onSpeak={onSpeak}
          disableMonsterSpeech={disableMonsterSpeech}
          boostCount={boostCount}
        >
          <div className="battle-start-panel">
            {isBossBattle ? (
              <div className="boss-stage-brief">
                <strong>{bossStage?.name ?? 'Boss'}阶段 · {currentChainItems.length} 题</strong>
                <span>{bossStage?.goal}</span>
                <small>全场固定 {session.queue.length} 题，完成第三阶段即结束。</small>
              </div>
            ) : (
              <div className="level-batch-brief">
                <strong>本关已引入 {introducedCount} / {levelWordCount} 词</strong>
                {levelNewCount > 0 ? (
                  <>
                    <span>本轮最多加入 {Math.min(DEFAULT_NEW_WORD_LIMIT, levelNewCount)} 个新词；开战后不会重复已学词。</span>
                    <small>当前还剩 {levelNewCount} 个新词，预计 {remainingBatchCount} 批完成本关。</small>
                  </>
                ) : (
                  <>
                    <span>本轮复核 {session.queue.length} 个薄弱词，不新增词。</span>
                    <small>赢下本场即可解锁下一关。</small>
                  </>
                )}
              </div>
            )}
            {!isBossBattle && (
              <p className="question-kicker">
                本组 {currentChainItems.length} 只词怪已就位，{disableMonsterSpeech ? '蒙面生效 · 怪物不可点读' : '点击怪物可听发音'}
              </p>
            )}
            <button type="button" className="primary-button" onClick={handleStartChain}>
              {isBossBattle ? `开始${bossStage?.name ?? '挑战'}阶段` : '开始挑战'} <ArrowRight aria-hidden="true" />
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
        headerTitle={isBossBattle
          ? `Boss · ${bossStage?.name ?? ''} · ${modeName}`
          : `${modeName} · ${STAGE_LABELS[currentItem.stage]}`}
        onExit={onExit}
        roster={isBossBattle ? undefined : roster}
        passage={hidePassageDuringQuestions ? undefined : passageNode}
        onSpeak={onSpeak}
        disableMonsterSpeech={disableMonsterSpeech}
        concealMonsterWords={concealMonsterWords}
        boostCount={boostCount}
        rosterFocusWordId={currentWord.id}
        autoAdvanceEnabled={autoAdvanceEnabled}
        onToggleAutoAdvance={onToggleAutoAdvance}
      >
        <section className="question-card" aria-live="polite">
        {session.phase === 'asking' && (
          <>
            <div className="timer-row">
              <span>{isBossBattle ? `Boss ${session.index + 1} / ${session.queue.length} · ${bossStage?.name}` : '本题剩余'}</span>
              <strong>{Math.ceil(remainingMs / 1000)} 秒</strong>
            </div>
            <div className="timer-track">
              <span style={{ width: `${timerPercent}%` }} />
            </div>
          </>
        )}

        {(session.phase === 'asking' || session.phase === 'answered') && (
          <div
            key={questionKey}
            className={reviewAnswer ? 'question-review-shell' : undefined}
          >
            {reviewAnswer && (
              <InlineQuestionReview
                word={currentWord}
                isLastQuestion={session.index + 1 >= session.queue.length}
                autoAdvancePercent={autoAdvancePercent}
                autoAdvanceEnabled={autoAdvanceEnabled}
                onCoachOpenChange={handleCoachOpenChange}
                onNext={onNext}
                aiConfigured={aiConfigured}
                coachInsight={coachInsight}
                onOpenCoach={onOpenCoach}
                onRegenerateCoach={onRegenerateCoach}
                relatedBankNames={relatedBankNames}
                wordMastered={wordMastered}
                wordProgress={currentWordProgress}
                speechSupported={speechSupported}
                speechSpeaking={speechSpeaking}
                onSpeak={onSpeak}
              />
            )}
            <div className="review-question-content">
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
                wordProgress={currentWordProgress}
                onReviewInspectionChange={handleChoiceInspectionChange}
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
                wordProgress={currentWordProgress}
                onReviewInspectionChange={handleChoiceInspectionChange}
              />
            )}
            {mode === 'listen-meaning' && (
              <MatchMeaningQuestion
                word={currentWord}
                entries={entries}
                isSpeechSupported={speechSupported}
                isSpeaking={speechSpeaking}
                onSpeak={onSpeak}
                onOpenSettings={onOpenSpeechSettings}
                onSubmit={handleQuestionSubmit}
                onDraftChange={handleDraftChange}
                hideAnswerCount={hideAnswerCount}
                extraOptionCount={extraOptionCount}
                preferSimilarDistractors={preferSimilarDistractors}
                reviewed={reviewed}
                onReviewInspectionChange={handleChoiceInspectionChange}
                audioOnly
                speechError={speechError}
                voiceName={speechVoiceName}
              />
            )}
            {mode === 'match-word' && (
              <MatchWordQuestion
                word={currentWord}
                entries={entries}
                extraOptionCount={extraOptionCount}
                preferSimilarDistractors={preferSimilarDistractors}
                reviewed={reviewed}
                onReviewInspectionChange={handleChoiceInspectionChange}
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
                onReviewInspectionChange={handleChoiceInspectionChange}
                onSpeak={onSpeak}
                onOpenSettings={onOpenSpeechSettings}
                onSubmit={handleQuestionSubmit}
              />
            )}
            </div>
          </div>
        )}
        </section>
      </BattleScene>
    </main>
  );
}
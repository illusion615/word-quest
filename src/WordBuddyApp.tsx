import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp, Moon, Sparkles, Sun, Trophy, Volume2 } from './icons';
import logo from './assets/logo2.webp';
import { AchievementDialog } from './components/AchievementDialog';
import { AchievementToast } from './components/AchievementToast';
import { AiSettingsDialog } from './components/AiSettingsDialog';
import { BattleRecord } from './components/BattleRecord';
import { Dashboard } from './components/Dashboard';
import { PracticeSession } from './components/PracticeSession';
import { ChallengePrep } from './components/ChallengePrep';
import { HelpCenterDialog } from './components/HelpCenterDialog';
import { SpeechSettingsDialog } from './components/SpeechSettingsDialog';
import { WORD_BANKS } from './data/bankRepository';
import { loadStaticWordExplanation } from './data/wordCoachRepository';
import {
  DEFAULT_CHAIN_COUNT,
  buildClearanceReview,
  buildChainBlueprints,
  buildOfflineChain,
  getChainItems,
  materializeChain,
} from './domain/adaptive';
import { isWordMastered } from './domain/coverage';
import {
  buildBankJourney,
  getBossLevelEntries,
  getJourneyLevelEntries,
  resolveLevelCompletionAction,
} from './domain/journey';
import { getClearedLevelNumberSet, getLatestChallengeAt } from './domain/gameProgress';
import type {
  AdaptiveStudyItem,
  BankId,
  WordCoachInsight,
  WordEntry,
} from './domain/models';
import type { ChallengeDifficulty } from './domain/progress';
import {
  applyBoost,
  boostCount,
  boostEffects,
  boostName,
  drawBoostOffers,
  dropRandomBoost,
  sanitizeActiveBoosts,
  type ActiveBoosts,
  type BoostDef,
  type BoostId,
} from './domain/challengeBoosts';
import { bossPassingScore, buildBossAssessmentPlan } from './domain/boss';
import { useAiConnection } from './hooks/useAiConnection';
import { useAchievements } from './hooks/useAchievements';
import { useBankCoverage } from './hooks/useBankCoverage';
import { useBankWordIds } from './hooks/useBankWordIds';
import { useCombat } from './hooks/useCombat';
import { useGameProgress } from './hooks/useGameProgress';
import { useGameSession } from './hooks/useGameSession';
import { useHelpCenter } from './hooks/useHelpCenter';
import { useLearningProgress } from './hooks/useLearningProgress';
import { useSpeech } from './hooks/useSpeech';
import { useWordBank } from './hooks/useWordBank';
import type { AiConnectionConfig } from './services/aiClient';

type Theme = 'light' | 'dark';

const THEME_KEY = 'wordbuddy.theme.v1';
const THEME_COLORS: Record<Theme, string> = {
  light: '#fdefd6',
  dark: '#171531',
};

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'only light';
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme]);
  document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
    ?.setAttribute('content', theme === 'dark' ? 'dark' : 'only light');
  document.querySelector<HTMLMetaElement>('meta[name="supported-color-schemes"]')
    ?.setAttribute('content', theme === 'dark' ? 'dark' : 'light');
}

const DIFFICULTY_KEY = 'wordbuddy.challenge.difficulty.v1';
const BOOSTS_KEY = 'wordbuddy.challenge.boosts.v1';
const SELECTED_BANK_KEY = 'wordbuddy.selected-bank.v1';
const DEFAULT_BANK: BankId = 'gaokao';

function loadSelectedBank(): BankId {
  if (typeof window === 'undefined') return DEFAULT_BANK;
  try {
    const storedBank = window.localStorage.getItem(SELECTED_BANK_KEY);
    return WORD_BANKS.some((bank) => bank.id === storedBank)
      ? storedBank as BankId
      : DEFAULT_BANK;
  } catch {
    return DEFAULT_BANK;
  }
}

function persistSelectedBank(bankId: BankId): void {
  try {
    window.localStorage.setItem(SELECTED_BANK_KEY, bankId);
  } catch {
    // Storage may be unavailable; the in-memory selection still applies this session.
  }
}

function loadDifficulty(): ChallengeDifficulty {
  if (typeof window === 'undefined') return 'standard';
  const raw = window.localStorage.getItem(DIFFICULTY_KEY);
  return raw === 'relaxed' || raw === 'hardcore' ? raw : 'standard';
}

function loadBoosts(): ActiveBoosts {
  if (typeof window === 'undefined') return {};
  try {
    return sanitizeActiveBoosts(JSON.parse(window.localStorage.getItem(BOOSTS_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

function persistBoosts(next: ActiveBoosts): void {
  try {
    window.localStorage.setItem(BOOSTS_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable; the in-memory boosts still apply this session.
  }
}

export default function WordBuddyApp() {
  const [selectedBank, setSelectedBank] = useState<BankId>(loadSelectedBank);
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>(loadDifficulty);
  const [activeBoosts, setActiveBoosts] = useState<ActiveBoosts>(loadBoosts);
  const [boostOffers, setBoostOffers] = useState<BoostDef[]>([]);
  const [droppedBoostName, setDroppedBoostName] = useState<string | null>(null);
  const [pendingBoostPenalty, setPendingBoostPenalty] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [speechSettingsOpen, setSpeechSettingsOpen] = useState(false);
  const [sessionPreparing, setSessionPreparing] = useState(false);
  const [journeyNow, setJourneyNow] = useState(() => new Date());
  const [pendingAiWord, setPendingAiWord] = useState<WordEntry | null>(null);
  const [coachInsight, setCoachInsight] = useState<WordCoachInsight | null>(null);
  const preparationIdRef = useRef(0);
  const challengeLevelIndexRef = useRef<number | null>(null);
  const clearCoachInsight = useCallback(() => setCoachInsight(null), []);
  const {
    learningState,
    stats,
    grind,
    addAnswer,
    hydrated: progressHydrated,
  } = useLearningProgress();
  const {
    coverage,
    loading: coverageLoading,
    error: coverageError,
    retry: retryCoverage,
    getMemberships,
  } = useBankCoverage(learningState, progressHydrated);
  const {
    config: aiConfig,
    isConfigured: aiConfigured,
    saveConfig: saveAiConfig,
    testConnection,
    requestExplanation,
    requestChainReading,
  } = useAiConnection();
  const speech = useSpeech();
  const combat = useCombat();
  const gameProgress = useGameProgress();
  const helpCenter = useHelpCenter(progressHydrated, stats.learned === 0);
  const achievementSnapshot = {
    gameProgress: gameProgress.progress,
    learningStats: stats,
    activeBoosts,
  };
  const achievements = useAchievements(
    achievementSnapshot,
    progressHydrated && gameProgress.hydrated,
  );
  const recordBattle = gameProgress.recordBattle;
  const finishCombat = combat.finishCombat;
  const boostFx = boostEffects(activeBoosts);
  const {
    session,
    currentItem,
    currentWord,
    remainingMs,
    autoAdvanceRemainingMs,
    autoAdvanceEnabled,
    autoAdvancePaused,
    startSession,
    startChain,
    submitAnswer,
    nextQuestion,
    pauseAutoAdvance,
    toggleAutoAdvance,
    setAutoAdvancePause,
    stopSession,
    missedWordIds,
  } = useGameSession(
    addAnswer,
    clearCoachInsight,
    combat.resolveAnswer,
    speech.isPlaybackAvailable,
    boostFx.timeScale,
  );
  const sessionActive = session !== null;
  const previousSessionActive = useRef(sessionActive);

  useEffect(() => {
    if (session?.phase === 'complete' && combat.state.phase === 'fighting') {
      finishCombat();
    }
  }, [combat.state.phase, finishCombat, session?.phase]);

  // Answering anything wrong this level arms a penalty that removes one random
  // boost the next time the player prepares for battle.
  useEffect(() => {
    if (session?.phase === 'complete' && missedWordIds.size > 0) {
      setPendingBoostPenalty(true);
    }
  }, [session?.phase, missedWordIds]);

  useLayoutEffect(() => {
    if (previousSessionActive.current === sessionActive) return;
    previousSessionActive.current = sessionActive;
    window.scrollTo(0, 0);
  }, [sessionActive]);

  useEffect(() => {
    const refreshJourneyTime = () => setJourneyNow(new Date());
    const handleVisibilityChange = () => {
      if (!document.hidden) refreshJourneyTime();
    };
    const interval = window.setInterval(refreshJourneyTime, 60_000);
    window.addEventListener('focus', refreshJourneyTime);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshJourneyTime);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const {
    ids: selectedBankWordIds,
    loading: journeyIndexLoading,
    error: journeyIndexError,
    progress: journeyIndexProgress,
    retry: retryJourneyIndex,
  } = useBankWordIds(selectedBank);
  const {
    entries: selectedEntries,
    loading: bankLoading,
    error: bankError,
    retry: retryBank,
  } = useWordBank(selectedBank, !journeyIndexLoading);
  const currentWordBankNames = currentWord
    ? getMemberships(currentWord.id)
        .map((bankId) => WORD_BANKS.find((bank) => bank.id === bankId)?.name)
        .filter((name): name is string => Boolean(name))
    : [];
  const selectedBankManifest = WORD_BANKS.find((bank) => bank.id === selectedBank) ?? WORD_BANKS[0];
  const clearedLevelsForBank = useMemo(
    () => getClearedLevelNumberSet(gameProgress.progress, selectedBank),
    [gameProgress.progress, selectedBank],
  );
  const lightweightJourneyWords = useMemo(
    () => selectedBankWordIds.map((id) => ({ id })),
    [selectedBankWordIds],
  );
  const journeyWords = lightweightJourneyWords.length > 0
    ? lightweightJourneyWords
    : selectedEntries;
  const selectedJourney = useMemo(
    () => buildBankJourney(
      journeyWords,
      learningState,
      selectedBank,
      clearedLevelsForBank,
      journeyNow,
    ),
    [clearedLevelsForBank, journeyNow, journeyWords, learningState, selectedBank],
  );
  const latestChallengeAt = useMemo(
    () => getLatestChallengeAt(gameProgress.progress, selectedBank),
    [gameProgress.progress, selectedBank],
  );
  const journeyLoading = journeyIndexLoading || (
    lightweightJourneyWords.length === 0 && bankLoading
  );
  const journeyError = lightweightJourneyWords.length === 0
    && selectedEntries.length === 0
    && !bankLoading
    ? (bankError ?? journeyIndexError)
    : bankError;
  const retrySelectedBank = useCallback(() => {
    retryJourneyIndex();
    retryBank();
  }, [retryBank, retryJourneyIndex]);
  const challengeLevelIndex = challengeLevelIndexRef.current ?? selectedJourney.activeLevelIndex ?? 0;
  const challengeLevel = selectedJourney.chapters
    .flatMap((chapter) => chapter.levels)
    .find((level) => level.globalIndex === challengeLevelIndex);
  useEffect(() => {
    recordBattle(
      selectedBank,
      challengeLevelIndex + 1,
      combat.state,
      challengeLevel?.kind ?? 'normal',
      challengeLevel?.newCount === 0,
    );
  }, [
    challengeLevel?.kind,
    challengeLevel?.newCount,
    challengeLevelIndex,
    combat.state,
    recordBattle,
    selectedBank,
  ]);
  const completionAction = resolveLevelCompletionAction(
    challengeLevelIndex,
    selectedJourney.totalLevels,
    combat.state.phase === 'victory',
    challengeLevel?.newCount === 0,
  );
  const currentWordMastered = currentWord
    ? isWordMastered(learningState.progress[currentWord.id])
    : false;
  const currentChainItems = session && currentItem
    ? getChainItems(session.queue, currentItem.chainIndex)
    : [];

  async function beginSession(levelIndex?: number) {
    if (
      !progressHydrated
      || bankLoading
      || bankError
      || selectedEntries.length === 0
      || sessionPreparing
    ) return;
    const preparationId = preparationIdRef.current + 1;
    preparationIdRef.current = preparationId;
    setSessionPreparing(true);
    setCoachInsight(null);

    const challengeLevelIndex = levelIndex ?? challengeLevelIndexRef.current ?? 0;
    const activeLevel = selectedJourney.chapters
      .flatMap((chapter) => chapter.levels)
      .find((level) => level.globalIndex === challengeLevelIndex);
    const isBossAssessment = activeLevel?.kind === 'boss';
    const challengeEntries = isBossAssessment
      ? getBossLevelEntries(selectedEntries, learningState, challengeLevelIndex, selectedBank)
      : getJourneyLevelEntries(selectedEntries, challengeLevelIndex, selectedBank);
    challengeLevelIndexRef.current = challengeLevelIndex;

    const plan: AdaptiveStudyItem[] = isBossAssessment
      ? buildBossAssessmentPlan(
          challengeEntries,
          learningState,
          { speechPlayback: speech.isPlaybackAvailable },
        )
      : [];

    try {
      const blueprints = isBossAssessment
        ? []
        : buildChainBlueprints(
            challengeEntries,
            learningState,
            DEFAULT_CHAIN_COUNT,
            new Date(),
            selectedBank,
            difficulty,
          );
      for (const blueprint of blueprints) {
        if (preparationIdRef.current !== preparationId) return;
        if (aiConfigured) {
          try {
            const reading = await requestChainReading(blueprint, selectedBankManifest);
            const chain = materializeChain(
              blueprint,
              reading.words,
              reading.passage,
              learningState,
              { speechPlayback: speech.isPlaybackAvailable },
            );
            plan.push(...chain);
            continue;
          } catch (error) {
            const note = error instanceof Error
              ? error.message
              : 'AI 阅读段落生成失败，已切换到离线串联。';
            const chain = buildOfflineChain(
              blueprint,
              learningState,
              note,
              { speechPlayback: speech.isPlaybackAvailable },
            );
            plan.push(...chain);
            continue;
          }
        }
        const chain = buildOfflineChain(
          blueprint,
          learningState,
          'AI 尚未配置，当前显示离线目标词序。',
          { speechPlayback: speech.isPlaybackAvailable },
        );
        plan.push(...chain);
      }
      if (!isBossAssessment && plan.length === 0 && activeLevel?.newCount === 0) {
        plan.push(...buildClearanceReview(
          challengeEntries,
          learningState,
          { speechPlayback: speech.isPlaybackAvailable },
        ));
      }
    } finally {
      if (preparationIdRef.current === preparationId) setSessionPreparing(false);
    }

    if (preparationIdRef.current === preparationId && plan.length > 0) {
      let boosts = activeBoosts;
      if (pendingBoostPenalty) {
        const penalty = dropRandomBoost(activeBoosts);
        boosts = penalty.next;
        setActiveBoosts(boosts);
        persistBoosts(boosts);
        setDroppedBoostName(penalty.dropped ? boostName(penalty.dropped) : null);
      } else {
        setDroppedBoostName(null);
      }
      setPendingBoostPenalty(false);
      setBoostOffers(drawBoostOffers(boosts, 3));
      gameProgress.beginBattle();
      combat.prepareCombat(
        plan.length,
        isBossAssessment ? bossPassingScore(plan.length) : 0,
      );
      startSession(plan);
    }
  }

  function handleSelectBank(bankId: BankId) {
    challengeLevelIndexRef.current = null;
    setSelectedBank(bankId);
    persistSelectedBank(bankId);
  }

  function handleSelectDifficulty(next: ChallengeDifficulty) {
    setDifficulty(next);
    try {
      window.localStorage.setItem(DIFFICULTY_KEY, next);
    } catch {
      // Storage may be unavailable; the in-memory choice still applies this session.
    }
  }

  function handleChooseBoost(boostId: BoostId) {
    const next = applyBoost(activeBoosts, boostId);
    setActiveBoosts(next);
    persistBoosts(next);
    setDroppedBoostName(null);
    // Combat scoring keeps a neutral default tactic; difficulty now comes from boosts.
    combat.chooseSkill('steady');
  }

  function handleContinueWithBoosts() {
    setDroppedBoostName(null);
    combat.chooseSkill('steady');
  }

  function handleLevelCompleteAction() {
    if (completionAction === 'finished') {
      handleStopSession();
      return;
    }
    const nextLevelIndex = completionAction === 'next'
      ? challengeLevelIndex + 1
      : challengeLevelIndex;
    void beginSession(nextLevelIndex);
  }

  function toggleTheme() {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      // Storage may be unavailable; the in-memory choice still applies.
    }
    setTheme(nextTheme);
  }

  async function runStaticExplanation(word: WordEntry) {
    setCoachInsight({
      wordId: word.id,
      status: 'loading',
      text: '',
      senseExamples: [],
      source: 'static',
    });
    try {
      const explanation = await loadStaticWordExplanation(word);
      setCoachInsight(explanation ? {
        wordId: word.id,
        status: 'success',
        text: explanation.markdown,
        senseExamples: explanation.senseExamples,
        senseContent: explanation.senseContent,
        source: 'static',
      } : {
        wordId: word.id,
        status: 'error',
        text: '该词的预生成讲解尚未收录。',
        senseExamples: [],
        source: 'static',
      });
    } catch (error) {
      setCoachInsight({
        wordId: word.id,
        status: 'error',
        text: error instanceof Error ? error.message : '词库讲解加载失败。',
        senseExamples: [],
        source: 'static',
      });
    }
  }

  async function runAiExplanation(word: WordEntry, override?: AiConnectionConfig) {
    setCoachInsight({
      wordId: word.id,
      status: 'loading',
      text: '',
      senseExamples: [],
      source: 'ai',
    });
    try {
      const explanation = await requestExplanation(word, override);
      setCoachInsight({
        wordId: word.id,
        status: 'success',
        text: explanation.markdown,
        senseExamples: explanation.senseExamples,
        senseContent: explanation.senseContent,
        source: 'ai',
      });
    } catch (error) {
      setCoachInsight({
        wordId: word.id,
        status: 'error',
        text: error instanceof Error ? error.message : 'AI 讲解请求失败。',
        senseExamples: [],
        source: 'ai',
      });
    }
  }

  function handleOpenCoach(word: WordEntry) {
    void runStaticExplanation(word);
  }

  function handleRegenerateCoach(word: WordEntry) {
    pauseAutoAdvance();
    if (!aiConfigured) {
      setPendingAiWord(word);
      setSettingsOpen(true);
      return;
    }
    void runAiExplanation(word);
  }

  function handleSaveAi(nextConfig: AiConnectionConfig) {
    saveAiConfig(nextConfig);
    setSettingsOpen(false);
    if (pendingAiWord) {
      const word = pendingAiWord;
      setPendingAiWord(null);
      void runAiExplanation(word, nextConfig);
    }
  }

  function handleCloseAiSettings() {
    setSettingsOpen(false);
    setPendingAiWord(null);
  }

  function handleStopSession() {
    preparationIdRef.current += 1;
    setSessionPreparing(false);
    setCoachInsight(null);
    speech.stop();
    combat.resetCombat();
    stopSession();
  }

  function handleSaveVoice(voiceURI: string) {
    speech.saveVoice(voiceURI);
    setSpeechSettingsOpen(false);
  }

  return (
    <div className={`app-shell ${session ? 'is-challenge' : 'is-home'}`}>
      {!session && (
      <header className="app-header is-home">
        <div className="page-width header-inner">
          <button type="button" className="brand-button" onClick={handleStopSession} aria-label="我是卷王 · 暴打单词怪 返回首页">
            <img
              className="brand-logo"
              src={logo}
              alt="我是卷王 · 暴打单词怪"
            />
          </button>
          <BattleRecord
            banks={WORD_BANKS}
            selectedBank={selectedBank}
            coverage={coverage}
            coverageLoading={coverageLoading}
            coverageError={coverageError}
            sessionPreparing={sessionPreparing}
            todayCompleted={stats.today}
            lastChallengeAt={latestChallengeAt}
            onSelectBank={handleSelectBank}
            onRetryCoverage={retryCoverage}
          />
          <div className="header-actions">
            <label className="new-word-preference">
              <span>新词偏好</span>
              <select
                className="difficulty-select"
                value={difficulty}
                onChange={(event) => handleSelectDifficulty(event.target.value as ChallengeDifficulty)}
                aria-label="新词偏好"
                title="只影响普通关卡中的未学新词；到期复习词仍优先，战斗强度不变。"
              >
                <option value="relaxed">常见词优先</option>
                <option value="standard">按关卡顺序</option>
                <option value="hardcore">生僻词优先</option>
              </select>
            </label>
            <button
              type="button"
              className="icon-button"
              onClick={() => helpCenter.openHelp('guide')}
              aria-label="打开帮助中心"
              title="帮助中心"
            >
              <CircleHelp aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button achievement-button"
              onClick={() => setAchievementsOpen(true)}
              aria-label={`卷王成就：已达成 ${achievements.unlockedCount} 项`}
              title="卷王成就"
            >
              <Trophy aria-hidden="true" />
              {achievements.unlockedCount > 0 && (
                <span aria-hidden="true">{achievements.unlockedCount}</span>
              )}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSpeechSettingsOpen(true)}
              aria-label={`发音设置：${speech.selectedVoice?.name ?? '自动选择'}`}
              title="发音设置"
            >
              <Volume2 aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`icon-button ai-status-button ${aiConfigured ? 'is-connected' : ''}`}
              onClick={() => setSettingsOpen(true)}
              aria-label={aiConfigured ? 'AI 已连接，打开设置' : '配置 AI 连接'}
              title={aiConfigured ? 'AI 已连接' : '配置 AI'}
            >
              <Sparkles aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? '切换到深色主题' : '切换到浅色主题'}
              title={theme === 'light' ? '深色主题' : '浅色主题'}
            >
              {theme === 'light' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>
      )}

      {session && combat.state.phase === 'ready' ? (
        <ChallengePrep
          levelNumber={challengeLevelIndex + 1}
          levelKind={challengeLevel?.kind ?? 'normal'}
          activeBoosts={activeBoosts}
          offers={boostOffers}
          droppedBoostName={droppedBoostName}
          onChoose={handleChooseBoost}
          onContinue={handleContinueWithBoosts}
          onExit={handleStopSession}
          onOpenHelp={() => helpCenter.openHelp('guide')}
        />
      ) : session ? (
        <PracticeSession
          session={session}
          currentItem={currentItem}
          currentWord={currentWord}
          currentChainItems={currentChainItems}
          entries={selectedEntries}
          remainingMs={remainingMs}
          autoAdvanceRemainingMs={autoAdvanceRemainingMs}
          autoAdvanceEnabled={autoAdvanceEnabled}
          autoAdvancePaused={autoAdvancePaused}
          onSubmit={submitAnswer}
          onStartChain={startChain}
          onNext={nextQuestion}
          onToggleAutoAdvance={toggleAutoAdvance}
          onSetAutoAdvancePaused={setAutoAdvancePause}
          onExit={handleStopSession}
          levelNumber={challengeLevelIndex + 1}
          enemyKind={challengeLevel?.kind === 'boss' ? 'boss' : 'grunt'}
          combatState={combat.state}
          bestLevelResult={gameProgress.getLevelResult(selectedBank, challengeLevelIndex + 1)}
          levelProgressPercentage={challengeLevel?.progressPercentage ?? 0}
          levelWordCount={challengeLevel?.wordCount ?? 0}
          levelNewCount={challengeLevel?.newCount ?? 0}
          levelDueCount={challengeLevel?.dueCount ?? 0}
          nextReviewAt={challengeLevel?.nextReviewAt ?? null}
          completionAction={completionAction}
          onCompleteAction={handleLevelCompleteAction}
          sessionPreparing={sessionPreparing}
          coachInsight={coachInsight}
          onOpenCoach={handleOpenCoach}
          onRegenerateCoach={handleRegenerateCoach}
          aiConfigured={aiConfigured}
          missedWordIds={missedWordIds}
          relatedBankNames={currentWordBankNames}
          wordMastered={currentWordMastered}
          progressByWordId={learningState.progress}
          disableMonsterSpeech={boostFx.disableMonsterSpeech}
          hideAnswerCount={boostFx.hideAnswerCount}
          hidePassageDuringQuestions={boostFx.hidePassageDuringQuestions}
          preferSimilarDistractors={boostFx.preferSimilarDistractors}
          extraOptionCount={boostFx.extraOptionCount}
          boostCount={boostCount(activeBoosts)}
          timeScale={boostFx.timeScale}
          speechSupported={speech.isPlaybackAvailable}
          speechSpeaking={speech.isSpeaking}
          speechError={speech.error}
          speechVoiceName={speech.selectedVoice?.name ?? '自动选择'}
          onSpeak={speech.speak}
          onOpenSpeechSettings={() => setSpeechSettingsOpen(true)}
        />
      ) : (
        <Dashboard
          currentBank={selectedBankManifest}
          journey={selectedJourney}
          journeyLoading={journeyLoading}
          journeyLoadProgress={journeyIndexLoading ? journeyIndexProgress : null}
          gameProgress={gameProgress.progress}
          entries={selectedEntries}
          learningState={learningState}
          coverage={coverage}
          bankLoading={bankLoading || !progressHydrated}
          sessionPreparing={sessionPreparing}
          aiConfigured={aiConfigured}
          bankError={journeyError}
          onStartLevel={(levelIndex) => void beginSession(levelIndex)}
          onRetryBank={retrySelectedBank}
        />
      )}

      {!session && (
        <footer className="app-footer page-width">
          <span>核心学习完全在浏览器中运行</span>
          <span>进度仅保存在当前设备</span>
        </footer>
      )}

      <AiSettingsDialog
        open={settingsOpen}
        config={aiConfig}
        onClose={handleCloseAiSettings}
        onSave={handleSaveAi}
        onTest={testConnection}
      />
      <SpeechSettingsDialog
        open={speechSettingsOpen}
        isSupported={speech.isSupported}
        voices={speech.voices}
        selectedVoiceURI={speech.selectedVoiceURI}
        playbackState={speech.playbackState}
        error={speech.error}
        onClose={() => setSpeechSettingsOpen(false)}
        onPreview={speech.speak}
        onSave={handleSaveVoice}
        onStop={speech.stop}
      />
      <AchievementDialog
        open={achievementsOpen}
        state={achievements.state}
        snapshot={achievementSnapshot}
        stats={stats}
        grind={grind}
        onClose={() => setAchievementsOpen(false)}
      />
      <HelpCenterDialog
        open={helpCenter.open}
        initialSection={helpCenter.section}
        celebrate={helpCenter.celebrate}
        onClose={helpCenter.closeHelp}
        onSectionChange={helpCenter.setSection}
      />
      <AchievementToast
        achievement={achievements.currentAchievement}
        onDismiss={achievements.dismissCurrent}
      />
    </div>
  );
}
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Moon, Sparkles, Sun, Volume2 } from './icons';
import logoEnglish from './assets/logo-english.webp';
import { AiSettingsDialog } from './components/AiSettingsDialog';
import { BattleRecord } from './components/BattleRecord';
import { Dashboard } from './components/Dashboard';
import { PracticeSession } from './components/PracticeSession';
import { ChallengePrep } from './components/ChallengePrep';
import { SpeechSettingsDialog } from './components/SpeechSettingsDialog';
import { WORD_BANKS } from './data/bankRepository';
import {
  DEFAULT_CHAIN_COUNT,
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
import { getClearedLevelNumberSet } from './domain/gameProgress';
import type { AdaptiveStudyItem, BankId, WordEntry } from './domain/models';
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
import { useAiConnection } from './hooks/useAiConnection';
import { useBankCoverage } from './hooks/useBankCoverage';
import { useCombat } from './hooks/useCombat';
import { useGameProgress } from './hooks/useGameProgress';
import { useGameSession } from './hooks/useGameSession';
import { useLearningProgress } from './hooks/useLearningProgress';
import { useSpeech } from './hooks/useSpeech';
import { useWordBank } from './hooks/useWordBank';
import type { AiConnectionConfig } from './services/aiClient';

type Theme = 'light' | 'dark';

interface AiInsight {
  wordId: string;
  status: 'loading' | 'success' | 'error';
  text: string;
}

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

const DIFFICULTY_KEY = 'wordbuddy.challenge.difficulty.v1';
const BOOSTS_KEY = 'wordbuddy.challenge.boosts.v1';

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
  const [selectedBank, setSelectedBank] = useState<BankId>('gaokao');
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>(loadDifficulty);
  const [activeBoosts, setActiveBoosts] = useState<ActiveBoosts>(loadBoosts);
  const [boostOffers, setBoostOffers] = useState<BoostDef[]>([]);
  const [droppedBoostName, setDroppedBoostName] = useState<string | null>(null);
  const [pendingBoostPenalty, setPendingBoostPenalty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [speechSettingsOpen, setSpeechSettingsOpen] = useState(false);
  const [sessionPreparing, setSessionPreparing] = useState(false);
  const [pendingAiWord, setPendingAiWord] = useState<WordEntry | null>(null);
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const preparationIdRef = useRef(0);
  const challengeLevelIndexRef = useRef<number | null>(null);
  const clearAiInsight = useCallback(() => setAiInsight(null), []);
  const {
    learningState,
    stats,
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
  const recordBattle = gameProgress.recordBattle;
  const finishCombat = combat.finishCombat;
  const boostFx = boostEffects(activeBoosts);
  const {
    session,
    currentItem,
    currentWord,
    remainingMs,
    autoAdvanceRemainingMs,
    autoAdvancePaused,
    startSession,
    startChain,
    submitAnswer,
    nextQuestion,
    pauseAutoAdvance,
    toggleAutoAdvance,
    finishSession,
    stopSession,
    missedWordIds,
  } = useGameSession(
    addAnswer,
    clearAiInsight,
    combat.resolveAnswer,
    speech.isPlaybackAvailable,
    boostFx.timeScale,
  );
  const sessionActive = session !== null;
  const previousSessionActive = useRef(sessionActive);

  useEffect(() => {
    if (combat.state.phase === 'defeat' && session?.phase !== 'complete') {
      finishSession();
    }
  }, [combat.state.phase, finishSession, session?.phase]);

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

  const {
    entries: selectedEntries,
    loading: bankLoading,
    error: bankError,
    retry: retryBank,
  } = useWordBank(selectedBank);
  const currentWordBankNames = currentWord
    ? getMemberships(currentWord.id)
        .map((bankId) => WORD_BANKS.find((bank) => bank.id === bankId)?.name)
        .filter((name): name is string => Boolean(name))
    : [];
  const selectedBankManifest = WORD_BANKS.find((bank) => bank.id === selectedBank) ?? WORD_BANKS[0];
  const clearedLevelsForBank = getClearedLevelNumberSet(gameProgress.progress, selectedBank);
  const selectedJourney = buildBankJourney(
    selectedEntries,
    learningState,
    selectedBank,
    clearedLevelsForBank,
  );
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
  const currentWordProgress = currentWord
    ? learningState.progress[currentWord.id]
    : undefined;
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
    setAiInsight(null);

    const challengeLevelIndex = levelIndex ?? challengeLevelIndexRef.current ?? 0;
    const activeLevel = selectedJourney.chapters
      .flatMap((chapter) => chapter.levels)
      .find((level) => level.globalIndex === challengeLevelIndex);
    const challengeEntries = activeLevel?.kind === 'boss'
      ? getBossLevelEntries(selectedEntries, learningState, challengeLevelIndex, selectedBank)
      : getJourneyLevelEntries(selectedEntries, challengeLevelIndex, selectedBank);
    challengeLevelIndexRef.current = challengeLevelIndex;

    const blueprints = buildChainBlueprints(
      challengeEntries,
      learningState,
      DEFAULT_CHAIN_COUNT,
      new Date(),
      selectedBank,
      difficulty,
    );
    const plan: AdaptiveStudyItem[] = [];

    try {
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
            )
              .map((item) => activeLevel?.kind === 'boss'
                ? { ...item, mode: 'boss' as const }
                : item);
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
            )
              .map((item) => activeLevel?.kind === 'boss'
                ? { ...item, mode: 'boss' as const }
                : item);
            plan.push(...chain);
            continue;
          }
        }
        const chain = buildOfflineChain(
          blueprint,
          learningState,
          'AI 尚未配置，当前显示离线目标词序。',
          { speechPlayback: speech.isPlaybackAvailable },
        ).map((item) => activeLevel?.kind === 'boss'
          ? { ...item, mode: 'boss' as const }
          : item);
        plan.push(...chain);
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
      combat.prepareCombat(plan.length);
      startSession(plan);
    }
  }

  function handleSelectBank(bankId: BankId) {
    challengeLevelIndexRef.current = null;
    setSelectedBank(bankId);
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
    document.documentElement.setAttribute('data-theme', nextTheme);
    setTheme(nextTheme);
  }

  async function runAiExplanation(word: WordEntry, override?: AiConnectionConfig) {
    setAiInsight({ wordId: word.id, status: 'loading', text: '' });
    try {
      const text = await requestExplanation(word, override);
      setAiInsight({ wordId: word.id, status: 'success', text });
    } catch (error) {
      setAiInsight({
        wordId: word.id,
        status: 'error',
        text: error instanceof Error ? error.message : 'AI 讲解请求失败。',
      });
    }
  }

  function handleAiRequest(word: WordEntry) {
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
    setAiInsight(null);
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
          <button type="button" className="brand-button" onClick={handleStopSession} aria-label="图图是卷王 · 暴打单词怪 返回首页">
            <img
              className="brand-logo"
              src={logoEnglish}
              alt="图图是卷王 · 暴打单词怪"
            />
          </button>
          <BattleRecord
            banks={WORD_BANKS}
            selectedBank={selectedBank}
            stats={stats}
            coverage={coverage}
            coverageLoading={coverageLoading}
            coverageError={coverageError}
            sessionPreparing={sessionPreparing}
            onSelectBank={handleSelectBank}
            onRetryCoverage={retryCoverage}
          />
          <div className="header-actions">
            <select
              className="difficulty-select"
              value={difficulty}
              onChange={(event) => handleSelectDifficulty(event.target.value as ChallengeDifficulty)}
              aria-label="挑战度（新词生ԏ度）"
              title="挑战度：控制新词的生ԏ难度"
            >
              <option value="relaxed">轻松</option>
              <option value="standard">标准</option>
              <option value="hardcore">硬核</option>
            </select>
            <span className="today-count">今日 {stats.today} 题</span>
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
          activeBoosts={activeBoosts}
          offers={boostOffers}
          droppedBoostName={droppedBoostName}
          onChoose={handleChooseBoost}
          onExit={handleStopSession}
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
          autoAdvancePaused={autoAdvancePaused}
          onSubmit={submitAnswer}
          onStartChain={startChain}
          onNext={nextQuestion}
          onToggleAutoAdvance={toggleAutoAdvance}
          onExit={handleStopSession}
          levelNumber={challengeLevelIndex + 1}
          enemyKind={challengeLevel?.kind === 'boss' ? 'boss' : 'grunt'}
          combatState={combat.state}
          bestLevelResult={gameProgress.getLevelResult(selectedBank, challengeLevelIndex + 1)}
          levelProgressPercentage={challengeLevel?.progressPercentage ?? 0}
          levelNewCount={challengeLevel?.newCount ?? 0}
          levelDueCount={challengeLevel?.dueCount ?? 0}
          nextReviewAt={challengeLevel?.nextReviewAt ?? null}
          completionAction={completionAction}
          onCompleteAction={handleLevelCompleteAction}
          sessionPreparing={sessionPreparing}
          aiInsight={aiInsight}
          onAskAi={handleAiRequest}
          aiConfigured={aiConfigured}
          missedWordIds={missedWordIds}
          relatedBankNames={currentWordBankNames}
          wordMastered={currentWordMastered}
          wordProgress={currentWordProgress}
          hideMonsterWord={boostFx.hideMonsterWord}
          hideAnswerCount={boostFx.hideAnswerCount}
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
          entries={selectedEntries}
          learningState={learningState}
          gameProgress={gameProgress.progress}
          coverage={coverage}
          bankLoading={bankLoading || !progressHydrated}
          sessionPreparing={sessionPreparing}
          aiConfigured={aiConfigured}
          bankError={bankError}
          onStartLevel={(levelIndex) => void beginSession(levelIndex)}
          onRetryBank={retryBank}
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
    </div>
  );
}
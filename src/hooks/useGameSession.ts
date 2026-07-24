import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AdaptiveStudyItem,
  AnswerRecord,
  GameMode,
  GameSessionState,
  SessionAnswer,
  WordEntry,
} from '../domain/models';
import {
  AUTO_ADVANCE_DELAY_MS,
  advanceSession,
  answerCurrentQuestion,
  completeSessionEarly,
  createGameSession,
  replaceUnavailableListening,
  resolveModeTimeLimit,
  startChainGroup,
  type ResolvedAnswerEvent,
} from '../domain/session';

function correctAnswerFor(mode: GameMode, word: WordEntry): string {
  return mode === 'choice' || mode === 'match-meaning' || mode === 'listen-meaning'
    ? word.definitionZh
    : word.word;
}

export function useGameSession(
  onRecord: (record: AnswerRecord) => void,
  onAdvance: () => void,
  onAnswerResolved?: (event: ResolvedAnswerEvent) => void,
  speechPlaybackAvailable = true,
  timeScale = 1,
) {
  const [session, setSession] = useState<GameSessionState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [autoAdvanceRemainingMs, setAutoAdvanceRemainingMs] = useState(AUTO_ADVANCE_DELAY_MS);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true);
  const [autoAdvancePaused, setAutoAdvancePaused] = useState(false);
  const [assessmentWordIds, setAssessmentWordIds] = useState<Set<string>>(() => new Set());
  const submittedQuestionRef = useRef<string | null>(null);

  // Runtime capabilities are applied at serve time as well as persisted into the
  // queue so a voice failure cannot expose even one render of an unusable task.
  const applyRuntimeOverrides = useCallback(
    (item: AdaptiveStudyItem | null): AdaptiveStudyItem | null => {
      if (!item) return null;
      if (assessmentWordIds.has(item.word.id)) {
        return { ...item, mode: 'boss', stage: 'recall' };
      }
      if (!speechPlaybackAvailable && item.mode === 'listening') {
        return { ...item, mode: 'boss' };
      }
      if (!speechPlaybackAvailable && item.mode === 'listen-meaning') {
        return { ...item, mode: 'match-meaning' };
      }
      if (!speechPlaybackAvailable && item.mode === 'listen-word') {
        return { ...item, mode: 'match-word' };
      }
      return item;
    },
    [assessmentWordIds, speechPlaybackAvailable],
  );

  const startSession = useCallback((queue: AdaptiveStudyItem[]) => {
    const startedAt = Date.now();
    setNow(startedAt);
    setAutoAdvanceRemainingMs(AUTO_ADVANCE_DELAY_MS);
    setAutoAdvancePaused(false);
    setAssessmentWordIds(new Set());
    submittedQuestionRef.current = null;
    const nextSession = createGameSession(queue, startedAt);
    setSession(speechPlaybackAvailable
      ? nextSession
      : replaceUnavailableListening(nextSession, startedAt, timeScale));
  }, [speechPlaybackAvailable, timeScale]);

  useEffect(() => {
    if (speechPlaybackAvailable) return;
    const timestamp = Date.now();
    setNow(timestamp);
    setSession((current) => current
      ? replaceUnavailableListening(current, timestamp, timeScale)
      : current);
  }, [speechPlaybackAvailable, timeScale]);

  const startChain = useCallback(() => {
    const startedAt = Date.now();
    setNow(startedAt);
    setSession((current) => current ? startChainGroup(current, startedAt, timeScale) : current);
  }, [timeScale]);

  const submitAnswer = useCallback((
    correct: boolean,
    response: string,
    correctAnswer?: string,
    choiceFeedback?: SessionAnswer['choiceFeedback'],
  ) => {
    if (!session || session.phase !== 'asking') return;
    const questionKey = `${session.startedAt}:${session.index}:${session.questionStartedAt}`;
    if (submittedQuestionRef.current === questionKey) return;
    submittedQuestionRef.current = questionKey;
    const item = applyRuntimeOverrides(session.queue[session.index] ?? null);
    if (!item) {
      submittedQuestionRef.current = null;
      return;
    }
    const { word, mode } = item;

    const answeredAt = Date.now();
    const responseTimeMs = Math.max(0, answeredAt - session.questionStartedAt);
    const timeLimitMs = resolveModeTimeLimit(mode, timeScale);
    onRecord({
      wordId: word.id,
      mode,
      correct,
      answeredAt: new Date(answeredAt).toISOString(),
      responseTimeMs,
      timeLimitMs,
      usedHint: false,
    });
    onAnswerResolved?.({
      correct,
      responseTimeMs,
      timeLimitMs,
      mode,
    });
    setSession(answerCurrentQuestion(session, {
      correct,
      response,
      correctAnswer: correctAnswer ?? correctAnswerFor(mode, word),
      ...(choiceFeedback ? { choiceFeedback } : {}),
    }));
    setAutoAdvanceRemainingMs(AUTO_ADVANCE_DELAY_MS);
    setAutoAdvancePaused(false);
  }, [applyRuntimeOverrides, onAnswerResolved, onRecord, session, timeScale]);

  const nextQuestion = useCallback(() => {
    onAdvance();
    setSession((current) => current ? advanceSession(current, Date.now(), timeScale) : current);
    setNow(Date.now());
    setAutoAdvanceRemainingMs(AUTO_ADVANCE_DELAY_MS);
    setAutoAdvancePaused(false);
  }, [onAdvance, timeScale]);

  useEffect(() => {
    if (!session || session.phase !== 'asking') return undefined;

    const interval = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (timestamp >= session.deadline) {
        window.clearInterval(interval);
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (!session || session.phase !== 'answered' || !autoAdvanceEnabled || autoAdvancePaused) {
      return undefined;
    }

    const deadline = Date.now() + autoAdvanceRemainingMs;
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now());
      setAutoAdvanceRemainingMs(remaining);
      if (remaining === 0) {
        window.clearInterval(interval);
        nextQuestion();
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [autoAdvanceEnabled, autoAdvancePaused, nextQuestion, session?.index, session?.phase]);

  const pauseAutoAdvance = useCallback(() => {
    setAutoAdvancePaused(true);
  }, []);

  const toggleAutoAdvance = useCallback(() => {
    setAutoAdvanceEnabled((enabled) => !enabled);
  }, []);

  const setAutoAdvancePause = useCallback((paused: boolean) => {
    setAutoAdvancePaused(paused);
  }, []);

  const toggleWordAssessment = useCallback((wordId: string) => {
    setAssessmentWordIds((current) => {
      const next = new Set(current);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
      return next;
    });
  }, []);

  const finishSession = useCallback(() => {
    setSession((current) => current ? completeSessionEarly(current) : current);
    setAutoAdvancePaused(true);
  }, []);

  const stopSession = useCallback(() => {
    setSession(null);
    setAutoAdvanceRemainingMs(AUTO_ADVANCE_DELAY_MS);
    setAutoAdvancePaused(false);
    setAssessmentWordIds(new Set());
    submittedQuestionRef.current = null;
  }, []);

  const currentItem = applyRuntimeOverrides(session?.queue[session.index] ?? null);
  const currentWord = currentItem?.word ?? null;
  const missedWordIds = useMemo(
    () => new Set(
      (session?.results ?? [])
        .filter((result) => !result.answer.correct)
        .map((result) => result.word.id),
    ),
    [session?.results],
  );
  const remainingMs = session?.phase === 'asking'
    ? Math.max(0, session.deadline - now)
    : 0;

  return {
    session,
    currentItem,
    currentWord,
    remainingMs,
    autoAdvanceRemainingMs,
    autoAdvanceEnabled,
    autoAdvancePaused,
    assessmentWordIds,
    missedWordIds,
    startSession,
    startChain,
    submitAnswer,
    nextQuestion,
    pauseAutoAdvance,
    toggleAutoAdvance,
    setAutoAdvancePause,
    toggleWordAssessment,
    finishSession,
    stopSession,
  };
}
import { useCallback, useEffect, useState } from 'react';
import type {
  AdaptiveStudyItem,
  AnswerRecord,
  GameMode,
  GameSessionState,
  WordEntry,
} from '../domain/models';
import {
  AUTO_ADVANCE_DELAY_MS,
  MODE_TIME_LIMITS,
  advanceSession,
  answerCurrentQuestion,
  completeSessionEarly,
  createGameSession,
  replaceUnavailableListening,
  startChainGroup,
  type ResolvedAnswerEvent,
} from '../domain/session';

function correctAnswerFor(mode: GameMode, word: WordEntry): string {
  return mode === 'choice' ? word.definitionZh : word.word;
}

export function useGameSession(
  onRecord: (record: AnswerRecord) => void,
  onAdvance: () => void,
  onAnswerResolved?: (event: ResolvedAnswerEvent) => void,
  speechPlaybackAvailable = true,
) {
  const [session, setSession] = useState<GameSessionState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [autoAdvanceRemainingMs, setAutoAdvanceRemainingMs] = useState(AUTO_ADVANCE_DELAY_MS);
  const [autoAdvancePaused, setAutoAdvancePaused] = useState(false);
  const [assessmentWordIds, setAssessmentWordIds] = useState<Set<string>>(() => new Set());

  // Runtime capabilities are applied at serve time as well as persisted into the
  // queue so a voice failure cannot expose even one render of an unusable task.
  const applyRuntimeOverrides = useCallback(
    (item: AdaptiveStudyItem | null): AdaptiveStudyItem | null => {
      if (!item) return null;
      if (assessmentWordIds.has(item.word.id)) {
        return { ...item, mode: 'boss', stage: 'recall' };
      }
      if (!speechPlaybackAvailable && item.mode === 'listening') {
        return { ...item, mode: 'choice' };
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
    const nextSession = createGameSession(queue, startedAt);
    setSession(speechPlaybackAvailable
      ? nextSession
      : replaceUnavailableListening(nextSession, startedAt));
  }, [speechPlaybackAvailable]);

  useEffect(() => {
    if (speechPlaybackAvailable) return;
    const timestamp = Date.now();
    setNow(timestamp);
    setSession((current) => current
      ? replaceUnavailableListening(current, timestamp)
      : current);
  }, [speechPlaybackAvailable]);

  const startChain = useCallback(() => {
    const startedAt = Date.now();
    setNow(startedAt);
    setSession((current) => current ? startChainGroup(current, startedAt) : current);
  }, []);

  const submitAnswer = useCallback((
    correct: boolean,
    response: string,
    correctAnswer?: string,
  ) => {
    if (!session || session.phase !== 'asking') return;
    const item = applyRuntimeOverrides(session.queue[session.index] ?? null);
    if (!item) return;
    const { word, mode } = item;

    const answeredAt = Date.now();
    const responseTimeMs = Math.max(0, answeredAt - session.questionStartedAt);
    onRecord({
      wordId: word.id,
      mode,
      correct,
      answeredAt: new Date(answeredAt).toISOString(),
      responseTimeMs,
      timeLimitMs: MODE_TIME_LIMITS[mode],
      usedHint: false,
    });
    onAnswerResolved?.({
      correct,
      responseTimeMs,
      timeLimitMs: MODE_TIME_LIMITS[mode],
      mode,
    });
    setSession(answerCurrentQuestion(session, {
      correct,
      response,
      correctAnswer: correctAnswer ?? correctAnswerFor(mode, word),
    }));
    setAutoAdvanceRemainingMs(AUTO_ADVANCE_DELAY_MS);
    setAutoAdvancePaused(false);
  }, [applyRuntimeOverrides, onAnswerResolved, onRecord, session]);

  const nextQuestion = useCallback(() => {
    onAdvance();
    setSession((current) => current ? advanceSession(current, Date.now()) : current);
    setNow(Date.now());
    setAutoAdvanceRemainingMs(AUTO_ADVANCE_DELAY_MS);
    setAutoAdvancePaused(false);
  }, [onAdvance]);

  useEffect(() => {
    if (!session || session.phase !== 'asking') return undefined;

    const interval = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (timestamp >= session.deadline) {
        window.clearInterval(interval);
        submitAnswer(false, '');
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [session, submitAnswer]);

  useEffect(() => {
    if (!session || session.phase !== 'answered' || autoAdvancePaused) return undefined;

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
  }, [autoAdvancePaused, nextQuestion, session?.index, session?.phase]);

  const pauseAutoAdvance = useCallback(() => {
    setAutoAdvancePaused(true);
  }, []);

  const toggleAutoAdvance = useCallback(() => {
    setAutoAdvancePaused((paused) => !paused);
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
  }, []);

  const currentItem = applyRuntimeOverrides(session?.queue[session.index] ?? null);
  const currentWord = currentItem?.word ?? null;
  const remainingMs = session?.phase === 'asking'
    ? Math.max(0, session.deadline - now)
    : 0;

  return {
    session,
    currentItem,
    currentWord,
    remainingMs,
    autoAdvanceRemainingMs,
    autoAdvancePaused,
    assessmentWordIds,
    startSession,
    startChain,
    submitAnswer,
    nextQuestion,
    pauseAutoAdvance,
    toggleAutoAdvance,
    toggleWordAssessment,
    finishSession,
    stopSession,
  };
}
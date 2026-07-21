import type {
  AdaptiveStudyItem,
  GameSessionState,
  SessionAnswer,
  WordEntry,
} from './models';
import type { GameMode } from './models';

export interface ResolvedAnswerEvent {
  correct: boolean;
  responseTimeMs: number;
  timeLimitMs: number;
  mode: GameMode;
}

export const MODE_TIME_LIMITS: Record<GameMode, number> = {
  listening: 12_000,
  choice: 15_000,
  sentence: 20_000,
  boss: 10_000,
};

export const AUTO_ADVANCE_DELAY_MS = 3_000;

export function createGameSession(
  queue: AdaptiveStudyItem[],
  now = Date.now(),
): GameSessionState {
  return {
    queue,
    index: 0,
    correctCount: 0,
    phase: queue.length > 0 ? 'preview' : 'complete',
    answer: null,
    startedAt: now,
    questionStartedAt: now,
    deadline: now,
  };
}

export function startChainGroup(
  state: GameSessionState,
  now = Date.now(),
): GameSessionState {
  if (state.phase !== 'preview') return state;
  const item = state.queue[state.index];
  if (!item) return { ...state, phase: 'complete' };
  return {
    ...state,
    phase: 'asking',
    questionStartedAt: now,
    deadline: now + MODE_TIME_LIMITS[item.mode],
  };
}

export function answerCurrentQuestion(
  state: GameSessionState,
  answer: SessionAnswer,
): GameSessionState {
  if (state.phase !== 'asking') return state;
  return {
    ...state,
    correctCount: state.correctCount + (answer.correct ? 1 : 0),
    phase: 'answered',
    answer,
  };
}

export function completeSessionEarly(state: GameSessionState): GameSessionState {
  if (state.phase === 'complete') return state;
  return {
    ...state,
    phase: 'complete',
    answer: null,
    deadline: Date.now(),
  };
}

export function getRevealedChainWordIds(state: GameSessionState): Set<string> {
  const currentItem = state.queue[state.index];
  if (!currentItem) return new Set();
  const revealedEnd = state.phase === 'answered' ? state.index + 1 : state.index;
  return new Set(
    state.queue
      .slice(0, revealedEnd)
      .filter((item) => item.chainIndex === currentItem.chainIndex)
      .map((item) => item.word.id),
  );
}

export function replaceUnavailableListening(
  state: GameSessionState,
  now = Date.now(),
): GameSessionState {
  let changed = false;
  const currentWasListening = state.queue[state.index]?.mode === 'listening';
  const queue = state.queue.map((item, index) => {
    if (index < state.index || item.mode !== 'listening') return item;
    changed = true;
    return { ...item, mode: 'choice' as const };
  });
  if (!changed) return state;
  if (state.phase !== 'asking' || !currentWasListening) return { ...state, queue };
  return {
    ...state,
    queue,
    questionStartedAt: now,
    deadline: now + MODE_TIME_LIMITS.choice,
  };
}

export function advanceSession(
  state: GameSessionState,
  now = Date.now(),
): GameSessionState {
  if (state.phase !== 'answered') return state;
  const nextIndex = state.index + 1;

  if (nextIndex >= state.queue.length) {
    return { ...state, index: nextIndex, phase: 'complete', answer: null };
  }

  const currentItem = state.queue[state.index];
  const nextItem = state.queue[nextIndex];
  const startsNewChain = currentItem.chainIndex !== nextItem.chainIndex;
  return {
    ...state,
    index: nextIndex,
    phase: startsNewChain ? 'preview' : 'asking',
    answer: null,
    questionStartedAt: now,
    deadline: startsNewChain ? now : now + MODE_TIME_LIMITS[nextItem.mode],
  };
}

export function shuffleEntries(entries: WordEntry[], random = Math.random): WordEntry[] {
  const shuffled = [...entries];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}
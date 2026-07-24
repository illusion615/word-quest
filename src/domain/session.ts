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
  listening: 22_000,
  choice: 15_000,
  sentence: 25_000,
  boss: 22_000,
  'match-meaning': 18_000,
  'listen-meaning': 20_000,
  'match-word': 15_000,
  'listen-word': 20_000,
};

const INPUT_MODES = new Set<GameMode>(['listening', 'sentence', 'boss']);
const AUDIO_MODES = new Set<GameMode>(['listening', 'listen-meaning', 'listen-word']);

/** Applies difficulty scaling without making typing or audio tasks unplayable. */
export function resolveModeTimeLimit(mode: GameMode, timeScale = 1): number {
  const safeScale = Number.isFinite(timeScale) ? Math.max(0.1, timeScale) : 1;
  const minimum = INPUT_MODES.has(mode) || AUDIO_MODES.has(mode) ? 15_000 : 8_000;
  return Math.max(minimum, Math.round(MODE_TIME_LIMITS[mode] * safeScale));
}

export const AUTO_ADVANCE_DELAY_MS = 3_000;

export function resolveTimeoutSubmission(
  draft: SessionAnswer | null,
): readonly [boolean, string, string?, SessionAnswer['choiceFeedback']?] {
  return draft
    ? [draft.correct, draft.response, draft.correctAnswer, draft.choiceFeedback]
    : [false, ''];
}

export function createGameSession(
  queue: AdaptiveStudyItem[],
  now = Date.now(),
): GameSessionState {
  return {
    queue,
    results: [],
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
  timeScale = 1,
): GameSessionState {
  if (state.phase !== 'preview') return state;
  const item = state.queue[state.index];
  if (!item) return { ...state, phase: 'complete' };
  return {
    ...state,
    phase: 'asking',
    questionStartedAt: now,
    deadline: now + resolveModeTimeLimit(item.mode, timeScale),
  };
}

export function answerCurrentQuestion(
  state: GameSessionState,
  answer: SessionAnswer,
): GameSessionState {
  if (state.phase !== 'asking') return state;
  const item = state.queue[state.index];
  return {
    ...state,
    results: item
      ? [...state.results, { word: item.word, mode: item.mode, answer }]
      : state.results,
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
  timeScale = 1,
): GameSessionState {
  const needsSpeech = (mode: AdaptiveStudyItem['mode']) => (
    mode === 'listening' || mode === 'listen-meaning' || mode === 'listen-word'
  );
  const fallbackFor = (mode: AdaptiveStudyItem['mode']) => (
    mode === 'listening'
      ? ('boss' as const)
      : mode === 'listen-meaning'
        ? ('match-meaning' as const)
        : ('match-word' as const)
  );
  let changed = false;
        const currentMode = state.queue[state.index]?.mode ?? 'choice';
        const currentWasSpoken = needsSpeech(currentMode);
  const queue = state.queue.map((item, index) => {
    if (index < state.index || !needsSpeech(item.mode)) return item;
    changed = true;
    return { ...item, mode: fallbackFor(item.mode) };
  });
  if (!changed) return state;
  if (state.phase !== 'asking' || !currentWasSpoken) return { ...state, queue };
  return {
    ...state,
    queue,
    questionStartedAt: now,
    deadline: now + resolveModeTimeLimit(fallbackFor(currentMode), timeScale),
  };
}

export function advanceSession(
  state: GameSessionState,
  now = Date.now(),
  timeScale = 1,
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
    deadline: startsNewChain ? now : now + resolveModeTimeLimit(nextItem.mode, timeScale),
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
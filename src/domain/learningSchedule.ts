import { Rating, State, type Grade } from 'ts-fsrs';
import type {
  AnswerRecord,
  GameMode,
  LearningState,
  WordEntry,
  WordProgress,
} from './models';

export const STABLE_MASTERY_DAYS = 21;
export const HARD_RESPONSE_RATIO = 0.75;
export const EASY_RESPONSE_RATIO = 0.35;

export type LearningStatus = 'new' | 'learning' | 'due' | 'relearning' | 'stable';

export interface LearningSignal {
  status: LearningStatus;
  due: boolean;
  stable: boolean;
  nextReviewAt: Date | null;
}

export interface StudyAvailability {
  dueCount: number;
  newCount: number;
  stableCount: number;
  nextReviewAt: Date | null;
}

const DEFAULT_TIME_LIMITS = {
  listening: 22_000,
  choice: 15_000,
  sentence: 25_000,
  boss: 22_000,
  'match-meaning': 18_000,
  'listen-meaning': 20_000,
  'match-word': 15_000,
  'listen-word': 20_000,
} as const;

// Option-picking modes exclude an Easy grade: a fast tap can be a lucky guess,
// so they cap at Good to keep FSRS honest.
const RECOGNITION_MODES = new Set<GameMode>([
  'choice',
  'match-meaning',
  'listen-meaning',
  'match-word',
  'listen-word',
]);

export function isReviewDue(
  progress: WordProgress | undefined,
  now = new Date(),
): boolean {
  if (!progress) return false;
  return new Date(progress.card.due).getTime() <= now.getTime();
}

export function isDurablyMastered(progress: WordProgress | undefined): boolean {
  return Boolean(
    progress
    && progress.card.state === State.Review
    && progress.card.stability >= STABLE_MASTERY_DAYS,
  );
}

export function getLearningSignal(
  progress: WordProgress | undefined,
  now = new Date(),
): LearningSignal {
  if (!progress) {
    return { status: 'new', due: false, stable: false, nextReviewAt: null };
  }

  const due = isReviewDue(progress, now);
  const stable = isDurablyMastered(progress);
  const nextReviewAt = new Date(progress.card.due);
  let status: LearningStatus;

  if (progress.card.state === State.Relearning) status = 'relearning';
  else if (due) status = 'due';
  else if (stable) status = 'stable';
  else status = 'learning';

  return { status, due, stable, nextReviewAt };
}

export function rateAnswer(answer: AnswerRecord): Grade {
  if (!answer.correct) return Rating.Again;
  if (answer.usedHint) return Rating.Hard;

  const timeLimitMs = answer.timeLimitMs ?? DEFAULT_TIME_LIMITS[answer.mode];
  const responseRatio = timeLimitMs > 0
    ? answer.responseTimeMs / timeLimitMs
    : 1;

  if (responseRatio >= HARD_RESPONSE_RATIO) return Rating.Hard;
  if (!RECOGNITION_MODES.has(answer.mode) && responseRatio <= EASY_RESPONSE_RATIO) {
    return Rating.Easy;
  }
  return Rating.Good;
}

export function getStudyAvailability(
  entries: WordEntry[],
  state: LearningState,
  now = new Date(),
): StudyAvailability {
  let dueCount = 0;
  let newCount = 0;
  let stableCount = 0;
  let nextReviewAt: Date | null = null;

  entries.forEach((entry) => {
    const progress = state.progress[entry.id];
    if (!progress) {
      newCount += 1;
      return;
    }
    if (isReviewDue(progress, now)) dueCount += 1;
    if (isDurablyMastered(progress)) stableCount += 1;
    const due = new Date(progress.card.due);
    if (due > now && (!nextReviewAt || due < nextReviewAt)) nextReviewAt = due;
  });

  return { dueCount, newCount, stableCount, nextReviewAt };
}
import {
  State,
  createEmptyCard,
  fsrs,
  type Card,
  type CardInput,
} from 'ts-fsrs';
import type {
  AnswerRecord,
  BankId,
  LearningState,
  SerializedFsrsCard,
  WordEntry,
  WordProgress,
} from './models';
import { isWordMastered } from './coverage';
import { isReviewDue, rateAnswer } from './learningSchedule';
import { isBelowBankLevel } from './wordLevel';
import { selectFrequencyMix } from './frequencyMix';

export const LEARNING_STORAGE_KEY = 'wordbuddy.learning.v1';

export interface LearningStats {
  learned: number;
  mastered: number;
  due: number;
  today: number;
  accuracy: number;
  streak: number;
}

export const DEFAULT_NEW_WORD_LIMIT = 8;

export type StudyPriority = 'due' | 'new';

/**
 * How hard the newly introduced words should be inside an already frequency-
 * mixed journey level. Relaxed biases toward common bands, hardcore toward rare
 * bands, but both preserve representation from every available band.
 */
export type ChallengeDifficulty = 'relaxed' | 'standard' | 'hardcore';

function orderUnseenByDifficulty(
  unseen: WordEntry[],
  difficulty: ChallengeDifficulty,
  bankId?: BankId,
  limit = unseen.length,
): WordEntry[] {
  const atLevel = bankId
    ? unseen.filter((entry) => !isBelowBankLevel(entry, bankId))
    : unseen;
  const below = bankId
    ? unseen.filter((entry) => isBelowBankLevel(entry, bankId))
    : [];
  const atLevelLimit = Math.min(limit, atLevel.length);
  const leadingAtLevel = difficulty === 'standard'
    ? atLevel.slice(0, atLevelLimit)
    : selectFrequencyMix(
        atLevel,
        atLevelLimit,
        difficulty === 'relaxed' ? 'common-led' : 'rare-led',
      );
  const remaining = Math.max(0, limit - leadingAtLevel.length);
  const trailingBelow = difficulty === 'hardcore'
    ? selectFrequencyMix(below, remaining, 'rare-led')
    : selectFrequencyMix(below, remaining, 'common-led');
  return [...leadingAtLevel, ...trailingBelow];
}

export interface StudyCandidate {
  word: WordEntry;
  priority: StudyPriority;
}

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
});

export function createEmptyLearningState(): LearningState {
  return { version: 1, progress: {}, history: [] };
}

function serializeCard(card: Card): SerializedFsrsCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    ...(card.last_review
      ? { last_review: card.last_review.toISOString() }
      : {}),
  };
}

function deserializeCard(card: SerializedFsrsCard): CardInput {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ?? null,
  };
}

function isLearningState(value: unknown): value is LearningState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LearningState>;
  return candidate.version === 1
    && Boolean(candidate.progress)
    && typeof candidate.progress === 'object'
    && Array.isArray(candidate.history);
}

export function parseLearningState(raw: string | null): LearningState {
  if (!raw) return createEmptyLearningState();

  try {
    const parsed: unknown = JSON.parse(raw);
    return isLearningState(parsed) ? parsed : createEmptyLearningState();
  } catch {
    return createEmptyLearningState();
  }
}

export function recordAnswer(
  state: LearningState,
  answer: AnswerRecord,
  now = new Date(answer.answeredAt),
): LearningState {
  const current = state.progress[answer.wordId];
  const card = current
    ? deserializeCard(current.card)
    : createEmptyCard(now);
  const grade = answer.fsrsRating ?? rateAnswer(answer);
  const nextCard = scheduler.next(card, now, grade).card;
  const attempts = (current?.attempts ?? 0) + 1;
  const correct = (current?.correct ?? 0) + (answer.correct ? 1 : 0);
  const progress: WordProgress = {
    wordId: answer.wordId,
    attempts,
    correct,
    mastery: Math.round((correct / attempts) * 100),
    card: serializeCard(nextCard),
  };

  return {
    version: 1,
    progress: { ...state.progress, [answer.wordId]: progress },
    history: [...state.history, { ...answer, fsrsRating: grade }].slice(-1000),
  };
}

export function buildStudyQueue(
  entries: WordEntry[],
  state: LearningState,
  now = new Date(),
  limit = 8,
  bankId?: BankId,
): WordEntry[] {
  return buildStudyCandidates(entries, state, now, bankId, limit)
    .slice(0, limit)
    .map((candidate) => candidate.word);
}

export function buildStudyCandidates(
  entries: WordEntry[],
  state: LearningState,
  now = new Date(),
  bankId?: BankId,
  newWordLimit = DEFAULT_NEW_WORD_LIMIT,
  difficulty: ChallengeDifficulty = 'standard',
): StudyCandidate[] {
  const due = entries
    .filter((entry) => isReviewDue(state.progress[entry.id], now))
    .sort((left, right) => {
      const leftProgress = state.progress[left.id];
      const rightProgress = state.progress[right.id];
      const relearningDelta = Number(rightProgress?.card.state === State.Relearning)
        - Number(leftProgress?.card.state === State.Relearning);
      if (relearningDelta !== 0) return relearningDelta;
      const leftDue = state.progress[left.id]?.card.due ?? '';
      const rightDue = state.progress[right.id]?.card.due ?? '';
      return leftDue.localeCompare(rightDue);
    });
  const unseen = entries.filter((entry) => !state.progress[entry.id]);
  const limit = Math.max(0, Math.floor(newWordLimit));
  const limitedUnseen = orderUnseenByDifficulty(unseen, difficulty, bankId, limit);

  return [
    ...due.map((word) => ({ word, priority: 'due' as const })),
    ...limitedUnseen.map((word) => ({ word, priority: 'new' as const })),
  ];
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayBefore(date: Date): Date {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return previous;
}

export function calculateStreak(history: AnswerRecord[], now = new Date()): number {
  const activeDays = new Set(
    history.map((record) => localDateKey(new Date(record.answeredAt))),
  );
  const today = localDateKey(now);
  const yesterday = localDateKey(dayBefore(now));
  let cursor = activeDays.has(today) ? new Date(now) : dayBefore(now);

  if (!activeDays.has(today) && !activeDays.has(yesterday)) return 0;

  let streak = 0;
  while (activeDays.has(localDateKey(cursor))) {
    streak += 1;
    cursor = dayBefore(cursor);
  }
  return streak;
}

export function getLearningStats(
  state: LearningState,
  now = new Date(),
): LearningStats {
  const progress = Object.values(state.progress);
  const totalAttempts = progress.reduce((sum, item) => sum + item.attempts, 0);
  const totalCorrect = progress.reduce((sum, item) => sum + item.correct, 0);
  const todayKey = localDateKey(now);

  return {
    learned: progress.length,
    mastered: progress.filter((item) => isWordMastered(item)).length,
    due: progress.filter((item) => new Date(item.card.due) <= now).length,
    today: state.history.filter(
      (record) => localDateKey(new Date(record.answeredAt)) === todayKey,
    ).length,
    accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
    streak: calculateStreak(state.history, now),
  };
}
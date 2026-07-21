import type { BankId, LearningState, WordEntry } from './models';
import { isBelowBankLevel } from './wordLevel';
import { getStudyAvailability } from './learningSchedule';

export const WORDS_PER_LEVEL = 25;
export const TARGET_LEVELS_PER_CHAPTER = 20;
export const BOSS_LEVEL_INTERVAL = 5;

export type JourneyLevelStatus = 'completed' | 'active' | 'locked';
export type JourneyLevelKind = 'normal' | 'boss';
export type LevelCompletionAction = 'next' | 'continue' | 'finished';

export interface JourneyLevel {
  id: string;
  globalIndex: number;
  number: number;
  kind: JourneyLevelKind;
  chapterIndex: number;
  chapterLevelNumber: number;
  wordStart: number;
  wordEnd: number;
  wordCount: number;
  masteredCount: number;
  dueCount: number;
  newCount: number;
  nextReviewAt: string | null;
  progressPercentage: number;
  perfect: boolean;
  status: JourneyLevelStatus;
}

export interface JourneyChapter {
  id: string;
  index: number;
  title: string;
  levelStart: number;
  levelEnd: number;
  totalWords: number;
  masteredWords: number;
  progressPercentage: number;
  status: JourneyLevelStatus;
  levels: JourneyLevel[];
}

export interface BankJourney {
  chapters: JourneyChapter[];
  totalLevels: number;
  activeLevelIndex: number | null;
  activeChapterIndex: number;
}

export function resolveLevelCompletionAction(
  levelIndex: number,
  totalLevels: number,
  battleWon = true,
  levelReadyToClear = battleWon,
): LevelCompletionAction {
  if (!battleWon) return 'continue';
  if (!levelReadyToClear) return 'continue';
  return levelIndex + 1 < totalLevels ? 'next' : 'finished';
}

const CHAPTER_TITLES = [
  '起卷营地',
  '识词平原',
  '听音峡谷',
  '语境长街',
  '拼写荒原',
  '记忆密林',
  '复习熔炉',
  '提取要塞',
  '词义迷宫',
  '速度战场',
  '遗忘冰原',
  '万词天梯',
  '巅峰竞技场',
  '卷王王座',
];

function roundPercentage(value: number): number {
  return Math.round(value * 100) / 100;
}

function chapterTitle(index: number, chapterCount: number): string {
  if (chapterCount <= 1) return CHAPTER_TITLES.at(-1) ?? '卷王王座';
  const titleIndex = Math.round((index / (chapterCount - 1)) * (CHAPTER_TITLES.length - 1));
  return CHAPTER_TITLES[titleIndex] ?? `无尽远征 ${index + 1}`;
}

function levelsPerChapter(totalLevels: number): number[] {
  const chapterCount = Math.max(1, Math.ceil(totalLevels / TARGET_LEVELS_PER_CHAPTER));
  const baseSize = Math.floor(totalLevels / chapterCount);
  const largerChapterCount = totalLevels % chapterCount;
  return Array.from(
    { length: chapterCount },
    (_, index) => baseSize + (index < largerChapterCount ? 1 : 0),
  );
}

function orderedByBankLevel(entries: WordEntry[], bankId?: BankId): WordEntry[] {
  return bankId
    ? [...entries].sort((left, right) => (
        Number(isBelowBankLevel(left, bankId)) - Number(isBelowBankLevel(right, bankId))
      ))
    : entries;
}

function masteryScore(word: WordEntry, state: LearningState): number {
  const progress = state.progress[word.id];
  if (!progress) return 0;
  return progress.mastery;
}

function attemptsScore(word: WordEntry, state: LearningState): number {
  const progress = state.progress[word.id];
  if (!progress) return 0;
  return progress.attempts;
}

export function isBossLevelNumber(levelNumber: number): boolean {
  return levelNumber > 0 && levelNumber % BOSS_LEVEL_INTERVAL === 0;
}

export function getJourneyLevelEntries(
  entries: WordEntry[],
  levelIndex: number,
  bankId?: BankId,
): WordEntry[] {
  const safeIndex = Math.max(0, Math.floor(levelIndex));
  const start = safeIndex * WORDS_PER_LEVEL;
  const orderedEntries = orderedByBankLevel(entries, bankId);
  return orderedEntries.slice(start, start + WORDS_PER_LEVEL);
}

export function getBossLevelEntries(
  entries: WordEntry[],
  state: LearningState,
  levelIndex: number,
  bankId?: BankId,
): WordEntry[] {
  const safeIndex = Math.max(0, Math.floor(levelIndex));
  const orderedEntries = orderedByBankLevel(entries, bankId);
  const currentStart = safeIndex * WORDS_PER_LEVEL;
  const currentLevelEntries = orderedEntries.slice(currentStart, currentStart + WORDS_PER_LEVEL);
  const reviewWindowStart = Math.max(
    0,
    currentStart - ((BOSS_LEVEL_INTERVAL - 1) * WORDS_PER_LEVEL),
  );
  const reviewCandidates = orderedEntries.slice(reviewWindowStart, currentStart);
  const weakestReviews = [...reviewCandidates]
    .sort((left, right) => {
      const masteryDelta = masteryScore(left, state) - masteryScore(right, state);
      if (masteryDelta !== 0) return masteryDelta;
      const attemptsDelta = attemptsScore(left, state) - attemptsScore(right, state);
      if (attemptsDelta !== 0) return attemptsDelta;
      return left.word.localeCompare(right.word);
    });

  return [...currentLevelEntries, ...weakestReviews];
}

export function buildBankJourney(
  entries: WordEntry[],
  state: LearningState,
  bankId?: BankId,
  clearedLevels: Set<number> = new Set(),
  now = new Date(),
): BankJourney {
  if (entries.length === 0) {
    return { chapters: [], totalLevels: 0, activeLevelIndex: null, activeChapterIndex: 0 };
  }

  const orderedEntries = orderedByBankLevel(entries, bankId);
  const totalLevels = Math.ceil(orderedEntries.length / WORDS_PER_LEVEL);
  const chapterSizes = levelsPerChapter(totalLevels);
  const rawLevels = Array.from({ length: totalLevels }, (_, globalIndex) => {
    const start = globalIndex * WORDS_PER_LEVEL;
    const words = orderedEntries.slice(start, start + WORDS_PER_LEVEL);
    const availability = getStudyAvailability(words, state, now);
    const masteredCount = availability.stableCount;
    const progressPercentage = roundPercentage((masteredCount / words.length) * 100);
    const levelNumber = globalIndex + 1;
    return {
      globalIndex,
      words,
      masteredCount,
      dueCount: availability.dueCount,
      newCount: availability.newCount,
      nextReviewAt: availability.nextReviewAt?.toISOString() ?? null,
      progressPercentage,
      completed: clearedLevels.has(levelNumber),
    };
  });
  const activeLevelIndex = rawLevels.find((level) => !level.completed)?.globalIndex ?? null;

  let globalOffset = 0;
  const chapters = chapterSizes.map((chapterSize, chapterIndex) => {
    const chapterRawLevels = rawLevels.slice(globalOffset, globalOffset + chapterSize);
    const levels = chapterRawLevels.map((level, chapterLevelIndex): JourneyLevel => {
      const wordStart = level.globalIndex * WORDS_PER_LEVEL;
      const wordEnd = wordStart + level.words.length;
      const status: JourneyLevelStatus = level.completed && (
        activeLevelIndex === null || level.globalIndex < activeLevelIndex
      )
        ? 'completed'
        : level.globalIndex === activeLevelIndex
          ? 'active'
          : 'locked';
      return {
        id: `level-${level.globalIndex + 1}`,
        globalIndex: level.globalIndex,
        number: level.globalIndex + 1,
        kind: isBossLevelNumber(level.globalIndex + 1) ? 'boss' : 'normal',
        chapterIndex,
        chapterLevelNumber: chapterLevelIndex + 1,
        wordStart,
        wordEnd,
        wordCount: level.words.length,
        masteredCount: level.masteredCount,
        dueCount: level.dueCount,
        newCount: level.newCount,
        nextReviewAt: level.nextReviewAt,
        progressPercentage: level.progressPercentage,
        perfect: level.masteredCount === level.words.length,
        status,
      };
    });
    const chapterWords = chapterRawLevels.flatMap((level) => level.words);
    const masteredWords = chapterRawLevels.reduce((sum, level) => sum + level.masteredCount, 0);
    const progressPercentage = roundPercentage((masteredWords / chapterWords.length) * 100);
    const status: JourneyLevelStatus = levels.every((level) => level.status === 'completed')
      ? 'completed'
      : levels.some((level) => level.status === 'active')
        ? 'active'
        : 'locked';
    const chapter: JourneyChapter = {
      id: `chapter-${chapterIndex + 1}`,
      index: chapterIndex,
      title: chapterTitle(chapterIndex, chapterSizes.length),
      levelStart: globalOffset + 1,
      levelEnd: globalOffset + chapterSize,
      totalWords: chapterWords.length,
      masteredWords,
      progressPercentage,
      status,
      levels,
    };
    globalOffset += chapterSize;
    return chapter;
  });

  const activeChapterIndex = activeLevelIndex === null
    ? Math.max(0, chapters.length - 1)
    : chapters.findIndex((chapter) => chapter.levels.some((level) => level.status === 'active'));

  return { chapters, totalLevels, activeLevelIndex, activeChapterIndex };
}
import type { BankId, LearningState, WordEntry } from './models';
import {
  allocateFrequencyQuotas,
  FREQUENCY_BAND_COUNT,
  splitFrequencyBands,
  weaveFrequencyBands,
  withFrequencyMetadata,
} from './frequencyMix';
import { getStudyAvailability } from './learningSchedule';

export interface JourneyWord {
  id: string;
  frequencyRank?: number;
  frequencyPercentile?: number;
}

export const WORDS_PER_LEVEL = 25;
export const TARGET_LEVELS_PER_CHAPTER = 20;
export const BOSS_LEVEL_INTERVAL = 5;
export const NORMAL_LEVELS_PER_BOSS = BOSS_LEVEL_INTERVAL - 1;
// The average weight of every band across the whole journey is 25%, so all
// words are consumed exactly once. Early levels lean common; late levels lean
// rare, while every full level still contains words from all four bands.
const EARLY_FREQUENCY_WEIGHTS = [0.4, 0.3, 0.2, 0.1] as const;
const LATE_FREQUENCY_WEIGHTS = [0.1, 0.2, 0.3, 0.4] as const;

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
  frequencyLabel: string;
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

interface JourneyNodeSpec {
  kind: JourneyLevelKind;
  normalGroupIndex: number | null;
  reviewGroupStart: number;
  reviewGroupEnd: number;
}

/**
 * Inserts a finite Boss assessment after each four normal word groups. Boss
 * nodes review the preceding groups and never consume a 25-word block of their
 * own; a final partial group still ends with a Boss assessment.
 */
export function buildJourneyNodeSpecs(entryCount: number): JourneyNodeSpec[] {
  const normalLevelCount = Math.ceil(Math.max(0, entryCount) / WORDS_PER_LEVEL);
  const nodes: JourneyNodeSpec[] = [];
  for (let normalGroupIndex = 0; normalGroupIndex < normalLevelCount; normalGroupIndex += 1) {
    const reviewGroupStart = Math.floor(normalGroupIndex / NORMAL_LEVELS_PER_BOSS)
      * NORMAL_LEVELS_PER_BOSS;
    nodes.push({
      kind: 'normal',
      normalGroupIndex,
      reviewGroupStart,
      reviewGroupEnd: normalGroupIndex + 1,
    });
    const closesFullGroup = (normalGroupIndex + 1) % NORMAL_LEVELS_PER_BOSS === 0;
    const closesJourney = normalGroupIndex + 1 === normalLevelCount;
    if (closesFullGroup || closesJourney) {
      nodes.push({
        kind: 'boss',
        normalGroupIndex: null,
        reviewGroupStart,
        reviewGroupEnd: normalGroupIndex + 1,
      });
    }
  }
  return nodes;
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

export function levelFrequencyLabel(levelIndex: number, totalLevels: number): string {
  const progress = totalLevels <= 1 ? 0.5 : levelIndex / (totalLevels - 1);
  if (progress < 1 / 3) return '高频为主 · 混合低频';
  if (progress > 2 / 3) return '低频为主 · 保留高频';
  return '高低频均衡';
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

function frequencyWeights(progress: number): number[] {
  return EARLY_FREQUENCY_WEIGHTS.map((early, index) => (
    early + ((LATE_FREQUENCY_WEIGHTS[index] - early) * progress)
  ));
}

/**
 * Converts a common-first frequency list into stable 25-word level blocks.
 * Each block mixes four frequency bands; the ratio moves smoothly from
 * 40/30/20/10 to 10/20/30/40 over the journey.
 */
export function orderByFrequencyCurve<T extends JourneyWord>(entries: readonly T[]): T[] {
  if (entries.length <= 1) return [...entries];
  const bands = splitFrequencyBands(entries);
  const offsets = bands.map(() => 0);
  const totalLevels = Math.ceil(entries.length / WORDS_PER_LEVEL);
  const ordered: T[] = [];

  for (let levelIndex = 0; levelIndex < totalLevels; levelIndex += 1) {
    const remaining = entries.length - ordered.length;
    const levelSize = Math.min(WORDS_PER_LEVEL, remaining);
    const progress = totalLevels <= 1 ? 0.5 : levelIndex / (totalLevels - 1);
    const futureMixableLevels = Array.from(
      { length: totalLevels - levelIndex - 1 },
      (_, offset) => Math.min(
        WORDS_PER_LEVEL,
        Math.max(0, entries.length - ((levelIndex + offset + 1) * WORDS_PER_LEVEL)),
      ),
    ).filter((size) => size >= FREQUENCY_BAND_COUNT).length;
    const available = bands.map((band, index) => band.length - offsets[index]);
    const availableNow = available.map((count) => (
      Math.max(0, count - futureMixableLevels)
    ));
    const quotas = allocateFrequencyQuotas(
      availableNow,
      levelSize,
      frequencyWeights(progress),
    );
    const levelBands = bands.map((band, index) => {
      const words = band.slice(offsets[index], offsets[index] + quotas[index]);
      offsets[index] += words.length;
      return words;
    });
    ordered.push(...weaveFrequencyBands(levelBands));
  }

  return ordered;
}

export function orderWordsByJourney<T extends JourneyWord>(
  entries: readonly T[],
  bankId?: BankId,
): T[] {
  const ranked = withFrequencyMetadata(entries);
  // Bank membership already scopes the curriculum. Sub-level basics remain in
  // the common band as anchors instead of being pushed into an all-basic tail;
  // the study scheduler still prevents them from crowding out target-level new
  // words inside each mixed level.
  void bankId;
  return orderByFrequencyCurve(ranked);
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

export function getJourneyLevelEntries(
  entries: WordEntry[],
  levelIndex: number,
  bankId?: BankId,
): WordEntry[] {
  const safeIndex = Math.max(0, Math.floor(levelIndex));
  const orderedEntries = orderWordsByJourney(entries, bankId);
  const node = buildJourneyNodeSpecs(orderedEntries.length)[safeIndex];
  if (!node || node.kind !== 'normal' || node.normalGroupIndex === null) return [];
  const start = node.normalGroupIndex * WORDS_PER_LEVEL;
  return orderedEntries.slice(start, start + WORDS_PER_LEVEL);
}

export function getBossLevelEntries(
  entries: WordEntry[],
  state: LearningState,
  levelIndex: number,
  bankId?: BankId,
): WordEntry[] {
  const safeIndex = Math.max(0, Math.floor(levelIndex));
  const orderedEntries = orderWordsByJourney(entries, bankId);
  const node = buildJourneyNodeSpecs(orderedEntries.length)[safeIndex];
  if (!node || node.kind !== 'boss') return [];
  const reviewCandidates = orderedEntries.slice(
    node.reviewGroupStart * WORDS_PER_LEVEL,
    node.reviewGroupEnd * WORDS_PER_LEVEL,
  );
  return [...reviewCandidates]
    .sort((left, right) => {
      const masteryDelta = masteryScore(left, state) - masteryScore(right, state);
      if (masteryDelta !== 0) return masteryDelta;
      const attemptsDelta = attemptsScore(left, state) - attemptsScore(right, state);
      if (attemptsDelta !== 0) return attemptsDelta;
      return left.word.localeCompare(right.word);
    });
}

export function buildBankJourney(
  entries: readonly JourneyWord[],
  state: LearningState,
  bankId?: BankId,
  clearedLevels: Set<number> = new Set(),
  now = new Date(),
): BankJourney {
  if (entries.length === 0) {
    return { chapters: [], totalLevels: 0, activeLevelIndex: null, activeChapterIndex: 0 };
  }

  const orderedEntries = orderWordsByJourney(entries, bankId);
  const normalLevelCount = Math.ceil(orderedEntries.length / WORDS_PER_LEVEL);
  const nodeSpecs = buildJourneyNodeSpecs(orderedEntries.length);
  const totalLevels = nodeSpecs.length;
  const chapterSizes = levelsPerChapter(totalLevels);
  const rawLevels = nodeSpecs.map((node, globalIndex) => {
    const start = (node.normalGroupIndex ?? node.reviewGroupStart) * WORDS_PER_LEVEL;
    const end = node.kind === 'normal'
      ? start + WORDS_PER_LEVEL
      : node.reviewGroupEnd * WORDS_PER_LEVEL;
    const words = orderedEntries.slice(start, end);
    const availability = getStudyAvailability(words, state, now);
    const masteredCount = availability.stableCount;
    const levelNumber = globalIndex + 1;
    const completed = clearedLevels.has(levelNumber);
    const progressPercentage = node.kind === 'boss'
      ? (completed ? 100 : 0)
      : roundPercentage((masteredCount / words.length) * 100);
    return {
      globalIndex,
      node,
      words,
      masteredCount,
      dueCount: availability.dueCount,
      newCount: node.kind === 'boss' ? 0 : availability.newCount,
      nextReviewAt: availability.nextReviewAt?.toISOString() ?? null,
      progressPercentage,
      completed,
    };
  });
  const activeLevelIndex = rawLevels.find((level) => !level.completed)?.globalIndex ?? null;

  let globalOffset = 0;
  const chapters = chapterSizes.map((chapterSize, chapterIndex) => {
    const chapterRawLevels = rawLevels.slice(globalOffset, globalOffset + chapterSize);
    const levels = chapterRawLevels.map((level, chapterLevelIndex): JourneyLevel => {
      const wordStart = (level.node.normalGroupIndex ?? level.node.reviewGroupStart) * WORDS_PER_LEVEL;
      const wordEnd = level.node.kind === 'normal'
        ? wordStart + level.words.length
        : level.node.reviewGroupEnd * WORDS_PER_LEVEL;
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
        kind: level.node.kind,
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
        perfect: level.node.kind === 'normal' && level.masteredCount === level.words.length,
        status,
        frequencyLabel: level.node.kind === 'boss'
          ? `前 ${level.node.reviewGroupEnd - level.node.reviewGroupStart} 关综合考核`
          : levelFrequencyLabel(level.node.normalGroupIndex ?? 0, normalLevelCount),
      };
    });
    const normalLevels = chapterRawLevels.filter((level) => level.node.kind === 'normal');
    const chapterWords = normalLevels.flatMap((level) => level.words);
    const masteredWords = normalLevels.reduce((sum, level) => sum + level.masteredCount, 0);
    const progressPercentage = chapterWords.length > 0
      ? roundPercentage((masteredWords / chapterWords.length) * 100)
      : 0;
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
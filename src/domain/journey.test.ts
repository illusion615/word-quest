import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import type { LearningState, WordEntry } from './models';
import {
  BOSS_LEVEL_INTERVAL,
  WORDS_PER_LEVEL,
  buildBankJourney,
  getBossLevelEntries,
  getJourneyLevelEntries,
  isBossLevelNumber,
  resolveLevelCompletionAction,
} from './journey';

function entries(count: number): WordEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    ...TEST_WORDS[index % TEST_WORDS.length],
    id: `word-${index}`,
    word: `word${index}`,
  }));
}

function learningState(masteredIds: string[] = []): LearningState {
  return {
    version: 1,
    progress: Object.fromEntries(masteredIds.map((wordId) => [wordId, {
      wordId,
      attempts: 3,
      correct: 3,
      mastery: 100,
      card: {
        due: '2026-07-21T00:00:00.000Z',
        stability: 21,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 21,
        learning_steps: 0,
        reps: 3,
        lapses: 0,
        state: 2,
      },
    }])),
    history: [],
  };
}

describe('bank learning journey', () => {
  it('splits a large bank into stable 25-word levels and balanced chapters', () => {
    const words = entries(3677);
    const journey = buildBankJourney(words, learningState());

    expect(journey.totalLevels).toBe(Math.ceil(3677 / WORDS_PER_LEVEL));
    expect(journey.chapters).toHaveLength(8);
    expect(Math.max(...journey.chapters.map((chapter) => chapter.levels.length))
      - Math.min(...journey.chapters.map((chapter) => chapter.levels.length))).toBeLessThanOrEqual(1);
    expect(journey.chapters.flatMap((chapter) => chapter.levels)).toHaveLength(journey.totalLevels);
  });

  it('keeps stable mastery separate from battle-based level unlocks', () => {
    const words = entries(60);
    const stablePercentage = 80;
    const masteredCount = Math.ceil(WORDS_PER_LEVEL * (stablePercentage / 100));
    const learningOnly = buildBankJourney(
      words,
      learningState(words.slice(0, masteredCount).map((word) => word.id)),
    );
    const cleared = buildBankJourney(
      words,
      learningState(words.slice(0, masteredCount).map((word) => word.id)),
      undefined,
      new Set([1]),
    );
    const learningOnlyLevels = learningOnly.chapters.flatMap((chapter) => chapter.levels);
    const clearedLevels = cleared.chapters.flatMap((chapter) => chapter.levels);

    expect(learningOnlyLevels.map((level) => level.status)).toEqual(['active', 'locked', 'locked']);
    expect(learningOnlyLevels[0].progressPercentage).toBe(stablePercentage);
    expect(learningOnly.activeLevelIndex).toBe(0);
    expect(clearedLevels.map((level) => level.status)).toEqual(['completed', 'active', 'locked']);
    expect(cleared.activeLevelIndex).toBe(1);
  });

  it('tracks perfect stable mastery separately from game completion', () => {
    const words = entries(25);
    const unlocked = buildBankJourney(words, learningState(words.slice(0, 20).map((word) => word.id)));
    const perfect = buildBankJourney(words, learningState(words.map((word) => word.id)));
    const cleared = buildBankJourney(words, learningState(), undefined, new Set([1]));

    expect(unlocked.chapters[0].levels[0]).toMatchObject({ status: 'active', perfect: false });
    expect(perfect.chapters[0].levels[0]).toMatchObject({ status: 'active', perfect: true });
    expect(cleared.chapters[0].levels[0]).toMatchObject({ status: 'completed', perfect: false });
  });

  it('returns the same fixed word pool for a given level index', () => {
    const words = entries(70);

    expect(getJourneyLevelEntries(words, 1).map((word) => word.id))
      .toEqual(words.slice(25, 50).map((word) => word.id));
    expect(getJourneyLevelEntries(words, 2)).toHaveLength(20);
  });

  it('marks every fifth level as a boss level', () => {
    const words = entries(WORDS_PER_LEVEL * (BOSS_LEVEL_INTERVAL + 1));
    const journey = buildBankJourney(words, learningState());
    const levels = journey.chapters.flatMap((chapter) => chapter.levels);

    expect(levels[0]?.kind).toBe('normal');
    expect(levels[BOSS_LEVEL_INTERVAL - 1]?.kind).toBe('boss');
    expect(isBossLevelNumber(BOSS_LEVEL_INTERVAL)).toBe(true);
    expect(isBossLevelNumber(BOSS_LEVEL_INTERVAL - 1)).toBe(false);
  });

  it('keeps the boss level own word pool and appends prior review candidates', () => {
    const words = entries(WORDS_PER_LEVEL * BOSS_LEVEL_INTERVAL);
    const weakestIds = words.slice(0, WORDS_PER_LEVEL).map((word) => word.id);
    const progress = Object.fromEntries(weakestIds.slice(0, 10).map((wordId) => [wordId, {
      wordId,
      attempts: 6,
      correct: 6,
      mastery: 100,
      card: {
        due: '2026-07-21T00:00:00.000Z',
        stability: 1,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 6,
        lapses: 0,
        state: 2,
      },
    }]));

    const bossEntries = getBossLevelEntries(
      words,
      { version: 1, progress, history: [] },
      BOSS_LEVEL_INTERVAL - 1,
    );

    const currentLevelIds = words
      .slice((BOSS_LEVEL_INTERVAL - 1) * WORDS_PER_LEVEL, BOSS_LEVEL_INTERVAL * WORDS_PER_LEVEL)
      .map((word) => word.id);
    expect(bossEntries.slice(0, WORDS_PER_LEVEL).map((word) => word.id))
      .toEqual(currentLevelIds);
    expect(bossEntries).toHaveLength(WORDS_PER_LEVEL * BOSS_LEVEL_INTERVAL);
    expect(bossEntries.slice(WORDS_PER_LEVEL, WORDS_PER_LEVEL + 15)
      .every((word) => weakestIds.includes(word.id))).toBe(true);
  });

  it('moves below-level basic words behind target-level words before slicing', () => {
    const words: WordEntry[] = [
      { ...TEST_WORDS[0], id: 'the', word: 'the', sourceTags: ['gk', 'zk'] },
      { ...TEST_WORDS[0], id: 'abandon', word: 'abandon', sourceTags: ['cet4', 'cet6', 'gk'] },
      { ...TEST_WORDS[0], id: 'and', word: 'and', sourceTags: ['gk', 'zk'] },
      { ...TEST_WORDS[0], id: 'diverse', word: 'diverse', sourceTags: ['cet6', 'gk'] },
    ];

    expect(getJourneyLevelEntries(words, 0, 'gaokao').map((word) => word.id))
      .toEqual(['abandon', 'diverse', 'the', 'and']);
  });

  it('advances on battle victory without consulting mastery percentage', () => {
    expect(resolveLevelCompletionAction(0, 148, false)).toBe('continue');
    expect(resolveLevelCompletionAction(0, 148, true)).toBe('next');
    expect(resolveLevelCompletionAction(147, 148, true)).toBe('finished');
  });
});
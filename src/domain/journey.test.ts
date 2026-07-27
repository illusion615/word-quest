import { describe, expect, it } from 'vitest';
import gaokaoEntries from '../../public/data/exam-banks/gaokao.json';
import { TEST_WORDS } from '../test/fixtures/words';
import type { LearningState, WordEntry } from './models';
import {
  BOSS_LEVEL_INTERVAL,
  NORMAL_LEVELS_PER_BOSS,
  WORDS_PER_LEVEL,
  buildBankJourney,
  buildJourneyNodeSpecs,
  getBossLevelEntries,
  getJourneyLevelEntries,
  levelFrequencyLabel,
  orderByFrequencyCurve,
  orderWordsByJourney,
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
  it('inserts a non-word-consuming Boss after each four normal levels', () => {
    const nodes = buildJourneyNodeSpecs(WORDS_PER_LEVEL * NORMAL_LEVELS_PER_BOSS);

    expect(nodes.map((node) => node.kind)).toEqual([
      'normal', 'normal', 'normal', 'normal', 'boss',
    ]);
    expect(nodes.at(-1)).toMatchObject({
      kind: 'boss',
      normalGroupIndex: null,
      reviewGroupStart: 0,
      reviewGroupEnd: NORMAL_LEVELS_PER_BOSS,
    });
  });

  it('ends a partial final group with one finite Boss assessment', () => {
    const nodes = buildJourneyNodeSpecs(WORDS_PER_LEVEL * (NORMAL_LEVELS_PER_BOSS + 2));

    expect(nodes.map((node) => node.kind)).toEqual([
      'normal', 'normal', 'normal', 'normal', 'boss',
      'normal', 'normal', 'boss',
    ]);
    expect(nodes.at(-1)).toMatchObject({ reviewGroupStart: 4, reviewGroupEnd: 6 });
  });

  it('splits a large bank into stable 25-word levels and balanced chapters', () => {
    const words = entries(3677);
    const journey = buildBankJourney(words, learningState());
    const normalLevelCount = Math.ceil(3677 / WORDS_PER_LEVEL);

    expect(journey.totalLevels).toBe(normalLevelCount + Math.ceil(normalLevelCount / NORMAL_LEVELS_PER_BOSS));
    expect(journey.chapters).toHaveLength(10);
    expect(Math.max(...journey.chapters.map((chapter) => chapter.levels.length))
      - Math.min(...journey.chapters.map((chapter) => chapter.levels.length))).toBeLessThanOrEqual(1);
    expect(journey.chapters.flatMap((chapter) => chapter.levels)).toHaveLength(journey.totalLevels);
  });

  it('builds the same journey from lightweight ID-only entries', () => {
    const words = entries(60);
    const state = learningState(words.slice(0, 12).map((word) => word.id));
    const cleared = new Set([1]);

    expect(buildBankJourney(
      words.map(({ id }) => ({ id })),
      state,
      'gaokao',
      cleared,
    )).toEqual(buildBankJourney(words, state, 'gaokao', cleared));
  });

  it('keeps stable mastery separate from battle-based level unlocks', () => {
    const words = entries(60);
    const stablePercentage = 80;
    const masteredCount = Math.ceil(WORDS_PER_LEVEL * (stablePercentage / 100));
    const firstLevelIds = getJourneyLevelEntries(words, 0)
      .slice(0, masteredCount)
      .map((word) => word.id);
    const learningOnly = buildBankJourney(
      words,
      learningState(firstLevelIds),
    );
    const cleared = buildBankJourney(
      words,
      learningState(firstLevelIds),
      undefined,
      new Set([1]),
    );
    const learningOnlyLevels = learningOnly.chapters.flatMap((chapter) => chapter.levels);
    const clearedLevels = cleared.chapters.flatMap((chapter) => chapter.levels);

    expect(learningOnlyLevels.map((level) => level.status)).toEqual(['active', 'locked', 'locked', 'locked']);
    expect(learningOnlyLevels[0].progressPercentage).toBe(stablePercentage);
    expect(learningOnly.activeLevelIndex).toBe(0);
    expect(clearedLevels.map((level) => level.status)).toEqual(['completed', 'active', 'locked', 'locked']);
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
    const first = getJourneyLevelEntries(words, 1);
    const second = getJourneyLevelEntries(words, 1);
    const previousIds = new Set(getJourneyLevelEntries(words, 0).map((word) => word.id));

    expect(second.map((word) => word.id)).toEqual(first.map((word) => word.id));
    expect(first).toHaveLength(WORDS_PER_LEVEL);
    expect(first.every((word) => !previousIds.has(word.id))).toBe(true);
    expect(getJourneyLevelEntries(words, 2)).toHaveLength(20);
    expect(getJourneyLevelEntries(words, 3)).toEqual([]);
  });

  it('exposes the exact level order for external generation queues', () => {
    const words = entries(70);
    const ordered = orderWordsByJourney(words);

    expect(ordered.slice(0, WORDS_PER_LEVEL).map((word) => word.id))
      .toEqual(getJourneyLevelEntries(words, 0).map((word) => word.id));
    expect(ordered.slice(WORDS_PER_LEVEL, WORDS_PER_LEVEL * 2).map((word) => word.id))
      .toEqual(getJourneyLevelEntries(words, 1).map((word) => word.id));
    expect(new Set(ordered.map((word) => word.id))).toEqual(new Set(words.map((word) => word.id)));
  });

  it('mixes frequency bands while shifting from common-led to rare-led levels', () => {
    const words = entries(100);
    const ordered = orderByFrequencyCurve(words);
    const rankById = new Map(words.map((word, index) => [word.id, index]));
    const bandCounts = (level: WordEntry[]) => {
      const counts = [0, 0, 0, 0];
      level.forEach((word) => {
        const rank = rankById.get(word.id) ?? 0;
        counts[Math.min(3, Math.floor(rank / 25))] += 1;
      });
      return counts;
    };
    const levels = Array.from(
      { length: 4 },
      (_, index) => ordered.slice(index * WORDS_PER_LEVEL, (index + 1) * WORDS_PER_LEVEL),
    );
    const firstCounts = bandCounts(levels[0]);
    const lastCounts = bandCounts(levels[3]);

    expect(levels.every((level) => bandCounts(level).every((count) => count > 0))).toBe(true);
    expect(new Set(levels[0].slice(0, 8).map((word) => (
      Math.min(3, Math.floor((rankById.get(word.id) ?? 0) / 25))
    ))).size).toBe(4);
    expect(firstCounts[0]).toBeGreaterThan(firstCounts[3]);
    expect(lastCounts[3]).toBeGreaterThan(lastCounts[0]);
    expect(new Set(ordered.map((word) => word.id)).size).toBe(words.length);
    expect(new Set(ordered.map((word) => word.id))).toEqual(new Set(words.map((word) => word.id)));
  });

  it('keeps the real Gaokao journey mixed without an all-basic tail', () => {
    const words = gaokaoEntries as WordEntry[];
    const rankById = new Map(words.map((word, index) => [word.id, index]));
    const above = new Set(['cet4', 'cet6', 'ky', 'gre']);
    const isBelow = (word: WordEntry) => !word.sourceTags?.some((tag) => above.has(tag));
    const fullLevels = buildBankJourney(words, learningState(), 'gaokao').chapters
      .flatMap((chapter) => chapter.levels)
      .filter((level) => level.kind === 'normal' && level.wordCount === WORDS_PER_LEVEL)
      .map((level) => getJourneyLevelEntries(words, level.globalIndex, 'gaokao'));
    const bandCounts = (level: WordEntry[]) => level.reduce((counts, word) => {
      const rank = rankById.get(word.id) ?? 0;
      counts[Math.min(3, Math.floor((rank / words.length) * 4))] += 1;
      return counts;
    }, [0, 0, 0, 0]);
    const first = bandCounts(fullLevels[0]);
    const late = bandCounts(fullLevels.at(-1) ?? []);

    const imbalanced = fullLevels
      .map((level, index) => ({ level: index + 1, counts: bandCounts(level) }))
      .filter(({ counts }) => counts.some((count) => count === 0));
    expect(imbalanced).toEqual([]);
    expect(first[0]).toBeGreaterThan(first[3]);
    expect(late[3]).toBeGreaterThan(late[0]);
    expect(fullLevels.every((level) => level.filter(isBelow).length < WORDS_PER_LEVEL))
      .toBe(true);
  });

  it('marks every fifth level as a boss level', () => {
    const words = entries(WORDS_PER_LEVEL * (BOSS_LEVEL_INTERVAL + 1));
    const journey = buildBankJourney(words, learningState());
    const levels = journey.chapters.flatMap((chapter) => chapter.levels);

    expect(levels[0]?.kind).toBe('normal');
    expect(levels[BOSS_LEVEL_INTERVAL - 1]?.kind).toBe('boss');
    expect(levels[BOSS_LEVEL_INTERVAL - 1]).toMatchObject({ newCount: 0, wordCount: WORDS_PER_LEVEL * 4 });
    expect(levels[BOSS_LEVEL_INTERVAL]?.kind).toBe('normal');
  });

  it('labels the visible difficulty curve from common-led to rare-led', () => {
    expect(levelFrequencyLabel(0, 10)).toBe('高频为主 · 混合低频');
    expect(levelFrequencyLabel(5, 10)).toBe('高低频均衡');
    expect(levelFrequencyLabel(9, 10)).toBe('低频为主 · 保留高频');
  });

  it('builds the Boss pool exclusively from its preceding normal levels', () => {
    const words = entries(WORDS_PER_LEVEL * BOSS_LEVEL_INTERVAL);
    const priorWords = Array.from(
      { length: NORMAL_LEVELS_PER_BOSS },
      (_, index) => getJourneyLevelEntries(words, index),
    ).flat();
    const weakestIds = new Set(priorWords.slice(0, 10).map((word) => word.id));
    const progress = Object.fromEntries(priorWords.map((word) => [word.id, {
      wordId: word.id,
      attempts: 6,
      correct: weakestIds.has(word.id) ? 1 : 6,
      mastery: weakestIds.has(word.id) ? 17 : 100,
      card: {
        due: '2026-07-21T00:00:00.000Z',
        stability: weakestIds.has(word.id) ? 1 : 10,
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

    const priorIds = new Set(Array.from(
      { length: BOSS_LEVEL_INTERVAL - 1 },
      (_, index) => getJourneyLevelEntries(words, index),
    ).flat().map((word) => word.id));
    expect(bossEntries).toHaveLength(WORDS_PER_LEVEL * NORMAL_LEVELS_PER_BOSS);
    expect(bossEntries.every((word) => priorIds.has(word.id))).toBe(true);
    expect(bossEntries.slice(0, 10).every((word) => weakestIds.has(word.id))).toBe(true);
  });

  it('keeps below-level basics as common anchors instead of creating a simple tail', () => {
    const words: WordEntry[] = [
      { ...TEST_WORDS[0], id: 'the', word: 'the', sourceTags: ['gk', 'zk'] },
      { ...TEST_WORDS[0], id: 'abandon', word: 'abandon', sourceTags: ['cet4', 'cet6', 'gk'] },
      { ...TEST_WORDS[0], id: 'and', word: 'and', sourceTags: ['gk', 'zk'] },
      { ...TEST_WORDS[0], id: 'diverse', word: 'diverse', sourceTags: ['cet6', 'gk'] },
    ];

    expect(getJourneyLevelEntries(words, 0, 'gaokao').map((word) => word.id))
      .toEqual(['the', 'abandon', 'and', 'diverse']);
  });

  it('advances on battle victory without consulting mastery percentage', () => {
    expect(resolveLevelCompletionAction(0, 148, false)).toBe('continue');
    expect(resolveLevelCompletionAction(0, 148, true)).toBe('next');
    expect(resolveLevelCompletionAction(147, 148, true)).toBe('finished');
  });
});
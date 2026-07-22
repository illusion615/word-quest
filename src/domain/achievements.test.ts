import { describe, expect, it } from 'vitest';
import { createEmptyGameProgress } from './gameProgress';
import type { LearningStats } from './progress';
import {
  ACHIEVEMENTS,
  achievementPercent,
  achievementValue,
  createEmptyAchievementState,
  newlyUnlockedAchievements,
  parseAchievementState,
  unlockAchievements,
  type AchievementSnapshot,
} from './achievements';

const EMPTY_STATS: LearningStats = {
  learned: 0,
  mastered: 0,
  due: 0,
  today: 0,
  accuracy: 0,
  streak: 0,
};

function snapshot(overrides: Partial<AchievementSnapshot> = {}): AchievementSnapshot {
  return {
    gameProgress: createEmptyGameProgress(),
    learningStats: EMPTY_STATS,
    activeBoosts: {},
    ...overrides,
  };
}

describe('achievements', () => {
  it('starts locked with zero progress', () => {
    const current = snapshot();
    expect(newlyUnlockedAchievements(current, createEmptyAchievementState())).toEqual([]);
    expect(ACHIEVEMENTS.every((achievement) => achievementValue(achievement, current) === 0))
      .toBe(true);
  });

  it('unlocks the word king when every boost is maxed', () => {
    const current = snapshot({
      activeBoosts: { haste: 5, silentWord: 1, hiddenCount: 1 },
    });
    const unlocked = newlyUnlockedAchievements(current, createEmptyAchievementState());

    expect(unlocked.map((achievement) => achievement.id)).toEqual(['word-king']);
    expect(achievementPercent(unlocked[0], current)).toBe(100);
  });

  it('tracks short and long-term progress from existing game data', () => {
    const gameProgress = createEmptyGameProgress();
    gameProgress.clearedLevels = Array.from({ length: 7 }, (_, index) => `gaokao:level:${index + 1}`);
    gameProgress.clearedBossLevels = ['gaokao:level:5'];
    gameProgress.totals.highestCombo = 5;
    gameProgress.levelResults['gaokao:level:1'] = {
      stars: 3,
      bestCombo: 5,
      bestScore: 900,
      wins: 1,
      attempts: 1,
      updatedAt: '2026-07-22T00:00:00.000Z',
    };
    const current = snapshot({
      gameProgress,
      learningStats: { ...EMPTY_STATS, learned: 42, streak: 3 },
    });
    const ids = newlyUnlockedAchievements(current, createEmptyAchievementState())
      .map((achievement) => achievement.id);

    expect(ids).toEqual([
      'first-victory',
      'three-stars',
      'combo-five',
      'boss-breaker',
      'three-day-streak',
    ]);
    const tenLevels = ACHIEVEMENTS.find((achievement) => achievement.id === 'ten-levels');
    expect(tenLevels && achievementPercent(tenLevels, current)).toBe(70);
  });

  it('does not unlock the same achievement twice', () => {
    const current = snapshot({ activeBoosts: { haste: 5, silentWord: 1, hiddenCount: 1 } });
    const definition = ACHIEVEMENTS.find((achievement) => achievement.id === 'word-king')!;
    const state = unlockAchievements(
      createEmptyAchievementState(),
      [definition],
      '2026-07-22T00:00:00.000Z',
    );

    expect(newlyUnlockedAchievements(current, state)).toEqual([]);
    expect(state.unlockedAt['word-king']).toBe('2026-07-22T00:00:00.000Z');
  });

  it('sanitizes persisted achievement data', () => {
    const state = parseAchievementState(JSON.stringify({
      version: 1,
      unlockedAt: {
        'first-victory': '2026-07-22T00:00:00.000Z',
        bogus: '2026-07-22T00:00:00.000Z',
        'word-king': 123,
      },
    }));

    expect(state.unlockedAt).toEqual({
      'first-victory': '2026-07-22T00:00:00.000Z',
    });
    expect(parseAchievementState('broken')).toEqual(createEmptyAchievementState());
  });
});

import { describe, expect, it } from 'vitest';
import { combatReducer, createCombatState } from './combat';
import {
  calculateStars,
  createEmptyGameProgress,
  getClearedBossLevelSet,
  getClearedLevelNumberSet,
  getLatestChallengeAt,
  levelResultKey,
  parseGameProgress,
  recordLevelResult,
} from './gameProgress';

function victory(correct = 9, total = 10, bestCombo = 5) {
  let state = combatReducer(createCombatState(total), { type: 'start', skillId: 'steady' });
  for (let index = 0; index < total; index += 1) {
    state = combatReducer(state, {
      type: 'answer',
      answer: {
        correct: index < correct,
        responseTimeMs: 5_000,
        timeLimitMs: 10_000,
        mode: 'boss',
        usedHint: false,
      },
    });
  }
  return { ...state, phase: 'victory' as const, bestCombo };
}

describe('game progress', () => {
  it('awards stars from victory accuracy and combo', () => {
    expect(calculateStars(victory(9, 10, 5))).toBe(3);
    expect(calculateStars(victory(8, 10, 2))).toBe(2);
    expect(calculateStars(victory(7, 10, 2))).toBe(1);
    expect(calculateStars({ ...victory(), phase: 'defeat' })).toBe(0);
  });

  it('keeps best results while accumulating attempts and wins', () => {
    const first = recordLevelResult(
      createEmptyGameProgress(),
      'gaokao',
      1,
      victory(9, 10, 5),
      'normal',
      true,
      '2026-07-20T00:00:00.000Z',
    );
    const second = recordLevelResult(
      first,
      'gaokao',
      1,
      { ...victory(8, 10, 2), score: 20 },
      'normal',
      true,
      '2026-07-21T00:00:00.000Z',
    );
    const result = second.levelResults[levelResultKey('gaokao', 1)];

    expect(result).toMatchObject({ stars: 3, bestCombo: 5, wins: 2, attempts: 2 });
    expect(second.totals.monstersDefeated).toBe(2);
  });

  it('records a win without clearing while unseen words remain', () => {
    const progress = recordLevelResult(
      createEmptyGameProgress(),
      'gaokao',
      1,
      victory(9, 10, 5),
      'normal',
      false,
      '2026-07-20T00:00:00.000Z',
    );

    expect(progress.levelResults[levelResultKey('gaokao', 1)]?.wins).toBe(1);
    expect(getClearedLevelNumberSet(progress, 'gaokao').has(1)).toBe(false);
  });

  it('finds the latest challenge for the selected word bank', () => {
    const first = recordLevelResult(
      createEmptyGameProgress(),
      'gaokao',
      1,
      victory(),
      'normal',
      true,
      '2026-07-20T08:00:00.000Z',
    );
    const second = recordLevelResult(
      first,
      'cet4',
      1,
      victory(),
      'normal',
      true,
      '2026-07-22T08:00:00.000Z',
    );
    const latest = recordLevelResult(
      second,
      'gaokao',
      2,
      victory(),
      'normal',
      true,
      '2026-07-21T08:00:00.000Z',
    );

    expect(getLatestChallengeAt(latest, 'gaokao')).toBe('2026-07-21T08:00:00.000Z');
    expect(getLatestChallengeAt(latest, 'toefl')).toBeNull();
  });

  it('persists boss clear only when boss battle is won', () => {
    const defeatState = { ...victory(4, 10, 2), phase: 'defeat' as const };
    const afterDefeat = recordLevelResult(
      createEmptyGameProgress(),
      'gaokao',
      5,
      defeatState,
      'boss',
      false,
      '2026-07-20T00:00:00.000Z',
    );
    const afterVictory = recordLevelResult(
      afterDefeat,
      'gaokao',
      5,
      victory(9, 10, 5),
      'boss',
      true,
      '2026-07-21T00:00:00.000Z',
    );

    expect(getClearedBossLevelSet(afterDefeat).has('gaokao:level:5')).toBe(false);
    expect(getClearedBossLevelSet(afterVictory).has('gaokao:level:5')).toBe(true);
  });

  it('recovers safely from malformed storage', () => {
    expect(parseGameProgress('{bad')).toEqual(createEmptyGameProgress());
    expect(parseGameProgress('{"version":2}')).toEqual(createEmptyGameProgress());
  });

  it('migrates historical wins into cleared levels', () => {
    const result = {
      stars: 2,
      bestCombo: 4,
      bestScore: 100,
      wins: 1,
      attempts: 1,
      updatedAt: '2026-07-20T00:00:00.000Z',
    };
    const migrated = parseGameProgress(JSON.stringify({
      version: 1,
      levelResults: { 'gaokao:level:3': result },
      clearedBossLevels: [],
      totals: { monstersDefeated: 1, criticalHits: 0, highestCombo: 4 },
    }));

    expect(getClearedLevelNumberSet(migrated, 'gaokao').has(3)).toBe(true);
  });

  it('moves legacy word levels around inserted Boss nodes without losing Boss clears', () => {
    const result = {
      stars: 3 as const,
      bestCombo: 5,
      bestScore: 900,
      wins: 1,
      attempts: 1,
      updatedAt: '2026-07-20T00:00:00.000Z',
    };
    const migrated = parseGameProgress(JSON.stringify({
      version: 1,
      levelResults: {
        'gaokao:level:5': result,
        'gaokao:level:6': { ...result, stars: 2 },
      },
      clearedLevels: Array.from({ length: 6 }, (_, index) => `gaokao:level:${index + 1}`),
      clearedBossLevels: ['gaokao:level:5'],
      totals: { monstersDefeated: 6, criticalHits: 2, highestCombo: 5 },
    }));

    expect(migrated.journeyLayoutVersion).toBe(2);
    expect(getClearedLevelNumberSet(migrated, 'gaokao')).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
    expect(migrated.levelResults['gaokao:level:5']).toMatchObject({ stars: 3 });
    expect(migrated.levelResults['gaokao:level:6']).toMatchObject({ stars: 3 });
    expect(migrated.levelResults['gaokao:level:7']).toMatchObject({ stars: 2 });
    expect(getClearedBossLevelSet(migrated).has('gaokao:level:5')).toBe(true);
  });

  it('does not promote a new non-clearing win after persistence', () => {
    const partial = recordLevelResult(
      createEmptyGameProgress(),
      'gaokao',
      1,
      victory(9, 10, 5),
      'normal',
      false,
      '2026-07-20T00:00:00.000Z',
    );
    const hydrated = parseGameProgress(JSON.stringify(partial));

    expect(hydrated.levelResults[levelResultKey('gaokao', 1)]?.wins).toBe(1);
    expect(getClearedLevelNumberSet(hydrated, 'gaokao').has(1)).toBe(false);
  });
});
import { describe, expect, it } from 'vitest';
import {
  applyBoost,
  boostCount,
  boostEffects,
  canOffer,
  drawBoostOffers,
  dropRandomBoost,
  sanitizeActiveBoosts,
  type ActiveBoosts,
} from './challengeBoosts';

function seeded(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('challengeBoosts', () => {
  it('starts with a neutral effect profile', () => {
    expect(boostEffects({})).toEqual({
      timeScale: 1,
      hideMonsterWord: false,
      hideAnswerCount: false,
      hidePassageDuringQuestions: false,
      preferSimilarDistractors: false,
      extraOptionCount: 0,
      shieldPenalty: 0,
    });
    expect(boostCount({})).toBe(0);
  });

  it('compounds haste time scale and floors it', () => {
    const three: ActiveBoosts = { haste: 3 };
    expect(boostEffects(three).timeScale).toBeCloseTo(0.729, 3);
    const many: ActiveBoosts = { haste: 20 };
    expect(boostEffects(many).timeScale).toBe(0.4);
  });

  it('toggles hide effects and counts total stacks', () => {
    const active = applyBoost(applyBoost({ haste: 2 }, 'silentWord'), 'hiddenCount');
    const effects = boostEffects(active);
    expect(effects.hideMonsterWord).toBe(true);
    expect(effects.hideAnswerCount).toBe(true);
    expect(boostCount(active)).toBe(4);
  });

  it('combines the new recall, distractor, option, and shield effects', () => {
    const active: ActiveBoosts = {
      hiddenPassage: 1,
      similarDistractors: 1,
      extraOptions: 2,
      thinShield: 2,
    };

    expect(boostEffects(active)).toMatchObject({
      hidePassageDuringQuestions: true,
      preferSimilarDistractors: true,
      extraOptionCount: 2,
      shieldPenalty: 2,
    });
    expect(boostCount(active)).toBe(6);
  });

  it('caps stackable boosts at their maximum', () => {
    let active: ActiveBoosts = {};
    for (let i = 0; i < 10; i += 1) active = applyBoost(active, 'haste');
    expect(active.haste).toBe(5);
    expect(canOffer({ id: 'haste', name: '', description: '', stackable: true, maxStacks: 5 }, active)).toBe(false);
  });

  it('only offers boosts that still have room', () => {
    const active: ActiveBoosts = {
      silentWord: 1,
      hiddenCount: 1,
      hiddenPassage: 1,
      similarDistractors: 1,
      extraOptions: 2,
      thinShield: 2,
    };
    const offers = drawBoostOffers(active, 3, seeded([0]));
    expect(offers.map((o) => o.id)).toEqual(['haste']);
  });

  it('returns an empty offer list when every boost is maxed', () => {
    const active: ActiveBoosts = {
      haste: 5,
      silentWord: 1,
      hiddenCount: 1,
      hiddenPassage: 1,
      similarDistractors: 1,
      extraOptions: 2,
      thinShield: 2,
    };
    expect(drawBoostOffers(active, 3, seeded([0]))).toEqual([]);
  });

  it('drops a random owned boost and removes empty entries', () => {
    const active: ActiveBoosts = { haste: 1, silentWord: 1 };
    const { next, dropped } = dropRandomBoost(active, seeded([0]));
    expect(dropped).toBe('haste');
    expect(next.haste).toBeUndefined();
    expect(next.silentWord).toBe(1);
  });

  it('drops nothing when no boosts are active', () => {
    expect(dropRandomBoost({}, seeded([0]))).toEqual({ next: {}, dropped: null });
  });

  it('sanitizes persisted values', () => {
    expect(sanitizeActiveBoosts({
      haste: 9,
      silentWord: 1,
      hiddenPassage: 4,
      extraOptions: 9,
      thinShield: 2,
      bogus: 3,
      hiddenCount: 0,
    })).toEqual({
      haste: 5,
      silentWord: 1,
      hiddenPassage: 1,
      extraOptions: 2,
      thinShield: 2,
    });
    expect(sanitizeActiveBoosts(null)).toEqual({});
    expect(sanitizeActiveBoosts('nope')).toEqual({});
  });
});

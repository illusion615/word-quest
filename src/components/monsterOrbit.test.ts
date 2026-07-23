import { describe, expect, it } from 'vitest';
import {
  circularSlot,
  monsterOrbitPosition,
  monsterOrbitRotation,
} from './monsterOrbit';

describe('monster orbit', () => {
  it('wraps the queue around both sides from the first question', () => {
    expect(Array.from({ length: 5 }, (_, index) => circularSlot(index, 0, 5)))
      .toEqual([0, 1, 2, -2, -1]);
    expect(Array.from({ length: 4 }, (_, index) => circularSlot(index, 0, 4)))
      .toEqual([0, 1, 2, -1]);
  });

  it('keeps the focus closest and mirrors equal slots across the arc', () => {
    const focus = monsterOrbitPosition(2, 2, 5);
    const right = monsterOrbitPosition(3, 2, 5);
    const left = monsterOrbitPosition(1, 2, 5);

    expect(focus).toMatchObject({ slot: 0, baseAngleDeg: 144, x: 0, depth: 0, rise: 0, scale: 1, opacity: 1 });
    expect(left.x).toBeCloseTo(-right.x, 8);
    expect(left.depth).toBeCloseTo(right.depth, 8);
    expect(left.rise).toBeCloseTo(right.rise, 8);
    expect(left.facingDeg).toBeCloseTo(-right.facingDeg, 8);
    expect(right.scale).toBeLessThan(focus.scale);
  });

  it('rotates every monster by exactly one carousel slot when focus advances', () => {
    const before = Array.from({ length: 5 }, (_, index) => (
      monsterOrbitPosition(index, 0, 5).slot
    ));
    const after = Array.from({ length: 5 }, (_, index) => (
      monsterOrbitPosition(index, 1, 5).slot
    ));

    expect(before).toEqual([0, 1, 2, -2, -1]);
    expect(after).toEqual([-1, 0, 1, 2, -2]);
    expect(monsterOrbitRotation(0, 5)).toBe(-0);
    expect(monsterOrbitRotation(1, 5)).toBe(-72);
    expect(monsterOrbitRotation(2, 5)).toBe(-144);
  });

  it('hides only the exact back slot so no narrow silhouette peeks behind the focus', () => {
    const positions = Array.from({ length: 4 }, (_, index) => (
      monsterOrbitPosition(index, 2, 4)
    ));

    expect(positions[0]).toMatchObject({ angleDeg: 180, depth: 1, opacity: 0 });
    expect(positions[1].opacity).toBeGreaterThan(0);
    expect(positions[2]).toMatchObject({ angleDeg: 0, opacity: 1 });
    expect(positions[3].opacity).toBeGreaterThan(0);
  });
});
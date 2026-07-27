export interface MonsterOrbitPosition {
  slot: number;
  baseAngleDeg: number;
  angleDeg: number;
  x: number;
  depth: number;
  rise: number;
  facingDeg: number;
  scale: number;
  opacity: number;
}

/**
 * Wraps a queue index onto the shortest signed path around the carousel.
 * Even-sized queues put the exactly-opposite monster at the back-right so the
 * next monster always approaches the player from the same direction.
 */
export function circularSlot(index: number, focusIndex: number, count: number): number {
  if (count <= 1) return 0;
  const forward = ((index - focusIndex) % count + count) % count;
  return forward > count / 2 ? forward - count : forward;
}

function orbitStep(count: number): number {
  if (count <= 1) return 0;
  // Two monsters need an opponent visible at the side rather than directly
  // behind the focus. Waves of 3+ occupy equal slots on a complete ring.
  return count === 2 ? 82 : 360 / count;
}

export function monsterOrbitRotation(focusIndex: number, count: number): number {
  return -Math.max(0, focusIndex) * orbitStep(count);
}

/**
 * Projects one monster onto a wide elliptical carousel. The focused monster is
 * at the front (angle 0); neighbours move sideways via sine and recede/rise via
 * cosine, so changing focus rotates the whole formation instead of sliding a
 * compressed line.
 */
export function monsterOrbitPosition(
  index: number,
  focusIndex: number,
  count: number,
): MonsterOrbitPosition {
  const slot = circularSlot(index, focusIndex, count);
  const step = orbitStep(count);
  const baseAngleDeg = index * step;
  const angleDeg = slot * step;
  const angleRad = angleDeg * (Math.PI / 180);
  const depth = (1 - Math.cos(angleRad)) / 2;
  const side = Math.abs(Math.sin(angleRad));
  const hiddenBehindFocus = depth > 0.98;

  return {
    slot,
    baseAngleDeg,
    angleDeg,
    x: Math.sin(angleRad),
    depth,
    rise: depth,
    // Counter most of the ring rotation so every monster remains readable,
    // while a small residual turn still reveals the curvature of the formation.
    facingDeg: -angleDeg * 0.92,
    scale: Math.max(0.62, 1 - (depth * 0.32) - (side * 0.03)),
    opacity: hiddenBehindFocus
      ? 0
      : Math.max(0.22, 1 - (depth * 0.78) - (side * 0.04)),
  };
}
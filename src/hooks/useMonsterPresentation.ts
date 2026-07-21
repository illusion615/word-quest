import { useEffect, useRef, useState } from 'react';
import type { CombatState } from '../domain/combat';
import {
  getMonsterPresentationSequence,
  type MonsterPose,
} from '../components/monsterPresentation';

export function useMonsterPresentation(state: CombatState): MonsterPose {
  const [pose, setPose] = useState<MonsterPose>('idle');
  const sequenceIdRef = useRef(0);

  useEffect(() => {
    const sequenceId = sequenceIdRef.current + 1;
    sequenceIdRef.current = sequenceId;
    const timers: number[] = [];
    const sequence = getMonsterPresentationSequence(state);

    function playStep(index: number) {
      if (sequenceIdRef.current !== sequenceId) return;
      const step = sequence[index];
      if (!step) return;
      setPose(step.pose);
      if (step.durationMs === undefined) return;
      timers.push(window.setTimeout(() => playStep(index + 1), step.durationMs));
    }

    playStep(0);
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [state.enemyHealth, state.lastEvent?.id, state.phase]);

  return pose;
}
import { useEffect, useState } from 'react';
import {
  ROSTER_CHALLENGE_DURATION_MS,
  type RosterMonsterPose,
} from '../components/rosterMonsterPresentation';

export function useRosterMonsterPresentation(activeWordId?: string): RosterMonsterPose {
  const [pose, setPose] = useState<RosterMonsterPose>(activeWordId ? 'challenge' : 'aloof');

  useEffect(() => {
    if (!activeWordId) {
      setPose('aloof');
      return undefined;
    }

    setPose('challenge');
    const timer = window.setTimeout(() => setPose('aloof'), ROSTER_CHALLENGE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [activeWordId]);

  return pose;
}
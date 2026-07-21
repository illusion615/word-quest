import { useCallback, useState } from 'react';
import {
  combatReducer,
  createCombatState,
  type CombatSkillId,
  type CombatState,
} from '../domain/combat';
import type { ResolvedAnswerEvent } from '../domain/session';

export interface CombatController {
  state: CombatState;
  prepareCombat: (questionCount: number) => void;
  chooseSkill: (skillId: CombatSkillId) => void;
  resolveAnswer: (event: ResolvedAnswerEvent) => void;
  finishCombat: () => void;
  resetCombat: () => void;
}

const initialState = createCombatState(1);

export function useCombat(): CombatController {
  const [state, setState] = useState<CombatState>(initialState);

  const prepareCombat = useCallback((questionCount: number) => {
    setState(createCombatState(questionCount));
  }, []);

  const chooseSkill = useCallback((skillId: CombatSkillId) => {
    setState((current) => combatReducer(current, { type: 'start', skillId }));
  }, []);

  const resolveAnswer = useCallback((event: ResolvedAnswerEvent) => {
    setState((current) => combatReducer(current, {
      type: 'answer',
      answer: { ...event, usedHint: false },
    }));
  }, []);

  const finishCombat = useCallback(() => {
    setState((current) => combatReducer(current, { type: 'finish' }));
  }, []);

  const resetCombat = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, prepareCombat, chooseSkill, resolveAnswer, finishCombat, resetCombat };
}
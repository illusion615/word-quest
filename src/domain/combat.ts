import type { GameMode } from './models';

export const DEFAULT_PLAYER_SHIELD = 3;
export const DEFAULT_BASE_DAMAGE = 10;
export const CRITICAL_TIME_RATIO = 0.4;
export const HINT_DAMAGE_MULTIPLIER = 0.7;

export type CombatSkillId = 'steady' | 'echo' | 'rush';

export interface CombatSkill {
  id: CombatSkillId;
  name: string;
  description: string;
  tradeoff: string;
}

export const COMBAT_SKILLS: CombatSkill[] = [
  {
    id: 'steady',
    name: '稳扎',
    description: '第一次答错不会清空已经积累的连击。',
    tradeoff: '仍会损失 1 点护盾',
  },
  {
    id: 'echo',
    name: '回响',
    description: '听音拼写命中时，战斗伤害提高 50%。',
    tradeoff: '其他题型伤害不变',
  },
  {
    id: 'rush',
    name: '狂卷',
    description: '暴击伤害提高到 2 倍。',
    tradeoff: '必须在时限 30% 内作答才暴击',
  },
];
export type CombatPhase = 'ready' | 'fighting' | 'victory' | 'defeat';
export type CombatEventKind = 'hit' | 'hurt' | 'victory' | 'defeat';

export interface ResolvedCombatAnswer {
  correct: boolean;
  responseTimeMs: number;
  timeLimitMs: number;
  mode: GameMode;
  usedHint: boolean;
}

export interface CombatEvent {
  id: number;
  kind: CombatEventKind;
  damage: number;
  critical: boolean;
  combo: number;
  enemyDefeated: boolean;
  playerShield: number;
}

export interface CombatState {
  phase: CombatPhase;
  skillId: CombatSkillId | null;
  skillTriggered: boolean;
  playerShield: number;
  maxPlayerShield: number;
  enemyHealth: number;
  maxEnemyHealth: number;
  combo: number;
  bestCombo: number;
  answersResolved: number;
  correctAnswers: number;
  criticalHits: number;
  totalDamage: number;
  score: number;
  lastEvent: CombatEvent | null;
}

export type CombatAction =
  | { type: 'start'; skillId: CombatSkillId }
  | { type: 'answer'; answer: ResolvedCombatAnswer }
  | { type: 'finish' };

interface CombatOptions {
  playerShield?: number;
  baseDamage?: number;
}

function clampPositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.round(value));
}

export function createCombatState(
  questionCount: number,
  options: CombatOptions = {},
): CombatState {
  const maxPlayerShield = clampPositiveInteger(
    options.playerShield ?? DEFAULT_PLAYER_SHIELD,
    DEFAULT_PLAYER_SHIELD,
  );
  const expectedQuestions = clampPositiveInteger(questionCount, 1);
  // One monster per question; the roster is cleared by facing every monster and
  // surviving, not by draining a shared health bar.
  const maxEnemyHealth = expectedQuestions;

  return {
    phase: 'ready',
    skillId: null,
    skillTriggered: false,
    playerShield: maxPlayerShield,
    maxPlayerShield,
    enemyHealth: maxEnemyHealth,
    maxEnemyHealth,
    combo: 0,
    bestCombo: 0,
    answersResolved: 0,
    correctAnswers: 0,
    criticalHits: 0,
    totalDamage: 0,
    score: 0,
    lastEvent: null,
  };
}

function isCritical(answer: ResolvedCombatAnswer, skillId: CombatSkillId | null): boolean {
  if (!answer.correct || answer.usedHint || answer.timeLimitMs <= 0) return false;
  const timeRatio = skillId === 'rush' ? 0.3 : CRITICAL_TIME_RATIO;
  return answer.responseTimeMs <= answer.timeLimitMs * timeRatio;
}

function comboMultiplier(combo: number): number {
  return 1 + Math.min(0.5, Math.floor(Math.max(0, combo - 1) / 3) * 0.1);
}

function calculateDamage(
  answer: ResolvedCombatAnswer,
  combo: number,
  skillId: CombatSkillId | null,
  baseDamage = DEFAULT_BASE_DAMAGE,
): { damage: number; critical: boolean } {
  if (!answer.correct) return { damage: 0, critical: false };
  const critical = isCritical(answer, skillId);
  const criticalMultiplier = critical ? (skillId === 'rush' ? 2 : 1.5) : 1;
  const modeMultiplier = skillId === 'echo' && answer.mode === 'listening' ? 1.5 : 1;
  const hintMultiplier = answer.usedHint ? HINT_DAMAGE_MULTIPLIER : 1;
  const damage = Math.max(1, Math.round(
    baseDamage
      * comboMultiplier(combo)
      * criticalMultiplier
      * modeMultiplier
      * hintMultiplier,
  ));
  return { damage, critical };
}

function event(
  state: CombatState,
  values: Omit<CombatEvent, 'id' | 'playerShield'>,
  playerShield = state.playerShield,
): CombatEvent {
  return {
    id: state.answersResolved + 1,
    playerShield,
    ...values,
  };
}

export function combatReducer(state: CombatState, action: CombatAction): CombatState {
  if (action.type === 'start') {
    return state.phase === 'ready'
      ? { ...state, phase: 'fighting', skillId: action.skillId }
      : state;
  }

  if (action.type === 'answer') {
    if (state.phase !== 'fighting') return state;
    const answersResolved = state.answersResolved + 1;

    if (!action.answer.correct) {
      const playerShield = Math.max(0, state.playerShield - 1);
      const defeated = playerShield === 0;
      const protectCombo = state.skillId === 'steady' && !state.skillTriggered;
      const combo = protectCombo ? state.combo : 0;
      // A missed monster still leaves the field (its turn passes), so the roster
      // advances even though the learner took the hit.
      const enemyHealth = Math.max(0, state.enemyHealth - 1);
      return {
        ...state,
        phase: defeated ? 'defeat' : 'fighting',
        playerShield,
        enemyHealth,
        combo,
        skillTriggered: state.skillTriggered || protectCombo,
        answersResolved,
        lastEvent: event(state, {
          kind: defeated ? 'defeat' : 'hurt',
          damage: 0,
          critical: false,
          combo,
          enemyDefeated: enemyHealth === 0,
        }, playerShield),
      };
    }

    const combo = state.combo + 1;
    const { damage, critical } = calculateDamage(action.answer, combo, state.skillId);
    // Each correct answer fells exactly one monster; damage only drives score juice.
    const enemyHealth = Math.max(0, state.enemyHealth - 1);
    return {
      ...state,
      enemyHealth,
      combo,
      bestCombo: Math.max(state.bestCombo, combo),
      answersResolved,
      correctAnswers: state.correctAnswers + 1,
      criticalHits: state.criticalHits + (critical ? 1 : 0),
      totalDamage: state.totalDamage + damage,
      score: state.score + damage * 10 + combo * 5,
      lastEvent: event(state, {
        kind: 'hit',
        damage,
        critical,
        combo,
        enemyDefeated: enemyHealth === 0,
      }),
    };
  }

  if (state.phase === 'victory' || state.phase === 'defeat') return state;
  const victory = state.enemyHealth === 0 && state.playerShield > 0;
  return {
    ...state,
    phase: victory ? 'victory' : 'defeat',
    lastEvent: event(state, {
      kind: victory ? 'victory' : 'defeat',
      damage: 0,
      critical: false,
      combo: state.combo,
      enemyDefeated: state.enemyHealth === 0,
    }),
  };
}
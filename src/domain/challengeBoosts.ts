// "不够卷，再强一点" — a stacking roguelike difficulty system. Before each
// battle the player picks one difficulty boost from a random draw; picks
// accumulate across levels. Answering wrong drops a random boost, so the run
// self-balances toward the player's real ceiling.

export type BoostId =
  | 'haste'
  | 'silentWord'
  | 'hiddenCount'
  | 'hiddenPassage'
  | 'similarDistractors'
  | 'extraOptions'
  | 'thinShield';

export interface BoostDef {
  id: BoostId;
  name: string;
  description: string;
  /** Whether the boost can be taken more than once (its effect compounds). */
  stackable: boolean;
  maxStacks: number;
}

export const BOOST_DEFS: readonly BoostDef[] = [
  {
    id: 'haste',
    name: '疾风',
    description: '每道题的作答时间再缩短 10%。',
    stackable: true,
    maxStacks: 5,
  },
  {
    id: 'silentWord',
    name: '蒙面',
    description: '词怪头顶不再显示目标词，只能靠记忆辨认。',
    stackable: false,
    maxStacks: 1,
  },
  {
    id: 'hiddenCount',
    name: '隐数',
    description: '识义题不再提示正确释义的数量。',
    stackable: false,
    maxStacks: 1,
  },
  {
    id: 'hiddenPassage',
    name: '断章',
    description: '记忆串预览结束后，答题时不再显示原文。',
    stackable: false,
    maxStacks: 1,
  },
  {
    id: 'similarDistractors',
    name: '拟态',
    description: '干扰项优先使用相同词性、相近词频的单词。',
    stackable: false,
    maxStacks: 1,
  },
  {
    id: 'extraOptions',
    name: '人海',
    description: '选择题额外增加 1 个干扰项。',
    stackable: true,
    maxStacks: 2,
  },
  {
    id: 'thinShield',
    name: '薄甲',
    description: '卷王护盾上限减少 1 格。',
    stackable: true,
    maxStacks: 2,
  },
];

/** How many stacks of each boost are currently active. */
export type ActiveBoosts = Partial<Record<BoostId, number>>;

export interface BoostEffects {
  /** Multiplier applied to every question's time limit. */
  timeScale: number;
  /** Hide the target word floating above each monster. */
  hideMonsterWord: boolean;
  /** Hide the "共 N 项" hint on meaning-selection questions. */
  hideAnswerCount: boolean;
  /** Hide the generated reading after its preview phase. */
  hidePassageDuringQuestions: boolean;
  /** Prefer distractors with matching part of speech and nearby frequency. */
  preferSimilarDistractors: boolean;
  /** Number of distractors added to supported choice questions. */
  extraOptionCount: number;
  /** Amount subtracted from the combat shield at battle start. */
  shieldPenalty: number;
}

const HASTE_STEP = 0.9;
const MIN_TIME_SCALE = 0.4;

export function boostStacks(active: ActiveBoosts, id: BoostId): number {
  return active[id] ?? 0;
}

export function boostCount(active: ActiveBoosts): number {
  return BOOST_DEFS.reduce((sum, def) => sum + boostStacks(active, def.id), 0);
}

export function boostName(id: BoostId): string {
  return BOOST_DEFS.find((def) => def.id === id)?.name ?? id;
}

export function boostDef(id: BoostId): BoostDef | undefined {
  return BOOST_DEFS.find((def) => def.id === id);
}

export function boostEffects(active: ActiveBoosts): BoostEffects {
  const haste = boostStacks(active, 'haste');
  return {
    timeScale: Math.max(MIN_TIME_SCALE, HASTE_STEP ** haste),
    hideMonsterWord: boostStacks(active, 'silentWord') > 0,
    hideAnswerCount: boostStacks(active, 'hiddenCount') > 0,
    hidePassageDuringQuestions: boostStacks(active, 'hiddenPassage') > 0,
    preferSimilarDistractors: boostStacks(active, 'similarDistractors') > 0,
    extraOptionCount: boostStacks(active, 'extraOptions'),
    shieldPenalty: boostStacks(active, 'thinShield'),
  };
}

export function canOffer(def: BoostDef, active: ActiveBoosts): boolean {
  return boostStacks(active, def.id) < def.maxStacks;
}

export function applyBoost(active: ActiveBoosts, id: BoostId): ActiveBoosts {
  const def = boostDef(id);
  if (!def) return active;
  const current = boostStacks(active, id);
  if (current >= def.maxStacks) return active;
  return { ...active, [id]: current + 1 };
}

export function drawBoostOffers(
  active: ActiveBoosts,
  count = 3,
  random: () => number = Math.random,
): BoostDef[] {
  const pool = BOOST_DEFS.filter((def) => canOffer(def, active));
  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled.slice(0, Math.max(1, count));
}

export function dropRandomBoost(
  active: ActiveBoosts,
  random: () => number = Math.random,
): { next: ActiveBoosts; dropped: BoostId | null } {
  const owned = BOOST_DEFS.filter((def) => boostStacks(active, def.id) > 0);
  if (owned.length === 0) return { next: active, dropped: null };
  const pick = owned[Math.floor(random() * owned.length)];
  const nextStacks = boostStacks(active, pick.id) - 1;
  const next: ActiveBoosts = { ...active };
  if (nextStacks <= 0) delete next[pick.id];
  else next[pick.id] = nextStacks;
  return { next, dropped: pick.id };
}

export function sanitizeActiveBoosts(value: unknown): ActiveBoosts {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const next: ActiveBoosts = {};
  for (const def of BOOST_DEFS) {
    const raw = source[def.id];
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      next[def.id] = Math.min(def.maxStacks, Math.floor(raw));
    }
  }
  return next;
}

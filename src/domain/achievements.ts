import type { ActiveBoosts } from './challengeBoosts';
import { BOOST_DEFS, boostCount } from './challengeBoosts';
import type { GameProgressV1 } from './gameProgress';
import type { LearningStats } from './progress';

export type AchievementId =
  | 'first-victory'
  | 'three-stars'
  | 'combo-five'
  | 'boss-breaker'
  | 'ten-levels'
  | 'hundred-words'
  | 'three-day-streak'
  | 'word-king';

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
  tier: AchievementTier;
  target: number;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first-victory',
    title: '初战告捷',
    description: '首次击败一关词怪。',
    tier: 'bronze',
    target: 1,
  },
  {
    id: 'three-stars',
    title: '满星通关',
    description: '在任意关卡拿到 3 星评价。',
    tier: 'silver',
    target: 3,
  },
  {
    id: 'combo-five',
    title: '连卷成章',
    description: '在一场战斗中达成 5 连击。',
    tier: 'silver',
    target: 5,
  },
  {
    id: 'boss-breaker',
    title: '首领克星',
    description: '首次击败 Boss 关卡。',
    tier: 'gold',
    target: 1,
  },
  {
    id: 'ten-levels',
    title: '十关连破',
    description: '累计通关 10 个关卡。',
    tier: 'gold',
    target: 10,
  },
  {
    id: 'hundred-words',
    title: '百词入脑',
    description: '累计学习 100 个不同单词。',
    tier: 'gold',
    target: 100,
  },
  {
    id: 'three-day-streak',
    title: '三日不辍',
    description: '连续 3 天完成单词练习。',
    tier: 'silver',
    target: 3,
  },
  {
    id: 'word-king',
    title: '你是卷王',
    description: '将全部难度加成提升到上限。',
    tier: 'gold',
    target: BOOST_DEFS.reduce((sum, boost) => sum + boost.maxStacks, 0),
  },
];

export interface AchievementSnapshot {
  gameProgress: GameProgressV1;
  learningStats: LearningStats;
  activeBoosts: ActiveBoosts;
}

export interface AchievementStateV1 {
  version: 1;
  unlockedAt: Partial<Record<AchievementId, string>>;
}

export function createEmptyAchievementState(): AchievementStateV1 {
  return { version: 1, unlockedAt: {} };
}

function highestStars(progress: GameProgressV1): number {
  return Object.values(progress.levelResults).reduce(
    (maximum, result) => Math.max(maximum, result.stars),
    0,
  );
}

export function achievementValue(
  achievement: AchievementDefinition,
  snapshot: AchievementSnapshot,
): number {
  switch (achievement.id) {
    case 'first-victory':
      return snapshot.gameProgress.clearedLevels.length;
    case 'three-stars':
      return highestStars(snapshot.gameProgress);
    case 'combo-five':
      return snapshot.gameProgress.totals.highestCombo;
    case 'boss-breaker':
      return snapshot.gameProgress.clearedBossLevels.length;
    case 'ten-levels':
      return snapshot.gameProgress.clearedLevels.length;
    case 'hundred-words':
      return snapshot.learningStats.learned;
    case 'three-day-streak':
      return snapshot.learningStats.streak;
    case 'word-king':
      return boostCount(snapshot.activeBoosts);
  }
}

export function achievementPercent(
  achievement: AchievementDefinition,
  snapshot: AchievementSnapshot,
): number {
  return Math.min(100, Math.round(
    (achievementValue(achievement, snapshot) / achievement.target) * 100,
  ));
}

export function newlyUnlockedAchievements(
  snapshot: AchievementSnapshot,
  state: AchievementStateV1,
): AchievementDefinition[] {
  return ACHIEVEMENTS.filter((achievement) => (
    !state.unlockedAt[achievement.id]
    && achievementValue(achievement, snapshot) >= achievement.target
  ));
}

export function unlockAchievements(
  state: AchievementStateV1,
  achievements: readonly AchievementDefinition[],
  unlockedAt = new Date().toISOString(),
): AchievementStateV1 {
  if (achievements.length === 0) return state;
  const next = { ...state.unlockedAt };
  for (const achievement of achievements) next[achievement.id] = unlockedAt;
  return { version: 1, unlockedAt: next };
}

export function parseAchievementState(raw: string | null): AchievementStateV1 {
  if (!raw) return createEmptyAchievementState();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return createEmptyAchievementState();
    const candidate = value as Partial<AchievementStateV1>;
    if (candidate.version !== 1 || !candidate.unlockedAt || typeof candidate.unlockedAt !== 'object') {
      return createEmptyAchievementState();
    }
    const validIds = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
    const unlockedAt: AchievementStateV1['unlockedAt'] = {};
    for (const [id, timestamp] of Object.entries(candidate.unlockedAt)) {
      if (validIds.has(id as AchievementId) && typeof timestamp === 'string') {
        unlockedAt[id as AchievementId] = timestamp;
      }
    }
    return { version: 1, unlockedAt };
  } catch {
    return createEmptyAchievementState();
  }
}

export function achievementSnapshotKey(snapshot: AchievementSnapshot): string {
  return [
    snapshot.gameProgress.clearedLevels.length,
    snapshot.gameProgress.clearedBossLevels.length,
    snapshot.gameProgress.totals.highestCombo,
    highestStars(snapshot.gameProgress),
    snapshot.learningStats.learned,
    snapshot.learningStats.streak,
    boostCount(snapshot.activeBoosts),
  ].join(':');
}

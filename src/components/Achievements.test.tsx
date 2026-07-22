import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  createEmptyAchievementState,
  unlockAchievements,
  type AchievementSnapshot,
} from '../domain/achievements';
import { createEmptyGameProgress } from '../domain/gameProgress';
import { createEmptyLearningState, type LearningStats } from '../domain/progress';
import { buildGrindMetrics } from '../domain/grindMetrics';
import { AchievementDialog } from './AchievementDialog';
import { AchievementToast } from './AchievementToast';

const learningStats: LearningStats = {
  learned: 42,
  mastered: 12,
  due: 3,
  today: 8,
  accuracy: 88,
  streak: 2,
};

const snapshot: AchievementSnapshot = {
  gameProgress: createEmptyGameProgress(),
  learningStats,
  activeBoosts: {
    haste: 5,
    silentWord: 1,
    hiddenCount: 1,
    hiddenPassage: 1,
    similarDistractors: 1,
    extraOptions: 2,
    thinShield: 2,
  },
};

describe('achievement UI', () => {
  it('renders all achievements, unlock state and progress', () => {
    const wordKing = ACHIEVEMENTS.find((achievement) => achievement.id === 'word-king')!;
    const state = unlockAchievements(
      createEmptyAchievementState(),
      [wordKing],
      '2026-07-22T00:00:00.000Z',
    );
    const html = renderToStaticMarkup(
      <AchievementDialog
        open
        state={state}
        snapshot={snapshot}
        stats={learningStats}
        grind={buildGrindMetrics(createEmptyLearningState())}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('卷王成就');
    expect(html).toContain(`1 / ${ACHIEVEMENTS.length}`);
    expect(html).toContain('你是卷王');
    expect(html).toContain('达成于');
    expect((html.match(/class="achievement-item /g) ?? [])).toHaveLength(ACHIEVEMENTS.length);
  });

  it('renders nothing while the center is closed', () => {
    expect(renderToStaticMarkup(
      <AchievementDialog
        open={false}
        state={createEmptyAchievementState()}
        snapshot={snapshot}
        stats={learningStats}
        grind={buildGrindMetrics(createEmptyLearningState())}
        onClose={() => undefined}
      />,
    )).toBe('');
  });

  it('announces a newly unlocked achievement', () => {
    const wordKing = ACHIEVEMENTS.find((achievement) => achievement.id === 'word-king')!;
    const html = renderToStaticMarkup(
      <AchievementToast achievement={wordKing} onDismiss={() => undefined} />,
    );

    expect(html).toContain('成就达成');
    expect(html).toContain('你是卷王');
    expect(html).toContain('将全部难度加成提升到上限');
  });
});

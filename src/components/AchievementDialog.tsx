import type { CSSProperties } from 'react';
import {
  ACHIEVEMENTS,
  achievementPercent,
  achievementValue,
  type AchievementSnapshot,
  type AchievementStateV1,
} from '../domain/achievements';
import {
  BookOpenCheck,
  CalendarCheck,
  Clock3,
  Crown,
  Flame,
  Sparkles,
  Target,
  Trophy,
  X,
  Zap,
} from '../icons';
import type { LearningStats } from '../domain/progress';
import type { DailyGoal, GrindMetrics } from '../domain/grindMetrics';
import { AchievementIcon } from './AchievementIcon';

const TIER_META = [
  { key: 'seen', label: '初识', className: 'is-seen' },
  { key: 'reinforcing', label: '巩固中', className: 'is-reinforcing' },
  { key: 'stable', label: '稳定掌握', className: 'is-stable' },
  { key: 'ace', label: '炉火纯青', className: 'is-ace' },
] as const;

function DailyRing({ goal, label }: { goal: DailyGoal; label: string }) {
  return (
    <div
      className={`daily-ring ${goal.closed ? 'is-closed' : ''}`}
      style={{ '--ratio': goal.ratio } as CSSProperties}
    >
      <div className="daily-ring-dial" aria-hidden="true">
        <strong>{goal.done}</strong>
        <small>/ {goal.goal}</small>
      </div>
      <span>{label}</span>
    </div>
  );
}

interface AchievementDialogProps {
  open: boolean;
  state: AchievementStateV1;
  snapshot: AchievementSnapshot;
  stats: LearningStats;
  grind: GrindMetrics;
  onClose: () => void;
}

function unlockDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function AchievementDialog({
  open,
  state,
  snapshot,
  stats,
  grind,
  onClose,
}: AchievementDialogProps) {
  if (!open) return null;
  const unlockedCount = Object.keys(state.unlockedAt).length;
  const { ladder, standing, today, goals } = grind;

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="settings-dialog achievement-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="achievement-dialog-title"
      >
        <header className="achievement-dialog-header">
          <div>
            <span className="achievement-dialog-mark"><Trophy aria-hidden="true" /></span>
            <div>
              <h2 id="achievement-dialog-title">卷王成就</h2>
              <p>每一次坚持和突破都会留下记录</p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭成就">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="achievement-overview">
          <strong>{unlockedCount} / {ACHIEVEMENTS.length}</strong>
          <span>已达成</span>
          <div className="achievement-overview-track" aria-hidden="true">
            <span style={{ width: `${(unlockedCount / ACHIEVEMENTS.length) * 100}%` }} />
          </div>
        </div>

        <div className="achievement-personal">
          <div className="grind-rank" aria-label="卷王段位">
            <div className="grind-rank-badge">
              <Crown aria-hidden="true" />
              <div>
                <span>当前段位</span>
                <strong>{standing.rank.name}</strong>
              </div>
            </div>
            <div className="grind-rank-bar">
              <div className="grind-rank-track"><span style={{ width: `${standing.progressToNext}%` }} /></div>
              <small>
                {standing.nextRank
                  ? `距 ${standing.nextRank.name} 还差 ${standing.pointsToNext.toLocaleString()} 卷力`
                  : '已登顶卷王之巅'}
              </small>
            </div>
            <div className="grind-rank-total">
              <Zap aria-hidden="true" />
              <strong>{standing.total.toLocaleString()}</strong>
              <span>卷力值</span>
            </div>
          </div>

          <div className="mastery-ladder" aria-label="掌握阶梯">
            <div className="mastery-ladder-bar">
              {ladder.learned > 0
                ? TIER_META.map((tier) => {
                    const count = ladder[tier.key];
                    if (count === 0) return null;
                    return (
                      <span
                        key={tier.key}
                        className={`mastery-seg ${tier.className}`}
                        style={{ flexGrow: count }}
                        title={`${tier.label} ${count}`}
                      />
                    );
                  })
                : <span className="mastery-seg is-empty" style={{ flexGrow: 1 }} />}
            </div>
            <ul className="mastery-ladder-legend">
              {TIER_META.map((tier) => (
                <li key={tier.key} className={tier.className}>
                  <b aria-hidden="true" />
                  <span>{tier.label}</span>
                  <strong>{ladder[tier.key]}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="grind-today" aria-label="今日战报">
            <div className="grind-today-head">
              <p className="section-index">今日战报</p>
              {goals.allClosed
                ? <span className="grind-today-badge is-done"><Sparkles aria-hidden="true" /> 今日目标已达成</span>
                : <span className="grind-today-badge">已闭环 {goals.closedCount} / 3</span>}
            </div>
            <div className="daily-rings">
              <DailyRing goal={goals.newWords} label="新学" />
              <DailyRing goal={goals.reviews} label="复习" />
              <DailyRing goal={goals.minutes} label="分钟" />
            </div>
            <ul className="grind-today-stats">
              <li><Zap aria-hidden="true" /><strong>{today.grind}</strong><span>今日卷力</span></li>
              <li><Target aria-hidden="true" /><strong>{today.accuracy}%</strong><span>今日正确率</span></li>
              <li><Flame aria-hidden="true" /><strong>{today.bestStreak}</strong><span>今日最高连击</span></li>
            </ul>
          </div>

          <ul className="achievement-stats" aria-label="全局学习战绩">
            <li><BookOpenCheck aria-hidden="true" /><strong>{stats.learned}</strong><span>已学习</span></li>
            <li><Target aria-hidden="true" /><strong>{stats.accuracy}%</strong><span>累计正确率</span></li>
            <li><Clock3 aria-hidden="true" /><strong>{stats.due}</strong><span>待复习</span></li>
            <li><CalendarCheck aria-hidden="true" /><strong>{stats.streak}</strong><span>连续天数</span></li>
          </ul>
        </div>

        <div className="achievement-list">
          {ACHIEVEMENTS.map((achievement) => {
            const unlockedAt = state.unlockedAt[achievement.id];
            const value = achievementValue(achievement, snapshot);
            const percent = achievementPercent(achievement, snapshot);
            return (
              <article
                key={achievement.id}
                className={`achievement-item tier-${achievement.tier} ${unlockedAt ? 'is-unlocked' : ''}`}
              >
                <span className="achievement-item-icon">
                  <AchievementIcon id={achievement.id} />
                </span>
                <div className="achievement-item-body">
                  <div>
                    <strong>{achievement.title}</strong>
                    <span>{unlockedAt ? `达成于 ${unlockDate(unlockedAt)}` : `${Math.min(value, achievement.target)} / ${achievement.target}`}</span>
                  </div>
                  <p>{achievement.description}</p>
                  <div
                    className="achievement-progress"
                    role="progressbar"
                    aria-label={`${achievement.title}进度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

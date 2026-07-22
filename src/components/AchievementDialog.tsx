import {
  ACHIEVEMENTS,
  achievementPercent,
  achievementValue,
  type AchievementSnapshot,
  type AchievementStateV1,
} from '../domain/achievements';
import { Trophy, X } from '../icons';
import { AchievementIcon } from './AchievementIcon';

interface AchievementDialogProps {
  open: boolean;
  state: AchievementStateV1;
  snapshot: AchievementSnapshot;
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
  onClose,
}: AchievementDialogProps) {
  if (!open) return null;
  const unlockedCount = Object.keys(state.unlockedAt).length;

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

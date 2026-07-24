import { ArrowLeft, Zap } from '../icons';
import { COMBAT_SKILLS, type CombatState } from '../domain/combat';

interface BattleHeaderProps {
  state: CombatState;
  levelNumber: number;
  title: string;
  onExit: () => void;
  boostCount?: number;
  autoAdvanceEnabled?: boolean;
  onToggleAutoAdvance?: () => void;
}

export function BattleHeader({
  state,
  levelNumber,
  title,
  onExit,
  boostCount = 0,
  autoAdvanceEnabled,
  onToggleAutoAdvance,
}: BattleHeaderProps) {
  const selectedSkill = COMBAT_SKILLS.find((skill) => skill.id === state.skillId);
  const comboLabel = `COMBO ×${state.combo}`;
  const bonusLabel = boostCount > 0
    ? `BOOST ×${boostCount}`
    : selectedSkill
      ? `SKILL ${selectedSkill.name}`
      : 'BOOST ×0';

  return (
    <header className="battle-header" aria-label="战斗信息">
      <button type="button" className="battle-exit-button" onClick={onExit} aria-label="退出本轮">
        <ArrowLeft aria-hidden="true" />
        <span>退出</span>
      </button>

      <div className="battle-header-title">
        <small>第 {levelNumber} 关</small>
        <strong>{title}</strong>
      </div>

      <div className="battle-header-status">
        <div
          className={`combo-status ${state.combo >= 2 ? 'is-active' : ''}`}
          aria-label={`${comboLabel}，${bonusLabel}`}
        >
          <div className="combo-status-main" aria-hidden="true">
            <Zap />
            <span>COMBO</span>
            <strong>×{state.combo}</strong>
          </div>
          <span className={`combo-bonus ${boostCount > 0 ? 'is-boost' : 'is-skill'}`} aria-hidden="true">
            {boostCount > 0 ? 'BOOST' : selectedSkill ? 'SKILL' : 'BOOST'}
            <b>{boostCount > 0 ? `×${boostCount}` : selectedSkill?.name ?? '×0'}</b>
          </span>
        </div>
        {autoAdvanceEnabled !== undefined && onToggleAutoAdvance && (
          <button
            type="button"
            className="battle-auto-toggle"
            role="switch"
            aria-checked={autoAdvanceEnabled}
            aria-label={autoAdvanceEnabled ? '关闭自动下一题' : '开启自动下一题'}
            title={autoAdvanceEnabled ? '自动下一题已开启' : '自动下一题已关闭'}
            onClick={onToggleAutoAdvance}
          >
            <span className="battle-auto-toggle-track" aria-hidden="true">
              <span />
            </span>
            <span>自动下一题</span>
          </button>
        )}
      </div>
    </header>
  );
}
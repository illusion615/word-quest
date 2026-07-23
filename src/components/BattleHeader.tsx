import { ArrowLeft, Zap } from '../icons';
import { COMBAT_SKILLS, type CombatState } from '../domain/combat';

interface BattleHeaderProps {
  state: CombatState;
  levelNumber: number;
  title: string;
  onExit: () => void;
  boostCount?: number;
}

export function BattleHeader({
  state,
  levelNumber,
  title,
  onExit,
  boostCount = 0,
}: BattleHeaderProps) {
  const selectedSkill = COMBAT_SKILLS.find((skill) => skill.id === state.skillId);

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

      <div className={`combo-status ${state.combo >= 2 ? 'is-active' : ''}`}>
        <Zap aria-hidden="true" />
        <strong>{state.combo}</strong>
        <span>连击{boostCount > 0 ? ` · 加成×${boostCount}` : (selectedSkill ? ` · ${selectedSkill.name}` : '')}</span>
      </div>
    </header>
  );
}
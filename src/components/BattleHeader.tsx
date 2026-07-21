import { ArrowLeft, Shield, Zap } from '../icons';
import { COMBAT_SKILLS, type CombatState } from '../domain/combat';

interface BattleHeaderProps {
  state: CombatState;
  levelNumber: number;
  title: string;
  currentQuestion: number;
  totalQuestions: number;
  onExit: () => void;
}

function percentage(value: number, maximum: number): number {
  return maximum > 0 ? Math.round((value / maximum) * 100) : 0;
}

export function BattleHeader({
  state,
  levelNumber,
  title,
  currentQuestion,
  totalQuestions,
  onExit,
}: BattleHeaderProps) {
  const enemyPercentage = percentage(state.enemyHealth, state.maxEnemyHealth);
  const questionPercentage = percentage(currentQuestion, totalQuestions);
  const selectedSkill = COMBAT_SKILLS.find((skill) => skill.id === state.skillId);

  return (
    <header className="battle-header" aria-label="战斗信息">
      <div className="battle-header-title">
        <small>第 {levelNumber} 关</small>
        <strong>{title}</strong>
      </div>

      <div className="battle-question-progress">
        <div><span>题目进度</span><strong>{currentQuestion} / {totalQuestions}</strong></div>
        <div className="battle-header-track" aria-hidden="true">
          <span style={{ width: `${questionPercentage}%` }} />
        </div>
      </div>

      <div className="player-status">
        <span><Shield aria-hidden="true" /> 卷王护盾</span>
        <div className="shield-pips" aria-label={`剩余护盾 ${state.playerShield} / ${state.maxPlayerShield}`}>
          {Array.from({ length: state.maxPlayerShield }, (_, index) => (
            <i key={index} className={index < state.playerShield ? 'is-full' : ''} />
          ))}
        </div>
      </div>

      <div className={`combo-status ${state.combo >= 2 ? 'is-active' : ''}`}>
        <Zap aria-hidden="true" />
        <strong>{state.combo}</strong>
        <span>连击{selectedSkill ? ` · ${selectedSkill.name}` : ''}</span>
      </div>

      <div className="enemy-status">
        <div><span>词怪生命</span><strong>{state.enemyHealth} / {state.maxEnemyHealth}</strong></div>
        <div
          className="enemy-health"
          role="progressbar"
          aria-label="词怪生命"
          aria-valuemin={0}
          aria-valuemax={state.maxEnemyHealth}
          aria-valuenow={state.enemyHealth}
        >
          <span style={{ width: `${enemyPercentage}%` }} />
        </div>
      </div>

      <button type="button" className="battle-exit-button" onClick={onExit} aria-label="退出本轮">
        <span>退出</span>
        <ArrowLeft aria-hidden="true" />
      </button>
    </header>
  );
}
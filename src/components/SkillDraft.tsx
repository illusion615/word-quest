import { Shield, Volume2, Zap } from '../icons';
import { COMBAT_SKILLS, type CombatSkillId } from '../domain/combat';

interface SkillDraftProps {
  levelNumber: number;
  onChoose: (skillId: CombatSkillId) => void;
  onExit: () => void;
}

const SKILL_ICONS = {
  steady: Shield,
  echo: Volume2,
  rush: Zap,
};

export function SkillDraft({ levelNumber, onChoose, onExit }: SkillDraftProps) {
  return (
    <main className="skill-draft-page page-width">
      <button type="button" className="icon-text-button" onClick={onExit}>退出挑战</button>
      <section className="skill-draft-panel" aria-labelledby="skill-draft-heading">
        <p className="eyebrow">第 {levelNumber} 关 · 战前整备</p>
        <h1 id="skill-draft-heading">选择本关战术</h1>
        <p>技能只影响战斗表现，不改变答题判定与 FSRS 复习计划。</p>
        <div className="skill-grid">
          {COMBAT_SKILLS.map((skill) => {
            const SkillIcon = SKILL_ICONS[skill.id];
            return (
              <button
                key={skill.id}
                type="button"
                className={`skill-card is-${skill.id}`}
                onClick={() => onChoose(skill.id)}
              >
                <span className="skill-icon"><SkillIcon aria-hidden="true" /></span>
                <strong>{skill.name}</strong>
                <p>{skill.description}</p>
                <small>{skill.tradeoff}</small>
                <b>选择技能</b>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
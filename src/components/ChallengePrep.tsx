import { EyeOff, Hash, Zap } from '../icons';
import {
  BOOST_DEFS,
  boostStacks,
  type ActiveBoosts,
  type BoostDef,
  type BoostId,
} from '../domain/challengeBoosts';

interface ChallengePrepProps {
  levelNumber: number;
  activeBoosts: ActiveBoosts;
  offers: BoostDef[];
  droppedBoostName: string | null;
  onChoose: (boostId: BoostId) => void;
  onExit: () => void;
}

const BOOST_ICONS: Record<BoostId, typeof Zap> = {
  haste: Zap,
  silentWord: EyeOff,
  hiddenCount: Hash,
};

export function ChallengePrep({
  levelNumber,
  activeBoosts,
  offers,
  droppedBoostName,
  onChoose,
  onExit,
}: ChallengePrepProps) {
  const owned = BOOST_DEFS.filter((def) => boostStacks(activeBoosts, def.id) > 0);

  return (
    <main className="skill-draft-page page-width">
      <button type="button" className="icon-text-button" onClick={onExit}>退出挑战</button>
      <section className="skill-draft-panel" aria-labelledby="challenge-prep-heading">
        <p className="eyebrow">第 {levelNumber} 关 · 战前整备</p>
        <h1 id="challenge-prep-heading">不够卷，再强一点</h1>
        <p>每关叠加一个难度加成，让挑战更硬核；答错任意题会随机失去一个加成。加成只改变难度，不影响答题判定与 FSRS 复习计划。</p>

        {droppedBoostName && (
          <p className="boost-penalty" role="status">
            上一轮有答错 · 已随机移除加成「{droppedBoostName}」
          </p>
        )}

        {owned.length > 0 && (
          <div className="boost-active-row" aria-label="已叠加的加成">
            <span>已叠加</span>
            {owned.map((def) => {
              const stacks = boostStacks(activeBoosts, def.id);
              return (
                <span key={def.id} className="boost-chip">
                  {def.name}{stacks > 1 ? ` ×${stacks}` : ''}
                </span>
              );
            })}
          </div>
        )}

        <div className="skill-grid">
          {offers.map((def) => {
            const BoostIcon = BOOST_ICONS[def.id];
            const stacks = boostStacks(activeBoosts, def.id);
            return (
              <button
                key={def.id}
                type="button"
                className={`skill-card is-boost is-${def.id}`}
                onClick={() => onChoose(def.id)}
              >
                <span className="skill-icon"><BoostIcon aria-hidden="true" /></span>
                <strong>{def.name}</strong>
                <p>{def.description}</p>
                <small>
                  {def.stackable
                    ? `可叠加 · 当前 ${stacks}/${def.maxStacks}`
                    : '一次性强化'}
                </small>
                <b>选择加成</b>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Crown,
  EyeOff,
  Hash,
  CircleHelp,
  Layers3,
  ListChecks,
  Zap,
} from '../icons';
import {
  BOOST_DEFS,
  boostStacks,
  type ActiveBoosts,
  type BoostDef,
  type BoostId,
} from '../domain/challengeBoosts';
import {
  BOSS_QUESTION_COUNT,
  BOSS_STAGE_SIZE,
  BOSS_STAGES,
  bossPassingScore,
} from '../domain/boss';
import type { JourneyLevelKind } from '../domain/journey';

interface ChallengePrepProps {
  levelNumber: number;
  levelKind: JourneyLevelKind;
  activeBoosts: ActiveBoosts;
  offers: BoostDef[];
  droppedBoostName: string | null;
  onChoose: (boostId: BoostId) => void;
  onContinue: () => void;
  onExit: () => void;
  onOpenHelp: () => void;
}

const BOOST_ICONS: Record<BoostId, typeof Zap> = {
  haste: Zap,
  silentWord: EyeOff,
  hiddenCount: Hash,
  hiddenPassage: BookOpenCheck,
  similarDistractors: Layers3,
  extraOptions: ListChecks,
};

export function ChallengePrep({
  levelNumber,
  levelKind,
  activeBoosts,
  offers,
  droppedBoostName,
  onChoose,
  onContinue,
  onExit,
  onOpenHelp,
}: ChallengePrepProps) {
  const owned = BOOST_DEFS.filter((def) => boostStacks(activeBoosts, def.id) > 0);

  return (
    <main className="skill-draft-page page-width">
      <div className="skill-draft-toolbar">
        <button type="button" className="icon-text-button" onClick={onExit} aria-label="退出挑战">
          <ArrowLeft aria-hidden="true" />
          <span>退出</span>
        </button>
        <button type="button" className="icon-text-button" onClick={onOpenHelp} aria-label="打开新手指引">
          <CircleHelp aria-hidden="true" />
          <span>玩法帮助</span>
        </button>
      </div>
      <section className="skill-draft-panel" aria-labelledby="challenge-prep-heading">
        <p className="eyebrow">第 {levelNumber} 关 · {levelKind === 'boss' ? 'Boss 决战' : '战前整备'}</p>
        <h1 id="challenge-prep-heading">不够卷，再强一点</h1>
        <p>每关叠加一个难度加成，让挑战更硬核；答错任意题会随机失去一个加成。加成只改变难度，不影响答题判定与 FSRS 复习计划。</p>

        {levelKind === 'boss' && (
          <div className="boss-assessment-brief" aria-label="Boss 考核规则">
            <strong>固定 {BOSS_QUESTION_COUNT} 题 · 一场结束</strong>
            <span>{BOSS_STAGES.map((stage) => `${stage.name} ${BOSS_STAGE_SIZE} 题`).join(' · ')}</span>
            <small>复核前序已学词，不引入新词；答满全场，至少答对 {bossPassingScore()} 题才通过。</small>
          </div>
        )}

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

        {offers.length > 0 ? (
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
        ) : (
          <div className="boost-maxed-state" role="status">
            <span className="skill-icon"><Crown aria-hidden="true" /></span>
            <strong>你是卷王</strong>
            <p>所有难度加成都已达到上限，本轮将保持当前强度继续挑战。</p>
            <button type="button" className="primary-button" onClick={onContinue}>
              保持当前强度开战 <ArrowRight aria-hidden="true" />
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

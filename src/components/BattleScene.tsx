import { type ReactNode } from 'react';
import type { CombatState } from '../domain/combat';
import type { WaveMonster } from '../domain/monsterRoster';
import { CombatHud, type CombatEnemyKind } from './CombatHud';
import { BattleHeader } from './BattleHeader';

interface BattleSceneProps {
  state: CombatState;
  levelNumber: number;
  enemyKind: CombatEnemyKind;
  headerTitle: string;
  onExit: () => void;
  /** Reading passage rendered above the monsters. Omit to hide it (e.g. no AI). */
  passage?: ReactNode;
  children: ReactNode;
  preview?: boolean;
  roster?: WaveMonster[];
  onSpeak?: (text: string) => void;
  disableMonsterSpeech?: boolean;
  concealMonsterWords?: boolean;
  boostCount?: number;
  rosterFocusWordId?: string;
}

export function BattleScene({
  state,
  levelNumber,
  enemyKind,
  headerTitle,
  onExit,
  passage,
  children,
  preview = false,
  roster,
  onSpeak,
  disableMonsterSpeech = false,
  concealMonsterWords = false,
  boostCount = 0,
  rosterFocusWordId,
}: BattleSceneProps) {
  return (
    <section className={`battle-scene is-${enemyKind} ${preview ? 'is-preview' : 'is-asking'}`}>
      <div className="battle-scene-environment" aria-hidden="true">
        <span className="battle-horizon" />
        <span className="battle-floor" />
      </div>
      <BattleHeader
        state={state}
        levelNumber={levelNumber}
        title={headerTitle}
        onExit={onExit}
        boostCount={boostCount}
      />
      {passage && <div className="battle-passage-strip">{passage}</div>}
      <CombatHud state={state} levelNumber={levelNumber} enemyKind={enemyKind} roster={roster} onSpeak={onSpeak} disableMonsterSpeech={disableMonsterSpeech} concealWords={concealMonsterWords} focusWordId={rosterFocusWordId} />
      <div className="battle-action-panel">{children}</div>
    </section>
  );
}
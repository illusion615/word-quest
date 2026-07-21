import { useState, type ReactNode } from 'react';
import { BookOpenCheck, X } from '../icons';
import type { CombatState } from '../domain/combat';
import { CombatHud, type CombatEnemyKind } from './CombatHud';
import { BattleHeader } from './BattleHeader';

interface BattleSceneProps {
  state: CombatState;
  levelNumber: number;
  enemyKind: CombatEnemyKind;
  headerTitle: string;
  currentQuestion: number;
  totalQuestions: number;
  onExit: () => void;
  contextPanel: ReactNode;
  children: ReactNode;
  preview?: boolean;
}

export function BattleScene({
  state,
  levelNumber,
  enemyKind,
  headerTitle,
  currentQuestion,
  totalQuestions,
  onExit,
  contextPanel,
  children,
  preview = false,
}: BattleSceneProps) {
  const [contextExpanded, setContextExpanded] = useState(false);

  return (
    <section className={`battle-scene is-${enemyKind} ${preview ? 'is-preview' : 'is-assessment'}`}>
      <div className="battle-scene-environment" aria-hidden="true">
        <span className="battle-horizon" />
        <span className="battle-floor" />
      </div>
      <BattleHeader
        state={state}
        levelNumber={levelNumber}
        title={headerTitle}
        currentQuestion={currentQuestion}
        totalQuestions={totalQuestions}
        onExit={onExit}
      />
      <CombatHud state={state} levelNumber={levelNumber} enemyKind={enemyKind} />
      {preview ? (
        <div className="battle-glass-panel battle-context-panel">
          {contextPanel}
        </div>
      ) : (
        <aside className={`battle-context-drawer ${contextExpanded ? 'is-expanded' : ''}`}>
          <button
            type="button"
            className="battle-context-toggle"
            onClick={() => setContextExpanded((expanded) => !expanded)}
            aria-expanded={contextExpanded}
          >
            {contextExpanded ? <X aria-hidden="true" /> : <BookOpenCheck aria-hidden="true" />}
            <span>{contextExpanded ? '收起阅读' : '阅读理解'}</span>
          </button>
          {contextExpanded && (
            <div className="battle-glass-panel battle-context-panel">
              {contextPanel}
            </div>
          )}
        </aside>
      )}
      <div className={preview
        ? 'battle-action-panel battle-card-tray'
        : 'battle-glass-panel battle-action-panel'}>
        {children}
      </div>
    </section>
  );
}
import { useEffect } from 'react';
import { Swords } from '../icons';
import type { CombatState } from '../domain/combat';
import type { WaveMonster } from '../domain/monsterRoster';
import {
  getMonsterArtworkSources,
  resolveMonsterArtwork,
  type CombatEnemyKind,
} from './combatArtwork';
import { MonsterRoster } from './MonsterRoster';
import { useMonsterPresentation } from '../hooks/useMonsterPresentation';

export type { CombatEnemyKind } from './combatArtwork';

interface CombatHudProps {
  state: CombatState;
  levelNumber: number;
  enemyKind?: CombatEnemyKind;
  roster?: WaveMonster[];
  onSpeak?: (text: string) => void;
  hideWord?: boolean;
  focusWordId?: string;
}

export function CombatHud({ state, levelNumber, enemyKind = 'grunt', roster, onSpeak, hideWord = false, focusWordId }: CombatHudProps) {
  const event = state.lastEvent;
  const pose = useMonsterPresentation(state);
  const monster = resolveMonsterArtwork(state, enemyKind, pose);

  useEffect(() => {
    const images = getMonsterArtworkSources(enemyKind).map((src) => {
      const image = new Image();
      image.src = src;
      return image;
    });
    return () => images.forEach((image) => {
      image.src = '';
    });
  }, [enemyKind]);

  return (
    <section
      className={`combat-hud is-${state.phase} is-${enemyKind} pose-${pose}`}
      aria-label={`第 ${levelNumber} 关战斗状态`}
    >
      <div className="combat-stage">
        {roster && roster.length > 0 ? (
          <MonsterRoster monsters={roster} activePose={pose} event={event} onSpeak={onSpeak} hideWord={hideWord} focusWordId={focusWordId} />
        ) : (
          <>
            <img
              key={monster.src}
              className={`combat-monster ${monster.visualState}`}
              src={monster.src}
              alt={monster.alt}
            />
            {event && (
              <div key={event.id} className={`combat-feedback is-${event.kind}`} aria-live="polite">
                {event.kind === 'hit' && (
                  <><Swords aria-hidden="true" /> {event.critical ? '暴击' : '命中'} -{event.damage}</>
                )}
                {event.kind === 'hurt' && <>词怪反击 · 护盾 -1</>}
                {event.kind === 'defeat' && <>护盾破碎</>}
                {event.kind === 'victory' && <>词怪击败</>}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
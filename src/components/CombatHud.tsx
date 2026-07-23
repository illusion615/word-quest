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
import { useRosterMonsterPresentation } from '../hooks/useRosterMonsterPresentation';

export type { CombatEnemyKind } from './combatArtwork';

interface CombatHudProps {
  state: CombatState;
  levelNumber: number;
  enemyKind?: CombatEnemyKind;
  roster?: WaveMonster[];
  onSpeak?: (text: string) => void;
  disableMonsterSpeech?: boolean;
  concealWords?: boolean;
  focusWordId?: string;
}

export function CombatHud({ state, levelNumber, enemyKind = 'grunt', roster, onSpeak, disableMonsterSpeech = false, concealWords = false, focusWordId }: CombatHudProps) {
  const event = state.lastEvent;
  const bossPose = useMonsterPresentation(state);
  const activeRosterWordId = roster?.find((monster) => monster.status === 'active')?.wordId;
  const rosterPose = useRosterMonsterPresentation(activeRosterWordId);
  const visualPose = roster && roster.length > 0 ? rosterPose : bossPose;
  const monster = resolveMonsterArtwork(state, enemyKind, bossPose);

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
      className={`combat-hud is-${state.phase} is-${enemyKind} pose-${visualPose}`}
      aria-label={`第 ${levelNumber} 关战斗状态`}
    >
      <div className="combat-stage">
        {roster && roster.length > 0 ? (
          <MonsterRoster monsters={roster} activePose={rosterPose} event={event} onSpeak={onSpeak} disableMonsterSpeech={disableMonsterSpeech} concealWords={concealWords} focusWordId={focusWordId} combo={state.combo} round={state.answersResolved} />
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
                {event.kind === 'hurt' && <>词怪反击</>}
                {event.kind === 'defeat' && <>本场未通过</>}
                {event.kind === 'victory' && <>词怪击败</>}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
import type { CSSProperties } from 'react';
import type { CombatEvent } from '../domain/combat';
import type { WaveMonster } from '../domain/monsterRoster';
import { primarySense } from '../domain/wordText';
import { Swords } from '../icons';
import { monsterPoseArtwork } from './combatArtwork';
import type { MonsterPose } from './monsterPresentation';

const STATUS_POSE: Record<WaveMonster['status'], MonsterPose> = {
  pending: 'idle',
  active: 'idle',
  defeated: 'defeated',
  // A missed monster was NOT defeated — it counterattacked and stays standing.
  missed: 'attacking',
};

const TIER_LABEL: Record<WaveMonster['tier'], string> = {
  common: '幼卒',
  uncommon: '游兵',
  rare: '悍将',
  elite: '妖将',
};

interface MonsterRosterProps {
  monsters: WaveMonster[];
  activePose: MonsterPose;
  event: CombatEvent | null;
  onSpeak?: (text: string) => void;
  hideWord?: boolean;
  focusWordId?: string;
}

/** The monster shown front-and-centre in the gauntlet wheel. */
function resolveFocusIndex(monsters: WaveMonster[], focusWordId?: string): number {
  if (focusWordId) {
    const byId = monsters.findIndex((monster) => monster.wordId === focusWordId);
    if (byId >= 0) return byId;
  }
  const active = monsters.findIndex((monster) => monster.status === 'active');
  if (active >= 0) return active;
  return Math.floor(Math.max(0, monsters.length - 1) / 2);
}

/**
 * A wave of word-monsters lined up for a Dragon-Quest-style turn battle. The
 * active monster is enlarged and animated; defeated and missed ones drop back.
 * Each head word is clickable to hear its pronunciation and reveals its meaning
 * on hover. When the "蒙面" boost is active the head word is masked.
 */
export function MonsterRoster({ monsters, activePose, event, onSpeak, hideWord = false, focusWordId }: MonsterRosterProps) {
  const focusIndex = resolveFocusIndex(monsters, focusWordId);
  // Centre the whole line in the viewport: shift every monster by the negative
  // mean slot so the group's bounding box is centred rather than sprawling to
  // one side of the front monster.
  const meanSlot = monsters.length > 0
    ? monsters.reduce((sum, _monster, index) => sum + (index - focusIndex), 0) / monsters.length
    : 0;
  return (
    <div
      className="monster-roster"
      aria-label={`词怪队列，共 ${monsters.length} 只`}
      style={{ '--roster-count': Math.max(1, monsters.length), '--wheel-shift': -meanSlot } as CSSProperties}
    >
      {monsters.map((monster, index) => {
        const pose = monster.status === 'active' ? activePose : STATUS_POSE[monster.status];
        const art = monsterPoseArtwork(pose);
        // Defeated / missed monsters always reveal their word, so review still works.
        const masked = hideWord && (monster.status === 'pending' || monster.status === 'active');
        const slot = index - focusIndex;
        const distance = Math.abs(slot);
        return (
          <div
            key={monster.wordId}
            className={`roster-monster tier-${monster.tier} is-${monster.status} pose-${pose}${index === focusIndex ? ' is-focus' : ''}`}
            title={masked ? TIER_LABEL[monster.tier] : `${monster.word} · ${TIER_LABEL[monster.tier]}`}
            style={{ '--slot': slot, '--dist': distance, zIndex: 60 - distance } as CSSProperties}
          >
            <span className="roster-word-wrap">
              <button
                type="button"
                className={`roster-word ${masked ? 'is-masked' : ''}`}
                onClick={() => onSpeak?.(monster.word)}
                aria-label={masked ? '播放该词发音' : `播放 ${monster.word} 的发音`}
              >
                {masked ? '❓' : monster.word}
              </button>
              {!masked && (
                <span className="roster-word-pop" role="tooltip">
                  {monster.phonetic && <em>{monster.phonetic}</em>}
                  {primarySense(monster.definitionZh)}
                </span>
              )}
            </span>
            {monster.status === 'active' && event && (
              <span className={`roster-feedback is-${event.kind}`} aria-live="polite">
                {event.kind === 'hit' && (
                  <><Swords aria-hidden="true" /> {event.critical ? '暴击' : '命中'}</>
                )}
                {event.kind === 'hurt' && <>反击 · 护盾 -1</>}
                {event.kind === 'defeat' && <>护盾破碎</>}
              </span>
            )}
            <img src={art.src} alt={art.alt} />
          </div>
        );
      })}
    </div>
  );
}

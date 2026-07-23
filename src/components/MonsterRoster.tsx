import type { CSSProperties } from 'react';
import type { CombatEvent } from '../domain/combat';
import type { WaveMonster } from '../domain/monsterRoster';
import { Swords } from '../icons';
import { monsterPoseArtwork } from './combatArtwork';
import { resolveMonsterDialogue } from './monsterDialogue';
import { monsterOrbitPosition, monsterOrbitRotation } from './monsterOrbit';
import type { RosterMonsterPose } from './rosterMonsterPresentation';

const STATUS_POSE: Record<WaveMonster['status'], RosterMonsterPose> = {
  pending: 'aloof',
  active: 'aloof',
  defeated: 'vanquished',
  missed: 'triumphant',
};

const TIER_LABEL: Record<WaveMonster['tier'], string> = {
  common: '幼卒',
  uncommon: '游兵',
  rare: '悍将',
  elite: '妖将',
};

interface MonsterRosterProps {
  monsters: WaveMonster[];
  activePose: RosterMonsterPose;
  event: CombatEvent | null;
  onSpeak?: (text: string) => void;
  disableMonsterSpeech?: boolean;
  concealWords?: boolean;
  focusWordId?: string;
  combo?: number;
  round?: number;
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
 * Only the focused monster speaks, keeping the wheel readable while giving the
 * duel a comic-book voice. Clicking a monster replays its word unless silenced.
 */
export function MonsterRoster({
  monsters,
  activePose,
  event,
  onSpeak,
  disableMonsterSpeech = false,
  concealWords = false,
  focusWordId,
  combo = 0,
  round = 0,
}: MonsterRosterProps) {
  const focusIndex = resolveFocusIndex(monsters, focusWordId);
  const rotation = monsterOrbitRotation(focusIndex, monsters.length);
  return (
    <div
      className="monster-roster"
      aria-label={`词怪队列，共 ${monsters.length} 只`}
      style={{ '--roster-count': Math.max(1, monsters.length) } as CSSProperties}
    >
      <div
        className="monster-orbit-track"
        style={{
          transform: `translateZ(calc(var(--orbit-radius) * -1)) rotateX(var(--orbit-tilt)) rotateY(${rotation}deg)`,
        }}
      >
        {monsters.map((monster, index) => {
          const pose = monster.status === 'active' ? activePose : STATUS_POSE[monster.status];
          const art = monsterPoseArtwork(pose, monster.tier, monster.wordId);
          const orbit = monsterOrbitPosition(index, focusIndex, monsters.length);
          const isFocus = index === focusIndex;
          const waitsOffstage = Boolean(focusWordId) && !isFocus;
          const speechDisabled = disableMonsterSpeech || !onSpeak || waitsOffstage;
          const dialogue = resolveMonsterDialogue(monster, event, isFocus, { combo, round });
          const resolvedEvent = isFocus && event && (
            (monster.status === 'defeated' && event.kind === 'hit')
            || (monster.status === 'missed' && (event.kind === 'hurt' || event.kind === 'defeat'))
          );
          return (
            <div
              key={monster.wordId}
              className={`roster-monster tier-${monster.tier} is-${monster.status} pose-${pose}${isFocus ? ' is-focus' : ''}`}
              data-monster-character={art.characterId}
              title={concealWords || waitsOffstage
                ? `${TIER_LABEL[monster.tier]}${speechDisabled ? '' : ' · 点击听发音'}`
                : disableMonsterSpeech
                  ? TIER_LABEL[monster.tier]
                  : `${monster.word} · ${TIER_LABEL[monster.tier]} · 点击听发音`}
              style={{
                transform: `rotateY(${orbit.baseAngleDeg}deg) translateZ(var(--orbit-radius)) rotateY(${orbit.facingDeg}deg) scale(calc(var(--tier-scale) * var(--focus-boost, 1) * ${orbit.scale}))`,
                opacity: `calc(var(--status-opacity, 1) * ${orbit.opacity})`,
                zIndex: 80 - Math.round(orbit.depth * 50),
              } as CSSProperties}
            >
              {dialogue && (
                <span
                  key={dialogue.key}
                  className={`monster-dialogue is-${dialogue.tone} level-${dialogue.level}`}
                  role="status"
                  aria-live="polite"
                >
                  {dialogue.text}
                </span>
              )}
              {resolvedEvent && (
                <span className={`roster-feedback is-${event.kind}`} aria-live="polite">
                  {event.kind === 'hit' && (
                    <><Swords aria-hidden="true" /> {event.critical ? '暴击' : '命中'}</>
                  )}
                  {event.kind === 'hurt' && <>词怪反击</>}
                  {event.kind === 'defeat' && <>本场未通过</>}
                </span>
              )}
              <button
                type="button"
                className="roster-monster-speak"
                onClick={() => onSpeak?.(monster.word)}
                disabled={speechDisabled}
                aria-label={waitsOffstage
                  ? `${TIER_LABEL[monster.tier]}等待上场`
                  : disableMonsterSpeech
                    ? `${TIER_LABEL[monster.tier]}不可点读`
                    : concealWords
                      ? '播放当前词怪发音'
                      : `播放 ${monster.word} 的发音`}
              >
                <img src={art.src} alt={art.alt} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

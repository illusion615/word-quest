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
}

/**
 * A wave of word-monsters lined up for a Dragon-Quest-style turn battle. The
 * active monster is enlarged and animated; defeated and missed ones drop back.
 * Each head word is clickable to hear its pronunciation and reveals its meaning
 * on hover. When the "蒙面" boost is active the head word is masked.
 */
export function MonsterRoster({ monsters, activePose, event, onSpeak, hideWord = false }: MonsterRosterProps) {
  return (
    <div className="monster-roster" aria-label={`词怪队列，共 ${monsters.length} 只`}>
      {monsters.map((monster) => {
        const pose = monster.status === 'active' ? activePose : STATUS_POSE[monster.status];
        const art = monsterPoseArtwork(pose);
        // Defeated / missed monsters always reveal their word, so review still works.
        const masked = hideWord && (monster.status === 'pending' || monster.status === 'active');
        return (
          <div
            key={monster.wordId}
            className={`roster-monster tier-${monster.tier} is-${monster.status} pose-${pose}`}
            title={masked ? TIER_LABEL[monster.tier] : `${monster.word} · ${TIER_LABEL[monster.tier]}`}
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

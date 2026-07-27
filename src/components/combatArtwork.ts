import bossDefeated from '../assets/monsters/boss/defeated.webp';
import bossPhaseOne from '../assets/monsters/boss/phase-1.webp';
import bossPhaseTwo from '../assets/monsters/boss/phase-2.webp';
import bossPhaseThree from '../assets/monsters/boss/phase-3.webp';
import gruntAttack from '../assets/monsters/grunt/attack.webp';
import gruntDefeated from '../assets/monsters/grunt/defeated.webp';
import gruntHurt from '../assets/monsters/grunt/hurt.webp';
import gruntIdle from '../assets/monsters/grunt/idle.webp';
import silkwindAloof from '../assets/monsters/common/silkwind-quill-marten/aloof.webp';
import silkwindChallenge from '../assets/monsters/common/silkwind-quill-marten/challenge.webp';
import silkwindTriumphant from '../assets/monsters/common/silkwind-quill-marten/triumphant.webp';
import silkwindVanquished from '../assets/monsters/common/silkwind-quill-marten/vanquished.webp';
import razorplumeAloof from '../assets/monsters/common/razorplume-marauder/aloof.webp';
import razorplumeChallenge from '../assets/monsters/common/razorplume-marauder/challenge.webp';
import razorplumeTriumphant from '../assets/monsters/common/razorplume-marauder/triumphant.webp';
import razorplumeVanquished from '../assets/monsters/common/razorplume-marauder/vanquished.webp';
import inkveilAloof from '../assets/monsters/common/inkveil-duelist/aloof.webp';
import inkveilChallenge from '../assets/monsters/common/inkveil-duelist/challenge.webp';
import inkveilTriumphant from '../assets/monsters/common/inkveil-duelist/triumphant.webp';
import inkveilVanquished from '../assets/monsters/common/inkveil-duelist/vanquished.webp';
import shardbackAloof from '../assets/monsters/uncommon/shardback-knuckler/aloof.webp';
import shardbackChallenge from '../assets/monsters/uncommon/shardback-knuckler/challenge.webp';
import shardbackTriumphant from '../assets/monsters/uncommon/shardback-knuckler/triumphant.webp';
import shardbackVanquished from '../assets/monsters/uncommon/shardback-knuckler/vanquished.webp';
import crownmawAloof from '../assets/monsters/rare/crownmaw-reliquary/aloof.webp';
import crownmawChallenge from '../assets/monsters/rare/crownmaw-reliquary/challenge.webp';
import crownmawTriumphant from '../assets/monsters/rare/crownmaw-reliquary/triumphant.webp';
import crownmawVanquished from '../assets/monsters/rare/crownmaw-reliquary/vanquished.webp';
import type { CombatState } from '../domain/combat';
import type { MonsterTier } from '../domain/wordDifficulty';
import type { MonsterPose } from './monsterPresentation';
import type { RosterMonsterPose } from './rosterMonsterPresentation';

export type CombatEnemyKind = 'grunt' | 'boss';

interface MonsterArtwork {
  src: string;
  alt: string;
  visualState: string;
}

interface RosterCharacterArtwork {
  id: string;
  name: string;
  frames: Record<RosterMonsterPose, string>;
}

export interface RosterMonsterArtwork {
  src: string;
  alt: string;
  characterId: string;
}

const ROSTER_CHARACTERS_BY_TIER: Partial<
  Record<MonsterTier, readonly RosterCharacterArtwork[]>
> = {
  common: [
    {
      id: 'silkwind-quill-marten',
      name: '绡风翎貂',
      frames: {
        aloof: silkwindAloof,
        challenge: silkwindChallenge,
        vanquished: silkwindVanquished,
        triumphant: silkwindTriumphant,
      },
    },
    {
      id: 'razorplume-marauder',
      name: '刃翎掠夺者',
      frames: {
        aloof: razorplumeAloof,
        challenge: razorplumeChallenge,
        vanquished: razorplumeVanquished,
        triumphant: razorplumeTriumphant,
      },
    },
    {
      id: 'inkveil-duelist',
      name: '墨幕决斗灵',
      frames: {
        aloof: inkveilAloof,
        challenge: inkveilChallenge,
        vanquished: inkveilVanquished,
        triumphant: inkveilTriumphant,
      },
    },
  ],
  uncommon: [
    {
      id: 'shardback-knuckler',
      name: '碎晶拳兽',
      frames: {
        aloof: shardbackAloof,
        challenge: shardbackChallenge,
        vanquished: shardbackVanquished,
        triumphant: shardbackTriumphant,
      },
    },
  ],
  rare: [
    {
      id: 'crownmaw-reliquary',
      name: '冠匣吞金兽',
      frames: {
        aloof: crownmawAloof,
        challenge: crownmawChallenge,
        vanquished: crownmawVanquished,
        triumphant: crownmawTriumphant,
      },
    },
  ],
};

const POSE_ALT_PREFIX: Record<RosterMonsterPose, string> = {
  aloof: '孤傲待阵的',
  challenge: '正在嚣张叫阵的',
  vanquished: '败退但不甘的',
  triumphant: '得意挑衅的',
};

function stableCharacterIndex(wordId: string, characterCount: number): number {
  let hash = 0x811c9dc5;
  for (const character of wordId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.floor(((hash >>> 0) / 0x100000000) * characterCount);
}

const ROSTER_ARTWORK_SOURCES = Object.values(ROSTER_CHARACTERS_BY_TIER)
  .flatMap((characters) => characters ?? [])
  .flatMap((character) => Object.values(character.frames));

const ARTWORK_BY_ENEMY: Record<CombatEnemyKind, readonly string[]> = {
  grunt: [
    ...ROSTER_ARTWORK_SOURCES,
    gruntIdle,
    gruntHurt,
    gruntAttack,
    gruntDefeated,
  ],
  boss: [bossPhaseOne, bossPhaseTwo, bossPhaseThree, bossDefeated],
};

export function getMonsterArtworkSources(enemyKind: CombatEnemyKind): readonly string[] {
  return ARTWORK_BY_ENEMY[enemyKind];
}

export function monsterPoseArtwork(
  pose: RosterMonsterPose,
  tier: MonsterTier,
  wordId: string,
): RosterMonsterArtwork {
  const characters = ROSTER_CHARACTERS_BY_TIER[tier];
  if (characters && characters.length > 0) {
    const character = characters[
      stableCharacterIndex(wordId, characters.length)
    ];
    return {
      src: character.frames[pose],
      alt: `${POSE_ALT_PREFIX[pose]}${character.name}`,
      characterId: character.id,
    };
  }

  // Tiers without their own catalog keep the legacy frames until artwork lands.
  if (pose === 'vanquished') {
    return { src: gruntDefeated, alt: '被击败的词怪', characterId: 'legacy-grunt' };
  }
  if (pose === 'challenge') {
    return { src: gruntAttack, alt: '正在叫阵的词怪', characterId: 'legacy-grunt' };
  }
  if (pose === 'triumphant') {
    return { src: gruntAttack, alt: '赢下回合的词怪', characterId: 'legacy-grunt' };
  }
  return { src: gruntIdle, alt: '词怪', characterId: 'legacy-grunt' };
}

export function resolveMonsterArtwork(
  state: CombatState,
  enemyKind: CombatEnemyKind,
  pose: MonsterPose = 'idle',
): MonsterArtwork {
  if (enemyKind === 'boss') {
    if (pose === 'defeated') {
      return { src: bossDefeated, alt: '倒下的词怪领主', visualState: 'is-defeated' };
    }
    if (pose === 'knockdown') {
      return { src: bossDefeated, alt: '被暴击击倒的词怪领主', visualState: 'is-knockdown' };
    }
    if (pose === 'attacking') {
      return { src: bossPhaseThree, alt: '正在反击的词怪领主', visualState: 'is-attacking' };
    }
    if (pose === 'hit' || pose === 'recovering') {
      return {
        src: bossPhaseTwo,
        alt: pose === 'recovering' ? '正在起身的词怪领主' : '受创失衡的词怪领主',
        visualState: pose === 'recovering' ? 'is-recovering' : 'is-hurt',
      };
    }
    const healthRatio = state.maxEnemyHealth > 0
      ? state.enemyHealth / state.maxEnemyHealth
      : 0;
    if (healthRatio <= 1 / 3) {
      return { src: bossPhaseThree, alt: '进入狂暴阶段的词怪领主', visualState: 'is-enraged' };
    }
    if (healthRatio <= 2 / 3) {
      return { src: bossPhaseTwo, alt: '受创失衡的词怪领主', visualState: 'is-wounded' };
    }
    return { src: bossPhaseOne, alt: '词怪领主', visualState: 'is-idle' };
  }

  if (pose === 'defeated') {
    return { src: gruntDefeated, alt: '被击败的词怪', visualState: 'is-defeated' };
  }
  if (pose === 'knockdown') {
    return { src: gruntDefeated, alt: '被暴击击倒的词怪', visualState: 'is-knockdown' };
  }
  if (pose === 'recovering') {
    return { src: gruntHurt, alt: '正在起身的词怪', visualState: 'is-recovering' };
  }
  if (pose === 'attacking') {
    return { src: gruntAttack, alt: '正在反击的词怪', visualState: 'is-attacking' };
  }
  if (pose === 'hit') {
    return { src: gruntHurt, alt: '受到攻击的词怪', visualState: 'is-hurt' };
  }
  return { src: gruntIdle, alt: '等待战斗的词怪', visualState: 'is-idle' };
}
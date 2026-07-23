import type { CombatEvent } from '../domain/combat';
import type { WaveMonster } from '../domain/monsterRoster';

export type MonsterDialogueTone = 'taunt' | 'staggered' | 'gloating';
export type MonsterTauntLevel = 'probe' | 'assertive' | 'fierce' | 'nemesis';

export interface MonsterDialogue {
  key: string;
  text: string;
  tone: MonsterDialogueTone;
  level: MonsterTauntLevel;
}

export interface MonsterDialogueContext {
  combo?: number;
  round?: number;
}

const ACTIVE_ENDINGS: Record<MonsterTauntLevel, readonly string[]> = {
  probe: ['先认出我再说。', '别在热身时翻车。', '答得出来，才算开战。'],
  assertive: ['这次别想蒙过去。', '你的节奏到此为止。', '犹豫一下，你就输了。', '先过我这一关再狂。'],
  fierce: ['我就在这里断掉你的连击。', '记不牢，就别想踏过去。', '这回由我亲手收场。', '拿出真本事，不然就倒下。'],
  nemesis: ['这回也别想过去。', '我等着你再添一次败绩。', '不把我拿下，就别想前进一步。', '你的每次失手，我都记着。'],
};

const TIER_LEADS: Record<WaveMonster['tier'], readonly string[]> = {
  common: ['第一次交手？', '热身怪也敢小看？', '轮到我了，'],
  uncommon: ['你真的认得出来？', '别眨眼，', '中频词也能让你翻车，'],
  rare: ['低频硬词挡路，', '越少见越致命，', '这不是你熟悉的常见词，'],
  elite: ['长难词压阵，', '真正的硬仗现在才开始，', '能走到我面前算你有胆，'],
};

const PREVIEW_TAUNTS: Record<MonsterTauntLevel, readonly string[]> = {
  probe: ['列阵完毕。热身结束就开打。', '先看清楚，开战后别认错。'],
  assertive: ['记住这张脸，我会拦住你。', '这支队伍不收手软的人。', '看清楚了，等会别犹豫。'],
  fierce: ['硬仗就在眼前，别指望轻松过去。', '低频词已经列阵，准备挨个破。', '真正的对手都在这里等你。'],
  nemesis: ['老对手又见面了。你的败绩我都记着。', '又回来了？这次照样把你拦下。', '这支队伍专挑你的弱点下手。'],
};

const CRITICAL_REACTIONS = [
  '正中要害？！你来真的。',
  '这一击够狠…我记住了。',
  '居然一眼就把我看穿？！',
  '这么快？！这次算你狠。',
] as const;

const HIT_REACTIONS: Record<MonsterTauntLevel, readonly string[]> = {
  probe: ['哼，热身而已。', '答对一题，别急着得意。', '这次算你过。'],
  assertive: ['居然被你识破了。', '有点本事，但还没结束。', '哼，这一局让给你。'],
  fierce: ['能破我这一关？你有两下子。', '这一击我认了，后面更狠。', '啧，真让你闯过去了。'],
  nemesis: ['栽了这么多次，总算扳回一局。', '这次你赢，但旧账还没清。', '终于学会反击了？记牢它。'],
};

const GLOATING_REACTIONS: Record<MonsterTauntLevel, readonly string[]> = {
  probe: ['答错了。热身都没站稳。', '破绽太大，轮到我反击。', '这一下你没接住。'],
  assertive: ['我就知道你会在这里失手。', '连击断了。别急，后面更难。', '这词还没记牢，就敢来战？'],
  fierce: ['倒在我面前，不算意外。', '记不牢，就只能再挨一次。', '你刚才的气势呢？', '这一关，你还过不去。'],
  nemesis: ['又错。你的老毛病一点没变。', '我记得你上次也是这样倒下。', '败绩又多一笔，继续来。', '还没拿下我？那就再输一次。'],
};

function stableHash(seed: string): number {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

function rotatingPick(values: readonly string[], seed: string, cycle = 0): string {
  return values[(stableHash(seed) + Math.max(0, cycle)) % values.length];
}

export function monsterTauntLevel(monster: WaveMonster, combo = 0): MonsterTauntLevel {
  if (monster.mistakes >= 3) return 'nemesis';
  if (
    monster.mistakes >= 2
    || combo >= 5
    || monster.tier === 'elite'
    || monster.rarity >= 0.88
    || monster.difficultyScore >= 0.8
  ) return 'fierce';
  if (
    monster.mistakes >= 1
    || monster.tier === 'rare'
    || monster.difficultyScore >= 0.45
    || monster.learningStage === 'context'
    || monster.learningStage === 'recall'
  ) return 'assertive';
  return 'probe';
}

function activeLead(monster: WaveMonster, combo: number, cycle: number): string {
  const seed = `${monster.wordId}:lead`;
  if (monster.mistakes >= 3) {
    return rotatingPick([
      `在我这里栽了 ${monster.mistakes} 次，`,
      `已经错了 ${monster.mistakes} 次，`,
      `第 ${monster.attempts + 1} 次交手，`,
    ], seed, cycle);
  }
  if (combo >= 5) {
    return rotatingPick([
      `${combo} 连击？`,
      `带着 ${combo} 连击来？`,
      `${combo} 连胜到我面前？`,
    ], seed, cycle);
  }
  if (monster.rarity >= 0.75) {
    return rotatingPick(['低频硬词挡路，', '越少见越致命，', '生僻不等于能蒙，'], seed, cycle);
  }
  if (monster.lengthScore >= 0.7) {
    return rotatingPick(['长一点就开始乱？', '字母多了就慌？', '这串长词够你受的，'], seed, cycle);
  }
  if (monster.learningStage === 'recall') {
    return rotatingPick(['都到主动提取了，', '练到这一阶段还敢犹豫？', '该真正记牢了，'], seed, cycle);
  }
  if (monster.attempts === 0) {
    return rotatingPick(['第一次见面？', '新词上场，', '别把陌生当借口，'], seed, cycle);
  }
  return rotatingPick(TIER_LEADS[monster.tier], seed, cycle);
}

function activeTaunt(monster: WaveMonster, level: MonsterTauntLevel, combo: number, round: number): string {
  const lead = activeLead(monster, combo, round + monster.attempts);
  const ending = rotatingPick(ACTIVE_ENDINGS[level], `${monster.wordId}:ending`, round + monster.mistakes);
  return `${lead}${ending}`;
}

/** Resolves the one speech bubble allowed to speak in the monster wheel. */
export function resolveMonsterDialogue(
  monster: WaveMonster,
  event: CombatEvent | null,
  isFocus: boolean,
  context: MonsterDialogueContext = {},
): MonsterDialogue | null {
  if (!isFocus) return null;
  const combo = context.combo ?? event?.combo ?? 0;
  const round = context.round ?? event?.id ?? 0;
  const level = monsterTauntLevel(monster, combo);
  const seed = `${monster.wordId}:${monster.attempts}:${monster.mistakes}`;

  if (monster.status === 'active') {
    return {
      key: `active-${monster.wordId}-${round}-${level}`,
      text: activeTaunt(monster, level, combo, round),
      tone: 'taunt',
      level,
    };
  }

  if (monster.status === 'defeated' && event?.kind === 'hit') {
    const text = event.critical
      ? rotatingPick(CRITICAL_REACTIONS, seed, event.id)
      : monster.mistakes >= 3
        ? `错了 ${monster.mistakes} 次，总算赢回一局。`
        : rotatingPick(HIT_REACTIONS[level], seed, event.id);
    return {
      key: `hit-${event.id}`,
      text,
      tone: 'staggered',
      level,
    };
  }

  if (monster.status === 'missed' && (event?.kind === 'hurt' || event?.kind === 'defeat')) {
    const text = event.kind === 'defeat'
      ? '十二题已尽。胜负已定。'
      : monster.mistakes >= 3
        ? `第 ${monster.mistakes} 次了，你还是没记住。`
        : rotatingPick(GLOATING_REACTIONS[level], seed, event.id);
    return {
      key: `hurt-${event.id}`,
      text,
      tone: 'gloating',
      level,
    };
  }

  if (monster.status === 'pending') {
    return {
      key: `preview-${monster.wordId}`,
      text: rotatingPick(PREVIEW_TAUNTS[level], seed, round),
      tone: 'taunt',
      level,
    };
  }

  return null;
}
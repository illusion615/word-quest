import type { BankId, GrammarPattern } from './models';

export interface SentenceLevelPolicy {
  bankId: BankId;
  levelLabel: string;
  maxWords: number;
  maxCommas: number;
  allowedPatterns: GrammarPattern[];
  promptRule: string;
}

const HIGH_SCHOOL_PATTERNS: GrammarPattern[] = [
  'simple',
  'compound',
  'adverbial-clause',
  'relative-clause',
  'object-clause',
  'conditional',
  'passive',
  'non-finite',
];

export const SENTENCE_LEVEL_POLICIES: Record<BankId, SentenceLevelPolicy> = {
  gaokao: {
    bankId: 'gaokao',
    levelLabel: '高中 / 高考',
    maxWords: 22,
    maxCommas: 1,
    allowedPatterns: HIGH_SCHOOL_PATTERNS,
    promptRule: 'Use grammar taught in Chinese senior-high English. Keep clauses shallow and avoid inversion, the subjunctive mood, nested clauses, and dense academic nominalization.',
  },
  cet4: {
    bankId: 'cet4',
    levelLabel: 'CET-4',
    maxWords: 24,
    maxCommas: 2,
    allowedPatterns: HIGH_SCHOOL_PATTERNS,
    promptRule: 'Use clear general university English at CET-4 level. Use at most one subordinate clause and avoid rare idioms or dense academic syntax.',
  },
  cet6: {
    bankId: 'cet6',
    levelLabel: 'CET-6',
    maxWords: 28,
    maxCommas: 2,
    allowedPatterns: [...HIGH_SCHOOL_PATTERNS, 'academic-complex'],
    promptRule: 'Use natural CET-6 level English. Moderate academic syntax is allowed, but keep the sentence readable and limited to two clauses.',
  },
  ielts: {
    bankId: 'ielts',
    levelLabel: 'IELTS 备考',
    maxWords: 30,
    maxCommas: 2,
    allowedPatterns: [...HIGH_SCHOOL_PATTERNS, 'academic-complex'],
    promptRule: 'Use clear IELTS B2-C1 English with one purposeful complex structure and no obscure literary grammar.',
  },
  toefl: {
    bankId: 'toefl',
    levelLabel: 'TOEFL 备考',
    maxWords: 30,
    maxCommas: 2,
    allowedPatterns: [...HIGH_SCHOOL_PATTERNS, 'academic-complex'],
    promptRule: 'Use clear TOEFL B2-C1 academic English with no more than two clauses and no unnecessary syntactic density.',
  },
};

const IRREGULAR_LEMMAS: Record<string, string> = {
  am: 'be',
  are: 'be',
  been: 'be',
  being: 'be',
  did: 'do',
  does: 'do',
  done: 'do',
  doing: 'do',
  gave: 'give',
  given: 'give',
  gone: 'go',
  had: 'have',
  has: 'have',
  having: 'have',
  is: 'be',
  made: 'make',
  said: 'say',
  seen: 'see',
  thought: 'think',
  took: 'take',
  taken: 'take',
  was: 'be',
  went: 'go',
  were: 'be',
  written: 'write',
  wrote: 'write',
  ate: 'eat',
  became: 'become',
  began: 'begin',
  bent: 'bend',
  bit: 'bite',
  bitten: 'bite',
  bled: 'bleed',
  blew: 'blow',
  blown: 'blow',
  bought: 'buy',
  bound: 'bind',
  broke: 'break',
  broken: 'break',
  brought: 'bring',
  built: 'build',
  came: 'come',
  caught: 'catch',
  chose: 'choose',
  chosen: 'choose',
  clung: 'cling',
  crept: 'creep',
  drank: 'drink',
  drawn: 'draw',
  drew: 'draw',
  driven: 'drive',
  drove: 'drive',
  drunk: 'drink',
  eaten: 'eat',
  fallen: 'fall',
  fed: 'feed',
  fell: 'fall',
  felt: 'feel',
  fled: 'flee',
  flew: 'fly',
  flown: 'fly',
  flung: 'fling',
  forgave: 'forgive',
  forgot: 'forget',
  forgotten: 'forget',
  fought: 'fight',
  found: 'find',
  froze: 'freeze',
  frozen: 'freeze',
  got: 'get',
  gotten: 'get',
  grew: 'grow',
  grown: 'grow',
  heard: 'hear',
  held: 'hold',
  hid: 'hide',
  hidden: 'hide',
  hung: 'hang',
  kept: 'keep',
  knew: 'know',
  known: 'know',
  laid: 'lay',
  led: 'lead',
  left: 'leave',
  lent: 'lend',
  lost: 'lose',
  meant: 'mean',
  met: 'meet',
  paid: 'pay',
  ran: 'run',
  rang: 'ring',
  ridden: 'ride',
  risen: 'rise',
  rode: 'ride',
  rose: 'rise',
  rung: 'ring',
  sang: 'sing',
  sank: 'sink',
  sat: 'sit',
  sent: 'send',
  shot: 'shoot',
  showed: 'show',
  shown: 'show',
  slept: 'sleep',
  sold: 'sell',
  sought: 'seek',
  spent: 'spend',
  spoke: 'speak',
  spoken: 'speak',
  sprang: 'spring',
  spun: 'spin',
  stole: 'steal',
  stolen: 'steal',
  stood: 'stand',
  struck: 'strike',
  stuck: 'stick',
  stung: 'sting',
  sung: 'sing',
  sunk: 'sink',
  swam: 'swim',
  swept: 'sweep',
  swum: 'swim',
  swung: 'swing',
  taught: 'teach',
  told: 'tell',
  tore: 'tear',
  torn: 'tear',
  threw: 'throw',
  thrown: 'throw',
  understood: 'understand',
  woke: 'wake',
  woken: 'wake',
  won: 'win',
  wore: 'wear',
  worn: 'wear',
  wept: 'weep',
  wound: 'wind',
  children: 'child',
  feet: 'foot',
  men: 'man',
  mice: 'mouse',
  people: 'person',
  teeth: 'tooth',
  women: 'woman',
};

function removeDoubledFinal(value: string): string {
  return value.length > 2 && value.at(-1) === value.at(-2) ? value.slice(0, -1) : value;
}

export function candidateLemmas(token: string): string[] {
  const value = token.toLowerCase();
  const candidates = new Set([value]);
  if (IRREGULAR_LEMMAS[value]) candidates.add(IRREGULAR_LEMMAS[value]);
  if (value.endsWith('ies') && value.length > 3) candidates.add(`${value.slice(0, -3)}y`);
  if (value.endsWith('ied') && value.length > 3) candidates.add(`${value.slice(0, -3)}y`);
  if (value.endsWith('ves') && value.length > 3) {
    candidates.add(`${value.slice(0, -3)}f`);
    candidates.add(`${value.slice(0, -3)}fe`);
  }
  if (value.endsWith('ing') && value.length > 4) {
    const stem = value.slice(0, -3);
    candidates.add(stem);
    candidates.add(removeDoubledFinal(stem));
    candidates.add(`${stem}e`);
  }
  if (value.endsWith('ed') && value.length > 3) {
    const stem = value.slice(0, -2);
    candidates.add(stem);
    candidates.add(removeDoubledFinal(stem));
    candidates.add(`${value.slice(0, -1)}`);
  }
  if (value.endsWith('es') && value.length > 3) {
    candidates.add(value.slice(0, -2));
    candidates.add(value.slice(0, -1));
  } else if (value.endsWith('s') && value.length > 2 && !value.endsWith('ss')) {
    candidates.add(value.slice(0, -1));
  }
  return [...candidates];
}

export function tokenizeEnglishSentence(sentence: string): string[] {
  return sentence
    .normalize('NFKC')
    .replaceAll('’', "'")
    .match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)
    ?.map((token) => token.toLowerCase()) ?? [];
}

export function splitEnglishSentences(passage: string): string[] {
  return passage
    .trim()
    .match(/[^.!?]+(?:[.!?]+|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
}

/**
 * Counts how many tokens in the text realise the target word, tolerating regular
 * inflections (e.g. include → includes / including / included). Highlighting and
 * AI passage validation share this so a naturally inflected target still counts
 * as present and can be highlighted.
 */
export function countTargetOccurrences(text: string, target: string): number {
  const normalized = target.toLowerCase();
  return tokenizeEnglishSentence(text).filter((token) => (
    token === normalized || candidateLemmas(token).includes(normalized)
  )).length;
}
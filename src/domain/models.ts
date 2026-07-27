export type BankId =
  | 'gaokao'
  | 'cet4'
  | 'cet6'
  | 'ielts'
  | 'toefl';

export type GameMode =
  | 'listening'
  | 'choice'
  | 'sentence'
  | 'boss'
  | 'match-meaning'
  | 'listen-meaning'
  | 'match-word'
  | 'listen-word';

export type LearningStage = 'new' | 'sound' | 'context' | 'recall';

export type GrammarPattern =
  | 'simple'
  | 'compound'
  | 'adverbial-clause'
  | 'relative-clause'
  | 'object-clause'
  | 'conditional'
  | 'passive'
  | 'non-finite'
  | 'academic-complex';

export type SessionPhase = 'preview' | 'asking' | 'answered' | 'complete';

export interface WordEntry {
  id: string;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  definition: string;
  definitionZh: string;
  /** Stable IDs aligned with definitionZh sense order. */
  senseIds?: string[];
  /** Hash of the authoritative structured dictionary senses and examples. */
  lexicalSourceHash?: string;
  example?: string;
  exampleZh?: string;
  banks: BankId[];
  sourceTags?: string[];
  /** Runtime-only rank in the selected bank's common-first frequency order. */
  frequencyRank?: number;
  /** Runtime-only 0..1 percentile; 0 is most common and 1 is rarest. */
  frequencyPercentile?: number;
}

export type DefinitionLanguage = 'zh' | 'en';

export interface WordSenseExample {
  language: DefinitionLanguage;
  senseIndex: number;
  sentence: string;
  translation: string;
}

export interface WordSenseLearningContent {
  senseId: string;
  mnemonic: string;
  example: string;
  translation: string;
  usageTip: string;
  /** Whether the example comes from the dictionary or was generated to fill a gap. */
  exampleSource?: 'dictionary' | 'ai';
}

export interface DictionarySenseExample {
  english: string;
  chinese: string;
}

export interface DictionarySense {
  id: string;
  label: string;
  definitionZh: string;
  glossesEn?: string[];
  registers?: string[];
  domains?: string[];
  contexts?: string[];
  patterns?: string[];
  examples?: DictionarySenseExample[];
}

export interface DictionaryWordSenses {
  senses: DictionarySense[];
}

export interface DictionarySenseShard {
  schemaVersion: 1;
  words: Record<string, DictionaryWordSenses>;
}

export interface WordExplanation {
  markdown: string;
  senseExamples: WordSenseExample[];
  senseContent?: Record<string, WordSenseLearningContent>;
}

export type WordCoachSource = 'static' | 'ai';

export interface WordCoachInsight {
  wordId: string;
  status: 'loading' | 'success' | 'error';
  text: string;
  senseExamples: WordSenseExample[];
  senseContent?: Record<string, WordSenseLearningContent>;
  source: WordCoachSource;
}

export interface StaticWordCoachRecord {
  promptVersion: number;
  sourceHash: string;
  coachMarkdown: string;
  senseExamples: WordSenseExample[];
  senseContent?: Record<string, WordSenseLearningContent>;
}

export interface StaticWordCoachShard {
  schemaVersion: 1;
  records: Record<string, StaticWordCoachRecord>;
}

export interface WordBank {
  id: BankId;
  name: string;
  description: string;
  level: string;
}

export interface WordBankManifest extends WordBank {
  count: number;
  basis: string;
  status: 'syllabus-indexed' | 'curated';
  sourceName: string;
  sourceUrl: string;
  sourceVersion: string;
  dataFile: string;
}

export interface AnswerRecord {
  wordId: string;
  mode: GameMode;
  correct: boolean;
  answeredAt: string;
  responseTimeMs: number;
  timeLimitMs?: number;
  usedHint?: boolean;
  fsrsRating?: 1 | 2 | 3 | 4;
}

export interface SerializedFsrsCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export interface WordProgress {
  wordId: string;
  attempts: number;
  correct: number;
  /** Historical answer accuracy percentage; not a durable-mastery signal. */
  mastery: number;
  card: SerializedFsrsCard;
}

export interface LearningState {
  version: 1;
  progress: Record<string, WordProgress>;
  history: AnswerRecord[];
}

export interface SessionAnswer {
  correct: boolean;
  response: string;
  correctAnswer: string;
  choiceFeedback?: AnswerChoiceFeedback[];
}

export type AnswerChoiceStatus = 'correct' | 'incorrect' | 'missed';

export interface AnswerChoiceFeedback {
  text: string;
  status: AnswerChoiceStatus;
}

export interface SessionResult {
  word: WordEntry;
  mode: GameMode;
  answer: SessionAnswer;
}

export interface AdaptiveStudyItem {
  word: WordEntry;
  mode: GameMode;
  stage: LearningStage;
  chainIndex: number;
  chainPosition: number;
  chainRationale: ChainRationale;
  chainPassage: ChainPassage;
}

export interface ChainRationale {
  kind: 'coverage' | 'priority';
  label: string;
  description: string;
}

export interface ChainPassage {
  text: string;
  translation: string;
  source: 'ai' | 'offline';
  levelLabel?: string;
  contextualMeanings?: Record<string, string>;
  grammarPatterns?: GrammarPattern[];
  note?: string;
}

/**
 * Output of the deterministic scheduling pass. Each blueprint reserves a small
 * set of mandatory review words (`seeds`) that must appear in the generated
 * reading, plus a larger `pool` of level-appropriate candidates the model may
 * weave in freely. The AI decides which pool words to actually use and reports
 * them back, so the chain membership is finalized after generation.
 */
export interface ChainBlueprint {
  chainIndex: number;
  seeds: WordEntry[];
  pool: WordEntry[];
  rationale: ChainRationale;
}

export interface GameSessionState {
  queue: AdaptiveStudyItem[];
  results: SessionResult[];
  index: number;
  correctCount: number;
  phase: SessionPhase;
  answer: SessionAnswer | null;
  startedAt: number;
  questionStartedAt: number;
  deadline: number;
}
export type BankId =
  | 'gaokao'
  | 'cet4'
  | 'cet6'
  | 'ielts'
  | 'toefl';

export type GameMode = 'listening' | 'choice' | 'sentence' | 'boss';

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
  example?: string;
  exampleZh?: string;
  banks: BankId[];
  sourceTags?: string[];
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
  index: number;
  correctCount: number;
  phase: SessionPhase;
  answer: SessionAnswer | null;
  startedAt: number;
  questionStartedAt: number;
  deadline: number;
}
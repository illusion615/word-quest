import type {
  AdaptiveStudyItem,
  BankId,
  ChainBlueprint,
  ChainPassage,
  ChainRationale,
  GameMode,
  LearningStage,
  LearningState,
  WordEntry,
  WordProgress,
} from './models';
import { State } from 'ts-fsrs';
import {
  buildStudyCandidates,
  type ChallengeDifficulty,
  type StudyCandidate,
} from './progress';

// Scheduling reserves a couple of mandatory review words per reading and offers
// the model a wider pool of the most schedule-urgent, level-appropriate words.
// The AI decides which pool words to weave in and reports them, so the final
// chain membership is settled after generation rather than pre-committed.
export const DEFAULT_CHAIN_COUNT = 2;
export const CHAIN_SEED_SIZE = 1;
export const CHAIN_POOL_SIZE = 14;
export const CHAIN_TARGET_SIZE = 6;
export const CHAIN_MAX_SIZE = 8;
export const CHAIN_OFFLINE_SIZE = 4;
export const CLEARANCE_REVIEW_SIZE = 8;
export const ACTIVE_RECALL_STABILITY_DAYS = 7;

// Keep enough candidates per priority tier to fill every chain's pool even when
// only one tier (e.g. all-new for a fresh learner) supplies the session.
const CANDIDATES_PER_PRIORITY = Math.max(32, DEFAULT_CHAIN_COUNT * CHAIN_POOL_SIZE);

const STAGE_LABELS: Record<LearningStage, string> = {
  new: '新词',
  sound: '音形巩固',
  context: '语境练习',
  recall: '快速提取',
};

export interface AdaptiveStage {
  stage: LearningStage;
  mode: GameMode;
  label: string;
}

export interface StudyCapabilities {
  speechPlayback: boolean;
}

const DEFAULT_STUDY_CAPABILITIES: StudyCapabilities = { speechPlayback: true };

export function getAdaptiveStage(
  progress: WordProgress | undefined,
  capabilities: StudyCapabilities = DEFAULT_STUDY_CAPABILITIES,
): AdaptiveStage {
  // New / still-learning words face the easiest recognition: the word is shown
  // and read aloud, and the learner picks its meaning(s).
  if (!progress) return { stage: 'new', mode: 'match-meaning', label: '识义建立' };
  if (progress.card.state === State.Learning || progress.card.state === State.Relearning) {
    const usesAudio = capabilities.speechPlayback && progress.attempts % 2 === 1;
    return usesAudio
      ? { stage: 'sound', mode: 'listen-meaning', label: '听音识义' }
      : { stage: 'sound', mode: 'match-meaning', label: '巩固识义' };
  }
  // A steadier word alternates recognition with contextual typed recall.
  if (progress.card.stability < ACTIVE_RECALL_STABILITY_DAYS) {
    return progress.attempts % 2 === 0
      ? { stage: 'context', mode: 'match-word', label: '中文辨形' }
      : { stage: 'context', mode: 'sentence', label: '语境填空' };
  }
  // Stable words alternate audio recognition and full audio spelling; without
  // speech support the meaning-to-word form remains usable.
  if (!capabilities.speechPlayback) {
    return { stage: 'recall', mode: 'match-word', label: '辨形提取' };
  }
  return progress.attempts % 2 === 1
    ? { stage: 'recall', mode: 'listen-word', label: '听音辨词' }
    : { stage: 'recall', mode: 'listening', label: '听音拼写' };
}

function candidateStage(candidate: StudyCandidate, state: LearningState): LearningStage {
  return getAdaptiveStage(state.progress[candidate.word.id]).stage;
}

function coverageRationale(candidates: StudyCandidate[], state: LearningState): ChainRationale {
  const counts = new Map<LearningStage, number>();
  candidates.forEach((item) => {
    const stage = candidateStage(item, state);
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  });
  const summary = [...counts]
    .map(([stage, count]) => `${count} 个${STAGE_LABELS[stage]}`)
    .join(' · ');
  return {
    kind: 'coverage',
    label: '覆盖混合语境',
    description: `${summary}；优先安排到期词，由 AI 写一段自然的阅读理解，再在语境中逐个练习它实际用到的目标词。`,
  };
}

function offlinePassage(words: WordEntry[], note?: string): ChainPassage {
  return {
    text: words.map((word) => word.word).join(' · '),
    translation: 'AI 语境段落暂不可用，当前仅显示本组目标词序。',
    source: 'offline',
    ...(note ? { note } : {}),
  };
}

function buildCandidatePool(
  entries: WordEntry[],
  state: LearningState,
  now: Date,
  bankId?: BankId,
  difficulty: ChallengeDifficulty = 'standard',
): StudyCandidate[] {
  const candidates = buildStudyCandidates(entries, state, now, bankId, undefined, difficulty);
  return (['due', 'new'] as const).flatMap((priority) => (
    candidates.filter((candidate) => candidate.priority === priority).slice(0, CANDIDATES_PER_PRIORITY)
  ));
}

/**
 * Deterministic scheduling pass. Splits the most schedule-urgent candidates into
 * a few chain blueprints, each reserving its top words as mandatory review seeds
 * and offering the wider pool to the AI for natural enrichment.
 */
export function buildChainBlueprints(
  entries: WordEntry[],
  state: LearningState,
  chainCount = DEFAULT_CHAIN_COUNT,
  now = new Date(),
  bankId?: BankId,
  difficulty: ChallengeDifficulty = 'standard',
): ChainBlueprint[] {
  const remaining = buildCandidatePool(entries, state, now, bankId, difficulty);
  const blueprints: ChainBlueprint[] = [];

  while (blueprints.length < chainCount && remaining.length > 0) {
    const poolCandidates = remaining.splice(0, Math.min(CHAIN_POOL_SIZE, remaining.length));
    const seeds = poolCandidates.slice(0, Math.min(CHAIN_SEED_SIZE, poolCandidates.length));
    blueprints.push({
      chainIndex: blueprints.length,
      seeds: seeds.map((candidate) => candidate.word),
      pool: poolCandidates.map((candidate) => candidate.word),
      rationale: coverageRationale(poolCandidates.slice(0, CHAIN_OFFLINE_SIZE), state),
    });
  }

  return blueprints;
}

/**
 * Turns a resolved, ordered list of words (the ones the AI actually used, or the
 * offline seeds) into quiz items whose mode follows each word's own mastery.
 */
export function materializeChain(
  blueprint: ChainBlueprint,
  words: WordEntry[],
  passage: ChainPassage,
  state: LearningState,
  capabilities: StudyCapabilities = DEFAULT_STUDY_CAPABILITIES,
): AdaptiveStudyItem[] {
  return words.map((word, chainPosition) => {
    const adaptive = getAdaptiveStage(state.progress[word.id], capabilities);
    return {
      word,
      mode: adaptive.mode,
      stage: adaptive.stage,
      chainIndex: blueprint.chainIndex,
      chainPosition,
      chainRationale: blueprint.rationale,
      chainPassage: passage,
    };
  });
}

/** Fallback used when AI is unavailable: practise the mandatory seeds plus a few
 * pool words with a plain target-word list instead of a generated reading. */
export function buildOfflineChain(
  blueprint: ChainBlueprint,
  state: LearningState,
  note?: string,
  capabilities: StudyCapabilities = DEFAULT_STUDY_CAPABILITIES,
): AdaptiveStudyItem[] {
  const seedIds = new Set(blueprint.seeds.map((word) => word.id));
  const fill = blueprint.pool.filter((word) => !seedIds.has(word.id));
  const size = Math.max(CHAIN_OFFLINE_SIZE, blueprint.seeds.length);
  const words = [...blueprint.seeds, ...fill].slice(0, size);
  return materializeChain(blueprint, words, offlinePassage(words, note), state, capabilities);
}

/**
 * A failed final batch can leave an uncleared level with no unseen or due words.
 * This finite retry selects its weakest introduced words without changing FSRS
 * due dates, so the player can still earn the required battle victory.
 */
export function buildClearanceReview(
  entries: readonly WordEntry[],
  state: LearningState,
  capabilities: StudyCapabilities = DEFAULT_STUDY_CAPABILITIES,
): AdaptiveStudyItem[] {
  const words = [...entries]
    .filter((word) => Boolean(state.progress[word.id]))
    .sort((left, right) => {
      const leftProgress = state.progress[left.id]!;
      const rightProgress = state.progress[right.id]!;
      return leftProgress.mastery - rightProgress.mastery
        || leftProgress.card.stability - rightProgress.card.stability
        || left.word.localeCompare(right.word);
    })
    .slice(0, CLEARANCE_REVIEW_SIZE);
  const passage = offlinePassage(words, '本关新词已全部引入，当前进行通关复核。');
  return words.map((word, chainPosition) => {
    const adaptive = getAdaptiveStage(state.progress[word.id], capabilities);
    return {
      word,
      mode: adaptive.mode,
      stage: adaptive.stage,
      chainIndex: 0,
      chainPosition,
      chainRationale: {
        kind: 'priority',
        label: '通关复核',
        description: '复核本关薄弱词，赢下本场即可通关。',
      },
      chainPassage: passage,
    };
  });
}

export function getChainItems(
  plan: AdaptiveStudyItem[],
  chainIndex: number,
): AdaptiveStudyItem[] {
  return plan.filter((item) => item.chainIndex === chainIndex);
}
import { State } from 'ts-fsrs';
import type {
  AdaptiveStudyItem,
  GameMode,
  LearningStage,
  LearningState,
  WordEntry,
} from './models';
import { isReviewDue } from './learningSchedule';

export const BOSS_QUESTION_COUNT = 12;
export const BOSS_STAGE_SIZE = 4;
export const BOSS_WEAK_WORD_COUNT = 6;
export const BOSS_PASS_RATIO = 0.8;

export function bossPassingScore(questionCount = BOSS_QUESTION_COUNT): number {
  return Math.ceil(Math.max(0, questionCount) * BOSS_PASS_RATIO);
}

export interface BossStageMeta {
  index: number;
  name: string;
  goal: string;
}

export const BOSS_STAGES: readonly BossStageMeta[] = [
  { index: 0, name: '识破', goal: '看词或听音，辨认正确释义' },
  { index: 1, name: '破甲', goal: '根据释义或发音，从相近选项中找出目标词' },
  { index: 2, name: '终结', goal: '在语境、释义或纯听音条件下主动拼写' },
];

interface BossCapabilities {
  speechPlayback: boolean;
}

function latestResponseRatio(wordId: string, state: LearningState): number {
  const answer = [...state.history].reverse().find((record) => record.wordId === wordId);
  if (!answer || !answer.timeLimitMs || answer.timeLimitMs <= 0) return 0;
  return Math.min(2, answer.responseTimeMs / answer.timeLimitMs);
}

function weaknessScore(word: WordEntry, state: LearningState, now: Date): number {
  const progress = state.progress[word.id];
  if (!progress) return 10_000;
  const relearning = progress.card.state === State.Relearning ? 1 : 0;
  const due = isReviewDue(progress, now) ? 1 : 0;
  return (relearning * 2_000)
    + (due * 1_000)
    + ((100 - progress.mastery) * 8)
    + (Math.max(0, 14 - progress.card.stability) * 12)
    + (latestResponseRatio(word.id, state) * 100);
}

export function selectBossAssessmentWords(
  candidates: readonly WordEntry[],
  state: LearningState,
  now = new Date(),
): WordEntry[] {
  const unique = [...new Map(candidates.map((word) => [word.id, word])).values()];
  const ranked = [...unique].sort((left, right) => (
    weaknessScore(right, state, now) - weaknessScore(left, state, now)
    || left.word.localeCompare(right.word)
  ));
  const targetSize = Math.min(BOSS_QUESTION_COUNT, ranked.length);
  const weakCount = Math.min(BOSS_WEAK_WORD_COUNT, targetSize);
  const weak = ranked.slice(0, weakCount);
  const weakIds = new Set(weak.map((word) => word.id));
  const remaining = unique.filter((word) => !weakIds.has(word.id));
  const representativeCount = targetSize - weak.length;
  const representatives = Array.from({ length: representativeCount }, (_, index) => {
    const position = Math.min(
      remaining.length - 1,
      Math.floor(((index + 0.5) / representativeCount) * remaining.length),
    );
    return remaining[position];
  }).filter((word): word is WordEntry => Boolean(word));

  const interleaved: WordEntry[] = [];
  for (let index = 0; index < Math.max(weak.length, representatives.length); index += 1) {
    if (weak[index]) interleaved.push(weak[index]);
    if (representatives[index]) interleaved.push(representatives[index]);
  }
  return interleaved.slice(0, targetSize);
}

function stageModes(stageIndex: number, speechPlayback: boolean): readonly GameMode[] {
  if (stageIndex === 0) {
    return speechPlayback
      ? ['match-meaning', 'listen-meaning', 'match-meaning', 'listen-meaning']
      : ['match-meaning', 'match-meaning', 'match-meaning', 'match-meaning'];
  }
  if (stageIndex === 1) {
    return speechPlayback
      ? ['match-word', 'listen-word', 'match-word', 'listen-word']
      : ['match-word', 'match-word', 'match-word', 'match-word'];
  }
  return speechPlayback
    ? ['boss', 'sentence', 'listening', 'boss']
    : ['boss', 'sentence', 'boss', 'sentence'];
}

const STAGE_LEARNING_STAGE: readonly LearningStage[] = ['sound', 'context', 'recall'];

export function buildBossAssessmentPlan(
  candidates: readonly WordEntry[],
  state: LearningState,
  capabilities: BossCapabilities,
  now = new Date(),
): AdaptiveStudyItem[] {
  const words = selectBossAssessmentWords(candidates, state, now);
  return words.map((word, index) => {
    const chainIndex = Math.floor(index / BOSS_STAGE_SIZE);
    const chainPosition = index % BOSS_STAGE_SIZE;
    const stage = BOSS_STAGES[chainIndex] ?? BOSS_STAGES.at(-1)!;
    return {
      word,
      mode: stageModes(chainIndex, capabilities.speechPlayback)[chainPosition],
      stage: STAGE_LEARNING_STAGE[chainIndex] ?? 'recall',
      chainIndex,
      chainPosition,
      chainRationale: {
        kind: 'priority',
        label: `第 ${chainIndex + 1} 阶段 · ${stage.name}`,
        description: stage.goal,
      },
      chainPassage: {
        text: `Boss ${stage.name}阶段，共 ${BOSS_STAGE_SIZE} 题。`,
        translation: stage.goal,
        source: 'offline',
      },
    };
  });
}
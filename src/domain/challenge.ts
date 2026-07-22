import type { AnswerChoiceFeedback, WordEntry } from './models';
import { primarySense, splitDefinitionSenses } from './wordText';

/**
 * Builders for the battle's recognition challenges:
 *   - meaning options: show a word, pick ALL of its meanings (1..n correct)
 *   - word options: show a meaning (or play audio), pick the matching word
 * Randomness is injectable so the pure logic stays testable.
 */
export interface MeaningOption {
  id: string;
  text: string;
  correct: boolean;
}

export interface WordOption {
  id: string;
  word: WordEntry;
  correct: boolean;
}

const DEFAULT_MEANING_OPTIONS = 5;
const MAX_CORRECT_MEANINGS = 3;
const DEFAULT_WORD_OPTIONS = 4;

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [out[index], out[target]] = [out[target], out[index]];
  }
  return out;
}

function uniqueSenses(value: string): string[] {
  return [...new Set(splitDefinitionSenses(value).map((sense) => sense.trim()).filter(Boolean))];
}

function frequencyDistance(target: WordEntry, candidate: WordEntry): number {
  if (
    typeof target.frequencyPercentile === 'number'
    && typeof candidate.frequencyPercentile === 'number'
  ) {
    return Math.abs(target.frequencyPercentile - candidate.frequencyPercentile);
  }
  if (typeof target.frequencyRank === 'number' && typeof candidate.frequencyRank === 'number') {
    return Math.abs(target.frequencyRank - candidate.frequencyRank);
  }
  return Number.POSITIVE_INFINITY;
}

function orderDistractorCandidates(
  word: WordEntry,
  pool: readonly WordEntry[],
  random: () => number,
  preferSimilarDistractors: boolean,
): WordEntry[] {
  const candidates = shuffle(pool, random);
  if (!preferSimilarDistractors) return candidates;
  return candidates.sort((left, right) => {
    const leftPosMismatch = left.partOfSpeech === word.partOfSpeech ? 0 : 1;
    const rightPosMismatch = right.partOfSpeech === word.partOfSpeech ? 0 : 1;
    return leftPosMismatch - rightPosMismatch
      || frequencyDistance(word, left) - frequencyDistance(word, right);
  });
}

/**
 * Meanings for a match-meaning challenge: up to `maxCorrect` of the word's own
 * senses (all correct) padded with distractor senses drawn from other words.
 * A single-sense word degenerates to a one-correct question.
 */
export function buildMeaningOptions(
  word: WordEntry,
  pool: readonly WordEntry[],
  config: {
    optionCount?: number;
    extraOptionCount?: number;
    maxCorrect?: number;
    preferSimilarDistractors?: boolean;
    random?: () => number;
  } = {},
): MeaningOption[] {
  const random = config.random ?? Math.random;
  const extraOptionCount = Math.max(0, Math.floor(config.extraOptionCount ?? 0));
  const optionCount = Math.max(1, (config.optionCount ?? DEFAULT_MEANING_OPTIONS) + extraOptionCount);
  const maxCorrect = Math.max(1, config.maxCorrect ?? MAX_CORRECT_MEANINGS);

  const correctTexts = uniqueSenses(word.definitionZh).slice(0, maxCorrect);
  const seen = new Set(correctTexts);
  const distractors: string[] = [];
  const candidates = orderDistractorCandidates(
    word,
    pool,
    random,
    config.preferSimilarDistractors ?? false,
  );
  for (const candidate of candidates) {
    if (candidate.id === word.id) continue;
    const sense = primarySense(candidate.definitionZh).trim();
    if (!sense || seen.has(sense)) continue;
    seen.add(sense);
    distractors.push(sense);
  }

  const distractorTexts = distractors.slice(0, Math.max(0, optionCount - correctTexts.length));
  return shuffle([
    ...correctTexts.map((text) => ({ id: text, text, correct: true })),
    ...distractorTexts.map((text) => ({ id: text, text, correct: false })),
  ], random);
}

export function correctMeaningIds(options: readonly MeaningOption[]): string[] {
  return options.filter((option) => option.correct).map((option) => option.id);
}

/** True only when the learner selected exactly the correct meanings. */
export function gradeMeaningSelection(
  options: readonly MeaningOption[],
  selected: Iterable<string>,
): boolean {
  const selectedSet = new Set(selected);
  const correct = correctMeaningIds(options);
  return correct.length === selectedSet.size && correct.every((id) => selectedSet.has(id));
}

export function buildMeaningSelectionFeedback(
  options: readonly MeaningOption[],
  selected: ReadonlySet<string>,
): AnswerChoiceFeedback[] {
  return options.flatMap((option): AnswerChoiceFeedback[] => {
    if (selected.has(option.id)) {
      return [{
        text: option.text,
        status: option.correct ? 'correct' as const : 'incorrect' as const,
      }];
    }
    return option.correct
      ? [{ text: option.text, status: 'missed' as const }]
      : [];
  });
}

/**
 * Word choices for match-word / listen-word: the target plus distractor words
 * whose primary meaning differs, so there is one unambiguous answer.
 */
export function buildWordOptions(
  word: WordEntry,
  pool: readonly WordEntry[],
  config: {
    optionCount?: number;
    extraOptionCount?: number;
    preferSimilarDistractors?: boolean;
    random?: () => number;
  } = {},
): WordOption[] {
  const random = config.random ?? Math.random;
  const extraOptionCount = Math.max(0, Math.floor(config.extraOptionCount ?? 0));
  const optionCount = Math.max(1, (config.optionCount ?? DEFAULT_WORD_OPTIONS) + extraOptionCount);
  const targetSense = primarySense(word.definitionZh);
  const seen = new Set([word.id]);
  const distractors: WordEntry[] = [];
  const candidates = orderDistractorCandidates(
    word,
    pool,
    random,
    config.preferSimilarDistractors ?? false,
  );
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    if (primarySense(candidate.definitionZh) === targetSense) continue;
    seen.add(candidate.id);
    distractors.push(candidate);
    if (distractors.length >= optionCount - 1) break;
  }
  return shuffle([
    { id: word.id, word, correct: true },
    ...distractors.map((candidate) => ({ id: candidate.id, word: candidate, correct: false })),
  ], random);
}

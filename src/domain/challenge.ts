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
  word: WordEntry;
  senseIndex: number;
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

function uniqueSenses(value: string): Array<{ text: string; senseIndex: number }> {
  const seen = new Set<string>();
  return splitDefinitionSenses(value).flatMap((sense, senseIndex) => {
    const text = sense.trim();
    if (!text || seen.has(text)) return [];
    seen.add(text);
    return [{ text, senseIndex }];
  });
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

function normalizedPronunciation(word: WordEntry): string {
  return (word.phonetic || word.word)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\s/.[\]'"ˈˌ:ː-]/g, '')
    .replace(/[^a-z\u0250-\u02af]/g, '');
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function pronunciationDistance(target: WordEntry, candidate: WordEntry): number {
  const left = normalizedPronunciation(target);
  const right = normalizedPronunciation(candidate);
  return editDistance(left, right) / Math.max(1, left.length, right.length);
}

function orderDistractorCandidates(
  word: WordEntry,
  pool: readonly WordEntry[],
  random: () => number,
  preferSimilarDistractors: boolean,
  preferSimilarPronunciations = false,
): WordEntry[] {
  const candidates = shuffle(pool, random);
  if (preferSimilarPronunciations) {
    return candidates.sort((left, right) => (
      pronunciationDistance(word, left) - pronunciationDistance(word, right)
      || frequencyDistance(word, left) - frequencyDistance(word, right)
    ));
  }
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

  const correctSenses = uniqueSenses(word.definitionZh).slice(0, maxCorrect);
  const seen = new Set(correctSenses.map((sense) => sense.text));
  const distractors: MeaningOption[] = [];
  const candidates = orderDistractorCandidates(
    word,
    pool,
    random,
    config.preferSimilarDistractors ?? false,
  );
  for (const candidate of candidates) {
    if (candidate.id === word.id) continue;
    const sense = uniqueSenses(candidate.definitionZh)[0];
    if (!sense || seen.has(sense.text)) continue;
    seen.add(sense.text);
    distractors.push({
      id: sense.text,
      text: sense.text,
      correct: false,
      word: candidate,
      senseIndex: sense.senseIndex,
    });
  }

  const selectedDistractors = distractors.slice(0, Math.max(0, optionCount - correctSenses.length));
  return shuffle([
    ...correctSenses.map(({ text, senseIndex }) => ({
      id: text,
      text,
      correct: true,
      word,
      senseIndex,
    })),
    ...selectedDistractors,
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
    preferSimilarPronunciations?: boolean;
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
    config.preferSimilarPronunciations ?? false,
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

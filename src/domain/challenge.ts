import type { WordEntry } from './models';
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

/**
 * Meanings for a match-meaning challenge: up to `maxCorrect` of the word's own
 * senses (all correct) padded with distractor senses drawn from other words.
 * A single-sense word degenerates to a one-correct question.
 */
export function buildMeaningOptions(
  word: WordEntry,
  pool: readonly WordEntry[],
  config: { optionCount?: number; maxCorrect?: number; random?: () => number } = {},
): MeaningOption[] {
  const random = config.random ?? Math.random;
  const optionCount = config.optionCount ?? DEFAULT_MEANING_OPTIONS;
  const maxCorrect = Math.max(1, config.maxCorrect ?? MAX_CORRECT_MEANINGS);

  const correctTexts = uniqueSenses(word.definitionZh).slice(0, maxCorrect);
  const seen = new Set(correctTexts);
  const distractors: string[] = [];
  for (const candidate of pool) {
    if (candidate.id === word.id) continue;
    const sense = primarySense(candidate.definitionZh).trim();
    if (!sense || seen.has(sense)) continue;
    seen.add(sense);
    distractors.push(sense);
  }

  const distractorTexts = shuffle(distractors, random)
    .slice(0, Math.max(0, optionCount - correctTexts.length));
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

/**
 * Word choices for match-word / listen-word: the target plus distractor words
 * whose primary meaning differs, so there is one unambiguous answer.
 */
export function buildWordOptions(
  word: WordEntry,
  pool: readonly WordEntry[],
  config: { optionCount?: number; random?: () => number } = {},
): WordOption[] {
  const random = config.random ?? Math.random;
  const optionCount = config.optionCount ?? DEFAULT_WORD_OPTIONS;
  const targetSense = primarySense(word.definitionZh);
  const seen = new Set([word.id]);
  const distractors: WordEntry[] = [];
  for (const candidate of shuffle(pool, random)) {
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

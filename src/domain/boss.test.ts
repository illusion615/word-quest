import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import type { LearningState, WordEntry } from './models';
import {
  BOSS_QUESTION_COUNT,
  bossPassingScore,
  BOSS_STAGE_SIZE,
  BOSS_WEAK_WORD_COUNT,
  buildBossAssessmentPlan,
  selectBossAssessmentWords,
} from './boss';

function words(count: number): WordEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    ...TEST_WORDS[index % TEST_WORDS.length],
    id: `word-${index}`,
    word: `word${index}`,
  }));
}

function stateFor(entries: WordEntry[]): LearningState {
  return {
    version: 1,
    progress: Object.fromEntries(entries.map((word, index) => [word.id, {
      wordId: word.id,
      attempts: 5,
      correct: index < BOSS_WEAK_WORD_COUNT ? 1 : 5,
      mastery: index < BOSS_WEAK_WORD_COUNT ? 20 : 100,
      card: {
        due: index < BOSS_WEAK_WORD_COUNT
          ? '2026-07-20T00:00:00.000Z'
          : '2026-08-20T00:00:00.000Z',
        stability: index < BOSS_WEAK_WORD_COUNT ? 1 : 14,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 5,
        lapses: index < BOSS_WEAK_WORD_COUNT ? 2 : 0,
        state: 2,
      },
    }])),
    history: [],
  };
}

describe('Boss assessment planner', () => {
  it('requires ten correct answers in the fixed twelve-question battle', () => {
    expect(bossPassingScore()).toBe(10);
    expect(bossPassingScore(7)).toBe(6);
  });

  it('selects six weak words plus six representatives without duplicates', () => {
    const entries = words(100);
    const selected = selectBossAssessmentWords(
      entries,
      stateFor(entries),
      new Date('2026-07-23T00:00:00Z'),
    );

    expect(selected).toHaveLength(BOSS_QUESTION_COUNT);
    expect(new Set(selected.map((word) => word.id))).toHaveLength(BOSS_QUESTION_COUNT);
    expect(entries.slice(0, BOSS_WEAK_WORD_COUNT).every((word) => (
      selected.some((selectedWord) => selectedWord.id === word.id)
    ))).toBe(true);
  });

  it('builds a deterministic 4 + 4 + 4 mixed-mode battle', () => {
    const entries = words(100);
    const plan = buildBossAssessmentPlan(
      entries,
      stateFor(entries),
      { speechPlayback: true },
      new Date('2026-07-23T00:00:00Z'),
    );

    expect(plan).toHaveLength(BOSS_QUESTION_COUNT);
    expect(plan.filter((item) => item.chainIndex === 0)).toHaveLength(BOSS_STAGE_SIZE);
    expect(plan.filter((item) => item.chainIndex === 1)).toHaveLength(BOSS_STAGE_SIZE);
    expect(plan.filter((item) => item.chainIndex === 2)).toHaveLength(BOSS_STAGE_SIZE);
    expect(plan.map((item) => item.mode)).toEqual([
      'match-meaning', 'listen-meaning', 'match-meaning', 'listen-meaning',
      'match-word', 'listen-word', 'match-word', 'listen-word',
      'boss', 'sentence', 'listening', 'boss',
    ]);
  });

  it('falls back to non-audio forms without changing the finite question count', () => {
    const entries = words(100);
    const plan = buildBossAssessmentPlan(
      entries,
      stateFor(entries),
      { speechPlayback: false },
      new Date('2026-07-23T00:00:00Z'),
    );

    expect(plan).toHaveLength(BOSS_QUESTION_COUNT);
    expect(plan.some((item) => item.mode.startsWith('listen'))).toBe(false);
    expect(plan.some((item) => item.mode === 'listening')).toBe(false);
  });

  it('never duplicates words when the available review pool is unusually small', () => {
    const entries = words(7);
    const selected = selectBossAssessmentWords(
      entries,
      stateFor(entries),
      new Date('2026-07-23T00:00:00Z'),
    );

    expect(selected).toHaveLength(7);
    expect(new Set(selected.map((word) => word.id)).size).toBe(7);
  });
});
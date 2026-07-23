import { describe, expect, it } from 'vitest';
import {
  combatReducer,
  createCombatState,
  type ResolvedCombatAnswer,
} from './combat';

function answer(values: Partial<ResolvedCombatAnswer> = {}): ResolvedCombatAnswer {
  return {
    correct: true,
    responseTimeMs: 8_000,
    timeLimitMs: 10_000,
    mode: 'boss',
    usedHint: false,
    ...values,
  };
}

function started(questionCount = 10) {
  return combatReducer(createCombatState(questionCount), { type: 'start', skillId: 'steady' });
}

describe('combat engine', () => {
  it('sizes the roster to one monster per question', () => {
    const state = createCombatState(10);

    expect(state.phase).toBe('ready');
    expect(state.maxEnemyHealth).toBe(10);
    expect(state.requiredCorrectAnswers).toBe(0);
  });

  it('caps the required correct answers to the question count', () => {
    const state = createCombatState(10, { requiredCorrectAnswers: 20 });

    expect(state.requiredCorrectAnswers).toBe(10);
  });

  it('fells one monster per correct answer, builds combo, and records a fast critical hit', () => {
    const first = combatReducer(started(), {
      type: 'answer',
      answer: answer({ responseTimeMs: 3_000 }),
    });
    const second = combatReducer(first, { type: 'answer', answer: answer() });

    expect(first.lastEvent).toMatchObject({ kind: 'hit', critical: true, combo: 1 });
    expect(first.enemyHealth).toBe(first.maxEnemyHealth - 1);
    expect(second.combo).toBe(2);
    expect(second.bestCombo).toBe(2);
    expect(second.correctAnswers).toBe(2);
  });

  it('reduces hinted damage and never marks the hit as critical', () => {
    const state = combatReducer(started(), {
      type: 'answer',
      answer: answer({ responseTimeMs: 1_000, usedHint: true }),
    });

    expect(state.lastEvent).toMatchObject({ critical: false, damage: 7 });
  });

  it('lets the monster counterattack and resets combo on a miss', () => {
    const initial = combatReducer(createCombatState(10), { type: 'start', skillId: 'echo' });
    const hit = combatReducer(initial, { type: 'answer', answer: answer() });
    const miss = combatReducer(hit, {
      type: 'answer',
      answer: answer({ correct: false }),
    });

    expect(miss.combo).toBe(0);
    expect(miss.lastEvent).toMatchObject({ kind: 'hurt' });
  });

  it('lets steady preserve combo through the first miss only', () => {
    const hit = combatReducer(started(), { type: 'answer', answer: answer() });
    const firstMiss = combatReducer(hit, { type: 'answer', answer: answer({ correct: false }) });
    const secondMiss = combatReducer(firstMiss, { type: 'answer', answer: answer({ correct: false }) });

    expect(firstMiss.combo).toBe(1);
    expect(firstMiss.skillTriggered).toBe(true);
    expect(secondMiss.combo).toBe(0);
  });

  it('boosts listening damage with echo', () => {
    const state = combatReducer(
      combatReducer(createCombatState(10), { type: 'start', skillId: 'echo' }),
      { type: 'answer', answer: answer({ mode: 'listening' }) },
    );

    expect(state.lastEvent?.damage).toBe(15);
  });

  it('makes rush criticals harder but doubles their damage', () => {
    const rush = combatReducer(createCombatState(10), { type: 'start', skillId: 'rush' });
    const tooSlow = combatReducer(rush, {
      type: 'answer',
      answer: answer({ responseTimeMs: 3_500 }),
    });
    const critical = combatReducer(rush, {
      type: 'answer',
      answer: answer({ responseTimeMs: 2_500 }),
    });

    expect(tooSlow.lastEvent).toMatchObject({ critical: false, damage: 10 });
    expect(critical.lastEvent).toMatchObject({ critical: true, damage: 20 });
  });

  it('keeps the full learning batch running after repeated misses', () => {
    let state = started();
    for (let index = 0; index < 3; index += 1) {
      state = combatReducer(state, {
        type: 'answer',
        answer: answer({ correct: false }),
      });
    }
    const continued = combatReducer(state, { type: 'answer', answer: answer() });

    expect(state.phase).toBe('fighting');
    expect(state.answersResolved).toBe(3);
    expect(continued.answersResolved).toBe(4);
    expect(continued.correctAnswers).toBe(1);
  });

  it('resolves victory only after combat is explicitly finished', () => {
    let state = started(1);
    state = combatReducer(state, { type: 'answer', answer: answer() });
    expect(state.enemyHealth).toBe(0);
    expect(state.phase).toBe('fighting');

    state = combatReducer(state, { type: 'finish' });
    expect(state.phase).toBe('victory');
    expect(state.lastEvent?.kind).toBe('victory');
  });

  it('fails a finished battle when the enemy still has health', () => {
    const state = combatReducer(started(10), { type: 'finish' });
    expect(state.phase).toBe('defeat');
  });

  it('uses the configured correct-answer threshold only at final settlement', () => {
    let failed = combatReducer(
      createCombatState(3, { requiredCorrectAnswers: 2 }),
      { type: 'start', skillId: 'steady' },
    );
    failed = combatReducer(failed, { type: 'answer', answer: answer() });
    failed = combatReducer(failed, { type: 'answer', answer: answer({ correct: false }) });
    failed = combatReducer(failed, { type: 'answer', answer: answer({ correct: false }) });
    expect(failed.phase).toBe('fighting');
    expect(combatReducer(failed, { type: 'finish' }).phase).toBe('defeat');

    let passed = combatReducer(
      createCombatState(3, { requiredCorrectAnswers: 2 }),
      { type: 'start', skillId: 'steady' },
    );
    passed = combatReducer(passed, { type: 'answer', answer: answer() });
    passed = combatReducer(passed, { type: 'answer', answer: answer() });
    passed = combatReducer(passed, { type: 'answer', answer: answer({ correct: false }) });
    expect(combatReducer(passed, { type: 'finish' }).phase).toBe('victory');
  });
});
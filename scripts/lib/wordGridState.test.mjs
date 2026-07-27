import { describe, expect, it } from 'vitest';
import { resolveWordGridState, wordGridDeltaForEvent } from './wordGridState.mjs';

describe('resolveWordGridState', () => {
  it('gives active retries and processing precedence over historical states', () => {
    expect(resolveWordGridState({ active: { attempt: 2 }, failed: true })).toBe('retrying');
    expect(resolveWordGridState({ active: { attempt: 1 }, recordStatus: 'pass' })).toBe('processing');
  });

  it('preserves usable outcomes before unresolved failures', () => {
    expect(resolveWordGridState({ recordStatus: 'pass', failed: true })).toBe('pass');
    expect(resolveWordGridState({ recordStatus: 'warning', failed: true })).toBe('warning');
    expect(resolveWordGridState({ failed: true })).toBe('failed');
    expect(resolveWordGridState({ recordStatus: 'invalid' })).toBe('failed');
    expect(resolveWordGridState()).toBe('pending');
  });
});

describe('wordGridDeltaForEvent', () => {
  it('maps generator lifecycle events to compact visual deltas', () => {
    expect(wordGridDeltaForEvent({ type: 'word-start', wordId: 'one', attempt: 1 }).state).toBe('processing');
    expect(wordGridDeltaForEvent({ type: 'word-retry', wordId: 'one', attempt: 2 }).state).toBe('retrying');
    expect(wordGridDeltaForEvent({ type: 'word-writing', wordId: 'one' }).state).toBe('processing');
    expect(wordGridDeltaForEvent({ type: 'word-complete', wordId: 'one', qualityWarnings: [{}] }).state).toBe('warning');
    expect(wordGridDeltaForEvent({ type: 'word-failed', wordId: 'one' }).state).toBe('failed');
  });

  it('ignores non-word and non-lifecycle events', () => {
    expect(wordGridDeltaForEvent({ type: 'batch-complete' })).toBeNull();
    expect(wordGridDeltaForEvent({ type: 'plan', wordId: 'one' })).toBeNull();
  });
});

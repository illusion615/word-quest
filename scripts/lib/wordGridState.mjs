// Pure state resolution for the disk-map word visualization. One word may have
// several facts at once (e.g. failed previously but currently retrying); this
// module defines the single visual state and event deltas consistently.

export const WORD_GRID_STATES = Object.freeze([
  'pending',
  'processing',
  'retrying',
  'pass',
  'warning',
  'failed',
]);

/**
 * Priority: active retry > active process > usable corpus record >
 * unresolved failure > pending.
 */
export function resolveWordGridState({
  active = null,
  recordStatus = null,
  failed = false,
} = {}) {
  if (active) {
    if (Number(active.attempt) > 1 || active.type === 'word-retry') return 'retrying';
    return 'processing';
  }
  if (recordStatus === 'pass') return 'pass';
  if (recordStatus === 'warning') return 'warning';
  if (failed || recordStatus === 'invalid') return 'failed';
  return 'pending';
}

/** Convert one generator event into the smallest possible client grid update. */
export function wordGridDeltaForEvent(event) {
  if (!event?.wordId) return null;
  let state = null;
  if (event.type === 'word-start') state = Number(event.attempt) > 1 ? 'retrying' : 'processing';
  else if (event.type === 'word-retry') state = 'retrying';
  else if (event.type === 'word-writing') state = 'processing';
  else if (event.type === 'word-complete') state = event.qualityWarnings?.length ? 'warning' : 'pass';
  else if (event.type === 'word-failed') state = 'failed';
  if (!state) return null;
  return {
    wordId: event.wordId,
    word: event.word,
    state,
    laneId: Number.isInteger(event.laneId) ? event.laneId : null,
    phase: event.phase ?? null,
    attempt: event.attempt ?? event.attempts ?? null,
    maxAttempts: event.maxAttempts ?? null,
    durationMs: event.durationMs ?? null,
    message: event.message ?? event.semanticIssues?.[0]?.message ?? '',
    timestamp: event.timestamp,
  };
}

import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import type { AnswerRecord, WordEntry } from './models';
import {
  DEFAULT_NEW_WORD_LIMIT,
  buildStudyCandidates,
  buildStudyQueue,
  calculateStreak,
  createEmptyLearningState,
  parseLearningState,
  recordAnswer,
} from './progress';
import { frequencyBand, selectFrequencyMix, withFrequencyMetadata } from './frequencyMix';

function answer(wordId: string, correct: boolean, answeredAt: string): AnswerRecord {
  return {
    wordId,
    mode: 'listening',
    correct,
    answeredAt,
    responseTimeMs: 1200,
  };
}

describe('challenge difficulty selection', () => {
  const makeWord = (id: string, sourceTags: string[]): WordEntry => ({
    id,
    word: id,
    phonetic: '',
    partOfSpeech: 'noun',
    definition: 'x',
    definitionZh: 'x',
    banks: ['gaokao'],
    sourceTags,
  });
  // alpha/bravo are in-level (reach cet4/cet6); charlie is below the 高考 level.
  const entries = [
    makeWord('alpha', ['gk', 'cet6']),
    makeWord('bravo', ['gk', 'cet4']),
    makeWord('charlie', ['gk']),
  ];
  const now = new Date('2026-07-19T10:00:00.000Z');
  const state = createEmptyLearningState();
  const ids = (difficulty: 'relaxed' | 'standard' | 'hardcore') =>
    buildStudyCandidates(entries, state, now, 'gaokao', 8, difficulty).map((c) => c.word.id);

  it('standard keeps in-level words common-first with below-level last', () => {
    expect(ids('standard')).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('hardcore leads with the rarest in-level words', () => {
    expect(ids('hardcore')).toEqual(['bravo', 'alpha', 'charlie']);
  });

  it('relaxed keeps the raw common-first order', () => {
    expect(ids('relaxed')).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('biases a mixed level without dropping any frequency band', () => {
    const rankedEntries = withFrequencyMetadata(Array.from({ length: 40 }, (_, index) => (
      makeWord(`rank-${index}`, ['gk', 'cet6'])
    )));
    const mixedEntries = selectFrequencyMix(rankedEntries, rankedEntries.length, 'balanced');
    const select = (difficulty: 'relaxed' | 'standard' | 'hardcore') => (
      buildStudyCandidates(
        mixedEntries,
        state,
        now,
        'gaokao',
        12,
        difficulty,
      ).map((candidate) => candidate.word)
    );
    const bandCounts = (words: WordEntry[]) => words.reduce((counts, word) => {
      counts[frequencyBand(word)] += 1;
      return counts;
    }, [0, 0, 0, 0]);
    const relaxed = bandCounts(select('relaxed'));
    const standard = bandCounts(select('standard'));
    const hardcore = bandCounts(select('hardcore'));

    expect(relaxed.every((count) => count > 0)).toBe(true);
    expect(hardcore.every((count) => count > 0)).toBe(true);
    expect(relaxed[0]).toBeGreaterThan(relaxed[3]);
    expect(hardcore[3]).toBeGreaterThan(hardcore[0]);
    expect(standard).toEqual([3, 3, 3, 3]);
  });
});

describe('word fixture', () => {
  it('contains complete, unique entries for domain tests', () => {
    expect(new Set(TEST_WORDS.map((entry) => entry.id)).size).toBe(TEST_WORDS.length);
    expect(TEST_WORDS.every((entry) => entry.example?.toLowerCase().includes(entry.word))).toBe(true);
  });
});

describe('learning progress', () => {
  it('recovers safely from malformed persisted data', () => {
    expect(parseLearningState('{bad json')).toEqual(createEmptyLearningState());
    expect(parseLearningState('{"version":2}')).toEqual(createEmptyLearningState());
  });

  it('records an answer and schedules the next review', () => {
    const now = new Date('2026-07-19T10:00:00.000Z');
    const next = recordAnswer(
      createEmptyLearningState(),
      answer('achieve', true, now.toISOString()),
      now,
    );

    expect(next.progress.achieve.attempts).toBe(1);
    expect(next.progress.achieve.mastery).toBe(100);
    expect(new Date(next.progress.achieve.card.due).getTime()).toBeGreaterThan(now.getTime());
  });

  it('accumulates sense coverage inside the existing word progress', () => {
    const firstAt = '2026-07-19T10:00:00.000Z';
    const secondAt = '2026-07-20T10:00:00.000Z';
    const first = recordAnswer(createEmptyLearningState(), {
      ...answer('accept', false, firstAt),
      senseResults: [
        { senseId: 'accept:s0', correct: true },
        { senseId: 'accept:s1', correct: false },
      ],
    });
    const second = recordAnswer(first, {
      ...answer('accept', true, secondAt),
      senseResults: [{ senseId: 'accept:s1', correct: true }],
    });

    expect(second.progress.accept.senses).toEqual({
      'accept:s0': { attempts: 1, correct: 1, lastReviewedAt: firstAt },
      'accept:s1': { attempts: 2, correct: 1, lastReviewedAt: secondAt },
    });
    expect(second.progress.accept.attempts).toBe(2);
  });

  it('prioritizes due words before unseen words', () => {
    const now = new Date('2026-07-19T10:00:00.000Z');
    const learned = recordAnswer(
      createEmptyLearningState(),
      answer('benefit', true, now.toISOString()),
      now,
    );
    learned.progress.benefit.card.due = '2026-07-18T10:00:00.000Z';

    expect(buildStudyQueue(TEST_WORDS, learned, now, 2).map((entry) => entry.id))
      .toEqual(['benefit', 'achieve']);
  });

  it('never adds not-yet-due words just to fill a queue', () => {
    const now = new Date('2026-07-19T10:00:00.000Z');
    const learned = recordAnswer(
      createEmptyLearningState(),
      answer('benefit', true, now.toISOString()),
      now,
    );
    learned.progress.benefit.card.due = '2026-08-19T10:00:00.000Z';
    const onlyLearnedEntries = [TEST_WORDS.find((word) => word.id === 'benefit')!];

    expect(buildStudyQueue(onlyLearnedEntries, learned, now, 8)).toEqual([]);
  });

  it('caps new words while keeping every due review ahead of them', () => {
    const now = new Date('2026-07-19T10:00:00.000Z');
    const entries = Array.from({ length: 14 }, (_, index) => ({
      ...TEST_WORDS[index % TEST_WORDS.length],
      id: `word-${index}`,
      word: `word${index}`,
    }));
    const state = createEmptyLearningState();
    state.progress[entries[0].id] = recordAnswer(
      createEmptyLearningState(),
      answer(entries[0].id, false, now.toISOString()),
      now,
    ).progress[entries[0].id];
    state.progress[entries[0].id].card.due = '2026-07-18T10:00:00.000Z';

    const candidates = buildStudyCandidates(entries, state, now);

    expect(candidates[0]).toMatchObject({ priority: 'due', word: entries[0] });
    expect(candidates.filter((candidate) => candidate.priority === 'new'))
      .toHaveLength(DEFAULT_NEW_WORD_LIMIT);
  });

  it('moves to the next unseen batch instead of repeating the completed group', () => {
    const now = new Date('2026-07-19T10:00:00.000Z');
    const entries = Array.from({ length: 20 }, (_, index) => ({
      ...TEST_WORDS[index % TEST_WORDS.length],
      id: `word-${index}`,
      word: `word${index}`,
    }));
    const firstBatch = buildStudyQueue(entries, createEmptyLearningState(), now, 8);
    let state = createEmptyLearningState();

    firstBatch.forEach((word) => {
      state = recordAnswer(state, answer(word.id, true, now.toISOString()), now);
      state.progress[word.id].card.due = '2026-08-19T10:00:00.000Z';
    });

    const secondBatch = buildStudyQueue(entries, state, now, 8);
    const firstIds = new Set(firstBatch.map((word) => word.id));

    expect(firstBatch).toHaveLength(8);
    expect(secondBatch).toHaveLength(8);
    expect(secondBatch.every((word) => !firstIds.has(word.id))).toBe(true);
    expect(secondBatch.map((word) => word.id)).toEqual(
      entries.slice(8, 16).map((word) => word.id),
    );
  });

  it('counts consecutive local study days', () => {
    const history = [
      answer('achieve', true, '2026-07-17T12:00:00'),
      answer('benefit', true, '2026-07-18T12:00:00'),
      answer('curious', false, '2026-07-19T12:00:00'),
    ];
    expect(calculateStreak(history, new Date('2026-07-19T18:00:00'))).toBe(3);
  });

  it('sinks sub-level basic words to the back of the new queue for a bank', () => {
    const now = new Date('2026-07-19T10:00:00.000Z');
    const entries: WordEntry[] = [
      { ...TEST_WORDS[0], id: 'the', word: 'the', sourceTags: ['gk', 'zk'] },
      { ...TEST_WORDS[0], id: 'abandon', word: 'abandon', sourceTags: ['cet4', 'cet6', 'gk', 'ky'] },
      { ...TEST_WORDS[0], id: 'and', word: 'and', sourceTags: ['gk', 'zk'] },
      { ...TEST_WORDS[0], id: 'diverse', word: 'diverse', sourceTags: ['cet6', 'gk', 'ielts', 'ky'] },
    ];
    const state = createEmptyLearningState();

    expect(buildStudyQueue(entries, state, now, 4, 'gaokao').map((entry) => entry.id))
      .toEqual(['abandon', 'diverse', 'the', 'and']);
    expect(buildStudyQueue(entries, state, now, 4).map((entry) => entry.id))
      .toEqual(['the', 'abandon', 'and', 'diverse']);
  });
});
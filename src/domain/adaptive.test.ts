import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { TEST_WORDS } from '../test/fixtures/words';
import type {
  ChainBlueprint,
  LearningState,
  SerializedFsrsCard,
  WordEntry,
  WordProgress,
} from './models';
import {
  ACTIVE_RECALL_STABILITY_DAYS,
  CHAIN_OFFLINE_SIZE,
  CHAIN_POOL_SIZE,
  CHAIN_SEED_SIZE,
  buildChainBlueprints,
  buildOfflineChain,
  getAdaptiveStage,
  materializeChain,
} from './adaptive';

function makeEntries(count: number): WordEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    ...TEST_WORDS[index % TEST_WORDS.length],
    id: `word-${index}`,
    word: `word${index}`,
  }));
}

const emptyState: LearningState = { version: 1, progress: {}, history: [] };

const card: SerializedFsrsCard = {
  due: '2026-07-18T00:00:00.000Z',
  stability: 1,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 1,
  learning_steps: 0,
  reps: 1,
  lapses: 0,
  state: 1,
};

function progress(
  attempts: number,
  mastery: number,
  cardOverrides: Partial<SerializedFsrsCard> = {},
): WordProgress {
  return {
    wordId: 'word',
    attempts,
    correct: attempts,
    mastery,
    card: { ...card, ...cardOverrides },
  };
}

describe('adaptive study plan', () => {
  it('evolves the exercise with mastery', () => {
    expect(getAdaptiveStage(undefined)).toMatchObject({ stage: 'new', mode: 'choice' });
    expect(getAdaptiveStage(progress(1, 100, { state: State.Learning })))
      .toMatchObject({ stage: 'sound', mode: 'listening' });
    expect(getAdaptiveStage(progress(2, 100, { state: State.Review, stability: 3 })))
      .toMatchObject({ stage: 'context', mode: 'sentence' });
    expect(getAdaptiveStage(progress(3, 50, {
      state: State.Review,
      stability: ACTIVE_RECALL_STABILITY_DAYS,
    }))).toMatchObject({ stage: 'recall', mode: 'boss' });
  });

  it('keeps weak words in sound training', () => {
    expect(getAdaptiveStage(progress(4, 25, { state: State.Relearning })))
      .toMatchObject({ stage: 'sound', mode: 'listening' });
  });

  it('uses a non-audio assessment when speech playback is unavailable', () => {
    expect(getAdaptiveStage(progress(1, 100, { state: State.Learning }), { speechPlayback: false }))
      .toMatchObject({ stage: 'sound', mode: 'choice', label: '巩固词义' });
  });

  it('uses FSRS stability rather than historical accuracy to enter active recall', () => {
    expect(getAdaptiveStage(progress(8, 100, {
      state: State.Review,
      stability: ACTIVE_RECALL_STABILITY_DAYS - 0.01,
    }))).toMatchObject({ stage: 'context', mode: 'sentence' });
    expect(getAdaptiveStage(progress(2, 50, {
      state: State.Review,
      stability: ACTIVE_RECALL_STABILITY_DAYS,
    }))).toMatchObject({ stage: 'recall', mode: 'boss' });
  });

  it('caps fresh sessions instead of filling multiple chains with every unseen word', () => {
    const entries = makeEntries(40);
    const blueprints = buildChainBlueprints(entries, emptyState, 2, new Date('2026-07-19T00:00:00Z'));

    expect(blueprints).toHaveLength(1);
    expect(blueprints.map((blueprint) => blueprint.chainIndex)).toEqual([0]);
    blueprints.forEach((blueprint) => {
      expect(blueprint.seeds).toHaveLength(CHAIN_SEED_SIZE);
      expect(blueprint.pool.length).toBeLessThanOrEqual(CHAIN_POOL_SIZE);
      const poolIds = new Set(blueprint.pool.map((word) => word.id));
      expect(blueprint.seeds.every((seed) => poolIds.has(seed.id))).toBe(true);
    });
    expect(blueprints[0].pool).toHaveLength(8);
  });

  it('keeps the most overdue words as chain seeds', () => {
    const words = makeEntries(11);
    const state: LearningState = {
      version: 1,
      progress: Object.fromEntries(words.slice(0, 5).map((word, index) => [word.id, {
        ...progress(2, 100),
        wordId: word.id,
        card: { ...card, due: `2026-07-18T00:00:0${index}.000Z` },
      }])),
      history: [],
    };

    const blueprints = buildChainBlueprints(words, state, 1, new Date('2026-07-19T00:00:00Z'));

    expect(blueprints).toHaveLength(1);
    expect(blueprints[0].seeds).toHaveLength(CHAIN_SEED_SIZE);
    expect(state.progress[blueprints[0].seeds[0].id]?.card.due).toContain('2026-07-18');
  });

  it('materializes AI-used words into quiz items that share one passage', () => {
    const entries = makeEntries(6);
    const blueprint: ChainBlueprint = {
      chainIndex: 0,
      seeds: entries.slice(0, 2),
      pool: entries,
      rationale: { kind: 'coverage', label: '覆盖混合语境', description: '测试' },
    };
    const passage = {
      text: 'A short curious reading passage for word0 and word1 and word2.',
      translation: '测试。',
      source: 'ai' as const,
      levelLabel: '高中 / 高考',
    };
    const words = entries.slice(0, 3);

    const items = materializeChain(blueprint, words, passage, emptyState);

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.chainPosition)).toEqual([0, 1, 2]);
    expect(items.every((item) => item.chainIndex === 0)).toBe(true);
    expect(items.every((item) => item.chainPassage === passage)).toBe(true);
    expect(items.every((item) => item.mode === 'choice')).toBe(true);
  });

  it('materializes sound-stage words without listening mode when speech is unavailable', () => {
    const entries = makeEntries(2);
    const state: LearningState = {
      version: 1,
      progress: {
        [entries[0].id]: { ...progress(1, 100), wordId: entries[0].id },
      },
      history: [],
    };
    const blueprint: ChainBlueprint = {
      chainIndex: 0,
      seeds: entries.slice(0, 1),
      pool: entries,
      rationale: { kind: 'coverage', label: '测试', description: '测试' },
    };
    const passage = { text: 'word0 word1', translation: '测试', source: 'offline' as const };

    const items = materializeChain(
      blueprint,
      entries,
      passage,
      state,
      { speechPlayback: false },
    );

    expect(items[0]).toMatchObject({ stage: 'sound', mode: 'choice' });
  });

  it('falls back to seeds plus filler words with an offline passage', () => {
    const entries = makeEntries(6);
    const blueprint: ChainBlueprint = {
      chainIndex: 1,
      seeds: entries.slice(0, 2),
      pool: entries,
      rationale: { kind: 'coverage', label: '覆盖混合语境', description: '测试' },
    };

    const items = buildOfflineChain(blueprint, emptyState, '离线');

    expect(items).toHaveLength(CHAIN_OFFLINE_SIZE);
    expect(items.slice(0, CHAIN_SEED_SIZE).map((item) => item.word.id))
      .toEqual(entries.slice(0, CHAIN_SEED_SIZE).map((word) => word.id));
    expect(items.every((item) => item.chainPassage.source === 'offline')).toBe(true);
    expect(items.every((item) => item.chainIndex === 1)).toBe(true);
    expect(items[0].chainPassage.note).toBe('离线');
    expect(items[0].chainPassage.text).toContain(' · ');
  });
});
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { JourneyLevel } from '../domain/journey';
import type { AnswerRecord, LearningState, WordEntry } from '../domain/models';
import { createEmptyLearningState, recordAnswer } from '../domain/progress';
import { LevelWordDialog } from './LevelWordDialog';

const word: WordEntry = {
  id: 'accept',
  word: 'accept',
  phonetic: '/əkˈsept/',
  partOfSpeech: 'verb',
  definition: 'receive willingly',
  definitionZh: 'vt. 接受；vt. 采用；vt. 忍受',
  banks: ['gaokao'],
};

const level: JourneyLevel = {
  id: 'level-1',
  globalIndex: 0,
  number: 1,
  kind: 'normal',
  chapterIndex: 0,
  chapterLevelNumber: 1,
  wordStart: 0,
  wordEnd: 1,
  wordCount: 1,
  masteredCount: 0,
  dueCount: 0,
  newCount: 0,
  nextReviewAt: null,
  progressPercentage: 0,
  perfect: false,
  status: 'active',
  frequencyLabel: '高频为主',
};

function answer(
  state: LearningState,
  answeredAt: string,
  correct: boolean,
  senseId: string,
): LearningState {
  const record: AnswerRecord = {
    wordId: word.id,
    mode: 'match-meaning',
    correct,
    answeredAt,
    responseTimeMs: 1_000,
    senseResults: [{ senseId, correct }],
  };
  return recordAnswer(state, record, new Date(answeredAt));
}

describe('LevelWordDialog', () => {
  it('renders semantic coverage and answer accuracy from learning progress', () => {
    const first = answer(
      createEmptyLearningState(),
      '2026-07-26T00:00:00.000Z',
      true,
      'accept:s0',
    );
    const state = answer(first, '2026-07-27T00:00:00.000Z', false, 'accept:s2');
    const html = renderToStaticMarkup(
      <LevelWordDialog
        level={level}
        bankName="高中课标词汇"
        words={[word]}
        learningState={state}
        loading={false}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('第 1 关单词列表');
    expect(html).toContain('accept');
    expect(html).toContain('66.67%');
    expect(html).toContain('50%');
    expect(html).toContain('1 / 2 次作答');
  });
});
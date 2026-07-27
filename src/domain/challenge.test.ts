import { describe, expect, it } from 'vitest';
import type { WordEntry } from './models';
import {
  buildMeaningOptions,
  buildMeaningSelectionFeedback,
  buildMeaningSenseResults,
  buildWordOptions,
  correctMeaningIds,
  gradeMeaningSelection,
  selectMeaningSenseIds,
} from './challenge';

function makeWord(word: string, definitionZh: string): WordEntry {
  return {
    id: word.toLowerCase(),
    word,
    phonetic: '',
    partOfSpeech: 'noun',
    definition: 'x',
    definitionZh,
    banks: ['gaokao'],
  };
}

const pool = [
  makeWord('bank', 'n. 银行；vt. 存入银行'),
  makeWord('river', 'n. 河流'),
  makeWord('run', 'v. 跑'),
  makeWord('apple', 'n. 苹果'),
  makeWord('table', 'n. 桌子'),
];

const stableRandom = () => 0;

describe('buildMeaningOptions', () => {
  it('marks all of the target word senses correct and pads with distractors', () => {
    const target = makeWord('bank', 'n. 银行；vt. 存入银行');
    const options = buildMeaningOptions(target, pool, { optionCount: 5, random: stableRandom });

    const correct = options.filter((option) => option.correct).map((option) => option.text);
    expect(correct).toEqual(expect.arrayContaining(['n. 银行', 'vt. 存入银行']));
    expect(options).toHaveLength(5);
    expect(options.filter((option) => !option.correct).length).toBe(3);
    expect(options.find((option) => option.text === 'vt. 存入银行')).toMatchObject({
      word: target,
      senseIndex: 1,
    });
    expect(options.find((option) => !option.correct)).toMatchObject({
      senseIndex: 0,
    });
  });

  it('degenerates to a single correct answer for a single-sense word', () => {
    const target = makeWord('river', 'n. 河流');
    const options = buildMeaningOptions(target, pool, { random: stableRandom });
    expect(correctMeaningIds(options)).toEqual(['n. 河流']);
  });

  it('adds one distractor per extra-option stack', () => {
    const target = makeWord('bank', 'n. 银行；vt. 存入银行');
    const options = buildMeaningOptions(target, pool, {
      extraOptionCount: 1,
      random: stableRandom,
    });

    expect(options).toHaveLength(6);
    expect(options.filter((option) => !option.correct)).toHaveLength(4);
  });

  it('rotates from the first three senses to the next unseen senses', () => {
    const target = makeWord(
      'accept',
      'vt. 接受；vt. 采用；vt. 吸收；vt. 聘用；vt. 相信；vt. 忍受',
    );
    const firstIds = selectMeaningSenseIds(target, undefined);
    const firstProgress = Object.fromEntries(firstIds.map((senseId) => [senseId, {
      attempts: 1,
      correct: 1,
      lastReviewedAt: '2026-07-20T00:00:00.000Z',
    }]));

    expect(firstIds).toEqual(['accept:s0', 'accept:s1', 'accept:s2']);
    expect(selectMeaningSenseIds(target, firstProgress))
      .toEqual(['accept:s3', 'accept:s4', 'accept:s5']);
  });

  it('revisits weak senses after every sense has been covered', () => {
    const target = makeWord('accept', 'vt. 接受；vt. 采用；vt. 相信；vt. 忍受');
    const progress = Object.fromEntries(
      selectMeaningSenseIds(target, undefined, 4).map((senseId, index) => [senseId, {
        attempts: 2,
        correct: index === 2 ? 0 : 2,
        lastReviewedAt: `2026-07-2${index}T00:00:00.000Z`,
      }]),
    );

    expect(selectMeaningSenseIds(target, progress, 1)).toEqual(['accept:s2']);
  });
});

describe('gradeMeaningSelection', () => {
  const target = makeWord('bank', 'n. 银行；vt. 存入银行');
  const options = buildMeaningOptions(target, pool, { optionCount: 5, random: stableRandom });
  const correct = correctMeaningIds(options);

  it('passes only when exactly the correct meanings are chosen', () => {
    expect(gradeMeaningSelection(options, correct)).toBe(true);
    expect(gradeMeaningSelection(options, correct.slice(0, 1))).toBe(false); // missing one
    expect(gradeMeaningSelection(options, [...correct, 'n. 河流'])).toBe(false); // extra wrong
  });

  it('classifies selected correct, selected wrong, and missed correct options', () => {
    const wrongOption = options.find((option) => !option.correct)!;
    const selected = new Set([correct[0], wrongOption.id]);
    const feedback = buildMeaningSelectionFeedback(options, selected);

    expect(feedback).toEqual(expect.arrayContaining([
      { text: correct[0], status: 'correct' },
      { text: wrongOption.text, status: 'incorrect' },
      { text: correct[1], status: 'missed' },
    ]));
    expect(feedback).toHaveLength(3);
  });

  it('records an outcome for every tested target sense', () => {
    const selected = new Set([correct[0]]);
    const selectedSenseId = options.find((option) => option.id === correct[0])!.senseId;
    const missedSenseId = options.find((option) => (
      option.correct && option.id !== correct[0]
    ))!.senseId;
    expect(buildMeaningSenseResults(options, selected)).toEqual(expect.arrayContaining([
      { senseId: selectedSenseId, correct: true },
      { senseId: missedSenseId, correct: false },
    ]));
  });
});

describe('buildWordOptions', () => {
  it('includes the target plus distinct-meaning distractors with one correct', () => {
    const target = makeWord('river', 'n. 河流');
    const options = buildWordOptions(target, pool, { optionCount: 4, random: stableRandom });
    expect(options).toHaveLength(4);
    expect(options.filter((option) => option.correct)).toHaveLength(1);
    expect(options.find((option) => option.correct)?.word.id).toBe('river');
  });

  it('prioritizes same-part-of-speech words with nearby frequency', () => {
    const target = { ...makeWord('river', 'n. 河流'), frequencyPercentile: 0.5 };
    const candidates = [
      target,
      { ...makeWord('sprint', 'v. 冲刺'), partOfSpeech: 'verb', frequencyPercentile: 0.51 },
      { ...makeWord('ocean', 'n. 海洋'), frequencyPercentile: 0.9 },
      { ...makeWord('stream', 'n. 溪流'), frequencyPercentile: 0.52 },
      { ...makeWord('lake', 'n. 湖泊'), frequencyPercentile: 0.6 },
    ];
    const options = buildWordOptions(target, candidates, {
      optionCount: 3,
      preferSimilarDistractors: true,
      random: stableRandom,
    });
    const distractorIds = options
      .filter((option) => !option.correct)
      .map((option) => option.id);

    expect(distractorIds).toEqual(expect.arrayContaining(['stream', 'lake']));
    expect(distractorIds).not.toContain('sprint');
    expect(distractorIds).not.toContain('ocean');
  });

  it('filters distractors against the planned later target sense', () => {
    const target = makeWord('bank', 'n. 银行；n. 岸');
    const shore = makeWord('shore', 'n. 岸');
    const options = buildWordOptions(target, [target, shore, ...pool], {
      optionCount: 4,
      targetSenseId: 'bank:s1',
      random: stableRandom,
    });

    expect(options.some((option) => option.word.id === 'shore')).toBe(false);
  });

  it('prioritizes similar phonetics for listening word choices', () => {
    const target = { ...makeWord('ship', 'n. 船'), phonetic: '/ʃɪp/' };
    const candidates = [
      target,
      { ...makeWord('sheep', 'n. 羊'), phonetic: '/ʃiːp/' },
      { ...makeWord('shop', 'n. 商店'), phonetic: '/ʃɒp/' },
      { ...makeWord('table', 'n. 桌子'), phonetic: '/ˈteɪbəl/' },
      { ...makeWord('universe', 'n. 宇宙'), phonetic: '/ˈjuːnɪvɜːs/' },
    ];
    const options = buildWordOptions(target, candidates, {
      optionCount: 3,
      preferSimilarPronunciations: true,
      random: stableRandom,
    });
    const distractorIds = options
      .filter((option) => !option.correct)
      .map((option) => option.id);

    expect(distractorIds).toEqual(expect.arrayContaining(['sheep', 'shop']));
    expect(distractorIds).not.toContain('table');
  });

  it('adds one word choice per extra-option stack', () => {
    const target = makeWord('river', 'n. 河流');
    const options = buildWordOptions(target, pool, {
      extraOptionCount: 1,
      random: stableRandom,
    });

    expect(options).toHaveLength(5);
  });
});

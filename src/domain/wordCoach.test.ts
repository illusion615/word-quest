import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import type { WordExplanation } from './models';
import {
  assessWordCoachQuality,
  parseWordCoachSections,
  wordCoachRecordHasSourceConflict,
  wordCoachRequiresSemanticReview,
  wordCoachSourceHash,
} from './wordCoach';

const word = TEST_WORDS[0];
const valid: WordExplanation = {
  markdown: [
    '### 记忆钩子',
    '',
    '把这个词放进一个清晰场景中记忆。',
    '',
    '### 义项地图',
    '',
    '- **v. 实现**: 表示完成目标。 **搭配:** achieve a goal',
    '- **n. 成就**: 表示完成后的成果。 **搭配:** a major achievement',
    '',
    '### 使用提醒',
    '',
    '- **义项对比**: 根据词性判断。',
    '- **常见混淆**: 注意动词和名词。',
    '- **注意**: 结合上下文使用。',
  ].join('\n'),
  senseExamples: [
    { language: 'zh', senseIndex: 0, sentence: 'She will achieve her goal soon.', translation: '她很快会实现目标。' },
    { language: 'zh', senseIndex: 1, sentence: 'This achieve example is only for testing.', translation: '这是用于测试的第二条例句。' },
  ],
};

describe('word coach quality assessment', () => {
  it('accepts a structurally complete coach without warnings', () => {
    expect(assessWordCoachQuality(word, valid)).toEqual([]);
  });

  it('reports hard structural and translation errors', () => {
    const issues = assessWordCoachQuality(word, {
      markdown: '### 只有一个标题\n\n- 一个列表项',
      senseExamples: [{
        language: 'zh',
        senseIndex: 0,
        sentence: 'She will achieve her goal soon.',
        translation: 'No Chinese translation here.',
      }],
    });
    expect(issues.some((issue) => issue.code === 'markdown-headings' && issue.severity === 'error')).toBe(true);
    expect(issues.some((issue) => issue.code === 'translation-language-0' && issue.severity === 'error')).toBe(true);
  });

  it('allows prompt-authorized roots and sound mnemonics without automatic review', () => {
    const issues = assessWordCoachQuality(word, {
      ...valid,
      markdown: valid.markdown.replace(
        '把这个词放进一个清晰场景中记忆。',
        '这个词源自拉丁语，发音听起来像另一个词。',
      ),
    });
    expect(issues).toEqual([]);
  });
});

describe('word coach display sections', () => {
  it('groups each generated sense and keeps general guidance separate', () => {
    expect(parseWordCoachSections(valid.markdown, 2)).toEqual({
      memoryHeading: '记忆钩子',
      memoryHook: '把这个词放进一个清晰场景中记忆。',
      senseHeading: '义项地图',
      senses: [
        { distinction: '表示完成目标。', patternLabel: '搭配', pattern: 'achieve a goal' },
        { distinction: '表示完成后的成果。', patternLabel: '搭配', pattern: 'a major achievement' },
      ],
      guidanceHeading: '使用提醒',
      generalGuidance: [
        { label: '义项对比', text: '根据词性判断。' },
        { label: '常见混淆', text: '注意动词和名词。' },
        { label: '注意', text: '结合上下文使用。' },
      ],
    });
  });

  it('returns null when a legacy coach cannot be grouped safely', () => {
    expect(parseWordCoachSections('### 只有一段\n\n自由文本', 1)).toBeNull();
  });
});

describe('word coach semantic review policy', () => {
  it('skips semantic review in unreviewed mode and requires it in strict mode', () => {
    expect(wordCoachRequiresSemanticReview(word, 'unreviewed')).toBe(false);
    expect(wordCoachRequiresSemanticReview(word, 'strict')).toBe(true);
  });

  it('reviews only polysemous or source-risk words in balanced mode', () => {
    expect(wordCoachRequiresSemanticReview(word, 'balanced')).toBe(false);
    expect(wordCoachRequiresSemanticReview({
      ...word,
      definitionZh: 'n. 第一义；第二义；第三义；第四义；第五义',
    }, 'balanced')).toBe(true);
    expect(wordCoachRequiresSemanticReview({
      ...word,
      id: 'vcd',
      word: 'vcd',
      definitionZh: '[电] 可变电容二极体',
    }, 'balanced')).toBe(true);
    expect(wordCoachRequiresSemanticReview({
      ...word,
      definitionZh: 'a. 无电线的, 交直流两用的',
    }, 'balanced')).toBe(true);
    expect(wordCoachRequiresSemanticReview({
      ...word,
      definitionZh: '[计算机] 普通长单词的技术义项',
    }, 'balanced')).toBe(false);
  });
});

describe('word coach source conflicts', () => {
  it('keeps a source conflict blocked across prompt revisions until the source changes', () => {
    const sourceHash = wordCoachSourceHash(word);
    const record = {
      promptVersion: 1,
      sourceHash,
      coachMarkdown: valid.markdown,
      senseExamples: valid.senseExamples,
      qualityReview: {
        reviewVersion: 1,
        contentHash: 'old-content',
        verdict: 'fail' as const,
        issues: [{
          severity: 'error' as const,
          code: 'source_conflict' as const,
          senseIndex: 0,
          message: '源词典义项有误。',
        }],
        model: 'reviewer',
        reviewedAt: '2026-07-24T00:00:00.000Z',
      },
    };

    expect(wordCoachRecordHasSourceConflict(word, record)).toBe(true);
    expect(wordCoachRecordHasSourceConflict({
      ...word,
      definitionZh: `${word.definitionZh}；修订义项`,
    }, record)).toBe(false);
  });
});
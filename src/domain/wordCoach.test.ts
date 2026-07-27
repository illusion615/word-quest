import { describe, expect, it } from 'vitest';
import { TEST_WORDS } from '../test/fixtures/words';
import type { WordExplanation } from './models';
import {
  assessWordCoachQuality,
  parseWordCoachSections,
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
  it('invalidates learning content when stable sense identity changes', () => {
    expect(wordCoachSourceHash({ ...word, senseIds: ['achieve:s0', 'achieve:s1'] }))
      .not.toBe(wordCoachSourceHash({ ...word, senseIds: ['achieve:s1', 'achieve:s0'] }));
  });

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

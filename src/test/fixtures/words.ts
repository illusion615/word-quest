import type { WordEntry } from '../../domain/models';

export const TEST_WORDS: WordEntry[] = [
  {
    id: 'achieve',
    word: 'achieve',
    phonetic: '/əˈtʃiːv/',
    partOfSpeech: 'verb',
    definition: 'to successfully reach a goal',
    definitionZh: '实现；达成',
    example: 'She worked steadily to achieve her goal.',
    exampleZh: '她持续努力，最终实现了目标。',
    banks: ['gaokao'],
  },
  {
    id: 'benefit',
    word: 'benefit',
    phonetic: '/ˈbenɪfɪt/',
    partOfSpeech: 'noun',
    definition: 'a helpful or useful effect',
    definitionZh: '益处；好处',
    example: 'Daily reading has a lasting benefit.',
    exampleZh: '每天阅读会带来长久的益处。',
    banks: ['gaokao'],
  },
  {
    id: 'curious',
    word: 'curious',
    phonetic: '/ˈkjʊəriəs/',
    partOfSpeech: 'adjective',
    definition: 'eager to know or learn something',
    definitionZh: '好奇的；求知的',
    example: 'A curious learner asks useful questions.',
    exampleZh: '好奇的学习者会提出有用的问题。',
    banks: ['gaokao'],
  },
];
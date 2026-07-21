import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WordEntry } from '../domain/models';
import { WordDefinitions } from './WordDefinitions';

const word: WordEntry = {
  id: 'still',
  word: 'still',
  phonetic: '/stɪl/',
  partOfSpeech: 'adverb',
  definition: 'n. a quiet state；adv. continuing until now',
  definitionZh: 'n. 寂静；adv. 仍然；[摄影] 剧照',
  example: 'The room was still quiet.',
  exampleZh: '房间里仍然很安静。',
  banks: ['gaokao'],
};

describe('WordDefinitions', () => {
  it('renders bilingual senses and examples as separate semantic sections', () => {
    const html = renderToStaticMarkup(<WordDefinitions word={word} />);
    expect(html).toContain('<h3 id="definition-zh-heading">中文释义</h3>');
    expect(html).toContain('<span class="sense-label">adv.</span>');
    expect(html).toContain('<span class="sense-label">[摄影]</span>');
    expect(html).toContain('<h3 id="definition-en-heading">English definitions</h3>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<footer>房间里仍然很安静。</footer>');
  });
});
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WordEntry } from '../domain/models';
import { SenseList, WordDefinitions } from './WordDefinitions';

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

  it('renders the matching example directly under each sense', () => {
    const html = renderToStaticMarkup(
      <WordDefinitions
        word={word}
        senseExamples={[
          {
            language: 'zh',
            senseIndex: 0,
            sentence: 'The room was completely still.',
            translation: '房间里一片寂静。',
          },
          {
            language: 'en',
            senseIndex: 1,
            sentence: 'She is still waiting outside.',
            translation: '她仍在外面等候。',
          },
        ]}
        exampleStatus="success"
      />,
    );

    expect(html).toContain('class="sense-example"');
    expect(html).toContain('The room was completely still.');
    expect(html).toContain('她仍在外面等候。');
    expect(html).toContain('此义项暂缺例句。');
  });

  it('explains how examples become available without AI', () => {
    const html = renderToStaticMarkup(
      <WordDefinitions word={word} exampleStatus="unavailable" />,
    );
    expect(html).toContain('连接 AI 后生成此义项的用法例句。');
  });

  it('can render sense examples as collapsed disclosures', () => {
    const html = renderToStaticMarkup(
      <SenseList
        senses={[{ label: 'n.', text: '寂静' }]}
        examples={[{
          language: 'zh',
          senseIndex: 0,
          sentence: 'The room was completely still.',
          translation: '房间里一片寂静。',
        }]}
        exampleStatus="success"
        collapsibleExamples
      />,
    );

    expect(html).toContain('查看该义项例句');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('The room was completely still.');
  });
});
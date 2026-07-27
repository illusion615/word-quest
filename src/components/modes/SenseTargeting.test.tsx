import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WordEntry } from '../../domain/models';
import { BossQuestion } from './BossQuestion';
import { MatchMeaningQuestion } from './MatchMeaningQuestion';
import { MatchWordQuestion } from './MatchWordQuestion';

const target: WordEntry = {
  id: 'accept',
  word: 'accept',
  phonetic: '/əkˈsept/',
  partOfSpeech: 'transitive verb',
  definition: 'accept',
  definitionZh: 'vt. 接受；vt. 采用；vt. 吸收；vt. 聘用；vt. 相信；vt. 忍受',
  banks: ['gaokao'],
};

const distractors: WordEntry[] = ['河流', '苹果', '桌子', '天空'].map((definition, index) => ({
  ...target,
  id: `distractor-${index}`,
  word: `distractor${index}`,
  definitionZh: `n. ${definition}`,
}));

describe('semantic question targeting', () => {
  it('renders the planned later-sense batch instead of always using senses one to three', () => {
    const html = renderToStaticMarkup(
      <MatchMeaningQuestion
        word={target}
        entries={[target, ...distractors]}
        isSpeechSupported={false}
        isSpeaking={false}
        onSpeak={() => undefined}
        onSubmit={() => undefined}
        targetSenseIds={['accept:s3', 'accept:s4', 'accept:s5']}
      />,
    );

    expect(html).toContain('vt. 聘用');
    expect(html).toContain('vt. 相信');
    expect(html).toContain('vt. 忍受');
    expect(html).toContain('本轮考查 3 / 6 个义项');
    expect(html).not.toContain('vt. 接受');
    expect(html).not.toContain('vt. 采用');
    expect(html).not.toContain('vt. 吸收');
  });

  it('uses the planned sense in meaning-to-word and Boss recall prompts', () => {
    const matchWord = renderToStaticMarkup(
      <MatchWordQuestion
        word={target}
        entries={[target, ...distractors]}
        targetSenseId="accept:s3"
        onSubmit={() => undefined}
      />,
    );
    const boss = renderToStaticMarkup(
      <BossQuestion
        word={target}
        targetSenseId="accept:s4"
        onSubmit={() => undefined}
      />,
    );

    expect(matchWord).toContain('vt. 聘用');
    expect(matchWord).not.toContain('vt. 接受');
    expect(boss).toContain('vt. 相信');
    expect(boss).not.toContain('vt. 接受');
  });
});
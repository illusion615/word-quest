import { describe, expect, it } from 'vitest';
import {
  buildLexiconArtifacts,
  projectBank,
  updateCanonicalDefinition,
} from './lexiconArtifacts.mjs';

const entry = {
  id: 'wave',
  word: 'wave',
  phonetic: '/weɪv/',
  partOfSpeech: 'noun',
  definition: 'n. a moving ridge; v. move a hand',
  definitionZh: 'n. 波浪；vi. 挥手',
  senseIds: ['wave:s0', 'wave:s1'],
  sourceTags: ['gk'],
  banks: ['gaokao'],
};

describe('canonical lexicon artifacts', () => {
  it('round-trips runtime bank entries exactly', () => {
    const { lexicon, bankIndex } = buildLexiconArtifacts(
      new Map([['gaokao', [entry]]]),
      { name: 'test' },
    );
    expect(projectBank(lexicon, bankIndex, 'gaokao')).toEqual([entry]);
  });

  it('keeps existing IDs when a new sense is inserted before them', () => {
    const original = buildLexiconArtifacts(
      new Map([['gaokao', [entry]]]),
      { name: 'test' },
    ).lexicon.words.wave;
    const updated = updateCanonicalDefinition(original, 'a. 波状的；n. 波浪；vi. 挥手');

    expect(updated.senses.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: 'wave:s2', text: '波状的' },
      { id: 'wave:s0', text: '波浪' },
      { id: 'wave:s1', text: '挥手' },
    ]);
  });

  it('preserves IDs across reordering and reuses the position for a correction', () => {
    const original = buildLexiconArtifacts(
      new Map([['gaokao', [entry]]]),
      { name: 'test' },
    ).lexicon.words.wave;
    const reordered = updateCanonicalDefinition(original, 'vi. 挥手；n. 波浪');
    const corrected = updateCanonicalDefinition(original, 'n. 波；vi. 挥手');

    expect(reordered.senses.map((sense) => sense.id)).toEqual(['wave:s1', 'wave:s0']);
    expect(corrected.senses.map((sense) => sense.id)).toEqual(['wave:s0', 'wave:s1']);
  });

  it('keeps separators inside one structured sense out of runtime sense boundaries', () => {
    const { lexicon, bankIndex } = buildLexiconArtifacts(
      new Map([['gaokao', [entry]]]),
      { name: 'test' },
    );
    lexicon.words.wave.senses[0].text = '波浪；浪潮';

    const projected = projectBank(lexicon, bankIndex, 'gaokao')[0];
    expect(projected.definitionZh).toBe('n. 波浪、浪潮；vi. 挥手');
    expect(projected.senseIds).toEqual(['wave:s0', 'wave:s1']);
  });
});
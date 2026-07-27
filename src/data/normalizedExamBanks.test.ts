/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOSS_LEVEL_INTERVAL,
  getBossLevelEntries,
  orderWordsByJourney,
} from '../domain/journey';
import type { BankId, LearningState, WordEntry } from '../domain/models';
import { parseDefinitionSenses } from '../domain/wordText';

interface LexiconData {
  schemaVersion: 3;
  words: Record<string, Omit<WordEntry, 'banks' | 'definitionZh'> & {
    senses: Array<{ id: string; label: string; separator: string; text: string }>;
  }>;
}

interface BankIndexData {
  schemaVersion: 1;
  banks: Record<BankId, string[]>;
}

const bankDirectory = resolve('public/data/exam-banks');
const manifest = JSON.parse(readFileSync(resolve(bankDirectory, 'manifest.json'), 'utf8')) as {
  banks: Array<{ id: BankId; file: string }>;
};
const lexicon = JSON.parse(readFileSync(resolve('public/data/lexicon/words.json'), 'utf8')) as LexiconData;
const bankIndex = JSON.parse(readFileSync(resolve(bankDirectory, 'bank-index.json'), 'utf8')) as BankIndexData;
const emptyLearningState: LearningState = { version: 1, progress: {}, history: [] };

describe('normalized exam-bank projections', () => {
  it.each(manifest.banks)('preserves $id runtime entries and journey mechanics', (bank) => {
    const runtimeEntries = JSON.parse(
      readFileSync(resolve(bankDirectory, bank.file), 'utf8'),
    ) as WordEntry[];
    const projectedEntries = bankIndex.banks[bank.id].map((wordId) => {
      const {
        id,
        word,
        phonetic,
        partOfSpeech,
        definition,
        example,
        exampleZh,
        sourceTags,
        lexicalSourceHash,
        senses,
      } = lexicon.words[wordId];
      return {
        id,
        word,
        phonetic,
        partOfSpeech,
        definition,
        definitionZh: senses.map((sense) => (
          sense.label
            ? `${sense.label}${sense.separator}${sense.text.replace(/；/g, '、')}`
            : sense.text.replace(/；/g, '、')
        )).join('；'),
        senseIds: senses.map((sense) => sense.id),
        ...(example !== undefined ? { example } : {}),
        ...(exampleZh !== undefined ? { exampleZh } : {}),
        ...(sourceTags !== undefined ? { sourceTags } : {}),
        ...(lexicalSourceHash !== undefined ? { lexicalSourceHash } : {}),
        banks: [bank.id],
      };
    });

    expect(projectedEntries).toEqual(runtimeEntries);
    expect(orderWordsByJourney(projectedEntries, bank.id).map((word) => word.id))
      .toEqual(orderWordsByJourney(runtimeEntries, bank.id).map((word) => word.id));
    expect(getBossLevelEntries(
      projectedEntries,
      emptyLearningState,
      BOSS_LEVEL_INTERVAL - 1,
      bank.id,
    ).map((word) => word.id)).toEqual(getBossLevelEntries(
      runtimeEntries,
      emptyLearningState,
      BOSS_LEVEL_INTERVAL - 1,
      bank.id,
    ).map((word) => word.id));
  });

  it.each(manifest.banks)('exposes every $id part-of-speech label to the runtime parser', (bank) => {
    const runtimeEntries = JSON.parse(
      readFileSync(resolve(bankDirectory, bank.file), 'utf8'),
    ) as WordEntry[];
    const unparsed = runtimeEntries.flatMap((entry) => (
      parseDefinitionSenses(entry.definitionZh)
        .filter((sense) => /^[A-Za-z]+\.(\s|$)/.test(sense.text))
        .map((sense) => `${entry.id}: ${sense.label}|${sense.text}`)
    ));

    expect(unparsed).toEqual([]);
  });});
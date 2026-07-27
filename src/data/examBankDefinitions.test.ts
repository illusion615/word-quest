/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitDefinitionSenses } from '../domain/wordText';

function loadBank(file: string): Array<{ id: string; definitionZh: string }> {
  return JSON.parse(readFileSync(resolve('public/data/exam-banks', file), 'utf8'));
}

function loadBankIndex(): { banks: Record<string, string[]> } {
  return JSON.parse(readFileSync(resolve('public/data/exam-banks/bank-index.json'), 'utf8'));
}

function verbSenses(definitionZh: string): string[] {
  return splitDefinitionSenses(definitionZh).filter((sense) => /^(vt|vi|v)\.\s/i.test(sense.trim()));
}

describe('exam bank Chinese definitions', () => {
  const gaokao = loadBank('gaokao.json');
  const bankIndex = loadBankIndex();
  const byId = new Map(gaokao.map((entry) => [entry.id, entry]));

  it('keeps the lightweight journey index aligned with full bank order', () => {
    expect(bankIndex.banks.gaokao).toEqual(gaokao.map((entry) => entry.id));
  });

  it('strips spurious verb senses from WordNet-known non-verbs', () => {
    // "safety" is a noun in WordNet; ECDICT wrongly appended "vt. 保护, 防护".
    expect(verbSenses(byId.get('safety')?.definitionZh ?? '')).toHaveLength(0);
    expect(verbSenses(byId.get('salary')?.definitionZh ?? '')).toHaveLength(0);
    expect(byId.get('safety')?.definitionZh).not.toMatch(/保护/);
  });

  it('preserves legitimate verb senses of real verbs', () => {
    // "time" and "make" are verbs in WordNet; their verb glosses must remain.
    expect(verbSenses(byId.get('time')?.definitionZh ?? '').length).toBeGreaterThan(0);
    expect(verbSenses(byId.get('make')?.definitionZh ?? '').length).toBeGreaterThan(0);
  });

  it('never leaves an entry without a Chinese definition', () => {
    expect(gaokao.every((entry) => entry.definitionZh.trim().length > 0)).toBe(true);
  });
});

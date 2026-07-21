import { describe, expect, it } from 'vitest';
import { parseDefinitionSenses, primarySense, splitDefinitionSenses } from './wordText';

describe('word display text', () => {
  it('keeps only the first generated sense for compact questions', () => {
    expect(primarySense('v. create something；v. grow over time')).toBe('v. create something');
  });

  it('uses a fallback when the source definition is empty', () => {
    expect(primarySense('', '中文释义')).toBe('中文释义');
  });

  it('splits multiple senses and extracts labels', () => {
    const value = 'n. 蒸馏室, 寂静；v. 使平静；adj. 静止的；[经] 静态资产；补充释义';
    expect(splitDefinitionSenses(value)).toHaveLength(5);
    expect(parseDefinitionSenses(value)).toEqual([
      { label: 'n.', text: '蒸馏室, 寂静' },
      { label: 'v.', text: '使平静' },
      { label: 'adj.', text: '静止的' },
      { label: '[经]', text: '静态资产' },
      { label: '', text: '补充释义' },
    ]);
  });
});
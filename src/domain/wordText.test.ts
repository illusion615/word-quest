import { describe, expect, it } from 'vitest';
import {
  parseDefinitionSenses,
  parseWordSenses,
  primarySense,
  splitDefinitionSenses,
} from './wordText';

describe('word display text', () => {
  it('keeps only the first generated sense for compact questions', () => {
    expect(primarySense('v. create something；v. grow over time')).toBe('v. create something');
  });

  it('uses a fallback when the source definition is empty', () => {
    expect(primarySense('', '中文释义')).toBe('中文释义');
  });

  it('splits multiple senses and extracts labels', () => {
    const value = 'n. 蒸馏室, 寂静；v. 使平静；adj. 静止的；s. 安静的；[经] 静态资产；补充释义';
    expect(splitDefinitionSenses(value)).toHaveLength(6);
    expect(parseDefinitionSenses(value)).toEqual([
      { label: 'n.', text: '蒸馏室, 寂静' },
      { label: 'v.', text: '使平静' },
      { label: 'adj.', text: '静止的' },
      { label: 's.', text: '安静的' },
      { label: '[经]', text: '静态资产' },
      { label: '', text: '补充释义' },
    ]);
  });

  it('extracts compound Oxford part-of-speech labels', () => {
    expect(parseDefinitionSenses('def. art. 用于姓氏前；v. link. 表明属性；n. pl. 群众；phr. v. 出发'))
      .toEqual([
        { label: 'def. art.', text: '用于姓氏前' },
        { label: 'v. link.', text: '表明属性' },
        { label: 'n. pl.', text: '群众' },
        { label: 'phr. v.', text: '出发' },
      ]);
  });

  it('aligns stable IDs with runtime sense order and falls back deterministically', () => {    expect(parseWordSenses({
      id: 'still',
      definitionZh: 'n. 寂静；adv. 仍然',
      senseIds: ['still:s4', 'still:s8'],
    }).map((sense) => sense.id)).toEqual(['still:s4', 'still:s8']);
    expect(parseWordSenses({
      id: 'still',
      definitionZh: 'n. 寂静；adv. 仍然',
    }).map((sense) => sense.id)).toEqual(['still:s0', 'still:s1']);
  });
});
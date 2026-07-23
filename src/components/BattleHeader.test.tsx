import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { combatReducer, createCombatState } from '../domain/combat';
import { BattleHeader } from './BattleHeader';

describe('BattleHeader', () => {
  it('combines navigation, progress and combat status in one header', () => {
    const state = combatReducer(createCombatState(10), { type: 'start', skillId: 'steady' });
    const html = renderToStaticMarkup(
      <BattleHeader
        state={state}
        levelNumber={3}
        title="释义选择 · 建立识别"
        onExit={() => undefined}
      />,
    );

    expect(html).toContain('退出本轮');
    expect(html).toContain('第 3 关');
    expect(html).toContain('释义选择 · 建立识别');
    expect(html).not.toContain('卷王护盾');
    expect(html).toContain('稳扎');
    expect(html.indexOf('退出本轮')).toBeLessThan(html.indexOf('第 3 关'));
  });
});
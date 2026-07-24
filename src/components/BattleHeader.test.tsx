import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { combatReducer, createCombatState } from '../domain/combat';
import { BattleHeader } from './BattleHeader';

describe('BattleHeader', () => {
  it('combines navigation, progress and combat status in one header', () => {
    const started = combatReducer(createCombatState(10), { type: 'start', skillId: 'steady' });
    const state = { ...started, combo: 3 };
    const html = renderToStaticMarkup(
      <BattleHeader
        state={state}
        levelNumber={3}
        title="释义选择 · 建立识别"
        onExit={() => undefined}
        boostCount={2}
        autoAdvanceEnabled
        onToggleAutoAdvance={() => undefined}
      />,
    );

    expect(html).toContain('退出本轮');
    expect(html).toContain('第 3 关');
    expect(html).toContain('释义选择 · 建立识别');
    expect(html).toContain('COMBO');
    expect(html).toContain('×3');
    expect(html).toContain('BOOST');
    expect(html).toContain('×2');
    expect(html).toContain('combo-status is-active');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('关闭自动下一题');
    expect(html.indexOf('退出本轮')).toBeLessThan(html.indexOf('第 3 关'));
  });

  it('renders auto advance as an off switch when disabled', () => {
    const html = renderToStaticMarkup(
      <BattleHeader
        state={createCombatState(3)}
        levelNumber={1}
        title="听音识义"
        onExit={() => undefined}
        autoAdvanceEnabled={false}
        onToggleAutoAdvance={() => undefined}
      />,
    );

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('开启自动下一题');
  });
});
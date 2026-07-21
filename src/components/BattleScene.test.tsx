import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCombatState } from '../domain/combat';
import { BattleScene } from './BattleScene';

describe('BattleScene', () => {
  it('layers status, monster, context and action content in one scene', () => {
    const html = renderToStaticMarkup(
      <BattleScene
        state={createCombatState(5)}
        levelNumber={3}
        enemyKind="grunt"
        headerTitle="释义选择 · 建立识别"
        currentQuestion={2}
        totalQuestions={5}
        onExit={() => undefined}
        contextPanel={<p>语境面板</p>}
      >
        <button type="button">作答面板</button>
      </BattleScene>,
    );

    expect(html).toContain('battle-scene is-grunt is-assessment');
    expect(html).toContain('battle-context-toggle');
    expect(html).not.toContain('battle-context-panel');
    expect(html).toContain('battle-action-panel');
    expect(html).toContain('等待战斗的词怪');
    expect(html).toContain('释义选择 · 建立识别');
    expect(html).toContain('2 / 5');
    expect(html).not.toContain('语境面板');
    expect(html).toContain('作答面板');
  });

  it('renders preview cards in a dedicated non-glass tray', () => {
    const html = renderToStaticMarkup(
      <BattleScene
        state={createCombatState(5)}
        levelNumber={3}
        enemyKind="grunt"
        headerTitle="记忆串联"
        currentQuestion={1}
        totalQuestions={5}
        onExit={() => undefined}
        contextPanel={<p>阅读理解</p>}
        preview
      >
        <div>卡牌区</div>
      </BattleScene>,
    );

    expect(html).toContain('class="battle-action-panel battle-card-tray"');
    expect(html).not.toContain('class="battle-glass-panel battle-action-panel"');
  });

  it('collapses assessment reading behind a compact toggle by default', () => {
    const html = renderToStaticMarkup(
      <BattleScene
        state={createCombatState(5)}
        levelNumber={3}
        enemyKind="grunt"
        headerTitle="释义选择"
        currentQuestion={1}
        totalQuestions={5}
        onExit={() => undefined}
        contextPanel={<p>隐藏的阅读正文</p>}
      >
        <div>考核区</div>
      </BattleScene>,
    );

    expect(html).toContain('阅读理解');
    expect(html).not.toContain('隐藏的阅读正文');
    expect(html).not.toContain('battle-context-panel');
  });
});
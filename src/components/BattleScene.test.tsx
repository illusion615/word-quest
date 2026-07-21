import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCombatState } from '../domain/combat';
import { BattleScene } from './BattleScene';

describe('BattleScene', () => {
  it('stacks header, passage, monsters and action content in one scene', () => {
    const html = renderToStaticMarkup(
      <BattleScene
        state={createCombatState(5)}
        levelNumber={3}
        enemyKind="grunt"
        headerTitle="释义选择 · 建立识别"
        currentQuestion={2}
        totalQuestions={5}
        onExit={() => undefined}
        passage={<p>语境面板</p>}
      >
        <button type="button">作答面板</button>
      </BattleScene>,
    );

    expect(html).toContain('battle-scene is-grunt is-asking');
    expect(html).toContain('battle-passage-strip');
    expect(html).toContain('语境面板');
    expect(html).toContain('battle-action-panel');
    expect(html).toContain('释义选择 · 建立识别');
    expect(html).toContain('2 / 5');
    expect(html).toContain('作答面板');
  });

  it('hides the reading passage when none is provided', () => {
    const html = renderToStaticMarkup(
      <BattleScene
        state={createCombatState(5)}
        levelNumber={3}
        enemyKind="grunt"
        headerTitle="记忆串联"
        currentQuestion={1}
        totalQuestions={5}
        onExit={() => undefined}
        preview
      >
        <div>开始区</div>
      </BattleScene>,
    );

    expect(html).toContain('battle-scene is-grunt is-preview');
    expect(html).not.toContain('battle-passage-strip');
    expect(html).toContain('开始区');
  });

  it('shows the reading passage directly above the monsters', () => {
    const html = renderToStaticMarkup(
      <BattleScene
        state={createCombatState(5)}
        levelNumber={3}
        enemyKind="grunt"
        headerTitle="释义选择"
        currentQuestion={1}
        totalQuestions={5}
        onExit={() => undefined}
        passage={<p>阅读正文</p>}
      >
        <div>考核区</div>
      </BattleScene>,
    );

    expect(html).toContain('battle-passage-strip');
    expect(html).toContain('阅读正文');
    expect(html).not.toContain('battle-context-toggle');
    expect(html).toContain('考核区');
  });
});
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../domain/combat';
import type { WaveMonster } from '../domain/monsterRoster';
import { MonsterRoster } from './MonsterRoster';

const monsters: WaveMonster[] = [
  {
    wordId: 'achieve',
    word: 'achieve',
    phonetic: '/əˈtʃiːv/',
    definitionZh: '实现；达成',
    tier: 'rare',
    difficultyScore: 0.68,
    rarity: 0.72,
    lengthScore: 0.38,
    learningStage: 'context',
    attempts: 2,
    mistakes: 1,
    mastery: 50,
    status: 'active',
  },
  {
    wordId: 'credit',
    word: 'credit',
    phonetic: '/ˈkredɪt/',
    definitionZh: '信用；学分',
    tier: 'uncommon',
    difficultyScore: 0.42,
    rarity: 0.45,
    lengthScore: 0.25,
    learningStage: 'sound',
    attempts: 0,
    mistakes: 0,
    mastery: 0,
    status: 'pending',
  },
];

const hitEvent: CombatEvent = {
  id: 1,
  kind: 'hit',
  damage: 10,
  critical: false,
  combo: 1,
  enemyDefeated: false,
};

describe('MonsterRoster', () => {
  it('replaces head-word labels with one focused comic dialogue', () => {
    const html = renderToStaticMarkup(
      <MonsterRoster
        monsters={monsters}
        activePose="idle"
        event={null}
        onSpeak={() => undefined}
        focusWordId="achieve"
      />,
    );

    expect(html.match(/class="monster-dialogue/g)).toHaveLength(1);
    expect(html).toContain('monster-dialogue is-taunt');
    expect(html).toContain('level-assertive');
    expect(html).toContain('class="monster-orbit-track"');
    expect(html).toContain('rotateY(0deg)');
    expect(html).toContain('translateZ(var(--orbit-radius))');
    expect(html).not.toContain('roster-word');
    expect(html).not.toContain('role="tooltip"');
    expect(html).toContain('aria-label="播放 achieve 的发音"');
  });

  it('shows a staggered reaction after the focused monster is answered correctly', () => {
    const html = renderToStaticMarkup(
      <MonsterRoster
        monsters={[{ ...monsters[0], status: 'defeated' }]}
        activePose="hit"
        event={hitEvent}
        focusWordId="achieve"
      />,
    );

    expect(html).toContain('monster-dialogue is-staggered');
    expect(html).toContain('roster-feedback is-hit');
  });

  it('writes a real track transform when the focus advances around the ring', () => {
    const html = renderToStaticMarkup(
      <MonsterRoster
        monsters={[
          { ...monsters[0], status: 'defeated' },
          { ...monsters[1], status: 'active' },
        ]}
        activePose="idle"
        event={null}
        focusWordId="credit"
      />,
    );

    expect(html).toContain('rotateY(-82deg)');
    expect(html).not.toContain('--orbit-rotation');
  });

  it('disables optional pronunciation while the persisted silent-word boost is active', () => {
    const html = renderToStaticMarkup(
      <MonsterRoster
        monsters={monsters}
        activePose="idle"
        event={null}
        onSpeak={() => undefined}
        disableMonsterSpeech
        focusWordId="achieve"
      />,
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="悍将不可点读"');
  });

  it('conceals answer metadata and disables waiting monsters during audio questions', () => {
    const html = renderToStaticMarkup(
      <MonsterRoster
        monsters={monsters}
        activePose="idle"
        event={null}
        onSpeak={() => undefined}
        concealWords
        focusWordId="achieve"
      />,
    );

    expect(html).not.toContain('title="achieve');
    expect(html).not.toContain('aria-label="播放 achieve');
    expect(html).not.toContain('title="credit');
    expect(html).toContain('aria-label="播放当前词怪发音"');
    expect(html).toContain('aria-label="游兵等待上场"');
  });
});
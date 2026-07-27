import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BOOST_DEFS, type ActiveBoosts } from '../domain/challengeBoosts';
import { ChallengePrep } from './ChallengePrep';

const maxedBoosts: ActiveBoosts = {
  haste: 5,
  silentWord: 1,
  hiddenCount: 1,
  hiddenPassage: 1,
  similarDistractors: 1,
  extraOptions: 2,
};

function renderPrep(activeBoosts: ActiveBoosts, offers = BOOST_DEFS.slice(0, 3)): string {
  return renderToStaticMarkup(
    <ChallengePrep
      levelNumber={8}
      levelKind="normal"
      activeBoosts={activeBoosts}
      offers={[...offers]}
      droppedBoostName={null}
      onChoose={() => undefined}
      onContinue={() => undefined}
      onExit={() => undefined}
      onOpenHelp={() => undefined}
    />,
  );
}

describe('ChallengePrep', () => {
  it('offers a continue action when every boost is maxed', () => {
    const html = renderPrep(maxedBoosts, []);

    expect(html).toContain('你是卷王');
    expect(html).toContain('保持当前强度开战');
    expect(html).toContain('疾风 ×5');
    expect(html).not.toContain('选择加成');
  });

  it('renders boost choices while upgrades remain', () => {
    const html = renderPrep({ haste: 1 }, [BOOST_DEFS[0]]);

    expect(html).toContain('选择加成');
    expect(html).toContain('当前 1/5');
    expect(html).not.toContain('你是卷王');
  });

  it('explains that Boss assessment is finite before battle', () => {
    const html = renderToStaticMarkup(
      <ChallengePrep
        levelNumber={5}
        levelKind="boss"
        activeBoosts={{}}
        offers={[BOOST_DEFS[0]]}
        droppedBoostName={null}
        onChoose={() => undefined}
        onContinue={() => undefined}
        onExit={() => undefined}
        onOpenHelp={() => undefined}
      />,
    );

    expect(html).toContain('固定 12 题 · 一场结束');
    expect(html).toContain('识破 4 题 · 破甲 4 题 · 终结 4 题');
    expect(html).toContain('不引入新词');
    expect(html).toContain('至少答对 10 题');
  });
});

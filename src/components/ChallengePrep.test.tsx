import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BOOST_DEFS, type ActiveBoosts } from '../domain/challengeBoosts';
import { ChallengePrep } from './ChallengePrep';

const maxedBoosts: ActiveBoosts = {
  haste: 5,
  silentWord: 1,
  hiddenCount: 1,
};

function renderPrep(activeBoosts: ActiveBoosts, offers = BOOST_DEFS.slice(0, 3)): string {
  return renderToStaticMarkup(
    <ChallengePrep
      levelNumber={8}
      activeBoosts={activeBoosts}
      offers={[...offers]}
      droppedBoostName={null}
      onChoose={() => undefined}
      onContinue={() => undefined}
      onExit={() => undefined}
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
});

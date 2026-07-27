import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WORD_BANKS } from '../data/bankRepository';
import { BattleRecord } from './BattleRecord';

function renderBattleRecord(lastChallengeAt: string | null): string {
  return renderToStaticMarkup(
    <BattleRecord
      banks={WORD_BANKS}
      selectedBank="gaokao"
      coverage={null}
      coverageLoading={false}
      coverageError={null}
      sessionPreparing={false}
      todayCompleted={12}
      lastChallengeAt={lastChallengeAt}
      onSelectBank={() => undefined}
      onRetryCoverage={() => undefined}
    />,
  );
}

describe('BattleRecord', () => {
  it('shows progress once alongside motivational activity stats', () => {
    const timestamp = '2026-07-27T12:30:00.000Z';
    const html = renderBattleRecord(timestamp);

    expect(html).toContain('今日完成');
    expect(html).toContain('12 题');
    expect(html).toContain('最近挑战');
    expect(html).toContain(`dateTime="${timestamp}"`);
    expect(html).not.toContain('coverage-rings');
  });

  it('uses the provenance description as the only source link', () => {
    const currentBank = WORD_BANKS[0];
    const html = renderBattleRecord(null);

    expect(html).toContain(currentBank.basis);
    expect(html).toContain(currentBank.sourceVersion);
    expect(html).toContain(`href="${currentBank.sourceUrl}"`);
    expect(html).not.toContain(currentBank.sourceName);
    expect(html).not.toContain('battle-record-source');
  });

  it('uses a clear empty state before the first challenge', () => {
    expect(renderBattleRecord(null)).toContain('尚未挑战');
  });
});
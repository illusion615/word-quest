import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WORD_BANKS } from '../data/bankRepository';
import { createEmptyGameProgress } from '../domain/gameProgress';
import { createEmptyLearningState } from '../domain/progress';
import type { BankJourney } from '../domain/journey';
import { Dashboard } from './Dashboard';

const emptyJourney: BankJourney = {
  chapters: [],
  totalLevels: 0,
  activeLevelIndex: null,
  activeChapterIndex: 0,
};

function renderDashboard(journeyLoading: boolean, bankError: string | null): string {
  return renderToStaticMarkup(
    <Dashboard
      currentBank={WORD_BANKS[0]}
      journey={emptyJourney}
      journeyLoading={journeyLoading}
      journeyLoadProgress={journeyLoading ? {
        phase: 'downloading',
        loadedBytes: 115_500,
        totalBytes: 231_000,
        percentage: 50,
      } : null}
      gameProgress={createEmptyGameProgress()}
      entries={[]}
      learningState={createEmptyLearningState()}
      coverage={null}
      bankLoading={journeyLoading}
      sessionPreparing={false}
      aiConfigured={false}
      bankError={bankError}
      onStartLevel={() => undefined}
      onRetryBank={() => undefined}
    />,
  );
}

describe('Dashboard startup states', () => {
  it('shows a clear loading state without empty chapter controls', () => {
    const html = renderDashboard(true, null);

    expect(html).toContain('卷王征途 · 关卡准备中');
    expect(html).toContain('词怪正在列队');
    expect(html).toContain('关卡地图加载中');
    expect(html).toContain('关卡地图加载进度');
    expect(html).toContain('50%');
    expect(html).toContain('112.8 KB / 225.6 KB');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).not.toContain('aria-label="章节导航"');
  });

  it('keeps retry available when both journey data sources fail', () => {
    const html = renderDashboard(false, '词库加载失败。');

    expect(html).toContain('词怪列队失败');
    expect(html).toContain('词库加载失败。');
    expect(html).toContain('重新加载');
  });
});

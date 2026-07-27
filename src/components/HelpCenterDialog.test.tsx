import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, CURRENT_RELEASE } from '../data/releaseNotes';
import { shouldShowOnboarding, shouldShowWhatsNew } from '../hooks/useHelpCenter';
import { HelpCenterDialog } from './HelpCenterDialog';

describe('HelpCenterDialog', () => {
  it('renders current user-facing updates', () => {
    const html = renderToStaticMarkup(
      <HelpCenterDialog
        open
        initialSection="updates"
        celebrate={false}
        onClose={() => undefined}
        onSectionChange={() => undefined}
      />,
    );
    expect(html).toContain('这次有什么新变化');
    expect(html).toContain(`v${APP_VERSION}`);
    expect(html).toContain(CURRENT_RELEASE?.title);
    expect(html).toContain('播放新手指引');
  });

  it('renders the replayable monster guide', () => {
    const html = renderToStaticMarkup(
      <HelpCenterDialog
        open
        initialSection="guide"
        celebrate={false}
        onClose={() => undefined}
        onSectionChange={() => undefined}
      />,
    );
    expect(html).toContain('认准正前方的词怪');
    expect(html).toContain('下一步');
    expect((html.match(/查看第 /g) ?? [])).toHaveLength(4);
  });

  it('only auto-opens for an unseen version', () => {
    expect(shouldShowWhatsNew(null)).toBe(true);
    expect(shouldShowWhatsNew('0.3.0')).toBe(true);
    expect(shouldShowWhatsNew(APP_VERSION)).toBe(false);
    expect(shouldShowOnboarding(true, null)).toBe(true);
    expect(shouldShowOnboarding(true, 'true')).toBe(false);
    expect(shouldShowOnboarding(false, null)).toBe(false);
  });

  it('renders nothing when closed', () => {
    expect(renderToStaticMarkup(
      <HelpCenterDialog
        open={false}
        initialSection="guide"
        celebrate={false}
        onClose={() => undefined}
        onSectionChange={() => undefined}
      />,
    )).toBe('');
  });
});
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('renders common Markdown and GFM structures', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent content={'## Memory cue\n\n- **Focus** on context\n- ~~Guess~~ verify'} />,
    );

    expect(html).toContain('<h2>Memory cue</h2>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<strong>Focus</strong>');
    expect(html).toContain('<del>Guess</del>');
  });

  it('drops raw HTML and unsafe link protocols', () => {
    const html = renderToStaticMarkup(
      <MarkdownContent content={'<script>alert(1)</script> [unsafe](javascript:alert(1))'} />,
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });
});
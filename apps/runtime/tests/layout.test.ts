import { describe, expect, it } from 'vitest';
import { appShell } from '../src/renderer/layout.js';

/**
 * The app-shell invariant: the PAGE never scrolls, the PANELS do.
 *
 * jsdom does no layout, so this pins the CSS contract that produces the behaviour rather
 * than the pixels. The two regressions it guards are the ones that actually shipped:
 *
 *  - `minHeight: 100vh` with no `overflow` anywhere — the shell grew past the viewport and
 *    the DOCUMENT scrolled, while the panels' own `overflowY: auto` sat inert because they
 *    were never bounded.
 *  - a fixed `gridTemplateRows: '1fr auto'` under a VARIABLE number of in-flow children —
 *    a rendered banner took the `1fr` track and stretched to half the viewport.
 */

describe('the app shell bounds the page', () => {
  it('is exactly one viewport tall and clips — the page itself cannot scroll', () => {
    expect(appShell.page.height).toBe('100vh');
    expect(appShell.page.overflow).toBe('hidden');
    // A floor is not a cap: `minHeight` was the original bug.
    expect(appShell.page).not.toHaveProperty('minHeight');
  });

  it('is a flex column, so a variable number of banners cannot steal the shell', () => {
    // The grid's fixed row template broke whenever the banner count changed. A column does
    // not care how many children there are.
    expect(appShell.page.display).toBe('flex');
    expect(appShell.page.flexDirection).toBe('column');
  });

  it('gives the three-panel shell the leftover height, and clips it', () => {
    expect(appShell.shell.flex).toBe(1);
    expect(appShell.shell.minHeight).toBe(0);
    expect(appShell.shell.overflow).toBe('hidden');
  });

  it('keeps banners and the status bar content-sized — never stretched', () => {
    expect(appShell.chrome.flexShrink).toBe(0);
    expect(appShell.monitor.flexShrink).toBe(0);
  });

  it('lets the centre column bound its stack', () => {
    expect(appShell.workspace.minHeight).toBe(0);
    expect(appShell.workspace.overflow).toBe('hidden');
  });
});

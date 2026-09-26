import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeStartingPage, splashMarkup, splashStyle } from '../src-tauri/starting/compose.mjs';

/**
 * 🔴 `FIELD-FIXES-01` J — **ONE SPLASH, NOT TWO.** A launch of CG Control showed the window's own
 * starting page (a name and a sliding bar, while the bridge started) and then the console's
 * splash: two designs, one after the other. The starting page is now COMPOSED, at staging, from
 * the console's own `index.html` — so the two share one design by construction, and this file
 * asserts it rather than eyeballing it: the splash's `<style>` block and its markup appear in the
 * starting page byte for byte, read out of `index.html` here INDEPENDENTLY of `compose.mjs`'s own
 * extraction (a composer that cut the splash short would otherwise agree with itself).
 */

const read = (rel: string): string => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const consoleHtml = read('../index.html');
const page = composeStartingPage(consoleHtml);

/** The console page's one `<style>` block, found without the composer. */
function consoleStyleBlock(): string {
  const blocks = [...consoleHtml.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]);
  expect(blocks, 'the console page has one style block').toHaveLength(1);
  return blocks[0] ?? '';
}

/** The splash element, found without the composer: from its `<div` to where `#root` begins. */
function consoleSplashMarkup(): string {
  const from = consoleHtml.indexOf('<div\n      class="cg-splash"');
  const to = consoleHtml.indexOf('<div id="root">');
  expect(from, 'the splash element opens').toBeGreaterThan(0);
  expect(to, 'and #root follows it').toBeGreaterThan(from);
  return consoleHtml.slice(from, to).trimEnd();
}

describe('FIELD-FIXES-01 J — CG Control’s starting page is the console’s own splash', () => {
  it('🔴 carries the console’s splash CSS and splash markup byte for byte, and its title', () => {
    const style = consoleStyleBlock();
    const markup = consoleSplashMarkup();
    expect(style.length).toBeGreaterThan(10_000);
    expect(markup.length).toBeGreaterThan(5_000);
    expect(page).toContain(style);
    expect(page).toContain(markup);
    // …and the composer's own extraction agrees with the independent reading.
    expect(splashStyle(consoleHtml)).toBe(style);
    expect(splashMarkup(consoleHtml)).toBe(markup);
    expect(/<title>([^<]*)<\/title>/.exec(page)?.[1]).toBe('APASAI CG CONTROL');
  });

  it('🔴 takes none of the console’s splash CLOCK — no inline script at all: it never dismisses itself', () => {
    expect(page).not.toContain('__CG_SPLASH__');
    expect(page).not.toMatch(/<script>/);
    expect(page).toContain('<script src="start.js" defer></script>');
    expect(page).toContain('<link rel="stylesheet" href="start.css" />');
  });

  it('carries the build stamp of the console it was composed from', () => {
    expect(consoleHtml).toContain('<!-- CG_BUILD_STAMP -->');
    const built = consoleHtml.replace('<!-- CG_BUILD_STAMP -->', '59a1ff4b · 2026-09-26');
    expect(composeStartingPage(built)).toContain(
      '<span id="cg-splash-version">59a1ff4b · 2026-09-26</span>',
    );
  });

  it('CONTROL — the console page keeps its own splash and its clock, so a browser still shows it', () => {
    expect(consoleHtml).toContain('id="cg-splash"');
    expect(consoleHtml).toContain('window.__CG_SPLASH__ = { phase: phase, done: done };');
  });

  it('the shell loads the composed page (staging writes it; the desktop job cannot build without it)', () => {
    const conf = JSON.parse(read('../src-tauri/tauri.conf.json')) as {
      build: { frontendDist: string };
    };
    expect(conf.build.frontendDist).toBe('./starting-dist');
  });
});

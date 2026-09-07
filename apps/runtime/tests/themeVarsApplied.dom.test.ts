// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyThemeVars, cssVars } from '../src/renderer/theme.js';

/**
 * STATION-CHROME-01 §1 — `controls.css` no longer declares the `--r-*` values, so
 * the ONE thing that puts them on the page is `applyThemeVars()`. That makes the
 * call itself load-bearing in a way a stylesheet import never was: drop it and every
 * rule in the app resolves `var(--r-…)` to nothing, silently, with no type error and
 * no failing unit test anywhere else.
 *
 * So it is pinned here, in both halves: the function writes what it claims to, and
 * `main.tsx` calls it BEFORE the first render.
 */
describe('§1 — the token home reaches the document', () => {
  it('writes every cssVars entry into a :root block', () => {
    applyThemeVars(document.documentElement);
    const style = document.getElementById('cg-theme-vars');
    expect(style, 'applyThemeVars did not install its <style>').not.toBeNull();
    const text = style?.textContent ?? '';
    expect(text.startsWith(':root {')).toBe(true);
    for (const [name, value] of Object.entries(cssVars)) {
      expect(text, `${name} missing from the applied block`).toContain(`${name}: ${value};`);
    }
  });

  it('is idempotent — a second call replaces the block rather than stacking one', () => {
    applyThemeVars(document.documentElement);
    applyThemeVars(document.documentElement);
    expect(document.querySelectorAll('#cg-theme-vars')).toHaveLength(1);
  });

  it('POSITIVE CONTROL: the block really does carry a value, not an empty shell', () => {
    // Without this the assertions above would pass against a `:root {}` if every
    // `cssVars` entry were somehow empty — the instrument has to be shown live.
    applyThemeVars(document.documentElement);
    const text = document.getElementById('cg-theme-vars')?.textContent ?? '';
    expect(text).toContain('--r-btn-add: #74cdf6;');
    expect(text).toContain('--r-row-marked-fill: rgb(145 93 5);');
    expect(text.split('\n').length).toBeGreaterThan(Object.keys(cssVars).length);
  });

  it('main.tsx applies them before the first render', () => {
    const main = readFileSync(join(process.cwd(), 'src', 'renderer', 'main.tsx'), 'utf8');
    expect(main).toContain('applyThemeVars(document.documentElement)');
    // BEFORE `createRoot(...).render(...)`: no app element may ever paint token-less.
    const applied = main.indexOf('applyThemeVars(document.documentElement)');
    const rendered = main.indexOf('createRoot(');
    expect(applied).toBeGreaterThan(-1);
    expect(applied, 'the tokens must be applied before the root is created').toBeLessThan(rendered);
  });

  it('controls.css no longer carries a :root block of its own', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'renderer', 'ui', 'controls.css'), 'utf8');
    expect(/:root\s*\{/.test(css), 'the duplicate token block is back').toBe(false);
  });
});

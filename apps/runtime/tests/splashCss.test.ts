import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cssVars } from '../src/renderer/theme.js';

/**
 * R-031 — THE SPLASH'S COLOURS, pinned twice over.
 *
 * The splash paints before `controls.css` exists, so it cannot write `var(--r-…)`; it
 * mirrors token VALUES as literals in `index.html`. Two things can go wrong with that
 * and both are checked here:
 *
 *  1. **DRIFT.** A literal that no longer matches its token is a colour nobody can find
 *     when the palette moves. So: EVERY colour literal in `index.html` must be the value
 *     of some `--r-*` token in `theme.ts`. Not "the ones we remembered to list" — every
 *     one, which means a new hand-picked colour fails this test until it is tokenised.
 *  2. **RED.** Red is the sacred air-state colour and decorative red is forbidden across
 *     this UI; a boot screen is the last place it may appear, because it would teach the
 *     operator's eye "red" before they have seen a single real state. Checked as
 *     `blue >= red` on every literal — the machine-checkable form of "nothing here leans
 *     warm" — plus the obvious textual escapes.
 *
 * Comments are stripped before scanning: this file's own subject matter means the word
 * "red" appears in the documentation all over that document, and a test that trips on
 * its own prose is a test people delete.
 */

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

/** `index.html` with HTML, CSS and JS comments removed. */
const code = html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

/** Every colour literal — hex or `rgb()`/`rgba()` — in the stripped document. */
const literals = [
  ...(code.match(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g) ?? []),
  ...(code.match(/rgba?\([^)]*\)/g) ?? []),
];

/** The declared palette, normalised for comparison. */
const tokenValues = new Map(
  Object.entries(cssVars).map(([name, value]) => [normalise(value), name] as const),
);

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

/** `#rgb` / `#rrggbb` / `#rrggbbaa` / `rgb()` / `rgba()` → channel triple. */
function channels(literal: string): { r: number; g: number; b: number } {
  if (literal.startsWith('#')) {
    const hex = literal.slice(1);
    const full =
      hex.length === 3
        ? [...hex].map((c) => c + c).join('')
        : // Drop an alpha pair if present; only the colour channels matter here.
          hex.slice(0, 6);
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  const parts = /rgba?\(([^)]*)\)/.exec(literal)?.[1].split(',') ?? [];
  return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]) };
}

describe('the splash mirrors the palette rather than inventing one', () => {
  it('finds colour literals to check at all', () => {
    // A guard on the guard: if the extraction silently stopped matching, every
    // assertion below would vacuously pass.
    expect(literals.length).toBeGreaterThan(10);
  });

  it('every colour literal in index.html is the value of a --r-* token', () => {
    const untokenised = literals.filter((literal) => !tokenValues.has(normalise(literal)));
    expect(
      untokenised,
      'hand-picked colours on the first frame — add them to `theme.ts` cssVars (and `controls.css`) first',
    ).toEqual([]);
  });

  it('declares a splash token family, and the rail borrows the app accent rather than forking it', () => {
    const splashTokens = Object.keys(cssVars).filter((name) => name.startsWith('--r-splash-'));
    expect(splashTokens.length).toBeGreaterThan(0);
    // The rail is `--r-accent` / `--r-accent-strong`: the first frame speaks the palette
    // the app already speaks rather than a parallel one beside it.
    expect(literals.map(normalise)).toContain(normalise(cssVars['--r-accent']));
    expect(literals.map(normalise)).toContain(normalise(cssVars['--r-accent-strong']));
  });
});

describe('NO RED on the first frame', () => {
  it('every colour literal has blue >= red', () => {
    const warm = literals.filter((literal) => {
      const { r, b } = channels(literal);
      return b < r;
    });
    expect(warm, 'a warm/red literal reached the boot screen').toEqual([]);
  });

  it('names no red keyword and no red token', () => {
    expect(code).not.toMatch(/\bred\b/i);
    // The air-state red and the destructive red, by name — neither belongs here even as
    // a `var()` reference, and this catches a future refactor that starts using them.
    expect(code).not.toContain('--r-onair');
    expect(code).not.toContain('--r-danger');
  });

  it('does not merely avoid the words — the air-state colour itself is absent', () => {
    expect(literals.map(normalise)).not.toContain(normalise(cssVars['--r-onair']));
    expect(literals.map(normalise)).not.toContain(normalise(cssVars['--r-danger']));
  });
});

describe('the phase label leaves rather than settling on a word', () => {
  it('fades the label on boot-done — opacity only, no colour change', () => {
    // Replaces an earlier "READY turns success-green" rule. A fast cold boot is done
    // about a second in while the hold keeps the door shut until 5 s, so a terminal
    // label would be on screen for most of the splash while the app is still unusable.
    expect(code).toMatch(/#cg-splash-phase\s*\{[^}]*transition:\s*opacity/);
    expect(code).toMatch(/\[data-done='true'\]\s*#cg-splash-phase\s*\{[^}]*opacity:\s*0/);
  });

  it('does not fade under reduced motion', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*<\/style>/.exec(
      code,
    );
    expect(reduced, 'no reduced-motion block in the splash CSS').not.toBeNull();
    expect(reduced?.[1]).toMatch(/#cg-splash-phase\s*\{\s*transition:\s*none/);
  });
});

describe('the build stamp', () => {
  it('leaves exactly one placeholder for the build-stamp transform to fill', () => {
    // A comment placeholder, not `%TOKEN%`: Vite runs its own `%ENV%` pass over
    // `index.html` and a `%…%` token can collide with it.
    const occurrences = html.match(/<!-- CG_BUILD_STAMP -->/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(html).toContain('id="cg-splash-version"');
  });
});

describe('the splash does not wait on a webfont', () => {
  it('sets its own system stack', () => {
    // It paints before any webfont can load; a font swap on the product's first frame
    // is exactly the wrong first impression.
    expect(code).toMatch(/font-family:\s*\n?\s*system-ui/);
    expect(code).toContain('ui-monospace');
  });

  it('loads the CDN face non-render-blocking, so the first frame never waits on a network', () => {
    // A plain `<link rel=stylesheet>` to a CDN blocks the first paint until it answers
    // or times out — and on a LAN-only broadcast machine it never answers.
    expect(code).toMatch(/media="print"/);
  });
});

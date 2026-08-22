import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cssVars } from '../src/renderer/theme.js';

/**
 * R-035 — THE SPLASH'S COLOURS, pinned twice over.
 *
 * The splash paints before `controls.css` exists, so it cannot write `var(--r-…)`; it
 * mirrors token VALUES as literals in `index.html`. Two things can go wrong with that
 * and both are checked here:
 *
 *  1. **DRIFT.** A literal that no longer matches its source is a colour nobody can find
 *     when the palette moves. So every colour literal in `index.html` must be EITHER the
 *     value of a `--r-*` token in `theme.ts` (the instrument: background, lines, inks,
 *     rail) OR one of the `--cg-*` constants the document itself declares on `.cg-splash`
 *     (the brand blue, and the colours of the graphics the scene shows on its monitor).
 *     Not "the ones we remembered to list" — every one, which means a hand-picked colour
 *     belonging to neither fails this test until it is put in one of them.
 *
 *     The `--cg-*` half is deliberately NOT a list kept in this file: it is parsed out of
 *     the document, so "declare it once, in the open, with a comment" is the mechanism
 *     rather than a convention. And they are NOT tokens on purpose — nothing in the
 *     console UI may wear the brand blue, the scene's violet or its amber.
 *  2. **RED, and everything next to it.** Red is the sacred air-state colour and
 *     decorative red is forbidden across this UI; a boot screen is the last place it may
 *     appear, because it would teach the operator's eye "red" before they have seen a
 *     single real state. Checked by HUE: no saturated literal may land in the red/coral
 *     band. That replaced a `blue >= red` channel test, which was a crude proxy for the
 *     same idea and could not tell coral from the amber corner bug the scene needs.
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

/**
 * The splash-local constants the document declares on `.cg-splash` — the brand blue and
 * the scene's content colours. Parsed OUT OF THE DOCUMENT rather than listed here, so the
 * rule enforced is "declared once, in the open" and not "matches a copy in the test".
 */
const localConstants = new Map(
  [...code.matchAll(/(--cg-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(
    (m) => [normalise(m[2] as string), m[1]] as const,
  ),
);

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

/**
 * Hue in degrees (0–360) and saturation (0–1). A grey has no meaningful hue, so the
 * red-band check skips anything this reports as unsaturated.
 */
function hsl(literal: string): { hue: number; saturation: number } {
  const { r, g, b } = channels(literal);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0 || max === 0) return { hue: 0, saturation: 0 };
  const sixth =
    max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { hue: sixth * 60, saturation: delta / max };
}

/**
 * THE EXCLUDED BAND. Red through coral through orange, and the magenta-reds on the other
 * side of 0°. Amber-400 (`#fbbf24`, hue ≈ 43°) is the nearest thing to it this screen is
 * allowed, and it is outside — while `--r-caution` (`#f59e0b`, hue ≈ 38°) is inside, which
 * is a fair statement of where the line sits: warm enough to rhyme with the on-air red
 * does not get on the boot screen.
 */
function isRedAdjacent(literal: string): boolean {
  const { hue, saturation } = hsl(literal);
  if (saturation < 0.15) return false;
  return hue < 40 || hue >= 320;
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
  const parts = /rgba?\(([^)]*)\)/.exec(literal)?.[1]?.split(',') ?? [];
  return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]) };
}

describe('the splash mirrors the palette rather than inventing one', () => {
  it('finds colour literals to check at all', () => {
    // A guard on the guard: if the extraction silently stopped matching, every
    // assertion below would vacuously pass.
    expect(literals.length).toBeGreaterThan(10);
  });

  it('every colour literal in index.html is a --r-* token OR a declared --cg-* constant', () => {
    const unaccounted = literals.filter(
      (literal) => !tokenValues.has(normalise(literal)) && !localConstants.has(normalise(literal)),
    );
    expect(
      unaccounted,
      'hand-picked colours on the first frame — put them in `theme.ts` cssVars (and `controls.css`), or declare them as a documented `--cg-*` constant on `.cg-splash`',
    ).toEqual([]);
  });

  it('declares a splash token family for the instrument', () => {
    const splashTokens = Object.keys(cssVars).filter((name) => name.startsWith('--r-splash-'));
    expect(splashTokens.length).toBeGreaterThan(0);
    // The background, the frame lines and the inks are the app's palette, not a parallel
    // one — the splash is a deeper console than the chrome but it is the same instrument.
    for (const token of ['--r-splash-bg', '--r-splash-line', '--r-splash-ink'] as const) {
      expect(literals.map(normalise)).toContain(normalise(cssVars[token]));
    }
  });

  it('THE CHROME ACCENT IS APASAI BLUE, and the app accent is left alone', () => {
    // The splash is the BRAND screen, so it wears `#00AEEF` rather than the console's sky.
    // That is a SPLASH-LOCAL decision: the app's `--r-accent` must not have moved with it.
    expect(localConstants.get('#00aeef')).toBe('--cg-brand');
    expect(localConstants.get('#0090c9')).toBe('--cg-brand-deep');
    expect(cssVars['--r-accent'], 'the app accent was dragged along with the splash').toBe(
      '#38BDF8',
    );
    // …and the sky no longer appears on the first frame at all.
    expect(literals.map(normalise)).not.toContain(normalise(cssVars['--r-accent']));
  });

  it('the brand blue is EXACT — the company value, not one adjusted to taste', () => {
    // Stated as its own assertion because it is the one colour on this screen that is not
    // a design decision at all. Not for contrast, not for consistency, not for a theme.
    const brand = [...localConstants.entries()].find(([, name]) => name === '--cg-brand')?.[0];
    expect(brand).toBe('#00aeef');
  });

  it('the scene content colours are SPLASH-LOCAL and never leak into the UI palette', () => {
    // Violet and amber depict broadcast graphics; nothing in the console may wear them.
    expect(localConstants.get('#a78bfa')).toBe('--cg-violet');
    expect(localConstants.get('#fbbf24')).toBe('--cg-amber');
    // The amber has no token at all. (The violet's value coincides with `--r-rehearsing`,
    // which is a coincidence and not a reference — the scene means "graphic on air", not
    // "rehearsing", and the two must be free to move apart.)
    expect(Object.values(cssVars)).not.toContain('#FBBF24');
    for (const name of Object.keys(cssVars)) {
      expect(name.startsWith('--r-splash-brand')).toBe(false);
    }
  });

  it('the PLAY triangles wear the console`s own success green, not a new one', () => {
    expect(localConstants.get(normalise(cssVars['--r-success']))).toBe('--cg-ok');
  });
});

describe('NO RED on the first frame', () => {
  it('the hue guard itself classifies correctly', () => {
    // A guard on the guard. Without this the band could quietly stop matching anything
    // and every assertion below would pass by not looking.
    expect(isRedAdjacent(cssVars['--r-danger']), 'the destructive red').toBe(true);
    expect(isRedAdjacent(cssVars['--r-verb-remove']), 'pure red').toBe(true);
    expect(isRedAdjacent(cssVars['--r-verb-clear']), 'the orange next to it').toBe(true);
    expect(isRedAdjacent('#ff7f50'), 'coral').toBe(true);
    // …and the things this screen is allowed to show.
    expect(isRedAdjacent('#fbbf24'), 'the amber corner bug').toBe(false);
    expect(isRedAdjacent('#00aeef'), 'the brand blue').toBe(false);
    expect(isRedAdjacent('#ffffff'), 'white is not a hue').toBe(false);
  });

  it('no colour literal lands in the red / coral band', () => {
    const warm = literals.filter((literal) => isRedAdjacent(literal));
    expect(warm, 'a red-adjacent literal reached the boot screen').toEqual([]);
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
    // Covered by the blanket rule rather than a per-element one: the scene added enough
    // animated hooks that naming each was how one would get missed.
    expect(reduced?.[1]).toMatch(/\.cg-splash \*[\s\S]{0,80}transition:\s*none\s*!important/);
  });
});

/** Every `@keyframes NAME { … }` in the document, brace-matched, name → its body. */
function keyframeBodies(css: string): Map<string, string> {
  const out = new Map<string, string>();
  const opener = /@keyframes\s+([\w-]+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(css)) !== null) {
    let depth = 1;
    let i = opener.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    out.set(match[1] as string, css.slice(opener.lastIndex, i - 1));
  }
  return out;
}

/** The CSS properties a keyframe body animates. */
function animatedProperties(body: string): string[] {
  return [...new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1] as string))].sort();
}

describe('THE KEYFRAME AUDIT — a loop may cost a compositor frame and nothing more', () => {
  const bodies = keyframeBodies(code);

  /** Keyframe names referenced by an `animation:` that repeats forever. */
  const looping = new Set(
    [...code.matchAll(/animation:\s*([^;]+);/g)]
      .filter((m) => (m[1] as string).includes('infinite'))
      .flatMap((m) => [...bodies.keys()].filter((name) => (m[1] as string).includes(name))),
  );

  it('finds the loops at all', () => {
    // Guard on the guard: if the extraction stopped matching, the audit below would pass
    // by inspecting nothing. The story loop is seven animations plus the raster sweep.
    expect(bodies.size).toBeGreaterThan(8);
    expect(looping.size).toBeGreaterThanOrEqual(8);
  });

  it('EVERY animation name resolves to a keyframe block that exists', () => {
    // An element that rests at `opacity: 0` and animates to 1 is INVISIBLE if its keyframe
    // is missing — no error, no warning, it simply never draws. That is how the four
    // corner brackets shipped blank for one build of this change.
    const referenced = [
      ...new Set(
        [...code.matchAll(/animation:\s*([^;]+);/g)].flatMap((m) =>
          (m[1] as string).split(/[\s,]+/).filter((token) => /^cg-[\w-]+$/.test(token)),
        ),
      ),
    ];
    expect(
      referenced.length,
      'no animations found — this audit is looking at nothing',
    ).toBeGreaterThan(8);
    const missing = referenced.filter((name) => !bodies.has(name));
    expect(missing, 'an animation names a keyframe block that does not exist').toEqual([]);
  });

  it('every LOOPING animation touches only transform and opacity', () => {
    // This splash runs WHILE the bundle parses and React makes its first commit. A
    // property that triggers layout per frame is main-thread time taken from the boot
    // this screen exists to cover — so the loops are compositor-only, without exception.
    const offenders = [...looping]
      .map((name) => ({ name, properties: animatedProperties(bodies.get(name) ?? '') }))
      .filter(({ properties }) => properties.some((p) => p !== 'transform' && p !== 'opacity'));
    expect(offenders, 'a looping keyframe animates something that costs layout').toEqual([]);
  });

  it('the ONE animated width is `cg-widen`, and it is one-shot', () => {
    // The documented exception: the rule's entrance sweep. It runs once and is finished by
    // ~1.6 s, so it cannot compete with the boot for more than that.
    expect(animatedProperties(bodies.get('cg-widen') ?? '')).toEqual(['width']);
    expect(looping.has('cg-widen'), '`cg-widen` was made to repeat — it animates width').toBe(
      false,
    );
    const widthAnimating = [...bodies.entries()].filter(([, body]) =>
      animatedProperties(body).some((p) => p !== 'transform' && p !== 'opacity'),
    );
    expect(widthAnimating.map(([name]) => name)).toEqual(['cg-widen']);
  });

  it('the rail is SCALED, never widened — it re-renders ten times a second', () => {
    expect(code).toMatch(/\.cg-splash__fill\s*\{[^}]*transform:\s*scaleX\(0\)/);
    expect(code).toMatch(/\.cg-splash__fill\s*\{[^}]*transition:\s*transform/);
    expect(code).toMatch(/fillEl\.style\.transform = 'scaleX\(/);
  });

  it('the SVG wipes declare a transform-box, or they would scale about the wrong origin', () => {
    // `transform-origin` on an SVG element resolves against the whole viewBox unless
    // `transform-box: fill-box` says otherwise — the wipe would start from the far side
    // of the scene rather than the graphic's own left edge.
    expect(code).toMatch(/\.cg-splash__scene \.lt,[\s\S]{0,80}transform-box:\s*fill-box/);
    expect(code).toMatch(/\.cg-splash__scene \.bug\s*\{[^}]*transform-box:\s*fill-box/);
  });
});

describe('the playout scene', () => {
  it('is one inline SVG whose choreography lives entirely in CSS', () => {
    expect(code).toContain('class="cg-splash__scene"');
    // No JS animation and no per-frame script work: the scene's markup carries class
    // hooks and geometry only.
    expect(code).not.toMatch(/requestAnimationFrame/);
    expect(code).not.toMatch(/<animate|animateTransform/);
  });

  it('carries no colour literal of its own — the palette is policed from one place', () => {
    const scene = /<svg class="cg-splash__scene"[\s\S]*?<\/svg>/.exec(code)?.[0] ?? '';
    expect(scene, 'the scene markup is gone').not.toBe('');
    expect(scene).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(scene).not.toMatch(/\bfill="(?!none)/);
  });

  it('tells the whole story: two takes, a lower third, a bug and a ticker', () => {
    for (const hook of ['hl1', 'tri1', 'dot1', 'lt', 'hl2', 'tri2', 'dot2', 'bug', 'tk', 'tkd']) {
      expect(code, `the scene lost its .${hook}`).toContain(`class="${hook}"`);
    }
  });

  it('the ticker crawls INSIDE its clip rather than carrying it along', () => {
    // The clip is on a wrapper and the transform on the group inside it. With both on one
    // element the clip travels with the content and clips nothing.
    expect(code).toMatch(/clip-path="url\(#cg-tkclip\)"\s*>\s*<g class="tkd"/);
  });
});

describe('reduced motion renders a freeze-frame that still tells the story', () => {
  const reduced =
    /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*<\/style>/.exec(code)?.[1] ?? '';

  it('stops every animation and the raster sweep', () => {
    expect(reduced, 'no reduced-motion block in the splash CSS').not.toBe('');
    expect(reduced).toMatch(/animation:\s*none\s*!important/);
    expect(reduced).toMatch(/\.cg-splash__scan\s*\{\s*display:\s*none/);
  });

  it('holds the FULL PACKAGE on air — NOT a blank scene and not a half-built one', () => {
    // The scene's resting state is both rows armed with the strap, bug and ticker all live
    // — the graphics stack rather than take turns — so that is the honest still of it.
    expect(reduced).toMatch(
      /\.cg-splash__scene \.hl1,[\s\S]{0,200}\.bug\s*\{[\s\S]{0,60}opacity:\s*1\s*!important/,
    );
    expect(reduced).toMatch(
      /\.cg-splash__scene \.lt,[\s\S]{0,80}transform:\s*scaleX\(1\)\s*!important/,
    );
  });

  it('hides ONLY the command dots — the one beat a still frame cannot mean', () => {
    // A dot frozen mid-wire depicts a message in flight. Everything else in this scene is a
    // state, and a state can be held; a message in transit cannot.
    const hidden = /\.cg-splash__scene \.dot1,([\s\S]*?)\}/.exec(reduced)?.[0] ?? '';
    expect(hidden).toContain('.dot2');
    expect(hidden).toMatch(/opacity:\s*0\s*!important/);
    for (const shown of ['hl2', 'tri2', 'bug', 'tk']) {
      expect(
        hidden,
        `.${shown} must not be hidden — it is part of the resting frame`,
      ).not.toContain(`.${shown}`);
    }
  });
});

describe('the APASAI mark', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../brand/apasai-logo.svg', import.meta.url)),
    'utf8',
  );

  /** Every `d="…"` in a document, whitespace-normalised. */
  function paths(svg: string): string[] {
    return [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) =>
      (m[1] as string).replace(/\s+/g, ' ').trim(),
    );
  }

  it('is inlined, not fetched — a mark that arrives late is one the first frame lacks', () => {
    expect(code).toContain('class="cg-splash__logo"');
    expect(code).not.toMatch(/<img[^>]*apasai/i);
  });

  it('IS THE SOURCE FILE — the path data is never edited, only recoloured', () => {
    const inlined = /<svg\s+class="cg-splash__logo"[\s\S]*?<\/svg>/.exec(code)?.[0] ?? '';
    expect(inlined, 'the inlined mark is gone').not.toBe('');
    expect(paths(inlined)).toEqual(paths(source));
  });

  it('recolours through the three class hooks and nothing else', () => {
    const inlined = /<svg\s+class="cg-splash__logo"[\s\S]*?<\/svg>/.exec(code)?.[0] ?? '';
    for (const hook of ['apasai-bars', 'apasai-swoosh', 'apasai-arc']) {
      expect(inlined).toContain(`class="${hook}"`);
    }
    // The source's own `fill` attributes are dropped in the inlined copy so all three
    // groups take their colour from the stylesheet — which is also what keeps the
    // palette test above able to see every colour on this screen.
    expect(inlined).not.toMatch(/\bfill="(?!none)/);
    expect(code).toMatch(/\.cg-splash__logo \.apasai-bars\s*\{\s*fill:/);
    expect(code).toMatch(/\.cg-splash__logo \.apasai-swoosh\s*\{\s*fill:/);
  });

  it('KEEPS THE BRAND ARC EXACTLY — relighting is for the bars and the swoosh only', () => {
    // `#00AEEF` is the company's value. The bars were near-black in the source artwork and
    // are relit for a dark ground at the owner's direction; the arc is not ours to touch.
    expect(code).toMatch(/\.cg-splash__logo \.apasai-arc\s*\{\s*fill:\s*var\(--cg-brand\)/);
    expect(source).toContain('#00AEEF');
  });

  it('the placeholder brand slot is gone, not merely hidden', () => {
    expect(html).not.toContain('BRAND SLOT');
    expect(code).not.toMatch(/cg-splash__mark(?!s)/);
  });
});

describe('the wordmark', () => {
  it('weights CG as the platform and the suffix as the role', () => {
    expect(code).toContain('<b>CG</b>&nbsp;CONTROL');
    expect(code).toMatch(/\.cg-splash__wordmark\s*\{[^}]*font-weight:\s*250/);
    expect(code).toMatch(/\.cg-splash__wordmark b\s*\{\s*font-weight:\s*650/);
  });

  it('the company lockup replaced the plain text line', () => {
    expect(code).toMatch(/\.cg-splash__company\s*\{[^}]*display:\s*flex/);
    expect(code).toMatch(/\.cg-splash__company\s*\{[^}]*gap:\s*15px/);
    expect(code).toMatch(/\.cg-splash__logo\s*\{[^}]*height:\s*48px/);
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

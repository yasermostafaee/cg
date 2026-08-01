import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * THE DESIGNER SPLASH'S CSS — the colours, the motion, and the mark.
 *
 * The splash paints before the bundle, so it cannot read a vanilla-extract stylesheet or any
 * app token; it declares its own `--cg-*` constants in an inline `<style>`. The risk that
 * creates is a hand-picked colour appearing on the product's first frame and belonging to
 * nothing, so the rule enforced here is: EVERY colour literal in this document is either the
 * declaration of a `--cg-*` constant or a documented exception. The constants themselves are
 * parsed OUT OF THE DOCUMENT rather than listed in this file, which makes "declared once, in
 * the open" the mechanism rather than a convention.
 *
 * Comments are stripped before scanning: the document explains its own colour decisions at
 * length, and a test that trips on its own rationale is a test people delete.
 */

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

const code = html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const literals = [
  ...(code.match(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g) ?? []),
  ...(code.match(/rgba?\([^)]*\)/g) ?? []),
];

/** `--cg-name: value;` → value → name. */
const constants = new Map(
  [...code.matchAll(/(--cg-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(
    (m) => [m[2].trim().toLowerCase(), m[1]] as const,
  ),
);

/**
 * The two colour literals allowed to appear OUTSIDE a `--cg-*` declaration, each because CSS
 * gives no other form:
 *   - the vignette's `rgba(0,0,0,…)` — a gradient stop needs an alpha colour, and a hex
 *     constant cannot carry one into `radial-gradient`;
 *   - the rail's glow — `box-shadow` needs an `rgba()` for the same reason.
 * Both are the ground and the brand blue respectively, written once each.
 */
const ALLOWED_INLINE = new Set(['rgba(0, 0, 0, 0.22)', 'rgba(0, 174, 239, 0.5)']);

describe('the splash declares its palette rather than scattering it', () => {
  it('finds colour literals to check at all', () => {
    // A guard on the guard: if the extraction silently stopped matching, every assertion
    // below would pass by inspecting nothing.
    expect(literals.length).toBeGreaterThan(10);
  });

  it('EVERY colour literal is a declared --cg-* constant or a documented exception', () => {
    const declaredValues = new Set(constants.keys());
    const loose = literals.filter(
      (literal) => !declaredValues.has(literal.toLowerCase()) && !ALLOWED_INLINE.has(literal),
    );
    expect(
      loose,
      'a hand-picked colour on the product`s first frame — declare it as a `--cg-*` constant on `.cg-splash`',
    ).toEqual([]);
  });

  it('declares the five scene hues, and the coral is a one-line swap', () => {
    // The five belong to the artboard's CONTENT — the graphic being designed, not the
    // instrument drawing it. The Designer is not an air surface, which is why it may carry a
    // coral at all where the Runtime splash may not.
    expect(constants.get('#00aeef')).toBe('--cg-brand');
    expect(constants.get('#a78bfa')).toBe('--cg-violet');
    expect(constants.get('#fbbf24')).toBe('--cg-amber');
    expect(constants.get('#34d399')).toBe('--cg-emerald');
    expect(constants.get('#fb7185')).toBe('--cg-coral');
    // Declared exactly once, so removing it really is one line.
    expect(code.match(/--cg-coral:/g) ?? []).toHaveLength(1);
  });

  it('the brand blue is EXACT — the company value, not one adjusted to taste', () => {
    // The one colour on this screen that is not a design decision at all. Not for contrast,
    // not for consistency, not for a theme.
    expect(constants.get('#00aeef')).toBe('--cg-brand');
  });

  it('THE CHROME IS ONE ACCENT — the rail is brand blue, not a five-hue rainbow', () => {
    // What makes the two products read as one family: the palette lives in the content, and
    // the chrome around it is the same single accent in both.
    expect(code).toMatch(
      /\.cg-splash__fill\s*\{[\s\S]*?linear-gradient\(\s*to right,\s*var\(--cg-brand-deep\),\s*var\(--cg-brand\)\s*\)/,
    );
    for (const hue of ['--cg-violet', '--cg-coral', '--cg-emerald']) {
      const fill = /\.cg-splash__fill\s*\{[^}]*\}/.exec(code)?.[0] ?? '';
      expect(fill, `the rail wears ${hue}`).not.toContain(hue);
    }
  });

  it('the surface constants are splash-local and named, not borrowed from the app', () => {
    // The ground is deliberately LIGHTER than the app's, so the dismissal reads as a curtain
    // rising. The whole family had to move with it: the subtle border is within a few points
    // of the ground, so a rail track left at the old value would have been invisible.
    expect(constants.get('#1a212d')).toBe('--cg-ground');
    expect(constants.get('#2c3644')).toBe('--cg-line-subtle');
    expect(constants.get('#3d4959')).toBe('--cg-line-strong');
    expect(constants.get('#252f3e')).toBe('--cg-grid');
    expect(constants.get('#55637a')).toBe('--cg-ink-faint');
  });
});

/** Every `@keyframes NAME { … }` in the document, brace-matched, name → body. */
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
    out.set(match[1], css.slice(opener.lastIndex, i - 1));
  }
  return out;
}

function animatedProperties(body: string): string[] {
  return [...new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]))].sort();
}

describe('THE KEYFRAME AUDIT — a loop may cost a compositor frame and nothing more', () => {
  const bodies = keyframeBodies(code);

  /** Keyframe names referenced by an `animation:` that repeats forever. */
  const looping = new Set(
    [...code.matchAll(/animation:\s*([^;]+);/g)]
      .filter((m) => m[1].includes('infinite'))
      .flatMap((m) =>
        [...bodies.keys()].filter((name) =>
          new RegExp(`\\b${name}\\b[^,]*infinite`).test(m[1].replace(/\s+/g, ' ')),
        ),
      ),
  );

  it('finds the animations and the loops at all', () => {
    expect(bodies.size).toBeGreaterThan(10);
    expect(looping.size).toBeGreaterThanOrEqual(6);
  });

  it('EVERY animation name resolves to a keyframe block that exists', () => {
    // An element that rests at `opacity: 0` and animates to 1 is INVISIBLE if its keyframe is
    // missing — no error, no warning, it simply never draws.
    const referenced = [
      ...new Set(
        [...code.matchAll(/animation:\s*([^;]+);/g)].flatMap((m) =>
          m[1].split(/[\s,]+/).filter((token) => /^cg-[\w-]+$/.test(token)),
        ),
      ),
    ];
    expect(
      referenced.length,
      'no animations found — this audit is looking at nothing',
    ).toBeGreaterThan(8);
    expect(referenced.filter((name) => !bodies.has(name))).toEqual([]);
  });

  it('every LOOPING animation touches only transform and opacity', () => {
    // This splash runs WHILE the app is booting. A property that triggers layout per frame is
    // main-thread time taken from the very boot it covers.
    const offenders = [...looping]
      .map((name) => ({ name, properties: animatedProperties(bodies.get(name) ?? '') }))
      .filter(({ properties }) => properties.some((p) => p !== 'transform' && p !== 'opacity'));
    expect(offenders, 'a looping keyframe animates something that costs layout').toEqual([]);
  });

  it('the two entrance-only exceptions are exactly `cg-draw` and `cg-widen`', () => {
    // `stroke-dashoffset` is PAINT-only (no layout) and draws the motion path once; `width`
    // is the rule's sweep and is one-shot. Neither may ever repeat.
    const exceptions = [...bodies.entries()]
      .filter(([, body]) =>
        animatedProperties(body).some((p) => p !== 'transform' && p !== 'opacity'),
      )
      .map(([name]) => name)
      .sort();
    expect(exceptions).toEqual(['cg-draw', 'cg-widen']);
    expect(animatedProperties(bodies.get('cg-draw') ?? '')).toEqual(['stroke-dashoffset']);
    expect(animatedProperties(bodies.get('cg-widen') ?? '')).toEqual(['width']);
    for (const name of exceptions) {
      expect(looping.has(name), `${name} was made to repeat`).toBe(false);
    }
  });

  it('the rail is SCALED, never widened — it re-renders ten times a second', () => {
    expect(code).toMatch(/\.cg-splash__fill\s*\{[^}]*transform:\s*scaleX\(0\)/);
    expect(code).toMatch(/\.cg-splash__fill\s*\{[^}]*transition:\s*transform/);
    expect(code).toMatch(/fillEl\.style\.transform = 'scaleX\(/);
  });

  it('the SVG transforms declare a transform-box, or they scale about the wrong origin', () => {
    // `transform-origin` on an SVG element resolves against the whole viewBox unless
    // `transform-box: fill-box` says otherwise — a wipe would start from the far side of the
    // scene rather than the graphic's own left edge.
    for (const hook of ['kf', 'strap', 'bug', 'tick', 'dot']) {
      expect(
        new RegExp(`\\.cg-splash__scene \\.${hook}[\\s\\S]{0,220}transform-box:\\s*fill-box`).test(
          code,
        ),
        `.${hook} has no transform-box`,
      ).toBe(true);
    }
  });

  it('THE COMPOSITION RESTS BY ~1.6s, and every ambient loop starts after it', () => {
    // The entrance is what the operator reads first; the loops are what fill the rest of a
    // cold start. If a loop began during the entrance the two would compete.
    const entranceEnds: number[] = [];
    const loopStarts: number[] = [];
    for (const [, value] of [...code.matchAll(/animation:\s*([^;]+);/g)]) {
      for (const part of value.split(',')) {
        const times = [...part.matchAll(/(\d*\.?\d+)s/g)].map((m) => Number(m[1]));
        if (times.length === 0) continue;
        const [duration, delay = 0] = times;
        if (/infinite/.test(part)) loopStarts.push(delay);
        else entranceEnds.push(duration + delay);
      }
    }
    expect(entranceEnds.length).toBeGreaterThan(5);
    expect(loopStarts.length).toBeGreaterThan(4);
    expect(Math.max(...entranceEnds), 'an entrance runs past ~1.6s').toBeLessThanOrEqual(2.1);
    // The scan is ambient background and starts at 1.1s by design; every SCENE loop waits.
    const sceneLoops = loopStarts.filter((start) => start > 1.2);
    expect(
      Math.min(...sceneLoops),
      'an ambient loop starts before the entrance rests',
    ).toBeGreaterThanOrEqual(1.6);
  });
});

describe('reduced motion renders the COMPLETE composition, not a half-built frame', () => {
  const reduced =
    /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*<\/style>/.exec(code)?.[1] ?? '';

  it('stops every animation and the raster sweep', () => {
    expect(reduced, 'no reduced-motion block in the splash CSS').not.toBe('');
    expect(reduced).toMatch(/\.cg-splash \*[\s\S]{0,80}animation:\s*none\s*!important/);
    expect(reduced).toMatch(/\.cg-splash__scan\s*\{\s*display:\s*none/);
  });

  it('draws the path fully, places all four keyframes, and assembles the lower third', () => {
    // The deliberate static composition — a blank band or a half-built frame would be a
    // worse answer to "no motion" than the motion was.
    expect(reduced).toMatch(/\.path\s*\{\s*stroke-dashoffset:\s*0\s*!important/);
    expect(reduced).toMatch(/\.kf\s*\{[\s\S]{0,80}transform:\s*rotate\(45deg\)\s*!important/);
    expect(reduced).toMatch(/\.strap,[\s\S]{0,140}transform:\s*scaleX\(1\)\s*!important/);
    expect(reduced).toMatch(/\.bug,[\s\S]{0,80}opacity:\s*1\s*!important/);
    expect(reduced).toMatch(/\.head\s*\{[\s\S]{0,60}opacity:\s*0\.55\s*!important/);
  });

  it('keeps the diamonds ROTATED — a keyframe that snaps square is a different mark', () => {
    // The 45° turn is part of the resting state, not part of the animation, so the
    // reduced-motion rule has to restate it rather than reset transforms wholesale.
    expect(reduced).not.toMatch(/\.cg-splash__scene \.kf\s*\{[^}]*transform:\s*none/);
  });
});

describe('the APASAI mark', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../brand/apasai-logo.svg', import.meta.url)),
    'utf8',
  );
  const runtimeInlined = readFileSync(
    fileURLToPath(new URL('../../runtime/index.html', import.meta.url)),
    'utf8',
  );

  function paths(svg: string): string[] {
    return [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
  }

  function inlinedMark(document: string): string {
    return /<svg\s+class="cg-splash__logo"[\s\S]*?<\/svg>/.exec(document)?.[0] ?? '';
  }

  it('is inlined, not fetched — a mark that arrives late is one the first frame lacks', () => {
    expect(code).toContain('class="cg-splash__logo"');
    expect(code).not.toMatch(/<img[^>]*apasai/i);
  });

  it('IS THE SOURCE FILE — the path data is never edited, only recoloured', () => {
    const inlined = inlinedMark(code);
    expect(inlined, 'the inlined mark is gone').not.toBe('');
    expect(paths(inlined)).toEqual(paths(source));
  });

  it('IS PIXEL-IDENTICAL TO THE RUNTIME`S — one company, one mark, both products', () => {
    expect(paths(inlinedMark(code))).toEqual(paths(inlinedMark(runtimeInlined)));
  });

  it('recolours through the three class hooks, and KEEPS THE BRAND ARC EXACTLY', () => {
    const inlined = inlinedMark(code);
    for (const hook of ['apasai-bars', 'apasai-swoosh', 'apasai-arc']) {
      expect(inlined).toContain(`class="${hook}"`);
    }
    // The source's own `fill` attributes are dropped so all three groups take their colour
    // from the stylesheet — which is also what keeps the palette test above able to see
    // every colour on this screen.
    expect(inlined).not.toMatch(/\bfill="(?!none)/);
    expect(code).toMatch(/\.cg-splash__logo \.apasai-arc\s*\{\s*fill:\s*var\(--cg-brand\)/);
    // The bars were near-black in the source artwork and are relit for a dark ground; the
    // arc is not ours to touch.
    expect(source).toContain('#00AEEF');
  });
});

describe('the wordmark and the foot', () => {
  it('weights CG as the platform and the suffix as the role', () => {
    expect(code).toContain('<b>CG</b>&nbsp;DESIGNER');
    expect(code).toMatch(/\.cg-splash__wordmark\s*\{[^}]*font-weight:\s*250/);
    expect(code).toMatch(/\.cg-splash__wordmark b\s*\{\s*font-weight:\s*650/);
  });

  it('carries the company lockup rather than a plain text line', () => {
    expect(code).toMatch(/\.cg-splash__company\s*\{[^}]*display:\s*flex/);
    expect(code).toMatch(/\.cg-splash__company\s*\{[^}]*gap:\s*15px/);
    expect(code).toMatch(/\.cg-splash__logo\s*\{[^}]*height:\s*48px/);
  });

  it('leaves exactly one placeholder for the build-stamp transform to fill', () => {
    // A comment placeholder, not `%TOKEN%`: Vite runs its own `%ENV%` pass over `index.html`
    // and a `%…%` token can collide with it.
    expect(html.match(/<!-- CG_BUILD_STAMP -->/g) ?? []).toHaveLength(1);
    expect(html).toContain('id="cg-splash-version"');
    // No `v0.0.0`: printing a semver the project does not maintain is a false claim of a
    // release identity.
    expect(code).not.toMatch(/v0\.0\.0/);
  });
});

describe('the splash does not wait on a webfont', () => {
  it('sets its own system stack', () => {
    // It paints before any webfont can load; a font swap on the product's first frame is
    // exactly the wrong first impression.
    expect(code).toMatch(/font-family:\s*\n?\s*system-ui/);
    expect(code).toContain('ui-monospace');
  });
});

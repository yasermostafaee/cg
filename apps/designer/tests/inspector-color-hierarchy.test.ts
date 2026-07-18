import { describe, expect, it } from 'vitest';
import { colors, hoverWash, pressWash, wash } from '../src/renderer/theme.js';

/**
 * Inspector colour hierarchy — the RULES, pinned.
 *
 * The Inspector's Playout + Lottie panels encode a deliberate colour system:
 *
 *   strong red   → real ERRORS only (the Lottie intro overrunning the out-point)
 *   pale yellow  → CAUTION: legitimate states worth noticing (an infinite hold driver,
 *                  a content-driven graphic that won't auto-close)
 *   pale red     → DESTRUCTIVE actions (clear out point, reset content start)
 *   marker hues  → actions that CREATE/CONTROL a timeline marker, in that marker's colour
 *   muted        → instructional captions and the advanced disclosure
 *
 * The load-bearing invariant is the marker one: an Inspector button that drops a marker
 * must wear the SAME colour as the marker it drops, from ONE source, so the two can never
 * drift. These assert the token wiring; the visual result is the owner's eye.
 */

describe('marker-tied actions share ONE colour source with the timeline markers', () => {
  it('the marker colours are theme TOKENS, not per-file literals', () => {
    // Before this change both lived as hardcoded hex in TimelineDock.css.ts, so an
    // Inspector button could only match them by copying the literal.
    expect(colors.markerOut).toBe('#ffae57');
    expect(colors.markerIn).toBe('#57b6ff');
  });

  it('the timeline marker styles resolve their colour from those tokens', async () => {
    // Read the SOURCE rather than the compiled class: vanilla-extract compiles to hashed
    // class names, so the token reference is what we can meaningfully pin here.
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/renderer/features/timeline/TimelineDock.css.ts', import.meta.url),
      'utf8',
    );
    expect(src).toContain('background: colors.markerOut');
    expect(src).toContain('background: colors.markerIn');
    // …and no stray copy of the literals is left behind to drift.
    expect(src).not.toContain('#ffae57');
    expect(src).not.toContain('#57b6ff');
  });

  it('the Button markerOut / markerIn variants resolve from the SAME tokens', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/renderer/ui/Button.css.ts', import.meta.url),
      'utf8',
    );
    // The label colour is the marker colour itself — one source, no drift.
    expect(src).toMatch(/markerOut:\s*\{[\s\S]*?color:\s*colors\.markerOut/);
    expect(src).toMatch(/markerIn:\s*\{[\s\S]*?color:\s*colors\.markerIn/);
    expect(src).toMatch(/markerOut:\s*\{[\s\S]*?background:\s*colors\.markerOutSurface/);
    expect(src).toMatch(/markerIn:\s*\{[\s\S]*?background:\s*colors\.markerInSurface/);
  });

  it('the marker surfaces are tints OF their marker colour (same rgb triplet)', () => {
    // #ffae57 → rgb(255, 174, 87); #57b6ff → rgb(87, 182, 255).
    expect(colors.markerOutSurface).toContain('255, 174, 87');
    expect(colors.markerInSurface).toContain('87, 182, 255');
  });
});

describe('caution is its own token, distinct from danger', () => {
  it('exposes a caution colour + surface so cautions never borrow the error red', () => {
    expect(colors.caution).toBe('#FBBF24');
    expect(colors.cautionSurface).toContain('251, 191, 36');
    expect(colors.caution).not.toBe(colors.danger);
  });

  it('the infinite-driver chip and the won’t-auto-close banner use CAUTION, not danger', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/renderer/features/inspector/PlayoutSection.tsx', import.meta.url),
      'utf8',
    );
    // The "loops forever" chip.
    expect(src).toMatch(/infiniteWarnStyle[\s\S]*?color:\s*colors\.caution/);
    expect(src).toMatch(/infiniteWarnStyle[\s\S]*?background:\s*colors\.cautionSurface/);
    // The "won't auto-close" banner.
    expect(src).toContain('<Callout variant="caution">');
    expect(src).not.toContain('<Callout variant="danger">');
    // The chip must NOT have kept the old danger colour.
    expect(src).not.toMatch(/infiniteWarnStyle[\s\S]*?color:\s*colors\.danger/);
  });

  it('STRONG RED stays reserved for the real error — the Lottie out-point overrun', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/renderer/features/inspector/LottieTiming.css.ts', import.meta.url),
      'utf8',
    );
    // The #345 warning keeps the danger treatment; nothing else in the panel does.
    expect(src).toMatch(/export const warn = style\(\{[\s\S]*?colors\.danger/);
  });
});

describe('destructive Inspector actions reuse the existing pale-red treatment', () => {
  it('clear-out-point and reset-to-auto use the danger Button variant (not a new red)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/renderer/features/inspector/PlayoutSection.tsx', import.meta.url),
      'utf8',
    );
    expect(src).toMatch(/variant="danger"[\s\S]{0,200}Clear out point/);
    // A wide window: this button carries an explanatory comment between the variant and
    // the label (why `title` and not `aria-label`).
    expect(src).toMatch(/variant="danger"[\s\S]{0,700}Reset to auto/);
  });

  it('marker-creating actions wear their marker variant', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/renderer/features/inspector/PlayoutSection.tsx', import.meta.url),
      'utf8',
    );
    expect(src).toMatch(/variant="markerOut"[\s\S]{0,200}Add out point/);
    expect(src).toMatch(/variant="markerIn"[\s\S]{0,200}Pin content start/);
  });
});

describe('the Button recipe resets user-agent chrome for every variant', () => {
  it('base clears the UA border/background/font so `bare` is not a boxed control', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/renderer/ui/Button.css.ts', import.meta.url),
      'utf8',
    );
    // `bare` is applied WITHOUT the `box` skeleton, so the reset has to live on `base`
    // or every bare consumer inherits the UA button look.
    const base = src.slice(src.indexOf('export const base'), src.indexOf('export const box'));
    expect(base).toContain("border: 'none'");
    expect(base).toContain("background: 'none'");
    expect(base).toContain("font: 'inherit'");
  });
});

describe('interactive states derive from each variant’s own colour', () => {
  const recipe = async (): Promise<string> => {
    const fs = await import('node:fs/promises');
    return fs.readFile(new URL('../src/renderer/ui/Button.css.ts', import.meta.url), 'utf8');
  };
  /** The `variant` styleVariants block — where a hardcoded hover would reappear. */
  const variantBlock = (src: string): string =>
    src.slice(src.indexOf('export const variant'), src.indexOf('export const size'));

  it('NO variant sets a REPLACEMENT hover colour — only the shared wash helpers', () => {
    // The bug: `bare` hard-set `background: colors.menuHover` on hover, so the accent
    // "+ New project" button (a bare button with its own accent class) went grey. A
    // variant may re-declare its TONE (see `primary`), but only through the helpers —
    // never a `background:` colour of its own, which replaces the surface and can drift.
    return recipe().then((src) => {
      const block = variantBlock(src);
      const stateRules = block.match(/'&:(hover|active)[^']*':\s*\{[^}]*\}/g) ?? [];
      for (const rule of stateRules) {
        if (!/background/.test(rule)) continue;
        expect(rule, `a variant state sets a raw background: ${rule}`).toMatch(
          /backgroundImage:\s*(hover|press)Wash\(/,
        );
        expect(rule, `a variant state uses the background shorthand: ${rule}`).not.toMatch(
          /[^A-Za-z]background:/,
        );
      }
      // The neutral that caused the bug must be gone from the variants entirely.
      expect(block).not.toContain('colors.menuHover');
    });
  });

  it('PRIMARY takes the onLight tone so its hover is as felt as the modal Cancel', () =>
    recipe().then((src) => {
      const block = variantBlock(src);
      const primary = block.slice(block.indexOf('primary: {'), block.indexOf('ghost: {'));
      // The accent is light + saturated: it must DARKEN, not take base's white wash.
      expect(primary).toContain("hoverWash('onLight')");
      expect(primary).toContain("pressWash('onLight')");
    }));

  it('the default (onDark) states are applied in base, once', () =>
    recipe().then((src) => {
      const base = src.slice(src.indexOf('export const base'), src.indexOf('export const box'));
      expect(base).toContain("hoverWash('onDark')");
      expect(base).toContain("pressWash('onDark')");
      // Layered as background-IMAGE so it composes with, rather than replaces, the
      // variant's background-color.
      expect(base).toMatch(/backgroundImage:\s*hoverWash\('onDark'\)/);
    }));

  it('the wash is a layer over the control’s own colour, not a flat colour', () => {
    // `wash()` must produce a gradient LAYER; returning a bare colour would replace the
    // background and reintroduce the clobbering.
    expect(wash('rgba(1, 2, 3, 0.5)')).toBe(
      'linear-gradient(rgba(1, 2, 3, 0.5), rgba(1, 2, 3, 0.5))',
    );
    for (const layer of [hoverWash('onDark'), hoverWash('onLight')]) {
      expect(layer).toMatch(/^linear-gradient\(/);
    }
  });

  it('the two tones move in OPPOSITE directions — a consistent PERCEIVED step', () => {
    // A fixed overlay cannot read the same on both: +white is a big relative jump on the
    // near-black chrome and nearly invisible on the light, saturated accent (which it
    // also washes toward pastel). Dark surfaces lighten; light surfaces darken.
    expect(hoverWash('onDark')).toContain('rgba(255, 255, 255');
    expect(hoverWash('onLight')).toContain('rgba(0, 0, 0');
    // Press always darkens, on both tones…
    expect(pressWash('onDark')).toContain('rgba(0, 0, 0');
    expect(pressWash('onLight')).toContain('rgba(0, 0, 0');
    // …and is a bigger step than hover within each tone.
    const alpha = (s: string): number => Number(/([\d.]+)\)/.exec(s)?.[1] ?? 0);
    expect(alpha(pressWash('onDark'))).toBeGreaterThan(alpha(hoverWash('onDark')));
    expect(alpha(pressWash('onLight'))).toBeGreaterThan(alpha(hoverWash('onLight')));
  });

  it('the step sizes live ONLY in the theme tone table, never inline in the recipe', () =>
    recipe().then((src) => {
      const upToSize = src.slice(0, src.indexOf('export const size'));
      expect(upToSize).not.toMatch(/backgroundImage:\s*'linear-gradient/);
      expect(upToSize).not.toMatch(/backgroundImage:\s*`linear-gradient/);
    }));

  it('the focus ring stays visible on an ACCENT-filled button', () =>
    recipe().then((src) => {
      const base = src.slice(src.indexOf('export const base'), src.indexOf('export const box'));
      // A bare accent ring on an accent fill is invisible; the gap ring fixes that.
      expect(base).toMatch(/boxShadow:.*colors\.background.*colors\.accent/s);
    }));

  it('every variant still declares a resting identity colour', () =>
    recipe().then((src) => {
      const block = variantBlock(src);
      for (const v of ['secondary', 'primary', 'ghost', 'markerOut', 'markerIn', 'danger']) {
        const seg = block.slice(block.indexOf(`${v}: {`));
        expect(seg.slice(0, 220), `${v} lost its resting colour`).toMatch(/background|color/);
      }
    }));
});

describe('action labels do not promise a dialog they never open', () => {
  it('no Playout action label ends in an ellipsis', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/renderer/features/inspector/PlayoutSection.tsx', import.meta.url),
      'utf8',
    );
    // "Pin content start" acts immediately; the `…` convention promises a follow-up step.
    expect(src).not.toContain('Pin content start…');
  });
});

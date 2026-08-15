import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { liveSourceMask, type MaskHole } from '../src/scene.js';

/**
 * 1.5c — the backdrop-punch mask, held to ONE spelling.
 *
 * 🔴 **The risk this file exists for.** `tools/live-source-punch-probe/punch-probe.html`
 * has its own `maskUri()`, and the product now builds a mask too. **If those two
 * diverge, the probe stops testing the product** — and the probe is the only thing
 * standing between us and a silent no-op mask on air, which is not hypothetical: that
 * exact no-op shipped, produced "no visible effect at all" at the plant, and was
 * recorded as "mechanism B fails" for a day.
 *
 * The probe is a static, no-build, self-contained file (its own test forbids
 * `<script src>` and `fetch`), so it CANNOT import the shared builder at runtime.
 * Equivalence is therefore enforced the only other way it can be: this test extracts
 * the probe's real `maskUri()` from the shipping HTML, runs it, and requires the
 * result to be BYTE-IDENTICAL to the shared builder's for the same plate table.
 */

const PROBE = fileURLToPath(
  new URL('../../../tools/live-source-punch-probe/punch-probe.html', import.meta.url),
);

/** The probe's plate table and `maskUri()`, executed as the file actually ships them. */
function probeMaskUri(): { uri: string; plates: MaskHole[] } {
  const html = readFileSync(PROBE, 'utf8');

  const platesSrc = /var PLATES = (\[[\s\S]*?\]);/.exec(html);
  expect(
    platesSrc,
    'the probe no longer declares `var PLATES` — this test cannot read it',
  ).not.toBeNull();
  // The closing brace is matched at the probe's own indentation (8 spaces) so the
  // non-greedy body cannot stop at an inner `}`.
  const fnSrc = /function maskUri\(\) \{[\s\S]*?\n {8}\}/.exec(html);
  expect(
    fnSrc,
    'the probe no longer declares `maskUri()` — this test cannot read it',
  ).not.toBeNull();

  // The probe reads the scene size off `window`; supply the raster it is authored for.
  const factory = new Function(
    'window',
    `var PLATES = ${platesSrc?.[1] ?? '[]'};\n${fnSrc?.[0] ?? ''}\nreturn { uri: maskUri(), plates: PLATES };`,
  ) as (w: { innerWidth: number; innerHeight: number }) => {
    uri: string;
    plates: { x: number; y: number; w: number; h: number }[];
  };

  const out = factory({ innerWidth: 1920, innerHeight: 1080 });
  return {
    uri: out.uri,
    plates: out.plates.map((p) => ({ x: p.x, y: p.y, width: p.w, height: p.h })),
  };
}

describe('1.5c — the punch mask has ONE spelling', () => {
  it("the probe's mask is byte-identical to the shared builder's", () => {
    const { uri, plates } = probeMaskUri();
    const built = liveSourceMask(plates, { width: 1920, height: 1080 });
    expect(built).not.toBeNull();
    expect(
      built?.image,
      'the probe and the product now build DIFFERENT masks. The probe is the only ' +
        'thing that tests the product on real hardware; if they diverge it tests nothing. ' +
        'Change `liveSourceMask` and the probe together, or make the probe consume this.',
    ).toBe(uri);
  });

  it('🔴 declares LUMINANCE, because the holes are black', () => {
    // The load-bearing line. `mask-image` defaults to `mask-mode: alpha`, where `#fff`
    // and `#000` are BOTH fully opaque — so this exact mask punches NOTHING without it.
    // Measured on CasparCG 2.5.0 / Chromium 142; see design.md §9a-R.
    const mask = liveSourceMask([{ x: 0, y: 0, width: 10, height: 10 }], {
      width: 100,
      height: 100,
    });
    expect(decodeURIComponent(mask?.image ?? '')).toContain("fill='#000'");
    expect(
      mask?.mode,
      'a luminance-encoded mask without mask-mode: luminance is a NO-OP that looks ' +
        'exactly like a working mask',
    ).toBe('luminance');
  });

  it('no holes means NO mask, not an all-keep mask', () => {
    // An element nothing punches carries no mask property at all, so nothing has to
    // reason about whether a full-white mask is equivalent to absence.
    expect(liveSourceMask([], { width: 1920, height: 1080 })).toBeNull();
  });

  it('a corner radius of ZERO emits no rounding — zero is falsy', () => {
    const square = liveSourceMask([{ x: 1, y: 2, width: 3, height: 4, cornerRadius: 0 }], {
      width: 100,
      height: 100,
    });
    const undef = liveSourceMask([{ x: 1, y: 2, width: 3, height: 4 }], {
      width: 100,
      height: 100,
    });
    expect(square?.image, 'radius 0 must render exactly as no radius at all').toBe(undef?.image);
    expect(decodeURIComponent(square?.image ?? '')).not.toContain('rx=');
  });

  it("1.5d's seam is BUILT: a non-zero radius rounds the hole", () => {
    // Deliberately built and deliberately not exposed. A rounded frame with a square
    // hole disagrees at the corners — the backdrop shows inside the frame's curve — so
    // carrying the parameter now makes 1.5d a value change rather than a redesign.
    const rounded = liveSourceMask([{ x: 1, y: 2, width: 30, height: 40, cornerRadius: 8 }], {
      width: 100,
      height: 100,
    });
    const svg = decodeURIComponent(rounded?.image ?? '');
    expect(svg).toContain("rx='8'");
    expect(svg).toContain("ry='8'");
  });
});

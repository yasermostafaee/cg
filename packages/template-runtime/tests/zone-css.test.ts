import { beforeEach, describe, expect, it } from 'vitest';
import type { Element as SceneElement, Layer, Scene } from '@cg/shared-schema';
import {
  assignZoneIndices,
  compileZoneCss,
  ensureZoneCss,
  hasZonedCountdown,
  zoneColorTargets,
} from '../src/zone-css.js';
import { buildScene } from '../src/scene-builder.js';

/**
 * D-141 Phase 3 — the compiled zone stylesheet. These assert the TEXT the compiler
 * emits (jsdom resolves neither `var()` nor the cascade), plus the attribute hooks
 * the scene-builder stamps for it to bite on.
 */

const T = {
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const EL = { transform: T, opacity: 1, visible: true, locked: false, zIndex: 0 } as const;
const FONT = {
  family: 'Vazirmatn',
  weight: 600,
  style: 'normal',
  size: 48,
  lineHeight: 1.2,
  letterSpacing: 0,
} as const;

const ZONES = {
  base: { key: 'normal', color: '#00c853' },
  steps: [
    { atOrBelowMs: 3_600_000, key: 'caution', color: '#ffd600' },
    { atOrBelowMs: 1_800_000, key: 'warning', color: '#ff9100' },
    { atOrBelowMs: 600_000, key: 'critical', color: '#d50000' },
  ],
};

/** `zones: null` = an unzoned countdown (the parameter default is the 4-zone preset). */
function countdown(id: string, zones: typeof ZONES | null = ZONES): SceneElement {
  return {
    ...EL,
    id,
    name: id,
    type: 'clock',
    font: FONT,
    color: '#ffffff',
    align: 'center',
    verticalAlign: 'middle',
    mode: 'countdown',
    format: 'HH:mm:ss',
    digits: 'latin',
    target: { kind: 'timeofday', time: '20:32' },
    ...(zones === null ? {} : { zones }),
  } as SceneElement;
}

function shape(id: string, overrides?: SceneElement['zoneOverrides']): SceneElement {
  return {
    ...EL,
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#202020' },
    ...(overrides === undefined ? {} : { zoneOverrides: overrides }),
  } as SceneElement;
}

function layer(id: string, children: SceneElement[]): Layer {
  return { id, name: id, visible: true, locked: false, blendMode: 'normal', children };
}

function scene(layers: Layer[], compositions?: Scene['compositions']): Scene {
  return {
    schemaVersion: 1,
    id: 'zone-scene',
    name: 'zone-scene',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers,
    ...(compositions === undefined ? {} : { compositions }),
  } as Scene;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('compileZoneCss — structure (D-141)', () => {
  const zoned = (): Scene =>
    scene([
      layer('L1', [
        countdown('clock-1'),
        shape('shape-1', [
          { zone: 'critical', fill: 'zone' },
          { zone: 'warning', fill: '#123456' },
        ]),
      ]),
    ]);

  it('emits reset, publication, consumption and transition — in that order', () => {
    const { css, warnings } = compileZoneCss(zoned());
    expect(warnings).toEqual([]);
    const reset = css.indexOf('[data-cg-zone-root]');
    const publish = css.indexOf("[data-cg-zone='critical']");
    const consume = css.indexOf("[data-cg-zone-el='0']");
    const transition = css.indexOf('[data-cg-zone-el]{transition:');
    expect(reset).toBeGreaterThan(-1);
    // The reset must precede the equal-specificity publication rules, or a root in
    // a zone would be reset back to `initial` by source order.
    expect(reset).toBeLessThan(publish);
    expect(publish).toBeLessThan(consume);
    expect(consume).toBeLessThan(transition);
  });

  it('resets EVERY slot at a zone root, so a nested root cannot inherit its host', () => {
    const { css } = compileZoneCss(zoned());
    expect(css).toContain('[data-cg-zone-root]{--cgz-0-fill:initial}');
  });

  it('publishes the ZONE colour for a `zone` slot and the literal for an explicit hex', () => {
    const { css } = compileZoneCss(zoned());
    expect(css).toContain("[data-cg-zone='critical']{--cgz-0-fill:#d50000}"); // zones' own colour
    expect(css).toContain("[data-cg-zone='warning']{--cgz-0-fill:#123456}"); // the element's own
  });

  it('consumes through var() with the AUTHORED value as the fallback', () => {
    const { css } = compileZoneCss(zoned());
    expect(css).toContain("[data-cg-zone-el='0']{background:var(--cgz-0-fill,#202020) !important}");
  });

  it('transitions the colour properties in the 300–500 ms band', () => {
    const { css } = compileZoneCss(zoned());
    expect(css).toMatch(/\[data-cg-zone-el\]\{transition:[^}]*color 400ms ease/);
  });

  it('is DETERMINISTIC — the same scene compiles to the same bytes', () => {
    expect(compileZoneCss(zoned()).css).toBe(compileZoneCss(zoned()).css);
  });

  it('emits the whole sheet in a stable, snapshot-clean form', () => {
    expect(compileZoneCss(zoned()).css).toMatchInlineSnapshot(`
      "/* D-141 zone styling — compiled from the scene by @cg/template-runtime. */
      [data-cg-zone-root]{--cgz-0-fill:initial}
      [data-cg-zone='critical']{--cgz-0-fill:#d50000}
      [data-cg-zone='warning']{--cgz-0-fill:#123456}
      [data-cg-zone-el='0']{background:var(--cgz-0-fill,#202020) !important}
      [data-cg-zone-el]{transition:color 400ms ease,background 400ms ease,border-color 400ms ease,fill 400ms ease,stroke 400ms ease}
      "
    `);
  });
});

describe('compileZoneCss — the CEF floor (D-141)', () => {
  it('uses NO CSS feature newer than the declared baseline', () => {
    const { css } = compileZoneCss(
      scene([
        layer('L1', [
          countdown('clock-1'),
          shape('shape-1', [{ zone: 'critical', fill: 'zone', stroke: 'zone' }]),
        ]),
      ]),
    );
    // `@scope` is Chrome 118 and `:is()`/`:where()` specificity control is Chrome 88;
    // the floor is Chromium 71 (63 at the exported page's low end). Custom properties
    // — the mechanism actually used — are Chrome 49.
    expect(css).not.toContain('@scope');
    expect(css).not.toContain(':is(');
    expect(css).not.toContain(':where(');
    expect(css).not.toContain('@property');
    expect(css).not.toContain('@layer');
    expect(css).not.toContain(':has(');
    expect(css).toContain('var(--cgz-');
  });
});

describe('compileZoneCss — author-controlled strings never reach a selector (D-141)', () => {
  const nastyId = `el "1" with 'quotes' \\ and spaces`;

  it('keys slots by INDEX, so a hostile element id never appears in the CSS', () => {
    const { css } = compileZoneCss(
      scene([
        layer('L1', [countdown('clock-1'), shape(nastyId, [{ zone: 'critical', fill: 'zone' }])]),
      ]),
    );
    expect(css).not.toContain(nastyId);
    expect(css).not.toContain('quotes');
    expect(css).toContain("[data-cg-zone-el='0']");
  });

  it('and the element still carries that index in the built DOM, so it styles correctly', () => {
    const s = scene([
      layer('L1', [countdown('clock-1'), shape(nastyId, [{ zone: 'critical', fill: 'zone' }])]),
    ]);
    const built = buildScene(s, document);
    const node = built.elementMap.get(nastyId);
    expect(node?.dataset['cgZoneEl']).toBe('0');
  });

  it('ESCAPES a zone key that appears in a selector value', () => {
    const s = scene([
      layer('L1', [
        countdown('clock-1'),
        shape('shape-1', [{ zone: `it's \\ odd`, fill: '#ff0000' }]),
      ]),
    ]);
    const { css } = compileZoneCss(s);
    expect(css).toContain("[data-cg-zone='it\\'s \\\\ odd']");
  });

  it('DROPS an unescapable key with a build warning rather than emitting it', () => {
    const s = scene([
      layer('L1', [
        countdown('clock-1'),
        shape('shape-1', [
          { zone: 'bad\nkey', fill: '#ff0000' },
          { zone: 'critical', fill: 'zone' },
        ]),
      ]),
    ]);
    const { css, warnings } = compileZoneCss(s);
    expect(css).not.toContain('bad');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/control character/);
    // …and the well-formed sibling key still compiles.
    expect(css).toContain("[data-cg-zone='critical']");
  });

  it('reports two countdowns spelling one key with different colours', () => {
    const s = scene([
      layer('L1', [countdown('clock-1'), shape('shape-1', [{ zone: 'critical', fill: 'zone' }])]),
      layer('L2', [
        countdown('clock-2', {
          steps: [{ atOrBelowMs: 600_000, key: 'critical', color: '#0000ff' }],
        }),
      ]),
    ]);
    const { css, warnings } = compileZoneCss(s);
    expect(warnings.some((w) => w.includes("'critical'"))).toBe(true);
    expect(css).toContain('#d50000'); // the first authored definition wins
  });
});

describe('compileZoneCss — nothing to compile (D-141)', () => {
  it('an element with NO overrides emits no rules at all', () => {
    const { css } = compileZoneCss(scene([layer('L1', [countdown('clock-1'), shape('shape-1')])]));
    expect(css).toBe('');
  });

  it('overrides with no zoned countdown anywhere still compile (inert until one exists)', () => {
    // A composition previewed STANDALONE is exactly this case: the consumption rule
    // exists and every var falls back to the authored value.
    const { css } = compileZoneCss(
      scene([layer('L1', [shape('shape-1', [{ zone: 'critical', fill: 'zone' }])])]),
    );
    expect(css).toContain("[data-cg-zone-el='0']{background:var(--cgz-0-fill,#202020) !important}");
    // Nothing publishes it — a key no countdown defines is INERT, not an error.
    expect(css).not.toContain("[data-cg-zone='critical']");
  });

  it('an override naming a key the countdown never emits publishes nothing', () => {
    const { css } = compileZoneCss(
      scene([
        layer('L1', [countdown('clock-1'), shape('shape-1', [{ zone: 'dangre', fill: 'zone' }])]),
      ]),
    );
    expect(css).not.toContain("[data-cg-zone='dangre']");
    expect(css).toContain("[data-cg-zone-el='0']");
  });

  it('a slot the element KIND does not own is inert — no rule, no error', () => {
    const text: SceneElement = {
      ...EL,
      id: 'text-1',
      name: 'text-1',
      type: 'text',
      text: 'اذان',
      font: FONT,
      color: '#ffffff',
      align: 'start',
      direction: 'rtl',
      fitMode: 'fixed',
      overflow: 'clip',
      zoneOverrides: [{ zone: 'critical', stroke: 'zone' }],
    } as SceneElement;
    const { css } = compileZoneCss(scene([layer('L1', [countdown('clock-1'), text])]));
    expect(css).toBe(''); // a text element owns no `stroke` slot
  });
});

describe('assignZoneIndices + zoneColorTargets (D-141)', () => {
  it('numbers only opted-in elements, deterministically, in authored order', () => {
    const s = scene([
      layer('L1', [
        shape('a'),
        shape('b', [{ zone: 'critical', fill: 'zone' }]),
        shape('c'),
        shape('d', [{ zone: 'critical', stroke: 'zone' }]),
      ]),
    ]);
    const idx = assignZoneIndices(s);
    expect([...idx.entries()]).toEqual([
      ['b', 0],
      ['d', 1],
    ]);
  });

  it('gives one authored element ONE index however many times its comp is instanced', () => {
    const s = scene(
      [
        layer('L1', [
          { ...EL, id: 'inst-a', name: 'a', type: 'composition', compositionId: 'c1' },
          { ...EL, id: 'inst-b', name: 'b', type: 'composition', compositionId: 'c1' },
        ] as SceneElement[]),
      ],
      [
        {
          id: 'c1',
          name: 'child',
          resolution: { width: 100, height: 100 },
          background: 'transparent',
          frameRange: { in: 0, out: 10 },
          layers: [layer('CL', [shape('inner', [{ zone: 'critical', fill: 'zone' }])])],
        },
      ] as Scene['compositions'],
    );
    expect([...assignZoneIndices(s).entries()]).toEqual([['inner', 0]]);
  });

  it('maps each kind to the property the colour BINDING writes', () => {
    expect(zoneColorTargets(shape('s')).map((t) => [t.slot, t.property])).toEqual([
      ['fill', 'background'],
      ['stroke', 'border-color'],
    ]);
    // D-056 removed the clock's box styling, so the clock's own slot is textColor.
    expect(zoneColorTargets(countdown('c')).map((t) => [t.slot, t.property])).toEqual([
      ['textColor', 'color'],
    ]);
  });
});

describe('ensureZoneCss + the builder hooks (D-141)', () => {
  const zoned = (): Scene =>
    scene([
      layer('L1', [countdown('clock-1'), shape('shape-1', [{ zone: 'critical', fill: 'zone' }])]),
    ]);

  it('injects <style id="cg-zones"> and is idempotent', () => {
    ensureZoneCss(zoned(), document);
    const first = document.getElementById('cg-zones');
    expect(first).not.toBeNull();
    expect(first?.textContent).toContain('--cgz-0-fill');
    ensureZoneCss(zoned(), document);
    expect(document.querySelectorAll('#cg-zones')).toHaveLength(1);
  });

  it('injects NOTHING for a scene with no zone styling', () => {
    ensureZoneCss(scene([layer('L1', [shape('s')])]), document);
    expect(document.getElementById('cg-zones')).toBeNull();
  });

  it('stamps data-cg-zone-root on a scope container owning a zoned countdown', () => {
    const built = buildScene(zoned(), document);
    expect(built.container.hasAttribute('data-cg-zone-root')).toBe(true);
  });

  it('does NOT stamp a root that owns no zoned countdown', () => {
    const built = buildScene(scene([layer('L1', [shape('s')])]), document);
    expect(built.container.hasAttribute('data-cg-zone-root')).toBe(false);
  });

  it('stamps a NESTED instance root only when its own composition is zoned', () => {
    const s = scene(
      [
        layer('L1', [
          { ...EL, id: 'inst-zoned', name: 'z', type: 'composition', compositionId: 'zc' },
          { ...EL, id: 'inst-plain', name: 'p', type: 'composition', compositionId: 'pc' },
        ] as SceneElement[]),
      ],
      [
        {
          id: 'zc',
          name: 'zoned-child',
          resolution: { width: 100, height: 100 },
          background: 'transparent',
          frameRange: { in: 0, out: 10 },
          layers: [layer('ZL', [countdown('nested-clock')])],
        },
        {
          id: 'pc',
          name: 'plain-child',
          resolution: { width: 100, height: 100 },
          background: 'transparent',
          frameRange: { in: 0, out: 10 },
          layers: [layer('PL', [shape('plain-shape', [{ zone: 'critical', fill: 'zone' }])])],
        },
      ] as Scene['compositions'],
    );
    const built = buildScene(s, document);
    const zonedInner = built.elementMap.get('inst-zoned')?.querySelector('.cg-comp-inner');
    const plainInner = built.elementMap.get('inst-plain')?.querySelector('.cg-comp-inner');
    expect(zonedInner?.hasAttribute('data-cg-zone-root')).toBe(true);
    // No zoned countdown of its own ⇒ transparent to the host's zone, which is how
    // zone state crosses an instance boundary.
    expect(plainInner?.hasAttribute('data-cg-zone-root')).toBe(false);
  });

  it('hasZonedCountdown ignores a countdown with no zones and a zoned non-countdown', () => {
    expect(hasZonedCountdown([layer('L', [countdown('c', null)])])).toBe(false);
    expect(hasZonedCountdown([layer('L', [countdown('c')])])).toBe(true);
  });
});

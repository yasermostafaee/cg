import { beforeEach, describe, expect, it } from 'vitest';
import {
  migrateScene,
  type CountdownSteps,
  type Element as SceneElement,
  type Layer,
  type Scene,
} from '@cg/shared-schema';
import {
  colorChangeTargets,
  compileStepCss,
  displayedRemainingMs,
  ensureStepCss,
  hasStepCountdown,
  pickStep,
  stepPlanOf,
} from '../src/step-css.js';
import { buildScene } from '../src/scene-builder.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-A` (D-141 v2) — the compiled STEP stylesheet. These assert the TEXT the
 * compiler emits (jsdom resolves no `var()` — the cascade is measured in Chromium by the e2e), plus
 * the attribute hooks and the wrapper the scene-builder stamps for it to bite on.
 *
 * Carried over from the zone compiler it replaces (`zone-css.test.ts`, renamed here): rule order,
 * the reset at every step root, the AUTHORED fallback, determinism, the CEF floor, index-keyed
 * selectors that no author string can reach, inert slots, and the builder hooks — each guarantee
 * re-stated for steps.
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

function countdown(
  id: string,
  steps?: CountdownSteps,
  extra: Record<string, unknown> = {},
): SceneElement {
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
    ...(steps === undefined ? {} : { steps }),
    ...extra,
  } as SceneElement;
}

function shape(id: string, extra: Record<string, unknown> = {}): SceneElement {
  return {
    ...EL,
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#202020' },
    ...extra,
  } as SceneElement;
}

function layer(id: string, children: SceneElement[]): Layer {
  return { id, name: id, visible: true, locked: false, blendMode: 'normal', children };
}

function scene(layers: Layer[], compositions?: Scene['compositions']): Scene {
  return {
    schemaVersion: 1,
    id: 'step-scene',
    name: 'step-scene',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers,
    ...(compositions === undefined ? {} : { compositions }),
  } as Scene;
}

const RED: CountdownSteps = {
  steps: [
    {
      name: 'Step 1',
      atMs: 600_000,
      changes: [{ elementId: 'shape-1', property: 'fill', value: '#d50000' }],
    },
  ],
};

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('compileStepCss — structure', () => {
  const stepped = (): Scene =>
    scene([
      layer('L1', [
        countdown('clock-1', {
          before: {
            name: 'Before',
            changes: [{ elementId: 'shape-1', property: 'fill', value: '#00c853' }],
          },
          steps: [
            {
              name: 'Step 1',
              atMs: 600_000,
              changes: [
                { elementId: 'shape-1', property: 'fill', value: '#d50000' },
                { elementId: 'logo', property: 'visible', value: false },
              ],
            },
            {
              name: 'At zero',
              atMs: 0,
              changes: [{ elementId: 'clock-1', property: 'blink', value: true }],
              transition: { kind: 'cut' },
            },
          ],
        }),
        shape('shape-1'),
        shape('logo'),
      ]),
    ]);

  it('emits reset, publication, then consumption — the reset FIRST, or a root in a step would be reset back by source order', () => {
    const { css, warnings } = compileStepCss(stepped());
    expect(warnings).toEqual([]);
    const reset = css.indexOf('[data-cg-step-root]{');
    const publish = css.indexOf("[data-cg-cd0='0']");
    const consume = css.indexOf("[data-cg-step-el='0']");
    expect(reset).toBeGreaterThan(-1);
    expect(reset).toBeLessThan(publish);
    expect(publish).toBeLessThan(consume);
  });

  it('emits the whole sheet in a stable, snapshot-clean form', () => {
    expect(compileStepCss(stepped()).css).toMatchInlineSnapshot(`
      "/* countdown steps — compiled from the scene by @cg/template-runtime. */
      @keyframes cg-step-blink{50%{visibility:hidden}}
      [data-cg-step-root]{--cgs-dur:initial;--cgs-0-fill:initial;--cgs-1-op:initial;--cgs-2-blink:initial}
      [data-cg-cd0='b']{--cgs-dur:300ms;--cgs-0-fill:#00c853}
      [data-cg-cd0='0']{--cgs-dur:300ms;--cgs-0-fill:#d50000;--cgs-1-op:0}
      [data-cg-cd0='1']{--cgs-dur:0ms;--cgs-2-blink:cg-step-blink 1000ms step-end infinite}
      [data-cg-step-el='0']{background:var(--cgs-0-fill,#202020) !important}
      [data-cg-step-el='0']{transition:background var(--cgs-dur,0ms) ease}
      [data-cg-step-wrap='1']{opacity:var(--cgs-1-op,1);transition:opacity var(--cgs-dur,0ms) ease}
      [data-cg-step-wrap='2']{animation:var(--cgs-2-blink,none)}
      "
    `);
  });

  it('consumes a colour through var() with the AUTHORED value as the fallback — a released step returns it', () => {
    expect(compileStepCss(stepped()).css).toContain(
      "[data-cg-step-el='0']{background:var(--cgs-0-fill,#202020) !important}",
    );
  });

  it('every step publishes its transition time; a cut is 0 ms, the default fade 300 ms', () => {
    const { css } = compileStepCss(stepped());
    expect(css).toContain("[data-cg-cd0='b']{--cgs-dur:300ms");
    expect(css).toContain("[data-cg-cd0='1']{--cgs-dur:0ms");
  });

  it('is DETERMINISTIC — the same scene compiles to the same bytes', () => {
    expect(compileStepCss(stepped()).css).toBe(compileStepCss(stepped()).css);
  });
});

describe('compileStepCss — show, hide and opacity MULTIPLY, never fight', () => {
  it('hide wins over an opacity in the same step; show lands on the opacity value', () => {
    const s = scene([
      layer('L1', [
        countdown('c', {
          steps: [
            {
              name: 'a',
              atMs: 60_000,
              changes: [
                { elementId: 'x', property: 'opacity', value: 0.5 },
                { elementId: 'x', property: 'visible', value: false },
              ],
            },
            {
              name: 'b',
              atMs: 0,
              changes: [
                { elementId: 'x', property: 'visible', value: true },
                { elementId: 'x', property: 'opacity', value: 0.4 },
              ],
            },
          ],
        }),
        shape('x'),
      ]),
    ]);
    const { css } = compileStepCss(s);
    expect(css).toContain("[data-cg-cd0='0']{--cgs-dur:300ms;--cgs-0-op:0}");
    expect(css).toContain("[data-cg-cd0='1']{--cgs-dur:300ms;--cgs-0-op:0.4}");
  });

  it('an element authored HIDDEN that a step shows rests at opacity 0 on its wrapper', () => {
    const s = scene([
      layer('L1', [
        countdown('c', {
          steps: [
            {
              name: 'a',
              atMs: 0,
              changes: [{ elementId: 'now', property: 'visible', value: true }],
            },
          ],
        }),
        shape('now', { visible: false }),
      ]),
    ]);
    expect(compileStepCss(s).css).toContain("[data-cg-step-wrap='0']{opacity:var(--cgs-0-op,0)");
    expect(stepPlanOf(s).shown.has('now')).toBe(true);
  });

  it('a composition instance shown or hidden gets NO fade — it plays its own entrance and exit (-F)', () => {
    const s = scene(
      [
        layer('L1', [
          countdown('c', {
            steps: [
              {
                name: 'a',
                atMs: 0,
                changes: [{ elementId: 'warn', property: 'visible', value: true }],
              },
            ],
          }),
          {
            ...EL,
            id: 'warn',
            name: 'warn',
            type: 'composition',
            compositionId: 'w',
            startsHidden: true,
          } as SceneElement,
        ]),
      ],
      [
        {
          id: 'w',
          name: 'warning',
          resolution: { width: 100, height: 100 },
          editorBackdrop: 'transparent',
          frameRange: { in: 0, out: 10 },
          layers: [layer('WL', [shape('frame')])],
        },
      ] as Scene['compositions'],
    );
    const plan = stepPlanOf(s);
    expect(plan.wrapped.has('warn')).toBe(false);
    expect(plan.shown.has('warn')).toBe(false);
    expect(compileStepCss(s).css).not.toContain('-op');
  });
});

describe('compileStepCss — the CEF floor', () => {
  it('uses NO CSS feature newer than the declared baseline', () => {
    const { css } = compileStepCss(
      scene([
        layer('L1', [
          countdown('c', {
            steps: [
              {
                name: 'a',
                atMs: 0,
                changes: [
                  { elementId: 's', property: 'stroke', value: '#ff0000' },
                  { elementId: 's', property: 'blink', value: true },
                  { elementId: 's', property: 'opacity', value: 0.5 },
                ],
              },
            ],
          }),
          shape('s'),
        ]),
      ]),
    );
    // `@scope` is Chrome 118 and `:is()`/`:where()` specificity control Chrome 88; the floor is
    // Chromium 71. Custom properties — the mechanism used — are Chrome 49; keyframes far older.
    for (const later of ['@scope', ':is(', ':where(', '@property', '@layer', ':has(']) {
      expect(css).not.toContain(later);
    }
    expect(css).toContain('var(--cgs-');
  });
});

describe('compileStepCss — author-controlled strings never reach a selector', () => {
  const nastyId = `el "1" with 'quotes' \\ and spaces`;
  const nastyName = `it's "a" \\ name`;

  it('keys elements and countdowns by INDEX, and never writes a step NAME', () => {
    const s = scene([
      layer('L1', [
        countdown('clock-1', {
          steps: [
            {
              name: nastyName,
              atMs: 0,
              changes: [{ elementId: nastyId, property: 'fill', value: '#ff0000' }],
            },
          ],
        }),
        shape(nastyId),
      ]),
    ]);
    const { css } = compileStepCss(s);
    expect(css).not.toContain(nastyId);
    expect(css).not.toContain('quotes');
    expect(css).not.toContain(nastyName);
    expect(css).toContain("[data-cg-step-el='0']");
  });

  it('and the element still carries that index in the built DOM', () => {
    const s = scene([
      layer('L1', [
        countdown('clock-1', {
          steps: [
            {
              name: 'a',
              atMs: 0,
              changes: [{ elementId: nastyId, property: 'fill', value: '#ff0000' }],
            },
          ],
        }),
        shape(nastyId),
      ]),
    ]);
    const built = buildScene(s, document);
    expect(built.elementMap.get(nastyId)?.dataset['cgStepEl']).toBe('0');
  });

  it('drops a colour that is not 6 or 8 hex digits with a warning, never a malformed rule', () => {
    const s = scene([
      layer('L1', [
        countdown('c', {
          steps: [
            {
              name: 'a',
              atMs: 0,
              changes: [{ elementId: 's', property: 'fill', value: 'red;}x{' }],
            },
          ],
        }),
        shape('s'),
      ]),
    ]);
    const { css, warnings } = compileStepCss(s);
    expect(css).not.toContain('red;');
    expect(warnings).toHaveLength(1);
  });
});

describe('compileStepCss — nothing to compile', () => {
  it('a scene with no countdown steps emits no rules at all', () => {
    expect(compileStepCss(scene([layer('L1', [countdown('clock-1'), shape('shape-1')])])).css).toBe(
      '',
    );
  });

  it('a change naming no element is inert — it reaches no rule', () => {
    const s = scene([
      layer('L1', [
        countdown('c', {
          steps: [
            {
              name: 'a',
              atMs: 0,
              changes: [{ elementId: 'gone', property: 'fill', value: '#ff0000' }],
            },
          ],
        }),
      ]),
    ]);
    expect(compileStepCss(s).css).not.toContain('--cgs-0');
  });

  it('a property the element KIND does not own is inert — no rule, no error', () => {
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
    } as SceneElement;
    const s = scene([
      layer('L1', [
        countdown('c', {
          steps: [
            {
              name: 'a',
              atMs: 0,
              changes: [{ elementId: 'text-1', property: 'stroke', value: '#ff0000' }],
            },
          ],
        }),
        text,
      ]),
    ]);
    expect(compileStepCss(s).css).not.toContain('-stroke');
  });
});

describe('step selection — on the DISPLAYED quantum, across zero', () => {
  const steps: CountdownSteps = {
    before: { name: 'Before', changes: [] },
    steps: [
      { name: '10 min', atMs: 600_000, changes: [] },
      { name: 'At zero', atMs: 0, changes: [] },
      { name: '1 min after zero', atMs: -60_000, changes: [] },
    ],
  };

  it('the displayed remaining time is ceil above zero and whole seconds past it, signed', () => {
    expect(displayedRemainingMs(600_000.4)).toBe(601_000);
    expect(displayedRemainingMs(0)).toBe(0);
    expect(displayedRemainingMs(-999)).toBe(0);
    expect(displayedRemainingMs(-60_000)).toBe(-60_000);
  });

  it('Before above every threshold, the tightest step below one, At zero at zero, then after zero', () => {
    expect(pickStep(steps, 600_001)).toBe('before');
    expect(pickStep(steps, 600_000)).toBe(0);
    expect(pickStep(steps, 1)).toBe(0);
    expect(pickStep(steps, 0)).toBe(1);
    expect(pickStep(steps, -59_999)).toBe(1);
    expect(pickStep(steps, -60_000)).toBe(2);
  });

  it('without Before, above every threshold no step is active', () => {
    expect(pickStep({ steps: steps.steps }, 3_600_000)).toBeNull();
  });
});

describe('colorChangeTargets — the property the colour BINDING writes', () => {
  it('maps each kind to its CSS', () => {
    expect(colorChangeTargets(shape('s')).map((t) => [t.property, t.css])).toEqual([
      ['fill', 'background'],
      ['stroke', 'border-color'],
    ]);
    // D-056 removed the clock's box styling, so the clock's own colour is its text colour.
    expect(colorChangeTargets(countdown('c')).map((t) => [t.property, t.css])).toEqual([
      ['textColor', 'color'],
    ]);
  });
});

describe('ensureStepCss + the builder hooks', () => {
  const stepped = (): Scene => scene([layer('L1', [countdown('clock-1', RED), shape('shape-1')])]);

  it('injects <style id="cg-steps"> and is idempotent', () => {
    ensureStepCss(stepped(), document);
    expect(document.getElementById('cg-steps')?.textContent).toContain('--cgs-0-fill');
    ensureStepCss(stepped(), document);
    expect(document.querySelectorAll('#cg-steps')).toHaveLength(1);
  });

  it('injects NOTHING for a scene with no steps', () => {
    ensureStepCss(scene([layer('L1', [shape('s')])]), document);
    expect(document.getElementById('cg-steps')).toBeNull();
  });

  it('stamps data-cg-step-root on a scope that owns a countdown with steps, and only there', () => {
    expect(buildScene(stepped(), document).container.hasAttribute('data-cg-step-root')).toBe(true);
    expect(
      buildScene(scene([layer('L1', [shape('s')])]), document).container.hasAttribute(
        'data-cg-step-root',
      ),
    ).toBe(false);
  });

  it('wraps only the elements a step shows, hides, fades or blinks — a colour change needs no wrapper', () => {
    const s = scene([
      layer('L1', [
        countdown('c', {
          steps: [
            {
              name: 'a',
              atMs: 0,
              changes: [
                { elementId: 'tinted', property: 'fill', value: '#ff0000' },
                { elementId: 'hidden', property: 'visible', value: false },
              ],
            },
          ],
        }),
        shape('tinted'),
        shape('hidden'),
      ]),
    ]);
    const built = buildScene(s, document);
    const hidden = built.elementMap.get('hidden');
    const tinted = built.elementMap.get('tinted');
    expect(hidden?.parentElement?.dataset['cgStepWrap']).toBe(hidden?.dataset['cgStepEl']);
    expect(hidden?.parentElement?.style.width).toBe('100%');
    expect(hidden?.parentElement?.style.pointerEvents).toBe('none');
    expect(tinted?.parentElement?.classList.contains('cg-layer')).toBe(true);
  });

  it('an element authored hidden that a step shows is BUILT visible (its wrapper holds it transparent)', () => {
    const s = scene([
      layer('L1', [
        countdown('c', {
          steps: [
            {
              name: 'a',
              atMs: 0,
              changes: [{ elementId: 'now', property: 'visible', value: true }],
            },
          ],
        }),
        shape('now', { visible: false }),
      ]),
    ]);
    expect(buildScene(s, document).elementMap.get('now')?.style.display).not.toBe('none');
  });

  it('stamps a NESTED instance root only when its own composition has a countdown with steps', () => {
    const s = scene(
      [
        layer('L1', [
          { ...EL, id: 'inst-stepped', name: 'z', type: 'composition', compositionId: 'zc' },
          { ...EL, id: 'inst-plain', name: 'p', type: 'composition', compositionId: 'pc' },
        ] as SceneElement[]),
      ],
      [
        {
          id: 'zc',
          name: 'stepped-child',
          resolution: { width: 100, height: 100 },
          editorBackdrop: 'transparent',
          frameRange: { in: 0, out: 10 },
          layers: [layer('ZL', [countdown('nested-clock', { steps: [] })])],
        },
        {
          id: 'pc',
          name: 'plain-child',
          resolution: { width: 100, height: 100 },
          editorBackdrop: 'transparent',
          frameRange: { in: 0, out: 10 },
          layers: [layer('PL', [shape('plain-shape')])],
        },
      ] as Scene['compositions'],
    );
    const built = buildScene(s, document);
    const stepped = built.elementMap.get('inst-stepped')?.querySelector('.cg-comp-inner');
    const plain = built.elementMap.get('inst-plain')?.querySelector('.cg-comp-inner');
    expect(stepped?.hasAttribute('data-cg-step-root')).toBe(true);
    // No countdown of its own ⇒ reached by the host's steps, which is how a step crosses an
    // instance boundary.
    expect(plain?.hasAttribute('data-cg-step-root')).toBe(false);
  });

  it('hasStepCountdown ignores a countdown with no steps and a non-countdown', () => {
    expect(hasStepCountdown([layer('L', [countdown('c')])])).toBe(false);
    expect(hasStepCountdown([layer('L', [countdown('c', RED)])])).toBe(true);
  });
});

describe('🔴 a D-141 zoned scene compiles, after the migration, to the SAME colours per zone', () => {
  it('the 4-zone preset: each zone publishes exactly the colour the zone stylesheet published', () => {
    const zoned = scene([
      layer('L1', [
        countdown('clock-1', undefined, {
          zones: {
            base: { key: 'normal', color: '#00c853' },
            steps: [
              { atOrBelowMs: 3_600_000, key: 'caution', color: '#ffd600' },
              { atOrBelowMs: 1_800_000, key: 'warning', color: '#ff9100' },
              { atOrBelowMs: 600_000, key: 'critical', color: '#d50000' },
            ],
          },
        }),
        shape('shape-1', {
          zoneOverrides: [
            { zone: 'critical', fill: 'zone' },
            { zone: 'warning', fill: '#123456' },
          ],
        }),
      ]),
    ]);
    const { css } = compileStepCss(migrateScene(zoned));
    // The zones published `--cgz-0-fill:#d50000` under 'critical' and `#123456` under 'warning'.
    expect(css).toContain("[data-cg-cd0='2']{--cgs-dur:400ms;--cgs-0-fill:#d50000}");
    expect(css).toContain("[data-cg-cd0='1']{--cgs-dur:400ms;--cgs-0-fill:#123456}");
    expect(css).toContain("[data-cg-cd0='b']{--cgs-dur:400ms}");
    expect(css).toContain("[data-cg-step-el='0']{background:var(--cgs-0-fill,#202020) !important}");
  });
});

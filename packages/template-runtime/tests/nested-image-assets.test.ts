import { afterEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * 🔴 `B-102` + `D-064` — an image inside a SEQUENCE composition item, or inside a REPEATER row,
 * never reached air: the exported page wired `src` from the host's `assetUrls` map ONCE, at build
 * (`applyAssetUrls(built.container, …)`), and both of these subtrees are built LATER — a sequence
 * item when it comes on stage, a repeater row at every stamp. The Designer preview hid it (it
 * re-attaches images whenever new nodes appear), so the defect was invisible until CasparCG.
 *
 * The page is driven exactly as an export drives it: `createRuntime(scene, { assetUrls })` and
 * nothing else wiring `src`.
 */

const URL_OF_LOGO = 'assets/img/logo.png';

const T = (w: number, h: number) => ({
  position: { x: 0, y: 0 },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});
const EL = { opacity: 1, visible: true, locked: false, zIndex: 0 };

const logo = (id: string): Element =>
  ({
    ...EL,
    id,
    name: id,
    type: 'image',
    assetId: 'logo',
    source: 'project',
    fit: 'contain',
    preserveAspect: true,
    transform: T(100, 50),
  }) as unknown as Element;

function logoComp(): Composition {
  return {
    id: 'comp-logo',
    name: 'Logo card',
    resolution: { width: 400, height: 60 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'cl',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [logo('logo-in-comp')],
      },
    ],
    fields: [],
    bindings: [],
  } as unknown as Composition;
}

function scene(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-nested-images',
    name: 'nested-images',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    playout: { mode: 'manual' },
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [logoComp()],
    metadata: { createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' },
  } as unknown as Scene;
}

const sequence = (): Element =>
  ({
    ...EL,
    id: 'seq',
    name: 'pages',
    type: 'sequence',
    transform: T(400, 60),
    font: {
      family: 'Vazirmatn',
      weight: 400,
      style: 'normal',
      size: 24,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'start',
    verticalAlign: 'middle',
    direction: 'rtl',
    items: [
      { kind: 'composition', id: 'c1', compositionId: 'comp-logo' },
      { kind: 'composition', id: 'c2', compositionId: 'comp-logo' },
    ],
    defaultDwellMs: 500,
    advance: 'manual',
    transitionIn: 'none',
    transitionOut: 'none',
    transitionTiming: 'simultaneous',
    transitionMs: 0,
    repeat: 1,
  }) as unknown as Element;

const repeater = (): Element =>
  ({
    ...EL,
    id: 'rep',
    name: 'rows',
    type: 'repeater',
    transform: T(400, 300),
    compositionId: 'comp-logo',
    direction: 'column',
    flow: 'rtl',
    gap: 8,
    items: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
  }) as unknown as Element;

/** Every `<img data-cg-asset-id="logo">` under `selector`, with its `src` attribute. */
function logoSrcs(selector: string): (string | null)[] {
  return [
    ...document.querySelectorAll<HTMLImageElement>(`${selector} img[data-cg-asset-id="logo"]`),
  ].map((img) => img.getAttribute('src'));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('B-102 — an image inside a SEQUENCE composition item gets its src from assetUrls', () => {
  it('🔴 the first item, on stage at play, carries the exported URL', async () => {
    const rt = createRuntime(scene([sequence()]), {
      skipFontLoad: true,
      assetUrls: { logo: URL_OF_LOGO },
    });
    await rt.play({});
    const srcs = logoSrcs('[data-cg-element-id="seq"]');
    expect(srcs).toHaveLength(1);
    expect(srcs[0]).toBe(URL_OF_LOGO);
  });

  it('🔴 the NEXT item, built at the transition, carries it too', async () => {
    const rt = createRuntime(scene([sequence()]), {
      skipFontLoad: true,
      assetUrls: { logo: URL_OF_LOGO },
    });
    await rt.play({});
    await rt.next!();
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    const srcs = logoSrcs('[data-cg-element-id="seq"]');
    expect(srcs.length).toBeGreaterThan(0);
    for (const s of srcs) expect(s).toBe(URL_OF_LOGO);
  });

  it('POSITIVE CONTROL — a top-level image (built with the page) has always had it', async () => {
    const rt = createRuntime(scene([logo('top-logo')]), {
      skipFontLoad: true,
      assetUrls: { logo: URL_OF_LOGO },
    });
    await rt.play({});
    expect(logoSrcs('body')).toEqual([URL_OF_LOGO]);
  });
});

describe('D-064 — an image inside a REPEATER row gets its src from assetUrls', () => {
  it('🔴 every stamped row carries the exported URL', async () => {
    const rt = createRuntime(scene([repeater()]), {
      skipFontLoad: true,
      assetUrls: { logo: URL_OF_LOGO },
    });
    await rt.play({});
    const srcs = logoSrcs('[data-cg-element-id="rep"]');
    expect(srcs).toHaveLength(3);
    for (const s of srcs) expect(s).toBe(URL_OF_LOGO);
  });

  it('🔴 rows re-stamped from a bound list at the take carry it too', async () => {
    // Row COUNT is stamped at each fresh play (repeater-driver.ts): the list arrives with the
    // take, exactly as CasparCG's ADD-data → PLAY delivers it.
    const s = scene([repeater()]);
    s.fields.push({ id: 'rows', label: 'Rows', required: false, type: 'list', default: [] });
    s.bindings.push({ fieldId: 'rows', target: { kind: 'repeater-items', elementId: 'rep' } });
    const rt = createRuntime(s, { skipFontLoad: true, assetUrls: { logo: URL_OF_LOGO } });
    await rt.update({ rows: [{ id: 'a' }, { id: 'b' }] });
    await rt.play({});
    const srcs = logoSrcs('[data-cg-element-id="rep"]');
    expect(srcs).toHaveLength(2);
    for (const x of srcs) expect(x).toBe(URL_OF_LOGO);
  });
});

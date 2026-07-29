import { test as base, expect, type Locator, type Page } from '@playwright/test';
import {
  aggregateCompositionFields,
  compositionClosure,
  migrateGlobalFieldsToCompositions,
  type AssetEntry,
  type FontReference,
  type Manifest,
  type Scene,
} from '@cg/shared-schema';
import { STARTER_TEMPLATES } from '@cg/starter-templates';
import { pack } from '@cg/vcg-format';

/**
 * Runtime E2E fixtures (R-001) — the Runtime's first Playwright harness.
 *
 * `RuntimeApp` is a page object wrapping the operator UI's common actions as
 * stable, documented methods (new specs COMPOSE these instead of rewriting
 * selectors). Selectors prefer accessible roles/labels. Every test boots through
 * the `app` fixture, which arms `window.CG_E2E` before app JS so the mock bridge
 * starts deterministically.
 */
/**
 * The first EMPTY row of the seeded bank. 70–73 hold the four documented
 * display cases (html / non-html producer / empty / unknown) and must keep
 * them; everything from here up is seeded empty for the suite to load onto.
 */
const FIRST_LOADABLE_LAYER = 74;

/**
 * The row `openLibraryPicker` uses when the caller does not name one.
 *
 * Reading the library means opening a row's context menu, and LOAD FROM LIBRARY
 * is disabled on a row that is already filled — so a probe row that specs also
 * load onto would silently stop working partway through a spec. This one is
 * seeded empty and `#nextLayer` never reaches it.
 */
const LIBRARY_PROBE_LAYER = 85;

export class RuntimeApp {
  constructor(readonly page: Page) {}

  /**
   * The next row `importVcg` / `loadTemplate` will take when no layer is named.
   *
   * R-028 part B — a load now BINDS a specific row, and the gate refuses a row
   * that is not observably empty (an unbound row can still be carrying a live
   * graphic). So a fixed default layer would work exactly once per spec: the
   * second import would find the row occupied, its LOAD relabelled REMOVE, and
   * hang waiting for a file chooser that never opens. Handing out a fresh row
   * each time models what an operator does — they load onto the next free
   * layer — and keeps multi-import specs honest.
   */
  #nextLayer = FIRST_LOADABLE_LAYER;

  /** Take the next free row, refusing to encroach on the library probe row. */
  #takeLayer(): number {
    const layer = this.#nextLayer++;
    if (layer >= LIBRARY_PROBE_LAYER) {
      throw new Error(
        `E2E fixture ran out of loadable rows (reached ${String(layer)}). Widen the seeded bank in MockRuntime.seedFixedBank.`,
      );
    }
    return layer;
  }

  /**
   * Load the app at  and wait until the operator surface is shown.
   *
   * R-028 part B — the boot signal WAS the Library's Import button; the Library
   * panel is deleted, so it is now the Layers region, which is the surface every
   * spec actually drives.
   */
  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.layers).toBeVisible();
  }

  // ── regions ───────────────────────────────────────────────────────────────
  /**
   * R-028 part B — THE operator surface: one Layers list (it replaced the
   * Library, Stack and Fixed-Layers panels).
   */
  get layers(): Locator {
    return this.page.getByRole('region', { name: 'Layers' });
  }
  /** The playout tab's panel (the reserved layers another system owns). */
  get playoutTab(): Locator {
    return this.page.getByRole('tab', { name: /PLAYOUT/ });
  }
  get inspector(): Locator {
    return this.page.getByRole('complementary', { name: 'Inspector' });
  }
  /**
   * R-028 — the fixed-layers panel WAS its own region; it is now the Layers
   * list itself. Kept as an alias so specs that reason about "the panel with
   * the declared rows" read the same.
   */
  get fixedPanel(): Locator {
    return this.layers;
  }
  /**
   * The layer row for `layer`, anchored on its stable `data-layer` attribute —
   * the layer NUMBER is the row's identity (aliases are display text and not
   * unique, and a row outlives every item loaded onto it).
   */
  fixedRow(layer: number): Locator {
    return this.layers.locator(`[data-layer="${String(layer)}"]`);
  }
  /** Alias — the R-028 name for the same thing. */
  layerRow(layer: number): Locator {
    return this.fixedRow(layer);
  }
  /**
   * A command / import ERROR, surfaced as the shared command TOAST (page-level, `role="alert"`
   * named "Command error"). Import/library errors moved from an inline Library message to this
   * toast, so it is addressed on the PAGE by name — not scoped to the Library nav, and never
   * confused with the connection banner (also an alert, differently named).
   */
  get error(): Locator {
    return this.page.getByRole('alert', { name: 'Command error' });
  }

  /** A command / import SUCCESS toast (page-level, `role="alert"` named "Command success"). */
  get success(): Locator {
    return this.page.getByRole('alert', { name: 'Command success' });
  }

  // ── actions ───────────────────────────────────────────────────────────────

  /**
   * R-028 — import a `.vcg` AND load it onto a row, in ONE action.
   *
   * This is the operator's real flow now: the Library panel is gone, and a
   * row's LOAD does pick → import → bind-to-this-exact-slot as a single
   * gesture. The old fixture had `importVcg` (register only) and
   * `loadTemplate` (put it on the stack) as two steps because the product did;
   * it no longer does, so a fixture that kept them apart would be testing a
   * flow that does not exist.
   *
   * With no `layer`, takes the next free one (see `#nextLayer`) and returns it.
   */
  async importVcg(filename: string, bytes: Uint8Array, layer?: number): Promise<number> {
    const target = layer ?? this.#takeLayer();
    const before = await this.templateCount();
    const chooser = this.page.waitForEvent('filechooser');
    await this.layerRow(target).getByRole('button', { name: 'LOAD' }).click();
    await (
      await chooser
    ).setFiles({
      name: filename,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(bytes),
    });
    // Handing over the file only STARTS the chain — verify, register, then the
    // exact-slot load. Returning here would hand the spec a row that is not yet
    // bound and a library that does not yet list the template, so every caller
    // would need its own wait. Settle on either real outcome: the registry grew
    // (imported), or the command toast reported a refusal. Read from the
    // registry rather than a toast alone, because a toast left over from an
    // earlier action in the same spec would satisfy a naive wait instantly.
    await expect
      .poll(async () => (await this.templateCount()) > before || (await this.error.count()) > 0)
      .toBe(true);
    return target;
  }

  /** The template picker dialog — the only template list left (R-005 lives here too). */
  get templatePicker(): Locator {
    return this.page.getByRole('dialog');
  }

  /**
   * Open the LIBRARY picker from a row's context menu.
   *
   * R-028 part B — the Library PANEL is deleted; this dialog is the only
   * template list the product still has, so every "what is in the library?"
   * assertion is made here now.
   */
  async openLibraryPicker(layer = LIBRARY_PROBE_LAYER): Promise<void> {
    await this.layerRow(layer).click({ button: 'right' });
    await this.page.getByRole('menuitem', { name: 'LOAD FROM LIBRARY' }).click();
    await expect(this.templatePicker).toBeVisible();
  }

  /** Dismiss the picker without loading anything (resolves the pick as `null`). */
  async closeTemplatePicker(): Promise<void> {
    await this.templatePicker.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.templatePicker).toHaveCount(0);
  }

  /**
   * How many templates the LIBRARY holds.
   *
   * Read from the REGISTRY rather than by counting rows in the picker. The
   * Library panel is gone, so the picker is the only list — and it is a modal:
   * a before/after count would have to open and close it around the very action
   * under test, which both perturbs the thing being measured and asserts
   * something weaker than intended ("the dialog listed it" rather than "it is
   * registered"). Specs still cover the picker's own listing through
   * `loadTemplate`, which finds a template there by id and loads it.
   */
  templateCount(): Promise<number> {
    return this.page.evaluate(async () => {
      const w = window as unknown as { cg: { templates: { list: () => Promise<unknown[]> } } };
      return (await w.cg.templates.list()).length;
    });
  }

  /**
   * A template's row INSIDE the open picker, anchored on its stable id (the
   * visible label is file-derived and not unique). The picker must already be
   * open.
   */
  templateRow(templateId: string): Locator {
    return this.templatePicker.locator(`[data-template-id="${templateId}"]`);
  }

  /**
   * Load an ALREADY-IMPORTED template onto a row, via the row's menu-placed
   * "LOAD FROM LIBRARY" and the picker it opens.
   */
  async loadTemplate(templateId: string, layer?: number): Promise<number> {
    const target = layer ?? this.#takeLayer();
    await this.openLibraryPicker(target);
    await this.templateRow(templateId)
      .getByRole('button', { name: /^Load / })
      .click();
    await expect(this.templatePicker).toHaveCount(0);
    return target;
  }

  /** How many templates the OPEN picker lists (one "Load …" button each). */
  loadButtons(): Locator {
    return this.templatePicker.getByRole('button', { name: /^Load / });
  }

  /**
   * The stack row(s) for `templateId`.
   *
   * R-004 — the row no longer PRINTS its `templateId`: a UUID is not an operator-facing
   * label. The id remains the row's stable ANCHOR (labels are not unique — two templates may
   * legitimately share one), carried as a data attribute. Specs that used to find a row by
   * filtering on the id as visible TEXT compose this instead.
   *
   * Several rows can share a `templateId` (the same template loaded twice), so callers that
   * need exactly one still pick — conventionally `.last()`, the most recently loaded.
   */
  stackRow(templateId: string): Locator {
    return this.layers.locator(`[data-template-id="${templateId}"]`);
  }

  /**
   * Select the stack row for `templateId` (so the Inspector shows its fields).
   *
   * Clicks the row's LABEL BODY, never the row ROOT. Playwright clicks an element's geometric
   * CENTRE, and the row is a `[badge] [1fr body] [auto actions]` grid — so the root's centre
   * lands wherever the columns happen to fall. The actions column calls `stopPropagation()`
   * (button clicks must not also select the row), so a centre landing there selects NOTHING;
   * land a few pixels further and it presses PLAY.
   *
   * That is exactly what broke CI: on Windows/system-Chrome the centre cleared the actions
   * column by 19px and every local run passed, while on CI's Linux/bundled-Chromium the wider
   * buttons dragged the column left across the centre — so the row never selected, the
   * Inspector stayed empty, and all 8 row-selecting specs failed deterministically. The body
   * is the row's one guaranteed non-interactive region; clicking it bubbles to the row's own
   * handler exactly as an operator's click does.
   */
  async selectStackRow(templateId: string): Promise<void> {
    await this.stackRow(templateId).first().locator('[data-row-body]').click();
  }

  /** R-028 — select a row by its LAYER, which is the row identity now. */
  async selectLayerRow(layer: number): Promise<void> {
    await this.layerRow(layer).locator('[data-row-body]').click();
  }

  /** R-003 — apply the selected item's staged edits via the Inspector's Update. */
  async applyEdits(): Promise<void> {
    await this.inspector.getByRole('button', { name: 'Apply staged edits' }).click();
  }

  /** R-003 — discard the selected item's staged edits. */
  async discardEdits(): Promise<void> {
    await this.inspector.getByRole('button', { name: 'Discard staged edits' }).click();
  }

  /** Count `stack.update` dispatches from now on (proves apply actually sends). */
  async installUpdateSpy(): Promise<void> {
    await this.page.evaluate(() => {
      const w = window as unknown as {
        __updateCount: number;
        cg: { stack: { update: (req: unknown) => Promise<{ accepted: boolean }> } };
      };
      w.__updateCount = 0;
      const orig = w.cg.stack.update.bind(w.cg.stack);
      w.cg.stack.update = (req: unknown) => {
        w.__updateCount += 1;
        return orig(req);
      };
    });
  }

  /** The number of `stack.update` calls since `installUpdateSpy`. */
  updateCount(): Promise<number> {
    return this.page.evaluate(() => (window as unknown as { __updateCount: number }).__updateCount);
  }
}

/**
 * A minimal schema-valid Scene with one labelled field — small enough to keep
 * the fixture readable, complete enough to verify + unpack + surface a field in
 * the Inspector. Mirrors `@cg/vcg-format`'s test fixture (a Persian lower-third).
 */
function fixtureScene(): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-e2e-1',
    name: 'e2e-lower-third',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      {
        id: 'layer-1',
        name: 'Text',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: 'el-name',
            name: 'anchor',
            type: 'text',
            transform: {
              position: { x: 100, y: 800 },
              size: { w: 800, h: 80 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            text: '{{anchor}}',
            font: {
              family: 'Vazirmatn',
              weight: 700,
              style: 'normal',
              size: 48,
              lineHeight: 1.4,
              letterSpacing: 0,
            },
            color: '#FFFFFF',
            align: 'start',
            direction: 'rtl',
            fitMode: 'autosize',
            overflow: 'ellipsis',
          },
          // D-110 — a path element with a MORPH track. The runtime app's built
          // bundle bakes the scene schema in at build time; carrying the newest
          // animatable track in the E2E fixture means a stale/missed schema
          // rebuild fails the import E2E loudly (the owner-reported 2026-07-11
          // gap: a Designer path-morph .vcg was rejected by a runtime instance
          // built before the schema gained the `path` track).
          {
            id: 'el-morph',
            name: 'Morph',
            type: 'path',
            transform: {
              position: { x: 200, y: 200 },
              size: { w: 100, h: 80 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 1,
            closed: true,
            points: [
              { id: 'a', x: 0, y: 0, smooth: false },
              { id: 'b', x: 100, y: 0, smooth: false },
              { id: 'c', x: 100, y: 80, smooth: false },
            ],
            fill: { kind: 'solid', color: '#22C55E' },
            stroke: { width: 2, color: '#101010' },
            animation: {
              tracks: {
                path: {
                  keyframes: [
                    {
                      id: 'k1',
                      frame: 0,
                      value: {
                        kind: 'path',
                        points: [
                          { id: 'a', x: 0, y: 0, smooth: false },
                          { id: 'b', x: 100, y: 0, smooth: false },
                          { id: 'c', x: 100, y: 80, smooth: false },
                        ],
                      },
                      easing: 'ease-in-out',
                    },
                    {
                      id: 'k2',
                      frame: 40,
                      value: {
                        kind: 'path',
                        points: [
                          { id: 'a', x: 0, y: 20, smooth: false },
                          { id: 'b', x: 160, y: 0, smooth: true, out: { x: 20, y: 10 } },
                          { id: 'c', x: 60, y: 80, smooth: false },
                        ],
                      },
                      easing: 'linear',
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
    fields: [
      {
        id: 'anchor',
        label: 'Anchor name',
        required: true,
        type: 'text',
        default: 'سارا نادری',
        direction: 'rtl',
      },
    ],
    bindings: [
      {
        fieldId: 'anchor',
        target: { kind: 'text', elementId: 'el-name', placeholder: '{{anchor}}' },
      },
    ],
    fonts: [
      {
        family: 'Vazirmatn',
        weights: [400, 500, 700],
        styles: ['normal'],
        source: 'bundled',
        bundledPath: 'fonts/Vazirmatn-Variable.woff2',
      },
    ],
    metadata: {
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
    },
  };
}

/** Build a valid, verifiable `.vcg` whose registered template id is `templateId`. */
export async function buildValidVcg(templateId = 'tpl-e2e-1'): Promise<Uint8Array> {
  const scene = fixtureScene();
  const fontDeps: readonly FontReference[] = scene.fonts;
  const assetIndex: readonly AssetEntry[] = [];
  const manifestExtras = {
    id: templateId,
    name: 'e2e-lower-third',
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-06-29T00:00:00.000Z',
      exportedAt: '2026-06-29T00:01:00.000Z',
    },
    compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
    fontDeps,
    assetIndex,
  } satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
    fontDeps: readonly FontReference[];
    assetIndex: readonly AssetEntry[];
  };
  return pack({
    scene,
    manifestExtras,
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
  });
}

/**
 * B-040 — a verifiable `.vcg` that also carries a ticker-style `list` Data key
 * (`_tickerTexts`) with structured Persian items, so the operator Inspector must
 * render an items editor (not "[object Object]").
 */
export async function buildListFieldVcg(templateId = 'tpl-e2e-list'): Promise<Uint8Array> {
  const scene = fixtureScene();
  scene.fields = [
    ...scene.fields,
    {
      id: '_tickerTexts',
      label: 'Ticker items',
      required: false,
      type: 'list',
      default: [
        { id: 'i1', text: 'سلام دنیا' },
        { id: 'i2', text: 'اخبار فوری' },
      ],
    },
  ];
  const fontDeps: readonly FontReference[] = scene.fonts;
  const assetIndex: readonly AssetEntry[] = [];
  const manifestExtras = {
    id: templateId,
    name: 'e2e-lower-third-list',
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-06-29T00:00:00.000Z',
      exportedAt: '2026-06-29T00:01:00.000Z',
    },
    compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
    fontDeps,
    assetIndex,
  } satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
    fontDeps: readonly FontReference[];
    assetIndex: readonly AssetEntry[];
  };
  return pack({
    scene,
    manifestExtras,
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
  });
}

/**
 * R-003 — a verifiable `.vcg` that adds a `number` dynamic field (`fontSize`)
 * alongside the text `anchor`, so the number control's staged multi-digit typing
 * can be exercised (a remount-on-keystroke would drop focus and lose digits).
 */
export async function buildNumberFieldVcg(templateId = 'tpl-e2e-number'): Promise<Uint8Array> {
  const scene = fixtureScene();
  scene.fields = [
    ...scene.fields,
    { id: 'fontSize', label: 'Font size', required: false, type: 'number', default: 5, step: 1 },
  ];
  const fontDeps: readonly FontReference[] = scene.fonts;
  const assetIndex: readonly AssetEntry[] = [];
  const manifestExtras = {
    id: templateId,
    name: 'e2e-lower-third-number',
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-06-29T00:00:00.000Z',
      exportedAt: '2026-06-29T00:01:00.000Z',
    },
    compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
    fontDeps,
    assetIndex,
  } satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
    fontDeps: readonly FontReference[];
    assetIndex: readonly AssetEntry[];
  };
  return pack({
    scene,
    manifestExtras,
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
  });
}

/**
 * R-011 — a verifiable `.vcg` whose scene carries a manifest default on-air
 * position, so the Inspector's position picker must seed from it.
 */
export async function buildPositionedVcg(templateId = 'tpl-e2e-pos'): Promise<Uint8Array> {
  const scene = fixtureScene();
  scene.defaultPosition = { anchor: 'bottom-right', offset: { x: -10, y: -20 } };
  const fontDeps: readonly FontReference[] = scene.fonts;
  const assetIndex: readonly AssetEntry[] = [];
  const manifestExtras = {
    id: templateId,
    name: 'e2e-positioned',
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-06-29T00:00:00.000Z',
      exportedAt: '2026-06-29T00:01:00.000Z',
    },
    compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
    fontDeps,
    assetIndex,
  } satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
    fontDeps: readonly FontReference[];
    assetIndex: readonly AssetEntry[];
  };
  return pack({
    scene,
    manifestExtras,
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
  });
}

/** Bytes that are NOT a valid `.vcg` — `verify()` fails to even unpack them. */
export function buildInvalidVcg(): Uint8Array {
  return new TextEncoder().encode('this is not a .vcg archive');
}

/** The extended `test` every Runtime spec imports: provides a booted `app`. */
export const test = base.extend<{ app: RuntimeApp }>({
  app: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as unknown as { CG_E2E: boolean }).CG_E2E = true;
      // R-028 — the declared bank is armed for EVERY spec now, because the
      // Layers list IS the operator surface: with no bank there are no rows,
      // so there is nowhere to load, nothing to select and nothing to drive.
      // It used to be opt-in because the fixed panel was an extra surface
      // beside the Library and the Stack; both of those are gone.
      (window as unknown as { CG_E2E_FIXED_BANK: boolean }).CG_E2E_FIXED_BANK = true;
      // B-038 Phase 3 — pin the bridge probe at a guaranteed-dead port so a real
      // caspar-bridge listening on the default 127.0.0.1:5280 can't make these
      // specs go LIVE (failover banner + real CG ADD) and flake. The library /
      // import flow exercises the offline MockRuntime deterministically.
      (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = 'ws://127.0.0.1:1';
    });
    // The app no longer opens native dialogs — every confirm/prompt is an in-app modal, so
    // specs click a real button. This stays as a backstop: if a `window.confirm` ever
    // creeps back in, it is dismissed rather than hanging the run on an unanswered dialog.
    page.on('dialog', (d) => void d.dismiss());
    const app = new RuntimeApp(page);
    await app.goto();
    await use(app);
  },
});

export { expect };

/**
 * B-067 — a REAL D-119 starter packaged the way the Designer actually exports it: the
 * graphic composition nested inside a full-frame positioning composition, with the
 * authored fields living on the NESTED comp (so the entry comp's own `fields` is empty).
 *
 * This is the exact shape that used to render "No fields." in the operator Inspector.
 * Built from `@cg/starter-templates` rather than hand-rolled, so the fixture cannot drift
 * from the starters the operator actually loads.
 */
export async function buildNestedCompVcg(
  templateId = 'tpl-e2e-nested',
): Promise<{ bytes: Uint8Array; groupLabel: string; fieldId: string }> {
  const starter = STARTER_TEMPLATES.map((s) => {
    const migrated = migrateGlobalFieldsToCompositions({ ...s.scene, layers: [] });
    const comps = migrated.compositions ?? [];
    const entryId = migrated.entryCompositionId ?? comps[0]?.id;
    const entry = comps.find((c) => c.id === entryId);
    if (entry === undefined) return null;
    const closure = compositionClosure(migrated, entry.id);
    const scoped: Scene = {
      ...migrated,
      name: entry.name,
      resolution: entry.resolution,
      frameRange: entry.frameRange,
      ...(entry.activeRange !== undefined ? { activeRange: entry.activeRange } : {}),
      ...(entry.lifecycle !== undefined ? { lifecycle: entry.lifecycle } : {}),
      ...(entry.playout !== undefined ? { playout: entry.playout } : {}),
      background: entry.background,
      layers: entry.layers,
      fields: entry.fields ?? [],
      bindings: entry.bindings ?? [],
      compositions: comps.filter((c) => closure.has(c.id)),
    };
    const aggregate = aggregateCompositionFields(scoped, scoped);
    const group = aggregate.groups[0];
    const field = group?.aggregate.fields[0];
    if (aggregate.fields.length > 0 || group === undefined || field === undefined) return null;
    return { scoped, group, field };
  }).find((s) => s !== null);

  if (starter === null || starter === undefined) {
    throw new Error('no D-119 starter with fields exclusively in a nested composition');
  }

  const { scoped, group, field } = starter;
  const fontDeps: readonly FontReference[] = scoped.fonts;
  const assetIndex: readonly AssetEntry[] = [];
  const manifestExtras = {
    id: templateId,
    name: scoped.name,
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-07-13T00:00:00.000Z',
      exportedAt: '2026-07-13T00:01:00.000Z',
    },
    compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
    fontDeps,
    assetIndex,
  } satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
    fontDeps: readonly FontReference[];
    assetIndex: readonly AssetEntry[];
  };
  const bytes = await pack({
    scene: scoped,
    manifestExtras,
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
  });
  return { bytes, groupLabel: group.label ?? group.name, fieldId: field.id };
}

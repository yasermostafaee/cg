import { test as base, expect, type Locator, type Page } from '@playwright/test';
import type { AssetEntry, FontReference, Manifest, Scene } from '@cg/shared-schema';
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
export class RuntimeApp {
  constructor(readonly page: Page) {}

  /** Load the app at `/` and wait until the Library's import affordance is shown. */
  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.importButton).toBeVisible();
  }

  // ── regions ───────────────────────────────────────────────────────────────
  get library(): Locator {
    return this.page.getByRole('navigation', { name: 'Library' });
  }
  get stack(): Locator {
    return this.page.getByRole('region', { name: 'Stack' });
  }
  get inspector(): Locator {
    return this.page.getByRole('complementary', { name: 'Inspector' });
  }
  get importButton(): Locator {
    return this.page.getByRole('button', { name: 'Import .vcg template' });
  }
  /** The Library's verification-error message (role="alert"). */
  get error(): Locator {
    return this.page.getByRole('alert');
  }

  // ── actions ───────────────────────────────────────────────────────────────

  /** Upload a `.vcg` via the Library's import button (drives the native file chooser). */
  async importVcg(filename: string, bytes: Uint8Array): Promise<void> {
    const chooser = this.page.waitForEvent('filechooser');
    await this.importButton.click();
    await (
      await chooser
    ).setFiles({
      name: filename,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(bytes),
    });
  }

  /** How many templates the Library currently lists (one "Load …" button each). */
  loadButtons(): Locator {
    return this.library.getByRole('button', { name: /^Load / });
  }

  /** Click the Library's "Load" action for `templateId`, putting it on the stack. */
  async loadTemplate(templateId: string): Promise<void> {
    await this.library.getByRole('button', { name: `Load ${templateId}`, exact: true }).click();
  }

  /** Select the stack row for `templateId` (so the Inspector shows its fields). */
  async selectStackRow(templateId: string): Promise<void> {
    await this.stack.getByText(templateId, { exact: false }).first().click();
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

/** Bytes that are NOT a valid `.vcg` — `verify()` fails to even unpack them. */
export function buildInvalidVcg(): Uint8Array {
  return new TextEncoder().encode('this is not a .vcg archive');
}

/** The extended `test` every Runtime spec imports: provides a booted `app`. */
export const test = base.extend<{ app: RuntimeApp }>({
  app: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as unknown as { CG_E2E: boolean }).CG_E2E = true;
      // B-038 Phase 3 — pin the bridge probe at a guaranteed-dead port so a real
      // caspar-bridge listening on the default 127.0.0.1:5280 can't make these
      // specs go LIVE (failover banner + real CG ADD) and flake. The library /
      // import flow exercises the offline MockRuntime deterministically.
      (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = 'ws://127.0.0.1:1';
    });
    page.on('dialog', (d) => void d.dismiss());
    const app = new RuntimeApp(page);
    await app.goto();
    await use(app);
  },
});

export { expect };

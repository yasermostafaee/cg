import * as dgram from 'node:dgram';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { DynamicField, Scene } from '@cg/shared-schema';
import { ExporterSingleFile, cgCss, cgJsIife } from '@cg/single-file-export';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `TEXT-DIGITS-01` — **CG CONTROL WRITES A VALUE'S DIGITS AS THE AUTHOR CHOSE, AS IT IS TYPED**,
 * end to end: the real browser, a real in-process bridge and the `@cg/amcp-mock` CasparCG, whose
 * DECODED `CG UPDATE` data is what these specs read (the shape `persian-digits.spec.ts` uses, for
 * the reason it gives: the claim is about the bytes CasparCG receives).
 *
 * - A list cell writes its LIST field's Digits choice as it is typed; a list with no setting is the
 *   control and keeps the digits typed.
 * - A Keyboard field writes a typed digit in the keyboard language the desktop shell reports at that
 *   moment — the shell's one read-only command, faked here through `__TAURI_INTERNALS__` as
 *   `first-run.spec.ts` fakes its door.
 * - The page draws one element's author text and its bound value each by its own choice.
 */

const FIELDS: DynamicField[] = [
  {
    id: 'rundown',
    label: 'rundown',
    required: false,
    type: 'list',
    default: [{ id: 'a', text: 'x' }],
    digits: 'persian',
  },
  // The control: a list with no setting — what a template made before the choice carries.
  { id: 'tally', label: 'tally', required: false, type: 'list', default: [{ id: 'a', text: 'x' }] },
  { id: 'kbd', label: 'kbd', required: false, type: 'text', default: 'x', digits: 'as-typed' },
];
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>t</body></html>';
const LAYER = 70;

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

let bridge: BridgeHandle | null = null;
let mock: MockHandle | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
});

// Each test boots a bridge and a mock CasparCG — the B-098 load bound, not an ordering need.
test.describe.configure({ mode: 'serial' });

/** Boot against a live bridge, take one row to air, select it. Returns the Inspector. */
async function bootOnAir(page: Page): Promise<Locator> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10 });
  bridge = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    fixedLayers: { channel: 1, low: { start: 50, count: 9 }, start: 70, count: 4, aliases: {} },
  });
  const url = bridge.url;
  await page.addInitScript(
    ([u]) => {
      (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = u as string;
    },
    [url],
  );
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Bridge link' })).not.toContainText('DISCONNECTED');
  await page.evaluate(
    async ([fields, html, layer]) => {
      const w = window as unknown as {
        cg: {
          templates: { import: (r: unknown) => Promise<unknown> };
          fixedLayers: { load: (r: unknown) => Promise<unknown> };
          stack: { take: (r: unknown) => Promise<unknown> };
        };
      };
      await w.cg.templates.import({
        template: { templateId: 'digits', templateType: 'lower-third', fields },
        html,
      });
      await w.cg.fixedLayers.load({
        channel: 1,
        layer,
        itemId: 'row-digits',
        templateId: 'digits',
        fields: { rundown: [{ id: 'a', text: 'x' }], tally: [{ id: 'a', text: 'x' }], kbd: 'x' },
      });
      await w.cg.stack.take({ itemId: 'row-digits' });
    },
    [FIELDS, HTML, LAYER] as const,
  );
  const row = page.getByRole('region', { name: 'Layers' }).locator(`[data-layer="${LAYER}"]`);
  await expect(row).toContainText('ON AIR');
  await row.locator('[data-row-body]').click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByRole('textbox', { name: 'rundown item 1' })).toBeVisible();
  return inspector;
}

/** The field set CasparCG last received for the row, decoded through BOTH un-escape layers. */
function wireFields(): Record<string, unknown> | null {
  const u = mock?.lastCgUpdate({ channel: 1, layer: LAYER });
  if (u === undefined || u.data === null) return null;
  expect(u.rejected, 'the mock accepted the CG UPDATE payload').toBeUndefined();
  return JSON.parse(u.data) as Record<string, unknown>;
}

/** A list field's first item text as CasparCG received it. */
function wireItem(fieldId: string): string {
  const list = wireFields()?.[fieldId];
  if (!Array.isArray(list)) return '';
  const first = list[0] as { text?: unknown } | undefined;
  return typeof first?.text === 'string' ? first.text : '';
}

const codePoints = (s: string): number[] => [...s].map((c) => c.codePointAt(0) ?? -1);

/** Replace a box's text by typing it: every character through the keyboard. */
async function typeInto(page: Page, box: Locator, text: string) {
  await box.click();
  await box.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text);
}

test('a Persian list cell typed `12` shows `۱۲`, and the CG UPDATE carries `۱۲`; a list with no setting keeps `12`', async ({
  page,
}, testInfo) => {
  const inspector = await bootOnAir(page);
  const apply = inspector.getByRole('button', { name: 'Apply staged edits' });
  const rundown = inspector.getByRole('textbox', { name: 'rundown item 1' });
  const tally = inspector.getByRole('textbox', { name: 'tally item 1' });

  await typeInto(page, rundown, 'خبر 12');
  await expect(rundown).toHaveValue('خبر ۱۲');
  await inspector.screenshot({ path: testInfo.outputPath('persian-list-cell.png') });
  // The control: a list with no setting is Keyboard, and nothing here says which keyboard.
  await typeInto(page, tally, 'خبر 12');
  await expect(tally).toHaveValue('خبر 12');
  await apply.click();

  await expect.poll(() => codePoints(wireItem('rundown'))).toEqual(codePoints('خبر ۱۲'));
  await expect.poll(() => codePoints(wireItem('tally'))).toEqual(codePoints('خبر 12'));
});

test('a Keyboard field follows the shell’s signal: `1` typed on latin, `2` on persian, reads `1۲` on screen and on the wire', async ({
  page,
}) => {
  // The shell's one read-only command, faked: its answer is whatever `__kb` holds.
  await page.addInitScript(() => {
    const w = window as unknown as { __kb: string; __TAURI_INTERNALS__: unknown };
    w.__kb = 'latin';
    w.__TAURI_INTERNALS__ = {
      invoke: (command: string) =>
        command === 'keyboard_language'
          ? Promise.resolve(w.__kb)
          : Promise.reject(new Error(`not faked here: ${command}`)),
    };
  });
  const inspector = await bootOnAir(page);
  const apply = inspector.getByRole('button', { name: 'Apply staged edits' });
  const kbd = inspector.getByRole('textbox', { name: 'kbd' });

  await typeInto(page, kbd, '1');
  await expect(kbd).toHaveValue('1');
  // The operator switches to Persian (Alt+Shift); the shell reports it on its next answer.
  await page.evaluate(() => {
    (window as unknown as { __kb: string }).__kb = 'persian';
  });
  await page.waitForTimeout(600); // two of the detector's 250 ms polls while the box has focus
  await page.keyboard.type('2');
  await expect(kbd).toHaveValue('1۲');
  // The control: a signal that knows nothing leaves the digit as the key sent it.
  await page.evaluate(() => {
    (window as unknown as { __kb: string }).__kb = 'unknown';
  });
  await page.waitForTimeout(600);
  await page.keyboard.type('3');
  await expect(kbd).toHaveValue('1۲3');
  await apply.click();
  await expect
    .poll(() => codePoints(String(wireFields()?.['kbd'] ?? '')))
    .toEqual(codePoints('1۲3'));
});

/** A text element holding `text`, in `digits` (absent: none — a template made before the choice). */
function textElement(
  id: string,
  y: number,
  text: string,
  digits?: string,
): Record<string, unknown> {
  return {
    id,
    name: id,
    type: 'text',
    transform: {
      position: { x: 100, y },
      size: { w: 1200, h: 80 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    text,
    font: {
      family: 'Vazirmatn',
      weight: 400,
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
    ...(digits === undefined ? {} : { digits }),
  };
}

test('one element, two rules: the author’s text in the element’s Digits, the bound value in its field’s', async ({
  page,
}) => {
  const scene = {
    schemaVersion: 1,
    id: 'scene-mixed',
    name: 'mixed',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'layer-1',
        name: 'Text',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          textElement('el-mixed', 100, 'ساعت 10 — {v}', 'persian'),
          // The control: the same element from a template made before the choice.
          textElement('el-old', 220, 'ساعت 10 — {v}'),
        ],
      },
    ],
    fields: [
      { id: 'v', label: 'v', required: false, type: 'text', default: '', digits: 'latin' },
      { id: 'w', label: 'w', required: false, type: 'text', default: '', digits: 'persian' },
    ],
    bindings: [
      { fieldId: 'v', target: { kind: 'text', elementId: 'el-mixed', placeholder: '{v}' } },
      { fieldId: 'w', target: { kind: 'text', elementId: 'el-old', placeholder: '{v}' } },
    ],
    fonts: [],
    metadata: { createdAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z' },
  } as unknown as Scene;
  const exporter = new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  });
  const { html } = await exporter.produce(scene);
  await page.setContent(html);
  await page.waitForFunction(
    () => typeof (window as unknown as { update?: unknown }).update === 'function',
  );
  await page.evaluate(
    (json) => {
      const w = window as unknown as { update: (s: string) => void; play: () => void };
      w.update(json);
      w.play();
    },
    JSON.stringify({ v: '25', w: '25' }),
  );
  await expect(page.locator('[data-cg-element-id="el-mixed"]')).toHaveText('ساعت ۱۰ — 25');
  await expect(page.locator('[data-cg-element-id="el-old"]')).toHaveText('ساعت 10 — ۲۵');
});

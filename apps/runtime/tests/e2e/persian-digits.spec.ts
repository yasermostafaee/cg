import * as dgram from 'node:dgram';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `PERSIAN-DIGITS-01` — **A TEMPLATE VALUE TAKES DIGITS EXACTLY AS THE KEYBOARD TYPES THEM**,
 * in CG Control, end to end: the real browser, a real in-process bridge, and the `@cg/amcp-mock`
 * CasparCG, whose DECODED `CG UPDATE` data is what these specs read. Nothing here asserts on a
 * store the wire could disagree with.
 *
 * ── WHY NOT THE `app` FIXTURE ───────────────────────────────────────────────
 *
 * `app` arms `CG_E2E`, which selects `MockRuntime` — an in-browser stand-in with no AMCP at all.
 * The claim is about the BYTES CasparCG receives, so these boot the real `WebSocketRuntime`
 * against a real bridge, the shape `retention-honesty.spec.ts` established.
 *
 * Typing is `keyboard.type`, which delivers each character through `insertText` — what an input
 * method (a Persian keyboard layout) hands the page — rather than `fill`, which writes the value
 * in one go.
 */

const FIELDS = [
  { id: 'headline', label: 'headline', required: false, type: 'text', default: 'x' },
  { id: 'score', label: 'score', required: false, type: 'number', default: 5 },
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

// Each test boots a bridge PROCESS and a mock CasparCG — the B-098 load bound, not an ordering need.
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
        fields: { headline: 'x', score: 5 },
      });
      await w.cg.stack.take({ itemId: 'row-digits' });
    },
    [FIELDS, HTML, LAYER] as const,
  );
  const row = page.getByRole('region', { name: 'Layers' }).locator(`[data-layer="${LAYER}"]`);
  await expect(row).toContainText('ON AIR');
  await row.locator('[data-row-body]').click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByRole('textbox', { name: 'headline' })).toBeVisible();
  return inspector;
}

/** The field set CasparCG last received for the row, decoded through BOTH un-escape layers. */
function wireFields(): Record<string, unknown> | null {
  const u = mock?.lastCgUpdate({ channel: 1, layer: LAYER });
  if (u === undefined || u.data === null) return null;
  expect(u.rejected, 'the mock accepted the CG UPDATE payload').toBeUndefined();
  return JSON.parse(u.data) as Record<string, unknown>;
}

const codePoints = (s: string): number[] => [...s].map((c) => c.codePointAt(0) ?? -1);

/** Replace a field's text by typing it the way a keyboard layout delivers it. */
async function typeInto(page: Page, field: Locator, text: string) {
  await field.click();
  await field.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text);
}

test('§2 A — `۱۲۳`, `١٢٣` and `123` typed into a text field reach CasparCG exactly as typed', async ({
  page,
}) => {
  const inspector = await bootOnAir(page);
  const headline = inspector.getByRole('textbox', { name: 'headline' });
  const apply = inspector.getByRole('button', { name: 'Apply staged edits' });

  for (const typed of ['۱۲۳', '١٢٣', 'ساعت ۱۲:۳۰', '123']) {
    await typeInto(page, headline, typed);
    // The field shows what was typed…
    await expect(headline).toHaveValue(typed);
    await apply.click();
    // …and CasparCG receives it code point for code point. `123` is the Latin control: it must
    // arrive unchanged too, or the rule was "normalise" and not "keep".
    await expect
      .poll(() => codePoints(String(wireFields()?.['headline'] ?? '')))
      .toEqual(codePoints(typed));
  }
});

test('§2 B — a number field keeps `۱۲٫۵` on screen and sends 12.5; `۱۲a` is refused in one line and sends nothing new', async ({
  page,
}) => {
  const inspector = await bootOnAir(page);
  const score = inspector.getByRole('textbox', { name: 'score' });
  const apply = inspector.getByRole('button', { name: 'Apply staged edits' });
  const refusal = inspector.locator('[data-field-refusal]');

  // The control first: a plain number stages, sends, and raises no refusal.
  await typeInto(page, score, '۱۲');
  await expect(refusal).toHaveCount(0);
  await apply.click();
  await expect.poll(() => wireFields()?.['score']).toBe(12);

  // The operator's digits stay on screen; the NUMBER goes to the wire (the contract of a
  // `number` field is unchanged — measured before this change, the field rewrote itself to `12.5`).
  await typeInto(page, score, '۱۲٫۵');
  await expect(score).toHaveValue('۱۲٫۵');
  await apply.click();
  await expect.poll(() => wireFields()?.['score']).toBe(12.5);
  expect(typeof wireFields()?.['score']).toBe('number');
  await expect(score).toHaveValue('۱۲٫۵');

  // Measured before this change: `۱٬۲۳۴` reached air as 1.
  await typeInto(page, score, '۱٬۲۳۴');
  await apply.click();
  await expect.poll(() => wireFields()?.['score']).toBe(1234);

  // Impossible: refused, in ONE line, and NOTHING new is sent. Measured before this change, `۱۲a`
  // reached air as 12 — the last prefix that parsed — and no sentence said so.
  await typeInto(page, score, '۱۲a');
  await expect(refusal).toHaveCount(1);
  await expect(refusal).toHaveText('Not a number — Update will not change it.');
  await expect(score).toHaveAttribute('aria-invalid', 'true');
  await expect(score).toHaveValue('۱۲a');
  await apply.click();
  // Update still sends (the B-048 re-send) — and it carries the value that was ON AIR.
  await page.waitForTimeout(300);
  expect(wireFields()?.['score']).toBe(1234);
});

/**
 * The runs an `<input>`'s own text was laid out in, left to right — read from the engine.
 *
 * An input's text lives in its user-agent shadow tree, where no page script can take a Range, and
 * `DOMSnapshot.captureSnapshot` skips it. `DOMSnapshot.getSnapshot` with
 * `includeUserAgentShadowTree` reports the inline text boxes the bidi algorithm produced — one per
 * directional run — with their start offset and their x. A run is identified by the text it
 * starts with, so the answer is a list of STRINGS in visual order.
 */
async function inputRunsLeftToRight(page: Page, value: string, box: { x: number; width: number }) {
  const client = await page.context().newCDPSession(page);
  const snap = (await client.send('DOMSnapshot.getSnapshot', {
    computedStyleWhitelist: [],
    includeUserAgentShadowTree: true,
  })) as unknown as {
    domNodes: { nodeValue?: string }[];
    layoutTreeNodes: {
      domNodeIndex: number;
      inlineTextNodes?: {
        boundingBox: { x: number };
        startCharacterIndex: number;
        numCharacters: number;
      }[];
    }[];
  };
  const runs: { x: number; text: string }[] = [];
  for (const node of snap.layoutTreeNodes) {
    if (snap.domNodes[node.domNodeIndex]?.nodeValue !== value) continue;
    for (const b of node.inlineTextNodes ?? []) {
      // Only the runs inside THIS input's box — the page may render the same string elsewhere.
      if (b.boundingBox.x < box.x || b.boundingBox.x > box.x + box.width) continue;
      runs.push({
        x: b.boundingBox.x,
        text: value.slice(b.startCharacterIndex, b.startCharacterIndex + b.numCharacters).trim(),
      });
    }
  }
  await client.detach();
  return runs.sort((a, b) => a.x - b.x).map((r) => r.text);
}

test('§2 D — `ساعت ۱۲:۳۰` reads in order in the Inspector field, with no new direction mechanism', async ({
  page,
}) => {
  const inspector = await bootOnAir(page);
  const headline = inspector.getByRole('textbox', { name: 'headline' });
  // The existing mechanism, unchanged: the editor's `dir="auto"` (`editorTextDirection.ts`).
  await expect(headline).toHaveAttribute('dir', 'auto');

  await typeInto(page, headline, 'ساعت ۱۲:۳۰');
  await expect(headline).toHaveValue('ساعت ۱۲:۳۰');
  const box = await headline.boundingBox();
  if (box === null) throw new Error('the headline field is not on screen');
  // Right to left: the word, then — to its LEFT — the time, whose own digits and colon read left
  // to right as ONE run. The instrument is proven live by the control below.
  expect(await inputRunsLeftToRight(page, 'ساعت ۱۲:۳۰', box)).toEqual(['۱۲:۳۰', 'ساعت']);

  // The control: a Latin value lays out left to right, its first character leftmost.
  await typeInto(page, headline, 'Studio 12:30');
  const latin = await inputRunsLeftToRight(page, 'Studio 12:30', box);
  expect(latin.length, 'the instrument read the Latin value').toBeGreaterThan(0);
  expect(latin[0]?.startsWith('Studio')).toBe(true);
});

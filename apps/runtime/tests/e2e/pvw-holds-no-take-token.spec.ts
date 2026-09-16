import type { Page } from '@playwright/test';
import { test, expect, buildValidVcg } from './fixtures/runtime.js';

/**
 * 🔴 `SELF-STOP-24 · REPLY 1` §R2 — **ONLY A CasparCG PAGE MAY HOLD A LIVE TAKE TOKEN.**
 *
 * ── THE TWO THINGS A STRAY TOKEN COULD DO ─────────────────────────────────────────────────
 *
 * A page that holds a live token AND can reach the bridge's origin can either SPEND it before
 * the real graphic finishes — so the real row never self-stops and goes on claiming ON AIR,
 * which is `C-013`'s complaint restored — or STOP AIR while the real graphic is still running.
 * The second is a picture lost on a row nobody touched.
 *
 * ── PVW IS THE ONE NON-CasparCG HOST THAT RENDERS A TEMPLATE PAGE ─────────────────────────
 *
 * The census: `withCgControl` is called in exactly four places outside its own definition —
 * three in `CommandBuilder` (`updateLook`, `updatePassTiming`, `updateTake`), one in
 * `CasparRuntime.#sendAdd`, and ONE outside the bridge: `RehearsalFrame`'s payload builder.
 * The Designer's canvas and Preview modal render template pages too, but from the Designer's
 * own live scene in a different app — they never see this bridge's `__cg` at all.
 *
 * So PVW is the host to prove, and it is proved HERE rather than by reading the payload
 * builder, because what matters is what the running app actually hands the page.
 *
 * ── WHY PVW IS ALSO STRUCTURALLY SAFE, AND WHY THAT IS NOT THE PRIMARY GUARD ──────────────
 *
 * A rehearsal frame is a `srcdoc` document, so its URL is `about:srcdoc` — MEASURED by this
 * spec in Chromium as `{ protocol: 'about:', href: 'about:srcdoc' }`, not assumed — and the
 * reporter
 * (`completion-ping.ts`) refuses any page whose protocol is not `http:`/`https:`. That is a
 * second, host-level refusal that holds even if a token ever leaked into the preview payload.
 * It is asserted below as defence in depth; the PRIMARY guarantee is that no token is sent.
 */

/**
 * A stand-in for the served page that RECORDS every payload the app hands it.
 *
 * Modelled on `rehearse-composite.spec.ts`'s stub and for the same reason — the offline mock
 * retains no rendered page, so without a stub there is no iframe at all. This one records
 * rather than computes: what the spec must prove is WHAT REACHES the page, so the page is
 * reduced to a recorder.
 */
function recordingPage(): string {
  return `<!doctype html><html><head><title>pvw-recorder</title></head>
<body style="margin:0">
  <div class="cg-stage" style="width:1920px;height:1080px"></div>
  <script>
    window.__cgPayloads = [];
    window.__cgLocation = { protocol: location.protocol, href: location.href };
    function record(p) { window.__cgPayloads.push(typeof p === 'string' ? p : JSON.stringify(p || null)); }
    window.play = record;
    window.update = record;
    window.next = function () {};
    window.stop = function () {};
    window.CG = { applyOutputPosition: function () {} };
  </script>
</body></html>`;
}

async function stubRetainedPage(page: Page): Promise<void> {
  await page.evaluate((html: string) => {
    (
      window as unknown as { cg: { templates: { html: () => Promise<string> } } }
    ).cg.templates.html = () => Promise.resolve(html);
  }, recordingPage());
}

async function rehearseRow(page: Page, layer: number): Promise<void> {
  await page
    .locator(`[data-layer="${String(layer)}"]`)
    .getByRole('button', { name: 'ON PVW', exact: true })
    .click();
}

test.beforeEach(async ({ app }) => {
  await app.showMonitors();
});

test('🔴 the PVW frame is handed NO take token, and could not report one if it were', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  const layer = await app.importVcg('pvw-token.vcg', await buildValidVcg('tpl-pvw-token'));
  await stubRetainedPage(page);
  await rehearseRow(page, layer);

  const frame = page.locator('iframe[data-rehearsal-frame]').first();
  await expect(frame).toHaveCount(1);

  // Let the stage seat the frame and drive its transport at least once.
  await expect
    .poll(
      async () =>
        await frame.evaluate(
          (el) =>
            ((el as HTMLIFrameElement).contentWindow as unknown as { __cgPayloads?: string[] })
              ?.__cgPayloads?.length ?? 0,
        ),
      { timeout: 5000, message: 'the frame was never handed a payload — nothing below is proved' },
    )
    .toBeGreaterThan(0);

  const payloads = await frame.evaluate(
    (el) =>
      ((el as HTMLIFrameElement).contentWindow as unknown as { __cgPayloads?: string[] })
        ?.__cgPayloads ?? [],
  );

  // 🔴 THE CLAIM. Every payload PVW sends, read as the page reads it.
  for (const raw of payloads) {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    const control = (parsed?.['__cg'] ?? {}) as Record<string, unknown>;
    expect(
      control['take'],
      `PVW handed the page a take token — it can spend or fire the real row's completion (payload: ${raw})`,
    ).toBeUndefined();
  }

  /*
    DEFENCE IN DEPTH, and a browser fact rather than an assumption: a `srcdoc` document's URL
    is `about:srcdoc`, so `completion-ping.ts`'s protocol guard refuses it whatever payload it
    was handed. jsdom would not settle this — only a real engine reports the frame's own URL.
  */
  const loc = await frame.evaluate(
    (el) =>
      (
        (el as HTMLIFrameElement).contentWindow as unknown as {
          __cgLocation?: { protocol: string; href: string };
        }
      )?.__cgLocation ?? null,
  );
  expect(loc, 'the recorder never ran — the protocol claim is unmeasured').not.toBeNull();
  expect(
    ['http:', 'https:'],
    `a PVW frame reports protocol ${String(loc?.protocol)} (${String(loc?.href)}) — the reporter's host guard would NOT refuse it`,
  ).not.toContain(loc?.protocol);
});

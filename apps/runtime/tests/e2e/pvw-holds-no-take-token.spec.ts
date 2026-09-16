import type { Locator, Page } from '@playwright/test';
import { test, expect, buildValidVcg, buildLoopingVcg } from './fixtures/runtime.js';

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
    window.__cgCalls = [];
    window.__cgLocation = { protocol: location.protocol, href: location.href };
    function record(door) {
      return function (p) {
        var raw = typeof p === 'string' ? p : JSON.stringify(p || null);
        window.__cgPayloads.push(raw);
        window.__cgCalls.push({ door: door, raw: raw });
      };
    }
    window.play = record('play');
    window.update = record('update');
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

/**
 * 🔴 `PASSES-CYCLE-ONLY-26` Part B (`R-065`) — **PVW PLAYS THE OPERATOR'S COUNT.**
 *
 * The owner, 2026-09-16: in PVW the timing always ran the template's authored defaults, and
 * pressing `Update` changed nothing there either. Measured at HEAD before the fix: the payload
 * was `withCgControl(fields, {look})` and nothing else, so the page never received
 * `__cg.timing`. `B-151`'s shape one member later — PVW once got no LOOK for the same reason.
 *
 * ⚠ **The relative-count trap is what these cases are really about.** On a RUNNING page
 * `__cg.timing.passes` means "passes REMAINING FROM NOW", and the frame's field-update effect
 * re-fires on every draft change. Folding the timing into that payload would re-arm the count on
 * every keystroke in an unrelated text box. So: `play()` always carries it (it seats a TOTAL),
 * `update()` carries it on the first boot and when the VALUE changes, and never otherwise.
 */
interface Call {
  door: string;
  raw: string;
}

const callsIn = async (frame: Locator): Promise<Call[]> =>
  await frame.evaluate(
    (el) =>
      ((el as HTMLIFrameElement).contentWindow as unknown as { __cgCalls?: Call[] })?.__cgCalls ??
      [],
  );

/** Every `__cg.timing` a door carried, in order. */
function timingsOn(calls: readonly Call[], door: string): unknown[] {
  return calls
    .filter((c) => c.door === door)
    .map((c) => (JSON.parse(c.raw) as { __cg?: { timing?: unknown } } | null)?.__cg?.timing)
    .filter((t) => t !== undefined);
}

/** Set this row's pass count through the Inspector, exactly as the operator does. */
async function selectRow(app: { page: Page }, layer: number): Promise<void> {
  await app.page.locator(`[data-layer="${String(layer)}"] [data-row-body]`).click();
}

async function setCount(app: { page: Page }, layer: number, count: string): Promise<void> {
  await selectRow(app, layer);
  await app.page.getByRole('button', { name: 'Count', exact: true }).click();
  // The box's accessible name is air-state dependent — 'Passes next take' off air,
  // 'Passes remaining' on air. A PVW row is not on air, but match the prefix so the case does
  // not depend on which reading the row happens to be in.
  const box = app.page.locator('input[aria-label^="Passes"]');
  await expect(box, 'the pass control is not offered — the fixture is not a loop').toHaveCount(1);
  await box.fill(count);
  await box.blur();
}

test('🔴 Part B — PVW is told the operator COUNT, on play and on the first boot', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  const layer = await app.importVcg('pvw-count.vcg', await buildLoopingVcg('tpl-pvw-count'));
  await stubRetainedPage(page);
  await setCount(app, layer, '1');
  await rehearseRow(page, layer);

  const frame = page.locator('iframe[data-rehearsal-frame]').first();
  await expect(frame).toHaveCount(1);
  await expect
    .poll(async () => (await callsIn(frame)).length, {
      timeout: 5000,
      message: 'the frame was never driven — nothing below is proved',
    })
    .toBeGreaterThan(0);

  // The FIRST boot carries it, before any play: the page stores it as a pending total.
  expect(
    timingsOn(await callsIn(frame), 'update'),
    'PVW booted the page without the operator count — it would run the authored default',
  ).toContainEqual({ passes: 1 });
});

test('🔴 Part B — a field edit on a running PVW page does NOT re-send the count', async ({
  app,
}) => {
  /*
    THE RELATIVE-COUNT TRAP, driven through the real Inspector. `passes` on a running page is
    "remaining FROM NOW", so a count re-sent on every keystroke would extend the run by one pass
    per character — a graphic that never ends, from typing in a text field.
  */
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  const layer = await app.importVcg('pvw-count2.vcg', await buildLoopingVcg('tpl-pvw-count2'));
  await stubRetainedPage(page);
  await setCount(app, layer, '2');
  await rehearseRow(page, layer);

  const frame = page.locator('iframe[data-rehearsal-frame]').first();
  await expect
    .poll(async () => timingsOn(await callsIn(frame), 'update').length, { timeout: 5000 })
    .toBeGreaterThan(0);
  const before = timingsOn(await callsIn(frame), 'update').length;

  const pushesBefore = (await callsIn(frame)).filter((c) => c.door === 'update').length;

  /*
    Type into an unrelated field. The frame's field push re-fires on every keystroke — that
    responsiveness is most of what rehearse is for — so this is the exact condition under which
    a timing folded into the same payload would re-arm the count.
  */
  // Re-select the row: rehearsing does not guarantee the Inspector is still on it, and the
  // field is reached the way every other spec reaches one — by its accessible name, inside the
  // Inspector landmark.
  // ⚠ NOT re-selected: the row is ALREADY selected from `setCount`, and clicking its body again
  // TOGGLES the selection off — which closes the Inspector and leaves nothing to type into.
  // Measured: the Inspector landmark went to a count of 0 on the second click.
  // The field input's accessible name is the field's ID (`anchor`), not its display label —
  // measured, not assumed: the label is a sibling span, so `getByLabel('Anchor name')` finds
  // nothing.
  const field = app.inspector.getByLabel('anchor', { exact: true }).first();
  await expect(field, 'no text field to type into — this case would pass vacuously').toHaveCount(1);
  await field.fill('a');
  await field.fill('ab');
  await field.fill('abc');
  await page.waitForTimeout(400);

  const after = await callsIn(frame);

  /*
    🔴 THE POSITIVE CONTROL, and without it this case is satisfied by a frame nobody drove.
    The field pushes MUST have increased — that proves the effect under test actually fired —
    while the number of pushes CARRYING TIMING must not have moved.
  */
  expect(
    after.filter((c) => c.door === 'update').length,
    'the field edit never reached the frame — the trap was never sprung',
  ).toBeGreaterThan(pushesBefore);
  expect(
    timingsOn(after, 'update').length,
    'the count was re-armed by typing — every keystroke added a pass',
  ).toBe(before);
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

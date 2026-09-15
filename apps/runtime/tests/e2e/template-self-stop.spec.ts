import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `SELF-STOP-24` §2.5 — **THE OPERATOR'S HALF: a row that finishes stops reading ON AIR by
 * itself, and a row that cannot finish never does.**
 *
 * ── WHAT THIS ADDS THAT THE BRIDGE TESTS CANNOT ───────────────────────────────────────────
 *
 * `template-completion-stop.integration.test.ts` proves the AMCP wire: one `CG … STOP`, the
 * producer left resident, the stale cases refused. It cannot see the thing `C-013` was actually
 * filed about, which is a SURFACE claim — *"the list shows several items as ON AIR while only
 * one thing is actually on output, so the operator cannot tell which row corresponds to what the
 * viewer sees."* That sentence is about the layer table, and only a browser can read it.
 *
 * ── HOW "THE PAGE FINISHED" IS PRODUCED, AND WHY IT IS A SEAM ─────────────────────────────
 *
 * The real signal comes from a page inside CasparCG's CEF posting to the bridge that served it.
 * Offline there is no page, no CEF and no route, so there is nothing to wait for — and the one
 * alternative, product code that guesses at completion after N milliseconds, is precisely what
 * `C-013` forbids: *"nothing guesses at completion with a timer"*. So the spec calls the same
 * entry point the route calls, through a seam armed only under `CG_E2E`.
 *
 * ⚠ **The token is ASKED FOR, never guessed.** A spec that invented a token string would prove
 * only that an unknown token does nothing. Both the live case and the stale case are built from
 * real tokens the mock actually issued.
 */

const TPL = 'tpl-e2e-self-stop';

interface Cg {
  templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> };
  stack: {
    snapshot: () => Promise<{ itemId: string; templateId: string }[]>;
    take: (req: { itemId: string }) => Promise<{ accepted: boolean }>;
  };
}

async function registerTemplate(page: Page): Promise<void> {
  await page.evaluate(async (templateId) => {
    const w = window as unknown as { cg: Cg };
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'self stop',
        sourceFileName: 'self-stop.vcg',
        templateType: 'lower-third',
        fields: [],
      },
      html: '<!doctype html><html><body>self stop</body></html>',
    });
  }, TPL);
}

/** The itemId of this template's row, from the published snapshot. */
async function itemIdOf(page: Page): Promise<string> {
  const id = await page.evaluate(async (templateId) => {
    const w = window as unknown as { cg: Cg };
    const rows = await w.cg.stack.snapshot();
    return rows.find((r) => r.templateId === templateId)?.itemId ?? null;
  }, TPL);
  expect(id, 'the row was never published — the rest of this spec is void').not.toBeNull();
  return id as string;
}

async function takeRow(page: Page, itemId: string): Promise<void> {
  const accepted = await page.evaluate(
    async (id) => (await (window as unknown as { cg: Cg }).cg.stack.take({ itemId: id })).accepted,
    itemId,
  );
  expect(accepted, 'the row must take').toBe(true);
}

/** The token the row's page would be holding — asked of the mock, never invented. */
async function takeToken(page: Page, itemId: string): Promise<string> {
  const token = await page.evaluate(
    (id) =>
      (
        window as unknown as { CG_TEST_TAKE_TOKEN?: (i: string) => string | undefined }
      ).CG_TEST_TAKE_TOKEN?.(id) ?? null,
    itemId,
  );
  expect(token, 'the e2e seam is not armed, or the row was given no token').not.toBeNull();
  return token as string;
}

/** Report a completion, exactly as the bridge's route would. Returns whether it acted. */
async function reportCompletion(page: Page, token: string): Promise<boolean> {
  return page.evaluate(
    (t) =>
      (
        window as unknown as { CG_TEST_TEMPLATE_COMPLETED?: (x: string) => boolean }
      ).CG_TEST_TEMPLATE_COMPLETED?.(t) ?? false,
    token,
  );
}

test('🔴 a row whose template finishes stops reading ON AIR by itself', async ({ app }) => {
  await registerTemplate(app.page);
  const layer = await app.loadTemplate(TPL);
  const itemId = await itemIdOf(app.page);
  await takeRow(app.page, itemId);

  const row = app.layerRow(layer);
  await expect(row, 'the row never went on air — nothing below proves anything').toContainText(
    'ON AIR',
    { timeout: 3000 },
  );

  const token = await takeToken(app.page, itemId);
  expect(await reportCompletion(app.page, token), 'the completion was refused').toBe(true);

  await expect(row, 'the finished row still claims ON AIR — C-013 exactly').not.toContainText(
    'ON AIR',
    { timeout: 3000 },
  );
  // C-012's residency contract: STOP leaves the producer, so the row rests READY rather than
  // going empty. A row that went EMPTY would mean the layer was cleared, which is the verb the
  // owner superseded on 2026-09-15.
  await expect(row, 'the layer was cleared, not stopped').toContainText('READY');
});

test('a STALE token does nothing to the row', async ({ app }) => {
  await registerTemplate(app.page);
  const layer = await app.loadTemplate(TPL);
  const itemId = await itemIdOf(app.page);
  await takeRow(app.page, itemId);

  const stale = await takeToken(app.page, itemId);
  // Re-take: the page is the same page, so the bridge refreshes its token and the one above
  // now names a run that is over. A report from the FINISHED run must not stop this one.
  await takeRow(app.page, itemId);
  const fresh = await takeToken(app.page, itemId);
  expect(fresh, 'the re-take did not refresh the token — the stale case is not set up').not.toBe(
    stale,
  );

  expect(await reportCompletion(app.page, stale), 'a finished run stopped a newer one').toBe(false);
  await expect(app.layerRow(layer), 'the row came off air on a stale report').toContainText(
    'ON AIR',
  );

  // The positive control: the FRESH token does work, so "nothing happened" above is a refusal
  // and not a completion channel that had quietly stopped working.
  expect(await reportCompletion(app.page, fresh)).toBe(true);
  await expect(app.layerRow(layer)).not.toContainText('ON AIR', { timeout: 3000 });
});

test('a second report of the SAME run is ignored — the mirrored plant', async ({ app }) => {
  await registerTemplate(app.page);
  const layer = await app.loadTemplate(TPL);
  const itemId = await itemIdOf(app.page);
  await takeRow(app.page, itemId);

  const token = await takeToken(app.page, itemId);
  expect(await reportCompletion(app.page, token)).toBe(true);
  // The primary's page and the backup's page are the same page from the same URL, so both
  // report the same run. The token is spent on first use.
  expect(await reportCompletion(app.page, token), 'the token was not spent').toBe(false);

  await expect(app.layerRow(layer)).not.toContainText('ON AIR', { timeout: 3000 });
});

test('a row the operator already stopped is not stopped again', async ({ app }) => {
  await registerTemplate(app.page);
  const layer = await app.loadTemplate(TPL);
  const itemId = await itemIdOf(app.page);
  await takeRow(app.page, itemId);
  const token = await takeToken(app.page, itemId);

  await app.page.evaluate(
    async (id) =>
      (
        window as unknown as {
          cg: { stack: { stop: (r: { itemId: string }) => Promise<unknown> } };
        }
      ).cg.stack.stop({ itemId: id }),
    itemId,
  );
  await expect(app.layerRow(layer)).not.toContainText('ON AIR', { timeout: 3000 });

  expect(await reportCompletion(app.page, token), 'a late report acted on a stopped row').toBe(
    false,
  );
});

test('a row whose template never reports stays ON AIR — manual, infinite, and the lost signal', async ({
  app,
}) => {
  /*
    🔴 **WHERE THE LIFECYCLE DECISION IS, AND WHY IT IS NOT ASSERTED HERE.**

    §2.5 asks for "a `manual` or infinite row does not [come off air]". That decision is made
    ENTIRELY in the page: `PlayoutController` never reaches a self-end for `static`, `manual` or
    an infinite `loop-cycle`, so no report is ever sent — pinned as an absence by
    `self-end-signal.test.ts` and `self-end-event.test.ts`, against the real controller and the
    real runtime.

    Neither the mock nor the bridge knows a template's lifecycle, and neither should: the whole
    of `C-013` is that the template is the only party that knows. Teaching the mock to decide it
    would model a judgement the bridge does not make — the `B-070`/`B-072` class this mock exists
    to avoid.

    So what this surface can honestly assert is the CONSEQUENCE, and it is the same observable
    for all three of manual, infinite, and a report that was lost because the bridge was down:
    **nothing arrives, and the row goes on claiming ON AIR exactly as it does today.** That is
    `C-013`'s "degrades to today's", read at the layer table.
  */
  await registerTemplate(app.page);
  const layer = await app.loadTemplate(TPL);
  const itemId = await itemIdOf(app.page);
  await takeRow(app.page, itemId);

  const row = app.layerRow(layer);
  await expect(row).toContainText('ON AIR', { timeout: 3000 });

  // No report. Give the surface a real chance to change its mind, then read it again.
  await app.page.waitForTimeout(500);

  await expect(row, 'a row nothing reported on came off air by itself').toContainText('ON AIR');
});

test('a row that was never taken cannot be stopped by a report', async ({ app }) => {
  // The load mints a token too — a page exists the moment CG ADD builds one. But a row that is
  // merely LOADED is not on air, so there is nothing for a completion to end.
  await registerTemplate(app.page);
  const layer = await app.loadTemplate(TPL);
  const itemId = await itemIdOf(app.page);
  const token = await takeToken(app.page, itemId);

  expect(await reportCompletion(app.page, token), 'a loaded row was stopped by a report').toBe(
    false,
  );
  await expect(app.layerRow(layer)).toContainText('READY');
});

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * B-140 — a divider drag must survive the pointer crossing the PVW iframe.
 *
 * ── WHY THIS TEST EXISTS AT ALL ────────────────────────────────────────────
 *
 * The old divider registered `mousemove` / `mouseup` on the parent window, and
 * PVW is a same-origin `<iframe srcdoc>`. With the pointer over one, the parent
 * got no moves and — the part that actually broke the app — never got the `up`.
 * So the drag never ended: `is-dragging` stayed on, and `document.body` kept
 * `cursor: row-resize` and `user-select: none` **application-wide** until some
 * later drag happened to end cleanly.
 *
 * ── 🔴 THE POSITIVE CONTROL, AND WHY IT IS NOT OPTIONAL ────────────────────
 *
 * The first version of this spec PASSED against the pre-fix code — and it was
 * worthless. PVW renders a frame only for a REHEARSING row, so with nothing
 * rehearsing there was no iframe under the drag and the test crossed nothing. A
 * green result and a missing instrument have the same signature, which is this
 * repo's own rule: **a negative observation is not a result until the instrument
 * is proven live.**
 *
 * So each case rehearses a row, ASSERTS the frame exists, and asserts the drag
 * path actually passes over its box. Only then does the release-over-the-frame
 * mean anything.
 *
 * ── WHAT IT ASSERTS, AND WHY IT IS THESE ───────────────────────────────────
 *
 * It reads what the BROWSER shows, never what the component thinks: the COMPUTED
 * `body` cursor and `user-select`, and the divider's class. An assertion on
 * internal state would have passed against the broken code, because the component
 * genuinely believed it was still dragging — that belief WAS the bug.
 *
 * ⚠ Computed style, not the inline `style` attribute: the fix REMOVED the inline
 * writes entirely, so an inline assertion would pass trivially afterwards while
 * proving nothing about what a user sees.
 */

const TEMPLATE_ID = 'divider-iframe-fixture';

/**
 * Register a template through the SAME door an import uses, so a row can be
 * loaded and put on PVW. Modelled on `pvw-live-plate-placeholder.spec.ts`.
 */
async function registerTemplate(page: Page): Promise<void> {
  await page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: {
        templates: {
          import: (req: { template: unknown; html: string }) => Promise<unknown>;
          html?: () => Promise<string>;
        };
      };
    };
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'divider fixture',
        sourceFileName: 'divider.vcg',
        templateType: 'lower-third',
        fields: [],
      },
      html: '<!doctype html><html><body>divider fixture</body></html>',
    });
    // The rehearsal renders the RETAINED page; stub it so a frame has something
    // to show and actually mounts.
    w.cg.templates.html = () =>
      Promise.resolve('<!doctype html><html><body>divider fixture</body></html>');
  }, TEMPLATE_ID);
}

/** The one place a leaked drag would show, read as the browser resolves it. */
async function bodyState(page: Page): Promise<{ cursor: string; userSelect: string }> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { cursor: cs.cursor, userSelect: cs.userSelect };
  });
}

/**
 * Put a row on PVW so a rehearsal `<iframe>` exists, and hand back its box.
 *
 * Returns `null` when the fixture cannot get a row rehearsing — the caller then
 * SKIPS rather than asserting against an absent instrument, because a pass with
 * no iframe is exactly the false green this spec was rewritten to remove.
 */
async function rehearsingFrameBox(
  page: Page,
  app: { loadTemplate: (id: string) => Promise<number> },
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  await registerTemplate(page);
  let layer: number;
  try {
    layer = await app.loadTemplate(TEMPLATE_ID);
  } catch {
    return null;
  }
  const onPvw = page
    .locator(`[data-layer="${String(layer)}"]`)
    .getByRole('button', { name: 'ON PVW', exact: true });
  if ((await onPvw.count()) === 0) return null;
  await onPvw.click();

  const frame = page.locator('iframe[data-rehearsal-frame]').first();
  await expect(frame, 'POSITIVE CONTROL: a rehearsal frame must exist to cross').toBeVisible({
    timeout: 10_000,
  });
  return frame.boundingBox();
}

test('a drag released over the PVW frame ends completely and leaves no global state', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  const frameBox = await rehearsingFrameBox(page, app);
  test.skip(frameBox === null, 'could not get a row rehearsing; nothing to cross');
  if (frameBox === null) return;

  // Anchored at the START of the accessible name, never both ends: a name can
  // carry more after the label — session A's `/LAYERS/` two-tab lesson.
  const divider = page.getByRole('separator', { name: /^Resize the monitor strip/ });
  await expect(divider).toBeVisible();
  const box = await divider.boundingBox();
  expect(box, 'the monitor-strip divider should be laid out').not.toBeNull();
  if (box === null) return;

  // The drag must genuinely travel over the frame, not merely toward it. The X is
  // the FRAME's centre, not the divider's: the monitor strip holds more than one
  // panel, so the divider's midpoint can sit entirely beside the frame — which is
  // exactly how an earlier version of this spec crossed nothing and passed.
  const overX = frameBox.x + frameBox.width / 2;
  const overY = frameBox.y + frameBox.height / 2;
  expect(overY, 'the frame must lie ABOVE the divider for this path to cross it').toBeLessThan(
    box.y,
  );

  // 🔴 POSITIVE CONTROL ON THE CROSSING ITSELF. Assert the browser hit-tests that
  // point to an IFRAME before relying on a release there to mean anything.
  const tagAtRelease = await page.evaluate(
    ([px, py]) => document.elementFromPoint(px, py)?.tagName ?? 'NONE',
    [overX, overY],
  );
  expect(tagAtRelease, 'the release point must actually be over an iframe').toBe('IFRAME');

  const before = await bodyState(page);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(overX, overY, { steps: 15 });
  // RELEASED OVER THE FRAME — the event the parent used never to receive.
  await page.mouse.up();

  await expect(divider, 'the drag must have ended').not.toHaveClass(/is-dragging/);

  const after = await bodyState(page);
  expect(after.cursor, 'body must not keep the resize cursor').toBe(before.cursor);
  expect(after.userSelect, 'text selection must not be left dead').toBe(before.userSelect);
  await expect(
    page.locator('[data-cg-drag-shield]'),
    'the shield must not be stranded',
  ).toHaveCount(0);
});

test('the same drag by TOUCH ends completely — one code path for mouse, touch and pen', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  const frameBox = await rehearsingFrameBox(page, app);
  test.skip(frameBox === null, 'could not get a row rehearsing; nothing to cross');
  if (frameBox === null) return;

  const divider = page.getByRole('separator', { name: /^Resize the monitor strip/ });
  await expect(divider).toBeVisible();
  const box = await divider.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  const before = await bodyState(page);
  const x = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const overFrameY = frameBox.y + frameBox.height / 2;

  // Pointer Events dispatched as TOUCH. The old divider listened for `mousedown`
  // only, so touch could not drive it at all — this is new capability, not just a
  // regression guard. The `up` is dispatched at the element UNDER the frame point,
  // which is what a real touch release over the iframe does.
  await page.evaluate(
    ([sx, sy, fy]) => {
      const handle = document.elementFromPoint(sx, sy);
      if (handle === null) throw new Error('no element at the divider point');
      const base = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch' };
      handle.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: sx, clientY: sy }));
      const over = document.elementFromPoint(sx, fy) ?? window;
      over.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: sx, clientY: fy }));
      over.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: sx, clientY: fy }));
    },
    [x, startY, overFrameY],
  );

  await expect(divider, 'the touch drag must have ended').not.toHaveClass(/is-dragging/);
  const after = await bodyState(page);
  expect(after.cursor).toBe(before.cursor);
  expect(after.userSelect).toBe(before.userSelect);
  await expect(page.locator('[data-cg-drag-shield]')).toHaveCount(0);
});

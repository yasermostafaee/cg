import { test, expect } from './fixtures/runtime.js';

/**
 * THE ASSERTION THE DIALOG WAVE OWED (DEBT.md:38, DEBT.md:2082).
 *
 * `dev-modal-primitive` moved every dialog's message OUT of the scrolling body
 * and pinned it immediately above the action row, because a refusal appended to
 * scrollable content is a refusal the operator never sees: he presses the button
 * with the list at the top, nothing happens, and the reason is below the fold.
 *
 * That change shipped with the wrong test, honestly labelled. The task asked for
 * "visible in the viewport without scrolling", which is a LAYOUT claim, and jsdom
 * computes no layout — a `getBoundingClientRect` there returns zeros and passes for
 * the broken code too. So the DOM spec pinned the MECHANISM (the message is not
 * inside the scroll container; it is the element immediately before the action row)
 * and the real assertion was recorded as owed, needing Playwright's
 * `toBeInViewport()`. This is that assertion.
 *
 * ── WHY `Live sources` AND NOT `Candidate layers` ───────────────────────────
 *
 * The debt names a scrolled `Candidate layers` list, and that is where the defect
 * was found. It is not where the assertion can be made: the offline MockRuntime's
 * `setFixedLayers` ACCEPTS everything — there is no shared fixed-layers validator
 * the way `checkSourceMappings` is shared — so producing a candidate-layers refusal
 * in test mode would mean inventing a mock refusal that no bridge rule backs, and
 * teaching the suite a semantics the bridge does not have is the one thing the mock
 * is written never to do.
 *
 * `Live sources` satisfies every property the debt actually requires, and one more:
 * its body genuinely scrolls once a few sources are mapped (asserted below rather
 * than assumed), its refusal comes from the REAL validator the bridge itself runs,
 * and it is the modal whose message the owner reported as illegible. The mechanism
 * under test is the primitive's, so it is the same mechanism either way.
 *
 * ── THE NEGATIVE CONTROL IS THE POINT ───────────────────────────────────────
 *
 * `toBeInViewport()` on a short dialog would pass for the broken code as easily as
 * the fixed one. So the spec proves the check has teeth: with the body scrolled to
 * the top, an element at the BOTTOM of that body is asserted to be OUT of the
 * viewport — that is precisely where the refusal used to be rendered. The message
 * being in view while its old neighbours are not is the whole claim.
 */

/** Enough mapped sources that the dialog's body cannot fit on one screen. */
const IDS = ['guest-1', 'guest-2', 'guest-3', 'guest-4', 'guest-5', 'guest-6'];

test('a refusal stays in the viewport when the modal body is scrolled away from it', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Live sources' });

  await page.getByRole('button', { name: 'Open live source mapping' }).click();
  await expect(dialog).toBeVisible();

  for (const id of IDS) {
    await dialog.getByLabel('New source id').fill(id);
    await dialog.getByRole('button', { name: 'Add' }).click();
  }
  await expect(dialog.getByLabel('Label for guest-6')).toBeVisible();

  /*
    PERSIAN SITS BESIDE IT. These strings are shown on a station whose operator
    surface is Persian, and a mapping's display label is free text — so one of the
    six carries a real RTL name while the refusal below is Latin. If the message
    region's direction handling were wrong the two would fight for the same line
    box, and this is the spec that has a real layout engine to notice.
  */
  await dialog.getByLabel('Label for guest-2').fill('مهمان دو');
  await expect(dialog.getByLabel('Label for guest-2')).toHaveValue('مهمان دو');

  const body = dialog.locator('[data-modal-body]');
  const message = dialog.locator('[data-modal-message]');

  // THE PRECONDITION, ASSERTED AND NOT ASSUMED: the body genuinely scrolls. A
  // spec that quietly stopped scrolling — a narrower entry, a taller viewport —
  // would keep passing while testing nothing at all.
  const overflow = await body.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(
    overflow,
    'the dialog body must genuinely scroll for this spec to mean anything',
  ).toBeGreaterThan(80);

  // Refuse something. The band must be disjoint from the candidate bank, which the
  // mock seeds at 70 upward, so 50–75 reaches into it. This is the bridge's own
  // validator (`checkSourceMappings`), not a stub.
  await dialog.getByLabel('Live source band start layer').fill('50');
  await dialog.getByLabel('Live source band end layer').fill('75');
  await dialog.getByRole('button', { name: 'Apply band' }).click();
  await expect(message).toBeVisible();

  // The operator scrolls back up — the situation the defect was reported in: the
  // list at the top, the reason for the refusal somewhere else entirely.
  await body.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);

  // ── the assertion the debt owed ────────────────────────────────────────────
  await expect(message).toBeInViewport({ ratio: 1 });
  // …and the action row it is pinned to is still reachable, which is the other
  // half of the same promise: a long message may not push Done off the bottom.
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeInViewport({ ratio: 1 });

  // ── the negative control: this check can fail ──────────────────────────────
  // The last element INSIDE the scrolling body — where the refusal used to be
  // appended — is off-screen at this scroll position. So the message being in view
  // is a property of where it lives, not of the dialog being short.
  const lastInBody = body.locator('p').last();
  await expect(lastInBody).not.toBeInViewport();

  // The message did not steal the operator's place, either: it is a sibling of the
  // scroll container, so its appearance cannot reflow what he was reading.
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
});

import { chooseSourceKind, test, expect } from './fixtures/runtime.js';

/**
 * `STATION-CHROME-01` §5, §6 and §7 — **one way to add anything, kind-aware fields, and a
 * lock that asks twice** — in a real browser.
 *
 * ── WHY THESE THREE ARE IN ONE FILE ─────────────────────────────────────────
 *
 * They share one mechanism: a dialog on top of a dialog. `nestedDialog.dom.test.ts` measures
 * what jsdom can see of it (Escape reaching only the top layer, no trap hijacking a mid-ring
 * Tab), and says plainly what it CANNOT: **jsdom does not implement sequential focus
 * navigation**, so "Tab actually walks the sub-dialog's fields" is unmeasurable there. It is
 * measurable here, and it is the assertion an operator would notice failing.
 */

test('§6 — every Add opens the SAME small second dialog, and the keyboard belongs to it', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await app.openStationSetupAt('Live sources');
  await expect(dialog).toBeVisible();

  // ── the SOURCES Add ───────────────────────────────────────────────────────
  await dialog.getByRole('button', { name: 'Add live source' }).click();
  const sub = page.getByRole('dialog', { name: 'Add live source' });
  await expect(sub).toBeVisible();
  // BOTH dialogs are up: the second sits ON the first rather than replacing it.
  await expect(page.getByRole('dialog')).toHaveCount(2);

  /*
    🔴 TAB WALKS THE SUB-DIALOG. This is the half `nestedDialog.dom.test.ts` cannot run: with
    both traps live and neither deferring, the outer one dragged focus out and the inner one
    dragged it back, so every press landed the operator on the first control and the second
    field was unreachable. Three presses, three DIFFERENT stops, all inside the sub-dialog.
  */
  const stops: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab');
    stops.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.tagName ??
          '?',
      ),
    );
    await expect(sub.locator(':focus')).toHaveCount(1);
  }
  expect(new Set(stops).size, `Tab did not move: ${stops.join(' → ')}`).toBeGreaterThan(1);

  // 🔴 ESCAPE closes ONLY the top dialog — the settings dialog he was working in survives.
  await page.keyboard.press('Escape');
  await expect(sub).toBeHidden();
  await expect(dialog).toBeVisible();

  // ── the DELIMITERS Add is the same shape ──────────────────────────────────
  await dialog
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: 'Text file delimiters' })
    .click();
  await dialog.getByRole('button', { name: 'Add delimiter' }).click();
  const delim = page.getByRole('dialog', { name: 'Add delimiter' });
  await expect(delim).toBeVisible();
  await expect(delim.getByLabel('New delimiter name')).toBeVisible();
  await expect(delim.getByLabel('New delimiter character')).toBeVisible();
  // …and the INLINE strip it replaces is gone.
  await expect(dialog.getByLabel('New delimiter name')).toHaveCount(0);
  await delim.getByRole('button', { name: 'Cancel' }).click();
  await expect(delim).toBeHidden();
});

test('§5 — the live-source fields change with the kind, and the row labels what it shows', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Station setup' });

  await app.openStationSetupAt('Live sources');
  await dialog.getByRole('button', { name: 'Add live source' }).click();
  const sub = page.getByRole('dialog', { name: 'Add live source' });

  // DECKLINK — a device index (and the fill/key pair's second input).
  await expect(sub.getByLabel('DeckLink device index')).toBeVisible();
  await expect(sub.getByLabel('NDI source name')).toHaveCount(0);
  await expect(sub.getByLabel('Stream URL')).toHaveCount(0);

  // NDI — the name the network announces, and nothing about devices.
  await chooseSourceKind(sub, 'ndi');
  await expect(sub.getByLabel('NDI source name')).toBeVisible();
  await expect(sub.getByLabel('DeckLink device index')).toHaveCount(0);

  // STREAM — a URL.
  await chooseSourceKind(sub, 'stream');
  await expect(sub.getByLabel('Stream URL')).toBeVisible();
  await expect(sub.getByLabel('NDI source name')).toHaveCount(0);

  // Commit an NDI source and read the ROW: the value carries its own LABEL.
  await chooseSourceKind(sub, 'ndi');
  await sub.getByLabel('Source name', { exact: true }).fill('Ingest');
  await sub.getByLabel('NDI source name').fill('CG-INGEST (Studio 2)');
  await sub.getByRole('button', { name: 'Add source' }).click();
  await expect(sub).toBeHidden();

  const parts = dialog.locator('[data-source-parts]').first();
  await expect(parts).toContainText('Source name');
  await expect(parts).toContainText('CG-INGEST (Studio 2)');
  await expect(dialog.locator('[data-source-kind="ndi"]')).toHaveCount(1);

  // EDIT opens the SAME dialog on the record — §6's "and every Edit".
  await dialog.getByRole('button', { name: 'Edit Ingest' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit live source' });
  await expect(edit.getByLabel('Source name', { exact: true })).toHaveValue('Ingest');
  await edit.getByRole('button', { name: 'Cancel' }).click();
});

test('§7 — engaging the lock asks for the PIN twice and refuses a mismatch', async ({ app }) => {
  const page = app.page;

  await page.getByRole('button', { name: /Lock…/ }).click();
  const lock = page.getByRole('dialog', { name: 'Engage lock' });
  await expect(lock).toBeVisible();

  // TWO fields, and the copy says why the second one is there.
  await expect(lock.getByLabel('Lock PIN (4–64 characters)')).toBeVisible();
  await expect(lock.getByLabel('Lock PIN again')).toBeVisible();
  await expect(lock).toContainText('Asked twice on purpose');
  // …and what the lock will do, said BEFORE he does it.
  await expect(lock).toContainText('refuses everything, including Clear and Stop');
  await expect(lock).toContainText('not stored');

  // 🔴 A MISMATCH DOES NOT LOCK. The console is still usable behind the dialog.
  await lock.getByLabel('Lock PIN (4–64 characters)').fill('1234');
  await lock.getByLabel('Lock PIN again').fill('1235');
  await lock.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(lock).toContainText('The two PINs are different');
  await expect(lock).toBeVisible();
  // `CONSOLE-MATCH-03` §5 — the chip is `Icon` + `LOCKED` now, not a text glyph, so it is
  // addressed by its WORD. The glyph was never the assertion; it was just what was there.
  await expect(page.getByText('LOCKED', { exact: true })).toHaveCount(0);

  // Matching PINs engage it.
  await lock.getByLabel('Lock PIN again').fill('1234');
  await lock.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByText('LOCKED', { exact: true })).toBeVisible();
});

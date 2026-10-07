import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures/designer.js';
import { guardDialog, importAndDragLongClip } from './fixtures/longClip.js';

/**
 * B-319 (`dialog-footer-fit`) — A DIALOG'S BUTTONS STAY INSIDE THE DIALOG.
 *
 * The owner's 0.11.3: the clip dialog's three buttons were wider than its 440 px card, the
 * footer was a `nowrap` row packed to its end, and `Cancel` was painted outside the card's left
 * edge. The fix lives in the shared footer (`features/shell/Modal`): one row while one row holds
 * the buttons — the look it always had — and a column of full-width buttons when it does not.
 *
 * MEASURED IN CHROMIUM, never in jsdom (golden rule 12c): jsdom has no layout, so a box
 * assertion there passes against a footer of any shape, including the broken one.
 *
 * THE AXES, and why these and not others:
 *  - the SMALLEST WINDOW, and there are two floors: the desktop window's 1100 × 700
 *    (`src-tauri/tauri.conf.json`) and the app's own 1024 × 640 (`MIN_APP_WIDTH` /
 *    `MIN_APP_HEIGHT` in `App.tsx`, below which the Designer shows its too-small notice
 *    instead of the studio). Both are measured.
 *  - a LARGE TEXT SCALE, as the ROOT FONT SIZE at 150 % and 200 %. That is the axis that
 *    breaks a footer: the Designer sizes its labels in `rem` and its dialogs in `px`, so a
 *    larger default font size (the browser's or the WebView's setting) grows the buttons and
 *    not the card. `deviceScaleFactor` is NOT used — it changes the raster and not CSS layout,
 *    so it would measure nothing. PAGE ZOOM is not an axis here either: to layout it is a
 *    narrower CSS viewport, and any zoom past ~107 % at the smallest window takes the viewport
 *    under the app's own 1024 × 640 floor, where no dialog is shown at all.
 */

const SMALLEST = [
  { width: 1100, height: 700 },
  { width: 1024, height: 640 },
] as const;
const TEXT_SCALES = ['150%', '200%'] as const;

async function setTextScale(page: Page, scale: string): Promise<void> {
  await page.evaluate((s) => {
    document.documentElement.style.fontSize = s;
  }, scale);
}

/**
 * Every button whose box is not inside the dialog's box, described — one snapshot, read in the
 * page. Half a pixel of allowance for sub-pixel layout; nothing else.
 */
async function buttonsOutside(dialog: Locator): Promise<string[]> {
  return dialog.evaluate((d) => {
    const frame = d.getBoundingClientRect();
    const out: string[] = [];
    for (const b of Array.from(d.querySelectorAll('button'))) {
      const r = b.getBoundingClientRect();
      const name = (b.textContent ?? '').trim() || (b.getAttribute('aria-label') ?? '?');
      const past = (side: string, by: number): void => {
        if (by > 0.5) out.push(`${name}: ${by.toFixed(1)} px past the ${side} edge`);
      };
      past('left', frame.left - r.left);
      past('right', r.right - frame.right);
      past('top', frame.top - r.top);
      past('bottom', r.bottom - frame.bottom);
    }
    return out;
  });
}

interface FooterLayout {
  /** `row` — one line; `stack` — one button per line, full width; `mixed` — neither. */
  form: 'row' | 'stack' | 'mixed';
  names: string[];
  /** Gaps between neighbours along the row (row form only). */
  gaps: number[];
  /** How far the last button's right edge sits from the footer's content edge. */
  endInset: number;
  widths: number[];
  contentWidth: number;
}

/** The footer is the action buttons' own row: the parent of `Cancel`. */
async function footerLayout(dialog: Locator): Promise<FooterLayout> {
  return dialog.getByRole('button', { name: 'Cancel', exact: true }).evaluate((cancel) => {
    const row = cancel.parentElement as HTMLElement;
    const cs = getComputedStyle(row);
    const box = row.getBoundingClientRect();
    const contentLeft = box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const contentRight = box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    const kids = Array.from(row.children).map((c) => ({
      name: (c.textContent ?? '').trim(),
      r: c.getBoundingClientRect(),
    }));
    const near = (a: number, b: number): boolean => Math.abs(a - b) <= 0.5;
    const first = kids[0]?.r;
    const last = kids[kids.length - 1]?.r;
    const oneLine = kids.every((k) => first !== undefined && near(k.r.top, first.top));
    const stacked =
      kids.length > 1 &&
      kids.every((k, i) => i === 0 || k.r.top >= (kids[i - 1]?.r.bottom ?? 0) - 0.5) &&
      kids.every((k) => near(k.r.left, contentLeft) && near(k.r.right, contentRight));
    return {
      form: oneLine ? 'row' : stacked ? 'stack' : 'mixed',
      names: kids.map((k) => k.name),
      gaps: kids.slice(1).map((k, i) => k.r.left - (kids[i]?.r.right ?? 0)),
      endInset: contentRight - (last?.right ?? 0),
      widths: kids.map((k) => k.r.width),
      contentWidth: contentRight - contentLeft,
    };
  });
}

/** The look the footer always had while it fits: one line, in order, 0.4rem apart, at the end. */
async function expectOneRow(dialog: Locator, names: readonly string[]): Promise<void> {
  await expect.poll(async () => (await footerLayout(dialog)).form).toBe('row');
  const row = await footerLayout(dialog);
  expect(row.names).toEqual(names);
  const gap = await dialog.page().evaluate(() => {
    return 0.4 * parseFloat(getComputedStyle(document.documentElement).fontSize);
  });
  for (const g of row.gaps) expect(g, 'buttons keep the footer’s 0.4rem gap').toBeCloseTo(gap, 0);
  expect(Math.abs(row.endInset), 'the row stays packed to the end').toBeLessThanOrEqual(0.5);
}

/** A column of full-width buttons, in DOM order — Cancel first, the primary last. */
async function expectStack(dialog: Locator, names: readonly string[]): Promise<void> {
  await expect.poll(async () => (await footerLayout(dialog)).form).toBe('stack');
  const stack = await footerLayout(dialog);
  expect(stack.names).toEqual(names);
}

const CLIP_BUTTONS = ['Cancel', 'Add as backdrop', 'Extend the composition'] as const;
const SAVE_BUTTONS = ['Cancel', 'Discard', 'Save…'] as const;

test.describe('B-319 — a dialog’s buttons stay inside the dialog', () => {
  for (const size of SMALLEST) {
    const at = `${String(size.width)} × ${String(size.height)}`;
    test(`the clip dialog: one row inside the card at ${at}`, async ({ app }) => {
      await app.page.setViewportSize(size);
      await app.newProject('Footer fit');
      await importAndDragLongClip(app);
      const dialog = guardDialog(app);
      await expect(dialog).toBeVisible();

      // The owner's defect, measured first: every button inside the card.
      await expect.poll(() => buttonsOutside(dialog)).toEqual([]);
      await expectOneRow(dialog, CLIP_BUTTONS);
      // The long form is not lost: it is the shortened button's title.
      await expect(dialog.getByRole('button', { name: 'Add as backdrop' })).toHaveAttribute(
        'title',
        'Add as backdrop — follow the composition',
      );
    });
  }

  test('the clip dialog: at 150 % and 200 % text the buttons stack inside the card, and a row returns at 100 %', async ({
    app,
  }) => {
    await app.page.setViewportSize(SMALLEST[0]);
    await app.newProject('Footer fit text');
    await importAndDragLongClip(app);
    const dialog = guardDialog(app);
    await expect(dialog).toBeVisible();

    for (const scale of TEXT_SCALES) {
      // Changed with the dialog OPEN: the footer must follow a change, not only an opening.
      await setTextScale(app.page, scale);
      await expect
        .poll(() => buttonsOutside(dialog), { message: `every button inside at ${scale}` })
        .toEqual([]);
      await expectStack(dialog, CLIP_BUTTONS);
    }

    await setTextScale(app.page, '100%');
    await expect.poll(() => buttonsOutside(dialog)).toEqual([]);
    await expectOneRow(dialog, CLIP_BUTTONS);
  });

  test('Save before switch: inside the card at 200 % and 150 % text, one row at 100 %', async ({
    app,
  }) => {
    await app.newProject('Footer fit save');
    // Dirty, so Home asks first. Drawn at the default viewport: at 1024 × 640 the canvas centre
    // the helper clicks is under the playback transport.
    await app.addRectangle();
    await app.page.setViewportSize(SMALLEST[1]);
    // Scaled BEFORE the dialog opens: the footer must be right on its first frame too.
    await setTextScale(app.page, '200%');
    await app.page.getByRole('button', { name: 'Home', exact: true }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Save before switch' });
    await expect(dialog).toBeVisible();

    for (const scale of ['200%', '150%'] as const) {
      await setTextScale(app.page, scale);
      await expect
        .poll(() => buttonsOutside(dialog), { message: `every button inside at ${scale}` })
        .toEqual([]);
    }

    await setTextScale(app.page, '100%');
    await expect.poll(() => buttonsOutside(dialog)).toEqual([]);
    await expectOneRow(dialog, SAVE_BUTTONS);
  });
});

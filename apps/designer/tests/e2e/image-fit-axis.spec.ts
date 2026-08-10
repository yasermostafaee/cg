import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * D-149 — the image element's `fit` control gains **fit width** / **fit height**,
 * and `none` is relabelled **original** without its stored value changing.
 *
 * Maps `openspec/changes/designer-image-fit-axis/specs/designer-image-element/spec.md`,
 * one `test` per `#### Scenario` that has a UI to drive:
 *
 *   - "Fit width scales the width and clips the overflow"
 *   - "Fit height is the mirror"
 *   - "`none` is labelled original and stores `none`"
 *   - "A pre-existing fit mode renders exactly as before"
 *
 * The byte-identity proof for every pre-existing mode is NOT here and cannot be:
 * it compares the built DOM against a golden captured before the change, which is
 * `packages/template-runtime/tests/image-fit.test.ts`. This spec drives the
 * CONTROL and asserts what the real browser actually renders.
 */

/** The `fit` select in the Inspector's Image section. */
const fitSelect = (app: DesignerApp) => app.page.getByLabel('fit', { exact: true });

/** The single image element rendered in the canvas preview iframe. */
const imageEl = (app: DesignerApp) => app.canvasFrame.locator('[data-cg-element-id]').first();

async function placeAnImage(app: DesignerApp): Promise<void> {
  await app.newProject('Fit');
  await app.addSharedImage('emblem.png');
  await app.selectSharedImage('emblem');
  await app.placeLogo({ x: 240, y: 200 });
  await expect.poll(() => app.canvasImageCount()).toBe(1);
}

test.describe('D-149 — image fit width / height', () => {
  test('the control offers both new options, and `none` reads "original"', async ({ app }) => {
    await placeAnImage(app);

    // The four pre-existing options plus the two new ones, and `none` shown
    // under its new LABEL. The stored value is asserted below.
    await expect(fitSelect(app).locator('option')).toHaveText([
      'contain',
      'cover',
      'fill',
      'original',
      'fit width',
      'fit height',
    ]);
  });

  test('choosing "original" stores `none` — a label, never a schema change', async ({ app }) => {
    await placeAnImage(app);

    await fitSelect(app).selectOption({ label: 'original' });

    // The VALUE behind the label is untouched, which is the whole point: every
    // scene ever saved carries `none`, so a renamed stored value would be a
    // migration bought for a word.
    await expect(fitSelect(app)).toHaveValue('none');
    await expect
      .poll(() => imageEl(app).evaluate((el) => getComputedStyle(el).objectFit))
      .toBe('none');
  });

  test('fit width pins the width to the box and clips the overflow', async ({ app }) => {
    await placeAnImage(app);

    await fitSelect(app).selectOption({ label: 'fit width' });
    await expect(fitSelect(app)).toHaveValue('fit-width');

    // The element the scene owns is still the authored box, and it clips.
    const box = imageEl(app);
    await expect.poll(() => box.evaluate((el) => getComputedStyle(el).overflow)).toBe('hidden');

    // The image inside is width-pinned with a free height.
    const img = box.locator('img');
    await expect(img).toHaveCount(1);
    const geom = await img.evaluate((el) => {
      const cs = getComputedStyle(el);
      const parent = (el.parentElement as HTMLElement).getBoundingClientRect();
      const own = el.getBoundingClientRect();
      return {
        position: cs.position,
        // Rounded: the canvas renders under a fractional zoom transform.
        sameWidth: Math.abs(own.width - parent.width) < 1.5,
        assetId: el.getAttribute('data-cg-asset-id'),
      };
    });
    expect(geom.position).toBe('absolute');
    expect(geom.sameWidth).toBe(true);
    // Every host resolves the src by walking `img[data-cg-asset-id]`; if this
    // moved to the wrapper the image would be permanently blank on air.
    expect(geom.assetId).not.toBeNull();
  });

  test('fit height is the mirror — the height matches the box', async ({ app }) => {
    await placeAnImage(app);

    await fitSelect(app).selectOption({ label: 'fit height' });
    await expect(fitSelect(app)).toHaveValue('fit-height');

    const box = imageEl(app);
    const img = box.locator('img');
    await expect(img).toHaveCount(1);
    const sameHeight = await img.evaluate((el) => {
      const parent = (el.parentElement as HTMLElement).getBoundingClientRect();
      return Math.abs(el.getBoundingClientRect().height - parent.height) < 1.5;
    });
    expect(sameHeight).toBe(true);
  });

  test('a pre-existing mode still renders as a BARE <img> — no wrapper appears', async ({
    app,
  }) => {
    await placeAnImage(app);

    // The on-air guarantee, driven through the real control: switching away from
    // a new mode must leave the DOM exactly as a template that never used one.
    for (const [label, value] of [
      ['contain', 'contain'],
      ['cover', 'cover'],
      ['fill', 'fill'],
      ['original', 'none'],
    ] as const) {
      await fitSelect(app).selectOption({ label });
      await expect(fitSelect(app)).toHaveValue(value);
      // Polled, not read once: the canvas iframe repaints asynchronously after
      // the commit, so a single read races the re-render rather than the change.
      await expect
        .poll(() => imageEl(app).evaluate((el) => getComputedStyle(el).objectFit), {
          message: label,
        })
        .toBe(value);
      const shape = await imageEl(app).evaluate((el) => ({
        tag: el.tagName,
        children: el.children.length,
      }));
      expect(shape.tag, label).toBe('IMG');
      expect(shape.children, label).toBe(0);
    }
  });

  test('switching from a new mode back to a pre-existing one restores the bare <img>', async ({
    app,
  }) => {
    await placeAnImage(app);

    await fitSelect(app).selectOption({ label: 'fit width' });
    await expect.poll(() => imageEl(app).evaluate((el) => el.tagName)).toBe('DIV');

    await fitSelect(app).selectOption({ label: 'contain' });
    // Not merely "a div with different styles" — the wrapper is GONE.
    await expect.poll(() => imageEl(app).evaluate((el) => el.tagName)).toBe('IMG');
    await expect.poll(() => imageEl(app).evaluate((el) => el.children.length)).toBe(0);
  });
});

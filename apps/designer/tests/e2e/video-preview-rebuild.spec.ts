import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures/designer.js';
import type { FrameLocator, Page } from '@playwright/test';

/**
 * B-137 — A VIDEO MUST KEEP PLAYING ACROSS A PREVIEW REBUILD.
 *
 * The mechanism, in one line: the preview iframe transplants the OLD `<video>`
 * DOM node back over the freshly built one after every in-iframe rebuild
 * (`preview.ts` `reconcileVideos`), but nothing re-pointed the newly built
 * `VideoDriver` at it. The driver ended up commanding a DETACHED, src-less
 * orphan while the node the operator can SEE was the one the previous driver
 * explicitly paused during teardown — and no code path ever played that one
 * again. Reopening the preview was the only cure, because a fresh document
 * starts with an empty `videoPool` and never takes the transplant branch.
 *
 * WHY THIS SPEC EXISTS WHEN `video-import.spec.ts` ALREADY PINS THE TRANSPLANT.
 * That one asserts against the CANVAS iframe, which never plays, and it asserts
 * node IDENTITY and `currentTime` — never `!paused` AFTER a rebuild. Those are
 * different claims: a node can survive a rebuild, keep its `src`, keep a
 * non-zero `currentTime` from before, and still be frozen. This spec asserts
 * the thing the operator actually reports, on the surface that actually plays.
 *
 * WHY THE SECOND `play()` IS PART OF THE TEST, NOT A WORKAROUND. A rebuild returns
 * the preview to its pending (blank, armed) state — the modal is a BROADCAST surface,
 * so it deliberately shows nothing until play (`REVEAL_ON_LOAD` is false there).
 * Everything on the scene is therefore stopped after a rebuild, and a video sitting
 * paused at THAT instant is correct, not a bug. The defect is what happens on the NEXT
 * play: every other element starts, and the video does not. That is precisely the
 * owner's report — "it plays again only after CLOSING the preview and opening it
 * anew", i.e. pressing play does NOT cure it — and it is the shape B-137's own
 * regression-test note specifies: play, post a rebuild, play again, then assert.
 *
 * THE GESTURE IS THE REPORTED ONE, not a synthetic message. Changing a ticker's
 * `cycle seam` in the PREVIEW MODAL's own timing controls is exactly what the
 * owner did; it writes a session override, which posts `scene-replace`, which is
 * the rebuild. Driving the real control keeps this a test of the product rather
 * than of a seam.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'box-64x64-bgra.avi');

/**
 * Is the VISIBLE video actually advancing?
 *
 * Sampled over a real interval rather than read once, because `paused === false`
 * alone does not mean moving: an orphaned element can report `!paused` while its
 * `currentTime` never changes. B-137 is a FROZEN PICTURE, so the assertion has
 * to be about motion. `:not([hidden])` is not enough either — the pooled node and
 * the detached fresh one share every attribute, so the query is scoped to the
 * live DOCUMENT, which only the attached one is in.
 */
async function sampleVisibleVideo(
  frame: FrameLocator,
): Promise<{ paused: boolean; advanced: number; connected: boolean }> {
  return frame
    .locator('video[data-cg-element-id]')
    .first()
    .evaluate(
      async (v: HTMLVideoElement) =>
        await new Promise((resolve) => {
          const t0 = v.currentTime;
          setTimeout(() => {
            resolve({
              paused: v.paused,
              advanced: v.currentTime - t0,
              connected: v.isConnected,
            });
          }, 900);
        }),
    );
}

/** Import + place the 64×64 fixture through the real modal (the proven fast path). */
async function importAndPlaceVideo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Project assets' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Video…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'box-64x64-bgra.avi',
    mimeType: 'video/x-msvideo',
    buffer: readFileSync(FIXTURE),
  });
  await expect(page.locator('[data-testid="video-probe-meta"]')).toContainText('64×64');
  await page.getByRole('button', { name: 'Convert & import' }).click();
  await page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();
}

test('a playing video SURVIVES a preview rebuild — the driver follows the node the operator can see', async ({
  app,
  page,
}) => {
  await app.newProject('VideoPreviewRebuild');
  // D-151 — the add-time duration guard fires when content outsizes the host; size the host to FIT this spec’s clip so its own subject stays under test.
  await app.setSceneDuration(250);
  await importAndPlaceVideo(page);

  // A ticker beside it — the companion from the report, and what puts the
  // `cycle seam` control in the modal at all.
  await app.addTicker();

  await app.openPreviewModal();
  const frame = app.previewFrame;
  await expect(frame.locator('video[data-cg-element-id]')).toBeAttached({ timeout: 15_000 });

  // ---- BEFORE: it plays. Establishes that the rest of the test means something. ----
  await app.play();
  const before = await sampleVisibleVideo(frame);
  expect(before.paused, 'the video plays BEFORE any rebuild').toBe(false);
  expect(before.advanced, 'currentTime advances BEFORE any rebuild').toBeGreaterThan(0);

  // ---- THE REBUILD: the owner's exact gesture, mid-playback ----
  await app.previewDialog
    .getByRole('combobox', { name: /ticker cycle boundary/ })
    .first()
    .selectOption('drain');

  // ---- AFTER: play again. Everything else starts; the video must start too. ----
  await app.play();
  const after = await sampleVisibleVideo(frame);
  expect(after.connected, 'the sampled node is the one in the live document').toBe(true);
  expect(after.paused, 'B-137 — the video froze after the preview rebuild').toBe(false);
  expect(
    after.advanced,
    'B-137 — the visible video is not advancing after the preview rebuild',
  ).toBeGreaterThan(0);
});

/**
 * B-137 EXPERIMENT 2 — **the decisive one, and it CLOSES the item's open question.**
 *
 * The item filed an unresolved question: is the trigger (A) any ANIMATING element,
 * or (B) only a timeline/lifecycle DRIVER? Every known-good companion was static and
 * every known-bad one was time-driven, so the reported observations could not separate
 * them. Code review proposed a third answer that would dissolve both — that what matters
 * is neither animation nor driving, but simply **what forces a scene rebuild**.
 *
 * This is that experiment. There is NO ticker and NO Lottie on the scene: a video, alone.
 * The only thing that happens is a preview TIMING knob changing, which writes a session
 * override and posts `scene-replace`. If the video freezes here, the companion element
 * was never the variable — the REBUILD was — and readings (A) and (B) are both dissolved.
 *
 * Pre-fix this failed exactly as the paired test above did, with no animating companion
 * anywhere on the scene. That is the evidence; see B-137 in `docs/prd/bugs-designer.md`.
 */
test('EXPERIMENT 2 — a video ALONE freezes on a rebuild too: the trigger is the rebuild, not the companion', async ({
  app,
  page,
}) => {
  await app.newProject('VideoAloneRebuild');
  // D-151 — the add-time duration guard fires when content outsizes the host; size the host to FIT this spec’s clip so its own subject stays under test.
  await app.setSceneDuration(250);
  await importAndPlaceVideo(page);
  // An out-point so the preview's own timing knobs render at all. It adds no
  // animating element — the scene is still a video and nothing else.
  await app.addOutPoint();

  await app.openPreviewModal();
  const frame = app.previewFrame;
  await expect(frame.locator('video[data-cg-element-id]')).toBeAttached({ timeout: 15_000 });

  // FIRST PLAY IS CLEAN — no session override has been set yet, so this build is the
  // one the modal made on open and the driver holds the node it built. Establishing a
  // genuinely playing baseline matters: a rebuild BEFORE the first play would strand
  // the driver just the same, and the test would then fail in its own setup instead of
  // demonstrating "plays, then a rebuild freezes it".
  await app.play();
  const before = await sampleVisibleVideo(frame);
  expect(before.paused, 'the lone video plays BEFORE any rebuild').toBe(false);
  expect(before.advanced, 'currentTime advances BEFORE any rebuild').toBeGreaterThan(0);

  // THE REBUILD — preview timing knobs, mid-playback, with no ticker and no Lottie in
  // sight. The long hold is not incidental: it parks the composition ON AIR for the
  // whole sample window, so an auto-out completing cannot masquerade as the freeze.
  const mode = app.previewDialog.getByRole('combobox', { name: 'Preview playout mode' }).first();
  await mode.selectOption('auto-out');
  const hold = app.previewDialog
    .getByLabel('Preview hold duration in milliseconds', { exact: true })
    .first();
  await hold.fill('60000');
  await hold.blur();

  await app.play();
  const after = await sampleVisibleVideo(frame);
  expect(after.connected, 'the sampled node is the one in the live document').toBe(true);
  expect(after.paused, 'B-137 — a LONE video froze on a rebuild').toBe(false);
  expect(
    after.advanced,
    'B-137 — the lone video is not advancing after the rebuild',
  ).toBeGreaterThan(0);
});

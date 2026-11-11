import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';
import { toneWav } from './fixtures/sound.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-G` — **THE TIMELINE'S PLAY IS HEARD.** The owner placed a sound
 * (`At the entrance`) in a 1 s composition and pressed Play under the canvas: silence. The Preview
 * played it; the timeline never did — the canvas page was only ever SEEKED, frame by frame, and a
 * seek starts no sound (measured on a normal Chrome before the fix: the canvas page's `<audio>` stayed
 * paused at 0 through the whole playback).
 *
 * Now: Play on the timeline plays each sound at its place, through the page's own audio graph;
 * scrubbing and stepping stay silent; and ONE sound switch, ON by default, is shared by the timeline
 * and the Preview, its state always shown. No autoplay-relaxing flag: the bundled Chromium in CI and
 * the system Chrome locally start with Chrome's own policy.
 */

async function placeSound(page: Page): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Audio…', exact: true }).click();
  await (
    await chooser
  ).setFiles([{ name: 'bubbly.wav', mimeType: 'audio/wav', buffer: toneWav(3) }]);
  await expect
    .poll(
      async () =>
        page.evaluate(
          async () => (await window.cg.assets.list()).filter((a) => a.kind === 'audio').length,
        ),
      { timeout: 60_000 },
    )
    .toBe(1);
  await page.evaluate(async () => {
    const a = (await window.cg.assets.list()).find((x) => x.kind === 'audio');
    const canvas = document.querySelector('[data-testid="canvas-surface"]');
    if (a === undefined || canvas === null) return;
    const dt = new DataTransfer();
    dt.setData('application/x-cg-asset-id', a.assetId);
    dt.setData('application/x-cg-asset-kind', a.kind);
    for (const type of ['dragover', 'drop']) {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      canvas.dispatchEvent(ev);
    }
  });
}

/** The canvas page's sound: is it playing, and where is it. */
async function canvasSound(page: Page): Promise<{ paused: boolean; t: number }> {
  return page
    .frameLocator('iframe[title="cgpreview"]')
    .locator('audio[data-cg-element-id]')
    .evaluate((a: HTMLAudioElement) => ({ paused: a.paused, t: a.currentTime }));
}

test.describe('🔴 DELTA-G — a sound is heard on the timeline’s Play', () => {
  test('Play under the canvas plays the sound at its place and stops with the playhead; a step is silent', async ({
    app,
    page,
  }) => {
    test.setTimeout(120_000);
    await app.newProject('TimelineSound');
    await app.setSceneDuration(150);
    await page.getByRole('button', { name: 'Project assets' }).click();
    await placeSound(page);
    await expect(app.inspector.getByTestId('audio-length')).toContainText(' s');
    // Shortening the composition can still leave a 3 s sound on a 1 s timeline.
    await app.setSceneDuration(50);

    // Positive control: the canvas page is up and carries the sound, paused — so a silent result
    // below is the timeline's, never a page that failed to load.
    await expect(
      page.frameLocator('iframe[title="cgpreview"]').locator('audio[data-cg-element-id]'),
    ).toHaveCount(1);
    expect((await canvasSound(page)).paused).toBe(true);

    const transport = page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Go to start' }).click();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    // 🔴 Heard: the canvas page's sound is PLAYING, and moving.
    await expect.poll(async () => (await canvasSound(page)).paused, { timeout: 2_000 }).toBe(false);
    await expect
      .poll(async () => (await canvasSound(page)).t, { timeout: 2_000 })
      .toBeGreaterThan(0.2);
    // The timeline stops at its end (1 s) and the sound stops with it — an editing tool's Play.
    await expect.poll(async () => (await canvasSound(page)).paused, { timeout: 4_000 }).toBe(true);

    // Stepping is not playing: silent.
    await transport.getByRole('button', { name: 'Go to start' }).click();
    await transport.getByRole('button', { name: 'Step forward' }).click();
    await page.waitForTimeout(300);
    expect((await canvasSound(page)).paused).toBe(true);
  });

  test('ONE sound switch, on by default, shared by the timeline and the Preview — its state always shown', async ({
    app,
    page,
  }) => {
    test.setTimeout(120_000);
    await app.newProject('SharedSound');
    await app.setSceneDuration(150);
    await page.getByRole('button', { name: 'Project assets' }).click();
    await placeSound(page);

    const sound = page.getByTestId('transport-sound');
    await expect(sound).toHaveText('Sound on');
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    await sound.click();
    await expect(sound).toHaveText('Sound off');

    // The Preview shows the SAME switch, off…
    await app.openPreviewModal();
    const previewSound = app.previewDialog.getByTestId('preview-sound');
    await expect(previewSound).toHaveText('Sound off');
    await expect(previewSound).toHaveAttribute('aria-pressed', 'false');
    // …and turning it on there turns it on under the canvas.
    await previewSound.click();
    await expect(previewSound).toHaveText('Sound on');
    await page.keyboard.press('Escape');
    await expect(sound).toHaveText('Sound on');
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator } from '@playwright/test';
import { expect, test, type DesignerApp } from './fixtures/designer.js';

/**
 * D-176 — the real Inspector has one phase-authoring path for an unmarked media clip. This spec
 * also proves the compatibility path: Detach exposes manual inputs, while Follow ignores media
 * markers and reads Freeze/Loop from the composition Playback section.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO_FIXTURE = join(HERE, 'fixtures', 'box-64x64-bgra.avi');

function lottie(markers: { tm: number; cm: string; dr: number }[] = []): string {
  return JSON.stringify({
    v: '5.7.0',
    fr: 30,
    ip: 0,
    op: 60,
    w: 200,
    h: 100,
    nm: 'timing-fixture',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 1,
        nm: 'solid',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [100, 50, 0] },
          a: { a: 0, k: [100, 50, 0] },
          s: { a: 0, k: [100, 100, 100] },
        },
        ao: 0,
        sw: 200,
        sh: 100,
        sc: '#33aadd',
        ip: 0,
        op: 60,
        st: 0,
        bm: 0,
      },
    ],
    markers,
  });
}

/** A moving solid makes the held picture observable, not just the controller's telemetry. */
function movingLottie(): string {
  return JSON.stringify({
    v: '5.7.0',
    fr: 50,
    ip: 0,
    op: 120,
    w: 200,
    h: 100,
    nm: 'freeze-parity',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 1,
        nm: 'moving-solid',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          p: {
            a: 1,
            k: [
              {
                t: 0,
                s: [10, 50, 0],
                e: [190, 50, 0],
                o: { x: 0.33, y: 0.33 },
                i: { x: 0.67, y: 0.67 },
              },
              { t: 120, s: [190, 50, 0] },
            ],
          },
          a: { a: 0, k: [10, 50, 0] },
          s: { a: 0, k: [100, 100, 100] },
        },
        ao: 0,
        sw: 20,
        sh: 100,
        sc: '#33aadd',
        ip: 0,
        op: 120,
        st: 0,
        bm: 0,
      },
    ],
  });
}

const paintedX = (svg: Locator): Promise<number> =>
  svg.evaluate((node) => (node as SVGGraphicsElement).getBBox().x);

async function createMovingFollowProject(app: DesignerApp, name: string): Promise<number> {
  await createFollowProject(app, name);
  await app.dragContentStartMarkerToFraction(0.2);
  await importAndPlace(app, 'freeze-parity.json', movingLottie());
  await app.inspector.getByRole('button', { name: 'Follow composition' }).click();
  await app.deselect();
  const outText = await app.inspector
    .getByText('Outro start', { exact: true })
    .locator('..')
    .textContent();
  const outPoint = Number(/frame\s+(\d+)/i.exec(outText ?? '')?.[1]);
  expect(outPoint).toBeGreaterThan(60);
  expect(outPoint).toBeLessThan(150);
  return outPoint;
}

async function importAndPlace(app: DesignerApp, filename: string, body: string): Promise<void> {
  await app.page.getByRole('button', { name: 'Project assets', exact: true }).click();
  await app.page.getByRole('button', { name: 'Add asset', exact: true }).click();
  const chooser = app.page.waitForEvent('filechooser');
  await app.page.getByRole('menuitem', { name: /Lottie/ }).click();
  await (
    await chooser
  ).setFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(body) });

  const tile = app.page
    .locator('aside[aria-label="Project assets"] [draggable="true"]')
    .filter({ hasText: filename.replace(/\.json$/, '') })
    .first();
  await expect(tile).toBeVisible();
  await tile.dragTo(app.canvas, { targetPosition: { x: 220, y: 130 } });
  await expect(app.inspector.getByText('Lottie', { exact: false })).toBeVisible();
}

async function importAndPlaceVideo(app: DesignerApp): Promise<void> {
  await app.page.getByRole('button', { name: 'Project assets', exact: true }).click();
  const chooser = app.page.waitForEvent('filechooser');
  await app.page
    .getByRole('button', { name: 'Add asset', exact: true })
    .dispatchEvent('pointerdown');
  await app.page.getByRole('menuitem', { name: 'Video…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'timing-video.avi',
    mimeType: 'video/x-msvideo',
    buffer: readFileSync(VIDEO_FIXTURE),
  });
  await expect(app.page.getByTestId('video-probe-meta')).toContainText('64×64');
  const advanced = app.page.getByTestId('video-advanced-corrections');
  await expect(app.page.getByTestId('video-crop-toggle')).toBeVisible();
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(app.page.getByTestId('video-premultiplied-toggle')).not.toBeVisible();
  await advanced.locator('summary').click();
  await expect(app.page.getByTestId('video-premultiplied-toggle')).toBeVisible();
  await advanced.locator('summary').click();
  await app.page.getByRole('button', { name: 'Convert & import' }).click();
  await app.page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
  await expect(app.page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();
  await expect(app.inspector.getByText('Video', { exact: true })).toBeVisible();
}

async function createFollowProject(app: DesignerApp, name: string): Promise<void> {
  await app.newProject(name);
  await app.setSceneDuration(150);
  await app.addOutPoint();
  // Pin before placing media, then place the marker at frame zero. Pinning alone captures the
  // current automatic entrance-settle value, which is intentionally not assumed by this test.
  await app.inspector.getByRole('button', { name: 'Set hold start' }).click();
  await app.dragContentStartMarkerToFraction(0);
}

test('Static video Hold can repeat or play once without adding an Outro marker', async ({
  app,
}) => {
  await app.newProject('Static logo playback');
  await app.setSceneDuration(100);
  await importAndPlaceVideo(app);
  await app.inspector.getByRole('button', { name: 'Follow composition', exact: true }).click();
  await expect(app.inspector.getByTestId('follow-no-anchors')).toBeVisible();
  await expect(app.inspector.getByRole('combobox', { name: 'On hold' })).toHaveCount(0);
  await app.deselect();

  const onHold = app.inspector.getByRole('combobox', { name: 'On hold' });
  await expect(onHold).toHaveValue('freeze');
  await onHold.selectOption({ label: 'Loop media' });
  const repeats = app.inspector.getByRole('checkbox', { name: 'Video repeats during Hold' });
  await expect(repeats).toBeChecked();

  const video = app.canvasFrame.locator('video[data-cg-element-id]').first();
  const transport = app.page.getByLabel('Playback transport');
  const play = transport.getByRole('button', { name: 'Play', exact: true });
  const stop = transport.getByRole('button', { name: 'Stop', exact: true });
  await transport.getByRole('button', { name: 'Rehearse preview' }).click();
  await play.click();
  await expect
    .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.9);
  await expect
    .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
    .toBeLessThan(0.6);
  await stop.click();

  await repeats.uncheck();
  await play.click();
  await expect
    .poll(() =>
      video.evaluate((node) => {
        const media = node as HTMLVideoElement;
        return media.paused && media.currentTime >= media.duration - 0.08;
      }),
    )
    .toBe(true);
  await stop.click();

  await onHold.selectOption('freeze');
  await expect(repeats).toHaveCount(0);
});

test('B-431 — a Follow video holds its closing frame while plain text finishes fading', async ({
  app,
}) => {
  test.setTimeout(55_000);
  await createFollowProject(app, 'DelayedVideoOutro');
  const outPointText = await app.inspector
    .getByText('Outro start', { exact: true })
    .locator('..')
    .textContent();
  const outPoint = Number(/frame\s+(\d+)/i.exec(outPointText ?? '')?.[1] ?? '0');
  expect(outPoint).toBeGreaterThan(0);
  expect(outPoint + 30).toBeLessThan(150);
  await app.setPlayoutTiming('manual');
  await app.addTextElement();
  const textId = (await app.timelineRowIds())[0]!;
  await app.scrubToFrame(outPoint);
  await app.toggleInspectorKeyframe('opacity');
  await app.scrubToFrame(outPoint + 12);
  await app.setInspectorNumber('Opacity', 0);

  await importAndPlaceVideo(app);
  await app.inspector.getByRole('button', { name: 'Follow composition' }).click();
  const delay = app.inspector.getByRole('spinbutton', { name: 'outro delay' });
  await delay.fill('30');
  await delay.press('Enter');
  await expect(delay).toHaveValue('30');
  const transport = app.page.getByLabel('Playback transport');
  await transport.getByRole('button', { name: 'Rehearse preview' }).click();
  await transport.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(app.page.getByRole('slider', { name: 'Frame ruler' })).toHaveAttribute(
    'aria-valuenow',
    String(outPoint),
  );
  const video = app.canvasFrame.locator('video[data-cg-element-id]').first();
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);

  const text = app.canvasFrame.locator(`[data-cg-element-id="${textId}"]`);
  interface Sample {
    opacity: number;
    paused: boolean;
    time: number;
  }
  await text.evaluate((node) => {
    const media = node.ownerDocument.querySelector<HTMLVideoElement>('video[data-cg-element-id]');
    if (media === null) throw new Error('The Follow video is missing');
    const samples: Sample[] = [];
    Object.assign(window, { __cgFollowOutroSamples: samples });
    const sample = () => {
      if (node.ownerDocument.body.classList.contains('cg-rehearse-cleared')) return;
      samples.push({
        opacity: Number(getComputedStyle(node).opacity),
        paused: media.paused,
        time: media.currentTime,
      });
      requestAnimationFrame(sample);
    };
    sample();
  });
  await transport.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(app.canvasFrame.locator('body')).toHaveClass(/cg-rehearse-cleared/);
  const samples = await text.evaluate(
    () => (window as unknown as { __cgFollowOutroSamples: Sample[] }).__cgFollowOutroSamples,
  );
  expect(samples[0]?.opacity).toBe(1);
  expect(samples.some(({ opacity, paused }) => opacity > 0 && opacity < 1 && paused)).toBe(true);
  const textGone = samples.findIndex(({ opacity, paused }) => opacity === 0 && paused);
  const videoMoves = samples.findIndex(
    ({ paused, time }) => !paused && time > (samples[0]?.time ?? 0) + 0.02,
  );
  expect(textGone).toBeGreaterThan(0);
  expect(videoMoves).toBeGreaterThan(textGone);
  expect(samples[videoMoves]?.opacity).toBe(0);
});

test.describe('D-176 — one clear Follow composition path', () => {
  test('D-186 — Follow Lottie scrubs continuously and freezes the real Canvas and Preview picture at Out', async ({
    app,
  }) => {
    const outPoint = await createMovingFollowProject(app, 'LottieFreezePicture');
    await app.setPlayoutTiming('manual');
    const canvasSvg = app.canvasFrame.locator('[data-cg-element-id] svg').first();
    await app.scrubToFrame(30);
    await expect.poll(() => paintedX(canvasSvg)).toBeGreaterThan(30);
    const atThirty = await paintedX(canvasSvg);
    await app.scrubToFrame(45);
    // The old Follow mapping parked every post-Intro scrub on the same source frame.
    await expect.poll(() => paintedX(canvasSvg)).toBeGreaterThan(atThirty + 10);
    const atFortyFive = await paintedX(canvasSvg);
    await app.scrubToFrame(outPoint);
    await expect.poll(() => paintedX(canvasSvg)).toBeGreaterThan(atFortyFive + 10);
    const heldPicture = await paintedX(canvasSvg);
    await app.scrubToFrame(0);

    const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(ruler).toHaveAttribute('aria-valuenow', String(outPoint));
    await expect.poll(() => paintedX(canvasSvg)).toBeCloseTo(heldPicture, 1);
    // Rehearse exposes the operator lifecycle, not the authoring Pause controls. Leaving it
    // releases lifecycle ownership and restores the editable frame-zero picture.
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await expect.poll(() => paintedX(canvasSvg)).toBeCloseTo(0, 1);
    await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

    await app.openPreviewModal();
    const previewSvg = app.previewFrame.locator('[data-cg-element-id] svg').first();
    const counter = app.previewDialog.getByLabel('Preview frame');
    await app.play();
    await expect(counter).toContainText(`${String(outPoint)} / 150`);
    await expect.poll(() => paintedX(previewSvg)).toBeCloseTo(heldPicture, 1);
    await app.pause();
    await app.page.waitForTimeout(150);
    await expect(counter).toContainText(`${String(outPoint)} / 150`);
    await expect.poll(() => paintedX(previewSvg)).toBeCloseTo(heldPicture, 1);
    await app.play();
    await app.stop();
    await expect.poll(() => paintedX(previewSvg)).toBeGreaterThan(heldPicture + 1);
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/);
  });

  test('D-186 — a timed Follow Lottie exit advances forward from the frozen picture', async ({
    app,
  }) => {
    const outPoint = await createMovingFollowProject(app, 'LottieTimedFreeze');
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('timed');
    const hold = app.inspector.getByRole('spinbutton', { name: 'Hold duration in milliseconds' });
    await hold.fill('1000');
    await hold.press('Enter');
    const svg = app.canvasFrame.locator('[data-cg-element-id] svg').first();
    await app.scrubToFrame(outPoint);
    await expect.poll(() => paintedX(svg)).toBeGreaterThan(100);
    const heldPicture = await paintedX(svg);
    await app.scrubToFrame(0);
    const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
    await ruler.evaluate((node) => {
      const samples: number[] = [];
      Object.assign(window, { __cgLottieFreezeSamples: samples });
      new MutationObserver(() => samples.push(Number(node.getAttribute('aria-valuenow')))).observe(
        node,
        { attributes: true, attributeFilter: ['aria-valuenow'] },
      );
    });
    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(ruler).toHaveAttribute('aria-valuenow', String(outPoint));
    await expect.poll(() => paintedX(svg)).toBeCloseTo(heldPicture, 1);
    await expect.poll(() => paintedX(svg)).toBeGreaterThan(heldPicture + 1);
    await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const samples = await app.page.evaluate(
      () =>
        (window as typeof window & { __cgLottieFreezeSamples?: number[] })
          .__cgLottieFreezeSamples ?? [],
    );
    const afterHold = samples.slice(samples.indexOf(outPoint));
    expect(afterHold.some((frame) => frame > outPoint && frame < 150)).toBe(true);
    expect(afterHold.every((frame) => frame >= outPoint)).toBe(true);
  });

  test('marker-less media offers Follow only; compact timing and Detach stay clear', async ({
    app,
  }) => {
    await createFollowProject(app, 'MediaFollowOnly');
    await importAndPlace(app, 'markerless-timing.json', lottie());

    await expect(app.inspector.getByRole('button', { name: 'Add phase markers' })).toHaveCount(0);
    const follow = app.inspector.getByRole('button', { name: 'Follow composition' });
    await expect(follow).toBeVisible();
    await follow.click();

    await expect(app.inspector.getByTestId('follow-window')).toContainText('freezes');
    await expect(app.inspector.getByRole('combobox', { name: 'On hold' })).toHaveCount(0);
    await expect(app.inspector.getByRole('button', { name: /Set hold|Clear hold/ })).toHaveCount(0);
    await expect(
      app.inspector.getByRole('button', { name: 'About Follow composition timing' }),
    ).toBeVisible();

    await app.inspector.getByRole('button', { name: /Detach/ }).click();
    await expect(app.inspector.getByLabel('intro end')).toBeVisible();
    await expect(app.inspector.getByLabel('outro start')).toBeVisible();
  });

  test('Follow ignores authored idle markers and loops the composition-derived middle', async ({
    app,
  }) => {
    await createFollowProject(app, 'MediaFollowIdle');
    await app.inspector.getByRole('combobox', { name: 'On hold' }).selectOption('loop');
    await importAndPlace(
      app,
      'marked-timing.json',
      lottie([
        { tm: 10, cm: 'intro-end', dr: 0 },
        { tm: 20, cm: 'idle-start', dr: 0 },
        { tm: 40, cm: 'idle-end', dr: 0 },
        { tm: 50, cm: 'outro-start', dr: 0 },
      ]),
    );

    await app.inspector.getByRole('button', { name: 'Follow composition' }).click();
    await expect(app.inspector.getByRole('combobox', { name: 'On hold' })).toHaveCount(0);
    await expect(app.inspector.getByTestId('follow-window')).toContainText('loops middle');
  });

  test('a phase-less Video uses the same Follow-only authoring path', async ({ app }) => {
    await createFollowProject(app, 'VideoFollowOnly');
    await app.inspector.getByRole('combobox', { name: 'On hold' }).selectOption('loop');
    await importAndPlaceVideo(app);

    await expect(app.inspector.getByRole('button', { name: 'Add phase marks' })).toHaveCount(0);
    await app.inspector.getByRole('button', { name: 'Follow composition' }).click();
    await expect(app.inspector.getByTestId('follow-window')).toContainText(/Hold .*frame/);
    await expect(app.inspector.getByRole('combobox', { name: 'On hold' })).toHaveCount(0);
    await expect(app.inspector.getByRole('combobox', { name: 'drives hold' })).toHaveCount(0);

    // B-375 — at initial rest a scrub already worked; the regression appeared only after the real
    // lifecycle owned the Video and was paused. Loop the derived middle so the media visibly moves,
    // then prove a ruler scrub releases that paused lifecycle and positions frame zero again.
    const video = app.canvasFrame.locator('video[data-cg-element-id]').first();
    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0.12);
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    await app.page.waitForTimeout(200);
    // Leaving Rehearse already sets the store cursor to frame zero. Move once so the rebuilt
    // authoring iframe receives an explicit scrub message instead of a no-op zero-to-zero write.
    await app.scrubToFrame(1);
    await app.scrubToFrame(0);
    const posterTime = Number(await video.getAttribute('data-cg-poster-ms')) / 1000;
    expect(Number.isFinite(posterTime)).toBe(true);
    await expect
      .poll(() =>
        video.evaluate((node) => {
          const media = node as HTMLVideoElement;
          return media.seeking ? 99 : media.currentTime;
        }),
      )
      .toBeCloseTo(posterTime, 1);
  });

  test('B-377 — Follow Freeze parks at Out point and content completion advances its Outro', async ({
    app,
  }) => {
    await createFollowProject(app, 'VideoFreezeCursor');
    await app.dragContentStartMarkerToFraction(0.2);
    await importAndPlaceVideo(app);
    await app.inspector.getByRole('button', { name: 'Follow composition' }).click();
    await expect(app.inspector.getByRole('combobox', { name: 'On hold' })).toHaveCount(0);
    await expect(
      app.inspector.getByRole('spinbutton', { name: /freeze (frame|time)/i }),
    ).toHaveCount(0);

    // B-378 — the derived Freeze picture belongs only to actual lifecycle Hold. Manual timeline
    // authoring still walks the source Middle once instead of replacing it with the held picture.
    await app.scrubToFrame(35);
    const scrubbedVideo = app.canvasFrame.locator('video[data-cg-element-id]').first();
    await expect
      .poll(() => scrubbedVideo.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(0.7, 1);

    // One finite crawl leaves a long-enough hold to observe the parked Follow Video, then ends it
    // without an operator Stop so the element-owned Outro path is the one under test.
    await app.addTicker({ x: 120, y: 260 });
    await app.inspector.getByRole('combobox', { name: 'repeat' }).selectOption('count');
    await app.page.getByLabel('passes', { exact: true }).fill('1');
    await app.page.getByLabel('passes', { exact: true }).press('Enter');
    await app.inspector.getByRole('combobox', { name: 'cycle seam' }).selectOption('drain');
    await app.page.getByLabel('speed', { exact: true }).fill('300');
    await app.page.getByLabel('speed', { exact: true }).press('Enter');
    await app.setPlayoutTiming('auto-out');
    await app.setHoldSource('content-driven');
    await app.page.waitForTimeout(100);

    const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
    const outPointText = await app.inspector
      .getByText('Outro start', { exact: true })
      .locator('..')
      .textContent();
    const outPoint = Number(/frame\s+(\d+)/i.exec(outPointText ?? '')?.[1] ?? '0');
    const transport = app.page.getByLabel('Playback transport');
    await transport.getByRole('button', { name: 'Rehearse preview' }).click();
    const play = transport.getByRole('button', { name: 'Play', exact: true });
    await play.click();
    await expect(ruler).toHaveAttribute('aria-valuenow', String(outPoint), { timeout: 3_000 });
    const video = scrubbedVideo;
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused), {
        timeout: 3_000,
      })
      .toBe(true);
    const heldAt = await video.evaluate((node) => (node as HTMLVideoElement).currentTime);
    const posterMs = Number(await video.getAttribute('data-cg-poster-ms'));
    expect(Number.isFinite(posterMs)).toBe(true);
    expect(heldAt).toBeCloseTo(posterMs / 1000, 1);
    await app.page.waitForTimeout(300);
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(heldAt, 1);

    await expect(play).toBeEnabled({ timeout: 20_000 });
    await expect(ruler).toHaveAttribute('aria-valuenow', '150');
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeGreaterThan(heldAt + 0.1);
  });
});

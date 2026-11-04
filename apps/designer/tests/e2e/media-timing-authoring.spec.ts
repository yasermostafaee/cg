import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

test.describe('D-176 — one clear Follow composition path', () => {
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
    await transport.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0.12);
    await transport.getByRole('button', { name: 'Pause', exact: true }).click();
    await app.scrubToFrame(0);
    await expect
      .poll(() =>
        video.evaluate((node) => {
          const media = node as HTMLVideoElement;
          return media.seeking ? 99 : media.currentTime;
        }),
      )
      .toBeLessThan(0.08);
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
    await ruler.evaluate((node) => {
      const samples = [Number(node.getAttribute('aria-valuenow') ?? '0')];
      Object.assign(window, { __cgFreezeFrameSamples: samples });
      new MutationObserver(() => {
        samples.push(Number(node.getAttribute('aria-valuenow') ?? '0'));
      }).observe(node, { attributes: true, attributeFilter: ['aria-valuenow'] });
    });

    const play = app.page
      .getByLabel('Playback transport')
      .getByRole('button', { name: 'Play', exact: true });
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

    await expect(play).toBeVisible({ timeout: 20_000 });
    const samples = await app.page.evaluate(
      () =>
        (window as typeof window & { __cgFreezeFrameSamples?: number[] }).__cgFreezeFrameSamples ??
        [],
    );
    expect(samples.some((frame) => frame > outPoint && frame < 150)).toBe(true);
  });
});

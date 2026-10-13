import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FrameLocator, Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

/**
 * `B-217` — THE CANVAS VIDEO THAT WENT BLANK AFTER LOOK SWITCHES, AND STAYED BLANK.
 *
 * The owner's report (2026-08-30): a video used as a background stopped rendering on the
 * canvas after several look switches and some `Ctrl+Z`; undo did not bring it back; a
 * brand-new video rendered nothing either; the Inspector's own thumbnail was fine; saving and
 * reopening cured it. So the document is intact and the broken thing is SHARED runtime view
 * state, released across a composition unmount and never re-acquired.
 *
 * This spec walks the reported gestures against the real canvas and records, after each, what
 * the owner looked at: does the visible `<video>` paint a frame at the playhead's time, is it
 * PAUSED (the editor canvas never plays), and does a video added afterwards paint too. Every
 * stage is SAMPLED and the verdict is given once, at the end, so a single run reports the
 * whole walk rather than stopping at the first stage that fails.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SAFE = join(HERE, 'fixtures', 'seek-safe-64x64.webm');
const FRAGILE = join(HERE, 'fixtures', 'fragile-alpha-seek-320x90.webm');

/** storeBytes + drag-drop placement onto the ACTIVE document; returns the assetId. */
async function storeAndPlace(page: Page, file: string, filename: string): Promise<string> {
  const b64 = readFileSync(file).toString('base64');
  const assetId = await page.evaluate(
    async ({ data, name }) => {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const { asset } = await window.cg.assets.storeBytes({
        bytes,
        filename: name,
        kind: 'video',
      });
      return asset.assetId;
    },
    { data: b64, name: filename },
  );
  const dropped = await page.evaluate(async (id) => {
    const canvas = document.querySelector('[data-testid="canvas-surface"]');
    if (canvas === null) return false;
    const dt = new DataTransfer();
    dt.setData('application/x-cg-asset-id', id);
    dt.setData('application/x-cg-asset-kind', 'video');
    for (const type of ['dragover', 'drop']) {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      canvas.dispatchEvent(ev);
    }
    return true;
  }, assetId);
  expect(dropped).toBe(true);
  return assetId;
}

/** The element ids of every `<video>` the canvas currently renders, in DOM order. */
async function canvasVideoElementIds(frame: FrameLocator): Promise<string[]> {
  return frame
    .locator('video[data-cg-element-id]')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset['cgElementId'] ?? ''));
}

interface VideoSample {
  ok: boolean;
  error?: string;
  count?: number;
  connected?: boolean;
  visible?: boolean;
  currentTime?: number;
  visibleFrac?: number;
  paused?: boolean;
  playbackRate?: number;
  readyState?: number;
  src?: string;
  armed?: string | null;
}

/**
 * Does the canvas `<video>` for `elementId` paint a REAL frame at the playhead's clip time?
 * Same settled condition as `video-canvas-render.spec.ts` (blob src, decoded, at the mapped
 * time, paused, rate restored) plus the actual not-blank check: visible pixels when drawn.
 * Never throws — an absent node is a sample too.
 */
async function sampleVideo(
  frame: FrameLocator,
  elementId: string,
  expectedTimeSec: number,
  timeoutMs = 12_000,
): Promise<VideoSample> {
  const loc = frame.locator(`video[data-cg-element-id="${elementId}"]`);
  const count = await loc.count();
  if (count !== 1) return { ok: false, count, error: `expected one node, found ${String(count)}` };
  return loc.evaluate(
    async (v: HTMLVideoElement, args: { expectedT: number; timeoutMs: number }) => {
      const deadline = Date.now() + args.timeoutMs;
      let last: VideoSample = { ok: false };
      while (Date.now() < deadline) {
        const src = v.getAttribute('src') ?? '';
        const rect = v.getBoundingClientRect();
        last = {
          ok: false,
          connected: v.isConnected,
          visible: rect.width > 0 && rect.height > 0,
          currentTime: Math.round(v.currentTime * 1000) / 1000,
          paused: v.paused,
          playbackRate: v.playbackRate,
          readyState: v.readyState,
          src: src.slice(0, 5),
          armed: v.getAttribute('data-cg-poster-armed'),
          error: v.error === null ? undefined : v.error.message,
        };
        if (v.error !== null) return last;
        if (
          src.startsWith('blob:') &&
          v.readyState >= 2 &&
          Math.abs(v.currentTime - args.expectedT) < 0.25 &&
          !v.seeking &&
          v.paused &&
          v.playbackRate === 1
        ) {
          const c = document.createElement('canvas');
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const ctx = c.getContext('2d');
          if (ctx === null) return { ...last, error: 'no 2d context' };
          ctx.drawImage(v, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let visible = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i]! >= 8) visible++;
          const visibleFrac = visible / (d.length / 4);
          return { ...last, ok: visibleFrac > 0.05, visibleFrac };
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return last;
    },
    { expectedT: expectedTimeSec, timeoutMs },
  );
}

test.setTimeout(300_000);

test('B-217 — a background video survives look switches and undo, stays PAUSED, and a new video still renders', async ({
  app,
  page,
}) => {
  const consoleLines: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      consoleLines.push(`${m.type()}: ${m.text()}`);
  });
  const stages: Record<string, VideoSample> = {};

  await app.newProject('VideoLooksBlank');
  // D-151 — size the host to fit the clip so the add-time duration guard stays out of the way.
  await app.setSceneDuration(500);
  await app.showCompositions();
  const homeName = (await app.page.locator('.cg-comp-row').first().innerText()).trim();
  const frame = app.canvasFrame;
  const canvasBox = await app.canvas.boundingBox();
  if (canvasBox === null) throw new Error('canvas not rendered');
  const at = (fx: number, fy: number): { x: number; y: number } => ({
    x: Math.round(canvasBox.width * fx),
    y: Math.round(canvasBox.height * fy),
  });

  // ── the BACKGROUND video, at root, before any look (looks.spec's shared background) ──
  await storeAndPlace(page, SAFE, 'bg.webm');
  await expect(app.inspector.getByRole('textbox', { name: 'Element name' })).toHaveValue('Video');
  const [bgId] = await canvasVideoElementIds(frame);
  if (bgId === undefined) throw new Error('background video not rendered');
  // D-135 §5 — park the playhead off the transparent frame 0 so "renders" is provable.
  await app.scrubToFrame(100);
  stages['1 bg before any look'] = await sampleVideo(frame, bgId, 2.0);
  await app.deselect();

  // ── the multi-frame group, two looks, a plate in each, and a second video INSIDE look-1 ──
  await app.page.getByRole('button', { name: 'Add multi-frame group' }).click();
  await app.inspector.getByRole('button', { name: '+ Look' }).click();
  await app.inspector.getByRole('button', { name: 'Edit contents of look-1' }).click();
  // A look is its own composition with its own duration; size it to fit the clip too.
  await app.setSceneDuration(500);
  await app.addLiveSource(at(0.4, 0.4));
  await app.setLiveSourceId('live-1');
  await app.deselect();
  await storeAndPlace(page, FRAGILE, 'in-look.webm');
  await expect(app.inspector.getByRole('textbox', { name: 'Element name' })).toHaveValue('Video');
  await app.deselect();
  await app.openComposition(homeName);
  await expect
    .poll(async () => (await canvasVideoElementIds(frame)).length, { timeout: 10_000 })
    .toBe(2);
  const idsAfterLook1 = await canvasVideoElementIds(frame);
  const inLookId = idsAfterLook1.find((id) => id !== bgId);
  if (inLookId === undefined)
    throw new Error(`in-look video not rendered: ${idsAfterLook1.join()}`);

  await app.inspector.getByRole('button', { name: '+ Look' }).click();
  await app.inspector.getByRole('button', { name: 'Edit contents of look-2' }).click();
  await app.setSceneDuration(500);
  await app.addLiveSource(at(0.4, 0.4));
  await app.setLiveSourceId('live-1');
  await app.deselect();
  await app.openComposition(homeName);
  await app.scrubToFrame(100);

  const picker = app.page.getByLabel('Active look');
  await expect(picker).toBeVisible();
  // The last look added is the one the canvas shows; start from look-1 so the round trip below
  // is hide → show for the in-look video.
  await picker.selectOption('look-1');
  stages['2 bg after authoring two looks'] = await sampleVideo(frame, bgId, 2.0);
  stages['2 in-look after authoring'] = await sampleVideo(frame, inLookId, 2.0);

  // ── several look switches ──
  for (const id of ['look-2', 'look-1', 'look-2', 'look-1']) {
    await picker.selectOption(id);
    await expect(frame.locator('[data-cg-live-source]:visible')).toHaveCount(1);
  }
  stages['3 bg after switches'] = await sampleVideo(frame, bgId, 2.0);
  // The editor canvas NEVER plays: a video inside a look that was hidden and shown again
  // must still be a paused frame at the playhead, not a running clip.
  stages['3 in-look after a round trip (must be PAUSED)'] = await sampleVideo(
    frame,
    inLookId,
    2.0,
    4_000,
  );

  // ── a scrub while the look is shown: the playhead must own the frame again ──
  await app.scrubToFrame(150);
  stages['4 in-look after a scrub to frame 150'] = await sampleVideo(frame, inLookId, 3.0, 4_000);
  stages['4 bg after a scrub to frame 150'] = await sampleVideo(frame, bgId, 3.0, 4_000);
  await app.scrubToFrame(100);

  // ── some Ctrl+Z: a nudge of the background, then undo it, twice ──
  await app.selectElementById(bgId);
  await app.page.keyboard.press('ArrowRight');
  await app.page.keyboard.press('ArrowRight');
  await app.deselect();
  await app.undo();
  await app.undo();
  await app.scrubToFrame(100);
  stages['5 bg after undo'] = await sampleVideo(frame, bgId, 2.0);
  stages['5 in-look after undo'] = await sampleVideo(frame, inLookId, 2.0, 4_000);

  // ── another round trip AFTER the rebuilds ──
  for (const id of ['look-2', 'look-1']) {
    await picker.selectOption(id);
    await expect(frame.locator('[data-cg-live-source]:visible')).toHaveCount(1);
  }
  stages['6 bg after a second round trip'] = await sampleVideo(frame, bgId, 2.0, 4_000);
  stages['6 in-look after a second round trip'] = await sampleVideo(frame, inLookId, 2.0, 4_000);

  // ── a brand-new video, added now, at root ──
  await storeAndPlace(page, SAFE, 'new.webm');
  await expect(app.inspector.getByRole('textbox', { name: 'Element name' })).toHaveValue('Video');
  // The canvas rebuild is rAF-throttled and async behind the host's add: poll for the node.
  await expect
    .poll(async () => (await canvasVideoElementIds(frame)).length, { timeout: 10_000 })
    .toBe(3);
  const idsNow = await canvasVideoElementIds(frame);
  const newId = idsNow.find((id) => id !== bgId && id !== inLookId);
  if (newId === undefined) throw new Error(`new video not rendered: ${idsNow.join()}`);
  await app.scrubToFrame(100);
  stages['7 NEW video'] = await sampleVideo(frame, newId, 2.0);
  stages['7 bg after the new video'] = await sampleVideo(frame, bgId, 2.0, 4_000);
  stages['7 in-look after the new video'] = await sampleVideo(frame, inLookId, 2.0, 4_000);

  // ── the verdict, all at once ──
  const report = Object.entries(stages)
    .map(([k, v]) => `${v.ok ? 'OK  ' : 'FAIL'} ${k}: ${JSON.stringify(v)}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.log('[B-217 stages]\n' + report);
  // eslint-disable-next-line no-console
  if (consoleLines.length > 0) console.log('[B-217 console]\n' + consoleLines.join('\n'));
  const failed = Object.entries(stages).filter(([, v]) => !v.ok);
  expect(
    failed.map(([k]) => k),
    report,
  ).toEqual([]);
});

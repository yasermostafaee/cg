import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './fixtures/designer.js';

/**
 * Opt-in source-frame generator for smooth gallery WebM previews.
 * Chromium's screencast stream captures painted frames without serial screenshot
 * latency. Real frame timestamps preserve authored intervals. The crop metadata
 * isolates the stable Preview iframe from the recorded browser viewport.
 *
 * `CG_STARTER_MOTION_FRAMES=<temp dir> playwright test starter-motion-previews`
 * Optional `CG_STARTER_CAPTURE_IDS=id,id` scopes regeneration. Encode each manifest
 * with `-f concat -safe 0 -i frames.ffconcat` (not image-sequence `-framerate`):
 * safe=0 permits the manifest's per-file framerate option. Apply capture.json's
 * crop, scale to 640x360 (JPEG full range -> limited BT.709), setpts=PTS/1.15,
 * then 30 fps VP9, CRF 38, no audio. Set BT.709 color-space/primaries/transfer and
 * tv range explicitly: inherited full-range bt470bg can fail Chromium decoding.
 * Encoder filter: crop=w:h:x:y,scale=640:360:flags=lanczos:in_range=pc:
 * out_range=tv:out_color_matrix=bt709,setpts=PTS/1.15,format=yuv420p.
 * Flags: -r 30 -c:v libvpx-vp9 -deadline good -cpu-used 4 -crf 38 -b:v 0
 * -row-mt 1 -threads 2 -color_range tv -colorspace bt709 -color_primaries bt709
 * -color_trc bt709 -an. This produces 8-bit VP9 Profile 0; verify in Chrome,
 * since successful ffmpeg decoding alone did not reveal the prior color failure.
 */
const OUT = process.env.CG_STARTER_MOTION_FRAMES;
test.skip(OUT === undefined || OUT === '', 'only when regenerating starter motion previews');

const starters = [
  ['logo-bug', 'لوگو شبکه'],
  ['title', 'عنوان معرفی'],
  ['ticker', 'زیرنویس حرکت افقی'],
  ['irib-news', 'زیرنویس با ساعت'],
  ['sequence', 'زیرنویس حرکت عمودی'],
  ['image-folder-sequence', 'نمایش تلاوت قرآن'],
  ['multibox', 'چهارقاب'],
  ['countdown-steps', 'شمارش معکوس اذان'],
  ['iran-weather-pages', 'آب‌وهوای مراکز استان‌ها'],
  ['iran-weather-forecast', 'پیش‌بینی چندروزهٔ هوا'],
  ['iran-weather-cards', 'آب‌وهوای شهرها — کارت‌های تصویری'],
  ['iran-premier-league', 'جدول لیگ برتر ایران'],
] as const;

test('records every starter into a smooth short excerpt', async ({ app }) => {
  test.setTimeout(360_000);
  const root = OUT as string;
  const requested = process.env.CG_STARTER_CAPTURE_IDS?.split(',').filter(Boolean);
  if (requested !== undefined)
    expect(requested.every((id) => starters.some(([candidate]) => candidate === id))).toBe(true);
  await app.page.setViewportSize({ width: 1600, height: 1000 });

  for (const [id, label] of starters) {
    if (requested !== undefined && !requested.includes(id)) continue;
    const out = path.join(root, id);
    fs.mkdirSync(out, { recursive: true });
    await app.goto();
    await app.page.getByTestId('starter-card').filter({ hasText: label }).click();
    await app.expectStudio();
    await app.openPreviewModal();
    if (id === 'countdown-steps') {
      // Use the real bound target field to show the authored announcement in a
      // short excerpt. The demo target is illustrative, not a prayer calculation.
      const target = new Date(Date.now() + 4_000);
      const time = app.previewDialog.getByRole('textbox', { name: 'زمان اذان time', exact: true });
      await time.focus();
      await time.press('Control+a');
      await time.pressSequentially(
        [target.getHours(), target.getMinutes(), target.getSeconds()]
          .map((value) => String(value).padStart(2, '0'))
          .join(''),
      );
      await time.press('Tab');
      await expect(time).toHaveValue(
        [target.getHours(), target.getMinutes(), target.getSeconds()]
          .map((value) => String(value).padStart(2, '0'))
          .join(':'),
      );
      await app.previewDialog.getByRole('button', { name: 'Update all', exact: true }).click();
    }
    const stage = app.previewFrame.locator('.cg-stage').first();
    await expect(stage).toBeAttached();
    const frameViewport = app.previewDialog.locator('iframe');
    const box = await frameViewport.boundingBox();
    if (box === null) throw new Error(`No preview viewport for ${id}`);
    const session = await app.page.context().newCDPSession(app.page);
    const captures: { name: string; at: number }[] = [];
    let capturing = true;
    session.on(
      'Page.screencastFrame',
      (event: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
        if (capturing) {
          const name = `video-frame-${String(captures.length).padStart(4, '0')}.jpg`;
          fs.writeFileSync(path.join(out, name), Buffer.from(event.data, 'base64'));
          captures.push({ name, at: (event.metadata.timestamp ?? Date.now() / 1000) * 1000 });
        }
        // Acknowledge every frame, even the final one arriving during shutdown.
        void session
          .send('Page.screencastFrameAck', { sessionId: event.sessionId })
          .catch(() => undefined);
      },
    );
    const captureStartedAt = Date.now();
    await session.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 90,
      maxWidth: 1600,
      maxHeight: 1000,
      everyNthFrame: 1,
    });
    await app.play();
    await expect(stage).toBeVisible();
    const started = Date.now();
    let step = 0;
    let stopped = false;
    const excerptMs = id === 'iran-premier-league' ? 6_500 : 6_000;
    while (Date.now() - started < excerptMs || captures.length < 12) {
      // The league excerpt demonstrates its complete ordered build-down too.
      // Stop is the real operator command, not a faster synthetic animation.
      if (id === 'iran-premier-league' && !stopped && Date.now() - started >= 2_600) {
        await app.stop();
        stopped = true;
      }
      // Demonstrate manual pages without speeding up the authored animation.
      if (Date.now() - started >= (step + 1) * 2_000 && step < 2) {
        step += 1;
        const next = app.previewDialog.getByRole('button', { name: /Next/ });
        if ((await next.count()) > 0 && (await next.isEnabled())) await next.click();
      }
      await app.page.waitForTimeout(40);
    }
    capturing = false;
    const captureSpanMs = Date.now() - captureStartedAt;
    await session.send('Page.stopScreencast');
    await session.detach();
    const manifest = captures.flatMap((capture, index) => [
      `file '${capture.name}'`,
      // JPEG demuxing otherwise quantizes timestamps to its default 25 fps.
      'option framerate 1000',
      `duration ${((captures[index + 1]?.at ?? Math.max(capture.at + 100, captures[0]!.at + captureSpanMs)) - capture.at) / 1000}`,
    ]);
    manifest.push(`file '${captures.at(-1)!.name}'`);
    manifest.push('option framerate 1000');
    fs.writeFileSync(
      path.join(out, 'frames.ffconcat'),
      `ffconcat version 1.0\n${manifest.join('\n')}\n`,
    );
    fs.writeFileSync(
      path.join(out, 'capture.json'),
      JSON.stringify(
        {
          source: 'chromium-screencast',
          frames: captures.length,
          crop: {
            x: Math.floor(box.x),
            y: Math.floor(box.y),
            width: Math.floor(box.width),
            height: Math.floor(box.height),
          },
          playbackRate: 1.15,
          fps: 30,
        },
        null,
        2,
      ),
    );
    expect(captures.length).toBeGreaterThanOrEqual(12);
  }
});

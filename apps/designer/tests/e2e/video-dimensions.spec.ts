import { expect, test } from './fixtures/designer.js';

/**
 * D-128 — the DIMENSION MATRIX for the converter (the 1920×282 field regression class):
 * non-standard sizes must convert to a WebM that actually DECODES, at the exact expected
 * dimensions, through the REAL wasm converter. Broadcast lower-thirds are routinely thin
 * odd strips — 1920×282 (the reported failing size) and an odd-half-height case are
 * pinned here so the next unusual size cannot silently regress.
 *
 * The sources are synthesized in PURE NODE (a minimal rawvideo/BGRA AVI writer — the
 * same container the legacy archive uses) so this spec has NO native-ffmpeg dependency.
 */

function bgraAvi(W: number, H: number, frames: Buffer[]): Buffer {
  const N = frames.length;
  const frameSize = W * H * 4;
  const u32 = (n: number): Buffer => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n >>> 0);
    return b;
  };
  const u16 = (n: number): Buffer => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n & 0xffff);
    return b;
  };
  const chunk = (id: string, payload: Buffer): Buffer => {
    const padded = payload.length % 2 === 1 ? Buffer.concat([payload, Buffer.alloc(1)]) : payload;
    return Buffer.concat([Buffer.from(id, 'ascii'), u32(payload.length), padded]);
  };
  const list = (type: string, payload: Buffer): Buffer =>
    Buffer.concat([
      Buffer.from('LIST', 'ascii'),
      u32(payload.length + 4),
      Buffer.from(type, 'ascii'),
      payload,
    ]);
  // avih — MicroSecPerFrame 40000 (25 fps), HASINDEX
  const avih = chunk(
    'avih',
    Buffer.concat([
      u32(40_000),
      u32(frameSize * 25),
      u32(0),
      u32(0x10),
      u32(N),
      u32(0),
      u32(1),
      u32(frameSize),
      u32(W),
      u32(H),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
    ]),
  );
  // strh 'vids' — scale 1 / rate 25, length N
  const strh = chunk(
    'strh',
    Buffer.concat([
      Buffer.from('vids', 'ascii'),
      u32(0),
      u32(0),
      u16(0),
      u16(0),
      u32(0),
      u32(1),
      u32(25),
      u32(0),
      u32(N),
      u32(frameSize),
      u32(0xffffffff),
      u32(0),
      u16(0),
      u16(0),
      u16(W),
      u16(H),
    ]),
  );
  // strf — BITMAPINFOHEADER, BI_RGB 32bpp (positive height ⇒ bottom-up rows, BMP convention)
  const strf = chunk(
    'strf',
    Buffer.concat([
      u32(40),
      u32(W),
      u32(H),
      u16(1),
      u16(32),
      u32(0),
      u32(frameSize),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
    ]),
  );
  const hdrl = list('hdrl', Buffer.concat([avih, list('strl', Buffer.concat([strh, strf]))]));
  const flip = (f: Buffer): Buffer => {
    // bottom-up row order (BI_RGB positive-height convention)
    const out = Buffer.alloc(f.length);
    const stride = W * 4;
    for (let y = 0; y < H; y++) f.copy(out, (H - 1 - y) * stride, y * stride, (y + 1) * stride);
    return out;
  };
  const movieChunks = frames.map((f) => chunk('00db', flip(f)));
  const movi = list('movi', Buffer.concat(movieChunks));
  // idx1 — one keyframe entry per frame; offsets relative to the 'movi' fourcc (+4 to data)
  const idx: Buffer[] = [];
  let off = 4;
  for (const c of movieChunks) {
    idx.push(Buffer.concat([Buffer.from('00db', 'ascii'), u32(0x10), u32(off), u32(frameSize)]));
    off += c.length;
  }
  const idx1 = chunk('idx1', Buffer.concat(idx));
  const body = Buffer.concat([Buffer.from('AVI ', 'ascii'), hdrl, movi, idx1]);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), u32(body.length), body]);
}

/** A moving soft-edged premultiplied gold bar — motion + partial alpha on every frame. */
function motionFrames(W: number, H: number, N: number): Buffer[] {
  const frames: Buffer[] = [];
  for (let f = 0; f < N; f++) {
    const buf = Buffer.alloc(W * H * 4);
    const bx = (f / N) * W * 0.6 + W * 0.15;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = Math.abs(x - bx);
        let a = 0;
        if (dx < W * 0.04) a = 255;
        else if (dx < W * 0.07) a = Math.round(255 * (1 - (dx - W * 0.04) / (W * 0.03)));
        if (a > 0) {
          const i = (y * W + x) * 4;
          const t = 0.7 + ((x * 7 + y * 13) % 32) / 100;
          buf[i] = Math.round((Math.round(40 * t) * a) / 255); // B
          buf[i + 1] = Math.round((Math.round(215 * t) * a) / 255); // G
          buf[i + 2] = Math.round((Math.round(255 * t) * a) / 255); // R
          buf[i + 3] = a;
        }
      }
    }
    frames.push(buf);
  }
  return frames;
}

/**
 * A LOWER-THIRD-shaped source (the content class the plain-bar fixtures never covered):
 * large fully-transparent regions, a solid opaque bar with soft top/bottom edges,
 * ANIMATING IN from the left. Premultiplied, like the archive.
 */
function lowerThirdFrames(W: number, H: number, N: number): Buffer[] {
  const frames: Buffer[] = [];
  const barTop = Math.round(H * 0.3);
  const barBottom = Math.round(H * 0.72);
  const edge = Math.max(3, Math.round(H * 0.08));
  for (let f = 0; f < N; f++) {
    const buf = Buffer.alloc(W * H * 4);
    const reveal = Math.round(((f + 1) / N) * W * 0.86); // the bar slides in
    for (let y = 0; y < H; y++) {
      // vertical alpha: solid inside the bar, soft gaussian falloff at the edges
      let va = 0;
      if (y >= barTop && y <= barBottom) va = 255;
      else {
        const d = y < barTop ? barTop - y : y - barBottom;
        if (d < edge) va = Math.round(255 * Math.exp(-4 * (d / edge) ** 2));
      }
      if (va === 0) continue;
      for (let x = Math.round(W * 0.04); x < reveal; x++) {
        // horizontal soft leading edge over the last 6% of the reveal
        const lead = reveal - x;
        const ha = lead < W * 0.06 ? Math.round(255 * (lead / (W * 0.06))) : 255;
        const a = Math.min(va, ha);
        if (a === 0) continue;
        const i = (y * W + x) * 4;
        const t = 0.75 + ((x * 5 + y * 11) % 24) / 100;
        buf[i] = Math.round((Math.round(60 * t) * a) / 255); // B (premultiplied)
        buf[i + 1] = Math.round((Math.round(120 * t) * a) / 255); // G
        buf[i + 2] = Math.round((Math.round(230 * t) * a) / 255); // R
        buf[i + 3] = a;
      }
    }
    frames.push(buf);
  }
  return frames;
}

test('a lower-third-shaped clip KEEPS its opaque pixels through the full chain (alpha-collapse guard class)', async ({
  app,
  page,
}) => {
  const W = 960,
    H = 140;
  await app.newProject('LowerThirdAlpha');
  // D-151 — the add-time duration guard fires when content outsizes the host; size the host to FIT this spec’s clip so its own subject stays under test.
  await app.setSceneDuration(250);
  await page.getByRole('button', { name: 'Project assets' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Video…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'lower-third.avi',
    mimeType: 'video/x-msvideo',
    buffer: bgraAvi(W, H, lowerThirdFrames(W, H, 8)),
  });
  await expect(page.locator('[data-testid="video-probe-meta"]')).toContainText('960×140');
  // a real lower-third must NOT trip the fully-transparent warning
  await expect(page.getByText('FULLY TRANSPARENT')).not.toBeAttached();
  await page.getByRole('button', { name: 'Convert & import' }).click();
  // the RESULT panel must report PASS + preserved alpha for a real lower-third
  const panel = page.getByTestId('video-conversion-result');
  await expect(panel).toBeVisible({ timeout: 25_000 });
  await expect(panel).toContainText('Output plays');
  await expect(panel).not.toContainText('DROPPED');
  await page.getByRole('button', { name: 'Place element' }).click();
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();
  // The stored output must RETAIN opaque pixels where the source bar is, and stay
  // transparent in the source's empty regions — the invisible-clip class would fail here.
  const scan = await page.evaluate(async () => {
    const assets = await window.cg.assets.list();
    const vid = assets.find((a) => a.kind === 'video');
    if (vid === undefined) return { ok: false as const, why: 'no stored asset' };
    const url = await window.cg.assets.url(vid.assetId);
    if (url === null) return { ok: false as const, why: 'no url' };
    return await new Promise<
      { ok: true; barAlpha: number; cornerAlpha: number } | { ok: false; why: string }
    >((resolve) => {
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      const t = setTimeout(() => resolve({ ok: false, why: 'decode timeout' }), 10_000);
      v.onerror = () => {
        clearTimeout(t);
        resolve({ ok: false, why: 'decode error' });
      };
      v.onloadeddata = () => {
        void (async () => {
          // seek near the end — the bar is fully revealed
          await new Promise<void>((res) => {
            v.onseeked = () => res();
            v.currentTime = Math.max(0, v.duration * 0.9);
          });
          const c = document.createElement('canvas');
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const ctx = c.getContext('2d');
          if (ctx === null) {
            clearTimeout(t);
            resolve({ ok: false, why: 'no ctx' });
            return;
          }
          ctx.drawImage(v, 0, 0);
          const mid = ctx.getImageData(
            Math.round(v.videoWidth * 0.3),
            Math.round(v.videoHeight * 0.5),
            1,
            1,
          ).data;
          const corner = ctx.getImageData(v.videoWidth - 6, 4, 1, 1).data;
          clearTimeout(t);
          resolve({ ok: true, barAlpha: mid[3]!, cornerAlpha: corner[3]! });
        })();
      };
      v.src = url;
    });
  });
  expect(scan, JSON.stringify(scan)).toMatchObject({ ok: true });
  if (scan.ok) {
    expect(scan.barAlpha).toBeGreaterThanOrEqual(250); // the bar SURVIVED opaque
    expect(scan.cornerAlpha).toBeLessThanOrEqual(2); // the empty region stayed empty
  }
});

test('an RGB-only 32-bit source (alpha byte 0 everywhere) is warned FULLY TRANSPARENT before converting', async ({
  app,
  page,
}) => {
  // The suspected invisible-clip class: real RGB content, alpha byte 0 in every pixel —
  // decodes, converts, stores... and paints nothing. The modal must say so LEGIBLY at
  // probe time, before the operator waits through a conversion.
  const W = 320,
    H = 90;
  const frames: Buffer[] = [];
  for (let f = 0; f < 6; f++) {
    const buf = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        buf[i] = (x * 3 + f * 11) % 255; // real moving RGB content…
        buf[i + 1] = (y * 5 + f * 7) % 255;
        buf[i + 2] = 200;
        buf[i + 3] = 0; // …with the alpha byte ZERO everywhere
      }
    }
    frames.push(buf);
  }
  await app.newProject('Bgr0Warn');
  await page.getByRole('button', { name: 'Project assets' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Video…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'rgb-only.avi',
    mimeType: 'video/x-msvideo',
    buffer: bgraAvi(W, H, frames),
  });
  await expect(page.locator('[data-testid="video-probe-meta"]')).toContainText('320×90');
  // the alpha sampling lands asynchronously after the probe — the warning must appear
  await expect(page.getByText('FULLY TRANSPARENT')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('exported without an alpha channel')).toBeVisible();
});

for (const [W, H] of [
  [1920, 282], // the field-reported failing size (thin full-width lower third)
  [300, 90], // odd HALF-height (45) — the other archive shape
] as const) {
  test(`a ${String(W)}×${String(H)} source converts to a WebM that DECODES at exactly ${String(W)}×${String(H)}`, async ({
    app,
    page,
  }) => {
    await app.newProject(`Dims${String(W)}x${String(H)}`);
    // D-151 — the add-time duration guard fires when content outsizes the host; size the host to FIT this spec’s clip so its own subject stays under test.
    await app.setSceneDuration(250);
    await page.getByRole('button', { name: 'Project assets' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
    await page.getByRole('menuitem', { name: 'Video…' }).click();
    await (
      await chooser
    ).setFiles({
      name: `dims-${String(W)}x${String(H)}.avi`,
      mimeType: 'video/x-msvideo',
      buffer: bgraAvi(W, H, motionFrames(W, H, 6)),
    });
    await expect(page.locator('[data-testid="video-probe-meta"]')).toContainText(
      `${String(W)}×${String(H)}`,
    );
    await page.getByRole('button', { name: 'Convert & import' }).click();
    // The modal VERIFIES playability (seek sweep + playback span) before storing —
    // reaching the RESULT panel already proves the produced WebM plays; the explicit
    // check below re-proves it from the STORED bytes (guarding the store path too).
    await page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
    await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();
    const decode = await page.evaluate(async () => {
      const assets = await window.cg.assets.list();
      const vid = assets.find((a) => a.kind === 'video');
      if (vid === undefined) return { ok: false as const, why: 'no stored video asset' };
      const url = await window.cg.assets.url(vid.assetId);
      if (url === null) return { ok: false as const, why: 'url() returned null' };
      return await new Promise<{ ok: boolean; why: string }>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'auto';
        v.muted = true;
        const t = setTimeout(() => resolve({ ok: false, why: 'decode timeout' }), 10_000);
        v.onloadeddata = () => {
          clearTimeout(t);
          resolve({
            ok: v.duration > 0,
            why: `decoded ${String(v.videoWidth)}x${String(v.videoHeight)} dur=${String(v.duration)}`,
          });
        };
        v.onerror = () => {
          clearTimeout(t);
          resolve({ ok: false, why: `decode error: ${v.error?.message ?? 'unknown'}` });
        };
        v.src = url;
      });
    });
    expect(decode, decode.why).toMatchObject({ ok: true });
    expect(decode.why).toContain(`decoded ${String(W)}x${String(H)}`);
  });
}

// Generates the COMMITTED MOTION fixture for the D-128 lossy-alpha-leak E2E: a 64×64,
// 25 fps, 1.2 s rawvideo+BGRA AVI with PREMULTIPLIED alpha where a soft-edged textured
// particle ORBITS the centre — motion on EVERY frame. The four 10×10 CORNER regions are
// permanently transparent in every source frame (the orbit never reaches them), so the
// E2E can assert that source-transparent pixels stay transparent across MOTION frames —
// the case a static single-frame fixture let slip through three rounds of fixes.
// Requires system ffmpeg on PATH. Run once from the repo root:
//
//   node tools/spikes/video-convert/make-motion-fixture.mjs
//
// Writes BOTH the spike copy and the committed E2E fixture.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 64,
  H = 64,
  FPS = 25,
  FRAMES = 30;
const CX = 32,
  CY = 32,
  ORBIT = 12,
  R = 7,
  EDGE = 5; // max reach 12+7+5=24 < 32-10 ⇒ corners stay clear

let seed = 20260724;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const tex = new Float32Array(64 * 64);
for (let i = 0; i < tex.length; i++) tex[i] = 0.7 + rnd() * 0.3;

const frames = [];
for (let f = 0; f < FRAMES; f++) {
  const ang = (f / FRAMES) * Math.PI * 2;
  const px = CX + ORBIT * Math.cos(ang);
  const py = CY + ORBIT * Math.sin(ang);
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
      let a = 0;
      if (d <= R) a = 255;
      else if (d < R + EDGE) {
        const e = (d - R) / EDGE;
        a = Math.round(255 * Math.exp(-4 * e * e));
      }
      if (a > 0) {
        const t = tex[(y << 6) | x];
        const i = (y * W + x) * 4;
        // BGRA, premultiplied gold
        buf[i] = Math.round((Math.round(40 * t) * a) / 255);
        buf[i + 1] = Math.round((Math.round(215 * t) * a) / 255);
        buf[i + 2] = Math.round((Math.round(255 * t) * a) / 255);
        buf[i + 3] = a;
      }
    }
  }
  frames.push(buf);
}

const spikeDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(spikeDir, '..', '..', '..');
const tmp = join(spikeDir, 'motion-src.raw');
writeFileSync(tmp, Buffer.concat(frames));

const outs = [
  join(spikeDir, 'fixtures', 'motion-64x64-premult-bgra.avi'),
  join(repoRoot, 'apps', 'designer', 'tests', 'e2e', 'fixtures', 'motion-64x64-premult-bgra.avi'),
];
let status = 0;
for (const out of outs) {
  mkdirSync(join(out, '..'), { recursive: true });
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'bgra',
      '-s',
      `${W}x${H}`,
      '-framerate',
      String(FPS),
      '-i',
      tmp,
      '-c:v',
      'rawvideo',
      '-pix_fmt',
      'bgra',
      out,
    ],
    { stdio: 'inherit' },
  );
  status ||= r.status ?? 1;
}
rmSync(tmp, { force: true });
process.exit(status);

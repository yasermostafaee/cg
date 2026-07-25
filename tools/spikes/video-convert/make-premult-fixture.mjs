// Generates the COMMITTED partial-alpha fixture for the D-128 black-fringe E2E:
// a 64×64, 1.0 s, 25 fps rawvideo+BGRA AVI carrying PREMULTIPLIED (matted-against-
// black) alpha — the exact convention of the legacy AE / archive sources that
// showed the fringe. Layout (constant across frames, so the E2E can sample a stable
// pixel): LEFT half fully-opaque gold; RIGHT half HALF-alpha gold, stored
// premultiplied (RGB already darkened toward black). A correct converter
// un-premultiplies the right half back to straight gold; the buggy one leaves it
// darkened. Requires system ffmpeg on PATH. Run once from the repo root:
//
//   node tools/spikes/video-convert/make-premult-fixture.mjs
//
// It writes BOTH the spike copy and the committed E2E fixture.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 64,
  H = 64,
  FPS = 25,
  FRAMES = 25;
const GOLD = [255, 215, 0]; // straight R,G,B
const RIGHT_ALPHA = 128; // half-transparent right half

// One BGRA frame, premultiplied.
const frame = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const a = x < W / 2 ? 255 : RIGHT_ALPHA;
    // BGRA byte order; RGB premultiplied by alpha (matte against black)
    frame[i] = Math.round((GOLD[2] * a) / 255); // B = 0
    frame[i + 1] = Math.round((GOLD[1] * a) / 255); // G
    frame[i + 2] = Math.round((GOLD[0] * a) / 255); // R
    frame[i + 3] = a; // A
  }
}
const raw = Buffer.concat(Array.from({ length: FRAMES }, () => frame));

const spikeDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(spikeDir, '..', '..', '..');
const tmp = join(spikeDir, 'premult-src.raw');
writeFileSync(tmp, raw);

const outs = [
  join(spikeDir, 'fixtures', 'gradient-64x64-premult-bgra.avi'),
  join(repoRoot, 'apps', 'designer', 'tests', 'e2e', 'fixtures', 'gradient-64x64-premult-bgra.avi'),
];
let status = 0;
for (const out of outs) {
  mkdirSync(join(out, '..'), { recursive: true });
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-framerate', String(FPS),
      '-i', tmp,
      '-c:v', 'rawvideo', '-pix_fmt', 'bgra',
      out,
    ],
    { stdio: 'inherit' },
  );
  status ||= r.status ?? 1;
}
rmSync(tmp, { force: true });
process.exit(status);

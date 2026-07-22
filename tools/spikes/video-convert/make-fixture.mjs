// Generates the COMMITTED tiny fixture: a 64×64, 1.6 s, 25 fps rawvideo+BGRA AVI with
// REAL alpha (a red box crawling over full transparency). Requires system ffmpeg on PATH.
// Run once from the repo root:
//
//   node tools/spikes/video-convert/make-fixture.mjs
//
// The exact command (for reproducibility without node):
//
//   ffmpeg -y -f lavfi -i "color=c=black@0.0:s=64x64:r=25:d=1.6,format=rgba" \
//          -f lavfi -i "color=c=red:s=16x16:r=25:d=1.6" \
//          -filter_complex "[0][1]overlay=x='mod(t*40,48)':y=24:format=auto,format=bgra" \
//          -c:v rawvideo -pix_fmt bgra \
//          tools/spikes/video-convert/fixtures/box-64x64-bgra.avi

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(fileURLToPath(new URL('.', import.meta.url)));
mkdirSync(join(dir, 'fixtures'), { recursive: true });

const out = join(dir, 'fixtures', 'box-64x64-bgra.avi');
const r = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black@0.0:s=64x64:r=25:d=1.6,format=rgba',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=16x16:r=25:d=1.6',
    '-filter_complex',
    "[0][1]overlay=x='mod(t*40,48)':y=24:format=auto,format=bgra",
    '-c:v',
    'rawvideo',
    '-pix_fmt',
    'bgra',
    out,
  ],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);

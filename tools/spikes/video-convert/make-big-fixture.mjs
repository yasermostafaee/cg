// Generates a GITIGNORED multi-GB rawvideo+BGRA AVI locally, so bounded-memory WORKERFS
// behavior is measurable without the client's real archive file. Requires system ffmpeg.
//
//   node tools/spikes/video-convert/make-big-fixture.mjs [seconds=10]
//
// 1920×1080 BGRA at 25 fps ≈ 8.29 MB/frame → 10 s ≈ 2.07 GB (ffmpeg writes OpenDML
// AVI automatically past the classic size limit). Output: fixtures/big/ (gitignored).

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(fileURLToPath(new URL('.', import.meta.url)));
mkdirSync(join(dir, 'fixtures', 'big'), { recursive: true });

const seconds = Number(process.argv[2] ?? 10);
const out = join(dir, 'fixtures', 'big', `big-1080p-bgra-${seconds}s.avi`);
const d = String(seconds);
const r = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=black@0.0:s=1920x1080:r=25:d=${d},format=rgba`,
    '-f',
    'lavfi',
    '-i',
    `color=c=red:s=240x240:r=25:d=${d}`,
    '-filter_complex',
    "[0][1]overlay=x='mod(t*400,1680)':y=420:format=auto,format=bgra",
    '-c:v',
    'rawvideo',
    '-pix_fmt',
    'bgra',
    out,
  ],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);

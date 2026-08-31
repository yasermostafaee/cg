#!/usr/bin/env node
// `B-174` — measure the PAGE/MIXER skew `k` in CHANNEL FRAMES, on this machine, and print
// it as a DISTRIBUTION over N runs.
//
// Usage:
//   cg-skew --media-dir "D:\programs\casparcg-server-v2.5.0-stable-windows\media"
//   cg-skew --media-dir <dir> --mode 1080i5000 --runs 10 --out evidence/2026-08-31
//   cg-skew --media-dir <dir> --with-play-switch      # ALSO measure B-155's window
//
// It changes NOTHING about the product. It records the channel through a second consumer,
// drives ONE look switch through `CasparRuntime.setActiveLook`, and reads the two
// transitions back by pixel comparison. The channel mode is set for the run and RESTORED.
//
// Requires: a reachable CasparCG (default 127.0.0.1:5250) and ffmpeg/ffprobe on PATH (or
// `CG_FFMPEG_DIR` pointing at the folder that holds them).

import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OPTIONS, measureSkew } from '../dist/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const mediaDir = args['media-dir'] ?? process.env.CG_SKEW_MEDIA_DIR;
if (typeof mediaDir !== 'string' || mediaDir.length === 0) {
  console.error(
    'cg-skew: --media-dir is required — it is the CasparCG media folder the file consumer\n' +
      '         writes into and the source clips are generated in.',
  );
  process.exit(2);
}
if (!fs.existsSync(mediaDir)) {
  console.error(`cg-skew: media dir does not exist: ${mediaDir}`);
  process.exit(2);
}

const outDir = path.resolve(
  typeof args.out === 'string' ? args.out : path.join(HERE, '..', 'evidence', stamp()),
);

const options = {
  ...DEFAULT_OPTIONS,
  casparHost: typeof args.host === 'string' ? args.host : DEFAULT_OPTIONS.casparHost,
  amcpPort: numeric(args.port, DEFAULT_OPTIONS.amcpPort),
  channel: numeric(args.channel, DEFAULT_OPTIONS.channel),
  mediaDir,
  mode: typeof args.mode === 'string' ? args.mode : DEFAULT_OPTIONS.mode,
  runs: numeric(args.runs, DEFAULT_OPTIONS.runs),
  outDir,
  settleMs: numeric(args['settle-ms'], DEFAULT_OPTIONS.settleMs),
  tailMs: numeric(args['tail-ms'], DEFAULT_OPTIONS.tailMs),
  withPlaySwitch: args['with-play-switch'] === true,
};

function numeric(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

// The report goes to stdout directly — the repo's lint tier reserves `console.log`.
const print = (text = '') =>
  process.stdout.write(`${text}
`);

function fmt(d) {
  if (d.n === 0) return 'no usable runs';
  return `n=${d.n}  min=${d.min}  median=${d.median}  max=${d.max}  [${d.values.join(', ')}]`;
}

const report = await measureSkew(options);

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf-8');

function line(run, playExpected = false) {
  const a = run.probeA.index ?? '-';
  const b = run.probeB.index ?? '-';
  // In the B-174 section a PLAY disqualifies the run (it would be B-155's window); in the
  // B-155 section the PLAY is the whole point and its absence already discarded the run.
  const verdict =
    run.kChannel === null
      ? `DISCARDED — ${run.reason}`
      : run.containedPlay && !playExpected
        ? 'EXCLUDED (a PLAY was in the window — that is B-155, not B-174)'
        : `k = ${run.kChannel} channel frames (${run.kRecorded} recorded, ${run.kMs} ms)`;
  const events = playExpected
    ? `  events A=[${run.probeAEvents.join(',')}] B=[${run.probeBEvents.join(',')}]`
    : '';
  return (
    `run ${String(run.index).padStart(2, '0')}  ` +
    `frames=${run.frames}/${run.expectedFrames} @ ${run.frameRate} over ${run.windowMs}ms  ` +
    `A@${a} (d=${run.probeA.magnitude.toFixed(1)} thr=${run.probeA.threshold.toFixed(1)})  ` +
    `B@${b} (d=${run.probeB.magnitude.toFixed(1)} thr=${run.probeB.threshold.toFixed(1)})  ${verdict}${events}`
  );
}

print('');
print('== B-174 -- PAGE/MIXER SKEW ==========================================');
print(
  `channel mode        : ${report.mode}   (INFO framerate ${report.reportedFramerate} = FIELD rate)`,
);
print(`channel frame       : ${report.channelFramePeriodMs} ms`);
print(`recorded frame      : 1 channel frame = ${report.fieldsPerChannelFrame} recorded frame(s)`);
print('');
for (const run of report.runs) print(line(run));
print('');
print(`k, in CHANNEL FRAMES : ${fmt(report.kChannelFrames)}`);
print(`k, in MILLISECONDS   : ${fmt(report.kMilliseconds)}`);

if (report.playSwitch !== undefined) {
  print('');
  print('== B-155 -- the switch that CARRIES A PLAY (a DIFFERENT item) =========');
  for (const run of report.playSwitch.runs) print(line(run, true));
  print(`B-155 window, CHANNEL FRAMES : ${fmt(report.playSwitch.kChannelFrames)}`);
  print(`B-155 window, MILLISECONDS   : ${fmt(report.playSwitch.kMilliseconds)}`);
}
print('');
print(`recordings + report.json -> ${outDir}`);

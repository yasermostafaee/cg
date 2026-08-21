#!/usr/bin/env node
// PROBE/TOOL — C-016 / C-023 confidence-grab measurement kit. See src/confidence-probe.ts.
//
// It MEASURES and never decides. Safety, restated where an operator will read it:
//   - nothing is ever PLAYed on the channel being measured;
//   - every clear names a layer — never a bare channel-wide CLEAR;
//   - §3.4 REFUSES to run without a --probe-channel that differs from --channel.
import * as fs from 'node:fs';
import { runConfidenceProbe, summarise } from '../dist/confidence-probe.js';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const num = (n, d) => {
  const v = arg(n, null);
  return v === null || v === undefined ? d : Number(v);
};
const opt = (n) => {
  const v = arg(n, null);
  return v === null || v === undefined ? null : v;
};
const list = (n) => {
  const v = opt(n);
  return v === null ? [] : v.split(';').filter((s) => s.length > 0);
};

if (process.argv.includes('--help')) {
  process.stdout.write(
    [
      'confidence-probe — measure the cost of a CasparCG frame grab (C-016 / C-023 recon)',
      '',
      '  --caspar-host HOST     default 127.0.0.1',
      '  --caspar-port PORT     default 5250',
      '  --osc-port PORT        default 6250   (passive; no OSC is fine, addresses are then empty)',
      '  --channel N            the channel to MEASURE, normally programme. Never played onto.',
      '  --probe-channel N      a channel carrying NO air, for the load template and for §3.4.',
      '  --probe-layer N        default 90     (on --probe-channel)',
      '  --route-from-layer N   the air layer §3.4(a) routes FROM. Omit to skip that path.',
      '  --input-arg ARG        a producer argument for §3.4(b): the physical input, opened twice.',
      '  --load-template-url U  an html URL to animate for the under-load case. Omit to skip.',
      '  --load-layer N         default 91     (on --probe-channel)',
      '  --cadence-hz N         default 1',
      '  --cadence-ms N         default 300000 (5 minutes — do not shorten; see §3.3)',
      '  --rest-grabs N         default 10',
      '  --media-root DIRS      semicolon-separated dirs to look for the artifact in',
      '  --reply-wait-ms N      default 350',
      '  --out FILE             write the machine-readable JSON here',
      '',
      'Every number it prints is a measurement. It chooses no mechanism and fixes nothing.',
      '',
    ].join('\n'),
  );
  process.exit(0);
}

const outPath = opt('out');
const result = await runConfidenceProbe({
  casparHost: arg('caspar-host', '127.0.0.1'),
  casparPort: num('caspar-port', 5250),
  oscPort: num('osc-port', 6250),
  channel: num('channel', 1),
  probeChannel: opt('probe-channel') === null ? null : num('probe-channel', 0),
  probeLayer: num('probe-layer', 90),
  routeFromLayer: opt('route-from-layer') === null ? null : num('route-from-layer', 0),
  inputArg: opt('input-arg'),
  loadTemplateUrl: opt('load-template-url'),
  loadLayer: num('load-layer', 91),
  cadenceHz: num('cadence-hz', 1),
  cadenceMs: num('cadence-ms', 300000),
  restGrabs: num('rest-grabs', 10),
  mediaRoots: list('media-root'),
  replyWaitMs: num('reply-wait-ms', 350),
  outPath,
});

process.stdout.write(`${summarise(result)}\n`);
if (outPath !== null) {
  process.stdout.write(
    `\nJSON written to ${outPath} (${String(fs.statSync(outPath).size)} bytes)\n`,
  );
}

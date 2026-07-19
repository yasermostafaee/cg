#!/usr/bin/env node
// PROBE/TOOL — CG STOP + CG NEXT behaviour on an HTML producer. See src/lifecycle-probe.ts.
import { runLifecycleProbe } from '../dist/lifecycle-probe.js';
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const steps = await runLifecycleProbe({
  casparHost: arg('caspar-host', '127.0.0.1'),
  casparPort: Number(arg('caspar-port', '5250')),
  oscPort: Number(arg('osc-port', '6250')),
  serveHost: arg('serve-host', '127.0.0.1'),
  servePort: Number(arg('serve-port', '7901')),
  channel: Number(arg('channel', '1')),
  layer: Number(arg('layer', '45')),
  flashLayer: Number(arg('flash-layer', '0')),
  outPrefix: arg('out', 'lifecycle'),
  observeMs: Number(arg('observe-ms', '1200')),
});
for (const s of steps) {
  process.stdout.write(`\n[${s.label}]
`);
  if (s.cmd)
    process.stdout.write(`  send : ${s.cmd}
`);
  if (s.reply)
    process.stdout.write(`  reply: ${s.reply}
`);
  if ('oscProducer' in s)
    process.stdout
      .write(`  osc  : ${s.oscProducer === null ? 'SILENT (no producer message)' : s.oscProducer}
`);
  if (s.lifecycle?.length)
    process.stdout.write(`  js   : ${s.lifecycle.join(', ')}
`);
}

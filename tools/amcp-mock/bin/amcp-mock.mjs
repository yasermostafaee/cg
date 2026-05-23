#!/usr/bin/env node
// CLI wrapper around @cg/amcp-mock.
//
// Usage:
//   amcp-mock                                          # 5250 + 6250, single channel
//   amcp-mock --amcp-port 15250 --osc-port 16250
//   amcp-mock --osc-host 192.168.1.5 --osc-port 6250   # push OSC to another box
//   amcp-mock --channels 2 --osc-hz 50
//   amcp-mock --trace ./session.ndjson

import { createMock } from '../dist/index.js';

const args = parseArgs(process.argv.slice(2));

const opts = {
  amcpPort: args['amcp-port'] !== undefined ? Number(args['amcp-port']) : 5250,
  oscPort: args['osc-port'] !== undefined ? Number(args['osc-port']) : 6250,
  oscHost: args['osc-host'] ?? '127.0.0.1',
  host: args.host ?? '127.0.0.1',
  oscHz: args['osc-hz'] !== undefined ? Number(args['osc-hz']) : 10,
  channels: args.channels !== undefined ? Number(args.channels) : 1,
  tracePath: args.trace,
  disableOsc: Boolean(args['no-osc']),
};

const handle = await createMock(opts);

console.error(`[amcp-mock] AMCP listening on ${opts.host}:${handle.amcpPort}`);
console.error(`[amcp-mock] OSC sending from ${opts.host}:${handle.oscPort} → ${opts.oscHost}:${opts.oscPort}`);
if (opts.tracePath) console.error(`[amcp-mock] tracing to ${opts.tracePath}`);

const shutdown = async () => {
  console.error('[amcp-mock] stopping');
  await handle.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

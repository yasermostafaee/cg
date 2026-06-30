#!/usr/bin/env node
// CLI wrapper around @cg/caspar-bridge (C-001).
//
// Usage:
//   caspar-bridge                                     # ws://127.0.0.1:5280, CasparCG on 127.0.0.1:5250/6250
//   caspar-bridge --port 5280
//   caspar-bridge --caspar-host 192.168.1.50 --amcp-port 5250 --osc-port 6250
//   caspar-bridge --host 0.0.0.0 --port 5280          # opt-in LAN exposure of the WS (NOT default)

import { createBridge } from '../dist/index.js';

const args = parseArgs(process.argv.slice(2));

// Build the CasparCG connection (server A) from flags, falling back to defaults.
const connection =
  args['caspar-host'] !== undefined ||
  args['amcp-port'] !== undefined ||
  args['osc-port'] !== undefined
    ? {
        servers: {
          A: {
            host: args['caspar-host'] ?? '127.0.0.1',
            amcpPort: args['amcp-port'] !== undefined ? Number(args['amcp-port']) : 5250,
            oscPort: args['osc-port'] !== undefined ? Number(args['osc-port']) : 6250,
          },
          B: {
            host: args['caspar-host'] ?? '127.0.0.1',
            amcpPort: args['amcp-port'] !== undefined ? Number(args['amcp-port']) + 1 : 5251,
            oscPort: args['osc-port'] !== undefined ? Number(args['osc-port']) + 1 : 6251,
          },
        },
        strategy: 'mirror-sync',
        autoFailoverEnabled: true,
      }
    : undefined;

const handle = await createBridge({
  host: args.host,
  port: args.port !== undefined ? Number(args.port) : undefined,
  connection,
});

console.error(`[caspar-bridge] WS listening on ${handle.url} → CasparCG via @cg/caspar-client`);
console.error(
  `[caspar-bridge] template HTTP server on ${handle.templateServe.url}/template/<id>` +
    (handle.templateServe.exposed ? ' (LAN-exposed)' : ' (loopback)'),
);

const shutdown = async () => {
  console.error('[caspar-bridge] stopping');
  await handle.close();
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

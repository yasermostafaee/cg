#!/usr/bin/env node
// CLI wrapper around @cg/caspar-bridge (C-001).
//
// Usage:
//   caspar-bridge                                     # ws://127.0.0.1:5280, single CasparCG on 127.0.0.1:5250/6250
//   caspar-bridge --port 5280
//   caspar-bridge --caspar-host 192.168.1.50 --amcp-port 5250 --osc-port 6250
//   caspar-bridge --backup-host 192.168.1.51          # declare a REAL backup (B-046: never assumed)
//   caspar-bridge --backup-host 127.0.0.1 --backup-amcp-port 5251 --backup-osc-port 6251
//   caspar-bridge --host 0.0.0.0 --port 5280          # opt-in LAN exposure of the WS (NOT default)

import { createBridge } from '../dist/index.js';

const args = parseArgs(process.argv.slice(2));

// Build the CasparCG connection from flags, falling back to defaults.
// B-046 — server B exists ONLY when a --backup-* flag declares it; the
// default is single-server (a phantom backup diverges every send, replays
// the journal at a dead queue, and churns health forever).
const hasPrimaryFlags =
  args['caspar-host'] !== undefined ||
  args['amcp-port'] !== undefined ||
  args['osc-port'] !== undefined;
const hasBackupFlags =
  args['backup-host'] !== undefined ||
  args['backup-amcp-port'] !== undefined ||
  args['backup-osc-port'] !== undefined;

const connection =
  hasPrimaryFlags || hasBackupFlags
    ? {
        servers: {
          A: {
            host: args['caspar-host'] ?? '127.0.0.1',
            amcpPort: args['amcp-port'] !== undefined ? Number(args['amcp-port']) : 5250,
            oscPort: args['osc-port'] !== undefined ? Number(args['osc-port']) : 6250,
          },
          ...(hasBackupFlags
            ? {
                B: {
                  host: args['backup-host'] ?? '127.0.0.1',
                  amcpPort:
                    args['backup-amcp-port'] !== undefined
                      ? Number(args['backup-amcp-port'])
                      : 5251,
                  oscPort:
                    args['backup-osc-port'] !== undefined ? Number(args['backup-osc-port']) : 6251,
                },
              }
            : {}),
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

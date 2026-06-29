#!/usr/bin/env node
// CLI wrapper around @cg/caspar-bridge (C-001 Phase 1).
//
// Usage:
//   caspar-bridge                         # ws://127.0.0.1:5280 (loopback only)
//   caspar-bridge --port 5280
//   caspar-bridge --host 0.0.0.0 --port 5280   # opt-in LAN exposure (NOT default)

import { createBridge } from '../dist/index.js';

const args = parseArgs(process.argv.slice(2));

const handle = await createBridge({
  host: args.host,
  port: args.port !== undefined ? Number(args.port) : undefined,
});

console.error(`[caspar-bridge] listening on ${handle.url} (Phase 1 in-memory backing)`);

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

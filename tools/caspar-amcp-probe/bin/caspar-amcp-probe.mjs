#!/usr/bin/env node
// CasparCG AMCP probe harness (real-hardware spikes).
//
// Two modes:
//   (default) ADR-0006 update-SEQUENCE sweep — which load/update/stop verbs deliver
//             a JSON payload to window.update.
//   --sweep   B-041 ESCAPE-matrix sweep — fixed CG ADD+UPDATE verbs, varying the
//             AMCP escaping of a hard payload (", \ ×1-4, newline, tab, Persian),
//             to discover which escaping round-trips byte-exact to JSON.parse.
//
// Usage:
//   caspar-amcp-probe --caspar-host 192.168.1.50 --caspar-port 5250
//   caspar-amcp-probe --sweep --caspar-host 192.168.1.50 --serve-host 192.168.1.10
//   caspar-amcp-probe --sweep --channel 1 --layer 10
//
// Key flags:
//   --sweep                      run the B-041 escape-matrix (default: ADR-0006 verbs)
//   --caspar-host/--caspar-port  AMCP endpoint (default 127.0.0.1:5250)
//   --serve-host                 host CasparCG uses to reach THIS machine
//                                (default: a guessed LAN IP) — set it if wrong
//   --serve-port                 probe HTTP + WS beacon port (default 7900)
//   --channel/--layer            CasparCG slot (default 1-10)
//   --flash-layer                CG flash-layer index (default 0; --sweep only)
//   --probe-url                  override the probe URL (disables serving; verbs mode)
//   --out                        output file prefix

import { runProbe, guessLanHost } from '../dist/run.js';
import { runEscapeSweep } from '../dist/escape-sweep.js';

const args = parseArgs(process.argv.slice(2));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const sweep = args.sweep === true || args.mode === 'escape-sweep';

const common = {
  casparHost: args['caspar-host'] ?? '127.0.0.1',
  casparPort: num(args['caspar-port'], 5250),
  serveHost: args['serve-host'] ?? guessLanHost(),
  servePort: num(args['serve-port'], 7900),
  channel: num(args.channel, 1),
  layer: num(args.layer, 10),
  settleMs: num(args['settle-ms'], 400),
  loadWaitMs: num(args['load-wait-ms'], 8000),
  updateWaitMs: num(args['update-wait-ms'], 4000),
};

try {
  if (sweep) {
    await runEscapeSweep({
      ...common,
      flashLayer: num(args['flash-layer'], 0),
      outPrefix: typeof args.out === 'string' ? args.out : `caspar-escape-sweep-${stamp}`,
    });
  } else {
    await runProbe({
      ...common,
      probeUrl: typeof args['probe-url'] === 'string' ? args['probe-url'] : undefined,
      outPrefix: typeof args.out === 'string' ? args.out : `caspar-amcp-probe-${stamp}`,
    });
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(`[probe] FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

function num(v, fallback) {
  return v !== undefined && v !== true ? Number(v) : fallback;
}

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

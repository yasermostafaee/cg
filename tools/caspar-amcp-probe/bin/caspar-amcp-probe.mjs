#!/usr/bin/env node
// C-001 Phase 3b — AMCP HTML-producer update-sequence harness (ADR 0006).
//
// Runs a matrix of candidate load/update/stop sequences against a real
// CasparCG 2.3.2 and reports which delivers a Persian-laden JSON payload to
// window.update. See README.md for the full runbook.
//
// Usage:
//   caspar-amcp-probe --caspar-host 192.168.1.50 --caspar-port 5250
//   caspar-amcp-probe --caspar-host 192.168.1.50 --serve-host 192.168.1.10
//   caspar-amcp-probe --channel 1 --layer 10
//   caspar-amcp-probe --probe-url "file:///C:/probe/probe.html"   # serve elsewhere
//
// Key flags:
//   --caspar-host/--caspar-port  AMCP endpoint (default 127.0.0.1:5250)
//   --serve-host                 host CasparCG uses to reach THIS machine
//                                (default: a guessed LAN IP) — set it if wrong
//   --serve-port                 probe HTTP + WS beacon port (default 7900)
//   --channel/--layer            CasparCG slot (default 1-10)
//   --probe-url                  override the probe URL (disables serving)
//   --out                        output file prefix

import { runProbe, guessLanHost } from '../dist/run.js';

const args = parseArgs(process.argv.slice(2));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

const opts = {
  casparHost: args['caspar-host'] ?? '127.0.0.1',
  casparPort: num(args['caspar-port'], 5250),
  serveHost: args['serve-host'] ?? guessLanHost(),
  servePort: num(args['serve-port'], 7900),
  channel: num(args.channel, 1),
  layer: num(args.layer, 10),
  probeUrl: typeof args['probe-url'] === 'string' ? args['probe-url'] : undefined,
  settleMs: num(args['settle-ms'], 400),
  loadWaitMs: num(args['load-wait-ms'], 8000),
  updateWaitMs: num(args['update-wait-ms'], 4000),
  outPrefix: typeof args.out === 'string' ? args.out : `caspar-amcp-probe-${stamp}`,
};

try {
  await runProbe(opts);
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

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
//   caspar-bridge --persist-path C:\cg\conn.json      # R-010: where the applied config persists
//   caspar-bridge --fixed-layers-path C:\cg\fixed.json  # R-021: the fixed operator layer bank
//   caspar-bridge --reserved-layers 60-69             # R-028/C-015: the playout system's layers
//   caspar-bridge --templates-dir C:\cg\templates     # R-028: where the template library persists
//
// R-010 boot precedence: explicit --caspar-*/--backup-* flags > the persisted
// config file (~/.cg-runtime/bridge-connection.json by default) > built-in
// single-server default. The settings panel's Apply persists to that file.
//
// R-021: the fixed bank loads from --fixed-layers-path
// (~/.cg-runtime/bridge-fixed-layers.json by default). ABSENT file = the
// BUILT-IN DEFAULT bank (channel 1, layers 70–99, the top five ticked), so a
// machine that has never been configured comes up correct and a new station
// needs nothing copied to it. The file records a DEVIATION from that default;
// it does not supply the default. A PRESENT but invalid file is a HARD boot
// failure (never silently ignored — an operator must not believe a layer is
// fenced when it is not).
//
// R-028/C-015: the reserved playout layers load from --reserved-layers (a
// range list like `60-69` or `60-69,105`) or --reserved-layers-path
// (~/.cg-runtime/bridge-reserved-layers.json by default). Same doctrine as the
// fixed bank: ABSENT file = nothing reserved; PRESENT but invalid = HARD boot
// failure — a silently-dropped reservation would let our graphics land on the
// company's playout layers.
//
// R-028: the template library persists under --templates-dir
// (~/.cg-runtime/bridge-templates by default), one JSON file per template, so
// a bridge restart does not empty the library any browser sees.

import * as os from 'node:os';
import * as path from 'node:path';
import { createBridge, parseReservedLayersFlag } from '../dist/index.js';

const args = parseArgs(process.argv.slice(2));

const persistPath =
  typeof args['persist-path'] === 'string'
    ? args['persist-path']
    : path.join(os.homedir(), '.cg-runtime', 'bridge-connection.json');

// R-021 — mirrors --persist-path, EXCEPT for what an absent file means: here it
// means the built-in default bank, not "no bank" (see the header).
const fixedLayersPath =
  typeof args['fixed-layers-path'] === 'string'
    ? args['fixed-layers-path']
    : path.join(os.homedir(), '.cg-runtime', 'bridge-fixed-layers.json');

// R-028/C-015 — the reserved playout layers: explicit flag > persisted file.
// A flag given WITHOUT a value is a hard boot error, never silently ignored —
// the operator believes a reservation is in force, and a dropped one would let
// our graphics land on the playout layers (the store's fail-closed doctrine).
if (args['reserved-layers'] === true) {
  console.error(
    '[caspar-bridge] --reserved-layers needs a value (e.g. --reserved-layers 60-69). ' +
      'Refusing to boot without it rather than silently reserving nothing.',
  );
  process.exit(1);
}
const reservedLayers =
  typeof args['reserved-layers'] === 'string'
    ? parseReservedLayersFlag(args['reserved-layers'])
    : undefined;
const reservedLayersPath =
  typeof args['reserved-layers-path'] === 'string'
    ? args['reserved-layers-path']
    : path.join(os.homedir(), '.cg-runtime', 'bridge-reserved-layers.json');

// R-028 — the persisted template library (one JSON file per template).
const templatesDir =
  typeof args['templates-dir'] === 'string'
    ? args['templates-dir']
    : path.join(os.homedir(), '.cg-runtime', 'bridge-templates');

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
  persistPath,
  fixedLayersPath,
  reservedLayers,
  reservedLayersPath,
  templatesDir,
});

console.error(`[caspar-bridge] WS listening on ${handle.url} → CasparCG via @cg/caspar-client`);
console.error(`[caspar-bridge] candidate layers: ${describeFixedBank(handle.fixedBankSource)}`);
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

/**
 * The bank in force, in one line, WITH WHERE IT CAME FROM.
 *
 * On 2026-08-01 two machines were running different candidate banks — one
 * 70–73, one 70–99 — and nothing anywhere said so, because the only thing
 * either machine ever showed was the bank itself. A bank without its source
 * cannot answer "why this one, and what do I change?", which is the question
 * that actually cost the morning. This does not DETECT a stale file; it
 * reports what governs, every boot, in the terminal the bridge starts in.
 */
function describeFixedBank({ bank, source }) {
  if (bank === null) return 'none declared (no --fixed-layers-path configured)';
  const end = bank.start + bank.count - 1;
  let shown = 0;
  for (let layer = bank.start; layer <= end; layer++) {
    if (bank.visibility?.[String(layer)] !== false) shown++;
  }
  // ASCII only, deliberately: the Windows console this prints to renders an
  // en-dash as mojibake, and a line whose whole job is to be READ must not
  // arrive with garbage in the middle of the layer range.
  const where =
    source === 'file'
      ? fixedLayersPath
      : source === 'built-in default'
        ? `built-in default (no file at ${fixedLayersPath})`
        : source;
  return (
    `channel ${bank.channel}, layers ${bank.start}-${end} ` +
    `(${bank.count} declared, ${shown} shown) - from ${where}`
  );
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

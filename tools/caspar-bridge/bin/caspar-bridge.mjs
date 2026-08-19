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
//   caspar-bridge --source-catalog-path C:\cg\sources.json      # D-137/C-015: the lives this plant has
//   caspar-bridge --source-assignments-path C:\cg\plates.json   # D-137/C-015: which live each plate uses
//   caspar-bridge --live-layers-path C:\cg\live.json         # B-145: where the live-layer ledger persists
//   caspar-bridge --no-live-layers                    # B-145: deliberately DO NOT persist it
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
//
// D-137/C-015: LIVE SOURCES are TWO files, because they are two independent
// facts. The CATALOG (--source-catalog-path,
// ~/.cg-runtime/bridge-source-catalog.json by default) is the list of lives this
// plant HAS — each with a generated id, a human name and its producer. The
// ASSIGNMENTS (--source-assignments-path,
// ~/.cg-runtime/bridge-source-assignments.json by default) say which of those
// lives each template's each PLATE uses. The catalog is built with no reference
// to any template; one deliberate operator action joins them.
//
// ABSENT file = NOTHING DEFINED / NOTHING ASSIGNED, and NO built-in default — a
// default input definition is a guess about hardware nobody here can see, and a
// wrong guess puts the wrong camera behind a guest's frame; with none, nothing
// reaches air and each take refuses legibly. PRESENT but invalid = HARD boot
// failure, because a partially parsed config is worse than none.
//
// ONE deliberate exception, on the assignments alone: an assignment naming a
// source the catalog does not define is PRUNED (loudly, on this line) rather
// than fatal. It has a clear reading — that plate is unassigned — and an
// unassigned plate already refuses its take.
//
// ⚠ NEITHER is under --templates-dir: the template registry reads EVERY *.json
// there as a template, so a config file placed beside the templates warns
// "skipping unusable persisted template" on every boot (B-116).

import * as os from 'node:os';
import * as path from 'node:path';
import { createBridge, parseReservedLayersFlag, resolveLiveLayersPath } from '../dist/index.js';

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

// D-137/C-015 — the Live Source catalog and the per-plate assignments. Each has
// its own path, NEVER inside templatesDir (see the header): the registry would
// read either of them as a template.
const sourceCatalogPath =
  typeof args['source-catalog-path'] === 'string'
    ? args['source-catalog-path']
    : path.join(os.homedir(), '.cg-runtime', 'bridge-source-catalog.json');
const sourceAssignmentsPath =
  typeof args['source-assignments-path'] === 'string'
    ? args['source-assignments-path']
    : path.join(os.homedir(), '.cg-runtime', 'bridge-source-assignments.json');

// 🔴 B-145 — the LIVE LAYER LEDGER: which layers the bridge itself has seated behind a
// template's holes. Unlike every store above, this one is not station CONFIG — it is the
// bridge's own record of what it put on air, and losing it strands a live guest on a layer
// no code path can name, clear or repoint.
//
// So the default is ON and the absence of a flag is not a way to switch it off: saying
// nothing gets ~/.cg-runtime/bridge-live-layers.json, and OFF is `--no-live-layers`, a
// thing you have to type. The first cut of B-145 shipped the store behind an option
// nothing defaulted, which is a safety mechanism the station does not have.
//
// ABSENT file = a first boot, or a bridge that had seated nothing — an EMPTY ledger, and
// not a boot failure. PRESENT but unusable = reported loudly and treated as absent, NOT a
// hard failure like the config stores above: an empty ledger is exactly the pre-B-145
// behaviour, so refusing to boot over a malformed bookkeeping file would take the whole
// console off air to avoid a degradation it lived with for months (see live-layers-store.ts).
if (args['live-layers-path'] === true) {
  console.error(
    '[caspar-bridge] --live-layers-path needs a value (the JSON file the ledger persists to). ' +
      'Use --no-live-layers if you meant to switch persistence off.',
  );
  process.exit(1);
}
const liveLayersPath = resolveLiveLayersPath(
  args['no-live-layers'] === true
    ? false
    : typeof args['live-layers-path'] === 'string'
      ? args['live-layers-path']
      : undefined,
);

// B-141 — the AUDIT LOG, NDJSON, append-only. Same shape as the stores above and
// for the same reason: its own flag, its own default, and NEVER inside
// templatesDir, where `TemplateRegistry` reads every *.json as a template (B-116).
//
// ⚠ Unlike those stores, an unusable audit file is NOT a boot failure. They are
// preconditions for correct playout; this is a RECORD OF what happened. See
// `CasparRuntime`'s audit section.
const auditLogPath =
  typeof args['audit-log-path'] === 'string'
    ? args['audit-log-path']
    : path.join(os.homedir(), '.cg-runtime', 'bridge-audit.ndjson');

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
  sourceCatalogPath,
  sourceAssignmentsPath,
  ...(liveLayersPath !== null ? { liveLayersPath } : {}),
  auditLogPath,
});

console.error(`[caspar-bridge] WS listening on ${handle.url} → CasparCG via @cg/caspar-client`);
console.error(`[caspar-bridge] candidate layers: ${describeFixedBank(handle.fixedBankSource)}`);
console.error(`[caspar-bridge] live sources: ${describeSourceCatalog(handle.sourceCatalog)}`);
console.error(
  `[caspar-bridge] plate assignments: ${describeAssignments(handle.sourceAssignments)}`,
);
console.error(`[caspar-bridge] live layer ledger: ${describeLiveLayers(handle.liveLayers)}`);
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

/**
 * The source CATALOG in force, in one line, WITH WHERE IT CAME FROM.
 *
 * The `candidate layers:` line above is the precedent and this reads the same
 * way, for the same reason plus one that is sharper here: with NO sources,
 * nothing reaches air, and there is no screen anywhere that distinguishes "this
 * station was never configured" from "these plates are simply not bound yet".
 * A machine misconfigured this way is otherwise diagnosable only with a
 * debugger — the operator presses take and gets a refusal naming a plate.
 *
 * ASCII only, deliberately: the Windows console this prints to renders an
 * en-dash as mojibake, and a line whose whole job is to be READ must not arrive
 * with garbage in the middle of a layer range.
 */
function describeSourceCatalog({ value, source }) {
  const band =
    value.layerRange === undefined
      ? 'no layer band declared'
      : `layers ${value.layerRange.start}-${value.layerRange.end}`;
  if (value.sources.length === 0) {
    const why =
      source === 'absent'
        ? `no file at ${sourceCatalogPath}`
        : source === 'none'
          ? 'no --source-catalog-path configured'
          : `from ${source === 'file' ? sourceCatalogPath : source}`;
    // Said plainly, because it is the state in which the feature does nothing:
    // no plate can be assigned, and every take carrying one refuses.
    return `NONE DEFINED (${why}) - a template declaring a Live Source will refuse its take`;
  }
  const names = value.sources.map((s) => s.name).join(', ');
  const where = source === 'file' ? sourceCatalogPath : source;
  return `${value.sources.length} defined (${names}), ${band} - from ${where}`;
}

/**
 * The per-plate ASSIGNMENTS in force, and — the half with no other surface —
 * WHAT THE BOOT PRUNED.
 *
 * A pruned entry is a plate that WAS bound and now is not, because the catalog
 * beside it no longer defines the source (two hand-editable files, restorable
 * apart). It is dropped rather than dangling, and dropping it silently would
 * start a station with a plate the operator believes is assigned.
 */
function describeAssignments({ value, source, pruned }) {
  const where =
    source === 'absent'
      ? `no file at ${sourceAssignmentsPath}`
      : source === 'none'
        ? 'no --source-assignments-path configured'
        : source === 'file'
          ? sourceAssignmentsPath
          : source;
  const head =
    value.assignments.length === 0
      ? `NONE ASSIGNED (${where})`
      : `${value.assignments.length} assigned - from ${where}`;
  if (pruned.length === 0) return head;
  const lost = pruned.map((a) => `${a.templateId}/${a.plateId} -> ${a.sourceId}`).join(', ');
  return `${head} - DROPPED ${pruned.length} naming a source this catalog does not define (${lost})`;
}

/**
 * The LIVE LAYER LEDGER in one line, WITH WHERE IT CAME FROM.
 *
 * The three lines above are the precedent and this reads the same way, for a reason that
 * is sharper here: a bridge that adopted nothing and a bridge that is not persisting at
 * all look identical from every screen — and the second is the pre-B-145 bug, which for
 * one release shipped as the default. This line is what distinguishes them, every boot,
 * in the terminal the bridge starts in.
 *
 * ASCII only, deliberately: the Windows console this prints to renders an en-dash as
 * mojibake, and a line whose whole job is to be READ must not arrive with garbage in it.
 */
function describeLiveLayers({ path: file, source, adopted, unverified, dropped }) {
  // Said plainly, because it IS the bug this item exists to fix: seated producers that a
  // restart makes unreachable. It is reachable only by typing --no-live-layers.
  if (source === 'off' || file === null) {
    return 'NOT PERSISTED (--no-live-layers) - layers seated behind a template hole will NOT survive a restart';
  }
  if (source === 'absent') return `nothing to adopt (no file at ${file}) - persisting from now on`;
  if (source === 'unusable') {
    return `UNUSABLE FILE at ${file} - booted with an EMPTY ledger; any layers still lit from the previous run are unreachable until cleared by hand`;
  }
  const notes = [`${unverified} unverified until the first occupancy reading`];
  if (dropped > 0) notes.push(`${dropped} DROPPED, contradicted by the server`);
  return `adopted ${adopted} item(s) from ${file} (${notes.join(', ')})`;
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

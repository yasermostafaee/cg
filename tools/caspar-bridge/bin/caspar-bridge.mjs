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
//   caspar-bridge --template-serve-host 192.168.21.93 # B-162/C-024: the address CasparCG fetches templates from
//   caspar-bridge --template-serve-port 7911          # B-162: pin the template HTTP port (default: ephemeral)
//   caspar-bridge --look-mixer-hold-ms 40             # B-174: the look switch's mixer hold (default: one
//                                                     #   channel frame of the observed mode; 0 disables)
//   caspar-bridge --create-missing-consumers          # C-029: ADD a consumer casparcg.config declares that
//                                                     #   is not running (default OFF: reported, never created)
//   caspar-bridge --auth playout --playout-issuer http://playout.local:8080
//                 --playout-jwks-url http://playout.local:8080/.well-known/jwks.json
//                                                     # C-037: require a Playout-issued JWT on the control
//                                                     #   socket. Default --auth off = today, byte for byte.
//   caspar-bridge --playout-config-path C:\cg\playout.json  # C-037: where the playout.* group persists
//   caspar-bridge --state-home "C:\Users\op\AppData\Roaming\CG Control"
//                                                     # DESKTOP-APPS-01: every default below resolves under
//                                                     #   <state-home>\.cg-runtime\ instead of ~/.cg-runtime\
//   caspar-bridge --console-dir C:\cg\console --console-port 5174
//                                                     # DESKTOP-APPS-01: serve the built console on its own
//                                                     #   loopback origin (never the template port)
//   caspar-bridge --exit-on-stdin-close               # DESKTOP-APPS-01: stop when the parent's pipe closes
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
import {
  fixedBankEnd,
  fixedBankSlots,
  isLayerVisible,
  isLowBankLayer,
  lowBankEnd,
} from '@cg/shared-ipc';
import {
  CONSOLE_DEFAULT_PORT,
  ConsoleHttpServer,
  createBridge,
  defaultPlayoutConfigPath,
  parseReservedLayersFlag,
  resolveCreateMissingConsumers,
  resolveLiveLayersPath,
} from '../dist/index.js';

const args = parseArgs(process.argv.slice(2));

/*
  🔴 `DESKTOP-APPS-01` — WHOSE `.cg-runtime` THIS STATION USES.

  Every default below is `<home>/.cg-runtime/bridge-*`, and `<home>` is the user's home unless
  `--state-home` names another directory. The desktop app passes its own data directory, so an
  installed CG Control can NEVER fall through to `~/.cg-runtime` — which on a developer's machine
  names a real plant (`PLAYOUT-AUTH-01` met exactly that). The file NAMES do not change, so every
  store, the persisted-files census and every doc about `bridge-*.json` still read the same.

  A valueless flag is a hard boot error, for `--reserved-layers`' reason: the operator believes
  the station's files live somewhere, and a silent fall-through to the home directory is the
  very thing the flag exists to rule out.
*/
for (const flag of ['state-home', 'console-dir', 'console-port']) {
  if (args[flag] === true) {
    console.error(
      `[caspar-bridge] --${flag} needs a value. Refusing to boot rather than silently falling back.`,
    );
    process.exit(1);
  }
}
const stateHome = typeof args['state-home'] === 'string' ? args['state-home'] : os.homedir();

const persistPath =
  typeof args['persist-path'] === 'string'
    ? args['persist-path']
    : path.join(stateHome, '.cg-runtime', 'bridge-connection.json');

// R-021 — mirrors --persist-path, EXCEPT for what an absent file means: here it
// means the built-in default bank, not "no bank" (see the header).
const fixedLayersPath =
  typeof args['fixed-layers-path'] === 'string'
    ? args['fixed-layers-path']
    : path.join(stateHome, '.cg-runtime', 'bridge-fixed-layers.json');

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
    : path.join(stateHome, '.cg-runtime', 'bridge-reserved-layers.json');

// R-028 — the persisted template library (one JSON file per template).
const templatesDir =
  typeof args['templates-dir'] === 'string'
    ? args['templates-dir']
    : path.join(stateHome, '.cg-runtime', 'bridge-templates');

// D-137/C-015 — the Live Source catalog and the per-plate assignments. Each has
// its own path, NEVER inside templatesDir (see the header): the registry would
// read either of them as a template.
const sourceCatalogPath =
  typeof args['source-catalog-path'] === 'string'
    ? args['source-catalog-path']
    : path.join(stateHome, '.cg-runtime', 'bridge-source-catalog.json');
const sourceAssignmentsPath =
  typeof args['source-assignments-path'] === 'string'
    ? args['source-assignments-path']
    : path.join(stateHome, '.cg-runtime', 'bridge-source-assignments.json');

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
  stateHome,
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
    : path.join(stateHome, '.cg-runtime', 'bridge-audit.ndjson');

// 🔴 B-162 / C-024 — THE ADVERTISED TEMPLATE HOST, from CONFIGURATION.
//
// `deriveServeOptions` guesses: loopback when every declared server is local, and
// otherwise `guessLanHost()` — the FIRST non-internal IPv4 this machine reports.
// On a box with virtual adapters (Hyper-V, WSL, VPN, Docker) that is routinely not
// the interface the plant can reach, and the failure it produces is SILENT: the
// served URL is unfetchable, `CG ADD` still returns 200, and the operator sees live
// sources with no graphic over them. A better guess is still a guess — the operator
// is the one who knows the answer, so this flag lets them SAY it.
//
// Precedence matches every other bridge store, and C-024 gave this one its MIDDLE
// layer, so it is now the same three the rest of the bridge has:
//
//     explicit flag  >  persisted connection config  >  built-in derivation
//
// The stored layer is set from the Runtime's server settings panel, beside the
// server hosts it is a fact about, and applied to the RUNNING bridge — no restart.
// This flag still outranks it, deliberately: boot scripts and automation depend on
// that, and a value saved from a panel silently beating a flag would be the inverse
// of the confusion B-162 fixed. A flag given
// WITHOUT a value is a hard boot error rather than a silently ignored one, for the
// same reason `--reserved-layers` is: the operator believes they configured the
// address, and believing it while the derivation quietly guessed is exactly the
// state that costs a server its graphics.
for (const flag of ['template-serve-host', 'template-serve-port']) {
  if (args[flag] === true) {
    console.error(
      `[caspar-bridge] --${flag} needs a value. Refusing to boot rather than silently ` +
        'falling back to a guessed address.',
    );
    process.exit(1);
  }
}
const templateServePort =
  typeof args['template-serve-port'] === 'string' ? Number(args['template-serve-port']) : undefined;
if (templateServePort !== undefined && !Number.isInteger(templateServePort)) {
  console.error('[caspar-bridge] --template-serve-port must be an integer (0 = ephemeral).');
  process.exit(1);
}
const templateServe = {
  ...(typeof args['template-serve-host'] === 'string'
    ? { serveHost: args['template-serve-host'] }
    : {}),
  ...(templateServePort !== undefined ? { port: templateServePort } : {}),
};

// B-174 — the look switch's mixer hold. ABSENT = one channel frame of the observed video
// mode (the measured page lag); an explicit value is the plant's own retune, so a flag with
// no value or a non-integer is a hard boot error, never a silent fallback — the operator
// believes they configured playout timing.
/**
 * ONE reader for every ms knob on this boot line — the hold and `SKEW-INTERSECT-01`'s two
 * transition-window halves.
 *
 * A BLANK value is a missing one, not a zero. `Number('')` and `Number(' ')` are both 0, so a
 * wrapper script passing an unset shell variable (`--look-mixer-hold-ms "$CG_HOLD"`) would
 * otherwise DISABLE the timing silently — the same never-silent contract the messages state,
 * arriving through the value rather than through the spelling.
 *
 * ⚠ Shared because the three are the SAME KIND of knob read the same way, and a second copy
 * of this validation is how one of them would come to accept a blank. It is deliberately NOT
 * a shared VALUE: each flag resolves independently (see `#lookTransitionLeadMsFor`).
 */
function readMsFlag(name, zeroMeans) {
  const raw = args[name];
  if (raw === true || (typeof raw === 'string' && raw.trim() === '')) {
    console.error(
      `[caspar-bridge] --${name} needs a value in ms (0 ${zeroMeans}). ` +
        'Omit the flag entirely for the default of one channel frame.',
    );
    process.exit(1);
  }
  const ms = typeof raw === 'string' ? Number(raw) : undefined;
  if (ms !== undefined && (!Number.isInteger(ms) || ms < 0)) {
    console.error(`[caspar-bridge] --${name} must be a non-negative integer (ms).`);
    process.exit(1);
  }
  return ms;
}
const lookMixerHoldMs = readMsFlag('look-mixer-hold-ms', 'disables the hold');
/*
  `single-clock-look-switch` — `--look-transition-lead-ms`, `--look-transition-tail-ms` and
  `--no-look-transition-mask` are GONE with the mask they steered. A plate-bearing package
  loads onto the LOW bank and its pictures are composited over it, so there are no holes to
  narrow and nothing to widen again. `--look-mixer-hold-ms` SURVIVES and is unchanged: the
  page still flips its per-look decoration, and the hold is what aims the fills at that.
*/

/*
  🔴 C-029 — `--create-missing-consumers`: may the bridge ADD a consumer that casparcg.config
  declares and CasparCG is not running? OFF unless typed. The absence of the flag is the
  station's normal state: a missing output is REPORTED (the banner, the stderr line) and
  never created behind the operator's back. The flag takes no value — a value is a typo,
  and a typo that switches a card ON AIR must not boot silently.
*/
if (typeof args['create-missing-consumers'] === 'string') {
  console.error(
    '[caspar-bridge] --create-missing-consumers takes no value. Type it bare to turn creation ' +
      'on, or omit it (the default) to have missing outputs reported and never created.',
  );
  process.exit(1);
}
const createMissingConsumers = resolveCreateMissingConsumers(
  args['create-missing-consumers'] === true ? true : undefined,
);

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

/*
  🔴 `C-037` — THE PLAYOUT LINK. Same precedence as every other group: flags > file >
  default, and the default is `off` — today, byte for byte.

  ⚠ Its file is NOT `bridge-connection.json`. That file is the `connections.set-config`
  request body, so auth configuration living in it would be rewritable over the very socket
  this gate exists to protect; and its doctrine is warn-and-ignore, which for a key group like
  this would mean a typo boots the bridge with no auth at all. See `playout-config.ts`.
*/
const playoutConfigPath =
  typeof args['playout-config-path'] === 'string'
    ? args['playout-config-path']
    : defaultPlayoutConfigPath(stateHome);

// A valueless flag is a hard boot error, never silently ignored — the same fail-closed
// doctrine as `--reserved-layers`, and for a stronger reason: the operator believes the
// station authenticates.
for (const flag of [
  'auth',
  'playout-issuer',
  'playout-jwks-url',
  'playout-token-url',
  'playout-refresh-url',
  'playout-channels-url',
  'playout-revoked-url',
  'playout-audience',
  'playout-config-path',
]) {
  if (args[flag] === true) {
    console.error(
      `[caspar-bridge] --${flag} needs a value. ` +
        'Refusing to boot without it rather than silently falling back.',
    );
    process.exit(1);
  }
}
if (typeof args.auth === 'string' && args.auth !== 'off' && args.auth !== 'playout') {
  console.error(
    `[caspar-bridge] --auth must be 'off' or 'playout' — got ${JSON.stringify(args.auth)}. ` +
      'Refusing to boot rather than guessing which one was meant.',
  );
  process.exit(1);
}
const playoutFlags = {
  ...(typeof args.auth === 'string' ? { auth: args.auth } : {}),
  ...(typeof args['playout-issuer'] === 'string' ? { issuer: args['playout-issuer'] } : {}),
  ...(typeof args['playout-jwks-url'] === 'string' ? { jwksUrl: args['playout-jwks-url'] } : {}),
  ...(typeof args['playout-token-url'] === 'string' ? { tokenUrl: args['playout-token-url'] } : {}),
  ...(typeof args['playout-refresh-url'] === 'string'
    ? { refreshUrl: args['playout-refresh-url'] }
    : {}),
  ...(typeof args['playout-channels-url'] === 'string'
    ? { channelsUrl: args['playout-channels-url'] }
    : {}),
  ...(typeof args['playout-revoked-url'] === 'string'
    ? { revokedUrl: args['playout-revoked-url'] }
    : {}),
  ...(typeof args['playout-audience'] === 'string' ? { audience: args['playout-audience'] } : {}),
};

const bridgePort = args.port !== undefined ? Number(args.port) : undefined;
const bridgeOptions = {
  host: args.host,
  port: bridgePort,
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
  templateServe,
  ...(lookMixerHoldMs !== undefined ? { lookMixerHoldMs } : {}),
  createMissingConsumers,
  playout: playoutFlags,
  playoutConfigPath,
};

/*
  🔴 `DESKTOP-APPS-01` — the console's own origin (ADR 0011). Checked BEFORE the bridge binds, so
  a port collision is a one-line refusal rather than a half-started station: the console must
  never share a port with the control socket or the template origin (ADR 0010 rule 13).
*/
const consoleDir = typeof args['console-dir'] === 'string' ? args['console-dir'] : undefined;
const consolePort =
  typeof args['console-port'] === 'string' ? Number(args['console-port']) : CONSOLE_DEFAULT_PORT;
if (consoleDir !== undefined) {
  if (!Number.isInteger(consolePort) || consolePort < 0 || consolePort > 65535) {
    console.error('[caspar-bridge] --console-port must be an integer port (0 = ephemeral).');
    process.exit(1);
  }
  if (consolePort !== 0 && (consolePort === bridgePort || consolePort === templateServePort)) {
    console.error(
      `[caspar-bridge] --console-port ${consolePort} is also the control or template port. ` +
        'The console is served on its own origin and never on the template origin.',
    );
    process.exit(1);
  }
}

const handle = await boot();

/*
  The console listener starts AFTER the control socket is listening and outlives any restart of
  the bridge behind it, so its health answer means "the whole bridge is up" and the page a
  window already holds is never pulled out from under it.
*/
const consoleServer = consoleDir !== undefined ? new ConsoleHttpServer() : null;
if (consoleServer !== null && consoleDir !== undefined) {
  try {
    await consoleServer.start({ dir: consoleDir, port: consolePort });
  } catch (err) {
    console.error(
      `[caspar-bridge] console could not be served on 127.0.0.1:${consolePort}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    await handle.close();
    process.exit(1);
  }
  console.error(`[caspar-bridge] console on ${consoleServer.url} (from ${consoleDir})`);
}

/** Start the bridge and say, line by line, what it came up with. */
async function boot() {
  const h = await createBridgeOrRefuse(bridgeOptions);
  describeBoot(h);
  return h;
}

function describeBoot(handle) {
  console.error(`[caspar-bridge] WS listening on ${handle.url} → CasparCG via @cg/caspar-client`);
  /*
    C-037 — READ BACK on the boot line, both ways, exactly as C-029's missing-consumer line is,
    and for the same reason: a station can see which state it is in without knowing the flag
    exists. The OFF line is the one a test holds the default to.
  */
  console.error(
    handle.auth.mode === 'playout'
      ? `[caspar-bridge] auth: PLAYOUT — the control socket requires a token issued by ` +
          `${handle.auth.playout.issuer} (aud ${handle.auth.playout.audience}); keys read from ` +
          `${handle.auth.playout.jwksUrl}; consoles sign in at ${handle.auth.playout.tokenUrl}`
      : '[caspar-bridge] auth: OFF (default) - the control socket has no principal and every ' +
          'connected client can drive this station; --auth playout requires a Playout-issued token',
  );
  console.error(`[caspar-bridge] candidate layers: ${describeFixedBank(handle.fixedBankSource)}`);
  console.error(`[caspar-bridge] live sources: ${describeSourceCatalog(handle.sourceCatalog)}`);
  console.error(
    `[caspar-bridge] plate assignments: ${describeAssignments(handle.sourceAssignments)}`,
  );
  console.error(`[caspar-bridge] live layer ledger: ${describeLiveLayers(handle.liveLayers)}`);
  // C-031 — the one number every take depends on, said at boot like the rest.
  console.error(`[caspar-bridge] templates: ${describeTemplates(handle.templates)}`);
  // Longer than any real channel frame (the slowest, 1080p2398, is ~41.7 ms; an interlaced
  // 24p-family mode ~83). Not a limit — a threshold for saying so out loud on the boot line.
  const LOOK_MIXER_HOLD_IMPLAUSIBLE_MS = 200;
  /*
    B-174 — the hold is READ BACK, and an implausible one is called out rather than clamped.
    It is a real playout timing knob, so the operator's number is honoured whatever it is;
    but the value sleeps inside the row's seat lock with the page already flipped, so a
    mistyped 4000 is four seconds of new holes over old fills on air, with every swap and
    update on that row queued behind it. A digit slip is silent otherwise — nothing else in
    the bridge ever mentions the number again.
  */
  console.error(
    `[caspar-bridge] look-switch mixer hold: ` +
      (lookMixerHoldMs === undefined
        ? 'one channel frame of the observed video mode (40 ms until it is read)'
        : `${lookMixerHoldMs} ms (configured)`),
  );
  if (lookMixerHoldMs !== undefined && lookMixerHoldMs > LOOK_MIXER_HOLD_IMPLAUSIBLE_MS) {
    console.error(
      `[caspar-bridge] !! ${lookMixerHoldMs} ms is far longer than any channel frame (the slowest ` +
        'is about 42) - every look switch will show the new holes over the old pictures for that ' +
        'long, on air, with swaps and updates on that row waiting behind it.',
    );
  }
  // C-029 — READ BACK on the boot line, both ways, so a station can see which state it is in
  // without knowing the flag exists. The OFF line is the one a test holds the default to.
  console.error(
    createMissingConsumers
      ? '[caspar-bridge] missing-consumer creation: ON (--create-missing-consumers) - a consumer ' +
          'casparcg.config declares that is not running will be ADDed once per connection with ' +
          "the declaration's own device, never a substitute; the outcome is reported either way"
      : '[caspar-bridge] missing-consumer creation: OFF (default) - a consumer casparcg.config ' +
          'declares that is not running is REPORTED (banner + this log), never created; ' +
          '--create-missing-consumers turns creation on',
  );
  console.error(
    `[caspar-bridge] template HTTP server on ${handle.templateServe.url}/template/<id>` +
      (handle.templateServe.exposed ? ' (LAN-exposed)' : ' (loopback)') +
      ` - advertised host from ${describeServeHostSource(handle.templateServe.source)}`,
  );
  // B-162 — the correctness verdict, on the boot line an operator actually reads.
  // `createBridge` already wrote the full warning to stderr; this is the one-line
  // restatement beside the address it is about, so the two are never read apart.
  if (handle.templateServe.unreachable.length > 0) {
    console.error(
      `[caspar-bridge] !! ${handle.templateServe.unreachable.join(', ')} CANNOT fetch that address ` +
        '- those servers will show live sources with NO TEMPLATE. Set the serve host in the ' +
        'Runtime server settings panel (applies without a restart), or pass --template-serve-host.',
    );
  }
}

/**
 * 🔴 `C-037` — start the bridge, and turn a PLAYOUT CONFIG failure into the CLI's own
 * one-line refusal instead of an unhandled top-level rejection with a stack trace.
 *
 * ⚠ **It re-throws everything else, deliberately.** This file has never had a try/catch
 * around `createBridge`, so a fixed-bank or source-catalog failure surfaces as a stack
 * trace today; swallowing those here would be a behaviour change riding along on an auth
 * commit, and a broad catch is how a boot failure becomes a boot that looks fine. The
 * narrowing is by NAME rather than `instanceof`, because this is a `.mjs` reading a class
 * out of `dist/` and a name is the identity that survives that boundary.
 *
 * The sentence itself is built in `playout-config.ts` and already names the KEY — at 03:00
 * the difference between "the bridge will not start" and "the bridge will not start,
 * `playout.jwksUrl` is missing" is the whole night.
 */
async function createBridgeOrRefuse(options) {
  try {
    return await createBridge(options);
  } catch (err) {
    if (err instanceof Error && err.name === 'PlayoutConfigError') {
      console.error(`[caspar-bridge] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.error('[caspar-bridge] stopping');
  await consoleServer?.stop();
  await handle.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/*
  🔴 `DESKTOP-APPS-01` — THE PARENT'S LIFELINE. The desktop shell holds the write end of this
  process's stdin and never writes to it; when the shell exits — cleanly, or killed from Task
  Manager — the OS closes that handle and this end reads EOF. Windows delivers no SIGTERM to a
  child, so without this a crashed shell would leave a bridge holding every port behind it.
  Opt-in: a bridge started in a terminal must not stop because a terminal's stdin ended.
*/
if (args['exit-on-stdin-close'] === true) {
  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
  process.stdin.resume();
}

/**
 * WHERE THE ADVERTISED TEMPLATE HOST CAME FROM (B-162 / C-024).
 *
 * The `candidate layers:` and `live sources:` lines are the precedent and this
 * follows it for the same reason: a value alone cannot answer "why this one, and
 * what do I change?". It is sharper here than anywhere else, because the derived
 * answer is a GUESS at which of this machine's interfaces the plant can reach,
 * and a wrong guess produces no error on any surface.
 *
 * ASCII only, deliberately — the Windows console renders an en-dash as mojibake,
 * and a line whose whole job is to be READ must not arrive with garbage in it.
 */
function describeServeHostSource(source) {
  if (source === 'flag') return '--template-serve-host';
  if (source === 'config') {
    return (
      'the saved connection config (set in the Runtime server settings panel) - a ' +
      '--template-serve-host flag would outrank it'
    );
  }
  return (
    'the built-in derivation (loopback if every declared server is local, else this ' +
    "machine's first non-internal IPv4) - set it in the Runtime server settings panel, or " +
    'override with --template-serve-host'
  );
}

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
  // BOTH halves, from the ONE enumeration and the ONE predicates — this used to
  // rebuild the operator range by hand and read the operator half's tick record
  // directly, so it printed twenty rows as the whole bank and never mentioned
  // the beds at all (P-039's guard flagged the arithmetic; the tick read it
  // cannot see was fixed alongside). A boot line that describes half the bank
  // is the same defect as a mock that fences half of it (B-201).
  const halves = { operator: { count: 0, shown: 0 }, bed: { count: 0, shown: 0 } };
  for (const { layer } of fixedBankSlots(bank)) {
    const half = isLowBankLayer(bank, layer) ? halves.bed : halves.operator;
    half.count++;
    if (isLayerVisible(bank, layer)) half.shown++;
  }
  const operatorEnd = fixedBankEnd(bank);
  const bedEnd = lowBankEnd(bank);
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
    `channel ${bank.channel}, layers ${bank.start}-${operatorEnd} ` +
    `(${halves.operator.count} declared, ${halves.operator.shown} shown), ` +
    `beds ${bank.low.start}-${bedEnd} ` +
    `(${halves.bed.count} declared, ${halves.bed.shown} shown) - from ${where}`
  );
}

/**
 * C-031 — the TEMPLATE REGISTRY at boot, in one line: how many loaded, how many
 * persisted files were refused, and from where.
 *
 * The boot line named the bank, the sources, the assignments, the ledger, the mixer
 * hold and the consumer setting, and not the one number every take depends on. On
 * 2026-09-04 every take answered `amcp-404` and the first thing anyone had to
 * establish was whether the bridge held the templates at all; nothing printed said.
 * A skipped file is named individually by the registry's own warning as it is
 * skipped; this line carries only the count, so a reader sees at a glance that there
 * IS something above to scroll up to.
 *
 * ASCII only, deliberately, for the same reason as every sibling above.
 */
function describeTemplates({ loaded, skipped, dir }) {
  const where = dir === null ? 'no --templates-dir (nothing persists)' : dir;
  const refused =
    skipped === 0 ? 'none skipped' : `${skipped} skipped as unusable (see the warnings above)`;
  if (loaded === 0) {
    return `0 loaded from ${where} - ${refused}; nothing can go to air until a .vcg is imported`;
  }
  return `${loaded} loaded from ${where} - ${refused}`;
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
      /*
        B-174 — `--flag=value` is accepted, because the alternative is SILENCE. This parser
        split on whitespace only, so `--look-mixer-hold-ms=40` was stored under the key
        `look-mixer-hold-ms=40`, every guard below read `undefined`, and the bridge booted on
        the default without a word — the exact "never a silent fallback" promise those guards
        make, broken by a spelling half the world types by muscle memory. It is fixed at the
        parser, once, for every flag: --reserved-layers and --template-serve-* make the same
        promise and shared the same hole.
      */
      const eq = a.indexOf('=');
      if (eq > 2) {
        const value = a.slice(eq + 1);
        // `--flag=` with nothing after it is a MISSING value, not the empty string — it takes
        // the `true` path so the per-flag "needs a value" error fires rather than Number('')
        // quietly resolving to 0.
        out[a.slice(2, eq)] = value === '' ? true : value;
        continue;
      }
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

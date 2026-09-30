/**
 * 🔴 `DEV-STATION-01` — **THE DEV STATION, AS PLAIN DATA: its ports, its origin, its state folder,
 * and every argument it starts a process with.** Zero-dependency ESM with no build step, so the
 * launcher (`dev-station-cli.mjs`) runs on a fresh clone and the tests import exactly what it runs.
 *
 * ── THE THREE FACTS THE DESIGN RESTS ON (each confirmed in the code, 2026-09-24) ─────────────
 *
 *   1. THE ORIGIN. The Playout's CORS list carries `http://127.0.0.1:5174` (and, on the test
 *      Playout, `http://192.168.21.93:5174`) — `docs/integration/playout/PLAYOUT-CG-RESPONSE-v1.md`,
 *      ADR 0011. A console on any other port or host, `localhost` included, cannot sign in. Vite
 *      has no `strictPort` of its own and once moved to 5175 in silence (`docs/integration/playout/
 *      README.md` item 12), so the dev station passes `--strictPort`: 5174 or nothing.
 *   2. OSC. The bridge's own UDP port — 6251, never the Playout engine's 6250 (`CENTRAL-BRIDGE-01`
 *      rule 7) — is bound once, with Node's defaults — no `reuseAddr`
 *      (`packages/caspar-client/src/osc/transport.ts`) — and the core sends OSC to each AMCP
 *      client's own address on it (ADR 0010). One holder per machine.
 *   3. ONE STATION PER CHANNEL. Two bridges on one channel each treat the bank as theirs. No sweep
 *      CLEARs at connect (`caspar-runtime.ts`: "deliberately NOT a startup sweep"), but a bridge's
 *      first connection sends `MIXER … VOLUME 1` to every declared bank slot, and its first LOAD on
 *      a layer is preceded by a `CLEAR` of that layer, whatever is on it.
 *
 * So the dev station and an installed CG Bridge service (`CENTRAL-BRIDGE-01`) run ONE AT A TIME on
 * one machine, on the SAME ports — and the dev station never stops the service: it names it and
 * refuses. CG Control is only a console now and holds no port, so it is never in the way.
 */
import path from 'node:path';

export const CONSOLE_HOST = '127.0.0.1';
export const CONSOLE_PORT = 5174;
/** The one origin the Playout's CORS list admits — the page, the banner and the browser all use it. */
export const CONSOLE_URL = `http://${CONSOLE_HOST}:${String(CONSOLE_PORT)}/`;
export const BRIDGE_PORT = 5280;
export const TEMPLATE_PORT = 7911;
export const OSC_PORT = 6251;
/**
 * The bridge's own console listener (`--console-dir` / `--console-port`), kept for ONE reader: the
 * dev station's own readiness probe, `/__cg/health`, whose answer carries the bridge's pid — so the
 * launcher knows the bridge that came up is the one it started. It serves a one-page stub, never the
 * console: Vite holds 5174 for hot reload. The PROGRAM picture does not come through here any more —
 * the console asks the bridge for a ticket over its socket and loads `/pgm/<n>?ticket=…` from the
 * bridge's control port, 5280, directly (`CENTRAL-BRIDGE-01` D9).
 */
export const BRIDGE_CONSOLE_PORT = 5175;

/**
 * Every port the dev station binds: the three CG Bridge binds (5280, 7911, UDP 6251), the console's
 * 5174 and the one internal listener. Because CG Bridge binds the first three, the dev station and
 * an installed CG Bridge service run one at a time on one machine.
 */
export const STATION_PORTS = [
  { proto: 'tcp', port: CONSOLE_PORT },
  { proto: 'tcp', port: BRIDGE_PORT },
  { proto: 'tcp', port: TEMPLATE_PORT },
  { proto: 'udp', port: OSC_PORT },
  { proto: 'tcp', port: BRIDGE_CONSOLE_PORT },
];

/**
 * CG Bridge's process image: `node.exe` renamed, run by the service host `shawl.exe` as
 * `NT SERVICE\CGBridge` — and the name an older CG Control's own bridge ran under, too.
 */
const CG_BRIDGE_IMAGE = 'cg-bridge.exe';

/**
 * CG Control's own folder: `%APPDATA%\CG Control` on Windows (`shell_log.rs`). Today it holds only
 * `logs\shell.log`; a CG Control `0.9.x` kept its own bridge's `.cg-runtime\` here, and that is the
 * folder CG Bridge's one-time import reads (`import-state.ts`). Elsewhere, where Tauri's `data_dir`
 * would put it. The dev station never writes here.
 */
export function installedStateDir(env, platform, home) {
  if (platform === 'win32') {
    return path.win32.join(
      env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming'),
      'CG Control',
    );
  }
  const p = path.posix;
  if (platform === 'darwin') return p.join(home, 'Library', 'Application Support', 'CG Control');
  return p.join(env.XDG_DATA_HOME ?? p.join(home, '.local', 'share'), 'CG Control');
}

/**
 * `CENTRAL-BRIDGE-01` — CG Bridge's own folder, `%ProgramData%\CG Bridge`: its configuration
 * (`cg-bridge.json`), its state (`.cg-runtime\`) and its logs (`tools/bridge-installer/cg-bridge.nsi`).
 * CG Bridge is a Windows service and keeps no folder elsewhere: `null`. The dev station never writes
 * here either. An empty `ProgramData` is no value — a relative folder would guard nothing.
 */
export function bridgeStateDir(env, platform) {
  if (platform !== 'win32') return null;
  const given = env.ProgramData;
  const base = typeof given === 'string' && given.trim() !== '' ? given : 'C:\\ProgramData';
  return path.win32.join(base, 'CG Bridge');
}

/**
 * The dev station's own state folder: `%LOCALAPPDATA%\CG Control Dev` on Windows — outside the
 * repo, so a `git clean` never takes the station's Playout, channel or sign-in with it, and
 * outside CG Control's Roaming folder and CG Bridge's `%ProgramData%` one. `CG_DEV_STATION_HOME`
 * moves it (the tests do).
 */
export function devStateDir(env, platform, home) {
  const chosen = env.CG_DEV_STATION_HOME;
  if (typeof chosen === 'string' && chosen.trim() !== '') return chosen;
  if (platform === 'win32') {
    return path.win32.join(
      env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local'),
      'CG Control Dev',
    );
  }
  const p = path.posix;
  return p.join(env.XDG_DATA_HOME ?? p.join(home, '.local', 'share'), 'CG Control Dev');
}

/** Is `child` the folder `parent` or inside it? Case-insensitively on Windows. */
export function isInside(child, parent, platform) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const norm = (value) => {
    const resolved = p.resolve(value);
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const rel = p.relative(norm(parent), norm(child));
  return rel === '' || (!rel.startsWith('..') && !p.isAbsolute(rel));
}

/**
 * The launcher's refusal when the dev state folder overlaps an installed app's own — CG Control's,
 * or (on Windows) CG Bridge's — in either direction, or `null` when it overlaps neither.
 */
export function stateOverlap(root, env, platform, home) {
  const guarded = [
    { owner: 'CG Control', dir: installedStateDir(env, platform, home) },
    { owner: 'CG Bridge', dir: bridgeStateDir(env, platform) },
  ];
  for (const { owner, dir } of guarded) {
    if (dir === null) continue;
    if (isInside(root, dir, platform) || isInside(dir, root, platform)) {
      return `The dev state folder ${root} overlaps ${owner}'s own ${dir} — refusing.`;
    }
  }
  return null;
}

/**
 * Every file the bridge persists, NAMED — under `<state>/.cg-runtime/`, CG Bridge's own layout
 * (`%ProgramData%\CG Bridge\.cg-runtime\`). Isolation is asserted by explicit flags, never by the
 * absence of one: a path left to its default is a path that reads `~/.cg-runtime`, which on this
 * machine names a real plant.
 */
export function stationPaths(stateDir, platform) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const runtime = p.join(stateDir, '.cg-runtime');
  return {
    stateDir,
    connection: p.join(runtime, 'bridge-connection.json'),
    fixedLayers: p.join(runtime, 'bridge-fixed-layers.json'),
    reservedLayers: p.join(runtime, 'bridge-reserved-layers.json'),
    templates: p.join(runtime, 'bridge-templates'),
    sourceCatalog: p.join(runtime, 'bridge-source-catalog.json'),
    sourceAssignments: p.join(runtime, 'bridge-source-assignments.json'),
    // `PLAYOUT-SOURCES-01` — the Playout's last good input list and the media items bound.
    playoutInputs: p.join(runtime, 'bridge-playout-inputs.json'),
    boundMedia: p.join(runtime, 'bridge-bound-media.json'),
    liveLayers: p.join(runtime, 'bridge-live-layers.json'),
    stack: p.join(runtime, 'bridge-stack.json'),
    /**
     * `CENTRAL-BRIDGE-01` (D7) — the bridge's OWN Playout session, as CG Bridge keeps it: the station
     * account's rotating refresh token, never a password. The dev station runs as CG Bridge does, so a
     * console says "CG Bridge needs a station admin to sign in" until one does, once per state folder.
     */
    bridgeSession: p.join(runtime, 'bridge-session.json'),
    audit: p.join(runtime, 'bridge-audit.ndjson'),
    playoutConfig: p.join(runtime, 'bridge-playout.json'),
    /** A one-page stub for the bridge's console listener, which needs an `index.html` to start. */
    consoleDir: p.join(stateDir, 'console'),
    /**
     * `DELTA-MULTI-CHANNEL-01-A` — everything the bridge prints, as the terminal shows it. The
     * owner's first `--fake` check left nothing behind to read but the audit log: the connection
     * check's own timing line, written for exactly that question, had gone to a closed terminal.
     */
    bridgeLog: p.join(stateDir, 'bridge.log'),
    /**
     * `FIELD-FIXES-01-A` — every AMCP command the bridge sends, its reply line and its time. Beside
     * `bridge.log`, as CG Bridge keeps its own `amcp.log` beside the service's output in `logs\`.
     */
    amcpLog: p.join(stateDir, 'amcp.log'),
  };
}

/**
 * 🔴 `DELTA-MULTI-CHANNEL-01-A` A1 — **THE FAKE STATION'S MODULES, LOADED BY PATH** (the dev station
 * is zero-dependency): the three fakes, and `fake-station.ts`, the one composition that wires them —
 * which the bridge's own suite drives against a real bridge. The TypeScript ones run under Node's
 * type stripping, which is why `--fake` needs Node 23; CasparCG's stand-in runs from its build, which
 * `buildArgs()` already includes (`@cg/amcp-mock` is the bridge's own dependency).
 *
 * `DEV-LOCAL-CASPAR-01` — and `local-caspar-station.ts`, the composition `--fake --caspar` runs
 * instead: the fake Playout in front of this machine's own CasparCG, with no stand-in at all.
 */
export function fakeModulePaths(repo) {
  const support = path.join(repo, 'tools', 'caspar-bridge', 'tests', 'support');
  return {
    playout: path.join(support, 'fake-playout.ts'),
    pgmFeed: path.join(support, 'fake-pgm-feed.ts'),
    station: path.join(support, 'fake-station.ts'),
    localCaspar: path.join(support, 'local-caspar-station.ts'),
    caspar: path.join(repo, 'tools', 'amcp-mock', 'dist', 'index.js'),
  };
}

/**
 * `DEV-LOCAL-CASPAR-01` — the state folder a `--fake` run keeps: `fake`, or `fake-local` when the
 * fake Playout stands in front of this machine's own CasparCG — so the two kinds of run never
 * replace each other's `.previous`.
 */
export function fakeStateName(options) {
  return options.caspar === undefined ? 'fake' : 'fake-local';
}

/**
 * Where the last `--fake` station is kept when a run starts a fresh one: beside it, one run back —
 * so the state a check was made on can still be read after the next start.
 */
export function previousStateDir(stateDir) {
  return `${stateDir}.previous`;
}

/** The path flags, each with its value — `--state-home` first, so a default could only land here. */
function pathFlags(paths) {
  return [
    '--state-home',
    paths.stateDir,
    '--persist-path',
    paths.connection,
    '--fixed-layers-path',
    paths.fixedLayers,
    '--reserved-layers-path',
    paths.reservedLayers,
    '--templates-dir',
    paths.templates,
    '--source-catalog-path',
    paths.sourceCatalog,
    '--source-assignments-path',
    paths.sourceAssignments,
    '--playout-inputs-path',
    paths.playoutInputs,
    '--bound-media-path',
    paths.boundMedia,
    '--live-layers-path',
    paths.liveLayers,
    // `CENTRAL-BRIDGE-01` (`B-294`) — the bridge keeps its own stack; no console re-delivers one.
    '--stack-path',
    paths.stack,
    // `CENTRAL-BRIDGE-01` (D7) — the bridge's own Playout session, named like every other file.
    '--bridge-session-path',
    paths.bridgeSession,
    '--audit-log-path',
    paths.audit,
    '--playout-config-path',
    paths.playoutConfig,
    '--amcp-log-path',
    paths.amcpLog,
  ];
}

/**
 * The bridge, started as a station's bridge starts: in first-run (`--first-run`, as CG Bridge the
 * service starts until a station admin picks its channels), on the control port 5280 and the template
 * port 7911 CG Bridge binds, and with the stdin lifeline (`--exit-on-stdin-close`: it stops when this
 * launcher does) — with every path named, the Playout address as its flag, and its console listener
 * on the internal port (the launcher's own readiness probe).
 *
 * ⚠ NO `--caspar-host`, `--amcp-port` or `--osc-port`: any one of them makes the bridge build its
 * CasparCG connection from flags and ignore the one first-run writes from the Playout's channel
 * list. OSC's 6251 comes from that connection, and the bridge asks the core for it with
 * `OSC SUBSCRIBE` (`CENTRAL-BRIDGE-01` rule 7).
 */
export function bridgeArgs(paths, playoutAddress, ports = {}) {
  return [
    ...pathFlags(paths),
    '--playout-address',
    playoutAddress,
    '--port',
    String(ports.bridge ?? BRIDGE_PORT),
    '--template-serve-port',
    String(ports.templates ?? TEMPLATE_PORT),
    '--console-dir',
    paths.consoleDir,
    '--console-port',
    String(ports.bridgeConsole ?? BRIDGE_CONSOLE_PORT),
    '--first-run',
    '--exit-on-stdin-close',
  ];
}

/**
 * The ONE writer of the dev station's Playout target — the bridge's own one-shot
 * `--set-playout-address`, a DEV-ONLY writer now: CG Bridge's installed configuration is written by
 * its installer through `--write-service-config`. It replaces the whole Playout group, so an issuer
 * adopted from the previous address is cleared and the next station-admin sign-in adopts again.
 */
export function setAddressArgs(paths, address) {
  return [
    '--state-home',
    paths.stateDir,
    '--playout-config-path',
    paths.playoutConfig,
    '--set-playout-address',
    address,
  ];
}

/**
 * The console server's environment: the caller's, minus the two variables that would move its bind,
 * plus the two the runtime's Vite config reads — `CG_BRIDGE_CONSOLE`, the bridge's internal listener
 * it relays `/__cg/` to (the PROGRAM picture does not come that way any more: the console loads
 * `/pgm/<n>?ticket=…` from the bridge's control port, 5280, directly), and (`FIELD-FIXES-01` H)
 * `CG_CONSOLE_HOST`, the one host a page asked for under `localhost` is sent to, because the
 * Playout's CORS list admits `127.0.0.1` and never `localhost`.
 */
export function viteEnv(env, bridgeConsole) {
  const { HOST: _host, PORT: _port, ...rest } = env;
  return { ...rest, CG_BRIDGE_CONSOLE: bridgeConsole, CG_CONSOLE_HOST: CONSOLE_HOST };
}

/** The console from SOURCE, with hot reload, on the one origin — and on nothing else. */
export function viteArgs(ports = {}) {
  return [
    '--host',
    CONSOLE_HOST,
    '--port',
    String(ports.console ?? CONSOLE_PORT),
    '--strictPort',
    '--clearScreen',
    'false',
  ];
}

/**
 * BUILD FIRST — the guard `dev:playout-auth` got after it ran a stale bridge (`DELTA C`). The
 * bridge runs from `dist/`, and the console's `@cg/*` imports resolve to their `dist/` too; turbo
 * rebuilds only what changed. `@cg/runtime` itself is left out: Vite serves it from source.
 */
export function buildArgs() {
  return ['run', 'build', '--filter=@cg/caspar-bridge...', '--filter=@cg/runtime^...'];
}

/** `tasklist /FO CSV /NH` → `{ name, pid }` per process. */
export function parseTasklist(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const pid = Number(cols[1]);
    if (cols.length >= 2 && cols[0] !== '' && Number.isInteger(pid))
      out.push({ name: cols[0], pid });
  }
  return out;
}

/**
 * `netstat -ano` → who holds which port. A TCP LISTENER is recognised by its foreign address ending
 * `:0` — locale-independent, unlike the word LISTENING (the rule the bridge's connection check uses,
 * `connection-check.ts`); a UDP socket has no state column and is always a holder.
 */
export function parseNetstat(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    const proto = (cols[0] ?? '').toLowerCase();
    if ((proto !== 'tcp' && proto !== 'udp') || cols.length < 4) continue;
    if (proto === 'tcp' && !(cols[2] ?? '').endsWith(':0')) continue;
    const port = Number((cols[1] ?? '').slice((cols[1] ?? '').lastIndexOf(':') + 1));
    const pid = Number(cols[cols.length - 1]);
    if (Number.isInteger(port) && Number.isInteger(pid)) out.push({ proto, port, pid });
  }
  return out;
}

/**
 * 🔴 What stands in the dev station's way: every program on one of its ports, NAMED — and never
 * stopped. None of them is ours to close: on a Playout machine CG Bridge IS the plant's bridge, and
 * Windows restarts it five seconds after its process dies, so ending it is both useless and harmful.
 * A process that holds no port is never in the way — CG Control included: it is only a console now,
 * and it may even connect to the dev station.
 */
export function assess(processes, listeners, ports = STATION_PORTS) {
  const nameOf = (pid) => processes.find((p) => p.pid === pid)?.name ?? 'another program';
  const blocked = [];
  for (const want of ports) {
    const holder = listeners.find((l) => l.proto === want.proto && l.port === want.port);
    if (holder === undefined) continue;
    blocked.push({ ...want, pid: holder.pid, name: nameOf(holder.pid) });
  }
  return { blocked };
}

/**
 * A port another program holds, in one line — CG Bridge by its name, with how to stop it by hand.
 * The line only says; the dev station offers to stop nothing.
 */
export function blockedLine(b) {
  const port = b.proto === 'udp' ? `${String(b.port)}/udp` : String(b.port);
  if (b.name.toLowerCase() === CG_BRIDGE_IMAGE) {
    // One literal on one line, so a sweep for this sentence finds it (CLAUDE.md golden rule 9).
    return `Port ${port} is held by CG Bridge (${b.name}, PID ${String(b.pid)}) — the CG Bridge service, or an older CG Control's own bridge. Stop it (Stop-Service CGBridge in an administrator PowerShell, or close that CG Control), then run pnpm dev:station again.`;
  }
  return `Port ${port} is held by ${b.name} (PID ${String(b.pid)}) — stop it, then run pnpm dev:station again.`;
}

/**
 * The one short banner: where the console is, where its state and its log are, which Playout — and,
 * with `--fake`, which CasparCG — and how to stop.
 *
 * `DELTA-MULTI-CHANNEL-01-A` A1(c) — the connection check's "The Playout and CasparCG run on this
 * machine" warning STAYS: it is true of a fake station, whose every part is on loopback. One line
 * here says it is expected, so the owner does not read a true warning as a fault of the tool.
 */
export function banner({ stateDir, playout, fake, log }) {
  const lines = [
    '',
    '  ── CG Control · dev station ──────────────────────────────',
    `  console  ${CONSOLE_URL}`,
    `  state    ${stateDir}${fake === undefined ? '' : '  (fresh every --fake run; the last one is kept beside it as .previous)'}`,
  ];
  if (log !== undefined) lines.push(`  log      ${log}`);
  lines.push(
    `  Playout  ${playout}${fake === undefined ? '' : `  (fake · sign in as ${fake.username} / ${fake.password})`}`,
  );
  const local = fake?.local;
  if (fake?.caspar !== undefined && local !== undefined) {
    lines.push(...localCasparLines(fake.caspar, local));
  } else if (fake?.caspar !== undefined) {
    const feeds = fake.feeds ?? [];
    lines.push(
      `  CasparCG ${fake.caspar}  (fake · channels 1 and 2${feeds.length > 0 ? ` · programme feeds on ${feeds.join(', ')}` : ''})`,
    );
  }
  if (fake?.caspar !== undefined) {
    lines.push(
      '  check    "The Playout and CasparCG run on this machine" is expected here: they do.',
    );
  }
  for (const note of fake?.notes ?? []) lines.push(`  note     ${note}`);
  lines.push(
    local === undefined
      ? '  Ctrl+C stops it.'
      : '  Ctrl+C stops it — what is on air stays on CasparCG.',
    '',
  );
  return lines;
}

const counted = (n, word) => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

/**
 * `DEV-LOCAL-CASPAR-01` — the start's lines about this machine's own CasparCG: the core, its version
 * and its channels; its media library; and where the programme is seen — its own window, since this
 * mode has no return feed.
 */
function localCasparLines(address, local) {
  const channels = local.channels.map((c) => `CH ${String(c.channel)} ${c.format}`).join(', ');
  return [
    `  CasparCG ${address}  (this machine's · ${local.version} · ${channels})`,
    local.mediaFolder === null
      ? '  media    none — see the note below'
      : `  media    ${counted(local.clips, 'clip')}${local.stills > 0 ? `, ${counted(local.stills, 'still')}` : ''} in ${local.mediaFolder}  (read again when the Media tab asks after 30 s)`,
    "  PROGRAM  no return feed here — watch CasparCG's own window",
  ];
}

/**
 * The launcher's own flags: `--playout <url>`, `--fake`, `--caspar <host:port>`, `--no-open`.
 * Anything else is refused.
 *
 * `DEV-LOCAL-CASPAR-01` — `--caspar` is carried as TYPED, and goes with `--fake` only. Whether it
 * names this machine is not decided here: the ONE loopback rule is `parseCasparTarget` in
 * `local-caspar-station.ts`, which the launcher asks before it probes, builds or starts anything.
 */
export function parseArgs(argv) {
  const out = { playout: undefined, fake: false, open: true, caspar: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--fake') out.fake = true;
    else if (arg === '--no-open') out.open = false;
    else if (arg === '--playout') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        return { error: '--playout needs an address.' };
      out.playout = value;
      i++;
    } else if (arg.startsWith('--playout=')) out.playout = arg.slice('--playout='.length);
    else if (arg === '--caspar') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        return { error: "--caspar needs this machine's CasparCG: --caspar 127.0.0.1:5250." };
      out.caspar = value;
      i++;
    } else if (arg.startsWith('--caspar=')) out.caspar = arg.slice('--caspar='.length);
    else
      return {
        error: `${arg} is not a dev:station flag (--playout <url>, --fake, --caspar <host:port>, --no-open).`,
      };
  }
  if (out.fake && out.playout !== undefined)
    return { error: '--fake and --playout are one or the other.' };
  if (out.caspar !== undefined && !out.fake)
    return { error: '--caspar goes with --fake: pnpm dev:station --fake --caspar 127.0.0.1:5250.' };
  return out;
}

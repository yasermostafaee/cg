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
 *   2. OSC. UDP 6250 is bound once, with Node's defaults — no `reuseAddr`
 *      (`packages/caspar-client/src/osc/transport.ts`) — and the core sends OSC to each AMCP
 *      client's own address on it (ADR 0010). One holder per machine.
 *   3. ONE STATION PER CHANNEL. Two bridges on one channel each treat the bank as theirs. No sweep
 *      CLEARs at connect (`caspar-runtime.ts`: "deliberately NOT a startup sweep"), but a bridge's
 *      first connection sends `MIXER … VOLUME 1` to every declared bank slot, and its first LOAD on
 *      a layer is preceded by a `CLEAR` of that layer, whatever is on it.
 *
 * So the dev station and the installed CG Control run ONE AT A TIME, on the SAME ports.
 */
import path from 'node:path';

export const CONSOLE_HOST = '127.0.0.1';
export const CONSOLE_PORT = 5174;
/** The one origin the Playout's CORS list admits — the page, the banner and the browser all use it. */
export const CONSOLE_URL = `http://${CONSOLE_HOST}:${String(CONSOLE_PORT)}/`;
export const BRIDGE_PORT = 5280;
export const TEMPLATE_PORT = 7911;
export const OSC_PORT = 6250;
/**
 * The bridge's OWN console listener, which in the installed app IS 5174. Here Vite holds 5174 for
 * hot reload, so the bridge's listener moves to this internal port and Vite relays the two routes
 * only it can answer: `/pgm/<n>` (the PROGRAM monitor's picture) and `/__cg/health` (the identity
 * the installed CG Control reads before it starts, so it refuses by name while this runs).
 */
export const BRIDGE_CONSOLE_PORT = 5175;

/** Every port the dev station binds — the installed app's four, and the one internal listener. */
export const STATION_PORTS = [
  { proto: 'tcp', port: CONSOLE_PORT },
  { proto: 'tcp', port: BRIDGE_PORT },
  { proto: 'tcp', port: TEMPLATE_PORT },
  { proto: 'udp', port: OSC_PORT },
  { proto: 'tcp', port: BRIDGE_CONSOLE_PORT },
];

/** The installed CG Control's two processes: the app, and its bridge sidecar (`sidecar.rs`). */
export const INSTALLED_IMAGES = ['cg-control.exe', 'cg-bridge.exe'];

export const ASK = 'CG Control is running. Close it and continue? [Y/n] ';
export const DECLINED = 'CG Control is running — close it, then run pnpm dev:station again.';

/**
 * The installed CG Control's state folder: Tauri's `data_dir` joined with `CG Control`
 * (`sidecar.rs` `paths`) — `%APPDATA%\CG Control` on Windows. The dev station never writes here.
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
 * The dev station's own state folder: `%LOCALAPPDATA%\CG Control Dev` on Windows — outside the
 * repo, so a `git clean` never takes the station's Playout, channel or sign-in with it, and
 * outside the installed app's Roaming folder. `CG_DEV_STATION_HOME` moves it (the tests do).
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
 * Every file the bridge persists, NAMED — under `<state>/.cg-runtime/`, the installed app's own
 * layout. Isolation is asserted by explicit flags, never by the absence of one: a path left to its
 * default is a path that reads `~/.cg-runtime`, which on this machine names a real plant.
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
    liveLayers: p.join(runtime, 'bridge-live-layers.json'),
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
     * `bridge.log`, as the installed app keeps its own beside its `bridge.log`.
     */
    amcpLog: p.join(stateDir, 'amcp.log'),
  };
}

/**
 * 🔴 `DELTA-MULTI-CHANNEL-01-A` A1 — **THE FAKE STATION'S FOUR MODULES, LOADED BY PATH** (the dev
 * station is zero-dependency): the three fakes, and `fake-station.ts`, the one composition that wires
 * them — which the bridge's own suite drives against a real bridge. The TypeScript three run under
 * Node's type stripping, which is why `--fake` needs Node 23; CasparCG's stand-in runs from its build,
 * which `buildArgs()` already includes (`@cg/amcp-mock` is the bridge's own dependency).
 */
export function fakeModulePaths(repo) {
  const support = path.join(repo, 'tools', 'caspar-bridge', 'tests', 'support');
  return {
    playout: path.join(support, 'fake-playout.ts'),
    pgmFeed: path.join(support, 'fake-pgm-feed.ts'),
    station: path.join(support, 'fake-station.ts'),
    caspar: path.join(repo, 'tools', 'amcp-mock', 'dist', 'index.js'),
  };
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
    '--live-layers-path',
    paths.liveLayers,
    '--audit-log-path',
    paths.audit,
    '--playout-config-path',
    paths.playoutConfig,
    '--amcp-log-path',
    paths.amcpLog,
  ];
}

/**
 * The bridge, as CG Control starts it (`sidecar.rs`: `--first-run`, the lifeline, 7911) — with every
 * path named, the Playout address as its flag, and its console listener on the internal port.
 *
 * ⚠ NO `--caspar-host`, `--amcp-port` or `--osc-port`: any one of them makes the bridge build its
 * CasparCG connection from flags and ignore the one first-run writes from the Playout's channel
 * list. OSC's 6250 comes from that connection, exactly as it does in the installed app.
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
 * The ONE writer of the Playout target — the bridge's own one-shot, exactly as CG Control's
 * `set_playout_address` runs it. It replaces the whole Playout group, so an issuer adopted from
 * the previous address is cleared and the next station-admin sign-in adopts again.
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
 * plus the two the runtime's Vite config reads — the bridge's listener it relays `/pgm/` and
 * `/__cg/` to, and (`FIELD-FIXES-01` H) the one host a page asked for under `localhost` is sent
 * to, because the Playout's CORS list admits `127.0.0.1` and never `localhost`.
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

/** `Y`, `yes` or a bare Enter. Anything else — including no answer at all — is a no. */
export function answerIsYes(answer) {
  if (typeof answer !== 'string') return false;
  const a = answer.trim().toLowerCase();
  return a === '' || a === 'y' || a === 'yes';
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
 * `:0` — locale-independent, unlike the word LISTENING (the rule `sidecar.rs` and the connection
 * check use); a UDP socket has no state column and is always a holder.
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
 * What stands in the dev station's way: the installed CG Control's processes (to ASK about), and
 * any OTHER program on one of its ports (to NAME — never to stop: it is not ours to close).
 */
export function assess(processes, listeners, ports = STATION_PORTS) {
  const nameOf = (pid) => processes.find((p) => p.pid === pid)?.name ?? 'another program';
  const isInstalled = (name) => INSTALLED_IMAGES.includes(name.toLowerCase());
  const installed = processes.filter((p) => isInstalled(p.name));
  const blocked = [];
  for (const want of ports) {
    const holder = listeners.find((l) => l.proto === want.proto && l.port === want.port);
    if (holder === undefined) continue;
    const name = nameOf(holder.pid);
    if (!isInstalled(name)) blocked.push({ ...want, pid: holder.pid, name });
  }
  return { installed, blocked };
}

/** A port another program holds, in one line. */
export function blockedLine(b) {
  const port = b.proto === 'udp' ? `${String(b.port)}/udp` : String(b.port);
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
  if (fake?.caspar !== undefined) {
    const feeds = fake.feeds ?? [];
    lines.push(
      `  CasparCG ${fake.caspar}  (fake · channels 1 and 2${feeds.length > 0 ? ` · programme feeds on ${feeds.join(', ')}` : ''})`,
      '  check    "The Playout and CasparCG run on this machine" is expected here: they do.',
    );
  }
  for (const note of fake?.notes ?? []) lines.push(`  note     ${note}`);
  lines.push('  Ctrl+C stops it.', '');
  return lines;
}

/** The launcher's own flags: `--playout <url>`, `--fake`, `--no-open`. Anything else is refused. */
export function parseArgs(argv) {
  const out = { playout: undefined, fake: false, open: true };
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
    else return { error: `${arg} is not a dev:station flag (--playout <url>, --fake, --no-open).` };
  }
  if (out.fake && out.playout !== undefined)
    return { error: '--fake and --playout are one or the other.' };
  return out;
}

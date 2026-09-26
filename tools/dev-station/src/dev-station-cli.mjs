#!/usr/bin/env node
/**
 * 🔴 `DEV-STATION-01` — **`pnpm dev:station`: the current source, in the browser, on the installed
 * app's own origin and ports, with its own state.** Check a change in a minute; reinstall only for
 * the final check.
 *
 *   pnpm dev:station                  the remembered Playout (asked for once, the first time)
 *   pnpm dev:station --playout <url>  change it
 *   pnpm dev:station --fake           a whole fake station on loopback — the Playout, CasparCG
 *                                     serving channels 1 and 2, and their programme feeds (Node 23+)
 *   pnpm dev:station --no-open        do not open the browser
 *
 * It runs INSTEAD of CG Control, never beside it: the Playout's CORS admits one origin, UDP 6250
 * has one holder, and one channel has one station (`station-plan.mjs` has the three facts). The Playout
 * address is written by the bridge's own one-shot, as CG Control writes it — never over the socket
 * (ADR 0010: a gate whose configuration is behind the gate is not a gate).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runDevStation } from './station-sequence.mjs';
import { probeStation, stopProcesses, writeConsoleStub } from './station-processes.mjs';
import {
  BRIDGE_CONSOLE_PORT,
  CONSOLE_URL,
  bridgeArgs,
  buildArgs,
  devStateDir,
  fakeModulePaths,
  installedStateDir,
  isInside,
  parseArgs,
  previousStateDir,
  setAddressArgs,
  stationPaths,
  viteArgs,
  viteEnv,
} from './station-plan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const BRIDGE_CLI = path.join(repo, 'tools', 'caspar-bridge', 'bin', 'caspar-bridge.mjs');
const TURBO = path.join(repo, 'node_modules', 'turbo', 'bin', 'turbo');
const RUNTIME = path.join(repo, 'apps', 'runtime');
const VITE = path.join(RUNTIME, 'node_modules', 'vite', 'bin', 'vite.js');
const FAKES = fakeModulePaths(repo);
const BRIDGE_CONSOLE = `http://127.0.0.1:${String(BRIDGE_CONSOLE_PORT)}`;
const START_TIMEOUT_MS = 120_000;

const say = (line) => process.stderr.write(`${line}\n`);

async function ask(question) {
  // A yes nobody typed is not a yes: with no terminal to ask, the answer is none.
  if (process.stdin.isTTY !== true) return null;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function build() {
  const turbo = spawnSync(
    process.execPath,
    [TURBO, ...buildArgs(), '--output-logs=errors-only', '--ui=stream'],
    {
      cwd: repo,
      stdio: 'inherit',
    },
  );
  return turbo.status ?? 1;
}

function readPlayoutAddress(paths) {
  try {
    const file = JSON.parse(fs.readFileSync(paths.playoutConfig, 'utf8'));
    const address = file?.playout?.address;
    return typeof address === 'string' && address !== '' ? address : null;
  } catch {
    return null;
  }
}

function setPlayoutAddress(paths, address) {
  const written = spawnSync(process.execPath, [BRIDGE_CLI, ...setAddressArgs(paths, address)], {
    cwd: repo,
    encoding: 'utf8',
  });
  const said = (written.stderr ?? '').trim().split(/\r?\n/).pop() ?? '';
  if (written.status !== 0) throw new Error(said.replace(/^\[caspar-bridge\] /, ''));
}

/**
 * `DELTA-MULTI-CHANNEL-01-A` A1 — THE WHOLE FAKE STATION: `fake-station.ts`'s composition (the fake
 * Playout with its automatic path open to this loopback machine, CasparCG's stand-in behind that
 * Playout's allow list, and the channels' programme feeds), with every port explicit. Nothing here
 * reaches the product: the bridge meets this station exactly as it meets a real one.
 */
async function startFake() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!(major >= 23)) {
    throw new Error(
      `--fake needs Node 23 or newer (it runs the test suite's fakes from their TypeScript) — this is Node ${process.versions.node}.`,
    );
  }
  const load = (file) => import(pathToFileURL(file).href);
  const [playoutMod, feedMod, stationMod, casparMod] = await Promise.all([
    load(FAKES.playout),
    load(FAKES.pgmFeed),
    load(FAKES.station),
    load(FAKES.caspar),
  ]);
  const station = await stationMod.startFakeStation(
    {
      startFakePlayout: playoutMod.startFakePlayout,
      createMock: casparMod.createMock,
      startFakePgmFeed: feedMod.startFakePgmFeed,
    },
    stationMod.FAKE_STATION_PORTS,
  );
  return {
    address: station.playout.baseUrl,
    username: playoutMod.FAKE_ADMIN.username,
    password: playoutMod.FAKE_PLAYOUT_PASSWORD,
    caspar: `${stationMod.FAKE_STATION_HOST}:${String(station.caspar.amcpPort)}`,
    feeds: station.feeds.map((feed) => feed.port),
    notes: station.notes,
    stop: () => station.stop(),
  };
}

/**
 * `DELTA-MULTI-CHANNEL-01-A` A1 — a fresh fake station: the last one moves aside to `.previous`
 * (replacing the one before it), and the folder starts empty. Called only for `--fake`, only after
 * the build, and only on the fake station's own folder.
 */
function freshFakeState(stateDir) {
  const previous = previousStateDir(stateDir);
  fs.rmSync(previous, { recursive: true, force: true });
  if (fs.existsSync(stateDir)) fs.renameSync(stateDir, previous);
  fs.mkdirSync(stateDir, { recursive: true });
}

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

/** Resolve when `child` has exited — at once if it already has. */
function gone(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

function start(paths, playout) {
  // The bridge's console listener needs an `index.html`; the console itself is Vite's, on 5174.
  writeConsoleStub(paths.consoleDir);
  const bridge = spawn(process.execPath, [BRIDGE_CLI, ...bridgeArgs(paths, playout)], {
    cwd: repo,
    // stdin is the LIFELINE (`--exit-on-stdin-close`): if this launcher dies, the bridge stops.
    // stderr is where the bridge speaks: shown in the terminal AND kept in `bridge.log`.
    stdio: ['pipe', 'inherit', 'pipe'],
  });
  const log = fs.createWriteStream(paths.bridgeLog, { flags: 'w' });
  bridge.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk);
    log.write(chunk);
  });
  bridge.once('exit', () => log.end());
  const vite = spawn(process.execPath, [VITE, ...viteArgs()], {
    cwd: RUNTIME,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: viteEnv(process.env, BRIDGE_CONSOLE),
  });
  const children = { bridge, vite };
  const stop = async () => {
    // The bridge stops itself cleanly when its lifeline closes; Vite holds nothing but its port.
    bridge.stdin?.end();
    if (vite.exitCode === null) vite.kill('SIGINT');
    const late = await Promise.race([
      Promise.all([gone(bridge), gone(vite)]).then(() => false),
      new Promise((resolve) => setTimeout(() => resolve(true), 8000)),
    ]);
    if (late)
      for (const child of [bridge, vite]) if (child.exitCode === null) child.kill('SIGKILL');
    await Promise.all([gone(bridge), gone(vite)]);
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      void stop().then(() => reject(new Error(message)));
    };
    bridge.once('exit', (code) =>
      fail(`The bridge stopped while starting (exit ${String(code)}).`),
    );
    vite.once('exit', (code) =>
      fail(
        `The console server stopped while starting (exit ${String(code)}) — is ${CONSOLE_URL} taken?`,
      ),
    );
    const deadline = Date.now() + START_TIMEOUT_MS;
    const poll = async () => {
      if (settled) return;
      const health = await get(`${BRIDGE_CONSOLE}/__cg/health`);
      const page = await get(CONSOLE_URL);
      let bridgeUp = false;
      try {
        bridgeUp = health?.status === 200 && JSON.parse(health.body).pid === bridge.pid;
      } catch {
        bridgeUp = false;
      }
      if (bridgeUp && page?.status === 200) {
        settled = true;
        resolve({ children, stop });
        return;
      }
      if (Date.now() > deadline) {
        fail('The dev station did not come up within two minutes.');
        return;
      }
      setTimeout(() => void poll(), 400);
    };
    void poll();
  });
}

function openBrowser(url) {
  const [file, args] =
    process.platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const child = spawn(file, args, { stdio: 'ignore', detached: true });
  child.on('error', () => say(`  Open ${url} in the browser.`));
  child.unref();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if ('error' in options) {
    say(options.error);
    process.exitCode = 2;
    return;
  }
  const platform = process.platform;
  const home = os.homedir();
  const root = devStateDir(process.env, platform, home);
  const installed = installedStateDir(process.env, platform, home);
  if (isInside(root, installed, platform) || isInside(installed, root, platform)) {
    say(`The dev state folder ${root} overlaps CG Control's own ${installed} — refusing.`);
    process.exitCode = 2;
    return;
  }
  // `--fake` keeps its own station, so a fake run never replaces the remembered Playout.
  const stateDir = options.fake ? path.join(root, 'fake') : root;
  const paths = stationPaths(stateDir, platform);
  fs.mkdirSync(stateDir, { recursive: true });

  const result = await runDevStation(
    { ...options, stateDir, log: paths.bridgeLog },
    {
      probe: () => probeStation(platform),
      ask,
      stop: (pids) => stopProcesses(pids, { platform }),
      build,
      readPlayoutAddress: () => readPlayoutAddress(paths),
      setPlayoutAddress: async (address) => setPlayoutAddress(paths, address),
      freshFakeState: () => freshFakeState(stateDir),
      startFake,
      start: (playout) => start(paths, playout),
      open: openBrowser,
      print: say,
    },
  );
  if (result.outcome !== 'running') {
    process.exitCode = 1;
    return;
  }

  const { running, fake } = result;
  let stopping = false;
  const shutdown = async (code) => {
    if (stopping) return;
    stopping = true;
    say('[dev-station] stopping');
    await running.stop();
    await fake?.stop();
    say('[dev-station] stopped — every port is free.');
    process.exit(code);
  };
  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));
  // Either child ending takes the whole station down: half a station is not a station.
  running.children.bridge.once('exit', () => void shutdown(1));
  running.children.vite.once('exit', () => void shutdown(1));
}

await main();

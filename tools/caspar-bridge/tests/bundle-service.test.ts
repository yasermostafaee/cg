import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AUTH_REQUIRED_REFUSAL, defaultFixedLayerBank } from '@cg/shared-ipc';
import { BridgeHealthSchema } from '../src/health.js';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';
import { LOCAL_CASPAR_MARKER } from './support/local-caspar-station.js';
import { LOCAL_PLAYOUT_SOURCES_MARKER } from './support/local-playout-sources.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 A — **THE FILE CG BRIDGE SHIPS, run as the service runs it.**
 *
 * The installer carries `node.exe` (as `cg-bridge.exe`), the service host, and ONE bundled file
 * (`scripts/bundle.mjs`, staged by `stage-bridge.mjs`). This builds that file with the command the
 * staging runs, writes the configuration through the bundle's OWN one-shot exactly as the installer
 * does (`--write-service-config`), starts it as the service does (`--service-config`, here with every
 * port ephemeral and CasparCG a dead port), and checks what only the shipped file can show:
 *
 *   1. its first line names its version;
 *   2. every path it keeps resolves beside its configuration — never under the user's home;
 *   3. it answers `/health` as CG Bridge, this version, naming the Playout it was given;
 *   4. a console with no token writes NOTHING (the service always authenticates);
 *   5. nothing dev-only is inside it (§1 D: nothing dev-only reaches an installer).
 *
 * The same start from SOURCE — refusals, the other one-shots — is `service-cli.integration.test.ts`.
 * It needs `dist/` — the bundle inlines it — which turbo's `test` → `build` dependency provides.
 * Nothing here reaches a real station: the Playout is the fake one, on loopback.
 */

const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const BUNDLE_SCRIPT = fileURLToPath(new URL('../scripts/bundle.mjs', import.meta.url));
const BIN = fileURLToPath(new URL('../bin/caspar-bridge.mjs', import.meta.url));
/** `CLIENT-TEST-RELEASE-01` B1 — the version this package's manifest carries: the one it must name. */
const MANIFEST_VERSION = (
  JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
/** The first line of a start, for this manifest's version. */
const VERSION_LINE = new RegExp(
  `^\\[caspar-bridge\\] bridge ${MANIFEST_VERSION.replaceAll('.', '\\.')} starting \\(node v\\d+\\.\\d+\\.\\d+, pid \\d+\\)$`,
);
/** The service's flags that keep a test off every real port and core (as `service-cli`'s). */
const QUIET = [
  '--host',
  '127.0.0.1',
  '--port',
  '0',
  '--template-serve-port',
  '0',
  '--osc-port',
  '0',
];

let work: string;
let bundle: string;
/** `%ProgramData%\CG Bridge`, here: the configuration's directory is the service's state home. */
let stateHome: string;
let configFile: string;
let fakeHome: string;
let playout: FakePlayout;
let child: ChildProcessWithoutNullStreams;
let stderr = '';
let port = 0;

beforeAll(async () => {
  if (!fs.existsSync(DIST)) {
    throw new Error(
      `${DIST} is missing — the bundle inlines dist/. Build @cg/caspar-bridge first.`,
    );
  }
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-bundle-service-'));
  bundle = path.join(work, 'bridge', 'caspar-bridge.mjs');
  stateHome = path.join(work, 'Program Data', 'CG Bridge');
  configFile = path.join(stateHome, 'cg-bridge.json');
  fakeHome = path.join(work, 'home');
  fs.mkdirSync(fakeHome, { recursive: true });
  fs.mkdirSync(stateHome, { recursive: true });
  const env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome };

  // The exact command the staging runs.
  const bundled = spawnSync(process.execPath, [BUNDLE_SCRIPT, bundle], { encoding: 'utf8' });
  if (bundled.status !== 0) throw new Error(`bundling failed:\n${bundled.stderr}`);

  playout = await startFakePlayout();
  // The installer's one-shot, through the SHIPPED file: the configuration, through its schema.
  const written = spawnSync(
    process.execPath,
    [
      bundle,
      '--write-service-config',
      configFile,
      '--playout-address',
      playout.issuer,
      // A deliberately dead CasparCG: nothing this test runs may reach a real server.
      '--caspar-host',
      '127.0.0.1',
      '--amcp-port',
      '1',
    ],
    { encoding: 'utf8', env },
  );
  if (written.status !== 0) throw new Error(`--write-service-config failed:\n${written.stderr}`);

  child = spawn(process.execPath, [bundle, '--service-config', configFile, ...QUIET], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`the bundle never listened. stderr so far:\n${stderr}`));
    }, 30_000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      const m = /WS listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(stderr);
      // The boot's LAST line, so every line naming a file is in before any test reads them.
      if (m?.[1] !== undefined && stderr.includes('template HTTP server on ')) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`the bundle exited (${String(code)}) before listening:\n${stderr}`));
    });
  });
}, 60_000);

afterAll(async () => {
  if (child.exitCode === null) child.kill();
  await playout.stop();
});

/** One request on the control socket with NO token, answered by id. */
function askUnsigned(
  channel: string,
  payload: unknown,
): Promise<{ payload?: unknown; error?: unknown }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`no answer to ${channel}`));
    }, 10_000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'request', id: 'r1', channel, payload })));
    ws.on('message', (data: WebSocket.RawData) => {
      const frame = JSON.parse(data.toString()) as {
        id?: string;
        payload?: unknown;
        error?: unknown;
      };
      if (frame.id !== 'r1') return;
      clearTimeout(timer);
      ws.close();
      resolve(frame);
    });
    ws.on('error', reject);
  });
}

describe('CENTRAL-BRIDGE-01 — the bundle CG Bridge ships, started as the service starts it', () => {
  it('`CLIENT-TEST-RELEASE-01` B1 — its first line names its version, once', () => {
    // Positive control: the instrument reads a real start — it went on to listen, from its configuration.
    expect(stderr).toContain(`service configuration: ${configFile}`);
    expect(MANIFEST_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(stderr.split(/\r?\n/)[0]).toMatch(VERSION_LINE);
    expect(stderr.split(/\r?\n/).filter((line) => VERSION_LINE.test(line))).toHaveLength(1);
  });

  it('names every persisted path beside its configuration, and never the user home', () => {
    const cgRuntime = path.join(stateHome, '.cg-runtime');
    // Positive control: each boot line that names a file names it under the state home.
    for (const file of [
      'bridge-fixed-layers.json',
      'bridge-source-catalog.json',
      'bridge-source-assignments.json',
      // `PLAYOUT-SOURCES-01` — the Playout's last good input list and the bound media.
      'bridge-playout-inputs.json',
      'bridge-bound-media.json',
      'bridge-live-layers.json',
      'bridge-templates',
    ]) {
      expect(stderr, file).toContain(path.join(cgRuntime, file));
    }
    expect(stderr).toContain(`AMCP log: ${path.join(stateHome, 'logs', 'amcp.log')}`);
    // The absence: nothing the bundle printed points at the home directory it was given.
    expect(stderr).not.toContain(fakeHome);
  });

  it('answers /health as CG Bridge, this version, naming the Playout it was given', async () => {
    const res = await fetch(`http://127.0.0.1:${String(port)}/health`);
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(BridgeHealthSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
    expect(body).toMatchObject({
      app: 'cg-bridge',
      version: MANIFEST_VERSION,
      playout: { address: playout.issuer },
    });
  });

  it('a console with no token writes nothing — refused in the auth gate’s own words, and no file behind it', async () => {
    const bank = { ...defaultFixedLayerBank(), aliases: { '99': 'bundle' } };
    const answer = await askUnsigned('fixedLayers.set-config', bank);
    expect(answer.payload).toBeUndefined();
    // A refusal arrives as `error: { message }` — the auth gate's own sentence.
    expect((answer.error as { message?: string } | undefined)?.message).toBe(AUTH_REQUIRED_REFUSAL);
    // The absence, measured: no declaration landed under the state home, and nothing in the home dir.
    expect(fs.existsSync(path.join(stateHome, '.cg-runtime', 'bridge-fixed-layers.json'))).toBe(
      false,
    );
    expect(fs.readdirSync(fakeHome)).toEqual([]);
  });

  it('`PLAYOUT-SOURCES-01` §1.G — the auth-off provider is NOT in the bundle the installer ships', () => {
    const shipped = fs.readFileSync(bundle, 'utf8');
    // Positive control: the instrument reads the real bundle — the Playout's own D11 reader, which
    // asks `type=video,still`, is in it.
    expect(shipped).toContain('video,still');
    expect(shipped).toContain('/api/cg/media');
    // The absence: the local provider's marker, and the fake's fixtures, are nowhere in it.
    expect(shipped).not.toContain(LOCAL_PLAYOUT_SOURCES_MARKER);
    expect(shipped).not.toContain('STUDIO-PC (Cam 1)');
    expect(shipped).not.toContain('rtsp://cam:secret@');
  });

  it('`DEV-LOCAL-CASPAR-01` — `dev:station --caspar`’s local-core station is NOT in the bundle the installer ships', () => {
    const shipped = fs.readFileSync(bundle, 'utf8');
    // Positive control: the instrument reads the real bundle — the bridge's own D4 path and its
    // send guard's refusal code are in it.
    expect(shipped).toContain('/api/cg/channels');
    expect(shipped).toContain('amcp-guard-forbidden');
    // The absence: the station's marker, its loopback refusal, its D4 row id and its scanner note are
    // nowhere in it. ⚠ ASCII only: esbuild writes the bundle in its default ASCII charset, so a
    // non-ASCII pin (the row NAME's `·`) would be escaped in a leak and could never match.
    expect(shipped).not.toContain(LOCAL_CASPAR_MARKER);
    expect(shipped).not.toContain('--caspar never connects there');
    expect(shipped).not.toContain('local-ch');
    expect(shipped).not.toContain('casparcg_auto_restart.bat');
  });
});

describe('the one-shots and a refused start, which print what a caller reads', () => {
  it('`CLIENT-TEST-RELEASE-01` B1 — `--set-playout-address` (the dev station’s writer) prints no version line: its caller reads the last line', () => {
    const oneShot = spawnSync(
      process.execPath,
      [
        bundle,
        '--state-home',
        path.join(work, 'one-shot'),
        '--set-playout-address',
        'http://127.0.0.1:59999',
      ],
      { encoding: 'utf8', env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome } },
    );
    expect(oneShot.status).toBe(0);
    const lines = oneShot.stderr.split(/\r?\n/).filter((line) => line !== '');
    // Control: it ran and said what it wrote — as its one line.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/Playout address set to http:\/\/127\.0\.0\.1:59999/);
  });

  it('`CLIENT-TEST-RELEASE-01` B1 — from source, a REFUSED start still names the version first', () => {
    // `--state-home` with no value is refused before anything is read, bound or written.
    const refused = spawnSync(process.execPath, [BIN, '--state-home'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
    });
    expect(refused.status).toBe(1);
    const lines = refused.stderr.split(/\r?\n/).filter((line) => line !== '');
    expect(lines[0]).toMatch(VERSION_LINE);
    // Control: the refusal itself is the line after it.
    expect(lines[1]).toMatch(/--state-home needs a value/);
  });
});

/**
 * `DEV-STATION-01` — **THE LIFELINE A LAUNCHER HOLDS** (`--exit-on-stdin-close`). The service is
 * stopped by its host (Ctrl+C, `SIGINT` here); a launcher run from a checkout — `pnpm dev:station` —
 * holds the bridge's stdin instead, and Windows sends a child no SIGTERM, so the pipe closing is how
 * the bridge learns its launcher is gone.
 */
describe('the lifeline a launcher holds', () => {
  it('stops, and releases its port, when the parent closes its pipe', async () => {
    const home = path.join(work, 'lifeline');
    fs.mkdirSync(home, { recursive: true });
    const launched = spawn(
      process.execPath,
      [
        BIN,
        '--state-home',
        home,
        '--exit-on-stdin-close',
        '--port',
        '0',
        '--template-serve-port',
        '0',
        '--caspar-host',
        '127.0.0.1',
        '--amcp-port',
        '1',
        '--osc-port',
        '0',
      ],
      {
        env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    launched.stdout.resume();
    let out = '';
    const listening = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`never listened:\n${out}`)), 30_000);
      launched.stderr.setEncoding('utf8');
      launched.stderr.on('data', (chunk: string) => {
        out += chunk;
        const m = /WS listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(out);
        if (m?.[1] !== undefined) {
          clearTimeout(timer);
          resolve(Number(m[1]));
        }
      });
    });
    try {
      // Control: it is alive and answering before the pipe closes, so the exit below is the pipe's.
      expect(launched.exitCode).toBeNull();
      expect((await fetch(`http://127.0.0.1:${String(listening)}/health`)).status).toBe(200);

      const exited = new Promise<number | null>((resolve) => launched.once('exit', resolve));
      launched.stdin.end();
      const code = await Promise.race([
        exited,
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 15_000)),
      ]);
      expect(code).toBe(0);
      await expect(fetch(`http://127.0.0.1:${String(listening)}/health`)).rejects.toThrow();
    } finally {
      if (launched.exitCode === null) launched.kill();
    }
  }, 60_000);
});

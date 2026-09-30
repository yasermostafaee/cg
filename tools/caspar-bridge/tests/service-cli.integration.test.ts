import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { BridgeHealthSchema } from '../src/health.js';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 A (D2, D10, D11) — **THE CLI AS THE SERVICE RUNS IT**:
 * `cg-bridge.exe caspar-bridge.mjs --service-config %ProgramData%\CG Bridge\cg-bridge.json`.
 *
 * Every run here is a scratch directory: the configuration file's directory is the state home, and
 * `HOME`/`USERPROFILE` point at ANOTHER empty directory that must stay empty — a service never falls
 * back to `~/.cg-runtime`. CasparCG is a dead port (`127.0.0.1:1`), every listener ephemeral, and the
 * Playout is the fake one: nothing reaches a real station.
 */

const CLI = fileURLToPath(new URL('../bin/caspar-bridge.mjs', import.meta.url));
const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));

const dirs: string[] = [];
const playouts: FakePlayout[] = [];
afterEach(async () => {
  for (const p of playouts.splice(0)) await p.stop();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function scratch(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-service-cli-'));
  dirs.push(d);
  return d;
}

/** A `cg-bridge.json` in a fresh "ProgramData\CG Bridge". */
function configIn(body: Record<string, unknown>): string {
  const file = path.join(scratch(), 'cg-bridge.json');
  fs.writeFileSync(file, JSON.stringify(body));
  return file;
}

interface Run {
  readonly code: number | null;
  readonly out: string;
}

/** Run the CLI to its exit (a one-shot or a refused start). */
function runToExit(args: readonly string[], home: string): Promise<Run> {
  expect(fs.existsSync(DIST), `${DIST} is missing — build the bridge first`).toBe(true);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let out = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      out += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`the CLI did not exit. stderr:\n${out}`));
    }, 30_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

/** The service's flags that keep a test off every real port and core. */
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

describe('a configuration file CG Bridge cannot start from', () => {
  it('🔴 missing: the version line first, then the file named — and nothing written to the home directory', async () => {
    const home = scratch();
    const missing = path.join(scratch(), 'cg-bridge.json');
    const run = await runToExit(['--service-config', missing], home);
    expect(run.code).toBe(1);
    const lines = run.out.trim().split(/\r?\n/);
    expect(lines[0]).toMatch(/^\[caspar-bridge\] bridge \S+ starting/);
    expect(run.out).toContain(`${missing} cannot be read (it does not exist)`);
    expect(fs.readdirSync(home)).toEqual([]);
  });

  it('OSC 6250 — the Playout engine’s — is refused before anything binds', async () => {
    const file = configIn({ playoutAddress: 'http://127.0.0.1:1', oscPort: 6250 });
    const run = await runToExit(['--service-config', file], scratch());
    expect(run.code).toBe(1);
    expect(run.out).toContain("UDP 6250 belongs to the Playout's engine");
  });
});

describe('the installer’s one-shots', () => {
  it('--write-service-config: the installer’s values through the schema; an upgrade keeps what it was not given', async () => {
    const file = path.join(scratch(), 'CG Bridge', 'cg-bridge.json');
    const first = await runToExit(
      [
        '--write-service-config',
        file,
        '--playout-address',
        'http://192.0.2.10:8080',
        '--osc-port',
        '6260',
        // Empty = not given (NSIS passes every argument, the unset ones empty).
        '--caspar-host',
        '',
      ],
      scratch(),
    );
    expect(first.code, first.out).toBe(0);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
      playoutAddress: 'http://192.0.2.10:8080',
      oscPort: 6260,
    });
    // An upgrade that changes the control port keeps the rest.
    const upgrade = await runToExit(['--write-service-config', file, '--port', '5290'], scratch());
    expect(upgrade.code).toBe(0);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
      playoutAddress: 'http://192.0.2.10:8080',
      oscPort: 6260,
      controlPort: 5290,
    });
    // 6250 is refused, and the file is left as it was.
    const refused = await runToExit(
      ['--write-service-config', file, '--osc-port', '6250'],
      scratch(),
    );
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("UDP 6250 belongs to the Playout's engine");
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ oscPort: 6260 });
  });

  it('--check-ports: exit 0 with a verdict, binding nothing', async () => {
    const file = configIn({ playoutAddress: 'http://127.0.0.1:1', amcpPort: 1 });
    const run = await runToExit(['--service-config', file, '--check-ports'], scratch());
    expect(run.code).toBe(0);
    // Windows reads its ranges; anywhere else there is no verdict — never a fake "free".
    expect(run.out).toMatch(
      process.platform === 'win32' ? /ports free|reserved/ : /could not be read; no verdict/,
    );
  });

  it('--import-state: the newest older state lands in the service’s state home, once', async () => {
    const users = scratch();
    const old = path.join(users, 'operator', 'AppData', 'Roaming', 'CG Control', '.cg-runtime');
    fs.mkdirSync(old, { recursive: true });
    fs.writeFileSync(path.join(old, 'bridge-stack.json'), '{"items":[]}');
    fs.writeFileSync(path.join(old, 'bridge-session.json'), '{"refreshToken":"never"}');
    const file = configIn({ playoutAddress: 'http://127.0.0.1:1' });
    const run = await runToExit(['--service-config', file, '--import-state', users], scratch());
    expect(run.code).toBe(0);
    expect(run.out).toContain('imported 1 file(s)');
    const state = path.join(path.dirname(file), '.cg-runtime');
    expect(fs.readFileSync(path.join(state, 'bridge-stack.json'), 'utf8')).toBe('{"items":[]}');
    expect(fs.existsSync(path.join(state, 'bridge-session.json'))).toBe(false);
    // Once.
    const again = await runToExit(['--service-config', file, '--import-state', users], scratch());
    expect(again.out).toContain('already considered once');
  });
});

describe('🔴 a service start', () => {
  it('authenticates against its Playout, keeps its state beside its configuration, and answers /health', async () => {
    const playout = await startFakePlayout();
    playouts.push(playout);
    const home = scratch();
    const file = configIn({ playoutAddress: playout.issuer, amcpHost: '127.0.0.1', amcpPort: 1 });
    const child = spawn(process.execPath, [CLI, '--service-config', file, ...QUIET], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let out = '';
    try {
      const port = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`no listening line. stderr:\n${out}`));
        }, 30_000);
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
          out += chunk;
          const m = /WS listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(out);
          if (m !== null) {
            clearTimeout(timer);
            resolve(Number(m[1]));
          }
        });
        child.on('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`exited (${String(code)}). stderr:\n${out}`));
        });
      });
      expect(out).toContain(`service configuration: ${file}`);

      const res = await fetch(`http://127.0.0.1:${String(port)}/health`);
      // The boot lines after the listening one have been printed by now.
      expect(out).toContain('auth: PLAYOUT');
      expect(res.status).toBe(200);
      const body: unknown = await res.json();
      const parsed = BridgeHealthSchema.safeParse(body);
      expect(
        parsed.success,
        `${JSON.stringify(body)} ${JSON.stringify(parsed.success ? null : parsed.error.issues)}`,
      ).toBe(true);
      expect(body).toMatchObject({
        app: 'cg-bridge',
        playout: { address: playout.issuer, session: 'needs-admin' },
        casparcg: { state: 'down' },
        problems: [
          { code: 'playout-session', message: 'CG Bridge needs a station admin to sign in' },
        ],
      });
      /*
        The state home is the configuration's directory: the boot names every file it will use
        under it (stores are written on their first change, so an empty directory at start proves
        nothing), and the user's home is untouched.
      */
      const stateHome = path.dirname(file);
      expect(out).toContain(`AMCP log: ${path.join(stateHome, 'logs', 'amcp.log')}`);
      expect(out).toContain(path.join(stateHome, '.cg-runtime', 'bridge-live-layers.json'));
      expect(out).not.toContain(home);
      expect(fs.readdirSync(home)).toEqual([]);
    } finally {
      child.kill();
    }
  });
});

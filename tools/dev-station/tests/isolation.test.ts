import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bridgeArgs,
  devStateDir,
  installedStateDir,
  isInside,
  setAddressArgs,
  stationPaths,
} from '../src/station-plan.mjs';
import { writeConsoleStub } from '../src/station-processes.mjs';

/**
 * 🔴 `DEV-STATION-01` — **A DEV RUN WRITES NOTHING UNDER THE INSTALLED APP'S STATE FOLDER.**
 *
 * The REAL bridge, started with exactly the arguments `pnpm dev:station` gives it, under a scratch
 * home whose `APPDATA` holds an "installed CG Control" with a plant connection in it. Afterwards
 * that folder is byte-for-byte what it was, and no `~/.cg-runtime` exists — the default every
 * unnamed path would fall back to. Control: the dev station's own folder DID get its state.
 *
 * Nothing reaches a plant: the Playout address is a closed loopback port, and no CasparCG
 * connection is written.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_CLI = path.resolve(here, '../../caspar-bridge/bin/caspar-bridge.mjs');
const PLAYOUT = 'http://127.0.0.1:9';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const clean of cleanups.splice(0)) clean();
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

function health(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${String(port)}/__cg/health`, (res) => {
      res.resume();
      resolve(res.statusCode ?? null);
    });
    req.on('error', () => resolve(null));
  });
}

/** Every file under `dir`, with its bytes — the whole folder, compared as one value. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return out;
}

describe('isolation — the dev station keeps to its own state folder', () => {
  it('a dev run writes NOTHING under the installed app’s folder and creates no ~/.cg-runtime; control: it writes its own dev state', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-dev-station-'));
    cleanups.push(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const home = path.join(tmp, 'home');
    const env: Record<string, string | undefined> = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      APPDATA: path.join(home, 'AppData', 'Roaming'),
      LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
      XDG_DATA_HOME: path.join(home, '.local', 'share'),
    };
    delete env.CG_DEV_STATION_HOME;

    // The installed CG Control, as it sits on the owner's machine: a plant connection and a Playout.
    const installed = installedStateDir(env, process.platform, home);
    fs.mkdirSync(path.join(installed, '.cg-runtime'), { recursive: true });
    fs.writeFileSync(
      path.join(installed, '.cg-runtime', 'bridge-connection.json'),
      JSON.stringify({ servers: { A: { host: '192.168.21.111', amcpPort: 5250, oscPort: 6250 } } }),
    );
    fs.writeFileSync(
      path.join(installed, '.cg-runtime', 'bridge-playout.json'),
      JSON.stringify({ auth: 'playout', playout: { address: 'http://192.168.21.111:8080' } }),
    );
    const before = snapshot(installed);

    const dev = devStateDir(env, process.platform, home);
    const paths = stationPaths(dev, process.platform);
    // The launcher's two writes before the start, exactly as it makes them.
    writeConsoleStub(paths.consoleDir);
    const set = spawnSync(process.execPath, [BRIDGE_CLI, ...setAddressArgs(paths, PLAYOUT)], {
      env,
      encoding: 'utf8',
    });
    expect(set.status, set.stderr).toBe(0);

    const ports = {
      bridge: await freePort(),
      templates: await freePort(),
      bridgeConsole: await freePort(),
    };
    const bridge = spawn(process.execPath, [BRIDGE_CLI, ...bridgeArgs(paths, PLAYOUT, ports)], {
      env,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    cleanups.push(() => {
      if (bridge.exitCode === null) bridge.kill('SIGKILL');
    });
    let said = '';
    bridge.stderr?.on('data', (chunk: Buffer) => {
      said += chunk.toString();
    });
    const deadline = Date.now() + 30_000;
    while ((await health(ports.bridgeConsole)) !== 200) {
      if (bridge.exitCode !== null || Date.now() > deadline) {
        throw new Error(`the bridge did not come up:\n${said}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    // Ctrl+C's path: the lifeline closes and the bridge stops itself.
    const exited = new Promise((resolve) => bridge.once('exit', resolve));
    bridge.stdin?.end();
    await exited;

    // 🔴 The installed app's folder is exactly what it was, and no default was used.
    expect(snapshot(installed)).toEqual(before);
    expect(fs.existsSync(path.join(home, '.cg-runtime'))).toBe(false);
    // Nothing anywhere under the scratch home but the installed folder and the dev one.
    const elsewhere = Object.keys(snapshot(home)).filter(
      (f) =>
        !path.join(home, f).startsWith(installed + path.sep) &&
        !path.join(home, f).startsWith(dev + path.sep),
    );
    expect(elsewhere).toEqual([]);
    // CONTROL — the dev station did write its own state, and the bridge read it from there.
    const own = snapshot(dev);
    expect(JSON.parse(own[path.join('.cg-runtime', 'bridge-playout.json')] ?? '{}')).toEqual({
      auth: 'playout',
      playout: { address: PLAYOUT },
    });
    expect(said).toContain(dev);
    // "Under the installed folder" is the folder AND a separator: on Linux the two are siblings,
    // `…/CG Control` and `…/CG Control Dev`, so the bare string is a prefix of every dev path
    // (measured: CI run 35975399174 failed on exactly that, with nothing written there).
    expect(said).not.toContain(installed + path.sep);
    expect(isInside(dev, installed, process.platform)).toBe(false);
  });
});

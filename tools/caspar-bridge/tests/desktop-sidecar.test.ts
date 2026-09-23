import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import { CONSOLE_HEALTH_APP, CONSOLE_HEALTH_PATH } from '../src/console-http-server.js';

/**
 * 🔴 `DESKTOP-APPS-01` — **THE SIDECAR CG CONTROL SHIPS, run as the shell runs it.**
 *
 * The installer carries `node.exe` and ONE bundled file (`scripts/bundle.mjs`). This builds that
 * file, starts it the way the desktop shell does — `--state-home`, `--console-dir`,
 * `--exit-on-stdin-close`, stdin a pipe the parent holds — and checks the three promises the
 * shell depends on:
 *
 *   1. every path it persists resolves under `--state-home`, never under the user's home;
 *   2. it serves the console and the health identity on the console origin;
 *   3. it stops when the parent's pipe closes (Windows sends a child no SIGTERM).
 *
 * It needs `dist/` — the bundle inlines it — which turbo's `test` → `build` dependency provides.
 */

const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const BUNDLE_SCRIPT = fileURLToPath(new URL('../scripts/bundle.mjs', import.meta.url));

let work: string;
let bundle: string;
let stateHome: string;
let fakeHome: string;
let consoleDir: string;
let child: ChildProcessWithoutNullStreams;
let stderr = '';
let consoleUrl = '';
let wsUrl = '';

beforeAll(async () => {
  if (!fs.existsSync(DIST)) {
    throw new Error(
      `${DIST} is missing — the bundle inlines dist/. Build @cg/caspar-bridge first.`,
    );
  }
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-sidecar-'));
  bundle = path.join(work, 'bridge', 'caspar-bridge.mjs');
  stateHome = path.join(work, 'state home');
  fakeHome = path.join(work, 'home');
  consoleDir = path.join(work, 'console');
  fs.mkdirSync(fakeHome, { recursive: true });
  fs.mkdirSync(consoleDir, { recursive: true });
  fs.writeFileSync(path.join(consoleDir, 'index.html'), '<!doctype html><title>CG Control</title>');

  // The exact command CI stages the installer with.
  const bundled = spawnSync(process.execPath, [BUNDLE_SCRIPT, bundle], { encoding: 'utf8' });
  if (bundled.status !== 0) throw new Error(`bundling failed:\n${bundled.stderr}`);

  child = spawn(
    process.execPath,
    [
      bundle,
      '--state-home',
      stateHome,
      '--console-dir',
      consoleDir,
      '--console-port',
      '0',
      '--exit-on-stdin-close',
      '--port',
      '0',
      '--template-serve-port',
      '0',
      // A deliberately dead CasparCG: nothing this test runs may reach a real server.
      '--caspar-host',
      '127.0.0.1',
      '--amcp-port',
      '1',
      '--osc-port',
      '0',
    ],
    {
      // os.homedir() reads USERPROFILE on Windows and HOME on POSIX — both point at a directory
      // the sidecar must NEVER write to.
      env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  child.stdout.resume();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`the sidecar never served its console. stderr so far:\n${stderr}`));
    }, 30_000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      const c = /console on (http:\/\/127\.0\.0\.1:\d+)/.exec(stderr);
      const w = /WS listening on (ws:\/\/[^\s]+)/.exec(stderr);
      if (c?.[1] !== undefined && w?.[1] !== undefined) {
        consoleUrl = c[1];
        wsUrl = w[1];
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`the sidecar exited (${String(code)}) before booting:\n${stderr}`));
    });
  });
}, 60_000);

afterAll(() => {
  if (child.exitCode === null) child.kill();
});

/** One request on the control socket, answered by id. */
function ask(channel: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`no answer to ${channel}`));
    }, 10_000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'request', id: 'r1', channel, payload })));
    ws.on('message', (data: WebSocket.RawData) => {
      const frame = JSON.parse(data.toString()) as {
        type: string;
        id?: string;
        payload?: unknown;
        error?: string;
      };
      if (frame.id !== 'r1') return;
      clearTimeout(timer);
      ws.close();
      if (frame.type === 'error') reject(new Error(frame.error ?? 'error'));
      else resolve(frame.payload);
    });
    ws.on('error', reject);
  });
}

describe('DESKTOP-APPS-01 — the bundled sidecar, started as the desktop shell starts it', () => {
  it('names every persisted path under --state-home, and never the user home', () => {
    const cgRuntime = path.join(stateHome, '.cg-runtime');
    // Positive control: each boot line that names a file names it under --state-home.
    for (const file of [
      'bridge-fixed-layers.json',
      'bridge-source-catalog.json',
      'bridge-source-assignments.json',
      'bridge-live-layers.json',
      'bridge-templates',
    ]) {
      expect(stderr, file).toContain(path.join(cgRuntime, file));
    }
    // The absence: nothing the sidecar printed points at the home directory it was given.
    expect(stderr).not.toContain(fakeHome);
  });

  it('serves the console and answers the health identity on the console origin', async () => {
    const page = await fetch(`${consoleUrl}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>CG Control</title>');

    const health = (await (await fetch(`${consoleUrl}${CONSOLE_HEALTH_PATH}`)).json()) as {
      app: string;
      pid: number;
      execPath: string;
    };
    expect(health).toEqual({ app: CONSOLE_HEALTH_APP, pid: child.pid, execPath: process.execPath });
  });

  it('a write through the declaration door lands under --state-home and nowhere in the home dir', async () => {
    const bank = { ...defaultFixedLayerBank(), aliases: { '99': 'sidecar' } };
    const answer = (await ask('fixedLayers.set-config', bank)) as { ok: boolean };
    expect(answer.ok).toBe(true);
    // Positive control: the write happened, where --state-home says.
    expect(fs.existsSync(path.join(stateHome, '.cg-runtime', 'bridge-fixed-layers.json'))).toBe(
      true,
    );
    // The absence, measured against that control.
    expect(fs.readdirSync(fakeHome)).toEqual([]);
  });

  it('stops, and releases the console port, when the parent closes its pipe', async () => {
    // Control: it is alive before the pipe closes, so the exit below is the pipe's doing.
    expect(child.exitCode).toBeNull();
    expect((await fetch(`${consoleUrl}/`)).status).toBe(200);

    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
    child.stdin.end();
    const code = await Promise.race([
      exited,
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 15_000)),
    ]);
    expect(code).toBe(0);
    await expect(fetch(`${consoleUrl}/`)).rejects.toThrow();
  }, 30_000);
});

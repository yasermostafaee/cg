import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type Page } from '@playwright/test';
import { stopChild } from './child-process.js';

/**
 * 🔴 **THE CONSOLE AS CG CONTROL'S OWN PAGE, ON REAL CG BRIDGES THAT ARE NEVER DIALLED WHERE THEY CLAIM TO BE.**
 *
 * Written for `SIGNIN-ESCAPE-01` (`sign-in-gate-escape.spec.ts`) and shared since `SERVERS-SIMPLIFY-01`
 * (`connection-card.spec.ts`), so the two cannot come to stage CG Control differently:
 *
 *   - the built console served as CG Control's own page (`http://tauri.localhost`, the shell's IPC global present),
 *     with a station record on the FIRST load only (a reload is the console's own);
 *   - real CG Bridges (the CLI, `auth: playout`), every persisted path in a scratch folder, CasparCG on port 1;
 *   - each reached at a documentation address (RFC 5737), relayed here frame for frame — so a CG Bridge's host is
 *     not loopback to the console, and nothing is dialled there.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');

export const APP = 'http://tauri.localhost';
export const STATION_KEY = 'cg.runtime.station.v1';
/** Every request to the documentation block is refused here, never dialled (the dev host intercepts TEST-NET). */
export const EXAMPLE_HTTP = /^https?:\/\/192\.0\.2\.\d{1,3}[:/]/;
const SHOTS = process.env['CG_SHOTS_DIR'];

/** A port on `host` that nothing listens on: bound, read, and closed again. */
export async function deadPort(host: string): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** The CG Bridges one test starts, and their scratch folders — stopped and removed by {@link Stage.dispose}. */
export class Stage {
  readonly #children: ChildProcess[] = [];
  readonly #dirs: string[] = [];

  /**
   * The CG Bridge CLI in `auth: 'playout'` mode, its WS on this loopback; `playoutFlags` is its Playout. Its
   * CasparCG is `casparHost` (default `127.0.0.1`) on port 1, where nothing listens. Resolves with its URL.
   */
  async startBridge(
    playoutFlags: readonly string[],
    options: { readonly casparHost?: string; readonly extra?: readonly string[] } = {},
  ): Promise<string> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-control-'));
    this.#dirs.push(dir);
    const scratch = (name: string): string => path.join(dir, name);
    const child = spawn(
      process.execPath,
      [
        BRIDGE_CLI,
        '--auth',
        'playout',
        ...playoutFlags,
        '--playout-config-path',
        scratch('playout.json'),
        '--persist-path',
        scratch('connection.json'),
        '--fixed-layers-path',
        scratch('fixed.json'),
        '--reserved-layers-path',
        scratch('reserved.json'),
        '--source-catalog-path',
        scratch('catalog.json'),
        '--source-assignments-path',
        scratch('assignments.json'),
        '--playout-inputs-path',
        scratch('inputs.json'),
        '--bound-media-path',
        scratch('media.json'),
        '--live-layers-path',
        scratch('live.json'),
        '--audit-log-path',
        scratch('audit.ndjson'),
        '--templates-dir',
        scratch('templates'),
        '--caspar-host',
        options.casparHost ?? '127.0.0.1',
        '--amcp-port',
        '1',
        // OSC on an ephemeral port: the default 6251 is a dev station's, and AMCP here is dead.
        '--osc-port',
        '0',
        '--port',
        '0',
        '--template-serve-port',
        '0',
        ...(options.extra ?? []),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.#children.push(child);
    let boot = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      boot += chunk.toString();
    });
    // Both lines: the URL, then the auth mode — a bridge with no gate would make a spec vacuous.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const match = /WS listening on (ws:\/\/[^\s]+)/.exec(boot);
      if (match?.[1] !== undefined && boot.includes('auth: PLAYOUT')) return match[1];
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`the bridge never started in auth mode; its boot output was:\n${boot}`);
  }

  async dispose(): Promise<void> {
    for (const child of this.#children.splice(0)) await stopChild(child);
    for (const dir of this.#dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The page's socket to `ws://<host>:5280` carried, frame for frame, to the real bridge at `target` —
 * so the console believes CG Bridge is on `host`, and nothing is dialled there.
 */
export async function relay(page: Page, host: string, target: string): Promise<void> {
  await page.routeWebSocket(new RegExp(`^ws://${host.replace(/\./g, '\\.')}:5280/?$`), (ws) => {
    const upstream = new WebSocket(target);
    const waiting: string[] = [];
    upstream.addEventListener('open', () => {
      for (const frame of waiting.splice(0)) upstream.send(frame);
    });
    upstream.addEventListener('message', (event) => ws.send(String(event.data)));
    upstream.addEventListener('close', () => ws.close());
    upstream.addEventListener('error', () => ws.close());
    ws.onMessage((frame) => {
      const text = String(frame);
      if (upstream.readyState === WebSocket.OPEN) upstream.send(text);
      else waiting.push(text);
    });
    ws.onClose(() => upstream.close());
  });
}

/**
 * The built console as CG Control's own page, with `station` as its record on the FIRST load only (a
 * reload is the console's own). Every socket but the relayed ones is closed, never dialled.
 *
 * `signIn` — the shell answers `playout_post`, CG Control's native sign-in (`nativePlayoutFetch`), by posting
 * from THIS process (no browser, no `Origin`, as the shell does) to the fake Playout the address names: a
 * documentation host (RFC 5737) is this loopback, where the fakes listen. Without it, every command but the
 * keyboard read is refused, as before.
 */
export async function asCgControl(
  page: Page,
  station: { readonly playoutAddress: string; readonly bridgeAddress?: string },
  options: { readonly signIn?: boolean } = {},
): Promise<void> {
  const base = test.info().project.use.baseURL;
  if (typeof base !== 'string') throw new Error('the suite names no baseURL');
  if (options.signIn === true) {
    await page.exposeFunction('__cgE2ePlayoutPost', async (url: string, body: string) => {
      const target = new URL(url);
      if (/^192\.0\.2\.\d{1,3}$/.test(target.hostname)) target.hostname = '127.0.0.1';
      try {
        const res = await fetch(target, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        return { kind: 'answered', status: res.status, body: await res.text() };
      } catch (err) {
        return { kind: 'not-sent', reason: String(err) };
      }
    });
  }
  await page.route(`${APP}/**`, async (route) => {
    const url = new URL(route.request().url());
    try {
      const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    } catch (err) {
      // A request of a page that Set up again or Connect has just reloaded.
      if (!/has been closed|has been disposed/.test(String(err))) throw err;
    }
  });
  await page.route(EXAMPLE_HTTP, (route) => route.abort('connectionrefused'));
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.addInitScript(
    ({ key, record }) => {
      (window as unknown as { __CG_SPLASH_DISABLED__: boolean }).__CG_SPLASH_DISABLED__ = true;
      // The shell's IPC global, as CG Control's webview has it: the keyboard read, and (`signIn`) the sign-in.
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
        invoke: (command: string, args?: { url?: string; body?: string }) => {
          // Read at the call: the test's binding is the page's once it has loaded.
          const post = (window as unknown as { __cgE2ePlayoutPost?: unknown }).__cgE2ePlayoutPost;
          if (command === 'keyboard_language') return Promise.resolve('latin');
          if (command === 'playout_post' && typeof post === 'function') {
            return (post as (url: string, body: string) => Promise<unknown>)(
              args?.url ?? '',
              args?.body ?? '',
            );
          }
          return Promise.reject(new Error(`no ${command} in this test`));
        },
      };
      if (sessionStorage.getItem('e2e.seeded') === null) {
        sessionStorage.setItem('e2e.seeded', '1');
        localStorage.setItem(key, record);
      }
    },
    { key: STATION_KEY, record: JSON.stringify(station) },
  );
}

/** `CG_SHOTS_DIR` set: a report's picture is written there; unset, nothing is. */
export async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
}

/** One element's picture, for a report (`CG_SHOTS_DIR`). */
export async function shotOf(
  locator: { screenshot: (o: { path: string }) => Promise<unknown> },
  name: string,
): Promise<void> {
  if (SHOTS === undefined) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await locator.screenshot({ path: path.join(SHOTS, name) });
}

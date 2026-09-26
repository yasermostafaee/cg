import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserConfig } from 'vite';

/**
 * `P-041` — the DEV server is LAN-visible by default, the PREVIEW server is not, and the
 * boundary between them is Vite's own contract rather than a comment.
 *
 * `server.*` is read only by the `vite` dev server; `vite build` binds nothing; `vite
 * preview` reads `preview.*`. So pinning `server.host` and `preview.host` separately pins
 * the dev-only scope in code: a future edit that flips the preview default (the packaged
 * build's path) or quietly restores loopback on the dev server fails here.
 *
 * The config module reads `process.env.HOST` at import, so each case resets the module
 * registry and imports fresh.
 */

const saved = process.env.HOST;
const savedBridgeConsole = process.env.CG_BRIDGE_CONSOLE;
const savedConsoleHost = process.env.CG_CONSOLE_HOST;

async function loadConfig(): Promise<UserConfig> {
  vi.resetModules();
  const mod = (await import('../vite.config.js')) as { default: UserConfig };
  return mod.default;
}

beforeEach(() => {
  delete process.env.HOST;
  delete process.env.CG_BRIDGE_CONSOLE;
  delete process.env.CG_CONSOLE_HOST;
});

afterEach(() => {
  if (saved === undefined) delete process.env.HOST;
  else process.env.HOST = saved;
  if (savedBridgeConsole === undefined) delete process.env.CG_BRIDGE_CONSOLE;
  else process.env.CG_BRIDGE_CONSOLE = savedBridgeConsole;
  if (savedConsoleHost === undefined) delete process.env.CG_CONSOLE_HOST;
  else process.env.CG_CONSOLE_HOST = savedConsoleHost;
});

/**
 * `DEV-STATION-01` — the bridge's own console routes are relayed ONLY when the dev station names
 * its listener; a plain `pnpm --filter @cg/runtime dev` relays nothing, as before.
 */
describe('vite.config — the dev station relay', () => {
  it('no relay by default', async () => {
    const config = await loadConfig();
    expect(config.server?.proxy).toBeUndefined();
  });

  it('CG_BRIDGE_CONSOLE relays /pgm/ and /__cg/ — and nothing else — to the named listener', async () => {
    process.env.CG_BRIDGE_CONSOLE = 'http://127.0.0.1:5175';
    const config = await loadConfig();
    expect(config.server?.proxy).toEqual({
      '/pgm/': 'http://127.0.0.1:5175',
      '/__cg/': 'http://127.0.0.1:5175',
    });
  });
});

describe('vite.config — dev server bind (P-041)', () => {
  it('🔴 the dev server listens on every interface by default (LAN-visible)', async () => {
    const config = await loadConfig();
    expect(config.server?.host).toBe(true);
  });

  it('HOST=127.0.0.1 restricts the dev server back to loopback', async () => {
    process.env.HOST = '127.0.0.1';
    const config = await loadConfig();
    expect(config.server?.host).toBe('127.0.0.1');
  });

  it('the preview server (the built app) stays loopback by default — out of P-041 scope', async () => {
    const config = await loadConfig();
    expect(config.preview?.host).toBe('127.0.0.1');
  });

  it('HMR host is left UNSET so the client follows location.hostname over the LAN', async () => {
    const config = await loadConfig();
    // `server.hmr` absent (or an object with no `host`) is the shape Vite's client needs to
    // fall back to `importMetaUrl.hostname`; a pinned `host` here would point a remote
    // browser's HMR socket at the wrong machine while the page itself loads fine.
    const hmr = config.server?.hmr;
    if (typeof hmr === 'object' && hmr !== null) expect(hmr.host).toBeUndefined();
    else expect(hmr === undefined || hmr === true).toBe(true);
  });
});

/**
 * 🔴 `FIELD-FIXES-01` H — **A `localhost` PAGE IS SENT TO THE CONSOLE'S ONE HOST** on the dev station,
 * because the Playout's CORS list admits `127.0.0.1:5174` and never `localhost`. Measured through a
 * real Vite dev server in a real browser by `e2e/dev-station.spec.ts`; the rule and its scope here.
 */
describe('vite.config — the dev station sends localhost to its one host', () => {
  const pluginNames = (config: UserConfig): string[] =>
    (config.plugins ?? [])
      .flat()
      .map((p) => (typeof p === 'object' && p !== null && 'name' in p ? String(p.name) : ''));

  it('🔴 a request under localhost goes to 127.0.0.1 on the same port, path and query kept', async () => {
    const { consoleHostRedirect } = (await import('../vite.config.js')) as {
      consoleHostRedirect: (
        host: string | undefined,
        url: string | undefined,
        to: string,
      ) => string | null;
    };
    expect(consoleHostRedirect('localhost:5174', '/', '127.0.0.1')).toBe('http://127.0.0.1:5174/');
    expect(consoleHostRedirect('LOCALHOST:5174', '/pgm/2?v=0', '127.0.0.1')).toBe(
      'http://127.0.0.1:5174/pgm/2?v=0',
    );
    // CONTROL — the one host itself, and a LAN address, are served where they are.
    expect(consoleHostRedirect('127.0.0.1:5174', '/', '127.0.0.1')).toBeNull();
    expect(consoleHostRedirect('192.168.21.93:5174', '/', '127.0.0.1')).toBeNull();
    expect(consoleHostRedirect('localhost.example:5174', '/', '127.0.0.1')).toBeNull();
  });

  it('the redirect is the dev station’s: present with CG_CONSOLE_HOST, absent from a plain dev', async () => {
    expect(pluginNames(await loadConfig())).not.toContain('cg-console-host');
    process.env.CG_CONSOLE_HOST = '127.0.0.1';
    expect(pluginNames(await loadConfig())).toContain('cg-console-host');
  });
});

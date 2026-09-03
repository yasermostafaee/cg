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

async function loadConfig(): Promise<UserConfig> {
  vi.resetModules();
  const mod = (await import('../vite.config.js')) as { default: UserConfig };
  return mod.default;
}

beforeEach(() => {
  delete process.env.HOST;
});

afterEach(() => {
  if (saved === undefined) delete process.env.HOST;
  else process.env.HOST = saved;
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

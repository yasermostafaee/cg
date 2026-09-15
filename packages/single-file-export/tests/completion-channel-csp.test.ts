import { describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { ExporterSingleFile } from '../src/exporter-single-file.js';
import type { ImageAssetSource } from '../src/image-export.js';

/**
 * 🔴 `SELF-STOP-24` §2.1 — **THE TWO LINES IN THE PRODUCED PAGE THAT MAKE THE CHANNEL EXIST.**
 *
 * The emitter, the token and the reporter are all pinned in `@cg/template-runtime`. None of it
 * runs on air unless the page CasparCG actually loads carries two things, and this file is the
 * only place either is observable:
 *
 *  1. **`connect-src 'self'` in the CSP.** Until this change the policy named no `connect-src`,
 *     so it fell back to `default-src 'none'` and EVERY request from a template was refused by
 *     the page itself — in any engine, Chromium 71 or Chromium 140. That was a shipped, written
 *     down property (`SECURITY.md`), so relaxing it is a decision with a date on it and it is
 *     pinned here rather than left to be noticed.
 *  2. **the reporter, installed at boot.** `installCompletionPing` is inert unless something
 *     calls it, and the boot script is the ONE page CasparCG loads.
 *
 * ⚠ **The negative half is the one with teeth.** `'self'` and nothing wider: a host list or a
 * scheme wildcard would let a template phone home, which is the property `SECURITY.md` is about
 * and the reason the relaxation is worth this much prose.
 */

function makeScene(): Scene {
  return {
    schemaVersion: 1,
    id: 's1',
    name: 'My Template',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    layers: [],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  } as unknown as Scene;
}

async function produce(): Promise<string> {
  const exporter = new ExporterSingleFile({
    cgJsIife: 'var CG = {};',
    cgCss: 'html,body{background:transparent}',
    fontsCss: '',
    assets: { bytes: async () => null } as unknown as ImageAssetSource,
    fetchUrl: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  });
  return (await exporter.produce(makeScene())).html;
}

/** The policy string as the page declares it, so each directive can be read on its own. */
function cspOf(html: string): string {
  const m = /http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]*)"/.exec(html);
  expect(m, 'the produced page declares no CSP at all — every assertion below is void').not.toBe(
    null,
  );
  return m?.[1] ?? '';
}

describe('SELF-STOP-24 — the served page can reach its own origin, and nothing else', () => {
  it('declares connect-src self', async () => {
    expect(cspOf(await produce())).toContain("connect-src 'self'");
  });

  it('does NOT widen connect-src beyond the page own origin', async () => {
    const csp = cspOf(await produce());
    const connect = /connect-src ([^;]*)/.exec(csp)?.[1]?.trim();
    expect(connect, 'connect-src is not declared, so it falls back to default-src').toBeDefined();
    expect(connect, 'a template that can reach more than its own origin can phone home').toBe(
      "'self'",
    );
  });

  it('keeps default-src none — the relaxation is one directive, not a loosening', async () => {
    expect(cspOf(await produce())).toContain("default-src 'none'");
  });

  it('installs the completion reporter in the boot script', async () => {
    expect(await produce()).toContain('installCompletionPing');
  });

  it('installs it INSIDE the boot guard, so a failure shows on the output', async () => {
    // B-066's pattern: everything in the boot runs inside the try/catch that paints a visible
    // "cg boot error". A reporter installed outside it would die silent on a bad build.
    const html = await produce();
    const guardStart = html.indexOf('try {');
    const install = html.indexOf('installCompletionPing');
    const guardEnd = html.indexOf('} catch (e) {');
    expect(guardStart, 'the boot guard is gone — this test is measuring nothing').toBeGreaterThan(
      -1,
    );
    expect(install).toBeGreaterThan(guardStart);
    expect(install).toBeLessThan(guardEnd);
  });
});

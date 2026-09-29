import { describe, expect, it } from 'vitest';
import { pvwPageSource } from '../src/shared/pvwPage.js';

/**
 * 🔴 `RELEASE-091-01` §1 (`B-288`) — **THE PAGE PVW CHOOSES: the bridge first; this browser's copy only
 * when the bridge cannot be reached.**
 *
 * PVW read this browser's copy alone, so a template imported anywhere else could not be rehearsed
 * until it was re-imported here. The page CasparCG gets is the bridge's.
 */

const BRIDGE = '<!doctype html><html><body>the page the bridge serves</body></html>';
const LOCAL = '<!doctype html><html><body>this browser’s own copy</body></html>';

describe('RELEASE-091-01 §1 — the page source PVW chooses', () => {
  it('🔴 the bridge’s page wins over this browser’s copy', () => {
    expect(pvwPageSource({ ok: true, html: BRIDGE }, LOCAL)).toEqual({
      kind: 'page',
      html: BRIDGE,
      source: 'bridge',
    });
  });

  it('🔴 a browser that never imported the template still gets the bridge’s page', () => {
    expect(pvwPageSource({ ok: true, html: BRIDGE }, null)).toEqual({
      kind: 'page',
      html: BRIDGE,
      source: 'bridge',
    });
  });

  it('the copy is used ONLY when the bridge cannot be reached', () => {
    expect(pvwPageSource('unreachable', LOCAL)).toEqual({
      kind: 'page',
      html: LOCAL,
      source: 'local',
    });
    expect(pvwPageSource('unreachable', null)).toEqual({ kind: 'missing', reason: 'unreachable' });
  });

  it('CONTROL — a bridge that ANSWERS it holds no page is believed: the copy is never shown instead', () => {
    expect(pvwPageSource({ ok: false, reason: 'no-file' }, LOCAL)).toEqual({
      kind: 'missing',
      reason: 'no-file',
    });
    expect(pvwPageSource({ ok: false, reason: 'not-listed' }, LOCAL)).toEqual({
      kind: 'missing',
      reason: 'not-listed',
    });
  });
});

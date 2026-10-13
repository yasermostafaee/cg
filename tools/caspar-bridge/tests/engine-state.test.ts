import { describe, expect, it } from 'vitest';
import { engineState, type EngineStateInputs } from '../src/engine-state.js';

/**
 * 🔴 `RELEASE-0112-01` (`R-085`) — **AN ENGINE'S LINE, IN ONE WORD, decided once.** The order is the order
 * of remedies: nothing configured; a core another bridge drives; an engine that does not answer; a license
 * without CG; the session; AMCP last. A loopback core never reads "waiting for approval" (`BH` 44).
 */

const NOW = 1_000_000;
const base: EngineStateInputs = {
  configured: true,
  session: { state: 'signed-in', name: 'cg-admin' },
  lastSignInFailure: null,
  licensed: true,
  reachable: true,
  amcpUp: true,
  amcpRemote: true,
  signedInAtMs: NOW - 60_000,
  nowMs: NOW,
};
const at = (over: Partial<EngineStateInputs>) => engineState({ ...base, ...over });

describe('RELEASE-0112-01 — engineState', () => {
  it('the ordinary words: signed in, needs an admin, waiting, off', () => {
    expect(at({})).toEqual({ state: 'signed-in' });
    expect(at({ session: { state: 'needs-admin' } })).toEqual({ state: 'needs-admin' });
    expect(at({ session: { state: 'waiting' } })).toEqual({ state: 'waiting' });
    expect(at({ configured: false })).toEqual({ state: 'off' });
    expect(at({ session: { state: 'off' } })).toEqual({ state: 'off' });
  });

  it('🔴 CG not licensed: a D1 refusal before any token, a refused renewal, or the license read', () => {
    expect(at({ session: { state: 'needs-admin' }, lastSignInFailure: 'cg_not_licensed' })).toEqual(
      {
        state: 'not-licensed',
      },
    );
    expect(
      at({ session: { state: 'refused', message: 'نه', failure: 'cg_not_licensed' } }),
    ).toEqual({ state: 'not-licensed', message: 'نه' });
    expect(at({ licensed: false })).toEqual({ state: 'not-licensed' });
    // CONTROL — another refusal is the engine's own reason, not a license.
    expect(
      at({ session: { state: 'refused', message: 'disabled', failure: 'no_cg_access' } }),
    ).toEqual({ state: 'refused', message: 'disabled' });
    // A sign-in that later took clears the old code's effect.
    expect(at({ lastSignInFailure: 'cg_not_licensed' })).toEqual({ state: 'signed-in' });
  });

  it('unreachable outranks the session — its remedy comes first', () => {
    expect(at({ reachable: false, session: { state: 'needs-admin' } })).toEqual({
      state: 'unreachable',
    });
    expect(at({ reachable: null })).toEqual({ state: 'signed-in' });
  });

  it('🔴 AMCP waiting for approval: signed in, a REMOTE core refusing past the trust window — never a loopback core, never inside the window', () => {
    expect(at({ amcpUp: false })).toEqual({ state: 'amcp-pending' });
    expect(at({ amcpUp: false, amcpRemote: false })).toEqual({ state: 'signed-in' });
    expect(at({ amcpUp: false, signedInAtMs: NOW - 1_000 })).toEqual({ state: 'signed-in' });
    expect(at({ amcpUp: false, session: { state: 'needs-admin' } })).toEqual({
      state: 'needs-admin',
    });
  });

  it('🔴 B-313 — a held core outranks everything but "not configured"; a shared core is said once signed in', () => {
    expect(at({ coreHeldBy: '192.0.2.20:5280', reachable: false })).toEqual({
      state: 'core-held',
      message: '192.0.2.20:5280',
    });
    expect(at({ coreSharedWith: '192.0.2.10:5280' })).toEqual({
      state: 'core-shared',
      message: '192.0.2.10:5280',
    });
    expect(at({ configured: false, coreHeldBy: 'x' })).toEqual({ state: 'off' });
  });
});

import { describe, expect, it } from 'vitest';
import type { PlayoutPrincipal } from '@cg/shared-ipc';
import { lockCoverage } from '../src/renderer/hooks/useLock.js';
import type { AuthSessionState } from '../src/shared/runtime-bridge.js';

/**
 * 🔴 `B-257` constraint 5 — **A CONSOLE PRESENTS ITSELF AS LOCKED EXACTLY WHEN THE LOCK REACHES
 * IT.** The bridge refuses for the lock only when a covered-set lock covers a channel the
 * principal holds (`lockReaches`); the console's reading must come out the same way from the
 * same two inputs, or it shows a lock the bridge does not enforce — or hides one it does.
 */

const principal: PlayoutPrincipal = {
  name: 'علی رضایی',
  sub: 'u-1042',
  roles: ['operator', 'viewer'],
  channels: [{ host: '127.0.0.1', channel: 1 }],
  expiresAt: '2026-09-23T10:00:00.000Z',
  nameTruncated: false,
};
const signedIn = (permittedChannels: number[]): AuthSessionState => ({
  kind: 'signed-in',
  principal,
  permittedChannels,
});
const engaged = (channels?: number[]) => ({
  engaged: true,
  ...(channels !== undefined ? { channels } : {}),
});

describe('lockCoverage', () => {
  it('nothing engaged reaches nobody', () => {
    expect(lockCoverage({ engaged: false }, signedIn([1]))).toEqual({ kind: 'none' });
  });

  it('an every-channel lock covers every console — auth OFF, before any answer, and signed in', () => {
    for (const auth of [
      { kind: 'off' },
      { kind: 'unknown' },
      signedIn([2]),
      signedIn([]),
    ] as AuthSessionState[]) {
      expect(lockCoverage(engaged(), auth)).toEqual({ kind: 'all' });
    }
  });

  it('a covered-set lock does not reach a console holding none of its channels', () => {
    expect(lockCoverage(engaged([1]), signedIn([2]))).toEqual({ kind: 'none' });
    // Positive control — the SAME lock reaches the console that does hold channel 1.
    expect(lockCoverage(engaged([1]), signedIn([1]))).toEqual({ kind: 'all' });
  });

  it('a console that has not said who it is holds nothing a covered-set lock covers', () => {
    for (const kind of ['off', 'unknown', 'signed-out', 'expired'] as const) {
      expect(lockCoverage(engaged([1]), { kind } as AuthSessionState)).toEqual({ kind: 'none' });
    }
  });

  it('partial overlap names the covered channels, and only those', () => {
    expect(lockCoverage(engaged([1, 3]), signedIn([1, 2]))).toEqual({
      kind: 'partial',
      channels: [1],
    });
  });
});

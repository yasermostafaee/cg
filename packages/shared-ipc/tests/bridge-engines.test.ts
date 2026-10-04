import { describe, expect, it } from 'vitest';
import {
  BridgeBackupSignInChannel,
  BridgeSessionSignInChannel,
  ENGINE_PASSWORD_LINE,
  EngineSessionsSchema,
  engineChipText,
  engineNeedsAttention,
  engineStateText,
  suggestedBridgeAccount,
} from '../src/index.js';

/**
 * `RELEASE-0112-01` (`R-085`) and its delta C3 (`R-086`) — the per-engine wire's words, in one place.
 */

describe('RELEASE-0112-01-C C3 — the account a sign-in offers, by THAT engine’s version', () => {
  it('🔴 cg-bridge from 2.9.4 — cg-admin for 2.9.3 (its meters are empty), 2.9.2 (no such account) and an unread version', () => {
    expect(suggestedBridgeAccount('2.9.4')).toBe('cg-bridge');
    expect(suggestedBridgeAccount('2.10.0')).toBe('cg-bridge');
    expect(suggestedBridgeAccount('3.0.0')).toBe('cg-bridge');
    expect(suggestedBridgeAccount('2.9.3')).toBe('cg-admin');
    expect(suggestedBridgeAccount('2.9.2')).toBe('cg-admin');
    expect(suggestedBridgeAccount(null)).toBe('cg-admin');
    expect(suggestedBridgeAccount('not a version')).toBe('cg-admin');
  });
});

describe('RELEASE-0112-01 — each engine’s state, in words', () => {
  it('the five states the prompt names, and the rest', () => {
    expect(engineStateText({ state: 'signed-in', name: 'cg-admin' })).toBe(
      'Signed in as cg-admin.',
    );
    expect(engineStateText({ state: 'needs-admin' })).toBe('Needs a station admin to sign in.');
    expect(engineStateText({ state: 'not-licensed' })).toBe('CG not licensed on this engine.');
    expect(engineStateText({ state: 'amcp-pending' })).toContain('approve this machine');
    expect(engineStateText({ state: 'unreachable' })).toBe("The engine's API does not answer.");
    expect(engineStateText({ state: 'core-held', message: '192.0.2.20:5280' })).toBe(
      "Another CG Bridge drives this engine's CasparCG (192.0.2.20:5280); nothing is sent to it.",
    );
  });

  it('a chip only where a person is needed — never for signed in, waiting or off', () => {
    expect(engineNeedsAttention('signed-in')).toBe(false);
    expect(engineNeedsAttention('waiting')).toBe(false);
    expect(engineNeedsAttention('off')).toBe(false);
    expect(engineNeedsAttention('not-licensed')).toBe(true);
    expect(engineChipText('B', 'not-licensed')).toBe('B: CG NOT LICENSED');
  });

  it('the dialog’s one line names the Playout’s own page, in its own isolate', () => {
    expect(ENGINE_PASSWORD_LINE).toContain('\u2067تنظیمات ← اتصال به CG Control\u2069');
  });

  it('the backup’s sign-in is its OWN channel, with the primary’s shapes; a pair’s lines parse', () => {
    expect(BridgeBackupSignInChannel.name).toBe('bridgeSession.backup.sign-in');
    expect(BridgeBackupSignInChannel.request).toBe(BridgeSessionSignInChannel.request);
    expect(
      EngineSessionsSchema.safeParse({
        primary: {
          engine: 'primary',
          address: 'http://192.0.2.10:8080',
          state: 'signed-in',
          name: 'cg-admin',
          version: '2.9.2',
        },
        backup: {
          engine: 'backup',
          address: 'http://192.0.2.20:8080',
          state: 'not-licensed',
          version: null,
        },
      }).success,
    ).toBe(true);
  });
});

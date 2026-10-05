import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BridgeBackupSignInChannel,
  BridgeSessionSignInChannel,
  ENGINE_PASSWORD_WHERE,
  enginePasswordLead,
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
    expect(engineStateText({ state: 'amcp-pending' })).toContain('AMCP waits: press');
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

  it('🔴 RELEASE-0113-01 Part D — the dialog’s line is the Playout team’s own sentence (their §5), led by the account', () => {
    // Read from their letter as adopted, never retyped: the one copy of their words is theirs.
    const letter = fs.readFileSync(
      new URL(
        '../../../docs/integration/playout/PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md',
        import.meta.url,
      ),
      'utf8',
    );
    const at = letter.indexOf('«روی همان موتور');
    const theirs = letter.slice(at + 1, letter.indexOf('»', at)).replace(/\s*\n\s*/g, ' ');
    expect(at, 'the instrument found their sentence').toBeGreaterThan(0);
    expect(ENGINE_PASSWORD_WHERE).toBe(theirs);
    expect(enginePasswordLead('cg-admin')).toBe("Each engine's cg-admin password:");
    expect(enginePasswordLead('cg-bridge')).toBe("Each engine's cg-bridge password:");
  });

  it('🔴 RELEASE-0113-01 Part D — an engine whose AMCP waits says what to do: «تأیید» on THAT engine’s page, the client connected to it', () => {
    const isolate = (s: string): string =>
      `${String.fromCodePoint(0x2067)}${s}${String.fromCodePoint(0x2069)}`;
    const text = engineStateText({ state: 'amcp-pending' });
    expect(text).toContain(isolate('تأیید'));
    expect(text).toContain(isolate('اتصال به CG Control'));
    expect(text).toContain('with the Playout client connected to this engine');
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

import { describe, expect, it } from 'vitest';
import {
  CONNECTION_CHECK_LINE_MS,
  normaliseBridgeAddress,
  normalisePlayoutAddress,
  PLAYOUT_API_PORT,
  SETUP_CHECK_WAIT_MS,
  splitHostPort,
} from '../src/index.js';

/**
 * 🔴 `DESKTOP-APPS-01-C` C3 — **AN ADDRESS WITHOUT A PORT MEANS THE PLAYOUT'S API PORT.**
 *
 * The owner typed `http://192.168.21.111`; the check probed port 80, where nothing answers, and
 * timed out. The API is on 8080 (the contract's port).
 */
describe('C3 — normalisePlayoutAddress', () => {
  it('http:// with no port becomes the contract API port, :8080', () => {
    expect(PLAYOUT_API_PORT).toBe(8080);
    expect(normalisePlayoutAddress('http://192.168.21.111')).toBe('http://192.168.21.111:8080');
    expect(normalisePlayoutAddress('http://192.168.21.111/')).toBe('http://192.168.21.111:8080');
    expect(normalisePlayoutAddress('http://playout.local:')).toBe('http://playout.local:8080');
  });

  it('no scheme: http:// is assumed (and then the port rule applies)', () => {
    expect(normalisePlayoutAddress('192.168.21.111')).toBe('http://192.168.21.111:8080');
    expect(normalisePlayoutAddress('  playout.local:9000 ')).toBe('http://playout.local:9000');
  });

  it('an explicit port is kept byte for byte — :80 included, which a URL parser would drop', () => {
    expect(normalisePlayoutAddress('http://192.168.21.111:8080')).toBe(
      'http://192.168.21.111:8080',
    );
    expect(normalisePlayoutAddress('http://10.0.0.5:80')).toBe('http://10.0.0.5:80');
    expect(normalisePlayoutAddress('http://[::1]:8080')).toBe('http://[::1]:8080');
    expect(normalisePlayoutAddress('https://playout.local:8443')).toBe(
      'https://playout.local:8443',
    );
  });

  it('CONTROL — https with no port is left alone, and what is not an address is null', () => {
    expect(normalisePlayoutAddress('https://playout.local')).toBe('https://playout.local');
    expect(normalisePlayoutAddress('http://[::1]')).toBe('http://[::1]:8080');
    for (const bad of ['', '   ', 'ftp://host', 'http://', 'not a url at all']) {
      expect(normalisePlayoutAddress(bad), bad).toBeNull();
    }
  });
});

describe('C2 — the console waits longer than the slowest line, from ONE constant', () => {
  it('the wait is derived from the line bound, with margin', () => {
    expect(SETUP_CHECK_WAIT_MS).toBeGreaterThan(CONNECTION_CHECK_LINE_MS);
    expect(SETUP_CHECK_WAIT_MS).toBe(CONNECTION_CHECK_LINE_MS * 2);
  });
});

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D8) — **A SEPARATE SERVER'S CG BRIDGE ADDRESS**: `host` or `host:port`, as
 * typed; nothing typed means CG Bridge is on the Playout's host. The port comes from the TEXT — a URL
 * parser drops a scheme's default port, and `:80` would silently become the bridge's default.
 */
describe('CENTRAL-BRIDGE-01 — normaliseBridgeAddress', () => {
  it('a host, or a host and a port, as typed (trimmed); nothing typed is ""', () => {
    expect(normaliseBridgeAddress('192.0.2.30')).toBe('192.0.2.30');
    expect(normaliseBridgeAddress('  bridge.local:5281 ')).toBe('bridge.local:5281');
    expect(normaliseBridgeAddress('[::1]:5280')).toBe('[::1]:5280');
    expect(normaliseBridgeAddress('')).toBe('');
    expect(normaliseBridgeAddress('   ')).toBe('');
  });

  it('the port is read from the text — :80 is kept, which a URL parser would drop', () => {
    expect(splitHostPort('192.0.2.30:80')).toEqual({ host: '192.0.2.30', port: 80 });
    expect(normaliseBridgeAddress('192.0.2.30:80')).toBe('192.0.2.30:80');
    expect(splitHostPort('192.0.2.30')).toEqual({ host: '192.0.2.30', port: null });
  });

  it('CONTROL — a scheme, a path, credentials, a space or a port out of range is null', () => {
    for (const bad of [
      'http://192.0.2.30',
      'ws://192.0.2.30:5280',
      '192.0.2.30/',
      '192.0.2.30:5280/x',
      'user@192.0.2.30',
      'two words',
      '192.0.2.30:0',
      '192.0.2.30:65536',
      '192.0.2.30:',
      ':5280',
    ]) {
      expect(normaliseBridgeAddress(bad), bad).toBeNull();
    }
  });
});

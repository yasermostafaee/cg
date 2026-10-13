import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BRIDGE_HOST, DEFAULT_BRIDGE_PORT, DEFAULT_BRIDGE_WS_URL } from '@cg/shared-ipc';
import {
  bridgeHostPort,
  bridgeUrlFor,
  bridgeUrlForStation,
  resolveBridgeUrl,
} from '../src/platform/bridgeUrl.js';
import { saveStationAddress } from '../src/platform/stationAddress.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * `P-041` — the bridge URL follows the PAGE, never a constant.
 *
 * The defect, stated so it can be tested: a page opened at `192.168.21.93:5174` that calls
 * `127.0.0.1:5280`. From the dev machine those are the same box, so the old constant passed
 * every local check; from a second machine it is that machine's own loopback, and the app
 * sits DISCONNECTED with nothing wrong anywhere it can see.
 */

const globals = globalThis as { __CG_BRIDGE_URL__?: unknown; location?: unknown };

afterEach(() => {
  delete globals.__CG_BRIDGE_URL__;
  delete globals.location;
});

describe('bridgeUrlFor — pure derivation from a page location', () => {
  it('🔴 a page served from a LAN address probes THAT address, not loopback', () => {
    expect(bridgeUrlFor({ protocol: 'http:', hostname: '192.168.21.93' })).toBe(
      `ws://192.168.21.93:${String(DEFAULT_BRIDGE_PORT)}`,
    );
  });

  it('a page served from localhost probes localhost (the same box, by name)', () => {
    expect(bridgeUrlFor({ protocol: 'http:', hostname: 'localhost' })).toBe(
      `ws://localhost:${String(DEFAULT_BRIDGE_PORT)}`,
    );
  });

  it('a hostname is followed as-is, including a bracketed IPv6 literal', () => {
    expect(bridgeUrlFor({ protocol: 'http:', hostname: 'cg-dev.plant' })).toBe(
      `ws://cg-dev.plant:${String(DEFAULT_BRIDGE_PORT)}`,
    );
    expect(bridgeUrlFor({ protocol: 'http:', hostname: '[::1]' })).toBe(
      `ws://[::1]:${String(DEFAULT_BRIDGE_PORT)}`,
    );
  });

  it('an https page gets wss (a secure page refuses plain ws, and that would read as "bridge down")', () => {
    expect(bridgeUrlFor({ protocol: 'https:', hostname: '192.168.21.93' })).toBe(
      `wss://192.168.21.93:${String(DEFAULT_BRIDGE_PORT)}`,
    );
  });

  it('the PORT is the bridge default regardless of the page port — it is the bridge’s, not the page’s', () => {
    // A `PageLocation` carries no port on purpose: the page's port (4000/5174/…) says
    // nothing about where the bridge listens.
    expect(bridgeUrlFor({ protocol: 'http:', hostname: '10.0.0.7' })).toContain(
      `:${String(DEFAULT_BRIDGE_PORT)}`,
    );
  });

  it('no location (Node) or an empty hostname (file:, about:) falls back to loopback', () => {
    expect(bridgeUrlFor(undefined)).toBe(DEFAULT_BRIDGE_WS_URL);
    expect(bridgeUrlFor({ protocol: 'file:', hostname: '' })).toBe(
      `ws://${DEFAULT_BRIDGE_HOST}:${String(DEFAULT_BRIDGE_PORT)}`,
    );
    expect(bridgeUrlFor({ protocol: 'about:', hostname: '   ' })).toBe(DEFAULT_BRIDGE_WS_URL);
  });
});

describe('resolveBridgeUrl — precedence', () => {
  it('the harness override wins when it is a non-empty string', () => {
    globals.location = { protocol: 'http:', hostname: '192.168.21.93' };
    globals.__CG_BRIDGE_URL__ = 'ws://127.0.0.1:1';
    expect(resolveBridgeUrl()).toBe('ws://127.0.0.1:1');
  });

  it('an empty or non-string override is ignored, not honoured', () => {
    globals.location = { protocol: 'http:', hostname: '192.168.21.93' };
    globals.__CG_BRIDGE_URL__ = '';
    expect(resolveBridgeUrl()).toBe(`ws://192.168.21.93:${String(DEFAULT_BRIDGE_PORT)}`);
    globals.__CG_BRIDGE_URL__ = 42;
    expect(resolveBridgeUrl()).toBe(`ws://192.168.21.93:${String(DEFAULT_BRIDGE_PORT)}`);
  });

  it('with no override the page location decides', () => {
    globals.location = { protocol: 'http:', hostname: '192.168.21.93' };
    expect(resolveBridgeUrl()).toBe(`ws://192.168.21.93:${String(DEFAULT_BRIDGE_PORT)}`);
  });

  it('with no override and no location (Node) it is the loopback default', () => {
    expect(globals.location).toBeUndefined();
    expect(resolveBridgeUrl()).toBe(DEFAULT_BRIDGE_WS_URL);
  });

  it('a location missing the fields it reads counts as no location', () => {
    globals.location = { href: 'x' };
    expect(resolveBridgeUrl()).toBe(DEFAULT_BRIDGE_WS_URL);
  });
});

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D8) — CG Bridge is ONE service on the Playout machine, so a console finds
 * it from the Playout address its operator typed (port 5280), or where an admin said it is.
 */
describe('CENTRAL-BRIDGE-01 — this console’s station record', () => {
  beforeEach(() => {
    installMemoryStorage();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  const APP_PAGE = { protocol: 'http:', hostname: 'tauri.localhost' };

  it('🔴 CG Bridge on the Playout host, port 5280 — the operator types only the Playout address', () => {
    saveStationAddress({ playoutAddress: 'http://192.0.2.10:8080' });
    globals.location = APP_PAGE;
    expect(resolveBridgeUrl()).toBe(`ws://192.0.2.10:${String(DEFAULT_BRIDGE_PORT)}`);
  });

  it('an address typed without a scheme reads the same', () => {
    expect(bridgeUrlForStation({ playoutAddress: '192.0.2.10' })).toBe(
      `ws://192.0.2.10:${String(DEFAULT_BRIDGE_PORT)}`,
    );
  });

  it('an admin’s bridge address wins over the Playout host — a bridge on a separate server', () => {
    saveStationAddress({ playoutAddress: 'http://192.0.2.10:8080', bridgeAddress: '192.0.2.50' });
    globals.location = APP_PAGE;
    expect(resolveBridgeUrl()).toBe(`ws://192.0.2.50:${String(DEFAULT_BRIDGE_PORT)}`);
    saveStationAddress({
      playoutAddress: 'http://192.0.2.10:8080',
      bridgeAddress: '192.0.2.50:5290',
    });
    expect(resolveBridgeUrl()).toBe('ws://192.0.2.50:5290');
  });

  it('a bridge on port 80 keeps its port — read from the text, never through a URL parser that drops it', () => {
    saveStationAddress({
      playoutAddress: 'http://192.0.2.10:8080',
      bridgeAddress: '192.0.2.50:80',
    });
    globals.location = APP_PAGE;
    expect(resolveBridgeUrl()).toBe('ws://192.0.2.50:80');
    // …and the "not reachable" line names that port too.
    expect(bridgeHostPort('ws://192.0.2.50:80')).toBe('192.0.2.50:80');
    // CONTROL — an unreadable override is no bridge at all: the record gives none.
    expect(
      bridgeUrlForStation({ playoutAddress: 'http://192.0.2.10:8080', bridgeAddress: 'x/y' }),
    ).toBeNull();
  });

  it('🔴 CG Control’s own page with no record: NULL — the console asks for the Playout, it never guesses a bridge', () => {
    globals.location = APP_PAGE;
    expect(resolveBridgeUrl()).toBeNull();
  });

  it('CONTROL — a browser page with no record still follows its own host (the dev station)', () => {
    globals.location = { protocol: 'http:', hostname: '192.168.21.93' };
    expect(resolveBridgeUrl()).toBe(`ws://192.168.21.93:${String(DEFAULT_BRIDGE_PORT)}`);
  });

  it('the harness override still wins over a record', () => {
    saveStationAddress({ playoutAddress: 'http://192.0.2.10:8080' });
    globals.__CG_BRIDGE_URL__ = 'ws://127.0.0.1:1';
    expect(resolveBridgeUrl()).toBe('ws://127.0.0.1:1');
  });

  it('the "not reachable" line names host and port', () => {
    expect(bridgeHostPort('ws://192.0.2.10:5280')).toBe('192.0.2.10:5280');
    expect(bridgeHostPort('ws://192.0.2.10')).toBe(`192.0.2.10:${String(DEFAULT_BRIDGE_PORT)}`);
  });
});

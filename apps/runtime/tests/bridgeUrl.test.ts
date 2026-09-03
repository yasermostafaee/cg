import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BRIDGE_HOST, DEFAULT_BRIDGE_PORT, DEFAULT_BRIDGE_WS_URL } from '@cg/shared-ipc';
import { bridgeUrlFor, resolveBridgeUrl } from '../src/platform/bridgeUrl.js';

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

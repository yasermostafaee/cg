import { describe, expect, it } from 'vitest';
import {
  NO_HOST_PORT,
  bridgeAddressOf,
  bridgeFact,
  bridgeFieldsOf,
  hostFieldChange,
  playoutAddressOf,
  playoutFact,
  playoutFieldsOf,
  splitAddress,
  stationFieldsChanged,
} from '../src/renderer/features/firstRun/stationFields.js';

/**
 * `SERVERS-SIMPLIFY-01` (T1, T5) — the ONE reading of the address fields the Set up page and the Connection card
 * share: a host and a port each, every default a placeholder (an empty field IS the default), and a whole address
 * pasted into a host filling both.
 */

describe('T1 — a whole address in a Host field fills both fields', () => {
  it('a URL or host:port splits; a bare host is left as typed', () => {
    expect(splitAddress('http://192.168.21.32:8080')).toEqual({
      host: '192.168.21.32',
      port: '8080',
    });
    expect(splitAddress('http://192.168.21.32:8080/')).toEqual({
      host: '192.168.21.32',
      port: '8080',
    });
    expect(splitAddress('192.168.21.32:8081')).toEqual({ host: '192.168.21.32', port: '8081' });
    expect(splitAddress('http://playout01')).toEqual({ host: 'playout01', port: '' });
    // `https://` changes what is dialled, so it is the one scheme a host field keeps.
    expect(splitAddress('https://playout01:8443')).toEqual({
      host: 'https://playout01',
      port: '8443',
    });
    expect(splitAddress('192.168.21.32')).toBeNull();
    expect(splitAddress('ftp://192.168.21.32')).toBeNull();
    expect(splitAddress('http://192.168.21.32/api')).toBeNull();
  });

  it('a PASTE splits; typing one character at a time never moves text under the caret', () => {
    expect(hostFieldChange(NO_HOST_PORT, 'http://192.168.21.32:8080', true)).toEqual({
      host: '192.168.21.32',
      port: '8080',
    });
    // Typed: `192.168.21.32:` and then `8` — kept as typed, read as one address when it is composed.
    const typing = hostFieldChange({ host: '192.168.21.32:', port: '' }, '192.168.21.32:8', true);
    expect(typing).toEqual({ host: '192.168.21.32:8', port: '' });
    expect(playoutAddressOf({ host: '192.168.21.32:8080', port: '' })).toBe(
      'http://192.168.21.32:8080',
    );
    // `http://` typed in front of a host is stripped the moment a host follows it.
    expect(hostFieldChange({ host: 'http://', port: '' }, 'http://1', true)).toEqual({
      host: '1',
      port: '',
    });
  });

  it('CG Bridge’s address never has a scheme: a pasted URL stays as typed (and is refused), host:port splits', () => {
    expect(hostFieldChange(NO_HOST_PORT, 'http://192.0.2.30/', false)).toEqual({
      host: 'http://192.0.2.30/',
      port: '',
    });
    expect(bridgeAddressOf({ host: 'http://192.0.2.30/', port: '' }, '192.0.2.20')).toBeNull();
    expect(hostFieldChange(NO_HOST_PORT, '192.0.2.30:5281', false)).toEqual({
      host: '192.0.2.30',
      port: '5281',
    });
  });
});

describe('T5 — an empty field is the default, and a field shows text only when it overrides', () => {
  it('the Playout: an empty port is the API’s 8080', () => {
    expect(playoutAddressOf({ host: '192.168.21.32', port: '' })).toBe('http://192.168.21.32:8080');
    expect(playoutAddressOf({ host: '192.168.21.32', port: '8081' })).toBe(
      'http://192.168.21.32:8081',
    );
    expect(playoutAddressOf(NO_HOST_PORT)).toBeNull();
    expect(playoutAddressOf({ host: '192.168.21.32', port: '99999' })).toBeNull();
    // A host carrying a port, and a different port beside it, is not one address.
    expect(playoutAddressOf({ host: '192.168.21.32:8080', port: '8081' })).toBeNull();
    // As it is stored, the default port reads as an empty field.
    expect(playoutFieldsOf('http://192.168.21.32:8080')).toEqual({
      host: '192.168.21.32',
      port: '',
    });
    expect(playoutFieldsOf('http://192.168.21.32:8081')).toEqual({
      host: '192.168.21.32',
      port: '8081',
    });
    // An ORIGIN (`URL` drops port 80) is on port 80, which is not the default.
    expect(playoutFieldsOf('http://192.168.21.32')).toEqual({ host: '192.168.21.32', port: '80' });
  });

  it('CG Bridge: both empty is the Playout’s machine; a port alone is the Playout’s host on it; 5280 is never written', () => {
    expect(bridgeAddressOf(NO_HOST_PORT, '192.168.21.32')).toBe('');
    expect(bridgeAddressOf({ host: '', port: '5281' }, '192.168.21.32')).toBe('192.168.21.32:5281');
    expect(bridgeAddressOf({ host: '192.0.2.30', port: '' }, '192.168.21.32')).toBe('192.0.2.30');
    expect(bridgeAddressOf({ host: '192.0.2.30', port: '5280' }, '192.168.21.32')).toBe(
      '192.0.2.30',
    );
    expect(bridgeAddressOf({ host: '192.0.2.30', port: '5281' }, '192.168.21.32')).toBe(
      '192.0.2.30:5281',
    );
    expect(bridgeFieldsOf('192.0.2.30:5280')).toEqual({ host: '192.0.2.30', port: '' });
    expect(bridgeFieldsOf('192.0.2.30:5281')).toEqual({ host: '192.0.2.30', port: '5281' });
    expect(bridgeFieldsOf(null)).toEqual(NO_HOST_PORT);
  });
});

describe('T1 — an address as a FACT, and whether the fields changed it', () => {
  it('`host : port`', () => {
    expect(playoutFact('http://192.168.21.32:8080')).toBe('192.168.21.32 : 8080');
    expect(playoutFact('http://192.168.21.32')).toBe('192.168.21.32 : 80');
    expect(bridgeFact('192.168.21.32:5280')).toBe('192.168.21.32 : 5280');
  });

  it('compared as addresses: `192.168.21.32` and `192.168.21.32:8080` are one value', () => {
    const origin = 'http://192.168.21.32:8080';
    expect(
      stationFieldsChanged(
        { playout: { host: '192.168.21.32', port: '8080' }, bridge: NO_HOST_PORT },
        origin,
        null,
      ),
    ).toBe(false);
    expect(
      stationFieldsChanged(
        { playout: { host: '192.168.21.32', port: '' }, bridge: { host: '192.0.2.93', port: '' } },
        origin,
        null,
      ),
    ).toBe(true);
    expect(
      stationFieldsChanged(
        { playout: { host: '192.168.21.32', port: '' }, bridge: { host: '192.0.2.93', port: '' } },
        origin,
        '192.0.2.93',
      ),
    ).toBe(false);
  });
});

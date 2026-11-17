// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { saveStationAddress } from '../src/platform/stationAddress.js';
import { programmeServerDisplayName } from '../src/renderer/features/monitors/programmeServerDisplayName.js';

const signInUrl = 'http://192.168.21.33:8080/api/v1/auth/sign-in';

afterEach(() => {
  saveStationAddress(null);
});

describe('PGM server display name', () => {
  it('labels managed A with the configured Playout hostname when discovery reports loopback', () => {
    saveStationAddress({
      playoutAddress: 'http://192.168.21.32:8080',
      bridgeAddress: '192.168.21.41:5280',
    });

    const member = { engine: 'A' as const, name: 'Apasai Server (127.0.0.1)' };
    expect(programmeServerDisplayName(member, signInUrl)).toBe('Apasai Server (192.168.21.32)');
    expect(programmeServerDisplayName({ ...member, name: '[::1]' }, signInUrl)).toBe(
      '192.168.21.32',
    );
  });

  it('uses the effective sign-in origin if the console has no saved station', () => {
    expect(
      programmeServerDisplayName({ engine: 'A', name: 'Apasai Server (localhost)' }, signInUrl),
    ).toBe('Apasai Server (192.168.21.33)');
  });

  it('keeps an explicit network host, a reserve label, and the direct-mode label', () => {
    saveStationAddress({ playoutAddress: 'http://192.168.21.32:8080' });
    expect(
      programmeServerDisplayName({ engine: 'A', name: 'Apasai Server (192.168.21.43)' }, signInUrl),
    ).toBe('Apasai Server (192.168.21.43)');
    expect(
      programmeServerDisplayName({ engine: 'B', name: 'Apasai Server (127.0.0.1)' }, signInUrl),
    ).toBe('Apasai Server (127.0.0.1)');
    expect(
      programmeServerDisplayName({ engine: 'A', name: 'Apasai Server (127.0.0.1)' }, undefined),
    ).toBe('Apasai Server (127.0.0.1)');
  });
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ServiceConfigError,
  loadServiceConfig,
  serviceFlags,
  withServiceFlags,
} from '../src/service-config.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D2) — CG Bridge's configuration file: it fills the flags the command line
 * did not give (the command line always wins), its directory is the state home, and a file the
 * bridge cannot start from is a start failure that names the file — never a fall-back to
 * `~/.cg-runtime`.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function configFile(body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-bridge-config-'));
  dirs.push(dir);
  const file = path.join(dir, 'cg-bridge.json');
  fs.writeFileSync(file, body);
  return file;
}

describe('the file', () => {
  it('the minimum is the Playout address: every other value is the service default', () => {
    const file = configFile('{"playoutAddress":"http://127.0.0.1:8080"}');
    const loaded = loadServiceConfig(file);
    expect(loaded.stateHome).toBe(path.dirname(file));
    expect(serviceFlags(loaded)).toEqual({
      'state-home': path.dirname(file),
      auth: 'playout',
      'playout-address': 'http://127.0.0.1:8080',
      'caspar-host': '127.0.0.1',
      'amcp-port': '5250',
      'osc-port': '6251',
      host: '0.0.0.0',
      port: '5280',
      'template-serve-port': '7911',
      'bridge-session-path': path.join(path.dirname(file), '.cg-runtime', 'bridge-session.json'),
      'first-run': true,
    });
  });

  it('every key it has, and a Notepad BOM, are read', () => {
    const loaded = loadServiceConfig(
      configFile(
        String.fromCharCode(0xfeff) +
          '{"playoutAddress":"http://192.0.2.10:8080","amcpHost":"192.0.2.10","amcpPort":5251,' +
          '"oscPort":6260,"controlPort":5290,"templatePort":7912,"bridgeAddress":"192.0.2.50"}',
      ),
    );
    expect(serviceFlags(loaded)).toMatchObject({
      'caspar-host': '192.0.2.10',
      'amcp-port': '5251',
      'osc-port': '6260',
      port: '5290',
      'template-serve-port': '7912',
      'template-serve-host': '192.0.2.50',
    });
  });

  it('🔴 the command line always wins over the file', () => {
    const loaded = loadServiceConfig(configFile('{"playoutAddress":"http://127.0.0.1:8080"}'));
    const merged = withServiceFlags({ port: '6000', 'osc-port': '6300' }, loaded);
    expect(merged.port).toBe('6000');
    expect(merged['osc-port']).toBe('6300');
    expect(merged['playout-address']).toBe('http://127.0.0.1:8080');
  });
});

describe('🔴 a file CG Bridge cannot start from is said, naming the file', () => {
  it('missing', () => {
    const missing = path.join(os.tmpdir(), 'cg-bridge-no-such-dir', 'cg-bridge.json');
    expect(() => loadServiceConfig(missing)).toThrow(ServiceConfigError);
    expect(() => loadServiceConfig(missing)).toThrow(/cannot be read \(it does not exist\)/);
  });

  it('not JSON', () => {
    expect(() => loadServiceConfig(configFile('{playoutAddress:'))).toThrow(/is not JSON/);
  });

  it('OSC 6250 — the Playout engine’s — is refused with the one sentence', () => {
    const file = configFile('{"playoutAddress":"http://127.0.0.1:8080","oscPort":6250}');
    expect(() => loadServiceConfig(file)).toThrow(
      /"oscPort": UDP 6250 belongs to the Playout's engine/,
    );
  });

  it('an unknown key is refused (a typo must not start a bridge on a default)', () => {
    const file = configFile('{"playoutAddress":"http://127.0.0.1:8080","oscport":6260}');
    expect(() => loadServiceConfig(file)).toThrow(/wrong value/);
  });

  it('no Playout address', () => {
    expect(() => loadServiceConfig(configFile('{}'))).toThrow(/"playoutAddress"/);
  });
});

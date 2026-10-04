import { describe, expect, it } from 'vitest';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { withSavedBackup } from '../src/connection-store.js';

/**
 * 🔴 `B-312` — **THE SERVICE'S CONNECTION, WITH THE BACKUP STATION SETUP SAVED.** Server A is always the
 * flags' (the service's configuration file); server B comes from the saved file unless a flag declared
 * one; with no saved server B, nothing changes. The restart itself is `service-cli.integration.test.ts`.
 */

const A = { host: '192.0.2.10', amcpPort: 5250, oscPort: 6251 };
const fromFlags: ConnectionConfig = {
  servers: { A },
  strategy: 'mirror-sync',
  autoFailoverEnabled: true,
};
const saved: ConnectionConfig = {
  servers: {
    A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6251 },
    B: { host: '192.0.2.20', amcpPort: 5250, oscPort: 6252 },
  },
  strategy: 'mirror-async',
  autoFailoverEnabled: false,
};

describe('B-312 — withSavedBackup', () => {
  it('puts the saved server B back, with the saved strategy and auto-failover — server A stays the flags’', () => {
    expect(withSavedBackup(fromFlags, saved)).toEqual({
      servers: { A, B: saved.servers.B },
      strategy: 'mirror-async',
      autoFailoverEnabled: false,
    });
  });

  it('CONTROL — nothing saved, or a saved file with no server B: the flags’ connection, unchanged', () => {
    expect(withSavedBackup(fromFlags, null)).toBe(fromFlags);
    expect(withSavedBackup(fromFlags, { ...saved, servers: { A: saved.servers.A } })).toBe(
      fromFlags,
    );
  });

  it('a server B the flags declared wins over the saved one', () => {
    const typed: ConnectionConfig = {
      ...fromFlags,
      servers: { A, B: { host: '192.0.2.30', amcpPort: 5251, oscPort: 6252 } },
    };
    expect(withSavedBackup(typed, saved)).toBe(typed);
  });
});

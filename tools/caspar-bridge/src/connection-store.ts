import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConnectionConfigSchema, type ConnectionConfig } from '@cg/shared-ipc';

/**
 * R-010 — bridge-side persistence of the applied `ConnectionConfig`, so a
 * configured (possibly remote) setup survives a bridge restart without being
 * re-entered. The bridge is the config's authority, so durability lives
 * beside it — not in a browser profile (a renderer re-push would leave the
 * bridge booting against the wrong server until some page connects, and
 * split truth across two stores).
 *
 * Boot precedence (enforced in `createBridge`): explicit CLI connection >
 * this persisted file > `defaultConnection()`. Written only after a
 * successful apply, atomically (tmp + rename). Both operations are
 * non-fatal: persistence is the durability layer, never a gate.
 */

/** Load + schema-validate the persisted config; absent or invalid → null. */
export function loadPersistedConnection(persistPath: string): ConnectionConfig | null {
  let raw: string;
  try {
    raw = fs.readFileSync(persistPath, 'utf8');
  } catch {
    // Absent file is the normal first-boot case.
    return null;
  }
  try {
    return ConnectionConfigSchema.parse(JSON.parse(raw));
  } catch (err) {
    process.stderr.write(
      `[caspar-bridge] ⚠ ignoring invalid persisted connection at ${persistPath}: ` +
        `${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
}

/**
 * 🔴 `B-312` (`RELEASE-0112-01` §0.1) — **THE SERVICE'S CONNECTION, WITH THE BACKUP STATION SETUP SAVED.**
 *
 * CG Bridge the service takes server A from its configuration file (`serviceFlags` always passes
 * `--caspar-host`), so the CLI builds the connection from flags — and a given connection wins over this
 * file at boot. That dropped Station setup's server B at every restart: a reboot or an upgrade silently
 * stopped every line to the backup core. This puts the SAVED server B back, with the strategy and
 * auto-failover saved beside it. Server A stays the flags' (the configuration file's, so an installer
 * `/AMCPHOST=` still takes effect); a connection that already declares a server B (a typed `--backup-*`
 * flag) is returned as it is; no saved server B, nothing changes.
 */
export function withSavedBackup(
  fromFlags: ConnectionConfig,
  saved: ConnectionConfig | null,
): ConnectionConfig {
  if (fromFlags.servers.B !== undefined || saved?.servers.B === undefined) return fromFlags;
  return {
    ...fromFlags,
    servers: { A: fromFlags.servers.A, B: saved.servers.B },
    strategy: saved.strategy,
    autoFailoverEnabled: saved.autoFailoverEnabled,
  };
}

/** Atomically persist the config (mkdir -p + tmp + rename). Non-fatal on error. */
export function savePersistedConnection(persistPath: string, config: ConnectionConfig): void {
  try {
    fs.mkdirSync(path.dirname(persistPath), { recursive: true });
    const tmp = `${persistPath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, persistPath);
  } catch (err) {
    process.stderr.write(
      `[caspar-bridge] ⚠ failed to persist connection to ${persistPath}: ` +
        `${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

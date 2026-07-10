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

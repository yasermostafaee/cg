import * as path from 'node:path';
import * as os from 'node:os';
import type { BrowserWindow, IpcMain } from 'electron';
import { AuditService } from './services/AuditService.js';
import { ConnectionService } from './services/ConnectionService.js';
import { LockService } from './services/LockService.js';
import { SettingsService } from './services/SettingsService.js';
import { StackService } from './services/StackService.js';
import { TemplateRegistry } from './services/TemplateRegistry.js';
import { UpdateGate } from './services/UpdateGate.js';
import { registerIpcHandlers } from './ipc/register.js';

/**
 * Boot the runtime's core services and wire IPC. Called from `index.ts`
 * once the BrowserWindow exists and the renderer's webContents is
 * available to push to.
 *
 * The CasparCG endpoints come from environment variables for now:
 *   CG_PRIMARY_HOST / CG_PRIMARY_AMCP_PORT / CG_PRIMARY_OSC_PORT
 *   CG_BACKUP_HOST  / CG_BACKUP_AMCP_PORT  / CG_BACKUP_OSC_PORT
 *   CG_STRATEGY     (mirror-sync | mirror-async | journal-replay)
 *   CG_AUTO_FAILOVER (true | false)
 *
 * A proper Settings UI + config file land with M5.4.
 */
export interface BootContext {
  ipcMain: IpcMain;
  window: BrowserWindow;
}

export interface BootHandle {
  connections: ConnectionService;
  stack: StackService;
  lock: LockService;
  templates: TemplateRegistry;
  audit: AuditService;
  updateGate: UpdateGate;
  settings: SettingsService;
  /** Detach everything wired by boot(). Used in tests and on app quit. */
  shutdown(): Promise<void>;
}

export function boot(ctx: BootContext): BootHandle {
  const config = readConfigFromEnv();
  const connections = new ConnectionService(config);
  const templates = new TemplateRegistry();
  const stack = new StackService({ connections, templates });
  const lock = new LockService();
  const audit = new AuditService({
    filePath: process.env['CG_AUDIT_FILE'] ?? path.join(os.tmpdir(), 'cg-audit', 'runtime.ndjson'),
    actor: process.env['CG_AUDIT_ACTOR'] ?? 'local',
  });
  audit.bindStack(stack);
  audit.bindLock(lock);
  const updateGate = new UpdateGate({ stack });
  const settings = new SettingsService({
    filePath: process.env['CG_SETTINGS_FILE'] ?? path.join(os.tmpdir(), 'cg-settings.json'),
  });
  settings.load();

  // Surface gate transitions into the audit log. The actual update-installed
  // row fires from the updater's quitAndInstall callback in M11.
  updateGate.on('state-changed', (pending) => {
    if (pending !== null) {
      void audit
        .record({ action: 'update-deferred', outcome: 'ok' })
        .catch((err: unknown) => void err);
    }
  });

  const unwire = registerIpcHandlers({
    ipcMain: ctx.ipcMain,
    webContents: ctx.window.webContents,
    stack,
    connections,
    lock,
    templates,
    audit,
    updateGate,
    settings,
  });

  connections.start();

  return {
    connections,
    stack,
    lock,
    templates,
    audit,
    updateGate,
    settings,
    async shutdown() {
      unwire();
      await audit.close();
      await connections.stop();
    },
  };
}

function readConfigFromEnv(): ConstructorParameters<typeof ConnectionService>[0] {
  const env = process.env;
  return {
    servers: {
      A: {
        host: env['CG_PRIMARY_HOST'] ?? '127.0.0.1',
        amcpPort: numberOr(env['CG_PRIMARY_AMCP_PORT'], 5250),
        oscPort: numberOr(env['CG_PRIMARY_OSC_PORT'], 6250),
      },
      B: {
        host: env['CG_BACKUP_HOST'] ?? '127.0.0.1',
        amcpPort: numberOr(env['CG_BACKUP_AMCP_PORT'], 5251),
        oscPort: numberOr(env['CG_BACKUP_OSC_PORT'], 6251),
      },
    },
    strategy: parseStrategy(env['CG_STRATEGY']),
    autoFailoverEnabled: env['CG_AUTO_FAILOVER'] !== 'false',
  };
}

/**
 * Parse a port-ish env var. Returns the parsed value (including `0` for
 * OSC ephemeral binds) when it's a non-negative finite number; falls
 * back otherwise. AMCP port `0` is allowed by parse but will fail fast
 * at connect time — that's fine; misconfiguration should surface noisily.
 */
function numberOr(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseStrategy(v: string | undefined): 'mirror-sync' | 'mirror-async' | 'journal-replay' {
  if (v === 'mirror-async' || v === 'journal-replay') return v;
  return 'mirror-sync';
}

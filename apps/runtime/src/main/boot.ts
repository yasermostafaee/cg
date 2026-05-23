import type { BrowserWindow, IpcMain } from 'electron';
import { ConnectionService } from './services/ConnectionService.js';
import { LockService } from './services/LockService.js';
import { StackService } from './services/StackService.js';
import { TemplateRegistry } from './services/TemplateRegistry.js';
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
  /** Detach everything wired by boot(). Used in tests and on app quit. */
  shutdown(): Promise<void>;
}

export function boot(ctx: BootContext): BootHandle {
  const config = readConfigFromEnv();
  const connections = new ConnectionService(config);
  const templates = new TemplateRegistry();
  const stack = new StackService({ connections, templates });
  const lock = new LockService();

  const unwire = registerIpcHandlers({
    ipcMain: ctx.ipcMain,
    webContents: ctx.window.webContents,
    stack,
    connections,
    lock,
  });

  connections.start();

  return {
    connections,
    stack,
    lock,
    templates,
    async shutdown() {
      unwire();
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

function numberOr(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseStrategy(v: string | undefined): 'mirror-sync' | 'mirror-async' | 'journal-replay' {
  if (v === 'mirror-async' || v === 'journal-replay') return v;
  return 'mirror-sync';
}

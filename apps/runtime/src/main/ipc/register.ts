import {
  AuditRecentChannel,
  ConnectionsConfigChannel,
  ConnectionsFailoverChannel,
  ConnectionsHealthChangedChannel,
  ConnectionsHealthChannel,
  LockEngageChannel,
  LockReleaseChannel,
  LockStateChangedChannel,
  LockStateChannel,
  StackLoadChannel,
  StackOutChannel,
  StackRemoveChannel,
  StackSnapshotChannel,
  StackStateChangedChannel,
  StackTakeChannel,
  StackUpdateChannel,
  TemplatesGetChannel,
  TemplatesListChannel,
  UpdateCancelChannel,
  UpdateRequestChannel,
  UpdateStateChangedChannel,
  UpdateStateChannel,
  SettingsChangedChannel,
  SettingsGetChannel,
  SettingsSetChannel,
  handle,
  publish,
  type IpcHandler,
  type IpcPublisher,
} from '@cg/shared-ipc';
import { readRecentEntries } from '@cg/audit';
import type { AuditService } from '../services/AuditService.js';
import type { ConnectionService } from '../services/ConnectionService.js';
import type { LockService } from '../services/LockService.js';
import type { StackService } from '../services/StackService.js';
import type { TemplateRegistry } from '../services/TemplateRegistry.js';
import type { UpdateGate } from '../services/UpdateGate.js';
import type { SettingsService } from '../services/SettingsService.js';

/**
 * Wires every runtime IPC channel.
 *
 * Two effects:
 *   1. Request/response handlers are registered against `ipcMain.handle`.
 *   2. Service event streams are subscribed and re-published to the
 *      provided WebContents via `webContents.send`.
 *
 * Returns an `unwire()` callback so tests + shutdown can detach the
 * service listeners cleanly.
 */
export interface IpcWiring {
  ipcMain: IpcHandler;
  webContents: IpcPublisher;
  stack: StackService;
  connections: ConnectionService;
  lock: LockService;
  templates: TemplateRegistry;
  audit: AuditService;
  updateGate: UpdateGate;
  settings: SettingsService;
}

export function registerIpcHandlers(deps: IpcWiring): () => void {
  const { ipcMain, webContents, stack, connections, lock, templates, audit, updateGate, settings } =
    deps;

  // ── stack.* ─────────────────────────────────────────────────────────
  handle(ipcMain, StackLoadChannel, (req) => {
    const accepted = stack.load({
      itemId: req.itemId,
      templateId: req.templateId,
      fields: req.fields,
    });
    return { accepted };
  });
  handle(ipcMain, StackTakeChannel, (req) => stack.take(req.itemId));
  handle(ipcMain, StackUpdateChannel, (req) => stack.update(req.itemId, req.fields, req.mergeMode));
  handle(ipcMain, StackOutChannel, (req) => stack.out(req.itemId, req.immediate));
  handle(ipcMain, StackRemoveChannel, (req) => stack.remove(req.itemId));
  handle(ipcMain, StackSnapshotChannel, () => [...stack.snapshot()]);

  // ── connections.* ───────────────────────────────────────────────────
  handle(ipcMain, ConnectionsConfigChannel, () => connections.getConfig());
  handle(ipcMain, ConnectionsHealthChannel, () => connections.getHealth());
  handle(ipcMain, ConnectionsFailoverChannel, async (req) => {
    const newPrimary = await connections.failover(req.reason);
    return { ok: true, newPrimary };
  });

  // ── lock.* ──────────────────────────────────────────────────────────
  handle(ipcMain, LockEngageChannel, (req) => lock.engage(req.pin));
  handle(ipcMain, LockReleaseChannel, (req) => lock.release(req.pin));
  handle(ipcMain, LockStateChannel, () => lock.getState());

  // ── templates.* ─────────────────────────────────────────────────────
  handle(ipcMain, TemplatesGetChannel, (req) => {
    const entry = templates.get(req.templateId);
    if (entry === null) return null;
    return {
      templateId: entry.templateId,
      templateType: entry.templateType,
      fields: [...entry.fields],
    };
  });
  handle(ipcMain, TemplatesListChannel, () =>
    templates.list().map((e) => ({
      templateId: e.templateId,
      templateType: e.templateType,
      fields: [...e.fields],
    })),
  );

  // ── audit.* ─────────────────────────────────────────────────────────
  handle(ipcMain, AuditRecentChannel, (req) =>
    readRecentEntries({
      filePath: audit.filePath,
      ...(req.limit !== undefined ? { limit: req.limit } : {}),
      ...(req.action !== undefined ? { action: req.action } : {}),
      ...(req.actor !== undefined ? { actor: req.actor } : {}),
    }),
  );

  // ── update.* ────────────────────────────────────────────────────────
  handle(ipcMain, UpdateRequestChannel, (req) => {
    const requestOpts: { version: string; notes?: string } = { version: req.version };
    if (req.notes !== undefined) requestOpts.notes = req.notes;
    return updateGate.request(requestOpts);
  });
  handle(ipcMain, UpdateStateChannel, () => updateGate.getPending());
  handle(ipcMain, UpdateCancelChannel, () => {
    updateGate.cancel();
    return { ok: true };
  });

  // ── settings.* ──────────────────────────────────────────────────────
  handle(ipcMain, SettingsGetChannel, () => settings.get());
  handle(ipcMain, SettingsSetChannel, (req) => settings.set(req));

  // ── pushes ──────────────────────────────────────────────────────────
  const onStackChange = (snapshot: readonly { itemId: string }[]): void => {
    publish(webContents, StackStateChangedChannel, [...snapshot] as Parameters<
      typeof publish<typeof StackStateChangedChannel>
    >[2]);
  };
  const onHealthChange = (
    health: Parameters<typeof publish<typeof ConnectionsHealthChangedChannel>>[2],
  ): void => {
    publish(webContents, ConnectionsHealthChangedChannel, health);
  };
  const onLockChange = (
    state: Parameters<typeof publish<typeof LockStateChangedChannel>>[2],
  ): void => {
    publish(webContents, LockStateChangedChannel, state);
  };
  const onUpdateState = (
    pending: Parameters<typeof publish<typeof UpdateStateChangedChannel>>[2],
  ): void => {
    publish(webContents, UpdateStateChangedChannel, pending);
  };
  const onSettingsChanged = (
    next: Parameters<typeof publish<typeof SettingsChangedChannel>>[2],
  ): void => {
    publish(webContents, SettingsChangedChannel, next);
  };
  stack.on('state-changed', onStackChange);
  connections.on('health-changed', onHealthChange);
  lock.on('state-changed', onLockChange);
  updateGate.on('state-changed', onUpdateState);
  settings.on('settings-changed', onSettingsChanged);

  return () => {
    stack.off('state-changed', onStackChange);
    connections.off('health-changed', onHealthChange);
    lock.off('state-changed', onLockChange);
    updateGate.off('state-changed', onUpdateState);
    settings.off('settings-changed', onSettingsChanged);
  };
}

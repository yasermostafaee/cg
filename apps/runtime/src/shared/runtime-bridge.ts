/**
 * Shape of `window.cg`, the typed bridge exposed by the preload script.
 *
 * Declared in `src/shared/` (process-agnostic) so both the preload (Node
 * tier) and the renderer (Web tier) tsconfigs can reach it. The runtime
 * implementation lives in `src/preload/runtime.preload.ts`; this file is
 * the contract.
 */
import type {
  AuditRecentChannel,
  ChannelRequest,
  ChannelResponse,
  ConnectionConfig,
  ConnectionHealth,
  ConnectionsFailoverChannel,
  LockEngageChannel,
  LockReleaseChannel,
  LockState,
  PendingUpdate,
  StackLoadChannel,
  StackOutChannel,
  StackRemoveChannel,
  StackSnapshotChannel,
  StackTakeChannel,
  StackUpdateChannel,
  TemplatesGetChannel,
  TemplatesListChannel,
  UpdateCancelChannel,
  UpdateRequestChannel,
  UpdateStateChannel,
  Settings,
  SettingsGetChannel,
  SettingsSetChannel,
} from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';

export interface AppInfo {
  name: string;
  version: string;
  /** `process.platform` string — `'win32' | 'darwin' | ...`. */
  platform: string;
}

export type Unsubscribe = () => void;

export interface RuntimeBridge {
  getAppInfo(): Promise<AppInfo>;

  stack: {
    load(
      req: ChannelRequest<typeof StackLoadChannel>,
    ): Promise<ChannelResponse<typeof StackLoadChannel>>;
    take(
      req: ChannelRequest<typeof StackTakeChannel>,
    ): Promise<ChannelResponse<typeof StackTakeChannel>>;
    update(
      req: ChannelRequest<typeof StackUpdateChannel>,
    ): Promise<ChannelResponse<typeof StackUpdateChannel>>;
    out(
      req: ChannelRequest<typeof StackOutChannel>,
    ): Promise<ChannelResponse<typeof StackOutChannel>>;
    remove(
      req: ChannelRequest<typeof StackRemoveChannel>,
    ): Promise<ChannelResponse<typeof StackRemoveChannel>>;
    snapshot(): Promise<ChannelResponse<typeof StackSnapshotChannel>>;
    onStateChanged(handler: (snapshot: readonly StackItemState[]) => void): Unsubscribe;
  };

  connections: {
    config(): Promise<ConnectionConfig>;
    health(): Promise<ConnectionHealth>;
    failover(
      req: ChannelRequest<typeof ConnectionsFailoverChannel>,
    ): Promise<ChannelResponse<typeof ConnectionsFailoverChannel>>;
    onHealthChanged(handler: (health: ConnectionHealth) => void): Unsubscribe;
  };

  lock: {
    engage(
      req: ChannelRequest<typeof LockEngageChannel>,
    ): Promise<ChannelResponse<typeof LockEngageChannel>>;
    release(
      req: ChannelRequest<typeof LockReleaseChannel>,
    ): Promise<ChannelResponse<typeof LockReleaseChannel>>;
    state(): Promise<LockState>;
    onStateChanged(handler: (state: LockState) => void): Unsubscribe;
  };

  templates: {
    get(
      req: ChannelRequest<typeof TemplatesGetChannel>,
    ): Promise<ChannelResponse<typeof TemplatesGetChannel>>;
    list(): Promise<ChannelResponse<typeof TemplatesListChannel>>;
  };

  audit: {
    recent(
      req: ChannelRequest<typeof AuditRecentChannel>,
    ): Promise<ChannelResponse<typeof AuditRecentChannel>>;
  };

  update: {
    request(
      req: ChannelRequest<typeof UpdateRequestChannel>,
    ): Promise<ChannelResponse<typeof UpdateRequestChannel>>;
    state(): Promise<ChannelResponse<typeof UpdateStateChannel>>;
    cancel(): Promise<ChannelResponse<typeof UpdateCancelChannel>>;
    onStateChanged(handler: (pending: PendingUpdate | null) => void): Unsubscribe;
  };

  settings: {
    get(): Promise<ChannelResponse<typeof SettingsGetChannel>>;
    set(
      req: ChannelRequest<typeof SettingsSetChannel>,
    ): Promise<ChannelResponse<typeof SettingsSetChannel>>;
    onChanged(handler: (next: Settings) => void): Unsubscribe;
  };
}

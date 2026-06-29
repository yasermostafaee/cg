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
  TemplatesImportChannel,
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

/**
 * Tri-state link to the local CasparCG bridge (C-001 Phase 1).
 *
 * - `live` — connected to the bridge over WebSocket; commands reach it.
 * - `offline-mock` — no bridge at boot; the Runtime runs the in-memory
 *   `MockRuntime`. An explicit, persistent offline mode (never a silent
 *   fallback for a dropped live connection).
 * - `disconnected` — a previously-live bridge dropped mid-session;
 *   commands are rejected (never optimistic on-air, never routed to the mock)
 *   until the link reconnects and resyncs.
 */
export type BridgeLinkStatus = 'live' | 'offline-mock' | 'disconnected';

export interface RuntimeBridge {
  getAppInfo(): Promise<AppInfo>;

  /** Status of the link to the local bridge (drives the connection indicator). */
  link: {
    status(): BridgeLinkStatus;
    onStatusChanged(handler: (status: BridgeLinkStatus) => void): Unsubscribe;
  };

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
    /**
     * Register a verified `.vcg` template (R-001). The renderer verifies +
     * unpacks the upload first; this call adds the parsed template to the
     * registry so `list` / `get` see it.
     */
    import(
      req: ChannelRequest<typeof TemplatesImportChannel>,
    ): Promise<ChannelResponse<typeof TemplatesImportChannel>>;
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

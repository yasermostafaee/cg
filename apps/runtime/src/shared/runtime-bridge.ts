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
  ConnectionsSetConfigChannel,
  FixedLayerBank,
  FixedLayersConfigChannel,
  FixedLayersLoadChannel,
  FixedLayersSetConfigChannel,
  FixedLayersStateChannel,
  FixedSlotState,
  LayersClearChannel,
  LayersOrphansChannel,
  LayersOwnedOccupancyChannel,
  LockEngageChannel,
  OrphanLayer,
  OwnedOccupancyWarning,
  LockReleaseChannel,
  LockState,
  PendingUpdate,
  StackLoadChannel,
  StackOutChannel,
  StackStopChannel,
  StackClearAllChannel,
  StackRemoveAllChannel,
  StackRemoveChannel,
  StackSetPositionChannel,
  StackSnapshotChannel,
  StackStopAllChannel,
  StackTakeChannel,
  StackUpdateChannel,
  PlayoutLayerState,
  PlayoutLayersClearChannel,
  PlayoutLayersStateChannel,
  StackNextChannel,
  TemplateInfo,
  TemplatesGetChannel,
  TemplatesImportChannel,
  TemplatesListChannel,
  TemplatesRemoveChannel,
  DelimitersListChannel,
  DelimitersSetChannel,
  DelimiterOption,
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
    /**
     * C-012 — GRACEFUL stop: the template runs its own outro and the producer stays
     * RESIDENT, so a later take resumes it with no re-load. `out` is the hard path —
     * it CLEARs and destroys the producer.
     */
    stop(
      req: ChannelRequest<typeof StackStopChannel>,
    ): Promise<ChannelResponse<typeof StackStopChannel>>;
    /**
     * R-028 (5.4) — advance the template's sequence (`CG NEXT`). Offered only
     * when `TemplateInfo.hasNext` says the template has a step to advance to.
     */
    next(
      req: ChannelRequest<typeof StackNextChannel>,
    ): Promise<ChannelResponse<typeof StackNextChannel>>;
    out(
      req: ChannelRequest<typeof StackOutChannel>,
    ): Promise<ChannelResponse<typeof StackOutChannel>>;
    remove(
      req: ChannelRequest<typeof StackRemoveChannel>,
    ): Promise<ChannelResponse<typeof StackRemoveChannel>>;
    /**
     * R-011 — the operator's per-item on-air position override. Refused
     * (`reason: 'on-air'`) while the item is on air/unsettled — the picker
     * mirrors the lock.
     */
    setPosition(
      req: ChannelRequest<typeof StackSetPositionChannel>,
    ): Promise<ChannelResponse<typeof StackSetPositionChannel>>;
    /**
     * R-010 — OUT + REMOVE every stack item (clears air, empties the list).
     * The sanctioned path to unblock a server reconfiguration.
     */
    removeAll(): Promise<ChannelResponse<typeof StackRemoveAllChannel>>;
    /**
     * Take every ON-AIR item off air, and KEEP them all on the stack (they go idle).
     * Reuses the per-item `out()` CLEAR — no new AMCP verb. The counterpart to `removeAll`:
     * that one empties the list, this one only clears the screen.
     */
    clearAll(): Promise<ChannelResponse<typeof StackClearAllChannel>>;
    /** C-012 — STOP every on-air item (outros run, producers stay resident). */
    stopAll(): Promise<ChannelResponse<typeof StackStopAllChannel>>;
    snapshot(): Promise<ChannelResponse<typeof StackSnapshotChannel>>;
    onStateChanged(handler: (snapshot: readonly StackItemState[]) => void): Unsubscribe;
  };

  connections: {
    config(): Promise<ConnectionConfig>;
    /**
     * R-010 — apply a new ConnectionConfig to the RUNNING bridge. Refused
     * with `reason: 'on-air-block'` while anything is on air or unsettled.
     */
    setConfig(
      req: ChannelRequest<typeof ConnectionsSetConfigChannel>,
    ): Promise<ChannelResponse<typeof ConnectionsSetConfigChannel>>;
    health(): Promise<ConnectionHealth>;
    failover(
      req: ChannelRequest<typeof ConnectionsFailoverChannel>,
    ): Promise<ChannelResponse<typeof ConnectionsFailoverChannel>>;
    onHealthChanged(handler: (health: ConnectionHealth) => void): Unsubscribe;
    /** R-010 — fired when any client applies a new config. */
    onConfigChanged(handler: (config: ConnectionConfig) => void): Unsubscribe;
  };

  /**
   * R-021 stage 2a — the fixed operator layer bank: config read/update +
   * per-slot state (facts only — occupancy observation + binding; verb
   * derivation happens renderer-side, once, per design (f)/(g)).
   */
  fixedLayers: {
    /** The declared bank, or null when none is configured. */
    config(): Promise<ChannelResponse<typeof FixedLayersConfigChannel>>;
    /**
     * Apply a bank change LIVE (design (e)): grow-at-end and alias changes
     * apply immediately; renumber/channel-change and shrink-with-residents
     * refuse with the validator's code in `reason`.
     */
    setConfig(
      req: ChannelRequest<typeof FixedLayersSetConfigChannel>,
    ): Promise<ChannelResponse<typeof FixedLayersSetConfigChannel>>;
    /**
     * R-021 stage 3 — create an item bound to an EXACT fixed slot and pre-roll
     * it. Resolves the layer through `LayerManager.bindFixed` — never the
     * dynamic allocation `stack.load` uses, and never `reserve()` (which
     * refuses fixed slots by construction). Refuses `not-fixed` for a
     * coordinate outside the bank and `slot-bound` for an occupied one.
     */
    load(
      req: ChannelRequest<typeof FixedLayersLoadChannel>,
    ): Promise<ChannelResponse<typeof FixedLayersLoadChannel>>;
    /** The current per-slot state ([] when no bank is declared). */
    state(): Promise<ChannelResponse<typeof FixedLayersStateChannel>>;
    onConfigChanged(handler: (bank: FixedLayerBank | null) => void): Unsubscribe;
    onStateChanged(handler: (state: FixedSlotState[]) => void): Unsubscribe;
  };

  /** R-009 — orphaned/unknown on-air layers (the bridge's occupancy sweep). */
  layers: {
    orphans(): Promise<ChannelResponse<typeof LayersOrphansChannel>>;
    /** Explicit operator Clear of a surfaced layer. Refused for owned layers. */
    clear(
      req: ChannelRequest<typeof LayersClearChannel>,
    ): Promise<ChannelResponse<typeof LayersClearChannel>>;
    onOrphansChanged(handler: (orphans: OrphanLayer[]) => void): Unsubscribe;
    /**
     * B-056 — owned-slot occupancy warnings (a load's adopt-CLEAR missed the
     * primary over observed foreign content). No direct Clear — the remedy
     * is Out/Remove of the named item.
     */
    ownedOccupancy(): Promise<ChannelResponse<typeof LayersOwnedOccupancyChannel>>;
    onOwnedOccupancyChanged(handler: (warnings: OwnedOccupancyWarning[]) => void): Unsubscribe;
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

  /**
   * R-028 part B — the declared PLAYOUT layers (C-015) and the operator's
   * deliberate, kind-gated clear. Separate from `layers` on purpose: those are
   * unowned orphans the app may reclaim, these are another system's layers the
   * operator may only touch from a surface labelled as such.
   */
  playoutLayers: {
    state(): Promise<ChannelResponse<typeof PlayoutLayersStateChannel>>;
    /**
     * Clear ONE declared playout layer. The bridge refuses anything that is
     * not an observed `html` producer (`not-html`) and anything it cannot see
     * (`unknown-occupancy`) — the gate is bridge-side, not merely unoffered.
     */
    clear(
      req: ChannelRequest<typeof PlayoutLayersClearChannel>,
    ): Promise<ChannelResponse<typeof PlayoutLayersClearChannel>>;
    onStateChanged(handler: (state: PlayoutLayerState[]) => void): Unsubscribe;
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
    /**
     * Remove a template from the library (R-005). The bridge is authoritative: it refuses
     * while any stack item references the template and returns the operator-facing reason.
     * A confirmed removal also prunes the reconnect-reconciliation retention, so the
     * template does not come back on the next bridge blip.
     */
    remove(
      req: ChannelRequest<typeof TemplatesRemoveChannel>,
    ): Promise<ChannelResponse<typeof TemplatesRemoveChannel>>;
    /**
     * R-028 (o1) — the bridge owns the catalogue and pushes the full template
     * list on every import/removal, from ANY connected browser. Subscribing
     * surfaces is how operator B's Library re-lists when operator A imports.
     */
    onChanged(handler: (templates: TemplateInfo[]) => void): Unsubscribe;
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

  /**
   * R-034 — the station's split-delimiter list. On the BRIDGE, not in the
   * browser, for the same two reasons `templates` is: an operator who adds a
   * delimiter must find it from any browser in the gallery, and it must still
   * be there after a bridge restart. Persisted to disk beside the templates.
   */
  delimiters: {
    list(): Promise<ChannelResponse<typeof DelimitersListChannel>>;
    /**
     * Replace the whole list. The BRIDGE is authoritative for the refusal —
     * it rejects an empty list and duplicate values and supplies the wording,
     * the R-005 removal shape — so two browsers cannot disagree about what is
     * allowed.
     */
    set(
      req: ChannelRequest<typeof DelimitersSetChannel>,
    ): Promise<ChannelResponse<typeof DelimitersSetChannel>>;
    onChanged(handler: (delimiters: DelimiterOption[]) => void): Unsubscribe;
  };
}

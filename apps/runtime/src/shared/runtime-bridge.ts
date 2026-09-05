/**
 * Shape of `window.cg`, the typed bridge exposed by the preload script.
 *
 * Declared in `src/shared/` (process-agnostic) so both the preload (Node
 * tier) and the renderer (Web tier) tsconfigs can reach it. The runtime
 * implementation lives in `src/preload/runtime.preload.ts`; this file is
 * the contract.
 */
import type {
  AuditHealthChannel,
  AuditRecentChannel,
  ChannelRequest,
  ChannelResponse,
  ConnectionConfig,
  ConnectionHealth,
  ConnectionsFailoverChannel,
  ConnectionsSetConfigChannel,
  ConnectionsTemplateServeChannel,
  FixedLayerBank,
  FixedLayersClearLayerChannel,
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
  StackSetPlateVolumeChannel,
  StackSetPlateVolumesChannel,
  StackSilenceAllLivePlatesChannel,
  StackSetPositionChannel,
  StackSetActiveLookChannel,
  StackSwapLiveSourceChannel,
  StackSnapshotChannel,
  StackStopAllChannel,
  StackTakeChannel,
  StackUpdateChannel,
  PlayoutLayerState,
  LiveLayerState,
  PlayoutLayersClearChannel,
  PlayoutLayersStateChannel,
  LiveLayersStateChannel,
  StackNextChannel,
  TemplateInfo,
  TemplatesGetChannel,
  TemplatesImportChannel,
  TemplatesListChannel,
  TemplatesRemoveChannel,
  DelimitersListChannel,
  DelimitersSetChannel,
  DelimiterOption,
  ChannelSettingsGetChannel,
  ChannelSettingsSetChannel,
  ChannelSettingsState,
  Rehearsal,
  RestoreMigration,
  RestoreSkip,
  RehearseEnterChannel,
  RehearseExitChannel,
  RehearseStateChannel,
  UpdateCancelChannel,
  UpdateRequestChannel,
  UpdateStateChannel,
  Settings,
  SettingsGetChannel,
  SettingsSetChannel,
  SourceAssignments,
  SourceCatalog,
  SourcesAssignmentsChannel,
  SourcesConfigChannel,
  SourcesSetAssignmentsChannel,
  SourcesSetConfigChannel,
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
    /**
     * 🔴 **Is a STACK DELIVERY in flight?** — `true` from the moment a (re)connect starts
     * its resync until the stack has been re-delivered and re-pulled.
     *
     * It exists on this contract for ONE consumer and one question: whether an EMPTY stack
     * is the answer or a not-yet. `useBridgeSnapshot`’s `ready` cannot answer it — it
     * latches on the first arrival and never clears — so after a reconnect a browser sees a
     * live link, a latched-ready stack of `[]`, and a bridge already serving its full
     * adopted live-layer ledger. Read without this, every seated layer would look STRANDED
     * with a control armed to cut it.
     *
     * ⚠ **It closes the SELF race, not the multi-browser one.** One bridge serves many
     * browsers; this browser cannot know that ANOTHER console is about to restore the rows
     * that would explain a layer. That residual is genuinely undecidable from here and
     * would need a bridge-side “every client has re-delivered” fact, which does not exist.
     */
    resyncing(): boolean;
    onResyncingChanged(handler: (value: boolean) => void): Unsubscribe;
    /**
     * 🔴 **`B-153` — WHICH CHANNELS THIS PAGE NEEDS THAT THE CONNECTED BRIDGE DOES NOT
     * ROUTE.** `null` while the answer is unknown or the builds agree; a non-empty list is
     * a live skew.
     *
     * Asked once at CONNECT, so the operator learns about it while nothing is at stake —
     * rather than the way this was actually discovered, which was a LOOK button answering
     * `unknown channel: stack.set-active-look` during a live show.
     *
     * ⚠ It reports; it does not REFUSE. A bridge missing one new channel still plays out
     * perfectly well through the twenty it does route, and taking a working station off air
     * over a feature it never had would be a far worse failure than the one being fixed.
     * The commands that ARE missing refuse themselves, legibly, through `B-152`.
     */
    skew(): readonly string[] | null;
    onSkewChanged(handler: (missing: readonly string[] | null) => void): Unsubscribe;
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
     * R-048 — point ONE plate of ONE row at a different live source, WHILE the
     * template is on air. A per-item override that never writes back to the
     * template assignment or the installation catalog; a `sourceId` of `null`
     * reverts the plate to its assignment.
     */
    swapLiveSource(
      req: ChannelRequest<typeof StackSwapLiveSourceChannel>,
    ): Promise<ChannelResponse<typeof StackSwapLiveSourceChannel>>;
    /**
     * §14 (LOOKS) Stage E — **switch ONE row to another authored LOOK.**
     *
     * The look picker on the row sends this and nothing else does. It drives the one
     * shipped seam: record the look → `reconcileLivePlates` moves the FILLS → the page is
     * told on the `CG UPDATE` payload so it moves the HOLES, both off the same look id.
     *
     * ⚠ **The switch IS the cut** — v1 parks every other transition mode — so there is no
     * mode to pick and none to escape. Taking the row off air stays STOP/CLEAR’s job.
     */
    setActiveLook(
      req: ChannelRequest<typeof StackSetActiveLookChannel>,
    ): Promise<ChannelResponse<typeof StackSetActiveLookChannel>>;
    /**
     * C-015 phase 6 (6.5f) — raise or mute ONE plate's audio. The EXPLICIT
     * RECORDED INTENT the mute rule defers to, and the only thing that may make a
     * Live Source plate audible. Works on a row that is not yet on air: the intent
     * stands and the next take carries it.
     */
    setPlateVolume(
      req: ChannelRequest<typeof StackSetPlateVolumeChannel>,
    ): Promise<ChannelResponse<typeof StackSetPlateVolumeChannel>>;
    /**
     * `add-multibox-audio` — the same intent for SEVERAL plates of one row, as ONE action.
     *
     * The door FADER, ON/OFF, SOLO and PANIC all go through. SOLO and PANIC are CROSS-PLATE
     * statements ("this one and none of its siblings", "none of them"), which a sequence of
     * single-plate calls cannot make: the bridge holds the row's live-seat lock for the whole
     * map, so a look switch cannot land in the middle of one.
     *
     * ⚠ It reports **one outcome per plate**. A SOLO that lands three plates and is refused on
     * the fourth is neither a success nor a failure, and a single boolean would have to lie
     * about one of them.
     */
    setPlateVolumes(
      req: ChannelRequest<typeof StackSetPlateVolumesChannel>,
    ): Promise<ChannelResponse<typeof StackSetPlateVolumesChannel>>;
    /**
     * 🔴 **PANIC — silence every live plate the BRIDGE holds a seat for.**
     *
     * NO ARGUMENTS, deliberately: the scope is not the caller's to choose. It was, in the
     * first cut — the browser resolved it from `isOnAir(item)` — and that left a row in the
     * boot-adoption window (`B-145`: plates seated, potentially audible, status not on air —
     * once misnamed the `exitRehearse` window; rehearse seats nothing, `B-216`) outside
     * the panic button's reach, and would have addressed nothing at all in the window before
     * `useLiveLayers` had answered. `B-122`'s rule is that an emergency control must not
     * depend on the bookkeeping whose failure is the emergency; the bridge's ledger is the
     * structural fact that replaces it.
     *
     * ⚠ It does NOT weaken golden rule 10: rule 10 stops a configuration verb putting content
     * ON AIR (*"no `PLAY`, no un-mute and no fill"*), and this only ever lowers a volume on a
     * layer that already exists.
     */
    silenceAllLivePlates(): Promise<ChannelResponse<typeof StackSilenceAllLivePlatesChannel>>;
    /**
     * OUT + REMOVE every stack item (clears air, empties the list).
     *
     * 🔴 `R-017` — REFUSED, all-or-nothing, while anything is on air, and no longer R-010's
     * unblock path: `clearAll` is. Apply gates on the on-air COUNT, so taking rows off air is
     * the whole remedy and this one is refused in the very state a reconfiguration is blocked
     * in (`operator-surface` §6).
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
    /**
     * B-108 — the rows the last restore could NOT bring back, with the reason.
     *
     * A bridge restart re-delivers the browser's retained stack intent, and the
     * bridge declines what it cannot re-seat. Those rows were on the operator's
     * screen a moment ago and are now GONE — which desynchronises their model of the
     * stack from reality, silently. The information was always computed and always
     * discarded; this is the seam that carries it to a surface.
     *
     * The BENIGN skip (an item the live bridge already holds — a page reload against
     * a healthy bridge, which loses no row) is filtered out BEFORE it reaches here,
     * so a subscriber never has to know the difference and can never raise a false
     * alarm by forgetting to.
     *
     * The handler is called IMMEDIATELY with the latest report on subscribe: the
     * panel mounts after boot, and a report it missed is exactly the one worth
     * seeing. An EMPTY report is meaningful — it clears a stale notice.
     */
    onRestoreSkips(handler: (skips: readonly RestoreSkip[]) => void): Unsubscribe;
    /**
     * `single-clock-look-switch` — the rows the last restore brought back on a DIFFERENT
     * row than the one retained.
     *
     * A SEPARATE seam from `onRestoreSkips`, for the reason `RestoreMigrationSchema` gives:
     * these rows DID come back, and folding them into a list the panel introduces with
     * "did not come back" would be a plainer lie than saying nothing. Same delivery
     * contract as its sibling — replayed on subscribe, and an EMPTY report clears a stale
     * notice.
     */
    onRestoreMigrations(handler: (migrations: readonly RestoreMigration[]) => void): Unsubscribe;
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
    /**
     * `C-024` — the template serve address IN FORCE, plus why: which fields a command-line flag
     * is masking, and this machine's interface candidates.
     *
     * Deliberately NOT folded into {@link config}. That returns the STORED intent this panel edits
     * and writes back; this returns what is actually in effect. The gap between them is the whole
     * point — precedence is flag > file, so a stored value can be masked at any time, and a surface
     * that showed the stored one as though it were live would be confidently wrong.
     */
    templateServe(): Promise<ChannelResponse<typeof ConnectionsTemplateServeChannel>>;
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
    /**
     * Clear ONE layer of the declared bank, addressed by LAYER and permitted by
     * STRUCTURE — in the declared bank AND not reserved — never by occupancy. The
     * always-available escape hatch: it still works when occupancy reads `unknown`,
     * which is exactly when the operator needs it. Refuses `not-in-bank` and
     * `reserved`; the guard is bridge-side, so no UI state can bypass it.
     */
    clearLayer(
      req: ChannelRequest<typeof FixedLayersClearLayerChannel>,
    ): Promise<ChannelResponse<typeof FixedLayersClearLayerChannel>>;
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
  /**
   * `B-145` acceptance 1, display half (2.8) — the layers the BRIDGE ITSELF has
   * seated for a template's Live Source plates: the third declared layer class,
   * beside `layers` (unowned orphans the app may reclaim) and `playoutLayers`
   * (the station's own).
   *
   * READ-ONLY, and deliberately so. Every verb that can act on a seated layer is
   * ITEM-scoped and already on this contract — `stack.swapLiveSource` to repoint,
   * `stack.setPlateVolume` for audio, `stack.out` / `stack.remove` to take it off
   * air — while `layers.clear` refuses a live-source coordinate BY NAME, having
   * weighed and rejected an exemption. This surface exists so the operator can SEE
   * which row owns a lit layer and so reach those verbs; it is not a fourth way to
   * cut a guest off air.
   */
  liveLayers: {
    state(): Promise<ChannelResponse<typeof LiveLayersStateChannel>>;
    onStateChanged(handler: (state: LiveLayerState[]) => void): Unsubscribe;
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
    /**
     * R-022 — the RETAINED self-contained page for a template, from THIS browser's
     * local library, or null when it holds none.
     *
     * Browser-local by nature and deliberately NOT an `@cg/shared-ipc` channel:
     * the page is already in this browser (the SPA produces it at import and keeps
     * it to re-deliver on reconnect), so routing the read through the bridge would
     * be a round trip to fetch something we hold — and would fail with the bridge
     * down, when rehearse is exactly the thing that should still work.
     *
     * `null` is the honest "not in this browser": a template imported on another
     * machine has metadata from the bridge's catalogue but no local page here, and
     * the rehearsal panel says so instead of showing a blank box.
     */
    html(templateId: string): Promise<string | null>;
  };

  audit: {
    recent(
      req: ChannelRequest<typeof AuditRecentChannel>,
    ): Promise<ChannelResponse<typeof AuditRecentChannel>>;
    /**
     * B-141 — is the instrument LIVE? Read alongside `recent` so an empty tail can
     * be reported as "quiet" only when a configured, non-failing writer is what
     * produced it.
     */
    health(): Promise<ChannelResponse<typeof AuditHealthChannel>>;
    /**
     * B-141 follow-up — THIS CONSOLE's operator name: the value sent with every
     * control request and recorded as the audit `actor`.
     *
     * Browser-local by nature and deliberately NOT an `@cg/shared-ipc` channel, the
     * same reasoning as `templates.html` above: the whole point is that it differs
     * PER CONSOLE. A bridge-side setting would be one value for the whole gallery,
     * which is the question already answered by the constant it replaces.
     *
     * 🔴 SELF-DECLARED AND UNVERIFIED, and every surface that shows it must say so.
     * It answers "which console, as labelled", never "which person, proven": anyone
     * can type anything, and a shared console keeps the last name typed across a
     * shift change. Empty (the default) records `unattributed` — a state, not a name.
     *
     * Synchronous on purpose: it is local storage, not a round trip, and the Audit
     * panel renders it without a loading state.
     */
    operatorName(): string;
    /** Set this console's operator name; empty clears it back to unattributed. */
    setOperatorName(name: string): void;
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
  /**
   * R-030 — the per-channel output raster, and what the SERVER reports about it.
   *
   * On the BRIDGE for the same two reasons `templates` and `delimiters` are:
   * several browsers share one bridge, and two operators disagreeing about the
   * channel's raster would mean two different beliefs about where every graphic
   * lands; and it is install config that must survive a bridge restart.
   *
   * `state.observed` is read off `INFO <channel>` and is deliberately NOT merged
   * into `state.settings` — the mismatch verdict is the whole point, and it can
   * only exist while the claim and the fact are held apart. Read the verdict with
   * `rasterVerdict`, never by comparing the two locally.
   */
  channelSettings: {
    get(): Promise<ChannelResponse<typeof ChannelSettingsGetChannel>>;
    /**
     * Apply a channel's raster. Refused `on-air-block` while anything is on air
     * or unsettled (changing the raster re-scales every graphic on the channel)
     * and `unknown-channel` for a channel this install never declared. Both
     * guards are bridge-side, so no UI state can bypass them.
     */
    set(
      req: ChannelRequest<typeof ChannelSettingsSetChannel>,
    ): Promise<ChannelResponse<typeof ChannelSettingsSetChannel>>;
    onChanged(handler: (state: ChannelSettingsState) => void): Unsubscribe;
  };

  /**
   * R-022 — REHEARSE: run a loaded graphic's lifecycle and edit its values while
   * it renders LOCALLY in PVW, with PLAY-to-air interlocked off.
   *
   * BRIDGE-OWNED, not browser-local, and that is not an implementation
   * preference: several browsers share one bridge, so a rehearse flag held in one
   * of them would leave the second operator seeing an ordinary loaded row and
   * loading onto it — a collision on a real layer.
   *
   * The interlock is enforced by the BRIDGE — `stack.take` refuses a rehearsing
   * item with `rehearsing` — so a disabled PLAY button is the courtesy, not the
   * guarantee. A stale client cannot play past it.
   */
  rehearse: {
    state(): Promise<ChannelResponse<typeof RehearseStateChannel>>;
    /**
     * Enter rehearse. The precondition is that the row has a template BOUND —
     * that is the whole test, because the local render needs the template, the
     * values and the raster, and none of those is the CasparCG layer.
     *
     * Refused `on-air` (rehearse mutes the layer; muting a live graphic is not on
     * offer) and `mute-failed` — the latter being the important one: rehearse is
     * never CLAIMED unless the mute that makes it safe actually landed. It is
     * reachable only when a producer IS resident; over an empty layer entry sends
     * no AMCP at all, so there is no mute to fail.
     */
    enter(
      req: ChannelRequest<typeof RehearseEnterChannel>,
    ): Promise<ChannelResponse<typeof RehearseEnterChannel>>;
    /**
     * Leave rehearse, restoring the layer's intended volume ONLY if entry muted
     * it — the exit path mirrors the entry path rather than re-deriving it.
     */
    exit(
      req: ChannelRequest<typeof RehearseExitChannel>,
    ): Promise<ChannelResponse<typeof RehearseExitChannel>>;
    onStateChanged(handler: (rehearsals: Rehearsal[]) => void): Unsubscribe;
  };

  /**
   * D-137 / C-015 — LIVE SOURCES, in two halves.
   *
   * `config` is the installation's CATALOG: the list of lives this plant has,
   * each with a generated id, a human NAME and its producer. It is built with no
   * reference to any template. `assignments` is which catalog entry each
   * template's each PLATE uses — the join, made by one deliberate operator
   * action rather than by a name match against an id the author guessed.
   *
   * Both on the BRIDGE for the reasons `templates`, `delimiters` and
   * `channelSettings` are, plus one that is sharper here: an unassigned plate is
   * why nothing reaches air, so two consoles disagreeing about it would be two
   * operators with different beliefs about what a take will do.
   */
  sources: {
    config(): Promise<ChannelResponse<typeof SourcesConfigChannel>>;
    /**
     * Replace the whole catalog. The BRIDGE is authoritative for the refusal —
     * it rejects a duplicate id, a duplicate NAME, and a band overlapping the
     * candidate bank or the reserved playout range, and supplies the wording —
     * so a second browser cannot create a state this one is careful to prevent.
     *
     * A DELETION answers with `droppedAssignments`: the plates this change
     * orphaned. The bridge cascades them rather than letting them dangle, and
     * the caller is expected to SAY so at the moment of deletion — an operator
     * who learns at the take is learning too late.
     */
    setConfig(
      req: ChannelRequest<typeof SourcesSetConfigChannel>,
    ): Promise<ChannelResponse<typeof SourcesSetConfigChannel>>;
    onConfigChanged(handler: (catalog: SourceCatalog) => void): Unsubscribe;
    assignments(): Promise<ChannelResponse<typeof SourcesAssignmentsChannel>>;
    /**
     * Replace the whole assignment set. Refused when a plate is assigned twice,
     * or when it names a source this installation does not define.
     */
    setAssignments(
      req: ChannelRequest<typeof SourcesSetAssignmentsChannel>,
    ): Promise<ChannelResponse<typeof SourcesSetAssignmentsChannel>>;
    onAssignmentsChanged(handler: (assignments: SourceAssignments) => void): Unsubscribe;
  };

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

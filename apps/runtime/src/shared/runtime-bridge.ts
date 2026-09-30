/**
 * Shape of `window.cg`, the typed bridge exposed by the preload script.
 *
 * Declared in `src/shared/` (process-agnostic) so both the preload (Node
 * tier) and the renderer (Web tier) tsconfigs can reach it. The runtime
 * implementation lives in `src/preload/runtime.preload.ts`; this file is
 * the contract.
 */
import type {
  BridgeSessionSignInChannel,
  BridgeSessionState,
  BridgeSessionStateChannel,
  LicenseState,
  LicenseStateChannel,
  SignInFailure,
  ChannelsCatalogueChannel,
  SetupCheckChannel,
  SetupPhase,
  SetupRouteAddressChannel,
  SetupChannelOccupancyChannel,
  StationStray,
  StationStraysChannel,
  StationTakeOffAirChannel,
  AuditHealthChannel,
  AuditRecentChannel,
  AuthMode,
  PlayoutPrincipal,
  ChannelRequest,
  ChannelResponse,
  ConnectionConfig,
  ConnectionHealth,
  ConnectionsFailoverChannel,
  ConnectionsSetConfigChannel,
  ConnectionsTemplateServeChannel,
  FixedLayerBank,
  FixedLayersBanksChannel,
  FixedLayersClearLayerChannel,
  FixedLayersConfigChannel,
  FixedLayersLoadChannel,
  FixedLayersSetBanksChannel,
  FixedLayersSetConfigChannel,
  FixedLayersStateChannel,
  FixedSlotState,
  LayersClearChannel,
  LayersClearedOutsideChannel,
  LayersOrphansChannel,
  LayersOwnedOccupancyChannel,
  EmptiedAirDismissChannel,
  EmptiedAirNotice,
  EmptiedAirNoticeChannel,
  EmptiedAirRestoreChannel,
  PgmReturnStatus,
  PgmReturnStatusChannel,
  LockEngageChannel,
  ClearedOutsideLayer,
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
  StackSilenceChannelLivePlatesChannel,
  StackSetPositionChannel,
  StackSetActiveLookChannel,
  StackSetPassTimingChannel,
  StackSwapLiveSourceChannel,
  StackRestoreReportDismissChannel,
  StackSnapshotChannel,
  StackStopAllChannel,
  StackTakeChannel,
  StackUpdateChannel,
  PlayoutLayerState,
  LiveLayerState,
  LivePlateReleaseState,
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
  StationChannels,
  Rehearsal,
  RestoreMigration,
  RestoreSkip,
  RehearseEnterChannel,
  RehearseExitChannel,
  RehearseStateChannel,
  UpdateCancelChannel,
  UpdateRequestChannel,
  UpdateStateChannel,
  SourceAssignments,
  ConsoleSourceCatalog,
  SourcesAssignmentsChannel,
  SourcesConfigChannel,
  SourcesMediaSearchChannel,
  SourcesRefreshChannel,
  SourcesSetAssignmentsChannel,
  SourcesSetConfigChannel,
  // `MEDIA-PLATES-01` — a clip's settings, its transport on air, and its clock.
  LiveLayersMediaStateChannel,
  MediaPlateState,
  SourcesSetMediaPlaybackChannel,
  StackMediaPlateTransportChannel,
} from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import type { PvwPage } from './pvwPage.js';

export interface AppInfo {
  name: string;
  version: string;
  /** `process.platform` string — `'win32' | 'darwin' | ...`. */
  platform: string;
}

export type Unsubscribe = () => void;

/**
 * 🔴 `R-066` / `C-037` — **WHAT THE BRIDGE SAID ABOUT AUTHENTICATION AT CONNECT.**
 *
 * `null` while the answer is unknown — before the first `bridge.capabilities` lands, or when a
 * bridge too old to be asked refused the channel. `null` is NOT "off": a console that treated
 * unknown as off would present every control as live on a bridge that refuses them all, which
 * is the defect class `B-153` exists to close one level up.
 */
export interface AuthCapabilities {
  readonly mode: AuthMode;
  /** D1, absolute, as the bridge advertises it. `null` when the mode is `off`. */
  readonly signInUrl: string | null;
  /** D2, absolute. `null` when the mode is `off`. */
  readonly refreshUrl: string | null;
  /** The Playout integration contract the bridge implements (`1.1`), or `null`. */
  readonly contractVersion: string | null;
  /**
   * `DESKTOP-APPS-01` — where an installed station is in first-run (`target`, `channel`), or
   * `null` once it is set up, and always for a bridge that is not an installed station.
   */
  readonly setupPhase: SetupPhase | null;
}

/**
 * 🔴 `R-066` — **WHAT THE CONSOLE SAYS ABOUT ITSELF, in the operator's words, as ONE state.**
 *
 * Five names rather than a principal-or-null, because the surfaces that read this — the
 * sign-in gate and the identity pill — have to tell apart three cases that a nullable
 * principal flattens into one: a bridge that has not answered yet, a console that has never
 * signed in, and a session that LAPSED. The third is the one an operator most needs named:
 * _"signed out"_ and _"your session ended"_ send them to the same control by two different
 * routes, and only the second explains why the console stopped working mid-shift.
 */
export type AuthSessionState =
  /** The bridge does not authenticate. No sign-in exists, and nothing on screen changes. */
  | { readonly kind: 'off' }
  /** The bridge has not answered `bridge.capabilities` yet. Show no verdict. */
  | { readonly kind: 'unknown' }
  /**
   * Auth is on and this console holds no valid token.
   *
   * `reason` is the BRIDGE's own sentence when it refused a token this console presented —
   * "that sign-in has expired", "not for this station", "could not be verified". It exists
   * because without it a console whose bridge refuses its token shows a sign-in form that
   * silently does nothing: the operator types the right credentials, D1 succeeds, the bridge
   * refuses the token, and the form clears with no message. Absent when nothing was presented.
   */
  | { readonly kind: 'signed-out'; readonly reason?: string }
  /** A verified principal is on this socket. `principal` is the BRIDGE's answer, never the echo. */
  | {
      readonly kind: 'signed-in';
      readonly principal: PlayoutPrincipal;
      /**
       * 🔴 `C-038` — which of THIS STATION's channels this principal may OPERATE, as the
       * bridge computed them. Empty for a viewer, who is granted none.
       *
       * ⚠ **It is not `principal.channels`, and the difference matters.** That is the raw
       * `cg_channels` claim — `{host, channel}` grants that may name hosts this bridge does
       * not drive and channels this station does not have. This is the ANSWER: the grants
       * resolved against the station, by the one predicate the request gate also asks. A
       * surface reading the claim instead would offer a channel the bridge refuses.
       */
      readonly permittedChannels: readonly number[];
      /**
       * `CENTRAL-BRIDGE-01-A` A2 (Playout `2.9.2` §2) — the Playout refuses to RENEW this session,
       * before using its refresh token (`cg_not_licensed`, `no_cg_access`, a disabled account).
       * Nothing is lost: the token is kept and asked again every minute, and the session works to
       * `exp`. `message` is the Playout's own reason, when it sent one. Absent while renewal works.
       */
      readonly renewalRefused?: { readonly code: SignInFailure; readonly message: string | null };
    }
  /**
   * A principal was held and the bridge has stopped accepting it. The NAME is kept so the pill
   * can say whose session ended — a lapsed session is still an answer to "who is at this
   * console".
   *
   * ⚠ It covers REVOCATION as well as expiry, and is named for the common case deliberately.
   * The console cannot tell the two apart (the bridge answers both with one sentence, by
   * design — see the change's `design.md` §2), and the operator's remedy is identical: sign in
   * again. Drawing a distinction here would ask them to act on one they cannot verify.
   */
  | { readonly kind: 'expired'; readonly name: string };

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

  /**
   * `TEXT-DIGITS-01` — the keyboard language CG Control's window types in, from its shell's one
   * read-only command (`keyboard_language`). Where no shell can say — a browser, the mock —
   * `reportsLanguage()` is false and the one detector (`@cg/gesture`) reads the letters typed.
   */
  keyboard: {
    reportsLanguage(): boolean;
    /** `persian`, `arabic`, `latin` or `unknown` — the shell's reply, checked by the detector. */
    language(): Promise<unknown>;
  };

  /** Status of the link to the local bridge (drives the connection indicator). */
  link: {
    status(): BridgeLinkStatus;
    onStatusChanged(handler: (status: BridgeLinkStatus) => void): Unsubscribe;
    /**
     * 🔴 **Is the connect-time RESYNC in flight?** — `true` from the moment a (re)connect
     * starts its resync until the stack has been re-pulled. (It delivered the stack too, until
     * `CENTRAL-BRIDGE-01`: a console delivers nothing now.)
     *
     * It exists on this contract for ONE consumer and one question: whether an EMPTY stack
     * is the answer or a not-yet. `useBridgeSnapshot`’s `ready` cannot answer it — it
     * latches on the first arrival and never clears — so after a reconnect a browser sees a
     * live link, a latched-ready stack of `[]`, and a bridge already serving its full
     * adopted live-layer ledger. Read without this, every seated layer would look STRANDED
     * with a control armed to cut it.
     *
     * ✅ The multi-browser residual it used to leave open is closed: no console restores rows
     * any more — the bridge restores its own stack before any console connects.
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
    /**
     * 🔴 `CENTRAL-BRIDGE-01` (`R-068`) — **THIS CONSOLE IS ANOTHER RELEASE THAN CG BRIDGE**: the one
     * line to show, or `null` when the release lines match (or nothing is known yet).
     *
     * Unlike {@link skew} this REFUSES: while it is set, nothing is sent but the capabilities
     * question and `auth.*`. CG Bridge and CG Control are one release installed apart, and a
     * console from another release may read the bridge's state wrongly with every channel present.
     */
    versionMismatch(): string | null;
    onVersionMismatchChanged(handler: (line: string | null) => void): Unsubscribe;
    /**
     * `CENTRAL-BRIDGE-01` (D8) — where this console's CG Bridge is (`host:port`), for the one line a
     * console shows when it cannot reach it: "CG Bridge not reachable at <host>:5280". `null` where
     * there is no bridge (test mode).
     */
    bridgeAddress(): string | null;
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
     * `TIMING-WIRE-22` (c) — set this row's PASS TIMING: how many more passes, and the gap
     * between them. A CONFIGURATION verb — it carries no Take and seats nothing; it changes what
     * the graphic already on the channel will do next. On a row that owns no live seats it
     * records the intent for the next take.
     *
     * ⚠ A refused set records NOTHING, so the console keeps displaying what air is doing.
     */
    setPassTiming(
      req: ChannelRequest<typeof StackSetPassTimingChannel>,
    ): Promise<ChannelResponse<typeof StackSetPassTimingChannel>>;
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
     * 🔴 `MEDIA-PLATES-01` §1.D — Play/Pause and Restart for ONE media plate of an on-air row.
     * Refused with nothing sent for a live-input plate, a plate that is not seated, or a row that
     * is not on air; the permission, the row's channel and the lock are the bridge's gate.
     */
    mediaPlateTransport(
      req: ChannelRequest<typeof StackMediaPlateTransportChannel>,
    ): Promise<ChannelResponse<typeof StackMediaPlateTransportChannel>>;
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
     * 🔴 `MULTI-CHANNEL-01` §2 C — **PANIC FOR ONE CHANNEL**: every live plate the bridge holds a
     * seat for on `channel`, and nothing on any other. A NEW verb beside
     * {@link silenceAllLivePlates} (which stays unscoped, A16), scoped like every verb that names
     * a channel. The PANIC control on a channel's view calls THIS, for that channel.
     */
    silenceChannelLivePlates(
      req: ChannelRequest<typeof StackSilenceChannelLivePlatesChannel>,
    ): Promise<ChannelResponse<typeof StackSilenceChannelLivePlatesChannel>>;
    /**
     * OUT + REMOVE every stack item (clears air, empties the list).
     *
     * 🔴 `R-017` — REFUSED, all-or-nothing, while anything is on air, and no longer R-010's
     * unblock path: `clearAll` is. Apply gates on the on-air COUNT, so taking rows off air is
     * the whole remedy and this one is refused in the very state a reconfiguration is blocked
     * in (`operator-surface` §6).
     */
    removeAll(
      req?: ChannelRequest<typeof StackRemoveAllChannel>,
    ): Promise<ChannelResponse<typeof StackRemoveAllChannel>>;
    /**
     * Take every ON-AIR item off air, and KEEP them all on the stack (they go idle).
     * Reuses the per-item `out()` CLEAR — no new AMCP verb. The counterpart to `removeAll`:
     * that one empties the list, this one only clears the screen.
     *
     * `MULTI-CHANNEL-01` §2 B — `removeAll`, `clearAll` and `stopAll` take an OPTIONAL
     * `{ channel }`: bare is every item, exactly as before; with a channel, that channel's items
     * alone. The console passes the channel on screen when the station declares more than one.
     */
    clearAll(
      req?: ChannelRequest<typeof StackClearAllChannel>,
    ): Promise<ChannelResponse<typeof StackClearAllChannel>>;
    /** C-012 — STOP every on-air item (outros run, producers stay resident). */
    stopAll(
      req?: ChannelRequest<typeof StackStopAllChannel>,
    ): Promise<ChannelResponse<typeof StackStopAllChannel>>;
    /**
     * The WHOLE stack, always: the console filters per channel itself (`onChannel`), and this
     * read also feeds the display copy (`B-092`), which a per-channel pull would silently narrow
     * to one channel's rows. The contract's optional channel is not used here.
     */
    snapshot(): Promise<ChannelResponse<typeof StackSnapshotChannel>>;
    onStateChanged(handler: (snapshot: readonly StackItemState[]) => void): Unsubscribe;
    /**
     * B-108 — the rows the bridge's restore could NOT bring back, with the reason.
     *
     * 🔴 `CENTRAL-BRIDGE-01` (`B-294`): the bridge keeps its stack and restores it itself at
     * start; what it declines to re-seat was on the operator's screen before the restart and is
     * now GONE — which desynchronises their model of the stack from reality, silently, unless it
     * is said. The report is standing BRIDGE state (`stack.restore-report`), so every console
     * shows it, and one console's dismissal ({@link dismissRestoreReport}) clears it for all.
     *
     * The BENIGN skip (an item the live bridge already holds) is filtered out on the bridge, so
     * a subscriber can never raise a false alarm by forgetting to.
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
    /**
     * `CENTRAL-BRIDGE-01` — dismiss one half of the restore report ON THE BRIDGE, so every console
     * stops showing it at once (`air.dismiss-emptied`'s reason). Changes nothing on air.
     */
    dismissRestoreReport(
      req: ChannelRequest<typeof StackRestoreReportDismissChannel>,
    ): Promise<ChannelResponse<typeof StackRestoreReportDismissChannel>>;
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
    /**
     * The declared bank, or null when none is configured — the v1 view: on a station that
     * declares several channels, the lowest-numbered one's bank. The console reads
     * {@link banks} for per-channel work.
     */
    config(): Promise<ChannelResponse<typeof FixedLayersConfigChannel>>;
    /**
     * Apply a bank change LIVE (design (e)): grow-at-end and alias changes
     * apply immediately; renumber/channel-change and shrink-with-residents
     * refuse with the validator's code in `reason`. `MULTI-CHANNEL-01` — "the station's bank is
     * this one": on a station declaring several channels, the set becomes this one bank.
     */
    setConfig(
      req: ChannelRequest<typeof FixedLayersSetConfigChannel>,
    ): Promise<ChannelResponse<typeof FixedLayersSetConfigChannel>>;
    /** `MULTI-CHANNEL-01` — every declared bank, in channel order ([] when none is declared). */
    banks(): Promise<ChannelResponse<typeof FixedLayersBanksChannel>>;
    /**
     * `MULTI-CHANNEL-01` — set the station's banks: add, remove, replace and edit channels as one
     * request. A removed channel is refused while anything of ours holds air on it.
     */
    setBanks(
      req: ChannelRequest<typeof FixedLayersSetBanksChannel>,
    ): Promise<ChannelResponse<typeof FixedLayersSetBanksChannel>>;
    /** `MULTI-CHANNEL-01` — the whole set, pushed whenever it is applied. */
    onBanksChanged(handler: (banks: FixedLayerBank[]) => void): Unsubscribe;
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
    /**
     * `B-292` — the layers of OURS that something outside CG Control cleared (another AMCP client,
     * the Playout, CasparCG itself), still to be said. Their rows are already off air; nothing was
     * re-sent. Pushed whenever the list changes.
     */
    clearedOutside(): Promise<ChannelResponse<typeof LayersClearedOutsideChannel>>;
    onClearedOutsideChanged(handler: (cleared: ClearedOutsideLayer[]) => void): Unsubscribe;
  };

  /**
   * `B-225` — **the playout server stopped carrying what this console had put on air.**
   *
   * Its own namespace rather than a field on `connections`: link health answers "can we
   * reach the server", and this answers "is what we put up still there" — a statement about
   * AIR that outlives the reconnect that produced it and needs its own two operator acts.
   *
   * 🔴 **`restore` is the ONLY way anything goes back on air, and it exists solely to be
   * reached by a press.** The owner's decision (2026-09-05) was detect-and-say over restoring
   * automatically, because *an unattended machine must not put a graphic on air.* Nothing may
   * call it from an effect, a timer, a reconnect handler or a mount.
   */
  emptiedAir: {
    /** The standing notice, or `null` when there is nothing to report. */
    notice(): Promise<ChannelResponse<typeof EmptiedAirNoticeChannel>>;
    /** Put the named rows back — an explicit operator act, never automatic. */
    restore(
      req: ChannelRequest<typeof EmptiedAirRestoreChannel>,
    ): Promise<ChannelResponse<typeof EmptiedAirRestoreChannel>>;
    /** Clear the notice without restoring. Changes nothing on air. */
    dismiss(): Promise<ChannelResponse<typeof EmptiedAirDismissChannel>>;
    onNoticeChanged(handler: (notice: EmptiedAirNotice | null) => void): Unsubscribe;
  };

  /**
   * 🔴 `C-016` — **THE PROGRAMME RETURN: what the Playout is putting on air, as a picture.**
   *
   * The bridge reads the Playout's own `pgm` feed as one well-behaved client per channel and
   * relays it on the console's origin; the PROGRAM pane shows it in an `<img>`. The picture is
   * requested ONLY while that `<img>` is mounted — the relay's upstream is held for exactly as
   * long as some console holds the picture open — so the pane must not mount it while hidden.
   *
   * Its STATE is a statement about the FEED, never about air: `connecting` does not mean
   * nothing is on air.
   */
  pgmReturn: {
    /**
     * Where this console reads channel `n`'s picture, or `null` when it has no relay — test mode
     * has no bridge, so there is no picture to request and the pane says "No return signal".
     *
     * `CENTRAL-BRIDGE-01` (D9) — ASYNCHRONOUS: CG Bridge is on another machine, and its `/pgm/<n>`
     * opens only with a ticket the verified socket is given for that channel, so every request of
     * the picture asks for a fresh one. Rejects when the bridge refuses (the channel is not held).
     */
    feedUrl(channel: number): Promise<string | null>;
    /** Every WATCHED channel's state. A channel nobody watches has no entry. */
    status(): Promise<ChannelResponse<typeof PgmReturnStatusChannel>>;
    onStatusChanged(handler: (status: readonly PgmReturnStatus[]) => void): Unsubscribe;
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
    /**
     * 🔴 **`B-247` — WHY a plate stopped being seated, beside the ledger change that says
     * THAT it did.**
     *
     * The bridge has always computed this sentence (`releaseLivePlate`) and always emitted
     * it; until `B-247` nothing forwarded it, so §12.4's *"NAMED, OBSERVABLE behaviour"* was
     * observable only to the bridge's own test suite. Without it the tab sees a three-seat
     * row become a one-seat row and cannot tell a frame that was NEVER seated from one that
     * WAS and was cleared — and it is the second that an operator needs a word for.
     *
     * ⚠ **AN EVENT, so it is only heard by a browser that was connected when it fired.** A
     * reload loses it and the affected frame reads `Not seated` again. That is a deliberate
     * bound and a safe one: the fact refines a state the ledger already publishes (no seat
     * either way), so losing it under-claims rather than lying. It is NOT the shape to copy
     * for anything an operator must not miss — `emptiedAir` is standing bridge state for
     * exactly that reason.
     */
    onPlateReleased(release: (event: LivePlateReleaseState) => void): Unsubscribe;
    /**
     * 🔴 `MEDIA-PLATES-01` §1.E — every seated media plate's transport state: the remaining time
     * (ABSENT unless the server reported the clip's time — never estimated), paused, ended and
     * loop. Standing state, pulled on connect and pushed when what a console shows would change.
     */
    mediaState(): Promise<ChannelResponse<typeof LiveLayersMediaStateChannel>>;
    onMediaStateChanged(handler: (state: MediaPlateState[]) => void): Unsubscribe;
  };

  /**
   * 🔴 `CHANNEL-TEMPLATES-01` (the owner, 2026-09-28) — **EACH CHANNEL HAS ITS OWN TEMPLATE LIST.**
   * Every call below names the channel whose list it reads or changes; with none, the station-wide
   * reading (every listed template once), which is what a surface that shows no channel wants.
   */
  templates: {
    get(
      req: ChannelRequest<typeof TemplatesGetChannel>,
    ): Promise<ChannelResponse<typeof TemplatesGetChannel>>;
    list(
      req?: ChannelRequest<typeof TemplatesListChannel>,
    ): Promise<ChannelResponse<typeof TemplatesListChannel>>;
    /**
     * Register a verified `.vcg` template (R-001). The renderer verifies +
     * unpacks the upload first; this call adds the parsed template to the
     * registry so `list` / `get` see it — on `req.channel`'s list, and no other.
     */
    import(
      req: ChannelRequest<typeof TemplatesImportChannel>,
    ): Promise<ChannelResponse<typeof TemplatesImportChannel>>;
    /**
     * Remove a template from `req.channel`'s list (R-005). The bridge is authoritative: it
     * refuses while a row ON THAT CHANNEL holds the template and returns the operator-facing
     * reason. A confirmed removal also prunes the reconnect-reconciliation retention, so the
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
     * 🔴 `RELEASE-091-01` §1 (`B-288`) — **THE PAGE PVW RENDERS**: the one the bridge serves
     * CasparCG for the version `channel` lists (`templates.page`), on any machine and in any
     * browser; THIS browser's own copy only when the bridge cannot be reached; or why there is none
     * ({@link PvwPage}). The decision is `pvwPageSource`, one pure function.
     *
     * SUPERSEDES R-022's `html()`, which read this browser's copy ALONE — "never a bridge round
     * trip" — so a template imported on another machine, in another browser or on another channel
     * could only be rehearsed after a re-import here. The round trip that note avoided is what makes
     * the page the same everywhere; the fallback keeps rehearse working with the bridge down, which
     * was that note's real concern.
     */
    page(templateId: string, channel?: number): Promise<PvwPage>;
  };

  /**
   * 🔴 `R-066` / `C-037` — **THE PLAYOUT SIGN-IN.**
   *
   * ADR 0010 rule 9: the BROWSER obtains the token and the bridge only verifies it, so
   * {@link signIn} posts to the Playout directly and the bridge never sees a password. The
   * token is held per console, survives a reload, is presented on every (re)connect, and is
   * refreshed about ten minutes before it expires while the page is open.
   *
   * ⚠ Everything here is INERT when the bridge's mode is `off`: {@link state} reads
   * `{ kind: 'off' }`, no key is written, and no surface appears. That is what "byte-identical
   * to today" means for this contract.
   */
  auth: {
    /** What the bridge advertised at connect, or `null` while unknown. */
    capabilities(): AuthCapabilities | null;
    onCapabilitiesChanged(handler: (caps: AuthCapabilities | null) => void): Unsubscribe;
    /** The one state every auth surface reads. See {@link AuthSessionState}. */
    state(): AuthSessionState;
    onStateChanged(handler: (state: AuthSessionState) => void): Unsubscribe;
    /**
     * Sign in against the PLAYOUT (not the bridge), then present the token on this socket.
     *
     * Rejects with a `PlayoutSignInError` carrying the contract's `error` code, which the
     * surface maps to its own sentence — the contract says the Playout's free-text `message`
     * is never shown verbatim.
     */
    signIn(username: string, password: string): Promise<void>;
    /** Drop the token here and the principal on the bridge. Never closes the socket. */
    signOut(): Promise<void>;
  };

  /**
   * 🔴 `DESKTOP-APPS-01` — **SETTING THE STATION UP**: the connection check, the Playout's channels
   * as first-run needs them, and — inside CG Control only — the Playout address.
   */
  setup: {
    /** §2F — the connection check, one line per link. Reads; changes nothing. */
    check(
      req: ChannelRequest<typeof SetupCheckChannel>,
    ): Promise<ChannelResponse<typeof SetupCheckChannel>>;
    /** §2E — this machine's address on the route to a host: the serve-host default. */
    routeAddress(
      req: ChannelRequest<typeof SetupRouteAddressChannel>,
    ): Promise<ChannelResponse<typeof SetupRouteAddressChannel>>;
    /** §2E step 3 — the Playout's channels UNJOINED, in the signed-in admin's grant. */
    catalogue(): Promise<ChannelResponse<typeof ChannelsCatalogueChannel>>;
    /**
     * `DESKTOP-APPS-01-D` d — what is already on air on a channel, asked after the connection is
     * written and before the channel is declared. A read.
     */
    channelOccupancy(
      req: ChannelRequest<typeof SetupChannelOccupancyChannel>,
    ): Promise<ChannelResponse<typeof SetupChannelOccupancyChannel>>;
    /**
     * `DESKTOP-APPS-01-A` — can THIS console change the Playout address? Only inside CG Control;
     * a browser has no such door, and the control that would use it is then absent.
     */
    canSetPlayoutAddress(): boolean;
    /**
     * `CENTRAL-BRIDGE-01` (D8) — THIS console's Playout, which says where its CG Bridge is: saved in
     * its station record, and the console reconnects to CG Bridge there. Never the socket, and never
     * CG Bridge's own configuration. `bridgeAddress`: absent keeps the console's CG Bridge address;
     * `''` puts CG Bridge on the Playout's host; `host` / `host:port` is a separate server's.
     */
    setPlayoutAddress(address: string, bridgeAddress?: string): Promise<string>;
    /** `CENTRAL-BRIDGE-01` (D8) — the separate server's CG Bridge address this console keeps, if any. */
    bridgeOverride(): string | null;
    /**
     * `CENTRAL-BRIDGE-01` (D8) — forget this console's station so it asks again (CG Control only;
     * `false` elsewhere, or when the store refused). The caller restarts the page.
     */
    forgetStation(): boolean;
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
     * `CENTRAL-BRIDGE-01` §1 A — can THIS console download CG Bridge's logs? They live on the
     * Playout machine now (`%ProgramData%\CG Bridge\logs\`), so "Open log folder" (`FIELD-FIXES-01`
     * G) became a download of one zip. Offered while connected; the bridge gives the ticket to a
     * station admin only, and says so to anyone else.
     */
    canDownloadLogs(): boolean;
    /** Save CG Bridge's logs as one zip. A refusal is answered, never thrown. */
    downloadLogs(): Promise<{ accepted: boolean; message?: string }>;
    /*
      🔴 `OPERATOR-NAME-SWEEP-01` — **THE TWO AUDIT MEMBERS THAT READ AND WROTE THE CONSOLE
      LABEL ARE GONE FROM THIS CONTRACT, and the removal is the point rather than a tidy-up.**

      They were the typed seam a browser-held, SELF-DECLARED console label hung from, and
      every surface that showed it was obliged to say what it was worth. Identity is proven
      now — `C-037` verifies a Playout token and `C-038` gates on it — so the label answers
      a question the system can already answer properly, and the caveat that qualified it had
      become a false statement displayed above verified names.

      ⚠ **The CHANNEL is removed, not the control** (golden rule 13's door): a contract member
      left in place with no UI is one edit away from coming back, and a type that cannot
      express the value is the only version of this decision that cannot be undone by
      accident. Under auth OFF the request frame now carries no `actor` at all and the bridge
      records `unattributed` — see `proposal.md` for why that is the honest answer.
    */
  };

  update: {
    request(
      req: ChannelRequest<typeof UpdateRequestChannel>,
    ): Promise<ChannelResponse<typeof UpdateRequestChannel>>;
    state(): Promise<ChannelResponse<typeof UpdateStateChannel>>;
    cancel(): Promise<ChannelResponse<typeof UpdateCancelChannel>>;
    onStateChanged(handler: (pending: PendingUpdate | null) => void): Unsubscribe;
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
   * 🔴 `R-062` gap 2 / `C-039` — **THE CHANNEL-DISCOVERY CALL.**
   *
   * Every channel any source knows of — the Playout's catalogue first, then the bank, then channel
   * settings — each with its three facts kept apart: `named` (a label), `declared` (this station
   * operates it) and `permitted` (this principal may). The strip lists the `declared` ones, under
   * the catalogue's name where one joined. A `named` channel that is not `declared` is somebody
   * else's output and is never offered as a channel this console operates.
   */
  stationChannels: {
    list(): Promise<StationChannels>;
    onChanged(handler: (state: StationChannels) => void): Unsubscribe;
  };

  /**
   * 🔴 `DESKTOP-APPS-01-D` j — **ITEMS OF OURS ON A CHANNEL THIS STATION DOES NOT DECLARE.**
   * Shown only in Station setup, to a station-admin; the one act is take-off-air (STOP then
   * CLEAR on that exact layer). Never offered to load again.
   */
  strays: {
    list(): Promise<ChannelResponse<typeof StationStraysChannel>>;
    onChanged(handler: (strays: readonly StationStray[]) => void): Unsubscribe;
    takeOffAir(
      req: ChannelRequest<typeof StationTakeOffAirChannel>,
    ): Promise<ChannelResponse<typeof StationTakeOffAirChannel>>;
  };

  /**
   * 🔴 `CENTRAL-BRIDGE-01` (D7, the Playout team's rule 8) — **CG BRIDGE'S OWN PLAYOUT SESSION.**
   * One per bridge. While it `needs-admin`, every console says so in one line; a station admin gives
   * the station account's password once, and the bridge keeps the refresh token and drops the
   * password. This console never stores it either — the dialog forgets it when it closes.
   */
  bridgeSession: {
    state(): Promise<ChannelResponse<typeof BridgeSessionStateChannel>>;
    onChanged(handler: (state: BridgeSessionState) => void): Unsubscribe;
    signIn(
      req: ChannelRequest<typeof BridgeSessionSignInChannel>,
    ): Promise<ChannelResponse<typeof BridgeSessionSignInChannel>>;
  };

  /**
   * 🔴 `PLAYOUT-FEATURES-01` D (`R-077`) — **THE CG LICENSE**, as CG Bridge last read it from the Playout
   * (`GET /api/cg/license`, kept through an outage). `license: null` — nothing read (auth off, a Playout
   * before `2.9.2`): nothing is refused for it. The strip's mark and the admin's grace line read it.
   */
  license: {
    state(): Promise<ChannelResponse<typeof LicenseStateChannel>>;
    onChanged(handler: (state: LicenseState) => void): Unsubscribe;
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
     * 🔴 `PLAYOUT-SOURCES-01` §1.F — **the PLATE BAND, and nothing else.** The station's sources are
     * the Playout's (D10 inputs, D11 media), read by the bridge; the one catalogue fact CG Control
     * still owns is the band its plates are seated in. The BRIDGE is authoritative for the refusal —
     * a band overlapping the candidate bank or the reserved playout range — and supplies the
     * wording. It cascades nothing.
     */
    setConfig(
      req: ChannelRequest<typeof SourcesSetConfigChannel>,
    ): Promise<ChannelResponse<typeof SourcesSetConfigChannel>>;
    /** `PLATE-BAND-01` — the catalogue with the plate band in force beside it. */
    onConfigChanged(handler: (catalog: ConsoleSourceCatalog) => void): Unsubscribe;
    assignments(): Promise<ChannelResponse<typeof SourcesAssignmentsChannel>>;
    /**
     * Replace the whole assignment set. Refused when a plate is assigned twice, or when a NEW or
     * CHANGED binding names an entry that is not bindable (not offered, unusable, or gone).
     */
    setAssignments(
      req: ChannelRequest<typeof SourcesSetAssignmentsChannel>,
    ): Promise<ChannelResponse<typeof SourcesSetAssignmentsChannel>>;
    onAssignmentsChanged(handler: (assignments: SourceAssignments) => void): Unsubscribe;
    /**
     * `PLAYOUT-SOURCES-01` §1.A — one page of the Playout's media, searched on the Playout's side.
     * A read: a viewer may search. Items carry no path — the bridge keeps the clip.
     */
    mediaSearch(
      req: ChannelRequest<typeof SourcesMediaSearchChannel>,
    ): Promise<ChannelResponse<typeof SourcesMediaSearchChannel>>;
    /**
     * `PLAYOUT-SOURCES-01` §1.A — a picker opened: ask the bridge to read again if its last read is
     * older than 5 s. Answers at once; what changes arrives on {@link onConfigChanged}.
     */
    refresh(): Promise<ChannelResponse<typeof SourcesRefreshChannel>>;
    /**
     * 🔴 `MEDIA-PLATES-01` §1.A — a bound clip's two playback settings, STATION-WIDE: Loop, and what
     * it does when a look hides it. Operator class, audited with the clip's name; the new catalogue
     * (carrying them) arrives on {@link onConfigChanged}.
     */
    setMediaPlayback(
      req: ChannelRequest<typeof SourcesSetMediaPlaybackChannel>,
    ): Promise<ChannelResponse<typeof SourcesSetMediaPlaybackChannel>>;
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

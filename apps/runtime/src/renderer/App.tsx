import { useUiText } from './i18n/locale.js';
import { useCanOperate } from './hooks/useCanOperate.js';
import { EngineNameContext, engineNameForMode } from './ui/engineWording.js';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { mismatchedChannels, type TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { useTemplateIndex } from './hooks/useTemplateIndex.js';
import { boundChannelOf } from './features/channels/itemChannel.js';
import type { RuntimeBridge } from '../shared/runtime-bridge.js';
import { AuditPanel } from './features/audit/AuditPanel.js';
import { FailoverBanner } from './features/connections/FailoverBanner.js';
import { ConnectionBanner } from './features/status/ConnectionBanner.js';
import { BridgeSkewBanner } from './features/status/BridgeSkewBanner.js';
import { BridgeSessionBanner, LicenseGraceBanner } from './features/status/BridgeSessionBanner.js';
import { RasterMismatchBanner } from './features/status/RasterMismatchBanner.js';
import { losingAirChecks, OutputMissingBanner } from './features/status/OutputMissingBanner.js';
import { getRefusal, onRefusal } from './features/status/refusalStore.js';
import { unlicensedChannels } from './features/channels/channelAir.js';
import { channelSignals, inScope } from './features/channels/channelSignals.js';
import { UnlicensedLine } from './features/channels/UnlicensedLine.js';
import { useChannelAirs } from './features/channels/useSelectedChannel.js';
import { useChannelSettings } from './hooks/useChannelSettings.js';
import { useLink } from './hooks/useLink.js';
import { useBridgeReadable } from './hooks/useBridgeSnapshot.js';
import { StationSetupDialog } from './features/stationSetup/StationSetupDialog.js';
import {
  closeStationSetup,
  openStationSetup,
  useStationSetupRequest,
} from './features/stationSetup/stationSetupStore.js';
import { OrphanLayersBanner, orphanWarningChannels } from './features/layers/OrphanLayersBanner.js';
import { useForeignDismissals } from './features/layers/foreignNotice.js';
import { EmptiedAirNotice, emptiedAirChannels } from './features/layers/EmptiedAirNotice.js';
import { LayersPanel } from './features/layers/LayersPanel.js';
import { NO_FILTER, type LayerFilter } from './features/layers/layerFilter.js';
import { useLayerShortcuts } from './features/layers/useLayerShortcuts.js';
import { LayerShortcutSessionProvider } from './features/layers/layerShortcutSession.js';
import {
  FloatingPanelSlot,
  FloatingPanelSurface,
  FloatingWorkspaceProvider,
  WorkspaceTooltip,
} from './features/workspace/floatingWorkspace.js';
import type { FloatingPanelDocuments } from './features/workspace/floatingPanelDocuments.js';
import { ChannelScope } from './features/channels/ChannelScope.js';
import { useChannelBankState } from './features/channels/useSelectedChannel.js';
import { onChannel } from './features/stack/onAir.js';
import { AppHeader } from './features/shell/AppHeader.js';
import { useTemplatePicker } from './features/fixedLayers/useTemplatePicker.js';
import { ConsoleCloseGuard } from './features/shell/ConsoleCloseGuard.js';
import { MonitorStrip, type MonitorCompanionMode } from './features/monitors/MonitorStrip.js';
import { ShellDivider } from './ui/ShellDivider.js';
import { useShellLayout } from './hooks/useShellLayout.js';
import { ShellLayoutProvider } from './hooks/shellLayoutContext.js';
import { LiveInputCheckProvider } from './features/monitors/liveInputCheckContext.js';
import { Inspector } from './features/inspector/Inspector.js';
import { applyDraft } from './features/inspector/applyDraft.js';
import { clearDraft } from './features/inspector/draftStore.js';
import { LockOverlay } from './features/lock/LockOverlay.js';
import { SignInOverlay } from './features/auth/SignInOverlay.js';
import { FirstRunScreen } from './features/firstRun/FirstRunScreen.js';
import { useAuthCapabilities } from './hooks/useAuthCapabilities.js';
import { CommandToast } from './features/status/CommandToast.js';
import { RefusalBanner } from './features/status/RefusalBanner.js';
import { takeRefusalChannels } from './features/layers/takeRefusalLine.js';
import { useFixedSlots } from './hooks/useFixedLayers.js';
import { StatusBar } from './features/status/StatusBar.js';
import { useConnections } from './hooks/useConnections.js';
import { useEngineSessions } from './hooks/useEngineSessions.js';
import { useBackupChannels } from './hooks/useBackupChannels.js';
import { initDelimiters } from './features/inspector/delimiterStore.js';
import { initCalendar } from './features/calendar/calendarStore.js';
import { initSources } from './features/sources/sourceStore.js';
import { useStackHousekeeping } from './hooks/useStackHousekeeping.js';
import { useTemplateRebuild } from './features/library/useTemplateRebuild.js';
import { useLock, useLockCoverage } from './hooks/useLock.js';
import { useOrphans } from './hooks/useOrphans.js';
import { useClearedOutside } from './hooks/useClearedOutside.js';
import { useOwnedOccupancy } from './hooks/useOwnedOccupancy.js';
import { useEmptiedAir } from './hooks/useEmptiedAir.js';
import { useStack } from './hooks/useStack.js';
import { useRehearse } from './hooks/useRehearse.js';
import { isRehearsalInterlocked, isRehearsing } from '@cg/shared-ipc';
import { appShell } from './layout.js';
import './workspace.css';

declare global {
  interface Window {
    cg: RuntimeBridge;
  }
}

// The shell's layout contract — the PAGE never scrolls, the PANELS do. It lives in
// `layout.ts`, where the two defects it replaces are documented and pinned by a test.
const styles = appShell;

/** Root Runtime layout — four regions per Phase 6 §2. */
/**
 * Is this event target a place the operator TYPES? Text inputs, textareas and any
 * `contenteditable` host keep the browser's own context menu (see the suppressor below):
 * cut/copy/paste and the BiDi/spelling services are real editing affordances, and the
 * Runtime's field editing is Persian.
 *
 * A non-text input (checkbox, range) is NOT editable in this sense — there is nothing to
 * copy out of it — so it falls under the suppression like the rest of the surface.
 */
const TEXTUAL_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
]);

export function isEditable(target: EventTarget | null): boolean {
  const doc = (target as Node | null)?.ownerDocument;
  const realm = doc?.defaultView ?? globalThis;
  if (!(target instanceof realm.HTMLElement)) return false;
  if (target instanceof realm.HTMLTextAreaElement) return true;
  if (target instanceof realm.HTMLInputElement) {
    // An input with no `type` is a text input.
    return TEXTUAL_INPUT_TYPES.has(target.type === '' ? 'text' : target.type);
  }
  // `=== true`, not a bare return: `isContentEditable` is not implemented everywhere (jsdom
  // leaves it undefined), and a falsy-but-not-false result must still mean "suppress".
  return target.isContentEditable === true;
}

function LayerShortcutsListener({
  layerDocument,
  panelDocuments,
}: {
  layerDocument?: Document | undefined;
  panelDocuments: readonly Document[];
}): null {
  useLayerShortcuts({
    ...(layerDocument === undefined ? {} : { layerDocument }),
    panelDocuments,
  });
  return null;
}

export function App({
  floatingDocuments = null,
}: {
  floatingDocuments?: FloatingPanelDocuments | null;
} = {}): JSX.Element {
  const localizeUi = useUiText();
  const items = useStack();
  /*
    `PASSES-CYCLE-ONLY-26` §A1.2 — the TEMPLATE facts an UPDATE press needs. What pass timing a
    press may send depends on the template's stated mode, and `applyDraft` is deliberately free
    of stores; the index is held here, beside the stack it is keyed on.
  */
  // `FIELD-FIXES-01` B — a mock item carries no `slot`; the bank row it is bound to says its channel.
  const fixedSlots = useFixedSlots();
  // `CHANNEL-TEMPLATES-01` — each row's template as ITS channel lists it.
  const templates = useTemplateIndex(
    items.map((i) => ({ templateId: i.templateId, channel: boundChannelOf(i, fixedSlots) })),
  );
  const templateOfItem = (item: StackItemState): TemplateInfo | undefined =>
    templates.get(item.templateId, boundChannelOf(item, fixedSlots)) ?? undefined;
  /** An Update's press: the row's draft, with its template's playout and (`R-101`) field form. */
  const applyItem = (item: StackItemState): ReturnType<typeof applyDraft> => {
    const template = templateOfItem(item);
    return applyDraft(item, template?.playout, template);
  };
  // B-156 — read ONCE here and threaded to both the layer table and the Inspector.
  const rehearsals = useRehearse();
  const lock = useLock();
  // `DESKTOP-APPS-01` — an installed station still in first-run says so at connect.
  const capabilities = useAuthCapabilities();
  const engineName = engineNameForMode(capabilities?.mode ?? 'playout');
  const setupPhase = capabilities?.setupPhase ?? null;
  // `B-257` — the lock screen covers the console only when the lock covers ALL of it. A partly
  // covered console keeps its other channels; the strip names the covered ones.
  const lockCovers = useLockCoverage().kind === 'all';
  const canOperate = useCanOperate() && !lockCovers;
  const health = useConnections();
  // `RELEASE-0112-01` (`R-085`) — each engine's CG Bridge session, for the status bar's chips.
  const engines = useEngineSessions();
  // `RELEASE-0113-01` (`R-089`) — where each channel's lines go on the backup engine (the status bar's count).
  const backupChannels = useBackupChannels();
  const orphans = useOrphans();
  // `B-292` — a layer of ours cleared outside CG Control: the banner's third strip, and its mark.
  const clearedOutside = useClearedOutside();
  // `FIELD-FIXES-01` L — the same dismissals the orphan strips read, so a mark and its notice agree.
  const foreignDismissals = useForeignDismissals();
  const ownedOccupancy = useOwnedOccupancy();
  const emptiedAir = useEmptiedAir();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The Inspector can remount between selections on a narrow screen.
  const [layerDetailsOpen, setLayerDetailsOpen] = useState(true);
  const [positionOpen, setPositionOpen] = useState(true);
  const [timingOpen, setTimingOpen] = useState(true);
  // B-427 — a fullscreen panel can unmount LayersPanel without ending the console session.
  const [layerFilter, setLayerFilter] = useState<LayerFilter>(NO_FILTER);
  // R-028 part B — the operator's own workspace geometry (persisted per browser).
  const layout = useShellLayout();
  const nativePanels = floatingDocuments !== null;
  const panelDocuments = useMemo(
    () => Array.from(floatingDocuments?.panels.values() ?? [], (pane) => pane.root.ownerDocument),
    [floatingDocuments],
  );
  const layersFloating = nativePanels && layout.floatingPanels.layers !== undefined;
  const inspectorFloating = nativePanels && layout.floatingPanels.inspector !== undefined;
  const allMonitorsFloating =
    nativePanels &&
    layout.floatingPanels.pgm !== undefined &&
    layout.floatingPanels.pvw !== undefined;
  // R-111 — presentation only. Fullscreen changes what surrounds the monitor, never selection.
  const [monitorCompanionMode, setMonitorCompanionMode] = useState<MonitorCompanionMode>('monitor');
  // R-108 — a shell-level catalogue door, independent of whether any layer is empty.
  const { openTemplateLibrary, pickerDialog: templateLibraryDialog } = useTemplatePicker(
    engineName,
    capabilities?.sharedTemplateFolder === true,
    capabilities?.templateThumbnails === true,
    capabilities?.controlLiveLayouts === true && canOperate,
  );
  const [auditOpen, setAuditOpen] = useState(false);
  // `STATION-SETUP-02` — ONE settings dialog, opened at a section from five surfaces; the
  // request lives in a module store so the Inspector and the Layers panel can raise it too.
  const stationSetup = useStationSetupRequest();
  /*
    🔴 `MULTI-CHANNEL-01` — THE INSPECTOR IS THE SELECTED CHANNEL'S, like the table and both
    monitors it sits beside (`ChannelScope` wraps all four). A row chosen on channel 1 is not
    edited under channel 2's tab, so the selection resolves among THIS channel's items — the
    table's own `onChannel` rule. The choice itself is kept: coming back to channel 1 finds it
    as it was, because a switch is a scope change and never a mutation.
  */
  const { selected: selectedChannel, viewChannel, verbScope, multiChannel } = useChannelBankState();
  const selected = useMemo(
    () => onChannel(items, viewChannel).find((i) => i.itemId === selectedId) ?? null,
    [items, viewChannel, selectedId],
  );

  /*
    🔴 `MULTI-CHANNEL-01` §2 L — A CHANNEL'S MESSAGES STAY IN THAT CHANNEL'S VIEW (the owner's
    rule, 2026-09-23; the classification is in `channelSignals.ts`). The five channel-scoped
    surfaces below take `verbScope` — the channel on screen on a multi-channel station, `null` with
    one, where nothing is filtered — and every OTHER channel whose view holds one of them carries a
    mark on its strip tab, computed here from the SAME readings the surfaces filter, so the mark and
    the view cannot disagree. The station-wide surfaces (the bridge link, its version, the servers,
    the status bar, sign-in, the station lock) take no scope at all.
  */
  const channelSettingsState = useChannelSettings();
  const standingRefusal = useSyncExternalStore(onRefusal, getRefusal, getRefusal);
  const linkLive = useLink() === 'live';
  // `UI-POLISH-01` G — the Playout's air facts, for the one playlist state that reaches our air.
  const channelAirs = useChannelAirs();
  const signals = useMemo(
    () =>
      multiChannel
        ? channelSignals({
            alarms: [
              ...(linkLive && health !== null
                ? losingAirChecks(health.primary).map((c) => c.channel)
                : []),
              ...mismatchedChannels(channelSettingsState).map((e) => e.channel),
            ],
            warnings: [
              ...emptiedAirChannels(emptiedAir),
              ...orphanWarningChannels(orphans, ownedOccupancy, foreignDismissals, clearedOutside),
              ...(standingRefusal?.channel != null ? [standingRefusal.channel] : []),
              // `FIELD-FIXES-01` B — a row carrying a refused take's line, shown in ITS view only.
              ...takeRefusalChannels(items, fixedSlots),
              // `UI-POLISH-01` G — unlicensed in the Playout: cleared every minute, ours included.
              ...unlicensedChannels(channelAirs),
            ],
          })
        : undefined,
    [
      multiChannel,
      linkLive,
      health,
      channelSettingsState,
      emptiedAir,
      orphans,
      foreignDismissals,
      ownedOccupancy,
      clearedOutside,
      standingRefusal,
      items,
      fixedSlots,
      channelAirs,
    ],
  );

  // Suppress the browser's own context menu app-wide. On a playout machine its entries are
  // never what the operator wants and some are actively dangerous — Reload and Back leave the
  // running show, and none of it says anything about the graphics on air.
  //
  // Our own menus (the library card, the stack row) open from React `onContextMenu` handlers
  // that call `preventDefault` themselves, so they are unaffected by this. Everywhere else,
  // right-click now does nothing at all — which is the intent: no browser chrome, and no
  // half-menu the app cannot stand behind.
  //
  // EDITABLE FIELDS ARE EXEMPT. The Inspector is where the operator types the Persian copy
  // that goes to air, and right-click there is the ordinary way to reach cut/copy/paste and
  // — load-bearing for this app — the browser's own spelling and RTL/BiDi text services.
  // Suppressing it would take away a real editing affordance to prevent a hazard that does
  // not exist inside a text box: none of the dangerous entries (Reload, Back) are what a
  // right-click on a focused input offers. So the suppression covers the operator SURFACE,
  // not text entry.
  useEffect(() => {
    function suppressNativeMenu(e: MouseEvent): void {
      if (isEditable(e.target)) return;
      e.preventDefault();
    }
    const views = [window, ...panelDocuments.map((doc) => doc.defaultView)];
    for (const view of views) view?.addEventListener('contextmenu', suppressNativeMenu);
    return () => {
      for (const view of views) view?.removeEventListener('contextmenu', suppressNativeMenu);
    };
  }, [panelDocuments]);

  // R-034 — pull the station's delimiter list once and stay subscribed. Here
  // rather than in the control that uses it: the list is per-STATION, not per
  // field, and a subscription per rendered field would open and close one every
  // time the operator changed selection.
  //
  // `DELTA-MULTI-CHANNEL-01-A` A4 — "once" means once each time the console can READ: a pull
  // refused before the first sign-in left these stores empty for the life of the page (the
  // bridge pushes nothing to a socket nobody has signed in on, and a sign-in pushes nothing).
  const readable = useBridgeReadable();
  useEffect(() => (readable ? initDelimiters(window.cg) : undefined), [readable]);
  // `DELTA-RUN-NEXT-VERSION-01-C` — the station's Lunar Hijri adjustment, the delimiters' way and reason.
  useEffect(() => (readable ? initCalendar(window.cg) : undefined), [readable]);

  // D-137 / C-015 — the installation's source CATALOG and the per-plate
  // ASSIGNMENTS, pulled once and kept subscribed for the same reason: both are
  // per-STATION, a second console must gain a binding this one just made without
  // either operator reloading, and a catalog DELETION cascades into the
  // assignments without any browser asking.
  useEffect(() => (readable ? initSources(window.cg) : undefined), [readable]);

  // Stack housekeeping — the prune of per-item state for items that have left the
  // stack, plus the file-attachment restore. HERE because `App` is the one
  // component mounted for the life of the page: as an effect inside `LayersPanel`
  // it re-ran on every fullscreen round-trip (which unmounts that panel) against a
  // bootstrap snapshot, and deleted every staged edit. See `useStackHousekeeping`.
  useStackHousekeeping();
  // `PAGE-REBUILD-01` (`C-034`) — on each connect, build again every page an earlier runtime
  // built. HERE for the same reason: one pass per connect, not one per mount of a view.
  useTemplateRebuild();

  // Narrow: one column, the Inspector is an overlay. Fullscreen: the focused
  // panel takes everything. Otherwise: workspace | divider | Inspector.
  //
  // The workspace holds the monitor strip AND the layer list, so a fullscreen
  // Layers / PGM / PREVIEW all live inside it — only a fullscreen Inspector
  // replaces it. `MonitorStrip` decides which of its two boxes a monitor focus
  // means.
  const monitorFocused = layout.focus === 'pgm' || layout.focus === 'pvw';
  const shellChromeVisible = layout.focus === 'none';
  const showWorkspace = layout.focus !== 'inspector';
  /*
   * 🔴 `RUNTIME-REDESIGN-01` PHASE 5 — THE MONITORS ARE SHOWN OR NOT, AND NOTHING ELSE DECIDES IT.
   *
   * Three things stay independent here: which row is SELECTED (`selectedId`, this file),
   * which rows are IN PVW (the bridge's rehearse set, `useRehearse`), and whether the
   * monitors are SHOWN (`layout.monitorsShown`, the APP HEADER's toggle — `AUDIT-CLOSE-01` B1
   * moved it off the Layers bar, and `MONITORS-01` flipped its default). Each is read and
   * written by its own control and by nothing else in this tree — a selection never enters
   * or leaves PVW, a PVW change never selects or deselects, and folding the strip away
   * touches neither. `workspace-independence.spec.ts` drives all three pairs in both
   * directions; `workspaceIndependence.dom.test.ts` is the same proof in jsdom.
   *
   * The two exceptions are FULLSCREEN, which is a different axis (focus) and was already
   * here: a fullscreen monitor is still the strip, so it shows through a hidden toggle, and
   * a fullscreen Layers list hides the strip as it always did.
   */
  const monitorsVisible =
    showWorkspace &&
    layout.focus !== 'layers' &&
    (layout.monitorsShown || monitorFocused) &&
    !allMonitorsFloating;
  const hasPreviewRows = rehearsals.some(
    ({ channel }) => viewChannel === null || channel === viewChannel,
  );

  /*
   * THE INSPECTOR IS OPEN IF, AND ONLY IF, SOMETHING IS SELECTED.
   *
   * One derived predicate, at both widths, and it replaces a second piece of state
   * (`inspectorOverlayOpen`) that used to track openness independently. That is what
   * the owner's narrow-screen bug actually was: dismissing the overlay closed the
   * PANEL and left the row SELECTED, so the console said "you are editing this" on
   * the list while showing no editor — two states disagreeing about one fact.
   *
   * Deriving it means the bug cannot come back. There is no way to be open with
   * nothing selected, or selected with nothing open, because there is only one
   * boolean and it is computed. Every dismissal path — the scrim, the panel's close
   * button, clicking the selected row again — is now the SAME operation: deselect.
   *
   * `closeInspector` is that one operation, named once so no caller invents a second
   * way to close (which is how the two states drifted apart in the first place).
   */
  const inspectorOpen = selected !== null;
  const closeInspector = useCallback(() => setSelectedId(null), []);

  const showMonitorLayerCompanion =
    monitorFocused && selected !== null && monitorCompanionMode !== 'monitor' && !layersFloating;
  const showMonitorInspectorCompanion =
    monitorFocused &&
    selected !== null &&
    monitorCompanionMode === 'layer-inspector' &&
    !inspectorFloating;
  const showMonitorCompanion = showMonitorLayerCompanion || showMonitorInspectorCompanion;

  const showInspectorColumn =
    !layout.narrow &&
    inspectorOpen &&
    !inspectorFloating &&
    (layout.focus === 'none' || layout.focus === 'inspector');
  /*
   * A CLOSED Inspector gives its width back to the workspace (owner request: the
   * panel is closed when no layer is selected). The divider goes with it — a resize
   * handle for a column that is not there would be a control that does nothing.
   */
  const inspectorLeft = layout.positions.inspectorSide === 'left';
  const layersAbove = layout.positions.layerPosition === 'above';
  const splitInspector =
    !layout.narrow && inspectorOpen && !inspectorFloating && layout.focus === 'none';
  const inspectorWidth = String(layout.inspectorPx) + 'px';
  const shellColumns = splitInspector
    ? inspectorLeft
      ? inspectorWidth + ' 6px minmax(0, 1fr)'
      : 'minmax(0, 1fr) 6px ' + inspectorWidth
    : '1fr';
  const companionColumn = showMonitorInspectorCompanion && inspectorLeft ? '2' : '1';
  const monitorRow = layersAbove && showMonitorLayerCompanion ? '2' : '1';

  const renderLayersPanel = (view: 'layers' | 'companion' | 'shortcuts'): JSX.Element => (
    <LayersPanel
      /* `B-232` (owner) — the SAME notice the strip above renders, so the
         marked rows and the strip's list are one reading, not two. */
      emptiedAirRows={emptiedAir?.rows ?? []}
      /* `B-235` — the SAME orphan set the strip above renders, so the
         Station layers tab and the strip are one reading, not two. */
      orphans={orphans}
      onSelectionChange={(id) => {
        if (id !== null || !inspectorFloating) setSelectedId(id);
      }}
      selectedId={selectedId}
      independentPreview={capabilities?.independentPreview === true}
      layout={layout}
      selectedOnly={view === 'companion'}
      shortcutsOnly={view === 'shortcuts'}
      filter={layerFilter}
      onFilterChange={setLayerFilter}
      inspectorOpen={inspectorOpen}
      onToggleInspector={closeInspector}
      onUpdate={(id) => {
        const target = items.find((i) => i.itemId === id);
        return target !== undefined ? applyItem(target) : Promise.resolve({ accepted: false });
      }}
    />
  );

  const selectedOnPvw = selected !== null && isRehearsing(rehearsals, selected.itemId);
  const renderInspector = (onClose: () => void): JSX.Element => (
    <Inspector
      disclosures={{
        layerDetails: {
          open: layerDetailsOpen,
          toggle: () => setLayerDetailsOpen((open) => !open),
        },
        position: { open: positionOpen, toggle: () => setPositionOpen((open) => !open) },
        timing: { open: timingOpen, toggle: () => setTimingOpen((open) => !open) },
      }}
      onClose={onClose}
      item={selected}
      // B-156 — ONE derivation of "is this row rehearsing", shared with the row picker.
      rehearsing={selectedOnPvw}
      previewOnly={selectedOnPvw && !isRehearsalInterlocked(rehearsals, selected.itemId)}
      onApply={(id) => {
        const target = items.find((i) => i.itemId === id);
        return target !== undefined ? applyItem(target) : Promise.resolve({ accepted: false });
      }}
      onDiscard={(id) => clearDraft(id)}
    />
  );
  const dockLayers = (view: 'layers' | 'companion'): JSX.Element =>
    nativePanels ? (
      <FloatingPanelSlot panel="layers" compact={view === 'companion'} />
    ) : (
      renderLayersPanel(view)
    );
  const dockInspector = (onClose: () => void): JSX.Element =>
    nativePanels ? <FloatingPanelSlot panel="inspector" /> : renderInspector(onClose);
  const nativeLayersView =
    layersFloating || (showWorkspace && !monitorFocused)
      ? 'layers'
      : showMonitorLayerCompanion
        ? 'companion'
        : 'shortcuts';

  const shell = (
    <ShellLayoutProvider layout={layout}>
      <main style={styles.page}>
        {/*
          🔴 `AUDIT-CLOSE-01` B1 — THE APP HEADER, above every banner.

          Above them deliberately: the header is the shell's own chrome and the banners are
          about the STATE of the thing inside it, so a banner appearing must not push the
          brand, the channel tabs and the two doors down the page. It carries the CHANNEL
          strip, so the shell gained a header without gaining a line — see the component's
          own note for the measurement, and for the three controls the reference draws here
          that this one deliberately does not take.
        */}
        {shellChromeVisible && (
          <AppHeader
            layout={layout}
            onOpenTemplates={() => void openTemplateLibrary(selectedChannel)}
            onOpenSettings={() => openStationSetup()}
            onOpenAudit={() => setAuditOpen(true)}
            {...(signals !== undefined ? { channelSignals: signals } : {})}
          />
        )}
        {templateLibraryDialog}
        {/* R-006 — a not-live link means NOTHING can reach air. That is a full-width alert,
          not a pill: the pill lost to the green HEALTHY pill beside it, and the operator
          believed a graphic was on air. Renders nothing when the link is live. */}
        <ConnectionBanner />
        {/* B-153 — the bridge PROCESS is older than this page. Reports, never gates. */}
        <BridgeSkewBanner />
        {/* `CENTRAL-BRIDGE-01` (D7) — CG Bridge has no Playout session of its own: one line, and a
          station admin's one-time sign-in. Renders nothing otherwise. */}
        <BridgeSessionBanner />
        <LicenseGraceBanner />
        {/* R-006 — the failover banner describes REAL servers, so it renders NOTHING in test
          mode. That gate lives INSIDE the component since `RUNTIME-REDESIGN-01` Phase 9 (it was
          `link !== 'offline-mock' && …` here, where no component test could reach it and the
          plant pass found the surface unguarded); see the component's header. */}
        <FailoverBanner health={health} />
        {/* R-030 — a configured raster that contradicts the channel's real video mode
          mis-places EVERY graphic on that channel, and does it silently: nothing else
          in the app would notice, and it only looks wrong on air where nobody here can
          see it. Renders nothing unless the two genuinely disagree — an UNREADABLE mode
          is a gap in the check, not an alarm (see RasterMismatchBanner). */}
        <RasterMismatchBanner scope={verbScope} />
        {/* C-029 — a consumer casparcg.config declares that CasparCG is not running means the
          channel has no program output, and nothing else in the console would say so: AMCP
          answers, OSC ticks, every pill reads HEALTHY. Renders nothing unless a declared
          consumer is genuinely missing — or was, the last time the bridge could look. */}
        <OutputMissingBanner scope={verbScope} />
        {/* `UI-POLISH-01` G — an unlicensed channel's one line, in its own view only. */}
        <UnlicensedLine scope={verbScope} />
        {/*
          🔴 `CONSOLE-LOOK-06` DELTA R — THE REFUSAL SURFACE, and it is IN FLOW on purpose.

          It sits with the other banners rather than floating, because §4(c) is a hard
          requirement and not a preference: a refusal about a row must never hide that row nor
          the control that resolves it, and the toast it replaced did exactly that — it lay
          over the footer hint and a whole table row. An in-flow banner pushes the workspace
          down instead, so nothing it says can cost the operator the thing it is talking about.

          It renders NOTHING when no refusal stands, like every banner around it.
        */}
        <RefusalBanner scope={verbScope} />
        {/*
        R-028 part B — a RESIZABLE shell. The Inspector is a real column whose
        width the operator owns (dragged or nudged, clamped so neither side can
        reach zero, persisted per browser, resettable from the Layers header).
        Either panel can be taken fullscreen.

        Below `NARROW_BREAKPOINT_PX` the Inspector stops being a column at all
        and becomes an OVERLAY: on a small screen a squeezed Inspector makes
        both panels useless. See `useShellLayout` for why 900px.
      */}
        {/*
          THE CHANNEL SCOPE wraps the WHOLE workspace — the layer list, PROGRAM,
          PREVIEW and the Inspector — because all of them belong to the selected
          channel. The strip used to live inside the Layers panel, which scoped it
          to the layer list alone: selecting a second channel would have left the
          monitors showing the first one while the tab claimed otherwise.
        */}
        <ChannelScope>
          <LayerShortcutsListener
            layerDocument={floatingDocuments?.panels.get('layers')?.root.ownerDocument}
            panelDocuments={panelDocuments}
          />
          {nativePanels && (
            <>
              <FloatingPanelSurface panel="layers" compact={nativeLayersView === 'companion'}>
                {renderLayersPanel(nativeLayersView)}
              </FloatingPanelSurface>
              <FloatingPanelSurface panel="inspector">
                {renderInspector(
                  showMonitorInspectorCompanion
                    ? () => setMonitorCompanionMode('layer')
                    : closeInspector,
                )}
              </FloatingPanelSurface>
            </>
          )}
          {!nativePanels &&
            (!showWorkspace || (monitorFocused && !showMonitorLayerCompanion)) &&
            renderLayersPanel('shortcuts')}
          <div
            data-shell-inspector={splitInspector ? layout.positions.inspectorSide : undefined}
            style={{ ...styles.shell, gridTemplateColumns: shellColumns }}
          >
            {/* R-028 — the Library panel is GONE, not hidden: a template is no
            longer a thing parked in a side panel, so there is no side panel.
            Load lives on the row and does import+load in one action. */}
            {(showWorkspace || nativePanels) && (
              <section
                data-workspace-layer-position={layout.positions.layerPosition}
                data-monitor-companion={showMonitorCompanion ? '' : undefined}
                style={
                  !showWorkspace
                    ? { display: 'none' }
                    : showMonitorCompanion
                      ? {
                          ...styles.workspace,
                          display: 'grid',
                          gridTemplateColumns: showMonitorInspectorCompanion
                            ? inspectorLeft
                              ? 'min(42%, clamp(17rem, 25vw, 25rem)) minmax(0, 1fr)'
                              : 'minmax(0, 1fr) min(42%, clamp(17rem, 25vw, 25rem))'
                            : 'minmax(0, 1fr)',
                          gridTemplateRows: showMonitorLayerCompanion
                            ? layersAbove
                              ? 'auto minmax(0, 1fr)'
                              : 'minmax(0, 1fr) auto'
                            : 'minmax(0, 1fr)',
                        }
                      : styles.workspace
                }
              >
                {/* PGM / PREVIEW — reserved in their final positions. Hidden only
                when the LAYER LIST is the fullscreen panel; a fullscreen monitor is
                still the strip, showing one box.

                ⚠ CORRECTED 2026-09-07 (`STALE-CLAIMS-02` §4), and again 2026-09-24
                (`C-016`): PROGRAM shows the Playout's own return, relayed by the
                bridge, and says "No return signal" / "Return feed stalled" whenever
                it cannot vouch for a live picture; PREVIEW is `PreviewPanel`, a
                LOCAL browser render of every rehearsing row (R-022), with no link
                to be down. Neither is "black and labelled NOT CONNECTED".
                The hidden strip retains local rehearsal pages while PREVIEW has rows.
                Its picture subscriptions and PROGRAM returns are released while hidden. */}
                {(monitorsVisible || hasPreviewRows || nativePanels) && (
                  <>
                    <div
                      /* The toggle's `aria-controls` target and the specs' anchor. */
                      id="monitor-strip"
                      data-monitor-strip={monitorsVisible ? '' : undefined}
                      hidden={!monitorsVisible}
                      style={
                        /*
                          BOTH branches bound the width (`minWidth: 0` + a clip).
                          The rehearsal iframe is a real 1920px box — `transform`
                          scales its appearance, never its layout — so an unbounded
                          wrapper sizes itself to the iframe rather than to the
                          column. FULLSCREEN is not the safe case either: that is
                          where it pushed the panel's own EXIT control past the
                          right edge of the viewport, leaving no way back out of a
                          fullscreen whose focus is persisted across reloads.
                        */
                        !monitorsVisible
                          ? undefined
                          : monitorFocused || layersFloating
                            ? {
                                display: 'flex',
                                flex: 1,
                                minHeight: 0,
                                minWidth: 0,
                                overflow: 'hidden',
                                ...(showMonitorCompanion
                                  ? { gridColumn: companionColumn, gridRow: monitorRow }
                                  : {}),
                              }
                            : {
                                display: 'flex',
                                height: `${String(layout.monitorPx)}px`,
                                flexShrink: 0,
                                minWidth: 0,
                                overflow: 'hidden',
                              }
                      }
                    >
                      {/* R-022 — PVW follows the selection when the selected row is
                        rehearsing, so the preview and the Inspector agree about
                        which graphic the operator is working on. */}
                      <MonitorStrip
                        visible={monitorsVisible}
                        companionMode={monitorCompanionMode}
                        hasSelectedLayer={selected !== null}
                        playoutSignInUrl={
                          capabilities?.mode === 'playout' ? capabilities.signInUrl : undefined
                        }
                        selectedPreviewItem={selectedId}
                        onCompanionModeChange={setMonitorCompanionMode}
                        canEditPreviewPosition={canOperate}
                        onSelectPreviewItem={setSelectedId}
                      />
                    </div>
                    {/* The ordinary strip is resizable. A maximized monitor gets the
                        space left by its compact companion row. */}
                    {monitorsVisible && !monitorFocused && !layersFloating && (
                      <ShellDivider
                        orientation="horizontal"
                        invert={layersAbove}
                        value={layout.monitorPx}
                        onResize={layout.setMonitorPx}
                        label={localizeUi('Resize the monitor strip')}
                      />
                    )}
                  </>
                )}
                {!monitorFocused && (
                  <>
                    <div style={styles.chrome}>
                      {/* B-225 — the playout server stopped carrying what this console put
                        on air. Here rather than with the five top-of-page banners because it
                        names ROWS in the list below and offers to act on them; see the
                        component's own header for the full argument. Renders nothing unless
                        a reconnect actually took air away. */}
                      <EmptiedAirNotice notice={emptiedAir} scope={verbScope} />
                      <OrphanLayersBanner
                        orphans={inScope(orphans, (o) => o.channel, verbScope)}
                        ownedOccupancy={inScope(ownedOccupancy, (w) => w.channel, verbScope)}
                        clearedOutside={inScope(clearedOutside, (e) => e.channel, verbScope)}
                      />
                    </div>
                    {/* R-028 (4.1) — ONE layer list, replacing the Stack and Fixed
                    Layers panels, with the playout system's layers on their own tab. */}
                    {!layersFloating && dockLayers('layers')}
                  </>
                )}
                {showMonitorLayerCompanion && (
                  <div
                    data-monitor-layer-companion=""
                    style={{
                      display: 'flex',
                      minWidth: 0,
                      minHeight: 0,
                      overflow: 'hidden',
                      gridColumn: companionColumn,
                      gridRow: layersAbove ? '1' : '2',
                    }}
                  >
                    {dockLayers('companion')}
                  </div>
                )}
                {showMonitorInspectorCompanion && (
                  <div
                    data-monitor-inspector-companion=""
                    style={{
                      display: 'grid',
                      minWidth: 0,
                      minHeight: 0,
                      overflow: 'hidden',
                      gridColumn: inspectorLeft ? '1' : '2',
                      gridRow: '1 / -1',
                    }}
                  >
                    {dockInspector(() => setMonitorCompanionMode('layer'))}
                  </div>
                )}
              </section>
            )}
            {/* The divider only exists where there are two columns to divide — so it
                goes away with a CLOSED Inspector, not just with a fullscreen one. */}
            {splitInspector && (
              <ShellDivider
                orientation="vertical"
                invert={!inspectorLeft}
                value={layout.inspectorPx}
                onResize={layout.setInspectorPx}
                label={localizeUi('Resize the Inspector')}
              />
            )}
            {showInspectorColumn && dockInspector(closeInspector)}
          </div>
        </ChannelScope>
        {/*
        NARROW — the Inspector as an overlay.

        It is deliberately NOT full-screen: the panel is pinned to the right and
        the Layers list stays visible beside/behind it, so the operator can see
        what is ON AIR while editing its fields. Editing a live graphic is the
        NORMAL case here, not the edge case, and an overlay that hides the air
        state would make the operator work blind. Dismissing is also a single
        action (the backdrop, or the same hamburger).
      */}
        {layout.narrow && inspectorOpen && !inspectorFloating && !monitorFocused && (
          <>
            {/* The scrim DESELECTS rather than merely hiding — see `closeInspector`.
                Dismissing the editor and letting go of the row are one act, so the
                list can never keep claiming a selection with no editor behind it. */}
            <div
              style={styles.overlayScrim}
              onClick={closeInspector}
              aria-hidden="true"
              // A stable hook for the E2E. The scrim is `aria-hidden` by design (it is
              // a dismissal surface, not content), and every Icon in the app is too —
              // so `[aria-hidden]` alone cannot address it.
              data-inspector-scrim=""
            />
            <div
              className="cg-inspector-overlay"
              style={{
                ...styles.overlayPanel,
                ...(inspectorLeft && { left: 0, right: 'auto' }),
                /* FULLSCREEN on a narrow screen means the whole width. The default
                   right-pinned width deliberately leaves the Layers list visible so
                   the operator can see what is ON AIR while editing it — but when they
                   have explicitly asked for fullscreen, that trade is theirs to make,
                   and a fullscreen that only grew to 24rem would be a control that
                   visibly does almost nothing. Height is already the full viewport
                   (`top: 0; bottom: 0`). */
                ...(layout.focus === 'inspector' ? { width: '100%' } : {}),
              }}
            >
              {dockInspector(closeInspector)}
            </div>
          </>
        )}
        {/* `AUDIT-CLOSE-01` B1 — the two doors are in the app header now; this bar is
            STATUS, plus the two controls the reference draws nowhere (see its own note). */}
        {shellChromeVisible && (
          <StatusBar
            engines={engines}
            backupChannels={backupChannels}
            connectionMode={capabilities?.mode}
            programmeChannel={selectedChannel}
            playoutSignInUrl={capabilities?.signInUrl}
          />
        )}
        <CommandToast />
        {/* THE tooltip, mounted ONCE. Every control carrying a `title` inherits it
          by delegation — nothing new has to be wired, which is the point (see
          `ui/Tooltip.tsx`). */}
        <WorkspaceTooltip />
        <AuditPanel open={auditOpen} onClose={() => setAuditOpen(false)} />
        <StationSetupDialog
          open={stationSetup.open}
          section={stationSetup.section}
          requestId={stationSetup.requestId}
          onClose={closeStationSetup}
        />
        {/*
          `R-066` — ABOVE the lock, because the bridge refuses `lock.release` to a socket with
          no principal too: signing in is the outer gate and the PIN is the inner one, and the
          screen shows them in the order the bridge enforces. Renders nothing when auth is off.

          `DESKTOP-APPS-01` — while an installed station is in first-run, FIRST-RUN is the gate
          instead: its second step IS the sign-in, and two stacked gates would ask twice.
        */}
        {setupPhase !== null ? (
          <FirstRunScreen phase={setupPhase} signInUrl={capabilities?.signInUrl ?? null} />
        ) : (
          <div data-native-workspace-gate="">
            <SignInOverlay />
          </div>
        )}
        <LockOverlay
          engaged={lockCovers}
          {...(lock.engagedAt !== undefined ? { engagedAt: lock.engagedAt } : {})}
          {...(lock.reason !== undefined ? { reason: lock.reason } : {})}
          onRelease={(pin) => window.cg.lock.release({ pin })}
        />
        {/* `R-094` — no close on a slip: CG Control's window close, or the tab's leave prompt.
            Last, so its dialog (the `window` layer) sits above every gate rendered before it. */}
        <ConsoleCloseGuard items={items} />
      </main>
    </ShellLayoutProvider>
  );
  return (
    <LiveInputCheckProvider channel={viewChannel} locked={lockCovers}>
      <EngineNameContext.Provider value={engineName}>
        <FloatingWorkspaceProvider
          documents={floatingDocuments}
          layout={layout}
          sessionCovered={lockCovers || setupPhase !== null}
        >
          <LayerShortcutSessionProvider>{shell}</LayerShortcutSessionProvider>
        </FloatingWorkspaceProvider>
      </EngineNameContext.Provider>
    </LiveInputCheckProvider>
  );
}

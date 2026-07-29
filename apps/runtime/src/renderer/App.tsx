import { useEffect, useMemo, useState } from 'react';
import type { RuntimeBridge } from '../shared/runtime-bridge.js';
import { AuditPanel } from './features/audit/AuditPanel.js';
import { FailoverBanner } from './features/connections/FailoverBanner.js';
import { ConnectionBanner } from './features/status/ConnectionBanner.js';
import { ServerSettingsPanel } from './features/connections/ServerSettingsPanel.js';
import { OrphanLayersBanner } from './features/layers/OrphanLayersBanner.js';
import { LayersPanel } from './features/layers/LayersPanel.js';
import { ShellDivider } from './ui/ShellDivider.js';
import { useShellLayout } from './hooks/useShellLayout.js';
import { Inspector } from './features/inspector/Inspector.js';
import { applyDraft } from './features/inspector/applyDraft.js';
import { clearDraft } from './features/inspector/draftStore.js';
import { LockOverlay } from './features/lock/LockOverlay.js';
import { CommandToast } from './features/status/CommandToast.js';
import { StatusBar } from './features/status/StatusBar.js';
import { useConnections } from './hooks/useConnections.js';
import { useLink } from './hooks/useLink.js';
import { useLock } from './hooks/useLock.js';
import { useOrphans } from './hooks/useOrphans.js';
import { useOwnedOccupancy } from './hooks/useOwnedOccupancy.js';
import { useStack } from './hooks/useStack.js';
import { appShell } from './layout.js';

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
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    // An input with no `type` is a text input.
    return TEXTUAL_INPUT_TYPES.has(target.type === '' ? 'text' : target.type);
  }
  // `=== true`, not a bare return: `isContentEditable` is not implemented everywhere (jsdom
  // leaves it undefined), and a falsy-but-not-false result must still mean "suppress".
  return target.isContentEditable === true;
}

export function App(): JSX.Element {
  const items = useStack();
  const lock = useLock();
  const health = useConnections();
  const link = useLink();
  const orphans = useOrphans();
  const ownedOccupancy = useOwnedOccupancy();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // R-028 part B — the operator's own workspace geometry (persisted per browser).
  const layout = useShellLayout();
  const [inspectorOverlayOpen, setInspectorOverlayOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selected = useMemo(
    () => items.find((i) => i.itemId === selectedId) ?? null,
    [items, selectedId],
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
    window.addEventListener('contextmenu', suppressNativeMenu);
    return () => window.removeEventListener('contextmenu', suppressNativeMenu);
  }, []);

  // Narrow: one column, the Inspector is an overlay. Fullscreen: the focused
  // panel takes everything. Otherwise: workspace | divider | Inspector.
  const showInspectorColumn = !layout.narrow && layout.focus !== 'layers';
  const shellColumns = layout.narrow
    ? '1fr'
    : layout.focus === 'layers'
      ? '1fr'
      : layout.focus === 'inspector'
        ? '1fr'
        : `1fr 6px ${String(layout.inspectorPx)}px`;

  // Selecting a row on a narrow screen brings the Inspector up — the operator
  // asked to inspect something, so showing it is the point.
  useEffect(() => {
    if (layout.narrow && selectedId !== null) setInspectorOverlayOpen(true);
  }, [layout.narrow, selectedId]);

  return (
    <main style={styles.page}>
      {/* R-006 — a not-live link means NOTHING can reach air. That is a full-width alert,
          not a pill: the pill lost to the green HEALTHY pill beside it, and the operator
          believed a graphic was on air. Renders nothing when the link is live. */}
      <ConnectionBanner />
      {/* R-006 — the failover banner describes REAL servers. In test mode there are none,
          and the mock now honestly reports them `disconnected`, so it would shout
          "PRIMARY A unhealthy" about hardware that does not exist — new noise, and a fresh
          implication that a real server is out there, broken. The TEST MODE banner is the
          truth in that mode and supersedes it. */}
      {link !== 'offline-mock' && <FailoverBanner health={health} />}
      {/*
        R-028 part B — a RESIZABLE shell. The Inspector is a real column whose
        width the operator owns (dragged or nudged, clamped so neither side can
        reach zero, persisted per browser, resettable from the Layers header).
        Either panel can be taken fullscreen.

        Below `NARROW_BREAKPOINT_PX` the Inspector stops being a column at all
        and becomes an OVERLAY: on a small screen a squeezed Inspector makes
        both panels useless. See `useShellLayout` for why 900px.
      */}
      <div style={{ ...styles.shell, gridTemplateColumns: shellColumns }}>
        {/* R-028 — the Library panel is GONE, not hidden: a template is no
            longer a thing parked in a side panel, so there is no side panel.
            Load lives on the row and does import+load in one action. */}
        {layout.focus !== 'inspector' && (
          <section style={styles.workspace}>
            <div style={styles.monitor}>
              PVW / PGM monitor strip will live here. Full monitor with frame grabs is M9.
            </div>
            <div style={styles.chrome}>
              <OrphanLayersBanner orphans={orphans} ownedOccupancy={ownedOccupancy} />
            </div>
            {/* R-028 (4.1) — ONE layer list, replacing the Stack and Fixed
                Layers panels, with the playout system's layers on their own tab. */}
            <LayersPanel
              onSelectionChange={setSelectedId}
              selectedId={selectedId}
              layout={layout}
              inspectorOpen={inspectorOverlayOpen}
              onToggleInspector={() => setInspectorOverlayOpen((open) => !open)}
              onUpdate={(id) => {
                const target = items.find((i) => i.itemId === id);
                return target !== undefined
                  ? applyDraft(target)
                  : Promise.resolve({ accepted: false });
              }}
            />
          </section>
        )}
        {/* The divider only exists where there are two columns to divide. */}
        {!layout.narrow && layout.focus === 'none' && (
          <ShellDivider inspectorPx={layout.inspectorPx} onResize={layout.setInspectorPx} />
        )}
        {showInspectorColumn && (
          <Inspector
            item={selected}
            onApply={(id) => {
              const target = items.find((i) => i.itemId === id);
              return target !== undefined
                ? applyDraft(target)
                : Promise.resolve({ accepted: false });
            }}
            onDiscard={(id) => clearDraft(id)}
          />
        )}
      </div>
      {/*
        NARROW — the Inspector as an overlay.

        It is deliberately NOT full-screen: the panel is pinned to the right and
        the Layers list stays visible beside/behind it, so the operator can see
        what is ON AIR while editing its fields. Editing a live graphic is the
        NORMAL case here, not the edge case, and an overlay that hides the air
        state would make the operator work blind. Dismissing is also a single
        action (the backdrop, or the same hamburger).
      */}
      {layout.narrow && inspectorOverlayOpen && (
        <>
          <div
            style={styles.overlayScrim}
            onClick={() => setInspectorOverlayOpen(false)}
            aria-hidden="true"
          />
          <div style={styles.overlayPanel}>
            <Inspector
              item={selected}
              onApply={(id) => {
                const target = items.find((i) => i.itemId === id);
                return target !== undefined
                  ? applyDraft(target)
                  : Promise.resolve({ accepted: false });
              }}
              onDiscard={(id) => clearDraft(id)}
            />
          </div>
        </>
      )}
      <StatusBar
        onOpenAudit={() => setAuditOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <CommandToast />
      <AuditPanel open={auditOpen} onClose={() => setAuditOpen(false)} />
      <ServerSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <LockOverlay
        engaged={lock.engaged}
        {...(lock.engagedAt !== undefined ? { engagedAt: lock.engagedAt } : {})}
        {...(lock.reason !== undefined ? { reason: lock.reason } : {})}
        onRelease={(pin) => window.cg.lock.release({ pin })}
      />
    </main>
  );
}

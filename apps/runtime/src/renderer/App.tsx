import { useEffect, useMemo, useState } from 'react';
import type { RuntimeBridge } from '../shared/runtime-bridge.js';
import { AuditPanel } from './features/audit/AuditPanel.js';
import { FailoverBanner } from './features/connections/FailoverBanner.js';
import { ConnectionBanner } from './features/status/ConnectionBanner.js';
import { ServerSettingsPanel } from './features/connections/ServerSettingsPanel.js';
import { LibraryPanel } from './features/library/LibraryPanel.js';
import { OrphanLayersBanner } from './features/layers/OrphanLayersBanner.js';
import { StackPanel } from './features/stack/StackPanel.js';
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
      <div style={styles.shell}>
        <LibraryPanel />
        <section style={styles.workspace}>
          <div style={styles.monitor}>
            PVW / PGM monitor strip will live here. Full monitor with frame grabs is M9.
          </div>
          <div style={styles.chrome}>
            <OrphanLayersBanner orphans={orphans} ownedOccupancy={ownedOccupancy} />
          </div>
          <StackPanel onSelectionChange={setSelectedId} />
        </section>
        <Inspector
          item={selected}
          onApply={(id) => {
            const target = items.find((i) => i.itemId === id);
            return target !== undefined ? applyDraft(target) : Promise.resolve({ accepted: false });
          }}
          onDiscard={(id) => clearDraft(id)}
        />
      </div>
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

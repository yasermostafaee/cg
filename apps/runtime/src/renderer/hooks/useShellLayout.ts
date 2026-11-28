import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FLOATING_PANEL_IDS,
  FloatingPanelPlacementSchema,
  readFloatingPanelPlacements,
  sameFloatingPanelPlacement,
  type FloatingPanelId,
  type FloatingPanelPlacement,
  type FloatingPanelPlacements,
} from '../../shared/floating-panels.js';

/**
 * R-028 part B — the operator's own workspace geometry: how wide the Inspector
 * is, how tall the monitor strip is, whether one panel is taken fullscreen, and
 * whether the viewport is narrow enough that the Inspector becomes an overlay.
 *
 * THE BREAKPOINT: 900px. Chosen when the shell's default was a 1fr workspace
 * beside a 320px Inspector, and the Layers row needs roughly 520px before its
 * verb buttons start wrapping under the template name — 900 is the first round
 * number that keeps a usable row AND a usable Inspector side by side. Below it
 * the Inspector cannot be useful as a column, so it becomes an overlay instead
 * of being squeezed. Recorded under "Decisions taken fast" in the change's
 * DEBT.md. (The default is 396 now — `RUNTIME-REDESIGN-01` Phase 5, below — and
 * the breakpoint was NOT re-derived: between 900 and 1016 `clampInspector`
 * already gives the workspace its floor and the Inspector what is left.)
 *
 * PERSISTENCE is per browser (`localStorage`), because it is a per-operator
 * preference about their own screen, not shared state — two operators on one
 * bridge should not fight over each other's panel widths. It is deliberately
 * NOT in the bridge config for the same reason.
 *
 * THE ESCAPE HATCH is not optional. An operator who drags a panel to nothing at
 * 2 a.m. must not be stuck: the width is CLAMPED so neither panel can reach
 * zero, and `reset()` restores the default from a control that is always
 * reachable in the header.
 */

const STORAGE_KEY = 'cg.runtime.shell-layout.v1';

/** Below this viewport width the Inspector stops being a column. */
export const NARROW_BREAKPOINT_PX = 900;

/*
 * `RUNTIME-REDESIGN-01` PHASE 5 — THE DEFAULTS ARE THE REFERENCE'S, THE CONSTRAINTS ARE OURS.
 *
 * The deletion guard's own rule for this shell (design.md §3, item 19): _the reference's
 * geometry supplies the default sizes, not the constraint._ Both numbers below were READ off
 * `05-row-inspector.html` / `06-preview-program.html` in Chromium at 1280 × 800 (§12.3), never
 * off the stylesheet — `.inspector` is restated 33 times in that file and `.monitors` three,
 * and only the last restatement paints (`PROMPT.md` §0). The clamps, the floors, the narrow
 * breakpoint, the persisted key and the drag are untouched.
 */

/**
 * The Inspector's default column width — the reference's `.control-grid.with-inspector`
 * renders `minmax(0,1fr) 396px`. (It was 320, the pre-R-028 shell's.)
 */
export const DEFAULT_INSPECTOR_PX = 396;

/**
 * The monitor strip's default height — the reference's `#monitor-area .pvw-revision` renders
 * two 230 px monitors side by side. (It was 180: the PVW stage came out 86 px tall.)
 */
export const DEFAULT_MONITOR_PX = 230;

/**
 * 🔴 `MONITORS-01` — WHETHER THE STRIP IS UP WHEN THE CONSOLE BOOTS. **Hidden.**
 *
 * ONE HOME, because there are three readers — the hook's initial state, its `reset()`, and
 * `shellLayoutContext`'s no-provider stand-in — and two agreeing copies of a boot decision is
 * how one of them comes to be wrong (this file already carries that lesson about 320 / 180).
 * The full argument is in `design.md` §19. The short form
 * is that neither box is confidence monitoring, so neither earns 247.2 px of the layer list
 * before the operator has asked for it.
 *
 * ⚠ This is the DEFAULT, not the persistence rule. A13 / `R-060` says the flag is never
 * persisted, and that is still true here in both directions — see `design.md` §19.1 for why
 * the two are separate questions and why this is not A13 being overturned.
 */
export const DEFAULT_MONITOR_VISIBILITY: MonitorVisibility = { pvw: false, pgm: false };

/**
 * Hard floors, so a drag can never make either panel unusable. The Inspector's
 * floor is a readable field editor; the workspace's is a layer row that still
 * shows its verbs.
 *
 * THE WORKSPACE FLOOR IS DERIVED, NOT GUESSED. It is the narrow-mode Layers row
 * at its most compressed — the row-number, state and alias columns plus the
 * five icon-only verbs at their minimum hit target — measured from
 * `layerTable.ts`'s own declared widths, so the two cannot drift apart. Before
 * the verbs collapsed to icons the row wanted ~700px and this floor was 420,
 * which is exactly how a drag to the floor produced a clipped verb block and a
 * horizontally-scrolling list.
 */
const MIN_INSPECTOR_PX = 240;
export const MIN_WORKSPACE_PX = 620;

/** The monitor strip's floor and ceiling — it must never eat the layer list. */
const MIN_MONITOR_PX = 96;
const MAX_MONITOR_FRACTION = 0.55;

/** The same panels can take main-window focus or move to another native window. */
export type PanelId = FloatingPanelId;

export type ShellFocus = 'none' | PanelId;

export type MonitorId = Extract<PanelId, 'pgm' | 'pvw'>;
export type MonitorVisibility = Readonly<Record<MonitorId, boolean>>;

export interface WorkspacePositions {
  monitorOrder: 'pvw-first' | 'pgm-first';
  layerPosition: 'below' | 'above';
  inspectorSide: 'right' | 'left';
  layerGroups?: 'side-by-side' | undefined;
}

export const DEFAULT_WORKSPACE_POSITIONS: Readonly<WorkspacePositions> = {
  monitorOrder: 'pvw-first',
  layerPosition: 'below',
  inspectorSide: 'right',
};

export interface WorkspaceProfile {
  name: string;
  positions: WorkspacePositions;
  inspectorPx: number;
  monitorPx: number;
  floatingPanels?: FloatingPanelPlacements;
}

export const WORKSPACE_PROFILE_NAME_MAX = 60;

export interface ConfigurableShellLayout extends ShellLayout {
  positions: WorkspacePositions;
  uiProfiles: readonly WorkspaceProfile[];
  /** Detached panels and their native window restore bounds. */
  floatingPanels: Readonly<FloatingPanelPlacements>;
  setFloatingPanel: (panel: PanelId, placement: FloatingPanelPlacement | null) => void;
  setPositions: (positions: Partial<WorkspacePositions>) => void;
  saveProfile: (name: string) => Promise<void>;
  loadProfile: (name: string) => void;
  deleteProfile: (name: string) => void;
}

export interface ShellLayout {
  /** Inspector column width in px (ignored while narrow or focused). */
  inspectorPx: number;
  /** Monitor strip height in px (ignored while a panel is focused). */
  monitorPx: number;
  /** Which panel, if any, is taken fullscreen. */
  focus: ShellFocus;
  /** True when the viewport is too narrow for a side-by-side Inspector. */
  narrow: boolean;
  /** R-060 and R-129: session visibility of each docked monitor, independent of focus. */
  monitorVisibility: MonitorVisibility;
  setInspectorPx: (px: number) => void;
  setMonitorPx: (px: number) => void;
  setFocus: (focus: ShellFocus) => void;
  /** Set both monitors together, or just the specified monitor. */
  setMonitorsShown: (shown: boolean, monitor?: MonitorId) => void;
  /** Back to the shipped default — the way out of any mess. */
  reset: () => void;
  /** Has the operator changed anything from the default? */
  customized: boolean;
}

interface Persisted {
  inspectorPx?: number;
  monitorPx?: number;
  focus?: ShellFocus;
  positions?: WorkspacePositions;
  uiProfiles?: WorkspaceProfile[];
  floatingPanels?: FloatingPanelPlacements;
}

type SavedWorkspace = Required<Persisted>;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positionsOf(value: unknown): WorkspacePositions {
  const { monitorOrder, layerPosition, inspectorSide, layerGroups } = record(value);
  return {
    monitorOrder:
      monitorOrder === 'pgm-first' ? monitorOrder : DEFAULT_WORKSPACE_POSITIONS.monitorOrder,
    layerPosition:
      layerPosition === 'above' ? layerPosition : DEFAULT_WORKSPACE_POSITIONS.layerPosition,
    inspectorSide:
      inspectorSide === 'left' ? inspectorSide : DEFAULT_WORKSPACE_POSITIONS.inspectorSide,
    ...(layerGroups === 'side-by-side' && { layerGroups }),
  };
}

function isDefaultPosition({
  monitorOrder,
  layerPosition,
  inspectorSide,
  layerGroups,
}: WorkspacePositions): boolean {
  const defaults = DEFAULT_WORKSPACE_POSITIONS;
  return (
    monitorOrder === defaults.monitorOrder &&
    layerPosition === defaults.layerPosition &&
    inspectorSide === defaults.inspectorSide &&
    layerGroups === undefined
  );
}

function finiteSize(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function profilesOf(value: unknown): WorkspaceProfile[] {
  if (!Array.isArray(value)) return [];
  const profiles = new Map<string, WorkspaceProfile>();
  for (const entry of value) {
    const { name, positions, inspectorPx, monitorPx, floatingPanels } = record(entry);
    if (typeof name !== 'string' || name.trim() === '' || name.length > WORKSPACE_PROFILE_NAME_MAX)
      continue;
    const placements = readFloatingPanelPlacements(floatingPanels);
    profiles.set(name.trim(), {
      name: name.trim(),
      positions: positionsOf(positions),
      inspectorPx: finiteSize(inspectorPx, DEFAULT_INSPECTOR_PX),
      monitorPx: finiteSize(monitorPx, DEFAULT_MONITOR_PX),
      ...(Object.keys(placements).length > 0 && { floatingPanels: placements }),
    });
  }
  return [...profiles.values()];
}

function readPersisted(): Record<string, unknown> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return {};
    return record(JSON.parse(raw));
  } catch {
    // A corrupt or unavailable store must never break the shell — the default
    // layout is always usable.
    return {};
  }
}

function read(): SavedWorkspace {
  const { inspectorPx, monitorPx, focus, positions, uiProfiles, floatingPanels } = readPersisted();
  const placements = readFloatingPanelPlacements(floatingPanels);
  const focusedPanel =
    focus === 'inspector' || focus === 'layers' || focus === 'pgm' || focus === 'pvw'
      ? focus
      : 'none';
  return {
    inspectorPx: finiteSize(inspectorPx, DEFAULT_INSPECTOR_PX),
    monitorPx: finiteSize(monitorPx, DEFAULT_MONITOR_PX),
    focus:
      focusedPanel !== 'none' && placements[focusedPanel] !== undefined ? 'none' : focusedPanel,
    positions: positionsOf(positions),
    uiProfiles: profilesOf(uiProfiles),
    floatingPanels: placements,
  };
}

function write({
  inspectorPx,
  monitorPx,
  focus,
  positions,
  uiProfiles,
  floatingPanels,
}: SavedWorkspace): void {
  const persisted: Persisted = {
    inspectorPx,
    monitorPx,
    focus,
    ...(!isDefaultPosition(positions) && { positions }),
    ...(uiProfiles.length > 0 && { uiProfiles }),
    ...(Object.keys(floatingPanels).length > 0 && { floatingPanels }),
  };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    /* private mode / quota — the layout simply does not persist */
  }
}

/** Clamp a requested width so BOTH panels stay usable at this viewport size. */
export function clampInspector(px: number, viewportPx: number): number {
  const maxByWorkspace = Math.max(MIN_INSPECTOR_PX, viewportPx - MIN_WORKSPACE_PX);
  return Math.min(Math.max(px, MIN_INSPECTOR_PX), maxByWorkspace);
}

/**
 * Clamp the monitor strip's height. The ceiling is a FRACTION of the viewport
 * rather than a constant: the invariant that matters is that the layer list — the
 * only surface that says what is on air — keeps most of the column, and on a
 * 2160px gallery display a 600px constant would not express that at all.
 */
export function clampMonitor(px: number, viewportHeightPx: number): number {
  const ceiling = Math.max(MIN_MONITOR_PX, Math.round(viewportHeightPx * MAX_MONITOR_FRACTION));
  return Math.min(Math.max(px, MIN_MONITOR_PX), ceiling);
}

export function useShellLayout(): ConfigurableShellLayout {
  const [saved, setSaved] = useState(read);
  const savedRef = useRef(saved);
  const { inspectorPx, monitorPx, focus, positions, uiProfiles, floatingPanels } = saved;
  const update = useCallback((patch: Partial<SavedWorkspace>) => {
    const next = { ...savedRef.current, ...patch };
    savedRef.current = next;
    setSaved(next);
    write(next);
  }, []);
  const [monitorVisibility, setMonitorVisibility] = useState(DEFAULT_MONITOR_VISIBILITY);
  const setMonitorsShown = useCallback((shown: boolean, monitor?: MonitorId) => {
    setMonitorVisibility((current) =>
      monitor === undefined ? { pvw: shown, pgm: shown } : { ...current, [monitor]: shown },
    );
  }, []);
  const [viewportPx, setViewportPx] = useState(() => globalThis.innerWidth ?? 1280);
  const [viewportHeightPx, setViewportHeightPx] = useState(() => globalThis.innerHeight ?? 800);

  useEffect(() => {
    const onResize = (): void => {
      setViewportPx(globalThis.innerWidth ?? 1280);
      setViewportHeightPx(globalThis.innerHeight ?? 800);
    };
    globalThis.addEventListener?.('resize', onResize);
    return () => globalThis.removeEventListener?.('resize', onResize);
  }, []);

  const setInspectorPx = useCallback(
    (px: number) => {
      update({ inspectorPx: clampInspector(px, viewportPx) });
    },
    [viewportPx, update],
  );

  const setMonitorPx = useCallback(
    (px: number) => {
      update({ monitorPx: clampMonitor(px, viewportHeightPx) });
    },
    [viewportHeightPx, update],
  );

  const setFocus = useCallback(
    (next: ShellFocus) => {
      if (next !== 'none' && savedRef.current.floatingPanels[next] !== undefined) return;
      update({ focus: next });
    },
    [update],
  );

  const setFloatingPanel = useCallback(
    (panel: PanelId, placement: FloatingPanelPlacement | null) => {
      const current = savedRef.current;
      const panels = { ...current.floatingPanels };
      if (placement === null) {
        if (panels[panel] === undefined) return;
        delete panels[panel];
        update({ floatingPanels: panels });
        return;
      }
      const parsed = FloatingPanelPlacementSchema.safeParse(placement);
      if (!parsed.success || sameFloatingPanelPlacement(panels[panel], parsed.data)) return;
      panels[panel] = parsed.data;
      update({
        floatingPanels: panels,
        ...(current.focus === panel && { focus: 'none' }),
      });
    },
    [update],
  );

  const setPositions = (change: Partial<WorkspacePositions>): void =>
    update({ positions: { ...savedRef.current.positions, ...change } });

  const saveProfile = async (value: string): Promise<void> => {
    const name = value.trim();
    if (name.length === 0 || name.length > WORKSPACE_PROFILE_NAME_MAX) return;
    const { inspectorPx, monitorPx, positions, floatingPanels } = savedRef.current;
    const placements = { ...floatingPanels };
    const native = window.cg?.floatingPanels;
    if (native != null && Object.keys(placements).length > 0) {
      // Query the native restore bounds at the save, even if the layout has not
      // received the latest move, resize or maximize state yet.
      await Promise.all(
        FLOATING_PANEL_IDS.map(async (panel) => {
          if (placements[panel] === undefined) return;
          try {
            const actual = FloatingPanelPlacementSchema.safeParse(await native.placement(panel));
            if (actual.success) placements[panel] = actual.data;
          } catch {
            // A window can disappear while being queried. Retain its known geometry.
          }
        }),
      );
    }
    const profile = {
      name,
      inspectorPx,
      monitorPx,
      positions,
      ...(Object.keys(placements).length > 0 && { floatingPanels: placements }),
    };
    update({
      uiProfiles: [...savedRef.current.uiProfiles.filter((entry) => entry.name !== name), profile],
    });
  };

  const loadProfile = (name: string): void => {
    const profile = savedRef.current.uiProfiles.find((entry) => entry.name === name);
    if (profile !== undefined) {
      const panels = profile.floatingPanels ?? {};
      const currentFocus = savedRef.current.focus;
      update({
        inspectorPx: profile.inspectorPx,
        monitorPx: profile.monitorPx,
        positions: profile.positions,
        floatingPanels: panels,
        ...(currentFocus !== 'none' && panels[currentFocus] !== undefined && { focus: 'none' }),
      });
    }
  };

  const deleteProfile = (name: string): void =>
    update({ uiProfiles: savedRef.current.uiProfiles.filter((entry) => entry.name !== name) });

  const reset = useCallback(() => {
    setMonitorVisibility(DEFAULT_MONITOR_VISIBILITY);
    update({
      inspectorPx: DEFAULT_INSPECTOR_PX,
      monitorPx: DEFAULT_MONITOR_PX,
      focus: 'none',
      positions: DEFAULT_WORKSPACE_POSITIONS,
      floatingPanels: {},
    });
  }, [update]);

  return {
    positions,
    uiProfiles,
    setPositions,
    saveProfile,
    loadProfile,
    deleteProfile,
    inspectorPx: clampInspector(inspectorPx, viewportPx),
    monitorPx: clampMonitor(monitorPx, viewportHeightPx),
    focus,
    floatingPanels,
    setFloatingPanel,
    narrow: viewportPx < NARROW_BREAKPOINT_PX,
    monitorVisibility,
    setInspectorPx,
    setMonitorPx,
    setFocus,
    setMonitorsShown,
    reset,
    customized:
      inspectorPx !== DEFAULT_INSPECTOR_PX ||
      monitorPx !== DEFAULT_MONITOR_PX ||
      focus !== 'none' ||
      !isDefaultPosition(positions) ||
      Object.keys(floatingPanels).length > 0 ||
      monitorVisibility.pvw !== DEFAULT_MONITOR_VISIBILITY.pvw ||
      monitorVisibility.pgm !== DEFAULT_MONITOR_VISIBILITY.pgm,
  };
}

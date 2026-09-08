import { useCallback, useEffect, useState } from 'react';

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

/**
 * Every panel that can be taken fullscreen. Adding a panel means adding it HERE
 * and rendering it inside `Panel` — the fullscreen affordance then comes for
 * free, which is the point (a per-panel button is how the Inspector ended up
 * without one).
 */
export type PanelId = 'layers' | 'inspector' | 'pgm' | 'pvw';

export type ShellFocus = 'none' | PanelId;

export interface ShellLayout {
  /** Inspector column width in px (ignored while narrow or focused). */
  inspectorPx: number;
  /** Monitor strip height in px (ignored while a panel is focused). */
  monitorPx: number;
  /** Which panel, if any, is taken fullscreen. */
  focus: ShellFocus;
  /** True when the viewport is too narrow for a side-by-side Inspector. */
  narrow: boolean;
  /**
   * 🔴 `RUNTIME-REDESIGN-01` PHASE 5 — ARE THE MONITORS SHOWN? The third of three things
   * `PROMPT.md` §5 keeps independent: which row is SELECTED, which rows are IN PVW, and
   * whether the monitors are SHOWN. The reference has a `Show monitors` / `Hide monitors`
   * toggle (`aria-expanded`, `aria-controls="monitor-area"`); before this the app's only way
   * to hide the strip was the Layers panel's FULLSCREEN, which also takes the Inspector
   * column away — that is "monitors hidden" coupled to "editor hidden", the coupling §5 says
   * is the easiest mistake in the phase. This flag is that toggle, and nothing else reads or
   * writes it: not the selection, not the rehearse set.
   *
   * ⚠ SESSION STATE, NOT PERSISTED — deliberately, and not for lack of a slot. Phase 5's
   * constraint is _no persisted key, file or schema change_; this hook's `write()` keeps its
   * `{inspectorPx, monitorPx, focus}` shape. Whether the flag should join it under
   * `cg.runtime.shell-layout.v1` is filed for the owner (design.md §12.7). The default is
   * SHOWN: PVW is the operator's last look before air, and a console that booted with it
   * folded away would have deleted a safety surface by default.
   */
  monitorsShown: boolean;
  setInspectorPx: (px: number) => void;
  setMonitorPx: (px: number) => void;
  setFocus: (focus: ShellFocus) => void;
  setMonitorsShown: (shown: boolean) => void;
  /** Back to the shipped default — the way out of any mess. */
  reset: () => void;
  /** Has the operator changed anything from the default? */
  customized: boolean;
}

interface Persisted {
  inspectorPx?: number;
  monitorPx?: number;
  focus?: ShellFocus;
}

function read(): Persisted {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Persisted;
  } catch {
    // A corrupt or unavailable store must never break the shell — the default
    // layout is always usable.
    return {};
  }
}

function write(value: Persisted): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
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

export function useShellLayout(): ShellLayout {
  const persisted = read();
  const [inspectorPx, setInspectorPxRaw] = useState(persisted.inspectorPx ?? DEFAULT_INSPECTOR_PX);
  const [monitorPx, setMonitorPxRaw] = useState(persisted.monitorPx ?? DEFAULT_MONITOR_PX);
  const [focus, setFocusRaw] = useState<ShellFocus>(persisted.focus ?? 'none');
  // Session-only — see the interface note. NOT read from `persisted`, NOT written by `write()`.
  const [monitorsShown, setMonitorsShown] = useState(true);
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
      const clamped = clampInspector(px, viewportPx);
      setInspectorPxRaw(clamped);
      write({ inspectorPx: clamped, monitorPx, focus });
    },
    [viewportPx, monitorPx, focus],
  );

  const setMonitorPx = useCallback(
    (px: number) => {
      const clamped = clampMonitor(px, viewportHeightPx);
      setMonitorPxRaw(clamped);
      write({ inspectorPx, monitorPx: clamped, focus });
    },
    [viewportHeightPx, inspectorPx, focus],
  );

  const setFocus = useCallback(
    (next: ShellFocus) => {
      setFocusRaw(next);
      write({ inspectorPx, monitorPx, focus: next });
    },
    [inspectorPx, monitorPx],
  );

  const reset = useCallback(() => {
    setInspectorPxRaw(DEFAULT_INSPECTOR_PX);
    setMonitorPxRaw(DEFAULT_MONITOR_PX);
    setFocusRaw('none');
    // The way out covers the monitors too: a strip folded away at 2 a.m. comes back with
    // everything else, and the persisted shape written here is unchanged.
    setMonitorsShown(true);
    write({ inspectorPx: DEFAULT_INSPECTOR_PX, monitorPx: DEFAULT_MONITOR_PX, focus: 'none' });
  }, []);

  return {
    inspectorPx: clampInspector(inspectorPx, viewportPx),
    monitorPx: clampMonitor(monitorPx, viewportHeightPx),
    focus,
    narrow: viewportPx < NARROW_BREAKPOINT_PX,
    monitorsShown,
    setInspectorPx,
    setMonitorPx,
    setFocus,
    setMonitorsShown,
    reset,
    customized:
      inspectorPx !== DEFAULT_INSPECTOR_PX ||
      monitorPx !== DEFAULT_MONITOR_PX ||
      focus !== 'none' ||
      !monitorsShown,
  };
}

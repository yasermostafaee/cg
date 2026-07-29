import { useCallback, useEffect, useState } from 'react';

/**
 * R-028 part B — the operator's own workspace geometry: how wide the Inspector
 * is, how tall the monitor strip is, whether one panel is taken fullscreen, and
 * whether the viewport is narrow enough that the Inspector becomes an overlay.
 *
 * THE BREAKPOINT: 900px. Chosen because the shell's default is a 1fr workspace
 * beside a 320px Inspector, and the Layers row needs roughly 520px before its
 * verb buttons start wrapping under the template name — 900 is the first round
 * number that keeps a usable row AND a usable Inspector side by side. Below it
 * the Inspector cannot be useful as a column, so it becomes an overlay instead
 * of being squeezed. Recorded under "Decisions taken fast" in the change's
 * DEBT.md.
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

/** The Inspector's default column width, matching the pre-R-028 shell. */
export const DEFAULT_INSPECTOR_PX = 320;

/** The monitor strip's default height — two 16:9 boxes side by side, small. */
export const DEFAULT_MONITOR_PX = 180;

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
  setInspectorPx: (px: number) => void;
  setMonitorPx: (px: number) => void;
  setFocus: (focus: ShellFocus) => void;
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
    write({ inspectorPx: DEFAULT_INSPECTOR_PX, monitorPx: DEFAULT_MONITOR_PX, focus: 'none' });
  }, []);

  return {
    inspectorPx: clampInspector(inspectorPx, viewportPx),
    monitorPx: clampMonitor(monitorPx, viewportHeightPx),
    focus,
    narrow: viewportPx < NARROW_BREAKPOINT_PX,
    setInspectorPx,
    setMonitorPx,
    setFocus,
    reset,
    customized:
      inspectorPx !== DEFAULT_INSPECTOR_PX || monitorPx !== DEFAULT_MONITOR_PX || focus !== 'none',
  };
}

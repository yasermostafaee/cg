import { useCallback, useEffect, useState } from 'react';

/**
 * R-028 part B — the operator's own workspace geometry: how wide the Inspector
 * is, whether one panel is taken fullscreen, and whether the viewport is narrow
 * enough that the Inspector becomes an overlay.
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

/**
 * Hard floors, so a drag can never make either panel unusable. The Inspector's
 * floor is a readable field editor; the workspace's is a layer row that still
 * shows its verbs.
 */
const MIN_INSPECTOR_PX = 240;
const MIN_WORKSPACE_PX = 420;

export type ShellFocus = 'none' | 'layers' | 'inspector';

export interface ShellLayout {
  /** Inspector column width in px (ignored while narrow or focused). */
  inspectorPx: number;
  /** Which panel, if any, is taken fullscreen. */
  focus: ShellFocus;
  /** True when the viewport is too narrow for a side-by-side Inspector. */
  narrow: boolean;
  setInspectorPx: (px: number) => void;
  setFocus: (focus: ShellFocus) => void;
  /** Back to the shipped default — the way out of any mess. */
  reset: () => void;
  /** Has the operator changed anything from the default? */
  customized: boolean;
}

interface Persisted {
  inspectorPx?: number;
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

export function useShellLayout(): ShellLayout {
  const persisted = read();
  const [inspectorPx, setInspectorPxRaw] = useState(persisted.inspectorPx ?? DEFAULT_INSPECTOR_PX);
  const [focus, setFocusRaw] = useState<ShellFocus>(persisted.focus ?? 'none');
  const [viewportPx, setViewportPx] = useState(() => globalThis.innerWidth ?? 1280);

  useEffect(() => {
    const onResize = (): void => setViewportPx(globalThis.innerWidth ?? 1280);
    globalThis.addEventListener?.('resize', onResize);
    return () => globalThis.removeEventListener?.('resize', onResize);
  }, []);

  const setInspectorPx = useCallback(
    (px: number) => {
      const clamped = clampInspector(px, viewportPx);
      setInspectorPxRaw(clamped);
      write({ inspectorPx: clamped, focus });
    },
    [viewportPx, focus],
  );

  const setFocus = useCallback(
    (next: ShellFocus) => {
      setFocusRaw(next);
      write({ inspectorPx, focus: next });
    },
    [inspectorPx],
  );

  const reset = useCallback(() => {
    setInspectorPxRaw(DEFAULT_INSPECTOR_PX);
    setFocusRaw('none');
    write({ inspectorPx: DEFAULT_INSPECTOR_PX, focus: 'none' });
  }, []);

  return {
    inspectorPx: clampInspector(inspectorPx, viewportPx),
    focus,
    narrow: viewportPx < NARROW_BREAKPOINT_PX,
    setInspectorPx,
    setFocus,
    reset,
    customized: inspectorPx !== DEFAULT_INSPECTOR_PX || focus !== 'none',
  };
}

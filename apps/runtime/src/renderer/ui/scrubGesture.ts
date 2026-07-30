/**
 * HORIZONTAL DRAG-TO-ADJUST for a numeric field — the Designer's gesture, in the
 * Runtime.
 *
 * Ported rather than imported, deliberately and per the design-system rule: `@cg/ui`
 * is TOKENS ONLY, and components/behaviour live app-local. The Designer's copy is
 * `apps/designer/src/renderer/features/inspector/controls.tsx`
 * (`runScrubGesture`/`scrubHandle`/`fieldScrub`). Keep the two in step by intent —
 * an operator who has used the Designer should find the same feel here — but they
 * are separate apps and neither imports the other's renderer.
 *
 * WHY WINDOW LISTENERS AND NO REACT STATE. The drag must keep working once the
 * pointer slides off the small input (it always does), and a re-render per pointer
 * move would fight the controlled input's caret. So the gesture lives entirely in
 * listeners for its duration and reports values through `onCommit`.
 */

/** Pixels of travel before a drag is a drag — below this it stays a click. */
const SCRUB_DEADZONE_PX = 3;

export interface ScrubOpts {
  /** The value the gesture starts from. */
  value: number;
  /** Units per pixel of travel (default 1). Shift makes it a tenth. */
  step?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  /** Called with each new value while dragging. */
  onCommit: (next: number) => void;
}

/**
 * Run one drag gesture. `onEnd(moved)` reports whether the pointer actually
 * travelled — a caller uses it to decide between "this was a drag" and "this was a
 * click, so focus the input for typing instead".
 */
export function runScrubGesture(
  p: ScrubOpts & { startX: number; onEnd?: ((moved: boolean) => void) | undefined },
): void {
  let last = p.value;
  let moved = false;
  const stepSize = p.step ?? 1;

  function apply(ev: PointerEvent): void {
    const dx = ev.clientX - p.startX;
    if (!moved && Math.abs(dx) < SCRUB_DEADZONE_PX) return;
    moved = true;
    // Shift = FINE adjust (a tenth of a step), matching the Designer.
    const inc = stepSize * (ev.shiftKey ? 0.1 : 1);
    let next = p.value + Math.round(dx) * inc;
    // Float error accumulates fast at 0.1 increments; 4dp is well past any
    // precision a layout value needs and keeps the displayed number clean.
    next = Number(next.toFixed(4));
    if (p.min !== undefined) next = Math.max(p.min, next);
    if (p.max !== undefined) next = Math.min(p.max, next);
    if (next !== last) {
      last = next;
      p.onCommit(next);
    }
  }

  function onUp(): void {
    window.removeEventListener('pointermove', apply);
    window.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    p.onEnd?.(moved);
  }

  // Hold the resize cursor and suppress text selection for the WHOLE gesture, so
  // it survives the pointer leaving the field — otherwise a drag across the panel
  // selects labels as it goes.
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', apply);
  window.addEventListener('pointerup', onUp);
}

/**
 * ARROW-KEY STEPPING for a numeric field.
 *
 * Returns the value the key implies, or `null` when the key is not one we handle
 * (so the caller leaves the event alone). `ArrowUp`/`ArrowDown` are matched on
 * `e.key`, which is correct and NOT an exception to the repo's physical-key rule:
 * CLAUDE.md names `Arrow*` among the keys whose value is already layout-stable.
 *
 * Modifiers match the drag so one mental model covers both: Shift = fine (a tenth),
 * and additionally Ctrl/Cmd = coarse (ten steps), which a drag gets for free from
 * distance but a key press has no other way to express.
 */
export function arrowStep(
  e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  opts: {
    value: number;
    step?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
  },
): number | null {
  const dir = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
  if (dir === 0) return null;
  const base = opts.step ?? 1;
  const inc = e.shiftKey ? base * 0.1 : e.ctrlKey || e.metaKey ? base * 10 : base;
  let next = Number((opts.value + dir * inc).toFixed(4));
  if (opts.min !== undefined) next = Math.max(opts.min, next);
  if (opts.max !== undefined) next = Math.min(opts.max, next);
  return next;
}

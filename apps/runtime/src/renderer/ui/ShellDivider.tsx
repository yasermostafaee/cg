import { useRef } from 'react';
import { useDragGesture } from '@cg/gesture';

interface Props {
  /** Which way the divider runs, and therefore which dimension it resizes. */
  orientation: 'vertical' | 'horizontal';
  /** Current size of the panel this divider resizes, in px. */
  value: number;
  onResize: (px: number) => void;
  /** Accessible name — say WHICH panel moves ("Resize the Inspector"). */
  label: string;
  /**
   * True when dragging TOWARD the origin (left / up) makes the panel BIGGER —
   * i.e. the panel sits on the far side of the divider. The Inspector is the
   * right-hand column, so it inverts; the monitor strip sits above its divider,
   * so it does not.
   */
  invert?: boolean;
}

/**
 * R-028 part B — the draggable divider between two shell panels: the Layers
 * workspace and the Inspector (vertical), and the monitor strip above the layer
 * list (horizontal).
 *
 * Keyboard-operable on purpose: it carries `role="separator"` with
 * `aria-valuenow`, and arrow keys nudge it. A drag-only divider is unusable
 * without a mouse, and this is a broadcast console — an operator may well be
 * driving it from a keyboard in a gallery. **That path is unchanged by B-140.**
 *
 * SIZE COMES FROM A DELTA, not from an absolute viewport computation. The first
 * version read `innerWidth - clientX`, which silently assumed the resized panel
 * ran exactly to the viewport edge — true for the Inspector, false for anything
 * inside the shell's own padding, and false for the horizontal case entirely.
 * Anchoring on where the drag STARTED works for any panel at any inset, and it
 * also means the pointer stays glued to the handle instead of jumping to it on
 * the first move.
 *
 * ── B-140 — THE GESTURE IS NOT OWNED HERE ANY MORE ─────────────────────────
 *
 * This component used to register `mousemove` / `mouseup` on `globalThis` and
 * write `cursor` / `user-select` onto `document.body`, clearing both in exactly
 * one handler. PVW is a same-origin `<iframe srcdoc>` — one per rehearsal
 * subject — so with the pointer over one, the parent got no moves and never got
 * the `mouseup`: the drag never ended, the divider stayed blue, and the whole
 * application kept a resize cursor with text selection dead.
 *
 * `@cg/gesture`'s `useDragGesture` now owns all of it — Pointer Events (so touch
 * and pen work too), a full-window shield above every iframe, and ONE teardown
 * fed by an exhaustive terminator set. **No `document.body` writes remain**: the
 * shield carries the cursor and disappears with the gesture, so the stuck global
 * state has no home rather than a fifth place that clears it.
 */
export function ShellDivider({
  orientation,
  value,
  onResize,
  label,
  invert = false,
}: Props): JSX.Element {
  const vertical = orientation === 'vertical';
  const cursor = vertical ? 'col-resize' : 'row-resize';
  /** The size the drag started from — the delta's origin, captured once. */
  const from = useRef(value);

  const { dragging, handleProps } = useDragGesture({
    axis: vertical ? 'x' : 'y',
    cursor,
    onStart: () => {
      from.current = value;
    },
    onMove: (delta) => {
      onResize(from.current + (invert ? -delta : delta));
    },
  });

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value}
      tabIndex={0}
      /*
       * The LOOK lives in `controls.css` (`.cg-divider`), not here: hover and the
       * dragging state cannot be expressed as inline styles, and those two states are
       * the whole reason this was mistaken for a scrollbar. Only the geometry and the
       * cursor stay inline, because they depend on the orientation prop.
       *
       * B-140 — the TOUCH hit area is `.cg-divider::before` (24px across the axis),
       * so the visible 6px below is unchanged. Do not widen these numbers to make the
       * divider easier to grab; that is what the pseudo-element is for.
       */
      className={[
        'cg-divider',
        vertical ? 'cg-divider--vertical' : 'cg-divider--horizontal',
        dragging ? 'is-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...(vertical
          ? { width: '6px', alignSelf: 'stretch' }
          : { height: '6px', alignSelf: 'stretch', width: '100%' }),
        cursor,
        // `touchAction: 'none'` arrives with the gesture's own props, so the browser
        // cannot steal the drag for scroll or pinch-zoom.
        ...handleProps.style,
      }}
      onPointerDown={handleProps.onPointerDown}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        // The arrow that GROWS the panel points AWAY from it: the Inspector is
        // the right-hand column, so Left widens it; the monitor strip sits above
        // its divider, so Down makes it taller.
        const [growKey, shrinkKey] = vertical
          ? invert
            ? (['ArrowLeft', 'ArrowRight'] as const)
            : (['ArrowRight', 'ArrowLeft'] as const)
          : invert
            ? (['ArrowUp', 'ArrowDown'] as const)
            : (['ArrowDown', 'ArrowUp'] as const);
        if (e.key === growKey) {
          e.preventDefault();
          onResize(value + step);
        } else if (e.key === shrinkKey) {
          e.preventDefault();
          onResize(value - step);
        }
      }}
    />
  );
}

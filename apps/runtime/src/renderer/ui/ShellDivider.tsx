import { useCallback, useEffect, useRef } from 'react';
import { colors } from '../theme.js';

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
 * driving it from a keyboard in a gallery.
 *
 * SIZE COMES FROM A DELTA, not from an absolute viewport computation. The first
 * version read `innerWidth - clientX`, which silently assumed the resized panel
 * ran exactly to the viewport edge — true for the Inspector, false for anything
 * inside the shell's own padding, and false for the horizontal case entirely.
 * Anchoring on where the drag STARTED works for any panel at any inset, and it
 * also means the pointer stays glued to the handle instead of jumping to it on
 * the first move.
 */
export function ShellDivider({
  orientation,
  value,
  onResize,
  label,
  invert = false,
}: Props): JSX.Element {
  const vertical = orientation === 'vertical';
  // Where the drag began, and the size it began from — the delta's origin.
  const drag = useRef<{ client: number; from: number } | null>(null);

  const applyFromClient = useCallback(
    (client: number) => {
      const start = drag.current;
      if (start === null) return;
      const delta = client - start.client;
      onResize(start.from + (invert ? -delta : delta));
    },
    [onResize, invert],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (drag.current === null) return;
      e.preventDefault();
      applyFromClient(vertical ? e.clientX : e.clientY);
    };
    const onUp = (): void => {
      drag.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    globalThis.addEventListener?.('mousemove', onMove);
    globalThis.addEventListener?.('mouseup', onUp);
    return () => {
      globalThis.removeEventListener?.('mousemove', onMove);
      globalThis.removeEventListener?.('mouseup', onUp);
    };
  }, [applyFromClient, vertical]);

  const cursor = vertical ? 'col-resize' : 'row-resize';

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value}
      tabIndex={0}
      style={{
        ...(vertical
          ? { width: '6px', alignSelf: 'stretch' }
          : { height: '6px', alignSelf: 'stretch', width: '100%' }),
        cursor,
        background: colors.border,
        flexShrink: 0,
        borderRadius: '3px',
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        drag.current = { client: vertical ? e.clientX : e.clientY, from: value };
        // Held on the BODY for the duration: without this the cursor flickers
        // back to default the moment the pointer leaves the 6px handle, which
        // during a drag is immediately.
        document.body.style.cursor = cursor;
        document.body.style.userSelect = 'none';
      }}
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

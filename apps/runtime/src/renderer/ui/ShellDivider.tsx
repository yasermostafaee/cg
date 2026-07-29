import { useCallback, useEffect, useRef } from 'react';
import { colors } from '../theme.js';

interface Props {
  /** Current Inspector width, so keyboard nudges start from the right place. */
  inspectorPx: number;
  onResize: (px: number) => void;
}

/**
 * R-028 part B — the draggable divider between the Layers workspace and the
 * Inspector.
 *
 * Keyboard-operable on purpose: it carries `role="separator"` with
 * `aria-valuenow`, and arrow keys nudge it. A drag-only divider is unusable
 * without a mouse, and this is a broadcast console — an operator may well be
 * driving it from a keyboard in a gallery.
 *
 * The width is computed from the RIGHT edge of the viewport (the Inspector is
 * the right column), and the hook clamps it so neither panel can be dragged to
 * nothing.
 */
export function ShellDivider({ inspectorPx, onResize }: Props): JSX.Element {
  const dragging = useRef(false);

  const applyFromClientX = useCallback(
    (clientX: number) => {
      onResize(Math.round((globalThis.innerWidth ?? 1280) - clientX));
    },
    [onResize],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return;
      e.preventDefault();
      applyFromClientX(e.clientX);
    };
    const onUp = (): void => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    globalThis.addEventListener?.('mousemove', onMove);
    globalThis.addEventListener?.('mouseup', onUp);
    return () => {
      globalThis.removeEventListener?.('mousemove', onMove);
      globalThis.removeEventListener?.('mouseup', onUp);
    };
  }, [applyFromClientX]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the Inspector"
      aria-valuenow={inspectorPx}
      tabIndex={0}
      style={{
        width: '6px',
        cursor: 'col-resize',
        background: colors.border,
        flexShrink: 0,
        alignSelf: 'stretch',
        borderRadius: '3px',
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        // Held on the BODY for the duration: without this the cursor flickers
        // back to default the moment the pointer leaves the 6px handle, which
        // during a drag is immediately.
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onResize(inspectorPx + step); // left = a WIDER right-hand Inspector
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onResize(inspectorPx - step);
        }
      }}
    />
  );
}

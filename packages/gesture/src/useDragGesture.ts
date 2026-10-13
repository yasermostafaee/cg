import { useCallback, useEffect, useRef, useState } from 'react';
import { mountShield, type Shield } from './shield.js';

/**
 * B-140 — ONE headless pointer-drag gesture, for every divider in every app.
 *
 * Headless on purpose: no styles, no tokens, no markup. `@cg/ui` stays
 * tokens-only and components stay app-local, so the thing being shared here is
 * BEHAVIOUR — which is a third category rather than an exception to either rule.
 *
 * ── WHAT IT FIXES, IN BOTH APPS ────────────────────────────────────────────
 *
 * Both dividers registered their move/up listeners on the PARENT window while the
 * app renders same-origin `<iframe>`s. With the pointer over one, the parent got
 * no moves and — fatally — never got the `up`:
 *
 *   - the Runtime left `is-dragging` on and never cleared `document.body`'s
 *     `cursor` / `user-select`, so the whole app kept a resize cursor and dead
 *     text selection;
 *   - the Designer added its listeners inside `onPointerDown` and removed them
 *     only in `onUp`, so a missed `up` left them attached PERMANENTLY and the
 *     panel then resized on every later pointer move with no button held. That is
 *     the more severe of the two.
 *
 * ── THE TWO HALVES, NEITHER OF WHICH REPLACES THE OTHER ────────────────────
 *
 * **The shield fixes CROSSING** — a parent-document overlay above every iframe, so
 * the pointer never enters a nested browsing context. `setPointerCapture` alone
 * does not dependably cross that boundary.
 *
 * **Pointer Events fix WHO CAN DRAG** — mouse, touch and pen through one path.
 * The shield cannot supply that.
 *
 * ── ONE TEARDOWN, AN EXHAUSTIVE TERMINATOR SET ─────────────────────────────
 *
 * 🔴 The defect's real shape was that "the drag ended" had more ways to happen
 * than the code had listeners for. Every terminator below calls the SAME `end()`,
 * and the visual state and the drag state are cleared inside it — so they cannot
 * be separately terminable. `pointercancel` and `lostpointercapture` are not
 * defensive extras once touch is supported: the OS takes a gesture away when it
 * becomes a scroll, when a call arrives, or when a palm is rejected.
 */
export interface DragGestureOptions {
  /**
   * Which axis the gesture reads. The hook reports a DELTA along it; what that
   * delta means is entirely the caller's.
   */
  readonly axis: 'x' | 'y';
  /** CSS cursor worn by the shield for the gesture's duration. */
  readonly cursor: string;
  /** The drag began. Return value is ignored; capture your own start state here. */
  readonly onStart?: (() => void) | undefined;
  /** Pixels moved along `axis` since `pointerdown`. Called on every move. */
  readonly onMove: (deltaPx: number) => void;
  /**
   * The drag ended, by ANY terminator. `Escape` is not special: the caller keeps
   * whatever size it has at that moment, because a revert would need a snapshot
   * this hook deliberately does not own.
   */
  readonly onEnd?: (() => void) | undefined;
}

export interface DragGesture {
  /** True between `pointerdown` and the one teardown. Drives the caller's class. */
  readonly dragging: boolean;
  /** Spread onto the handle element. */
  readonly handleProps: {
    readonly onPointerDown: (e: React.PointerEvent<Element>) => void;
    /** So the browser cannot steal the gesture for scroll or pinch-zoom. */
    readonly style: { readonly touchAction: 'none' };
  };
}

interface Active {
  readonly pointerId: number;
  readonly origin: number;
  readonly target: Element;
  readonly shield: Shield;
}

export function useDragGesture(options: DragGestureOptions): DragGesture {
  const { axis, cursor, onStart, onMove, onEnd } = options;
  const active = useRef<Active | null>(null);
  const [dragging, setDragging] = useState(false);

  // The callbacks are read through a ref so the window listeners are installed
  // ONCE and never re-registered mid-gesture — a re-register between a move and
  // an up is another way to lose the terminator.
  const cbs = useRef({ onMove, onEnd, onStart });
  cbs.current = { onMove, onEnd, onStart };

  /**
   * THE ONE TEARDOWN. Every terminator lands here and nothing else clears any
   * part of the gesture's state, which is what makes "the visual and the drag end
   * together" true by construction rather than by two calls that agree.
   */
  const end = useCallback((): void => {
    const a = active.current;
    if (a === null) return;
    active.current = null;
    try {
      if (a.target.hasPointerCapture?.(a.pointerId) === true) {
        a.target.releasePointerCapture(a.pointerId);
      }
    } catch {
      // Releasing a capture the browser has already taken back throws in some
      // engines. The gesture is over either way; swallowing here keeps the rest
      // of the teardown — including the shield — unconditional.
    }
    a.shield.release();
    setDragging(false);
    cbs.current.onEnd?.();
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent): void => {
      const a = active.current;
      // 🔴 ONLY the captured pointer drives the drag. A second finger is ignored
      // rather than read as a move — multi-touch is a bug class the mouse model
      // could not have, and this is where it would enter.
      if (a === null || e.pointerId !== a.pointerId) return;
      e.preventDefault();
      cbs.current.onMove((axis === 'x' ? e.clientX : e.clientY) - a.origin);
    };
    const up = (e: PointerEvent): void => {
      if (active.current !== null && e.pointerId !== active.current.pointerId) return;
      end();
    };
    const cancel = (e: PointerEvent): void => {
      if (active.current !== null && e.pointerId !== active.current.pointerId) return;
      end();
    };
    const lost = (e: PointerEvent): void => {
      if (active.current !== null && e.pointerId !== active.current.pointerId) return;
      end();
    };
    const key = (e: KeyboardEvent): void => {
      // Escape ENDS the drag and keeps the size it has at that moment.
      if (e.key === 'Escape') end();
    };
    const blur = (): void => end();
    const leave = (e: PointerEvent): void => {
      // The pointer left the window entirely (`relatedTarget === null` on the
      // document). The shield makes this rare, but a drag out of the browser and
      // back with the button released must not resume.
      if (e.relatedTarget === null) end();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('lostpointercapture', lost);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', blur);
    document.addEventListener('pointerout', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('lostpointercapture', lost);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', blur);
      document.removeEventListener('pointerout', leave);
      // Unmounting mid-gesture is itself a terminator: the listeners are going, so
      // the shield must go with them or it outlives everything that could remove it.
      end();
    };
  }, [axis, end]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<Element>): void => {
      // A second pointer during a drag is not a new drag.
      if (active.current !== null) return;
      // Primary button only for mouse; touch and pen report button 0 too.
      if (e.button !== 0) return;
      e.preventDefault();
      const target = e.currentTarget;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Capture is an optimisation here, not the mechanism — the shield is. A
        // browser that refuses it still gets a working drag.
      }
      active.current = {
        pointerId: e.pointerId,
        origin: axis === 'x' ? e.clientX : e.clientY,
        target,
        shield: mountShield(target.ownerDocument, cursor),
      };
      setDragging(true);
      cbs.current.onStart?.();
    },
    [axis, cursor],
  );

  return { dragging, handleProps: { onPointerDown, style: { touchAction: 'none' } } };
}

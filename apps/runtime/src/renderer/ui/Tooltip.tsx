import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * THE Runtime's tooltip — one global mechanism, inherited by every control that
 * already carries a `title`.
 *
 * Ported deliberately from the Designer's `features/shell/InputTooltip.tsx`
 * rather than invented here: one operator uses both apps, and a second tooltip
 * with its own delay, placement and look would be a second visual language.
 * What is shared is the RENDERING contract (delay, placement, suppression of the
 * OS bubble, the dark chip); the TEXT stays per-control, as a plain `title`.
 *
 * WHY EVENT DELEGATION AND NOT A `<Tooltip>` WRAPPER. This is the whole point of
 * the item that asked for it: a wrapper is per-button wiring, so the next
 * control someone adds is the one that silently has no tooltip. Reading `title`
 * off whatever the pointer is over means a control opts IN by doing the thing it
 * would do anyway — declaring a `title` — and nothing has to be remembered. The
 * same gap-by-hand-wiring is what left the Inspector without a fullscreen
 * affordance while Layers had one (see `Panel`).
 *
 * TWO DELIBERATE DIVERGENCES from the Designer's version, both because the
 * Runtime's row verbs are ICON-ONLY under a column header:
 *
 *  1. FOCUS, not just hover. A keyboard operator tabbing onto a glyph-only
 *     button has no other way to discover what it does — the Designer's fields
 *     always carry a visible label beside them, so hover-only was sufficient
 *     there and is not here.
 *  2. NO `" value"` suffix stripping. That cleanup exists for the Designer's
 *     `"Width value"` field labels; Runtime titles are whole sentences and must
 *     not be edited.
 *
 * `aria-label` remains the accessible NAME on every icon button and the tooltip
 * is supplementary — never a substitute (the bubble is not wired via
 * `aria-describedby`, matching the Designer: a transient node associated by id
 * announces inconsistently across screen readers, and the name already carries
 * the verb).
 */

/** Hover/focus dwell before the bubble appears. */
const DELAY_MS = 450;
/** Gap between the bubble and the target / the viewport edge, in px. */
const MARGIN = 8;

interface Tip {
  text: string;
  /**
   * The target's box in viewport coords. The bubble centres on `cx` and sits
   * above `top`, flipping below `bottom` when there is no room.
   */
  cx: number;
  top: number;
  bottom: number;
}

export function Tooltip(): JSX.Element | null {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | null>(null);
  // The element whose native `title` we blanked, so it can be restored exactly.
  const suppressed = useRef<{ el: HTMLElement; title: string } | null>(null);

  useEffect(() => {
    function cancel(): void {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    }
    function restoreTitle(): void {
      if (suppressed.current !== null) {
        suppressed.current.el.title = suppressed.current.title;
        suppressed.current = null;
      }
    }
    function hide(): void {
      cancel();
      restoreTitle();
      setTip(null);
    }

    /** The nearest ancestor carrying a non-empty `title`, and that title. */
    function resolve(target: Element | null): { el: HTMLElement; text: string } | null {
      if (target === null) return null;
      const titled = target.closest('[title]');
      if (titled instanceof HTMLElement && titled.title.trim() !== '') {
        return { el: titled, text: titled.title };
      }
      return null;
    }

    function show(found: { el: HTMLElement; text: string }): void {
      // Blank the native title immediately, so the OS bubble never double-renders.
      if (found.el.hasAttribute('title') && suppressed.current?.el !== found.el) {
        restoreTitle();
        suppressed.current = { el: found.el, title: found.el.title };
        found.el.title = '';
      }
      const rect = found.el.getBoundingClientRect();
      const text = found.text.trim();
      cancel();
      timer.current = window.setTimeout(() => {
        setTip({ text, cx: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
      }, DELAY_MS);
    }

    function onOver(e: PointerEvent): void {
      const found = resolve(e.target as Element | null);
      if (found === null) {
        hide();
        return;
      }
      show(found);
    }

    /**
     * Keyboard discovery. `focusin` (not `focus`) because it bubbles, which is
     * what lets one listener serve the whole surface — the same reason the
     * pointer path is delegated.
     */
    function onFocusIn(e: FocusEvent): void {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      // Only for keyboard focus: a click already focuses the button, and showing
      // a bubble over the control the operator just pressed is noise.
      if (!el.matches(':focus-visible')) return;
      const found = resolve(el);
      if (found === null) return;
      show(found);
    }

    window.addEventListener('pointerover', onOver, true);
    window.addEventListener('pointerout', hide, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, true);
    window.addEventListener('focusin', onFocusIn, true);
    window.addEventListener('focusout', hide, true);
    // Escape dismisses, like every other transient surface in this app.
    window.addEventListener('keydown', onKeyDown, true);
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') hide();
    }
    return () => {
      hide();
      window.removeEventListener('pointerover', onOver, true);
      window.removeEventListener('pointerout', hide, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide, true);
      window.removeEventListener('focusin', onFocusIn, true);
      window.removeEventListener('focusout', hide, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  if (tip === null) return null;
  return <Bubble tip={tip} />;
}

/**
 * Renders the bubble, then measures it and clamps its REAL edges inside the
 * viewport: centred on the target, above it by preference, flipped below when
 * there is no room above. Measured rather than transform-based so a bubble near
 * any edge is nudged fully on-screen instead of spilling off it.
 */
function Bubble({ tip }: { tip: Tip }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const b = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = clamp(tip.cx - b.width / 2, MARGIN, vw - b.width - MARGIN);
    const above = tip.top - MARGIN - b.height;
    const top = clamp(
      above >= MARGIN ? above : tip.bottom + MARGIN,
      MARGIN,
      vh - b.height - MARGIN,
    );
    setPos({ left, top });
  }, [tip]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className="cg-tooltip"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        // Hidden for the measuring pass so it never flashes at 0,0.
        visibility: pos === null ? 'hidden' : 'visible',
      }}
    >
      {tip.text}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  // `hi` can fall below `lo` when the bubble is larger than the viewport; pin to
  // `lo` so the top-left stays visible rather than going negative.
  return Math.max(lo, Math.min(v, Math.max(lo, hi)));
}

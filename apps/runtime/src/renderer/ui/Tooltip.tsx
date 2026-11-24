import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { panelWindow, usePanelDocument } from './PanelDocument.js';

/**
 * THE Runtime's tooltip — one global mechanism, inherited by every control that
 * carries a `title` or displays a clipped field value.
 *
 * Ported deliberately from the Designer's `features/shell/InputTooltip.tsx`
 * rather than invented here: one operator uses both apps, and a second tooltip
 * with its own delay, placement and look would be a second visual language.
 * The same bubble presents both control descriptions and clipped field values.
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

interface TipTarget {
  el: HTMLElement;
  text: string;
  nativeTitle?: HTMLElement;
  fieldValue?: true;
}

const VALUE_FIELD_SELECTOR =
  'input.cg-field, select.cg-field, textarea.cg-field, [data-field-value]';

function overflowsInline(el: Element): boolean {
  return el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
}

function clippedFieldValue(field: HTMLElement): string | undefined {
  const view = panelWindow(field.ownerDocument);
  if (field instanceof view.HTMLInputElement) {
    if (field.type !== 'text' && field.type !== 'search' && field.type !== 'number') return;
    if (field.closest('.cg-password') !== null) return;
    return overflowsInline(field) ? field.value : undefined;
  }
  if (field instanceof view.HTMLTextAreaElement) {
    return overflowsInline(field) || field.scrollHeight > field.clientHeight + 1
      ? field.value
      : undefined;
  }
  if (field instanceof view.HTMLSelectElement) {
    if (field.multiple || field.size > 1 || field.clientWidth === 0) return;
    const label = field.selectedOptions[0]?.label;
    if (label === undefined || label === '') return;
    const { font, fontSize, paddingInlineStart, paddingInlineEnd, appearance } =
      view.getComputedStyle(field);
    const canvas = field.ownerDocument.createElement('canvas').getContext('2d');
    if (canvas === null) return;
    canvas.font = font;
    // A native closed select retains the arrow within its client width.
    const arrowWidth = appearance === 'none' ? 0 : Number.parseFloat(fontSize) + 4;
    const available =
      field.clientWidth -
      Number.parseFloat(paddingInlineStart) -
      Number.parseFloat(paddingInlineEnd) -
      arrowWidth;
    return canvas.measureText(label).width > available ? label : undefined;
  }
  if (field.getAttribute('aria-expanded') === 'true') return;
  return [...field.querySelectorAll('[data-field-overflow]')].some(overflowsInline)
    ? field.dataset['fieldValue']
    : undefined;
}

interface Tip {
  text: string;
  fieldValue?: true;
  /**
   * The target's box in viewport coords. The bubble centres on `cx` and sits
   * above `top`, flipping below `bottom` when there is no room.
   */
  cx: number;
  top: number;
  bottom: number;
}

export interface TooltipBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TooltipSurface {
  key: string;
  container: HTMLElement;
  left: number;
  top: number;
  scale: number;
}

export type TooltipSurfaces = (box: TooltipBox) => readonly TooltipSurface[];

export function Tooltip({
  surfaces,
}: {
  surfaces?: TooltipSurfaces | undefined;
} = {}): JSX.Element | null {
  const view = panelWindow(usePanelDocument());
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | null>(null);
  // The element whose native `title` we blanked, so it can be restored exactly.
  const suppressed = useRef<{ el: HTMLElement; title: string } | null>(null);

  useEffect(() => {
    function cancel(): void {
      if (timer.current !== null) {
        view.clearTimeout(timer.current);
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

    function resolve(target: Element | null): TipTarget | null {
      if (target === null) return null;
      const titled = target.closest('[title]');
      const nativeTitle = titled instanceof view.HTMLElement ? titled : undefined;
      const field = target.closest(VALUE_FIELD_SELECTOR);
      if (
        field instanceof view.HTMLElement &&
        (nativeTitle === undefined || nativeTitle === field || !field.contains(nativeTitle))
      ) {
        const text = clippedFieldValue(field);
        if (text !== undefined && text.trim() !== '') {
          return {
            el: field,
            text,
            fieldValue: true,
            ...(nativeTitle !== undefined && { nativeTitle }),
          };
        }
      }
      if (nativeTitle !== undefined && nativeTitle.title.trim() !== '') {
        return { el: nativeTitle, text: nativeTitle.title, nativeTitle };
      }
      return null;
    }

    function show(found: TipTarget): void {
      const { el, nativeTitle, fieldValue } = found;
      // Suppress the OS bubble while the app renders the same hover target.
      if (nativeTitle !== undefined && suppressed.current?.el !== nativeTitle) {
        restoreTitle();
        suppressed.current = { el: nativeTitle, title: nativeTitle.title };
        nativeTitle.title = '';
      }
      cancel();
      timer.current = view.setTimeout(() => {
        if (!el.isConnected) return;
        const text = fieldValue ? clippedFieldValue(el) : found.text.trim();
        if (text === undefined || text.trim() === '') return;
        const rect = el.getBoundingClientRect();
        setTip({
          text,
          cx: rect.left + rect.width / 2,
          top: rect.top,
          bottom: rect.bottom,
          ...(fieldValue && { fieldValue }),
        });
      }, DELAY_MS);
    }

    function onOver(e: PointerEvent): void {
      const found = resolve(e.target instanceof view.Element ? e.target : null);
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
      if (!(el instanceof view.HTMLElement)) return;
      // Only for keyboard focus: a click already focuses the button, and showing
      // a bubble over the control the operator just pressed is noise.
      if (!el.matches(':focus-visible')) return;
      const found = resolve(el);
      if (found === null) return;
      show(found);
    }

    view.addEventListener('pointerover', onOver, true);
    view.addEventListener('pointerout', hide, true);
    view.addEventListener('pointerdown', hide, true);
    view.addEventListener('wheel', hide, true);
    view.addEventListener('input', hide, true);
    view.addEventListener('change', hide, true);
    view.addEventListener('focusin', onFocusIn, true);
    view.addEventListener('focusout', hide, true);
    view.addEventListener('resize', hide);
    view.addEventListener('blur', hide);
    // Escape dismisses, like every other transient surface in this app.
    view.addEventListener('keydown', onKeyDown, true);
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') hide();
    }
    return () => {
      hide();
      view.removeEventListener('pointerover', onOver, true);
      view.removeEventListener('pointerout', hide, true);
      view.removeEventListener('pointerdown', hide, true);
      view.removeEventListener('wheel', hide, true);
      view.removeEventListener('input', hide, true);
      view.removeEventListener('change', hide, true);
      view.removeEventListener('focusin', onFocusIn, true);
      view.removeEventListener('focusout', hide, true);
      view.removeEventListener('resize', hide);
      view.removeEventListener('blur', hide);
      view.removeEventListener('keydown', onKeyDown, true);
    };
  }, [view]);

  if (tip === null) return null;
  return <Bubble tip={tip} surfaces={surfaces} />;
}

/**
 * Renders the bubble, then measures it and clamps its REAL edges inside the
 * viewport: centred on the target, above it by preference, flipped below when
 * there is no room above. Measured rather than transform-based so a bubble near
 * any edge is nudged fully on-screen instead of spilling off it.
 */
function Bubble({
  tip,
  surfaces,
}: {
  tip: Tip;
  surfaces: TooltipSurfaces | undefined;
}): JSX.Element {
  const owner = usePanelDocument();
  const view = panelWindow(owner);
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<(TooltipBox & { fontFamily: string }) | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const measure = (): void => {
      const { width, height } = el.getBoundingClientRect();
      const left = clamp(tip.cx - width / 2, MARGIN, view.innerWidth - width - MARGIN);
      const above = tip.top - MARGIN - height;
      const top = clamp(
        above >= MARGIN ? above : tip.bottom + MARGIN,
        MARGIN,
        view.innerHeight - height - MARGIN,
      );
      const fontFamily = view.getComputedStyle(el).fontFamily;
      setPos((previous) =>
        previous?.left === left &&
        previous.top === top &&
        previous.width === width &&
        previous.height === height &&
        previous.fontFamily === fontFamily
          ? previous
          : { left, top, width, height, fontFamily },
      );
    };
    measure();
    // A font loaded after the tooltip opens can change its size, especially in RTL.
    // Keep the same measured rectangle in the main window and the docked copies.
    if (typeof view.ResizeObserver !== 'function') return;
    const observer = new view.ResizeObserver(measure);
    observer.observe(el, { box: 'border-box' });
    return () => observer.disconnect();
  }, [tip, view]);

  const className = tip.fieldValue ? 'cg-tooltip cg-tooltip--value' : 'cg-tooltip';
  const direction = tip.fieldValue ? 'auto' : undefined;
  return (
    <>
      <div
        ref={ref}
        role="tooltip"
        dir={direction}
        className={className}
        style={{
          left: pos?.left ?? 0,
          top: pos?.top ?? 0,
          // Hidden for the measuring pass so it never flashes at 0,0.
          visibility: pos === null ? 'hidden' : 'visible',
        }}
      >
        {tip.text}
      </div>
      {pos !== null &&
        surfaces?.(pos).map(({ key, container, left, top, scale }) =>
          createPortal(
            <div
              aria-hidden="true"
              dir={direction ?? owner.documentElement.dir}
              className={className}
              style={{
                left,
                top,
                width: pos.width,
                maxWidth: 'none',
                boxSizing: 'border-box',
                fontFamily: pos.fontFamily,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              {tip.text}
            </div>,
            container,
            key,
          ),
        )}
    </>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  // `hi` can fall below `lo` when the bubble is larger than the viewport; pin to
  // `lo` so the top-left stays visible rather than going negative.
  return Math.max(lo, Math.min(v, Math.max(lo, hi)));
}

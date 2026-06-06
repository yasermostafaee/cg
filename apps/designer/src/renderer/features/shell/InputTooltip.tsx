import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Global dark tooltip (the Loopic pattern). Mounted once at the app root;
 * it shows a small dark bubble on hover for:
 *   - any element carrying a `title` (toolbar tools, transport, etc.) — the
 *     native title is suppressed while ours is shown, then restored, and
 *   - form controls with an `aria-label` (the inspector inputs).
 *
 * Fixed positioning (rather than a CSS `::after`) keeps the tooltip from
 * being clipped by the scrolling inspector panel. The trailing word
 * "value" is dropped — "Width", not "Width value".
 *
 * Placement is measured, not transform-based: we read the rendered bubble's
 * real size and clamp its actual edges inside the viewport on all four sides,
 * so a bubble near any screen edge (the top toolbar, the compositions / project
 * assets side panels, …) is nudged fully on-screen instead of spilling off it.
 */
const DELAY_MS = 450;
// Gap between the bubble and the target / viewport edge, in px.
const MARGIN = 8;

interface Tip {
  text: string;
  // The target's bounding box in viewport coords. The bubble centres on cx and
  // sits above `top` by default, flipping below `bottom` when it won't fit.
  cx: number;
  top: number;
  bottom: number;
}

export function InputTooltip(): JSX.Element | null {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | null>(null);
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
    function resolve(target: Element | null): { el: HTMLElement; text: string } | null {
      if (target === null) return null;
      const titled = target.closest('[title]');
      if (titled instanceof HTMLElement && titled.title.trim() !== '') {
        return { el: titled, text: titled.title };
      }
      const field = target.closest('input, select, textarea');
      if (field instanceof HTMLElement && !isHidden(field)) {
        const al = field.getAttribute('aria-label')?.trim();
        if (al !== undefined && al !== '') return { el: field, text: al };
      }
      // Hovering the non-input parts of a field box — its unit suffix (% / px),
      // padding, or the gap between segments — should still show the tooltip.
      // Resolve to the control inside the nearest field wrapper (a vector
      // segment first, otherwise the single-field box).
      const box = target.closest('.cg-seg, .cg-field');
      if (box !== null) {
        const inner = box.querySelector('input, select, textarea');
        if (inner instanceof HTMLElement && !isHidden(inner)) {
          const al = inner.getAttribute('aria-label')?.trim();
          if (al !== undefined && al !== '') return { el: inner, text: al };
        }
      }
      return null;
    }
    function onOver(e: PointerEvent): void {
      const found = resolve(e.target as Element | null);
      if (found === null) {
        hide();
        return;
      }
      // Suppress the native title immediately so it never appears.
      if (found.el.hasAttribute('title') && suppressed.current?.el !== found.el) {
        restoreTitle();
        suppressed.current = { el: found.el, title: found.el.title };
        found.el.title = '';
      }
      const rect = found.el.getBoundingClientRect();
      const text = clean(found.text);
      cancel();
      timer.current = window.setTimeout(() => {
        setTip({ text, cx: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
      }, DELAY_MS);
    }
    window.addEventListener('pointerover', onOver, true);
    window.addEventListener('pointerout', hide, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, true);
    return () => {
      hide();
      window.removeEventListener('pointerover', onOver, true);
      window.removeEventListener('pointerout', hide, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide, true);
    };
  }, []);

  if (tip === null) return null;
  return <Bubble tip={tip} />;
}

/**
 * Renders the bubble, then on layout measures its real size and clamps its
 * actual edges inside the viewport: centred on the target horizontally (nudged
 * in from either side edge) and above the target vertically (flipped below when
 * there isn't room above, then clamped against the bottom edge).
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
    // Horizontal: centre on the target, then pull both edges inside the viewport.
    const left = clamp(tip.cx - b.width / 2, MARGIN, vw - b.width - MARGIN);
    // Vertical: prefer above; flip below if it would clip the top; then clamp.
    const above = tip.top - MARGIN - b.height;
    const top = clamp(above >= MARGIN ? above : tip.bottom + MARGIN, MARGIN, vh - b.height - MARGIN);
    setPos({ left, top });
  }, [tip]);

  return (
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        // Hidden for the first measuring pass so it never flashes at 0,0.
        visibility: pos === null ? 'hidden' : 'visible',
        maxWidth: 260,
        background: '#1c1f2d',
        color: '#e5e7f3',
        border: '1px solid #363a54',
        borderRadius: '0.3rem',
        padding: '0.25rem 0.5rem',
        fontSize: '0.7rem',
        lineHeight: 1.3,
        // Wrap long labels inside the bubble instead of overflowing past its
        // edge; a single very long token still breaks rather than spilling.
        whiteSpace: 'normal',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
        pointerEvents: 'none',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
        zIndex: 3000,
      }}
    >
      {tip.text}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  // hi can fall below lo when the bubble is wider/taller than the viewport;
  // pin to lo so the top-left stays visible rather than going negative.
  return Math.max(lo, Math.min(v, Math.max(lo, hi)));
}

/** Drop a trailing " value" — "Width value" → "Width". */
function clean(s: string): string {
  return s.replace(/\s+value$/i, '').trim();
}

function isHidden(el: Element): boolean {
  const s = window.getComputedStyle(el);
  return s.opacity === '0' || s.visibility === 'hidden' || s.display === 'none';
}

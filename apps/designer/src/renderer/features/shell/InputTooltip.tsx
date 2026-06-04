import { useEffect, useRef, useState } from 'react';

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
 */
const DELAY_MS = 450;

interface Tip {
  text: string;
  x: number;
  y: number;
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
        setTip({ text, x: rect.left + rect.width / 2, y: rect.top });
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
  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        // Clamp to the viewport so a tooltip near the right/left edge isn't
        // clipped; the bubble stays centred on its target otherwise.
        left: Math.max(8, Math.min(tip.x, window.innerWidth - 8)),
        top: tip.y - 8,
        transform: 'translate(-50%, -100%)',
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

/** Drop a trailing " value" — "Width value" → "Width". */
function clean(s: string): string {
  return s.replace(/\s+value$/i, '').trim();
}

function isHidden(el: Element): boolean {
  const s = window.getComputedStyle(el);
  return s.opacity === '0' || s.visibility === 'hidden' || s.display === 'none';
}

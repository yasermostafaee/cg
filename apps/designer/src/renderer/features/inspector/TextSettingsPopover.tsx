import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Element, TextElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Control } from '../../ui/Control.js';
import { Select } from '../../ui/Select.js';
import * as s from './TextSettingsPopover.css.js';

/** 100..900 with human-friendly names (the reference shows "Bold", etc.). */
const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'] as const;
const WEIGHT_LABELS = [
  'Thin',
  'Extra Light',
  'Light',
  'Regular',
  'Medium',
  'Semi Bold',
  'Bold',
  'Extra Bold',
  'Black',
] as const;

/**
 * D-048 — the "⚙ More text options" gear and its popover.
 *
 * Appearance / UI-parity only. The popover houses ONLY existing font props —
 * font weight (100..900) and font style (normal / italic) — styled like the
 * Loopic reference gear popover (D-045-align-1.png). Both write `font.weight` /
 * `font.style` via `designerStore.updateElement` (non-keyframable, like
 * font-family — no keyframe diamond); there is no schema / renderer / keyframe
 * change. Trigger + popover follow the FillPopover / ColorPopover pattern
 * (portal, anchor positioning, outside-click + Escape to close). Text-element-only.
 */
export function TextSettingsButton({ element }: { element: TextElement }): JSX.Element {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Control
        ref={btnRef}
        variant="bare"
        className={cx(s.gearButton, open && s.gearButtonOpen)}
        aria-label="More text options"
        title="More text options"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⚙
      </Control>
      {open && (
        <TextSettingsPopover
          anchor={btnRef.current}
          element={element}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TextSettingsPopover({
  anchor,
  element,
  onClose,
}: {
  anchor: HTMLElement | null;
  element: TextElement;
  onClose: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const id = element.id;

  useLayoutEffect(() => {
    const el = rootRef.current;
    const rect = anchor?.getBoundingClientRect();
    if (el === null || rect === undefined) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const margin = 8;
    const belowTop = rect.bottom + 6;
    const fitsBelow = belowTop + h <= window.innerHeight - margin;
    const top = fitsBelow ? belowTop : Math.max(margin, rect.top - 6 - h);
    // Right-align the popover to the gear (which sits at the row's right edge).
    const left = Math.max(margin, Math.min(rect.right - w, window.innerWidth - w - margin));
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    function onDown(e: PointerEvent): void {
      const t = e.target as Node | null;
      if (rootRef.current?.contains(t) === true) return;
      if (anchor?.contains(t) === true) return;
      onClose();
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);

  const popover = (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Text settings"
      className={s.popover}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos === null ? 'hidden' : 'visible',
      }}
    >
      <div className={s.row}>
        <span className={s.label}>Font weight</span>
        <Select
          className={s.select}
          aria-label="weight"
          value={String(element.font.weight)}
          onChange={(e) =>
            designerStore.updateElement(id, {
              font: { ...element.font, weight: Number(e.target.value) },
            } as Partial<Element>)
          }
        >
          {WEIGHTS.map((w, i) => (
            <option key={w} value={w}>
              {WEIGHT_LABELS[i]}
            </option>
          ))}
        </Select>
      </div>
      <div className={s.row}>
        <span className={s.label}>Font style</span>
        <Select
          className={s.select}
          aria-label="font style"
          value={element.font.style}
          onChange={(e) =>
            designerStore.updateElement(id, {
              font: { ...element.font, style: e.target.value as 'normal' | 'italic' },
            } as Partial<Element>)
          }
        >
          <option value="normal">Normal</option>
          <option value="italic">Italic</option>
        </Select>
      </div>
    </div>
  );
  return createPortal(popover, document.body);
}

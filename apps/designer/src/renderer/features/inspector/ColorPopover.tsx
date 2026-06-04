import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { colors } from '../../theme.js';

/**
 * A small RGBA colour picker (the Loopic / common-app pattern): a swatch
 * button that opens a popover with a saturation-value square, a hue slider
 * and an *alpha* slider — so colour and transparency are picked together in
 * one control, rather than a colour input plus a separate opacity field.
 *
 * Native `<input type="color">` can't express alpha, so the whole picker is
 * custom. Values flow in/out as `#RRGGBB` (opaque) or `#RRGGBBAA`.
 */

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel: string;
  /** Swatch size in px (default 14). */
  size?: number;
  /** Show the swatch as fully transparent (checker only), e.g. an unset
   *  background. Picking a colour clears it. */
  transparent?: boolean;
}

const CHECKER: CSSProperties = {
  backgroundColor: '#fff',
  backgroundImage:
    'linear-gradient(45deg, #999 25%, transparent 25%), ' +
    'linear-gradient(-45deg, #999 25%, transparent 25%), ' +
    'linear-gradient(45deg, transparent 75%, #999 75%), ' +
    'linear-gradient(-45deg, transparent 75%, #999 75%)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
};

export function ColorPicker(props: ColorPickerProps): JSX.Element {
  const size = props.size ?? 14;
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Pick a colour"
        aria-label={props.ariaLabel}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: '0.15rem',
          border: `1px solid ${colors.border}`,
          padding: 0,
          cursor: 'pointer',
          overflow: 'hidden',
          flexShrink: 0,
          ...CHECKER,
        }}
      >
        {props.transparent !== true && (
          <span style={{ position: 'absolute', inset: 0, background: props.value }} />
        )}
      </button>
      {open && (
        <Popover
          anchor={btnRef.current}
          value={props.value}
          onChange={props.onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function Popover({
  anchor,
  value,
  onChange,
  onClose,
}: {
  anchor: HTMLElement | null;
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = hexToHsva(value);
  const [hsva, setHsva] = useState(initial);
  // Track the gesture so external value syncs don't fight an in-progress drag.
  const dragging = useRef(false);
  // Resolved on-screen position. Computed after layout so we can flip the
  // popover above the swatch when it would overflow the viewport bottom.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    const rect = anchor?.getBoundingClientRect();
    if (el === null || rect === undefined) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const margin = 8;
    // Prefer below the swatch; flip above if it would run off the bottom and
    // there's more room above.
    const belowTop = rect.bottom + 6;
    const fitsBelow = belowTop + h <= window.innerHeight - margin;
    const top = fitsBelow
      ? belowTop
      : Math.max(margin, rect.top - 6 - h);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - w - margin));
    setPos({ top, left });
  }, [anchor]);

  // Re-sync when the bound value changes externally and we're not dragging.
  useEffect(() => {
    if (!dragging.current) setHsva(hexToHsva(value));
  }, [value]);

  // Close on outside click / Escape / scroll.
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

  function commit(next: Hsva): void {
    setHsva(next);
    onChange(hsvaToHex(next));
  }

  const { r, g, b } = hsvToRgb(hsva.h, hsva.s, hsva.v);
  const pureHue = hsvToRgb(hsva.h, 1, 1);
  const hexLabel = hsvaToHex(hsva).replace(/^#/, '').toUpperCase();

  const popover = (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Colour picker"
      style={{
        position: 'fixed',
        // Hidden off-screen for the first paint until useLayoutEffect measures
        // the box and resolves a position that stays within the viewport.
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos === null ? 'hidden' : 'visible',
        width: 200,
        background: '#1c1f2d',
        border: `1px solid ${colors.border}`,
        borderRadius: '0.4rem',
        padding: '0.6rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        zIndex: 4000,
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* Saturation / Value square */}
      <DragArea
        style={{
          position: 'relative',
          width: '100%',
          height: 120,
          borderRadius: '0.25rem',
          cursor: 'crosshair',
          background:
            `linear-gradient(to top, #000, transparent), ` +
            `linear-gradient(to right, #fff, transparent), ` +
            `rgb(${pureHue.r}, ${pureHue.g}, ${pureHue.b})`,
        }}
        onDragStart={() => (dragging.current = true)}
        onDragEnd={() => (dragging.current = false)}
        onMove={(x, y) => commit({ ...hsva, s: x, v: 1 - y })}
      >
        <Knob xPct={hsva.s} yPct={1 - hsva.v} color={`rgb(${r},${g},${b})`} />
      </DragArea>

      {/* Hue slider */}
      <DragArea
        style={{
          position: 'relative',
          width: '100%',
          height: 12,
          marginTop: '0.5rem',
          borderRadius: '999px',
          cursor: 'ew-resize',
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        }}
        onDragStart={() => (dragging.current = true)}
        onDragEnd={() => (dragging.current = false)}
        onMove={(x) => commit({ ...hsva, h: x * 360 })}
      >
        <Knob xPct={hsva.h / 360} yPct={0.5} color={`rgb(${pureHue.r},${pureHue.g},${pureHue.b})`} />
      </DragArea>

      {/* Alpha slider */}
      <div style={{ position: 'relative', marginTop: '0.5rem', borderRadius: '999px', ...CHECKER }}>
        <DragArea
          style={{
            position: 'relative',
            width: '100%',
            height: 12,
            borderRadius: '999px',
            cursor: 'ew-resize',
            background: `linear-gradient(to right, rgba(${r},${g},${b},0), rgb(${r},${g},${b}))`,
          }}
          onDragStart={() => (dragging.current = true)}
          onDragEnd={() => (dragging.current = false)}
          onMove={(x) => commit({ ...hsva, a: x })}
        >
          <Knob xPct={hsva.a} yPct={0.5} color={`rgba(${r},${g},${b},${hsva.a})`} />
        </DragArea>
      </div>

      {/* Hex (accepts #RRGGBB or #RRGGBBAA) */}
      <input
        type="text"
        defaultValue={hexLabel}
        key={hexLabel}
        aria-label="Hex colour value"
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const v = e.target.value.trim();
          const hex = v.startsWith('#') ? v : `#${v}`;
          if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
            const next = hexToHsva(hex);
            setHsva(next);
            onChange(hex.toUpperCase());
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        style={{
          marginTop: '0.55rem',
          width: '100%',
          background: '#24273d',
          color: colors.text,
          border: `1px solid ${colors.border}`,
          borderRadius: '0.2rem',
          padding: '0.3rem 0.45rem',
          fontSize: '0.72rem',
          letterSpacing: '0.06em',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );

  return createPortal(popover, document.body);
}

/**
 * A pointer-drag surface that reports the pointer position as 0–1 fractions
 * of its own box (clamped), for both axes. Drag continues via window
 * listeners even when the pointer leaves the element.
 */
function DragArea(props: {
  style: CSSProperties;
  onMove: (xFrac: number, yFrac: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  children?: React.ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  function emit(clientX: number, clientY: number): void {
    const el = ref.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    const x = clamp01((clientX - r.left) / r.width);
    const y = clamp01((clientY - r.top) / r.height);
    props.onMove(x, y);
  }
  return (
    <div
      ref={ref}
      style={props.style}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        props.onDragStart?.();
        emit(e.clientX, e.clientY);
        const move = (ev: PointerEvent): void => emit(ev.clientX, ev.clientY);
        const up = (): void => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          props.onDragEnd?.();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    >
      {props.children}
    </div>
  );
}

function Knob({ xPct, yPct, color }: { xPct: number; yPct: number; color: string }): JSX.Element {
  return (
    <span
      style={{
        position: 'absolute',
        left: `${xPct * 100}%`,
        top: `${yPct * 100}%`,
        width: 12,
        height: 12,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: '2px solid #fff',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
        background: color,
        pointerEvents: 'none',
      }}
    />
  );
}

// ── colour maths ──────────────────────────────────────────────────────────

interface Hsva {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
  a: number; // 0–1
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function hexToHsva(hex: string): Hsva {
  const m = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hex.trim());
  if (m === null || m[1] === undefined) return { h: 0, s: 0, v: 0, a: 1 };
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  const a = m[2] === undefined ? 1 : parseInt(m[2], 16) / 255;
  const { h, s, v } = rgbToHsv(r, g, b);
  return { h, s, v, a };
}

function hsvaToHex(c: Hsva): string {
  const { r, g, b } = hsvToRgb(c.h, c.s, c.v);
  const hex2 = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase();
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  if (c.a >= 1) return base;
  return `${base}${hex2(Math.round(c.a * 255))}`;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

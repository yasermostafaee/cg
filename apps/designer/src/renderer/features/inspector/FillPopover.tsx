import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Fill } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { ColorEditor } from './ColorPopover.js';

/**
 * Fill control for shapes — extends the colour picker with Solid / Linear /
 * Radial modes (the Loopic fill picker). The swatch previews the current fill;
 * the popover offers a mode switch, the shared {@link ColorEditor}, and — for
 * gradients — an editable stop list plus angle (linear) or centre/radius
 * (radial). Emits a {@link Fill} object; the inspector writes it to the shape.
 */

interface Stop {
  at: number;
  color: string;
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

const DEFAULT_FILL: Fill = { kind: 'solid', color: '#000000' };

function sortedStops(stops: readonly Stop[]): Stop[] {
  return [...stops].sort((a, b) => a.at - b.at);
}

function stopString(stops: readonly Stop[]): string {
  return sortedStops(stops)
    .map((s) => `${s.color} ${Math.round(s.at * 100)}%`)
    .join(', ');
}

/** CSS background for previews. Radial uses % (closest-side) so small swatches
 *  read correctly regardless of the authored pixel radius. */
function previewCss(fill: Fill): string {
  if (fill.kind === 'solid') return fill.color;
  if (fill.kind === 'linear')
    return `linear-gradient(${String(fill.angle)}deg, ${stopString(fill.stops)})`;
  return `radial-gradient(circle at ${String(fill.center.x * 100)}% ${String(fill.center.y * 100)}%, ${stopString(fill.stops)})`;
}

function firstColor(fill: Fill): string {
  if (fill.kind === 'solid') return fill.color;
  return sortedStops(fill.stops)[0]?.color ?? '#000000';
}

/** Convert any fill to the requested kind, preserving as much as possible. */
function toKind(fill: Fill, kind: Fill['kind']): Fill {
  if (fill.kind === kind) return fill;
  if (kind === 'solid') return { kind: 'solid', color: firstColor(fill) };
  const stops: Stop[] =
    fill.kind === 'solid'
      ? [
          { at: 0, color: fill.color },
          { at: 1, color: '#FFFFFF00' },
        ]
      : sortedStops(fill.stops);
  if (kind === 'linear') {
    return { kind: 'linear', angle: fill.kind === 'radial' ? 90 : 90, stops };
  }
  return { kind: 'radial', center: { x: 0.5, y: 0.5 }, radius: 320, stops };
}

interface FillFieldProps {
  label: string;
  value: Fill | undefined;
  onChange: (fill: Fill) => void;
  trailing?: JSX.Element;
  /** Label column width in px (default 74 — matches the shape Path Style rows). */
  labelWidth?: number;
}

const rowStyles = {
  row: {
    display: 'grid',
    gap: '0.35rem',
    alignItems: 'center',
    padding: '0.1rem 0',
    fontSize: '0.74rem',
  },
  label: { color: colors.textMuted, fontSize: '0.7rem', letterSpacing: '0.02em' },
  field: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  kindLabel: {
    flex: 1,
    color: colors.text,
    fontSize: '0.72rem',
    textTransform: 'capitalize' as const,
  },
  point: { display: 'flex', alignItems: 'center' },
} as const;

const KIND_NAME: Record<Fill['kind'], string> = {
  solid: 'Solid',
  linear: 'Linear',
  radial: 'Radial',
};

export function FillField(props: FillFieldProps): JSX.Element {
  const fill = props.value ?? DEFAULT_FILL;
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      style={{ ...rowStyles.row, gridTemplateColumns: `${String(props.labelWidth ?? 74)}px 1fr` }}
    >
      <span style={rowStyles.label}>{props.label}</span>
      <div className="cg-field" style={rowStyles.field}>
        <button
          ref={btnRef}
          type="button"
          aria-label={`${props.label} fill`}
          title="Edit fill"
          onClick={() => setOpen((o) => !o)}
          style={{
            position: 'relative',
            width: 14,
            height: 14,
            borderRadius: '0.15rem',
            border: `1px solid ${colors.border}`,
            padding: 0,
            cursor: 'pointer',
            overflow: 'hidden',
            flexShrink: 0,
            ...CHECKER,
          }}
        >
          <span style={{ position: 'absolute', inset: 0, background: previewCss(fill) }} />
        </button>
        <span style={rowStyles.kindLabel}>{KIND_NAME[fill.kind]}</span>
        {props.trailing !== undefined && <span style={rowStyles.point}>{props.trailing}</span>}
      </div>
      {open && (
        <FillPopover
          anchor={btnRef.current}
          value={fill}
          onChange={props.onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function FillPopover({
  anchor,
  value,
  onChange,
  onClose,
}: {
  anchor: HTMLElement | null;
  value: Fill;
  onChange: (fill: Fill) => void;
  onClose: () => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [selected, setSelected] = useState(0);

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
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - w - margin));
    setPos({ top, left });
  }, [anchor, value.kind]);

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

  const stops: Stop[] = value.kind === 'solid' ? [] : sortedStops(value.stops);
  const sel = Math.min(selected, Math.max(0, stops.length - 1));

  function setStopColor(hex: string): void {
    if (value.kind === 'solid') {
      onChange({ kind: 'solid', color: hex });
      return;
    }
    const next = stops.map((s, i) => (i === sel ? { ...s, color: hex } : s));
    onChange({ ...value, stops: next });
  }

  function setStopAt(pct: number): void {
    if (value.kind === 'solid') return;
    const at = Math.max(0, Math.min(1, pct / 100));
    const next = stops.map((s, i) => (i === sel ? { ...s, at } : s));
    onChange({ ...value, stops: sortedStops(next) });
  }

  function addStop(): void {
    if (value.kind === 'solid') return;
    const a = stops[sel] ?? stops[0];
    const b = stops[sel + 1] ?? stops[stops.length - 1];
    const at = a && b && a !== b ? (a.at + b.at) / 2 : Math.min(1, (a?.at ?? 0) + 0.25);
    const next = sortedStops([...stops, { at, color: a?.color ?? '#FFFFFF' }]);
    onChange({ ...value, stops: next });
  }

  function removeStop(): void {
    if (value.kind === 'solid' || stops.length <= 2) return;
    const next = stops.filter((_, i) => i !== sel);
    setSelected(Math.max(0, sel - 1));
    onChange({ ...value, stops: next });
  }

  const editorColor = value.kind === 'solid' ? value.color : (stops[sel]?.color ?? '#000000');

  const popover = (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Fill editor"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos === null ? 'hidden' : 'visible',
        width: 210,
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
      {/* Mode switch */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '0.55rem' }}>
        {(['solid', 'linear', 'radial'] as const).map((k) => {
          const active = value.kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setSelected(0);
                onChange(toKind(value, k));
              }}
              style={{
                flex: 1,
                padding: '0.28rem 0',
                fontSize: '0.68rem',
                textTransform: 'capitalize',
                cursor: 'pointer',
                borderRadius: '0.2rem',
                border: `1px solid ${active ? colors.accent : colors.border}`,
                background: active ? colors.accent : 'transparent',
                color: active ? '#06121F' : colors.textMuted,
                fontWeight: active ? 700 : 500,
              }}
            >
              {KIND_NAME[k]}
            </button>
          );
        })}
      </div>

      {value.kind !== 'solid' && (
        <>
          {/* Gradient preview bar */}
          <div
            style={{
              height: 16,
              borderRadius: '0.2rem',
              marginBottom: '0.45rem',
              background: `linear-gradient(to right, ${stopString(stops)})`,
              border: `1px solid ${colors.border}`,
            }}
          />
          {/* Stop swatches */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: '0.45rem' }}>
            {stops.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Stop ${String(i + 1)}`}
                onClick={() => setSelected(i)}
                style={{
                  position: 'relative',
                  width: 18,
                  height: 18,
                  borderRadius: '0.15rem',
                  border: `2px solid ${i === sel ? colors.accent : colors.border}`,
                  padding: 0,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  ...CHECKER,
                }}
              >
                <span style={{ position: 'absolute', inset: 0, background: s.color }} />
              </button>
            ))}
            <button
              type="button"
              aria-label="Add stop"
              title="Add stop"
              onClick={addStop}
              style={miniBtn}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Remove stop"
              title="Remove stop"
              onClick={removeStop}
              disabled={stops.length <= 2}
              style={{ ...miniBtn, opacity: stops.length <= 2 ? 0.4 : 1 }}
            >
              −
            </button>
          </div>
          {/* Selected stop position */}
          <MiniNumber
            label="position"
            value={Math.round((stops[sel]?.at ?? 0) * 100)}
            min={0}
            max={100}
            suffix="%"
            onCommit={setStopAt}
          />
          {value.kind === 'linear' && (
            <MiniNumber
              label="angle"
              value={Math.round(value.angle)}
              suffix="°"
              onCommit={(v) => onChange({ ...value, angle: v })}
            />
          )}
          {value.kind === 'radial' && (
            <MiniNumber
              label="radius"
              value={Math.round(value.radius)}
              min={1}
              suffix="px"
              onCommit={(v) => onChange({ ...value, radius: Math.max(1, v) })}
            />
          )}
        </>
      )}

      {/* Colour editor (edits the solid colour, or the selected gradient stop) */}
      <ColorEditor value={editorColor} onChange={setStopColor} />
    </div>
  );

  return createPortal(popover, document.body);
}

const miniBtn: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: '0.15rem',
  border: `1px solid ${colors.border}`,
  background: 'transparent',
  color: colors.text,
  cursor: 'pointer',
  fontSize: '0.85rem',
  lineHeight: 1,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function MiniNumber({
  label,
  value,
  min,
  max,
  suffix,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  suffix?: string;
  onCommit: (v: number) => void;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.4rem',
        marginBottom: '0.4rem',
      }}
    >
      <span style={{ color: colors.textMuted, fontSize: '0.68rem' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <input
          type="number"
          defaultValue={value}
          key={`${label}-${String(value)}`}
          {...(min !== undefined ? { min } : {})}
          {...(max !== undefined ? { max } : {})}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onCommit(n);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          style={{
            width: 54,
            background: '#24273d',
            color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: '0.2rem',
            padding: '0.2rem 0.35rem',
            fontSize: '0.7rem',
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            boxSizing: 'border-box',
          }}
        />
        {suffix !== undefined && (
          <span style={{ color: colors.textMuted, fontSize: '0.66rem' }}>{suffix}</span>
        )}
      </span>
    </div>
  );
}

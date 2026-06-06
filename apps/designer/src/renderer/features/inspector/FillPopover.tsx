import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Fill } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { ColorEditor } from './ColorPopover.js';
import { RealtimeNumberInput } from './controls.js';
import { cx } from '../../cx.js';
import * as s from './FillPopover.css.js';

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
      className={s.row}
      style={{ gridTemplateColumns: `${String(props.labelWidth ?? 74)}px 1fr` }}
    >
      <span className={s.label}>{props.label}</span>
      <div className={cx('cg-field', s.field)}>
        <button
          ref={btnRef}
          type="button"
          aria-label={`${props.label} fill`}
          title="Edit fill"
          onClick={() => setOpen((o) => !o)}
          className={cx(s.swatchButton, s.checker)}
        >
          <span className={s.swatchFill} style={{ background: previewCss(fill) }} />
        </button>
        <span className={s.kindLabel}>{KIND_NAME[fill.kind]}</span>
        {props.trailing !== undefined && <span className={s.point}>{props.trailing}</span>}
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
      className={s.popover}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos === null ? 'hidden' : 'visible',
      }}
    >
      {/* Mode switch */}
      <div className={s.modeSwitch}>
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
              className={s.modeButton}
              style={{
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
            className={s.gradientBar}
            style={{ background: `linear-gradient(to right, ${stopString(stops)})` }}
          />
          {/* Stop swatches */}
          <div className={s.stopRow}>
            {stops.map((stop, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Stop ${String(i + 1)}`}
                onClick={() => setSelected(i)}
                className={cx(s.stopButton, s.checker)}
                style={{ border: `2px solid ${i === sel ? colors.accent : colors.border}` }}
              >
                <span className={s.swatchFill} style={{ background: stop.color }} />
              </button>
            ))}
            <button
              type="button"
              aria-label="Add stop"
              title="Add stop"
              onClick={addStop}
              className={s.miniBtn}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Remove stop"
              title="Remove stop"
              onClick={removeStop}
              disabled={stops.length <= 2}
              className={s.miniBtn}
              style={{ opacity: stops.length <= 2 ? 0.4 : 1 }}
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
    <div className={s.miniNumberRow}>
      <span className={s.miniNumberLabel}>{label}</span>
      {/* Bordered field with the unit (% / ° / px) INSIDE it, right after the
          value, so the units line up across rows. `.cg-field` strips the
          inner input's own border/background (see index.css); drag the field to
          scrub (like the property inputs) — every change commits in real time. */}
      <span className={cx('cg-field', s.miniNumberField)}>
        <RealtimeNumberInput
          value={value}
          step={1}
          {...(min !== undefined ? { min } : {})}
          {...(max !== undefined ? { max } : {})}
          onCommit={onCommit}
          ariaLabel={label}
          className={s.miniNumberInput}
        />
        {suffix !== undefined && <span className="cg-unit">{suffix}</span>}
      </span>
    </div>
  );
}

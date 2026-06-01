import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { colors } from '../../theme.js';

/**
 * Form-control primitives for the Inspector. Numeric inputs commit on
 * every keystroke so the canvas preview tracks the operator's edits in
 * real time; a local string buffer + focus ref keeps the caret stable
 * (typing "1." won't snap back to "1") and lets external updates
 * (scrubbing, undo, sibling edits) only resync when the input isn't
 * focused. Text / select / colour controls are simpler and commit
 * onBlur / onChange directly.
 */

const TRAIL_PX = 18;

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: `74px 1fr ${String(TRAIL_PX)}px`,
    gap: '0.35rem',
    alignItems: 'center',
    padding: '0.1rem 0',
    fontSize: '0.74rem',
  },
  rowMulti: {
    display: 'grid',
    gridTemplateColumns: `74px 1fr 1fr ${String(TRAIL_PX)}px`,
    gap: '0.35rem',
    alignItems: 'center',
    padding: '0.1rem 0',
    fontSize: '0.74rem',
  },
  label: { color: colors.textMuted, fontSize: '0.7rem', letterSpacing: '0.02em' },
  input: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.15rem 0.35rem',
    borderRadius: '0.18rem',
    fontSize: '0.74rem',
    width: '100%',
    boxSizing: 'border-box' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  color: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    width: 36,
    height: 22,
    padding: 0,
    cursor: 'pointer',
  },
  trailing: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
} as const;

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Optional element rendered in a trailing column (e.g. KeyframeIndicator). */
  trailing?: JSX.Element;
}

export function NumberField(props: NumberFieldProps): JSX.Element {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{props.label}</span>
      <RealtimeNumberInput
        value={props.value}
        onCommit={props.onCommit}
        step={props.step}
        min={props.min}
        max={props.max}
        style={styles.input}
        ariaLabel={props.label}
      />
      <span style={styles.trailing}>{props.trailing ?? null}</span>
    </div>
  );
}

interface RealtimeNumberInputProps {
  value: number;
  onCommit: (n: number) => void;
  step?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  style?: CSSProperties | undefined;
  ariaLabel?: string | undefined;
}

/**
 * Controlled number input that commits on every keystroke and keeps a
 * local string buffer so typing "1." doesn't get reformatted to "1"
 * mid-typing. External value changes (scrubbing, undo, edits from
 * another input bound to the same property) sync into the buffer only
 * when the input isn't focused.
 */
export function RealtimeNumberInput(props: RealtimeNumberInputProps): JSX.Element {
  const display = formatNumberDisplay(props.value);
  const [buf, setBuf] = useState(display);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setBuf(display);
  }, [display]);

  return (
    <input
      style={props.style}
      type="number"
      value={buf}
      step={props.step}
      min={props.min}
      max={props.max}
      aria-label={props.ariaLabel}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setBuf(display);
      }}
      onChange={(e) => {
        setBuf(e.target.value);
        const n = Number(e.target.value);
        if (Number.isFinite(n) && n !== props.value) props.onCommit(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setBuf(display);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function formatNumberDisplay(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return Number(v.toFixed(2)).toString();
}

interface NumberPairFieldProps {
  label: string;
  x: number;
  y: number;
  onCommit: (x: number, y: number) => void;
  step?: number;
  /** Optional element rendered in a trailing column (e.g. KeyframeIndicator). */
  trailing?: JSX.Element;
}

export function NumberPairField(props: NumberPairFieldProps): JSX.Element {
  let nextX = props.x;
  let nextY = props.y;
  const commit = (): void => props.onCommit(nextX, nextY);
  return (
    <div style={styles.rowMulti}>
      <span style={styles.label}>{props.label}</span>
      <input
        style={styles.input}
        type="number"
        defaultValue={props.x}
        step={props.step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) nextX = n;
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        key={`${props.label}-x-${String(props.x)}`}
      />
      <input
        style={styles.input}
        type="number"
        defaultValue={props.y}
        step={props.step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) nextY = n;
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        key={`${props.label}-y-${String(props.y)}`}
      />
      <span style={styles.trailing}>{props.trailing ?? null}</span>
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (s: string) => void;
  /** Optional element rendered in a trailing column (e.g. KeyframeIndicator). */
  trailing?: JSX.Element;
}

export function TextField(props: TextFieldProps): JSX.Element {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{props.label}</span>
      <input
        style={styles.input}
        type="text"
        defaultValue={props.value}
        onBlur={(e) => props.onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        key={`${props.label}-${props.value}`}
      />
      <span style={styles.trailing}>{props.trailing ?? null}</span>
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onCommit: (v: T) => void;
  /** Optional element rendered in a trailing column (e.g. KeyframeIndicator). */
  trailing?: JSX.Element;
}

export function SelectField<T extends string>(props: SelectFieldProps<T>): JSX.Element {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{props.label}</span>
      <select
        style={styles.input}
        value={props.value}
        onChange={(e) => props.onCommit(e.target.value as T)}
      >
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <span style={styles.trailing}>{props.trailing ?? null}</span>
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onCommit: (hex: string) => void;
  /** Optional element rendered in a trailing column (e.g. KeyframeIndicator). */
  trailing?: JSX.Element;
}

export function ColorField(props: ColorFieldProps): JSX.Element {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{props.label}</span>
      <input
        style={styles.color}
        type="color"
        value={props.value}
        onChange={(e) => props.onCommit(e.target.value)}
      />
      <span style={styles.trailing}>{props.trailing ?? null}</span>
    </div>
  );
}

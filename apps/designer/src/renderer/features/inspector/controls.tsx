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

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: `74px 1fr`,
    gap: '0.35rem',
    alignItems: 'center',
    padding: '0.1rem 0',
    fontSize: '0.74rem',
  },
  rowMulti: {
    display: 'grid',
    gridTemplateColumns: `74px 1fr 1fr`,
    gap: '0.35rem',
    alignItems: 'center',
    padding: '0.1rem 0',
    fontSize: '0.74rem',
  },
  label: { color: colors.textMuted, fontSize: '0.7rem', letterSpacing: '0.02em' },
  // D-010-pic-5 — input + point icon share a single bordered "chip"
  // so the diamond reads as part of the field, not a sibling column.
  inputBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    padding: '0.1rem 0.35rem',
    fontSize: '0.74rem',
    minWidth: 0,
  },
  inputInner: {
    background: 'transparent',
    color: colors.text,
    border: 'none',
    outline: 'none',
    padding: 0,
    fontSize: '0.74rem',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  // D-010-pic-5 — colour chip: swatch | hex text | ◇ inside one box.
  colorChip: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: '0.35rem',
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    padding: '0.1rem 0.35rem',
    minWidth: 0,
  },
  swatch: {
    position: 'relative' as const,
    width: 14,
    height: 14,
    borderRadius: '0.15rem',
    border: `1px solid ${colors.border}`,
    overflow: 'hidden' as const,
    cursor: 'pointer',
  },
  swatchInput: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    border: 'none',
    padding: 0,
    background: 'transparent',
  },
  hexInput: {
    background: 'transparent',
    color: colors.text,
    border: 'none',
    outline: 'none',
    padding: '0.05rem 0',
    fontSize: '0.74rem',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  trailing: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end' as const,
    marginLeft: 'auto',
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
      <div style={styles.inputBox}>
        <RealtimeNumberInput
          value={props.value}
          onCommit={props.onCommit}
          step={props.step}
          min={props.min}
          max={props.max}
          style={styles.inputInner}
          ariaLabel={props.label}
        />
        {props.trailing !== undefined && (
          <span style={styles.trailing}>{props.trailing}</span>
        )}
      </div>
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
      <div style={styles.inputBox}>
        <input
          style={styles.inputInner}
          type="text"
          defaultValue={props.value}
          onBlur={(e) => props.onCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          key={`${props.label}-${props.value}`}
        />
        {props.trailing !== undefined && (
          <span style={styles.trailing}>{props.trailing}</span>
        )}
      </div>
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
      <div style={styles.inputBox}>
        <select
          style={styles.inputInner}
          value={props.value}
          onChange={(e) => props.onCommit(e.target.value as T)}
        >
          {props.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {props.trailing !== undefined && (
          <span style={styles.trailing}>{props.trailing}</span>
        )}
      </div>
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
  const hex = props.value.replace(/^#/, '').toUpperCase();
  return (
    <div style={styles.row}>
      <span style={styles.label}>{props.label}</span>
      <div style={styles.colorChip}>
        <span style={{ ...styles.swatch, background: props.value }} title="Pick a colour">
          <input
            type="color"
            value={props.value}
            onChange={(e) => props.onCommit(e.target.value.toUpperCase())}
            style={styles.swatchInput}
            aria-label={`${props.label} colour`}
          />
        </span>
        <input
          style={styles.hexInput}
          type="text"
          defaultValue={hex}
          onBlur={(e) => {
            const v = e.target.value.trim();
            const next = v.startsWith('#') ? v : `#${v}`;
            if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(next)) props.onCommit(next.toUpperCase());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          key={`${props.label}-${props.value}`}
          aria-label={`${props.label} hex value`}
        />
        {props.trailing !== undefined && (
          <span style={styles.trailing}>{props.trailing}</span>
        )}
      </div>
    </div>
  );
}

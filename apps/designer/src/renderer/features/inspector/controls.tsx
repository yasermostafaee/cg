import { colors } from '../../theme.js';

/**
 * Form-control primitives for the Inspector. All controls are
 * uncontrolled at the React level — they read the canonical value
 * from the store via props and write back via `onCommit` on blur or
 * keypress. This keeps the editor responsive even when the store's
 * downstream effects (iframe reload) are heavier than a re-render.
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
      <input
        style={styles.input}
        type="number"
        defaultValue={props.value}
        step={props.step}
        min={props.min}
        max={props.max}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) props.onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        key={`${props.label}-${String(props.value)}`}
      />
      <span style={styles.trailing}>{props.trailing ?? null}</span>
    </div>
  );
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
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onCommit: (v: T) => void;
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
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onCommit: (hex: string) => void;
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
    </div>
  );
}

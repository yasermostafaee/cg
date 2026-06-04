import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { colors } from '../../theme.js';
import { ColorPicker } from './ColorPopover.js';

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
  // Content-sized variant (see .cg-num-unit) so the value and its unit
  // cluster on the left, leaving the diamond free to sit at the right edge.
  inputInnerAuto: {
    background: 'transparent',
    color: colors.text,
    border: 'none',
    outline: 'none',
    padding: 0,
    fontSize: '0.74rem',
    flex: '0 0 auto',
    width: 'auto',
    minWidth: 0,
    maxWidth: '5rem',
    boxSizing: 'border-box' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  // Single-letter / glyph axis label inside a combined vector segment.
  segIcon: {
    color: colors.textMuted,
    fontSize: '0.65rem',
    fontWeight: 600,
    width: 12,
    flexShrink: 0,
    textAlign: 'center' as const,
  },
  // Pushes the keyframe diamond to the field's right edge.
  point: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  // The whole field/segment is a drag-to-scrub + click-to-edit surface.
  scrubSurface: {
    cursor: 'ew-resize',
    touchAction: 'none' as const,
    userSelect: 'none' as const,
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
} as const;

interface ScrubOpts {
  value: number;
  onCommit: (n: number) => void;
  step?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
}

// Distance the pointer must travel before a press becomes a scrub rather
// than a click — small enough to feel immediate, large enough that a
// click meant to focus-and-type doesn't nudge the value.
const SCRUB_DEADZONE_PX = 3;

/**
 * Runs a horizontal value-scrub gesture from a pointerdown until the next
 * pointerup, via window listeners. Drag right increases / left decreases;
 * 1px ≈ one `stepSize`, hold Shift for fine 0.1× steps. `onEnd(moved)`
 * fires when the gesture ends — `moved` is false for a click that never
 * left the dead-zone, which callers use to fall back to focus-and-type.
 * Commits flow through `onCommit` exactly like typing, so the canvas
 * previews live and the per-gesture history coalescing wired up for
 * canvas drags applies unchanged.
 */
function runScrubGesture(p: {
  startX: number;
  startVal: number;
  stepSize: number;
  min?: number | undefined;
  max?: number | undefined;
  onCommit: (n: number) => void;
  onEnd?: ((moved: boolean) => void) | undefined;
}): void {
  let last = p.startVal;
  let moved = false;
  function apply(ev: PointerEvent): void {
    const dx = ev.clientX - p.startX;
    if (!moved && Math.abs(dx) < SCRUB_DEADZONE_PX) return;
    moved = true;
    const inc = p.stepSize * (ev.shiftKey ? 0.1 : 1);
    let next = p.startVal + Math.round(dx) * inc;
    next = Number(next.toFixed(4));
    if (p.min !== undefined) next = Math.max(p.min, next);
    if (p.max !== undefined) next = Math.min(p.max, next);
    if (next !== last) {
      last = next;
      p.onCommit(next);
    }
  }
  function onUp(): void {
    window.removeEventListener('pointermove', apply);
    window.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    p.onEnd?.(moved);
  }
  // Hold the resize cursor (and suppress text selection) for the whole
  // gesture, even once the pointer slides off the field.
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', apply);
  window.addEventListener('pointerup', onUp);
}

/**
 * Turns a field label/icon into a horizontal "scrubber" (the Loopic
 * pattern — the label carries an `ew-resize` cursor and dragging it
 * adjusts the value). The number input itself is independently
 * scrubbable (see {@link RealtimeNumberInput}); this just makes the
 * label a second, larger grab target.
 *
 * Returns props to spread onto the handle element. Not a hook — it holds
 * no React state; the drag lives in window listeners for its duration.
 */
export function scrubHandle(opts: ScrubOpts): {
  style: CSSProperties;
  onPointerDown: (e: ReactPointerEvent) => void;
} {
  return {
    style: { cursor: 'ew-resize', touchAction: 'none', userSelect: 'none' },
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      runScrubGesture({
        startX: e.clientX,
        startVal: opts.value,
        stepSize: opts.step ?? 1,
        min: opts.min,
        max: opts.max,
        onCommit: opts.onCommit,
      });
    },
  };
}

/**
 * Makes a whole field container (icon + value + unit + any slack) a single
 * scrub / click-to-edit surface, so the entire box behaves like the value —
 * dragging anywhere changes it, a click focuses the inner input for typing.
 * The keyframe diamond (a <button>) is left alone, and clicks while already
 * editing fall through so the caret can be placed normally.
 *
 * Pair with `<RealtimeNumberInput scrub={false} … />` so the input doesn't
 * also start its own gesture.
 */
export function fieldScrub(opts: ScrubOpts): {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
} {
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      if ((e.target as Element).closest('button') !== null) return; // diamond
      const input = e.currentTarget.querySelector('input');
      if (input !== null && document.activeElement === input) return; // editing
      e.preventDefault();
      runScrubGesture({
        startX: e.clientX,
        startVal: opts.value,
        stepSize: opts.step ?? 1,
        min: opts.min,
        max: opts.max,
        onCommit: opts.onCommit,
        onEnd: (moved) => {
          if (!moved && input !== null) input.focus();
        },
      });
    },
  };
}

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Optional dim unit shown after the value (e.g. "°", "%"). */
  suffix?: string;
  /** Optional element rendered outside the field border (e.g. KeyframeIndicator). */
  trailing?: JSX.Element;
}

export function NumberField(props: NumberFieldProps): JSX.Element {
  const opts = {
    value: props.value,
    onCommit: props.onCommit,
    step: props.step,
    min: props.min,
    max: props.max,
  };
  const labelScrub = scrubHandle(opts);
  const field = fieldScrub(opts);
  const hasUnit = props.suffix !== undefined;
  return (
    <div style={styles.row}>
      <span
        style={{ ...styles.label, ...labelScrub.style }}
        onPointerDown={labelScrub.onPointerDown}
        title="Drag to adjust"
      >
        {props.label}
      </span>
      {/* The whole field scrubs the value (Loopic); click focuses to type.
          With a unit the input sizes to its content so the value+unit cluster
          on the left, and the diamond is pushed to the right edge. */}
      <div className="cg-field" style={styles.scrubSurface} onPointerDown={field.onPointerDown}>
        <RealtimeNumberInput
          value={props.value}
          onCommit={props.onCommit}
          step={props.step}
          min={props.min}
          max={props.max}
          scrub={false}
          style={hasUnit ? styles.inputInnerAuto : styles.inputInner}
          className={hasUnit ? 'cg-num-unit' : undefined}
          ariaLabel={props.label}
        />
        {hasUnit && <span className="cg-unit">{props.suffix}</span>}
        {props.trailing !== undefined && <span style={styles.point}>{props.trailing}</span>}
      </div>
    </div>
  );
}

interface VectorAxisProps {
  icon: string;
  ariaLabel: string;
  value: number;
  onCommit: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  /** Keyframe diamond for this axis. */
  point?: JSX.Element;
}

interface VectorFieldProps {
  label: string;
  axes: VectorAxisProps[];
}

/**
 * A labelled row of axes sharing one bordered box (the Loopic pattern for
 * Position X/Y, Drop-Shadow offset X/Y, …). Each segment is independently
 * editable and is itself a drag-to-scrub / click-to-edit surface, with its
 * keyframe diamond at the segment's right edge.
 */
export function VectorField(props: VectorFieldProps): JSX.Element {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{props.label}</span>
      <div className="cg-input-group">
        {props.axes.map((a) => (
          <VectorSeg key={a.ariaLabel} {...a} />
        ))}
      </div>
    </div>
  );
}

function VectorSeg(props: VectorAxisProps): JSX.Element {
  const scrub = fieldScrub({
    value: props.value,
    onCommit: props.onCommit,
    step: props.step,
    min: props.min,
    max: props.max,
  });
  const hasUnit = props.suffix !== undefined;
  return (
    <div className="cg-seg" style={styles.scrubSurface} onPointerDown={scrub.onPointerDown}>
      <span style={styles.segIcon} aria-hidden>
        {props.icon}
      </span>
      <RealtimeNumberInput
        value={props.value}
        onCommit={props.onCommit}
        step={props.step}
        min={props.min}
        max={props.max}
        scrub={false}
        style={hasUnit ? styles.inputInnerAuto : styles.inputInner}
        className={hasUnit ? 'cg-num-unit' : undefined}
        ariaLabel={props.ariaLabel}
      />
      {hasUnit && <span className="cg-unit">{props.suffix}</span>}
      {props.point !== undefined && <span style={styles.point}>{props.point}</span>}
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
  className?: string | undefined;
  ariaLabel?: string | undefined;
  /**
   * Whether the input starts its own scrub gesture on pointerdown. Set to
   * false when an ancestor (see {@link fieldScrub}) owns the whole-field
   * gesture, so the two don't both fire.
   */
  scrub?: boolean | undefined;
}

/**
 * Controlled number input that commits on every keystroke and keeps a
 * local string buffer so typing "1." doesn't get reformatted to "1"
 * mid-typing. External value changes (scrubbing, undo, edits from
 * another input bound to the same property) sync into the buffer only
 * when the input isn't focused.
 *
 * The input is also a horizontal scrubber (the Loopic pattern): dragging
 * anywhere on it adjusts the value (1px ≈ one step, Shift = fine 0.1×),
 * while a plain click still focuses it for typing. The native up/down
 * spinners are hidden globally in `index.css`, so the whole field reads
 * as a draggable number with an `ew-resize` cursor.
 */
export function RealtimeNumberInput(props: RealtimeNumberInputProps): JSX.Element {
  const display = formatNumberDisplay(props.value);
  const [buf, setBuf] = useState(display);
  const [editing, setEditing] = useState(false);
  const focused = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused.current) setBuf(display);
  }, [display]);

  return (
    <input
      ref={inputRef}
      className={props.className}
      style={{ ...props.style, cursor: editing ? 'text' : 'ew-resize', touchAction: 'none' }}
      type="number"
      value={buf}
      step={props.step}
      min={props.min}
      max={props.max}
      aria-label={props.ariaLabel}
      onPointerDown={(e) => {
        // When an ancestor owns the gesture, do nothing here.
        if (props.scrub === false) return;
        // While editing, let the pointer place the caret / select text
        // as usual. Otherwise this press is either a click (focus to
        // type) or the start of a scrub — decided by whether it moves.
        if (e.button !== 0 || focused.current) return;
        e.preventDefault();
        runScrubGesture({
          startX: e.clientX,
          startVal: props.value,
          stepSize: props.step ?? 1,
          min: props.min,
          max: props.max,
          onCommit: props.onCommit,
          onEnd: (moved) => {
            // A click that never left the dead-zone focuses for typing;
            // onFocus selects the whole value so a keystroke replaces it.
            if (!moved) inputRef.current?.focus();
          },
        });
      }}
      onFocus={(e) => {
        focused.current = true;
        setEditing(true);
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        setEditing(false);
        setBuf(display);
      }}
      onChange={(e) => {
        setBuf(e.target.value);
        const n = Number(e.target.value);
        if (Number.isFinite(n) && n !== props.value) props.onCommit(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
          return;
        }
        if (e.key === 'Escape') {
          setBuf(display);
          (e.target as HTMLInputElement).blur();
          return;
        }
        // Arrow up/down step the value by `step` (×10 with Shift), the
        // standard keyboard nudge. Handled explicitly so it clamps to
        // min/max and keeps the buffer in sync while focused.
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const inc = (props.step ?? 1) * (e.shiftKey ? 10 : 1);
          let next = Number((props.value + (e.key === 'ArrowUp' ? inc : -inc)).toFixed(4));
          if (props.min !== undefined) next = Math.max(props.min, next);
          if (props.max !== undefined) next = Math.min(props.max, next);
          if (next !== props.value) {
            props.onCommit(next);
            setBuf(formatNumberDisplay(next));
          }
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
      <div className="cg-field">
        <input
          style={styles.inputInner}
          type="text"
          defaultValue={props.value}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => props.onCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          key={`${props.label}-${props.value}`}
        />
        {props.trailing}
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
      <div className="cg-field">
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
        {props.trailing}
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
      <div className="cg-field">
        <ColorPicker
          value={props.value}
          onChange={props.onCommit}
          ariaLabel={`${props.label} colour`}
        />
        <input
          style={styles.hexInput}
          type="text"
          defaultValue={hex}
          onFocus={(e) => e.currentTarget.select()}
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
        {props.trailing !== undefined && <span style={styles.point}>{props.trailing}</span>}
      </div>
    </div>
  );
}

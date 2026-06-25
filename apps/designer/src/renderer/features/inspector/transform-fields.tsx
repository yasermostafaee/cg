import type { ReactNode } from 'react';
import { Contrast, MoveHorizontal, MoveVertical, RotateCw } from 'lucide-react';
import type { AnimatableProperty } from '@cg/shared-schema';
import { RealtimeNumberInput, fieldScrub } from './controls.js';
import { cx } from '../../cx.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './TransformSection.css.js';

/**
 * Shared transform-field render helpers (D-049). Factored out of
 * `TransformSection` so BOTH the single-element inspector and the
 * multi-selection editor render numeric transform properties with the SAME
 * primitive — an icon + the horizontal-drag `RealtimeNumberInput` + a unit
 * suffix, the whole box a scrub/click-to-edit surface. The single inspector
 * passes a keyframe diamond as `point`; the multi editor omits it and passes
 * `mixed` for a differing value. `TRANSFORM_FIELD_META` is the single source of
 * each property's display (icon, unit, and stored↔shown conversion), so units
 * (opacity `%`, rotation `°`, scale `%`) are defined once.
 */

export interface FieldMeta {
  /** A textual axis label (e.g. `X` / `W`) or an `<Icon>` for the pictographic glyphs. */
  icon: ReactNode;
  ariaLabel: string;
  /** Dim unit shown after the value (e.g. "%", "°"). */
  suffix?: string;
  step: number;
  min?: number;
  max?: number;
  /** Stored value (schema units) → the number shown in the field. */
  toDisplay: (stored: number) => number;
  /** The number shown in the field → stored value (schema units). */
  fromDisplay: (shown: number) => number;
}

const identity = (n: number): number => n;
const toPercent = (n: number): number => Math.round(n * 100);
const fromPercent = (n: number): number => n / 100;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Per-property display metadata — the ONE place icons/units/conversions live.
 * Shared by `TransformSection` (single) and `MultiSelectSection` (multi).
 */
export const TRANSFORM_FIELD_META: Partial<Record<AnimatableProperty, FieldMeta>> = {
  'position.x': {
    icon: 'X',
    ariaLabel: 'X position',
    step: 1,
    toDisplay: identity,
    fromDisplay: identity,
  },
  'position.y': {
    icon: 'Y',
    ariaLabel: 'Y position',
    step: 1,
    toDisplay: identity,
    fromDisplay: identity,
  },
  'size.w': { icon: 'W', ariaLabel: 'Width', step: 1, toDisplay: identity, fromDisplay: identity },
  'size.h': { icon: 'H', ariaLabel: 'Height', step: 1, toDisplay: identity, fromDisplay: identity },
  'scale.x': {
    icon: <Icon icon={MoveHorizontal} size={14} />,
    ariaLabel: 'Scale X',
    suffix: '%',
    step: 1,
    toDisplay: toPercent,
    fromDisplay: fromPercent,
  },
  'scale.y': {
    icon: <Icon icon={MoveVertical} size={14} />,
    ariaLabel: 'Scale Y',
    suffix: '%',
    step: 1,
    toDisplay: toPercent,
    fromDisplay: fromPercent,
  },
  rotation: {
    icon: <Icon icon={RotateCw} size={14} />,
    ariaLabel: 'Rotation',
    suffix: '°',
    step: 1,
    toDisplay: (v) => Math.round(v * 100) / 100,
    fromDisplay: identity,
  },
  opacity: {
    icon: <Icon icon={Contrast} size={14} />,
    ariaLabel: 'Opacity',
    suffix: '%',
    step: 1,
    min: 0,
    max: 100,
    toDisplay: toPercent,
    fromDisplay: (d) => clamp01(fromPercent(d)),
  },
};

export interface FieldProps {
  icon: ReactNode;
  ariaLabel: string;
  value: number;
  step?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  suffix?: string | undefined;
  onCommit: (n: number) => void;
  /** Keyframe diamond for this property (single inspector only). */
  point?: JSX.Element | undefined;
  /** D-049 — the multi-selection values differ on this property. */
  mixed?: boolean | undefined;
  /**
   * D-053 — close the undo group at the gesture endpoint (drag release / Enter /
   * blur). The multi editor passes `markHistoryBoundary` so a live drag/typing
   * burst is ONE undo entry; single selection omits it (relies on coalescing).
   */
  onCommitBoundary?: (() => void) | undefined;
}

/**
 * Build the {@link FieldProps} for a transform property from its
 * `TRANSFORM_FIELD_META`: maps the STORED value to the displayed value, and
 * wraps `commit` so an edit (in display units) is converted back to stored
 * units. Used by both inspectors so icon/unit/conversion stay in one place.
 */
export function transformFieldProps(
  property: AnimatableProperty,
  storedValue: number,
  commit: (stored: number) => void,
): Omit<FieldProps, 'point' | 'mixed'> {
  const meta = TRANSFORM_FIELD_META[property];
  if (meta === undefined) {
    // No metadata — render a bare integer field (defensive; every transform
    // property the inspectors use is in the table).
    return { icon: '?', ariaLabel: property, value: storedValue, step: 1, onCommit: commit };
  }
  return {
    icon: meta.icon,
    ariaLabel: meta.ariaLabel,
    suffix: meta.suffix,
    step: meta.step,
    min: meta.min,
    max: meta.max,
    value: meta.toDisplay(storedValue),
    onCommit: (shown) => commit(meta.fromDisplay(shown)),
  };
}

/**
 * Icon + scrubbable number + optional unit. When a unit is present the input
 * sizes to its content (.cg-num-unit) so the unit hugs the value next to the
 * icon. A `mixed` field shows a neutral placeholder until edited.
 */
function FieldBody(props: FieldProps): JSX.Element {
  const hasUnit = props.suffix !== undefined;
  return (
    <>
      <span className={s.icon} aria-hidden>
        {props.icon}
      </span>
      <RealtimeNumberInput
        value={props.value}
        onCommit={props.onCommit}
        step={props.step}
        min={props.min}
        max={props.max}
        scrub={false}
        mixed={props.mixed}
        placeholder={props.mixed === true ? '—' : undefined}
        onCommitBoundary={props.onCommitBoundary}
        className={cx(hasUnit ? s.inputUnit : s.input, hasUnit && 'cg-num-unit')}
        ariaLabel={props.ariaLabel}
      />
      {hasUnit && <span className="cg-unit">{props.suffix}</span>}
    </>
  );
}

/** One axis of a combined vector field — the whole segment scrubs the value
 *  (drag) and edits live (D-053); diamond (if any) at the segment's right edge.
 *  The multi editor sets a history boundary on commit via `onCommitBoundary`. */
export function Seg(props: FieldProps): JSX.Element {
  const scrub = fieldScrub(props);
  return (
    <div className={cx('cg-seg', s.scrubSurface)} onPointerDown={scrub.onPointerDown}>
      <FieldBody {...props} />
      {props.point !== undefined && <span className={s.point}>{props.point}</span>}
    </div>
  );
}

/** Standalone field — icon, value+unit on the left, diamond (if any) at the
 *  right, all inside one bordered box; the whole box scrubs the value (drag) and
 *  edits live (D-053). */
export function SingleField(props: FieldProps): JSX.Element {
  const scrub = fieldScrub(props);
  return (
    <div className={cx('cg-field', s.scrubSurface)} onPointerDown={scrub.onPointerDown}>
      <FieldBody {...props} />
      {props.point !== undefined && <span className={s.point}>{props.point}</span>}
    </div>
  );
}

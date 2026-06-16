import { cx } from '../../cx.js';
import { Control } from '../../ui/Control.js';
import * as s from './AlignButtonGroup.css.js';

/** One alignment option — its stored value, its glyph, and its accessible label. */
export interface AlignOption<T extends string> {
  readonly value: T;
  readonly icon: string;
  readonly label: string;
}

/**
 * D-045 — the shared alignment button-group (the text element's group is the model). A
 * bare-`Control` icon group with an accent active (pressed) state, used for BOTH horizontal
 * (`align`) and vertical (`verticalAlign`) alignment across text / ticker / clock /
 * sequence, so D-048 can polish a single control. Alignment is NON-keyframable: each caller
 * writes via `designerStore.updateElement`; the group renders no keyframe diamond.
 */
export function AlignButtonGroup<T extends string>({
  ariaLabel,
  current,
  options,
  onChange,
}: {
  /** Group label, e.g. "Horizontal alignment" / "Vertical alignment". */
  ariaLabel: string;
  /**
   * The element's current value. May be a value OUTSIDE `options` (e.g. text's schema-only
   * 'justify', which the 3-button group never exposes) → then no button is active.
   */
  current: string;
  options: readonly AlignOption<T>[];
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <div className={s.group} role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === current;
        return (
          <Control
            key={opt.value}
            variant="bare"
            className={cx(s.button, active && s.buttonActive)}
            onClick={() => onChange(opt.value)}
            aria-label={opt.label}
            aria-pressed={active}
            title={opt.label}
          >
            {opt.icon}
          </Control>
        );
      })}
    </div>
  );
}

/**
 * Horizontal alignment (start / center / end) — the text 3-button model. 'justify' is
 * deliberately NOT an option (text keeps it in the SCHEMA only; it is never exposed here,
 * and the other kinds don't have it). Used by text, clock, and sequence.
 */
export const H_ALIGN_OPTIONS = [
  { value: 'start', icon: '⫷', label: 'Align start' },
  { value: 'center', icon: '☰', label: 'Align center' },
  { value: 'end', icon: '⫸', label: 'Align end' },
] as const satisfies readonly AlignOption<'start' | 'center' | 'end'>[];

/** Vertical alignment (top / middle / bottom) — used by text, ticker, clock, and sequence. */
export const V_ALIGN_OPTIONS = [
  { value: 'top', icon: '⤒', label: 'Vertical top' },
  { value: 'middle', icon: '⇳', label: 'Vertical middle' },
  { value: 'bottom', icon: '⤓', label: 'Vertical bottom' },
] as const satisfies readonly AlignOption<'top' | 'middle' | 'bottom'>[];

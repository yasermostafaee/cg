import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../cx.js';
import { Icon } from './Icon.js';
import * as s from './Select.css.js';

/**
 * THE dropdown — the design-system `<select>` (same rule as Button/Control:
 * a raw `<select>` outside renderer/ui is a lint error). Bakes in the dark
 * `color-scheme` (Chromium otherwise paints the popup list with the OS light
 * theme), token colours, and hover / focus-visible / disabled states.
 * Per-site `className` may EXTEND the resting look (width, font), never
 * redefine the interaction states.
 *
 * The `<select>` is wrapped so a REAL lucide chevron can be overlaid at its right
 * edge (a `background-image` chevron kept getting wiped by per-site `background`
 * overrides). `pointer-events: none` on the chevron lets clicks reach the select.
 */
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...rest },
  ref,
): JSX.Element {
  return (
    <span className={s.wrap}>
      <select ref={ref} className={cx(s.select, className)} {...rest}>
        {children}
      </select>
      <Icon icon={ChevronDown} size={14} className={s.chevron} />
    </span>
  );
});

import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cx } from '../cx.js';
import * as s from './Select.css.js';

/**
 * THE dropdown — the design-system `<select>` (same rule as Button/Control:
 * a raw `<select>` outside renderer/ui is a lint error). Bakes in the dark
 * `color-scheme` (Chromium otherwise paints the popup list with the OS light
 * theme), token colours, and hover / focus-visible / disabled states.
 * Per-site `className` may EXTEND the resting look (width, font), never
 * redefine the interaction states.
 */
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...rest },
  ref,
): JSX.Element {
  return (
    <select ref={ref} className={cx(s.select, className)} {...rest}>
      {children}
    </select>
  );
});

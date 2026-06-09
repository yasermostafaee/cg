import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../cx.js';
import * as s from './Button.css.js';

export type ButtonVariant = keyof typeof s.variant;
export type ButtonSize = keyof typeof s.size;

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Pressed/active look for toggles & segmented controls (set with aria-pressed). */
  selected?: boolean;
};

/**
 * App-local design-system button — THE way to make a labelled/text button in the
 * Designer. Forwards every native `<button>` prop (onClick, disabled, aria-*,
 * title, ref…), so callers get the shared hover / active / focus-visible /
 * disabled states for free. Always `type="button"`.
 *
 * `variant="bare"` is the escape hatch for a bespoke surface that brings its own
 * look via `className` (a menu item, a list row): it applies only the `base`
 * states, no chrome skeleton. For icon-only buttons use {@link Control}.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', selected = false, className, ...rest },
  ref,
) {
  const bare = variant === 'bare';
  return (
    <button
      ref={ref}
      type="button"
      className={cx(
        s.base,
        !bare && s.box,
        s.variant[variant],
        bare ? undefined : s.size[size],
        selected && s.selected,
        className,
      )}
      {...rest}
    />
  );
});

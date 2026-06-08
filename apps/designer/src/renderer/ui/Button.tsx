import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../cx.js';
import * as s from './Button.css.js';

export type ButtonVariant = keyof typeof s.variant;
export type ButtonSize = keyof typeof s.size;

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * App-local design-system button. Thin wrapper over the {@link s} recipe that
 * forwards every native `<button>` prop (onClick, disabled, aria-*, title…), so
 * callers get the shared hover / active / focus-visible / disabled states for
 * free. Always `type="button"` — these are momentary command/action buttons, never
 * form submitters or pressed toggles.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button type="button" className={cx(s.base, s.variant[variant], s.size[size], className)} {...rest} />
  );
}

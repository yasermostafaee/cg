import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../cx.js';
import * as s from './Button.css.js';

export type ControlVariant = keyof typeof s.variant;
export type ControlSize = keyof typeof s.icon;

export type ControlProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: ControlVariant;
  size?: ControlSize;
  /** Pressed/active look for icon toggles (set with aria-pressed). */
  selected?: boolean;
  /** Icon buttons have no text, so an accessible label is required. */
  'aria-label': string;
};

/**
 * App-local design-system icon button — a square {@link Button} sized for a single
 * glyph/icon, defaulting to the quiet `ghost` look. Same shared hover / active /
 * focus-visible / disabled states; an `aria-label` is required since there's no
 * text. Forwards every native `<button>` prop + ref.
 */
export const Control = forwardRef<HTMLButtonElement, ControlProps>(function Control(
  { variant = 'ghost', size = 'md', selected = false, className, ...rest },
  ref,
) {
  // `bare` is the escape hatch for an icon button that brings its own look via
  // `className`: states only, no square skeleton (so it can't fight that class).
  const bare = variant === 'bare';
  return (
    <button
      ref={ref}
      type="button"
      className={cx(
        s.base,
        !bare && s.box,
        s.variant[variant],
        bare ? undefined : s.icon[size],
        selected && s.selected,
        className,
      )}
      {...rest}
    />
  );
});


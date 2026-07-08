import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant =
  | 'play'
  | 'primary'
  | 'secondary'
  | 'caution'
  | 'danger'
  | 'ghost'
  | 'default';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  play: 'cg-btn--play',
  primary: 'cg-btn--primary',
  secondary: 'cg-btn--secondary',
  caution: 'cg-btn--caution',
  danger: 'cg-btn--danger',
  ghost: 'cg-btn--ghost',
  default: '',
};

/** Class for a `.cg-btn` of a given variant — shared by Button and AsyncButton. */
export function buttonClass(variant: ButtonVariant = 'default', extra = ''): string {
  return ['cg-btn', VARIANT_CLASS[variant], extra].filter(Boolean).join(' ');
}

/**
 * R-007 — a plain styled button for PURE-LOCAL actions (no bridge round-trip):
 * hover / active-pressed / focus-visible / disabled via `controls.css`. For a
 * bridge round-trip use `AsyncButton` instead (busy / success / error).
 */
export function Button({
  variant = 'default',
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button type="button" className={buttonClass(variant, className)} {...rest}>
      {children}
    </button>
  );
}

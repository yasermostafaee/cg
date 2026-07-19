import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cssVars } from '../theme.js';

export type ButtonVariant =
  | 'play'
  | 'air'
  | 'primary'
  | 'secondary'
  | 'caution'
  | 'caution-strong'
  | 'danger'
  | 'ghost'
  | 'default';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  play: 'cg-btn--play',
  air: 'cg-btn--air',
  primary: 'cg-btn--primary',
  secondary: 'cg-btn--secondary',
  caution: 'cg-btn--caution',
  'caution-strong': 'cg-btn--caution-strong',
  danger: 'cg-btn--danger',
  ghost: 'cg-btn--ghost',
  default: '',
};

/**
 * The ONE place a variant's accent colour is named.
 *
 * The buttons take their colour from `controls.css` classes and the right-click
 * menu paints inline, so without a shared source the two drift — and they had:
 * the menu used to map a handful of variants onto its own `default | caution |
 * danger` scheme with its own values (the dark `error` red, not the button's
 * danger red), producing a third, half-matching palette. Both now read from here,
 * so a menu item cannot be a different colour from the button it mirrors.
 *
 * `undefined` means "inherit the surface text colour" — the neutral variants.
 */
export const VARIANT_ACCENT: Record<ButtonVariant, string | undefined> = {
  play: cssVars['--r-onair'],
  air: cssVars['--r-onair'],
  primary: cssVars['--r-accent-strong'],
  secondary: cssVars['--r-accent'],
  caution: cssVars['--r-caution'],
  'caution-strong': cssVars['--r-caution'],
  danger: cssVars['--r-danger'],
  ghost: undefined,
  default: undefined,
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

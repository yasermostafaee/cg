import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cssVars } from '../theme.js';

/**
 * NB there is deliberately no `air` variant. It existed for the Inspector's UPDATE
 * (C-012: an outlined on-air hue meaning "this reaches air") and was removed when
 * that button went neutral: colour belongs to STATE in this build, never to an
 * affordance. Re-adding it would hand a transmission colour back to a control — do
 * not. Solid `--r-onair` remains PLAY's alone.
 */
export type ButtonVariant =
  | 'play'
  | 'primary'
  | 'secondary'
  | 'caution'
  | 'caution-strong'
  | 'danger'
  | 'ghost'
  | 'verb'
  | 'neutral'
  | 'icon'
  | 'default';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  play: 'cg-btn--play',
  primary: 'cg-btn--primary',
  secondary: 'cg-btn--secondary',
  caution: 'cg-btn--caution',
  'caution-strong': 'cg-btn--caution-strong',
  danger: 'cg-btn--danger',
  ghost: 'cg-btn--ghost',
  verb: 'cg-btn--verb',
  neutral: 'cg-btn--neutral',
  icon: 'cg-btn--icon',
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
  primary: cssVars['--r-accent-strong'],
  secondary: cssVars['--r-accent'],
  caution: cssVars['--r-caution'],
  'caution-strong': cssVars['--r-caution'],
  danger: cssVars['--r-danger'],
  ghost: undefined,
  // NEUTRAL BY CONTRACT. A row verb inherits the surface text colour and carries
  // no accent at all — the row's STATE owns colour now. `undefined` here is the
  // load-bearing part: the right-click menu paints from this table, so a menu
  // item mirroring a neutral button stays neutral too, without a second rule.
  verb: undefined,
  // The same neutral contract for a TEXT button (the bulk verbs).
  neutral: undefined,
  // …and for a SMALL FIXED icon button in a free-standing control row. Same look,
  // third geometry — see `controls.css`: `--verb`'s `width: 100%` is column geometry
  // and stretches anything that is not in a sized column.
  icon: undefined,
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

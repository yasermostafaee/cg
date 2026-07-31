import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cssVars } from '../theme.js';

/**
 * NB there is deliberately no `air` variant. It existed for the Inspector's UPDATE
 * (C-012: an outlined on-air hue meaning "this reaches air") and was removed
 * because it put a TRANSMISSION colour on an affordance. Re-adding it would hand
 * that colour back — do not. Solid `--r-onair` remains PLAY's alone.
 *
 * That ban is about the AIR HUE and it is unchanged. What HAS changed is the
 * blanket "colour belongs to STATE, never to an affordance" this comment used to
 * assert: `accent` (owner request) gives exactly three Inspector controls a SKY
 * fill to mark the action a surface exists to perform. Sky is the interactive
 * accent and has never been a state colour, and the Inspector has no row state
 * competing for the eye. The rule that replaced the blanket one is written out at
 * `.cg-btn--accent` in `controls.css`: ONE MEANING PER SURFACE.
 */
export type ButtonVariant =
  | 'play'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'commit'
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
  accent: 'cg-btn--accent',
  commit: 'cg-btn--commit',
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
  // THE ACCENTED ACTION — the sky the filled variant is built from, so a
  // right-click item mirroring one of these three reads as the same control.
  accent: cssVars['--r-accent'],
  // COMMIT — the Inspector's UPDATE. `--r-verb-play`, deliberately NOT `--r-onair`:
  // the play-family green without the hue that means a graphic is on the output.
  commit: cssVars['--r-verb-play'],
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
  active,
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  /**
   * This control is a TOGGLE and it is currently ENGAGED — paints the `.is-on`
   * fill from `controls.css`.
   *
   * A prop on the primitive rather than a class name callers pass, for the reason
   * every other state here is: `is-on` is one typo away from silently doing
   * nothing, and a renderer that hand-spells control classes is the ad-hoc styling
   * the design system forbids.
   *
   * NO `aria-pressed`, deliberately. The only toggle using this flips its LABEL
   * (REHEARSE ↔ END REHEARSE), and a changing label plus `aria-pressed` announces
   * the state twice and contradictorily — "END REHEARSE, pressed". The label
   * already carries the state for assistive tech; this prop is the VISUAL half.
   * A future toggle with a STATIC label should pass `aria-pressed` itself.
   */
  active?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      className={buttonClass(
        variant,
        [active === true ? 'is-on' : '', className].filter(Boolean).join(' '),
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

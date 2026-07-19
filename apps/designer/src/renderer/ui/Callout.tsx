import type { ReactNode } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import { cx } from '../cx.js';
import { Icon } from './Icon.js';
import * as s from './Callout.css.js';

export type CalloutVariant = keyof typeof s.variant;

const DEFAULT_ICON: Record<CalloutVariant, ReactNode> = {
  info: <Icon icon={Info} size={16} />,
  // A caution shares the danger glyph but not its urgency — the amber tint carries
  // the difference. Its DEFAULT role is `status`, but role and colour are independent:
  // a consumer may pass `role="alert"` for a caution that is still an assertive
  // announcement (the "won't auto-close" hold banner).
  caution: <Icon icon={TriangleAlert} size={16} />,
  danger: <Icon icon={TriangleAlert} size={16} />,
};

/**
 * App-local design-system callout. A prominent, role-flagged message box for
 * notices that must not be buried. `danger` announces itself with `role="alert"`;
 * `info` / `caution` default to `role="status"`. Pass a custom `icon` or `false` to
 * suppress it.
 *
 * `role` overrides the variant-derived default. COLOUR and ASSERTIVENESS are
 * independent axes: the amber caution palette says "legitimate but notice this",
 * while `role="alert"` says "announce this immediately" — a state can be both
 * (the content-driven "won't auto-close" banner). #352 conflated them by deriving
 * the role from the variant alone, which silently dropped that banner out of the
 * alert channel when it was recoloured; this prop is the seam that keeps a restyle
 * from ever changing semantics again.
 */
export function Callout({
  variant = 'info',
  icon,
  role,
  children,
  className,
}: {
  variant?: CalloutVariant;
  icon?: ReactNode | false;
  role?: 'alert' | 'status';
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const glyph = icon === false ? null : (icon ?? DEFAULT_ICON[variant]);
  return (
    <div
      className={cx(s.base, s.variant[variant], className)}
      role={role ?? (variant === 'danger' ? 'alert' : 'status')}
    >
      {glyph !== null && (
        <span className={s.icon} aria-hidden>
          {glyph}
        </span>
      )}
      <span>{children}</span>
    </div>
  );
}

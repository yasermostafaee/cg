import type { ReactNode } from 'react';
import { cx } from '../cx.js';
import * as s from './Callout.css.js';

export type CalloutVariant = keyof typeof s.variant;

const DEFAULT_ICON: Record<CalloutVariant, string> = {
  info: 'ℹ',
  danger: '⚠',
};

/**
 * App-local design-system callout. A prominent, role-flagged message box for
 * notices that must not be buried. `danger` announces itself with `role="alert"`;
 * `info` uses `role="status"`. Pass a custom `icon` or `false` to suppress it.
 */
export function Callout({
  variant = 'info',
  icon,
  children,
  className,
}: {
  variant?: CalloutVariant;
  icon?: ReactNode | false;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const glyph = icon === false ? null : (icon ?? DEFAULT_ICON[variant]);
  return (
    <div
      className={cx(s.base, s.variant[variant], className)}
      role={variant === 'danger' ? 'alert' : 'status'}
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

import type { CSSProperties, ReactNode } from 'react';
import { tagProps, type TagRole } from '@cg/ui';

/**
 * 🔴 `TAG-NOT-BUTTON-07` — THE NON-INTERACTIVE MARK. The Designer's half of the shared
 * contract in `@cg/ui` (`tag.ts` + the `[data-cg-tag]` rule in `theme.css`); the Runtime has
 * its own copy of this component for the same reason both apps have their own `Button` —
 * `@cg/ui` is tokens-only and components live app-local.
 *
 * A `<span>`, not focusable, no hover or active treatment. There is no `onClick` on this type,
 * no `tabIndex`, and `role` is a closed union of NON-interactive roles, so a caller who tries
 * to make a tag pressable gets a type error rather than a comment to ignore. The complement
 * stays where it belongs: the status bar's issues pill DOES something and therefore remains a
 * real `Button` with the focus ring `base` bakes in — chip-shaped, and correctly so.
 *
 * ⚠ Appearance is the caller's. `className` carries the app's existing vanilla-extract style
 * unchanged, so adopting this moved no pixel — measured in Chromium before and after.
 */
export function Tag({
  className,
  children,
  role,
  title,
  style,
  ...data
}: {
  className?: string | undefined;
  children: ReactNode;
  /** A NON-interactive ARIA role only — see `TagRole`. `role="button"` is not expressible. */
  role?: TagRole | undefined;
  title?: string | undefined;
  style?: CSSProperties | undefined;
  'aria-label'?: string | undefined;
  'aria-hidden'?: boolean | 'true' | 'false' | undefined;
  'data-testid'?: string | undefined;
}): JSX.Element {
  return (
    <span
      {...tagProps}
      {...(className !== undefined ? { className } : {})}
      {...(role !== undefined ? { role } : {})}
      {...(title !== undefined ? { title } : {})}
      {...(style !== undefined ? { style } : {})}
      {...data}
    >
      {children}
    </span>
  );
}

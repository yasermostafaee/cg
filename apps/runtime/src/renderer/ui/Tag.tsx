import type { CSSProperties, ReactNode } from 'react';
import { tagProps, type TagRole } from '@cg/ui';

/**
 * 🔴 `TAG-NOT-BUTTON-07` — THE NON-INTERACTIVE MARK. Every tag, badge, chip and pill that
 * DOES NOTHING when pressed renders through here.
 *
 * It is a `<span>`, it is not focusable, and it carries no hover or active treatment (the
 * contract and the two declarations that enforce it live in `@cg/ui` — `tag.ts` and the
 * `[data-cg-tag]` rule in `theme.css`). The complement is not this component's job and must
 * not be routed through it: a chip that DOES something stays a real `Button`, keyboard
 * reachable, with the focus ring the primitive already bakes in.
 *
 * ── WHY THE PROPS ARE A CLOSED LIST ───────────────────────────────────────────────────────
 *
 * Documentation adjacent to a defect does not prevent it — this tree has paid for that twice
 * (`STATION-CHROME-02`'s `borderBottomColor`, and the two rounds of style edits that preceded
 * this prompt). So the shape is enforced where it cannot be talked past: there is no `onClick`
 * on this type, no `tabIndex`, and `role` is a closed union of NON-interactive roles. A caller
 * who tries to make a tag pressable gets a type error at the call site, before any test runs.
 * The runtime guard (`tests/tagsAreNotButtons.dom.test.ts`) catches the other direction — a
 * tag hand-spelled as a raw `<span>` that never came through here at all.
 *
 * ⚠ APPEARANCE IS STILL THE CALLER'S. `className` carries the app's existing tag treatment
 * (`cg-setup-tag`, `cg-pill`, `cg-badge`, …) unchanged, so adopting this component moved no
 * pixel — verified in Chromium against the reference, whose `.tag` this app already matched.
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
  'data-section-commit'?: string | undefined;
  'data-output-count'?: string | undefined;
  'data-audio-summary'?: string | undefined;
  'data-layer-summary'?: string | undefined;
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

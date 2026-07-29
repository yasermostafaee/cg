import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface IconProps {
  /**
   * The lucide icon component to render. Import per-icon from `lucide-react`
   * (named imports are tree-shaken, so only used icons reach the bundle).
   */
  icon: LucideIcon;
  /** Square size in px (default 15 — sized to sit beside the row button text). */
  size?: number;
  /**
   * Mirror horizontally under RTL. Opt-in for DIRECTIONAL icons (a next/advance
   * chevron); the default is NO mirror, so the deliberate orientation of
   * transport icons is preserved. Persian/RTL is a core requirement here, and a
   * PLAY triangle that flips is a PLAY triangle that means "rewind".
   */
  flipRtl?: boolean;
  style?: CSSProperties;
}

/**
 * R-028 part B — the Runtime's app-local icon, backed by `lucide-react`.
 *
 * The SAME dependency the Designer uses (`apps/designer/.../ui/Icon.tsx`),
 * deliberately: a second icon set would mean two visual languages across two
 * apps one operator uses. This is a separate file rather than a shared one only
 * because `@cg/ui` is tokens-only by house rule and the two apps style
 * differently (the Designer uses vanilla-extract, the Runtime inline styles +
 * `controls.css`) — the CONTRACT is matched: one `size`, `currentColor`
 * inheritance, `aria-hidden` by default, opt-in RTL mirroring.
 *
 * Icons are DECORATIVE here. Every row verb keeps its word beside the glyph —
 * an operator under time pressure should never have to decode a symbol to know
 * whether they are about to STOP (graceful) or CLEAR (hard kill), which in this
 * product are different actions with inverted meanings from the reference
 * product. `aria-hidden` is therefore right: the interactive parent carries the
 * accessible name.
 */
export function Icon({
  icon: LucideComponent,
  size = 15,
  flipRtl = false,
  style,
}: IconProps): JSX.Element {
  return (
    <LucideComponent
      size={size}
      aria-hidden="true"
      focusable="false"
      style={{
        flexShrink: 0,
        ...(flipRtl ? { transform: 'scaleX(var(--cg-icon-flip, 1))' } : {}),
        ...style,
      }}
    />
  );
}

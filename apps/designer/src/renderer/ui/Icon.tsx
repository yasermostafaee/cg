import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../cx.js';
import * as s from './Icon.css.js';

export interface IconProps {
  /**
   * The lucide icon component to render. Import per-icon from `lucide-react`
   * (named imports are tree-shaken, so only used icons reach the bundle).
   */
  icon: LucideIcon;
  /** Square size in px (default 16). */
  size?: number;
  /** Stroke width passthrough (lucide's default is 2). */
  strokeWidth?: number;
  /**
   * Mirror horizontally under RTL. Opt-in for DIRECTIONAL icons (back arrow,
   * expand / collapse chevron, submenu arrow); the default is NO mirror so the
   * deliberate orientation of tool / transport / alignment icons is preserved.
   */
  flipRtl?: boolean;
  className?: string;
  /**
   * Inline style passthrough to the `<svg>`. Mainly for per-instance `color` (the
   * icon strokes with `currentColor`, e.g. the timeline layer-type tint).
   */
  style?: CSSProperties;
}

/**
 * App-local design-system icon — THE way to render a UI icon in the Designer,
 * backed by `lucide-react`. Centralizes a single `size`, `currentColor`
 * inheritance (lucide strokes with `currentColor` by default, exactly preserving
 * the monochrome / CSS-`color` behaviour the Unicode glyphs relied on),
 * `aria-hidden` (icons are decorative — the interactive parent `Button` /
 * `Control` keeps its own `aria-label` / `title`), and opt-in RTL mirroring.
 *
 * `@cg/ui` stays tokens-only, so this lives app-local beside `Button` / `Control`.
 */
export function Icon({
  icon: LucideComponent,
  size = 16,
  strokeWidth,
  flipRtl = false,
  className,
  style,
}: IconProps): JSX.Element {
  return (
    <LucideComponent
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden
      className={cx(flipRtl && s.flipRtl, className)}
      style={style}
    />
  );
}

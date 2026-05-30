// Public surface of @cg/ui.
//
// Design tokens + a small classnames helper. The global theme lives in
// `@cg/ui/theme.css` (imported once per app entry point).

export { chrome, spacing, radius, fontSize, fontStack, tokens } from './tokens.js';

/**
 * Join truthy class names. Tiny `clsx` stand-in so feature code can compose
 * conditional classes without a dependency.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}

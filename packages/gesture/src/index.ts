/**
 * `@cg/gesture` — B-140.
 *
 * ONE headless pointer-drag gesture, shared by the Runtime's `ShellDivider` and
 * the Designer's `Splitter`. Behaviour only: no styles, no tokens, no markup, so
 * `@cg/ui` stays tokens-only and components stay app-local.
 */
export { useDragGesture, type DragGesture, type DragGestureOptions } from './useDragGesture.js';
export { mountShield, type Shield } from './shield.js';

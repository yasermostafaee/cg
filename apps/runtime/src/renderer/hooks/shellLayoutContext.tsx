import { createContext, useContext, type ReactNode } from 'react';
import type { ShellLayout } from './useShellLayout.js';

/**
 * The workspace geometry, available to any panel WITHOUT being threaded through
 * its props.
 *
 * This exists for one reason: the fullscreen affordance had to become a property
 * of the panel PRIMITIVE rather than something each panel remembers to add.
 * Layers had a fullscreen button and the Inspector did not, precisely because
 * both were wired by hand — the same class of gap as tooltips being per-button.
 * A context means `Panel` can render its own fullscreen control, so a panel
 * added next year gets one by existing.
 *
 * Prop-drilling would have worked too, and is normally the better default — but
 * it re-creates the failure mode: a new panel compiles perfectly well while its
 * author forgets to pass `layout`, and the missing button is invisible until an
 * operator needs it. Here the primitive cannot be used without the context.
 */
const ShellLayoutContext = createContext<ShellLayout | null>(null);

export function ShellLayoutProvider({
  layout,
  children,
}: {
  layout: ShellLayout;
  children: ReactNode;
}): JSX.Element {
  return <ShellLayoutContext.Provider value={layout}>{children}</ShellLayoutContext.Provider>;
}

/**
 * The layout a `Panel` should obey, or an inert stand-in.
 *
 * WHY THIS DEGRADES INSTEAD OF THROWING. A throw during render, with no error
 * boundary above it, unmounts the tree — a blank screen. On a playout console
 * that is a catastrophic response to a cosmetic fault: the worst a missing
 * provider can cause is a panel without its fullscreen button. Trading "one
 * button is absent" for "the operator's whole surface is gone" is not a trade
 * worth making, whatever it buys in strictness.
 *
 * It is also no longer needed as a guard. The gap this arrangement was built to
 * close — each panel remembering its own fullscreen control, and the Inspector
 * silently not having one — is closed STRUCTURALLY by the button living inside
 * `Panel`. The only way to lose it now is to render the whole shell outside the
 * provider, which is one obvious composition mistake in one file, not a thing
 * that can rot quietly per panel.
 *
 * The stand-in reports `focus: 'none'` and no-op setters, so a panel outside the
 * provider renders normally and simply offers no fullscreen toggle.
 */
const INERT: ShellLayout = {
  inspectorPx: 320,
  monitorPx: 180,
  focus: 'none',
  // `narrow` suppresses the fullscreen control, which is exactly right here: with
  // no provider there is no shell to give a panel.
  narrow: true,
  setInspectorPx: () => undefined,
  setMonitorPx: () => undefined,
  setFocus: () => undefined,
  reset: () => undefined,
  customized: false,
};

export function useShellLayoutContext(): ShellLayout {
  return useContext(ShellLayoutContext) ?? INERT;
}

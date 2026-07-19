import type { LottiePlayerHandle } from '@cg/lottie-bridge';

/**
 * D-125 Phase 3c — container → mounted player handle, so `bindings.ts` can route a
 * `lottie-override` field value to the right animation the same way `tickerDriverFor`
 * routes `ticker-items` (the binding path only holds the element's DOM node via
 * `elementMap`). Lives in its OWN module: `bindings.ts` must not import `runtime.ts`
 * (which imports bindings — a cycle), and the WeakMap keeps teardown free — a removed
 * subtree's containers just drop out.
 */
const registry = new WeakMap<HTMLElement, LottiePlayerHandle>();

/** Called at wiring time, right after the player mounts into its container. */
export function registerLottiePlayer(container: HTMLElement, handle: LottiePlayerHandle): void {
  registry.set(container, handle);
}

/** The mounted player for a Lottie element's container, if any (and still alive). */
export function lottiePlayerFor(container: HTMLElement): LottiePlayerHandle | undefined {
  const handle = registry.get(container);
  return handle !== undefined && handle.isAlive ? handle : undefined;
}

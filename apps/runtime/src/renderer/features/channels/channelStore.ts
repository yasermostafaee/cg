import { useSyncExternalStore } from 'react';

/**
 * `RUNTIME-REDESIGN-01` Phase 7 (`PROMPT.md` §7) — **WHICH CHANNEL THE CONSOLE IS SCOPED TO,
 * as session state readable by every surface that is per-channel.**
 *
 * It used to be a `useState` inside `ChannelScope`, which was right while nothing else needed
 * it. Station setup's Channel tab is per-channel (the reference keys a whole setup instance by
 * channel: `stationSetupInstances.get(id)`), and it is mounted OUTSIDE the scope, so the choice
 * has to live where both can read it — the same reason `stationSetupStore` and `sourceStore`
 * are modules rather than props threaded through `App`.
 *
 * ── WHAT IS STORED, AND WHAT IS NOT ──────────────────────────────────────────
 *
 * The operator's CHOICE only — a channel id, or `null` when none has been made. Not the list,
 * which is derived from bridge state (`channelList.ts`), and not the resolved channel, which
 * is `resolveSelectedChannel(list, choice, bank)` wherever it is needed. A store that cached
 * the resolution would have to be told when the list changed; one that stores the choice
 * cannot go stale.
 *
 * ⚠ SESSION-ONLY, NOT PERSISTED — no key, file or schema (`PROMPT.md` §7, §11). A remembered
 * channel would be a second thing to check after a restart, and the reset-to-known-state
 * doctrine (owner answer A13) prefers the bank's channel, which is the one the console has
 * always opened on.
 */

let choice: number | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** The operator chose a channel by id. */
export function selectChannel(channel: number): void {
  if (choice === channel) return;
  choice = channel;
  emit();
}

/** The choice as made — `null` until the operator picks one. Resolve it against the list. */
export function readChannelChoice(): number | null {
  return choice;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useChannelChoice(): number | null {
  return useSyncExternalStore(subscribe, readChannelChoice, readChannelChoice);
}

/** Test seam — no choice made. */
export function __resetChannelChoiceForTest(): void {
  choice = null;
  emit();
}

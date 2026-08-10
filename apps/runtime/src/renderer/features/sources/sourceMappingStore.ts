import { EMPTY_SOURCE_MAPPINGS, type SourceMappings } from '@cg/shared-ipc';

/**
 * D-137 / C-015 — the renderer's view of the installation's Live Source mapping.
 *
 * THE BRIDGE OWNS IT; this is a cache. The ownership is not a preference: a
 * mapping kept per browser would show the operator who bound `guest-1` something
 * no other console in the gallery can see, and would be gone with a cleared
 * profile — while every one of those consoles would still be taking templates
 * that declare `guest-1`.
 *
 * ⚠ THE PRE-BRIDGE CACHE IS EMPTY, and that is the opposite of what
 * `delimiterStore` does. Delimiters show the SHIPPED defaults until the bridge
 * answers, because an empty picker reads as "your delimiters are gone". A
 * mapping has no shipped default at all — there is nothing safe to show — and an
 * invented one would tell an operator a source is bound when the station has
 * nothing. Empty is the honest first paint, and it is also the truth for a
 * station that has never been configured.
 */

let cache: SourceMappings = EMPTY_SOURCE_MAPPINGS;
let version = 0;
const listeners = new Set<() => void>();

function publish(next: SourceMappings): void {
  cache = next;
  version += 1;
  for (const l of [...listeners]) l();
}

/** The mapping in force, as the bridge last stated it. */
export function currentSourceMappings(): SourceMappings {
  return cache;
}

/** `useSyncExternalStore` pair. */
export function subscribeSourceMappings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function sourceMappingsVersion(): number {
  return version;
}

/**
 * Pull the mapping and stay subscribed to the bridge's pushes. Called once from
 * the app shell. The push subscription is what makes a second console gain the
 * binding this one just made, without either operator reloading.
 *
 * An EMPTY response IS honoured, unlike the delimiter list's: there, empty means
 * a broken peer because the bridge refuses to store an empty list. Here empty is
 * a real, common and important state — the un-configured station — and hiding it
 * would leave the operator believing sources are bound when nothing is.
 */
export function initSourceMappings(bridge: {
  sources: {
    config: () => Promise<SourceMappings>;
    onConfigChanged: (handler: (mappings: SourceMappings) => void) => () => void;
  };
}): () => void {
  const unsubscribe = bridge.sources.onConfigChanged(publish);
  void bridge.sources.config().then(publish, () => {
    // Bridge down at boot: the empty mapping stands, which is also what a
    // station with no file has. The first push after reconnect corrects it.
  });
  return unsubscribe;
}

/**
 * Send a new mapping to the bridge and adopt it only once ACCEPTED.
 *
 * The local cache is NOT updated optimistically. The bridge is the owner and can
 * refuse — a duplicate id, a band overlapping the candidate bank or the reserved
 * playout range — and showing the operator a mapping the station does not have
 * is worse here than anywhere else this rule applies: they would walk away
 * believing a guest box is bound, and find out at the take.
 */
export async function commitSourceMappings(next: SourceMappings): Promise<string | null> {
  try {
    const res = await window.cg.sources.setConfig(next);
    if (!res.ok) return res.message ?? 'The source mapping could not be saved.';
    publish(next);
    return null;
  } catch (err) {
    return describeCommitFailure(err);
  }
}

/**
 * Turn a transport failure into something an operator can act on.
 *
 * The one that will actually happen: a bridge PROCESS older than this feature
 * answers `unknown channel: sources.set-config`, which is true, internal, and
 * tells the operator nothing about what to do. EVERY station whose bridge
 * predates this feature meets it, so it is the common case rather than an edge
 * one. Saving locally instead is not a fallback — it would give this browser a
 * private mapping while the operator believes the station has one, and the take
 * would still refuse.
 */
function describeCommitFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/unknown channel/i.test(message)) {
    return (
      'This bridge is older than Live Source mapping — restart it with an up-to-date build and ' +
      'the mapping will save. Until then a template declaring a live source cannot be taken, ' +
      'because nothing here can tell the bridge what its ids resolve to.'
    );
  }
  return message === '' ? 'The source mapping could not be saved.' : message;
}

/** Test seam — restore the pre-boot state. */
export function __resetSourceMappingsForTest(): void {
  publish(EMPTY_SOURCE_MAPPINGS);
}

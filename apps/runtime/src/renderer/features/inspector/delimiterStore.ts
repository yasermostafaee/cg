import type { DelimiterOption } from '@cg/shared-ipc';

/**
 * R-034 — the renderer's view of the station's delimiter list.
 *
 * THE BRIDGE OWNS THE LIST; this is a cache of it. That ownership is the whole
 * point and it was a deliberate correction: a first cut kept the list in
 * `localStorage`, which satisfies "survives a refresh" and fails the two
 * requirements that actually matter — an operator who adds a delimiter must
 * find it from ANY browser in the gallery, and it must still be there after the
 * bridge restarts. Browser-local storage gives one browser's copy, invisible to
 * the next machine and gone with a cleared profile. The bridge persists it to
 * disk beside the templates, for the reason `TemplateInfo.hasNext` records for
 * itself.
 *
 * A local cache still exists because the picker renders synchronously and the
 * list arrives over a socket. Until the first response lands the cache holds the
 * SHIPPED defaults — never an empty list, which would present a split field with
 * nothing to split on and read as "your delimiters are gone" during the first
 * few hundred milliseconds of every boot.
 */

export type { DelimiterOption };

/**
 * The list shown before the bridge answers, and the list a fresh station gets.
 * Kept in step with the bridge's own `DEFAULT_DELIMITERS` — it is the same set,
 * declared on both sides because neither can import the other's module.
 */
export const BUILT_IN_DELIMITERS: readonly DelimiterOption[] = [
  { id: 'newline', label: 'new line', value: '\\n' },
  { id: 'pipe', label: 'pipe', value: '|' },
  { id: 'persian-comma', label: 'Persian comma', value: '،' },
  { id: 'comma', label: 'comma', value: ',' },
  { id: 'semicolon', label: 'semicolon', value: ';' },
];

/** The default delimiter (as typed): one entry per line. */
export const DEFAULT_DELIMITER = '\\n';

let cache: DelimiterOption[] = [...BUILT_IN_DELIMITERS];
let version = 0;
const listeners = new Set<() => void>();

function publish(next: DelimiterOption[]): void {
  cache = next;
  version += 1;
  for (const l of [...listeners]) l();
}

/** The configured delimiters, in operator order. */
export function listDelimiters(): readonly DelimiterOption[] {
  return cache;
}

/** `useSyncExternalStore` pair. */
export function subscribeDelimiters(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function delimitersVersion(): number {
  return version;
}

/**
 * Pull the list and stay subscribed to the bridge's pushes. Called once from the
 * app shell. The push subscription is what makes operator B's picker gain the
 * delimiter operator A just added, without either of them reloading.
 *
 * An empty response is IGNORED rather than cached: the bridge refuses to store
 * an empty list, so an empty one on the wire means a stale or broken peer, and
 * honouring it would empty a picker the product has no way to refill.
 */
export function initDelimiters(bridge: {
  delimiters: {
    list: () => Promise<DelimiterOption[]>;
    onChanged: (handler: (delimiters: DelimiterOption[]) => void) => () => void;
  };
}): () => void {
  const unsubscribe = bridge.delimiters.onChanged((next) => {
    if (next.length > 0) publish(next);
  });
  void bridge.delimiters
    .list()
    .then((next) => {
      if (next.length > 0) publish(next);
    })
    .catch(() => {
      // Bridge down at boot: the shipped defaults stand, and the first push
      // after reconnect corrects them.
    });
  return unsubscribe;
}

/**
 * Add a delimiter. Returns the operator-facing refusal, or `null` on success.
 *
 * The LOCAL checks here are about what the operator typed into this form — a
 * missing name, an empty value, a duplicate of something already listed. The
 * BRIDGE re-checks the resulting list and is authoritative; these exist so the
 * form can answer instantly, not to be the only guard.
 */
export async function addDelimiter(label: string, value: string): Promise<string | null> {
  const trimmedLabel = label.trim();
  if (trimmedLabel === '') return 'Give the delimiter a name — that is what the picker shows.';
  if (value === '') return 'A delimiter cannot be empty — there would be nothing to split on.';
  if (cache.some((d) => d.value === value)) return `“${value}” is already in the list.`;
  const id = `d-${String(cache.length)}-${trimmedLabel.replace(/[^\w-]/g, '_').slice(0, 24)}`;
  return commit([...cache, { id, label: trimmedLabel, value }]);
}

/**
 * Remove a delimiter. Refuses to remove the LAST one — the picker is the only
 * way a delimiter enters the product, so an empty list is a dead end reachable
 * from this very screen. The bridge refuses it too; this is the fast answer.
 */
export async function removeDelimiter(id: string): Promise<string | null> {
  if (cache.length <= 1) {
    return 'At least one delimiter must remain — a split field needs something to split on.';
  }
  const next = cache.filter((d) => d.id !== id);
  if (next.length === cache.length) return null;
  return commit(next);
}

/** Reset to the shipped list. */
export async function resetDelimiters(): Promise<string | null> {
  return commit([...BUILT_IN_DELIMITERS]);
}

/**
 * Send a new list to the bridge and adopt it only once ACCEPTED.
 *
 * The local cache is NOT updated optimistically. The bridge is the owner and can
 * refuse; showing the operator a list the station does not have — one that would
 * vanish on the next push — is exactly the kind of optimistic claim this product
 * does not make elsewhere.
 */
async function commit(next: DelimiterOption[]): Promise<string | null> {
  try {
    const res = await window.cg.delimiters.set({ delimiters: next });
    if (!res.ok) return res.message ?? 'The delimiter list could not be saved.';
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
 * answers `unknown channel: delimiters.set`, which is true, internal, and tells
 * the operator nothing about what to do. The list is bridge-owned precisely so
 * it is shared and durable, so "just save it locally instead" is not a fallback
 * — it would silently give this browser a private list while the operator
 * believes the station has one. Naming the real cause is the honest answer.
 */
function describeCommitFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/unknown channel/i.test(message)) {
    return (
      'This bridge is older than the shared delimiter list — restart it with an up-to-date ' +
      'build and the list will save. Until then delimiters can still be selected, but not changed.'
    );
  }
  return message === '' ? 'The delimiter list could not be saved.' : message;
}

/** Test seam — restore the pre-boot state. */
export function __resetDelimitersForTest(): void {
  publish([...BUILT_IN_DELIMITERS]);
}

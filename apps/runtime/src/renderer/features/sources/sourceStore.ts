import {
  EMPTY_SOURCE_ASSIGNMENTS,
  EMPTY_SOURCE_CATALOG,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateSourceAssignment,
} from '@cg/shared-ipc';
import { sourcesReasonMessage, sourcesTransportMessage } from '../../ui/sourcesReasonMessage.js';

/**
 * D-137 / C-015 — the renderer's view of the installation's LIVE SOURCES, in the
 * two halves the bridge holds them in.
 *
 * THE BRIDGE OWNS BOTH; these are caches. The ownership is not a preference: a
 * catalog kept per browser would show the operator who defined "Studio A"
 * something no other console in the gallery can see, and would be gone with a
 * cleared profile — while every one of those consoles would still be taking the
 * templates whose plates were bound to it.
 *
 * ⚠ THE PRE-BRIDGE CACHE IS EMPTY, and that is the opposite of what
 * `delimiterStore` does. Delimiters show the SHIPPED defaults until the bridge
 * answers, because an empty picker reads as "your delimiters are gone". A source
 * list has no shipped default at all — there is nothing safe to show — and an
 * invented one would tell an operator a plate is bound when the station has
 * nothing. Empty is the honest first paint, and it is also the truth for a
 * station that has never been configured.
 */

let catalog: SourceCatalog = EMPTY_SOURCE_CATALOG;
let assignments: SourceAssignments = EMPTY_SOURCE_ASSIGNMENTS;
let version = 0;
const listeners = new Set<() => void>();

/**
 * A refusal, split the way the pinned message region shows it: the RULE, and the
 * bridge's own SPECIFICS beneath it.
 *
 * Deliberately not a bare string. The rule comes from `sourcesReasonMessage`,
 * which is keyed off the wire's reason union, so a validator code that gains no
 * sentence fails typecheck rather than reaching an operator as a code.
 */
export interface CommitRefusal {
  text: string;
  detail?: string;
}

/**
 * ONE version counter for BOTH halves, deliberately.
 *
 * A catalog DELETION changes them together — the cascade drops the assignments
 * it orphans — and two counters would let a subscriber re-render against the new
 * catalog while still holding the old bindings, which is a frame showing a plate
 * as bound to a source that no longer exists.
 */
function bump(): void {
  version += 1;
  for (const listener of [...listeners]) listener();
}

/** The catalog in force, as the bridge last stated it. */
export function currentSourceCatalog(): SourceCatalog {
  return catalog;
}

/** The assignments in force, as the bridge last stated them. */
export function currentSourceAssignments(): SourceAssignments {
  return assignments;
}

/** `useSyncExternalStore` pair, covering both halves (see {@link bump}). */
export function subscribeSources(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function sourcesVersion(): number {
  return version;
}

/**
 * Pull both halves and stay subscribed to the bridge's pushes. Called once from
 * the app shell. The push subscription is what makes a second console gain the
 * binding this one just made, without either operator reloading — and what makes
 * a DELETION reach it, which is the push no browser asked for.
 *
 * An EMPTY response IS honoured, unlike the delimiter list's: there, empty means
 * a broken peer because the bridge refuses to store an empty list. Here empty is
 * a real, common and important state — the un-configured station — and hiding it
 * would leave the operator believing plates are bound when nothing is.
 */
export function initSources(bridge: {
  sources: {
    config: () => Promise<SourceCatalog>;
    onConfigChanged: (handler: (catalog: SourceCatalog) => void) => () => void;
    assignments: () => Promise<SourceAssignments>;
    onAssignmentsChanged: (handler: (assignments: SourceAssignments) => void) => () => void;
  };
}): () => void {
  const offConfig = bridge.sources.onConfigChanged((next) => {
    catalog = next;
    bump();
  });
  const offAssignments = bridge.sources.onAssignmentsChanged((next) => {
    assignments = next;
    bump();
  });
  void bridge.sources.config().then((next) => {
    catalog = next;
    bump();
  }, noteBridgeDown);
  void bridge.sources.assignments().then((next) => {
    assignments = next;
    bump();
  }, noteBridgeDown);
  return () => {
    offConfig();
    offAssignments();
  };
}

function noteBridgeDown(): void {
  // Bridge down at boot: the empty value stands, which is also what a station
  // with no file has. The first push after reconnect corrects it.
}

/** The rule sentence plus the bridge's specifics, for a refusal that carried a code. */
function refusalOf(res: {
  reason?: string | undefined;
  message?: string | undefined;
}): CommitRefusal {
  const rule = sourcesReasonMessage(res.reason);
  if (rule !== null) {
    return res.message === undefined ? { text: rule } : { text: rule, detail: res.message };
  }
  // No code at all: the bridge's own sentence is the best there is, and a
  // generic fallback is better than an empty region.
  return { text: res.message ?? 'The change could not be saved.' };
}

/**
 * Send a new catalog to the bridge and adopt it only once ACCEPTED.
 *
 * The local cache is NOT updated optimistically. The bridge is the owner and can
 * refuse — a duplicate id, a duplicate name, a band overlapping the candidate
 * bank or the reserved playout range — and showing the operator a catalog the
 * station does not have is worse here than anywhere else this rule applies: they
 * would walk away believing a guest box is bound, and find out at the take.
 *
 * On success it returns the assignments the change ORPHANED, so the caller can
 * name them at the moment of deletion. An empty array is the ordinary case.
 */
export async function commitSourceCatalog(next: SourceCatalog): Promise<{
  refusal: CommitRefusal | null;
  droppedAssignments: readonly TemplateSourceAssignment[];
}> {
  try {
    const res = await window.cg.sources.setConfig(next);
    if (!res.ok) return { refusal: refusalOf(res), droppedAssignments: [] };
    catalog = next;
    const dropped = res.droppedAssignments ?? [];
    if (dropped.length > 0) {
      // The bridge already cascaded; mirror it locally so this browser cannot
      // paint a plate as bound between the ack and the push that follows.
      const orphaned = new Set(dropped.map((a) => `${a.templateId} ${a.plateId}`));
      assignments = {
        assignments: assignments.assignments.filter(
          (a) => !orphaned.has(`${a.templateId} ${a.plateId}`),
        ),
      };
    }
    bump();
    return { refusal: null, droppedAssignments: dropped };
  } catch (err) {
    return { refusal: { text: sourcesTransportMessage(err) }, droppedAssignments: [] };
  }
}

/** Send new assignments to the bridge and adopt them only once ACCEPTED. */
export async function commitSourceAssignments(
  next: SourceAssignments,
): Promise<CommitRefusal | null> {
  try {
    const res = await window.cg.sources.setAssignments(next);
    if (!res.ok) return refusalOf(res);
    assignments = next;
    bump();
    return null;
  } catch (err) {
    return { text: sourcesTransportMessage(err) };
  }
}

/** Test seam — restore the pre-boot state. */
export function __resetSourcesForTest(): void {
  catalog = EMPTY_SOURCE_CATALOG;
  assignments = EMPTY_SOURCE_ASSIGNMENTS;
  bump();
}

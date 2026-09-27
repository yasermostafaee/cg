import {
  EMPTY_SOURCE_ASSIGNMENTS,
  EMPTY_SOURCE_CATALOG,
  type ChannelRequest,
  type ChannelResponse,
  type ConsoleMediaItem,
  type LiveSourceLayerRange,
  type SourceAssignments,
  type SourceCatalog,
  type SourcesMediaSearchChannel,
} from '@cg/shared-ipc';

/** One media search, as the picker asks it. */
export type MediaSearchRequest = ChannelRequest<typeof SourcesMediaSearchChannel>;
/** Its answer: a page, or one of the two named failures. */
export type MediaSearchResponse = ChannelResponse<typeof SourcesMediaSearchChannel>;
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
 * A refusal, as the operator reads it: ONE line.
 *
 * The rule comes from `sourcesReasonMessage`, which is keyed off the wire's reason
 * union, so a validator code that gains no sentence fails typecheck rather than
 * reaching an operator as a code.
 *
 * 🔴 `DELTA-MULTI-CHANNEL-01-A` A5 — it used to carry the bridge's `message` as a
 * `detail` beneath the rule, and three surfaces showed it: under the rule in the
 * Live sources pane, and glued onto it in one line on the refusal banner and in
 * Template defaults. The bridge's words are written for the record, so the field
 * is gone from the TYPE — no consumer can put them back under a headline.
 */
export interface CommitRefusal {
  text: string;
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

/** The rule sentence, for a refusal that carried a code — one line (A5). */
function refusalOf(res: {
  reason?: string | undefined;
  message?: string | undefined;
}): CommitRefusal {
  const rule = sourcesReasonMessage(res.reason);
  if (rule !== null) return { text: rule };
  // No code at all: the bridge's own sentence is the best there is — as the ONE line, never
  // under another — and a generic fallback is better than an empty region.
  return { text: res.message ?? 'The change could not be saved.' };
}

/**
 * 🔴 `PLAYOUT-SOURCES-01` §1.F — **send the PLATE BAND to the bridge, and adopt it only once
 * ACCEPTED.** The station's sources are the Playout's; the band is the one catalogue fact this
 * console edits. The bridge can refuse (a band overlapping the candidate bank or the reserved
 * playout range) and supplies the rule; it cascades nothing, so a refusal is the only answer
 * there is to report.
 */
export async function commitSourceBand(
  layerRange: LiveSourceLayerRange | undefined,
): Promise<CommitRefusal | null> {
  try {
    const res = await window.cg.sources.setConfig(layerRange === undefined ? {} : { layerRange });
    if (!res.ok) return refusalOf(res);
    const next: SourceCatalog = { ...catalog };
    if (layerRange === undefined) delete next.layerRange;
    else next.layerRange = layerRange;
    catalog = next;
    bump();
    return null;
  } catch (err) {
    return { text: sourcesTransportMessage(err) };
  }
}

/**
 * `PLAYOUT-SOURCES-01` §1.A — a picker opened: ask the bridge to read the Playout again if its last
 * read is older than 5 s. Never waited on; whatever changes arrives as a push.
 */
export function refreshPlayoutSources(): void {
  try {
    void window.cg.sources.refresh().catch(() => undefined);
  } catch {
    // No bridge yet (a page still booting): the picker opens on what is already held.
  }
}

/** `PLAYOUT-SOURCES-01` §1.A — one page of the Playout's media, searched on the Playout's side. */
export async function searchPlayoutMedia(req: MediaSearchRequest): Promise<MediaSearchResponse> {
  try {
    const res = await window.cg.sources.mediaSearch(req);
    if (res.ok) {
      for (const item of res.items) seenMedia.set(item.id, item);
    }
    return res;
  } catch {
    return { ok: false, reason: 'playout-unreachable', message: 'The Playout did not answer.' };
  }
}

/**
 * The media items this console has SEEN in a search this session, by catalogue id — so a field can
 * name an item the operator just picked, before a commit binds it and the catalogue carries it.
 * Names only; what is played is the bridge's own read, never this.
 */
const seenMedia = new Map<string, ConsoleMediaItem>();

/** A media item seen in a search this session, or `undefined`. */
export function seenMediaItem(id: string): ConsoleMediaItem | undefined {
  return seenMedia.get(id);
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

/**
 * A9 — ASSIGNMENTS ARE OWNED BY THE LIBRARY ENTRY.
 *
 * Deleting a template from this station deletes its plate bindings with it. That
 * is what makes "delete from this station" mean something: without it there is
 * state on this machine with nothing left that refers to it, and a later import
 * of the same id would silently inherit bindings nobody chose to keep.
 *
 * Called ONLY after the removal is CONFIRMED by its owner. A refused removal must
 * leave the bindings exactly where they were — the template is still there.
 */
export async function forgetTemplateAssignments(templateId: string): Promise<CommitRefusal | null> {
  const kept = assignments.assignments.filter((a) => a.templateId !== templateId);
  if (kept.length === assignments.assignments.length) return null;
  return commitSourceAssignments({ assignments: kept });
}

/**
 * A9 — the templates whose bindings SURVIVED a re-import in this session.
 *
 * A re-import KEEPS its assignments: the useful case is an author fixing
 * something and re-exporting, with the operator not re-binding every plate. But
 * the owner met that as a silent restore — no action, no notice — so the surface
 * has to SAY the bindings were carried over from a previous import.
 *
 * Session-local on purpose: it is a statement about what just happened in front
 * of this operator, not a durable property of the template.
 */
const carriedOver = new Set<string>();

/** True iff this template's bindings were carried over by an import this session. */
export function assignmentsWereCarriedOver(templateId: string): boolean {
  return carriedOver.has(templateId);
}

/**
 * A9 — reconcile a template's assignments against the plate set it NOW declares,
 * at import.
 *
 * 🔴 **A PLATE ID THE NEW VERSION NO LONGER DECLARES IS DROPPED.** A dangling
 * record can later match a plate it was never meant for — the author re-uses
 * `guest-1` for a different box, and a binding nobody made comes back to life on
 * air. Plates the new version declares and the old did not simply read as
 * unassigned, which is the ordinary state of a plate nobody has bound.
 *
 * Returns the plate ids it dropped, so the caller can say so.
 */
export async function reconcileAssignmentsForImport(
  templateId: string,
  declaredPlateIds: readonly string[],
): Promise<readonly string[]> {
  const declared = new Set(declaredPlateIds);
  const mine = assignments.assignments.filter((a) => a.templateId === templateId);
  if (mine.length === 0) {
    carriedOver.delete(templateId);
    return [];
  }
  const dropped = mine.filter((a) => !declared.has(a.plateId));
  if (dropped.length > 0) {
    await commitSourceAssignments({
      assignments: assignments.assignments.filter(
        (a) => a.templateId !== templateId || declared.has(a.plateId),
      ),
    });
  }
  // Anything that survived was carried over from the previous import, and the
  // operator has to be told: they did nothing to produce it.
  if (mine.length > dropped.length) carriedOver.add(templateId);
  else carriedOver.delete(templateId);
  bump();
  return dropped.map((a) => a.plateId);
}

/** Test seam — forget the carried-over marks. */
export function __resetCarriedOverForTest(): void {
  carriedOver.clear();
}

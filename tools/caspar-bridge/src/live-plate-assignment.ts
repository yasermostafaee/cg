import {
  isolateText,
  notShowableWords,
  ownOutputWords,
  plateLabel,
  plateList,
  SOURCE_OWN_OUTPUT_CODE,
  sourceLoopsOn,
  sourceSeatable,
  sourceShowableOn,
  unseatableWords,
  type SourceAssignments,
  type SourceCatalog,
  type SourceDefinition,
} from '@cg/shared-ipc';
import type { LiveSourceDeclaration } from '@cg/shared-schema';

/**
 * C-015 phase 6 (task 6.7) — **a declared plate with NO ASSIGNMENT refuses the take,
 * legibly, and NAMES THE PLATE.**
 *
 * C-015's own acceptance prescribes this: _"the take refuses legibly with a distinct
 * errorCode, never a silent empty hole on air"_. The silent alternative is the whole
 * point — the hole is transparent, so an unassigned plate produces a
 * frame-with-nothing-in-it that looks exactly like a template someone mis-authored.
 *
 * ⚠ **EXTENDED by the §2z reshape: there are now TWO ways to be unassigned, and the
 * refusal must name the plate in BOTH.**
 *
 *  1. **NEVER ASSIGNED** — the ORDINARY state of a freshly imported template, not a
 *     fault. Nobody has yet said which of this installation's sources belongs in
 *     this hole.
 *  2. **THE ASSIGNMENT WAS CASCADED AWAY** — it existed, and the delete cascade
 *     removed it when the source it pointed at was retired from the catalog (§2c).
 *
 * 🔴 **THEY RESOLVE TO ONE STATE — UNASSIGNED — DELIBERATELY.** A second
 * "assigned, but not really" state is one every consumer would have to learn and
 * could get wrong, and there is nothing an operator would DO differently: in both
 * cases the fix is to assign a source. The distinction is real history and belongs
 * in an audit trail, not in the take path's vocabulary.
 *
 * A third case reaches the same refusal by a different route and is kept distinct in
 * the MESSAGE only: an assignment that survives but names a source id the catalog
 * does not have. That is a hand-edited or stale file rather than an operator
 * omission, so the message says so — while the CODE stays `live-source-unassigned`,
 * because the operator's next action is identical.
 */

/** The distinct code C-015's acceptance asks for. */
export const LIVE_PLATE_UNASSIGNED = 'live-source-unassigned';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §1.C — **THE PLAYOUT STOPPED OFFERING IT.** A plate is assigned, and its
 * entry is still in the catalogue — kept, with its name, never deleted — but the Playout no longer
 * lists it (or marks it unavailable). The take is refused before any AMCP; the binding stays.
 */
export const LIVE_PLATE_SOURCE_UNAVAILABLE = 'source-unavailable';
/** `PLAYOUT-SOURCES-01` — an assigned entry that became unusable (its rules). */
export const LIVE_PLATE_SOURCE_UNUSABLE = 'source-unusable';
/**
 * 🔴 `ROUTE-PLATES-01` / contract v1.3 rule 1 — the row's channel is not one the entry may be shown
 * on (a Playout route's `compatibleChannels`). Refused before any AMCP, all or nothing.
 */
export const LIVE_PLATE_SOURCE_NOT_SHOWABLE = 'source-not-showable';
/**
 * 🔴 `PLAYOUT-FEATURES-01` B (`B-298`) — the entry is the row channel's OWN output (D10's `ownOutputOf`):
 * shown there it would loop. Refused before any AMCP, all or nothing; offered on every other channel.
 */
export const LIVE_PLATE_SOURCE_OWN_OUTPUT = SOURCE_OWN_OUTPUT_CODE;

export interface PlateAssignmentRefusal {
  readonly errorCode:
    | typeof LIVE_PLATE_UNASSIGNED
    | typeof LIVE_PLATE_SOURCE_UNAVAILABLE
    | typeof LIVE_PLATE_SOURCE_UNUSABLE
    | typeof LIVE_PLATE_SOURCE_NOT_SHOWABLE
    | typeof LIVE_PLATE_SOURCE_OWN_OUTPUT;
  /** NAMES the plate — see the note on {@link resolvePlateAssignments}. */
  readonly message: string;
  /** The plates that could not be resolved, in declaration order. */
  readonly plateIds: readonly string[];
  /**
   * `PLAYOUT-SOURCES-01` — for an unavailable or unusable entry, the FIRST such plate and the entry
   * it is bound to, so the row can say which (only that plate is named: the take stops there).
   */
  readonly refused?: { readonly plateId: string; readonly source: SourceDefinition };
}

export interface ResolvedPlate {
  readonly declaration: LiveSourceDeclaration;
  readonly source: SourceDefinition;
}

export type PlateAssignmentOutcome =
  | { readonly ok: true; readonly plates: readonly ResolvedPlate[] }
  | ({ readonly ok: false } & PlateAssignmentRefusal);

/**
 * Resolve every declared plate of one template to its catalog entry, or refuse.
 *
 * ── WHY ALL-OR-NOTHING, RATHER THAN SEATING WHAT RESOLVES ──────────────────
 *
 * A template with three guest boxes, two assigned, is not two-thirds of a graphic —
 * it is a designed layout with a hole in it, on air. Seating the two would be the
 * silent-empty-hole outcome this refusal exists to prevent, arrived at by a
 * different road: the operator would see something plausible and have no reason to
 * look for what is missing. So the take is refused as a whole and the refusal names
 * EVERY unresolved plate, so one attempt tells the operator the full list rather
 * than making them discover it a plate at a time.
 *
 * ── AND WHY A TEMPLATE WITH NO PLATES IS NOT A REFUSAL ─────────────────────
 *
 * An EMPTY `sources` array is a real and common answer — this template has none —
 * and it resolves to `{ ok: true, plates: [] }`. The distinction between an empty
 * array and an absent carrier block is `liveSourceCarrierState`'s, and it is not
 * this function's to re-derive: a caller with no declarations never asks.
 */
export function resolvePlateAssignments(input: {
  templateId: string;
  declarations: readonly LiveSourceDeclaration[];
  assignments: SourceAssignments;
  catalog: SourceCatalog;
  /**
   * R-048 / C-015 phase 6 (6.9) — this ROW's per-plate substitutions, which
   * outrank the template assignment for this run only.
   *
   * ⚠ **SESSION BM: THIS IS NOW A FLATTENED VIEW OF TWO LEVELS, NOT ONE MAP.** The caller
   * composes the row's per-LOOK composition and its per-PLATE emergency patch into a single
   * `{plate → catalog id}` for the look being resolved (`#effectiveOverridesFor`), so this
   * function's contract is unchanged and it still asks its question exactly once. The
   * precedence between the two is decided there and NOT here — `live-look-bindings.ts`
   * carries the argument — because a second place that ordered them could order them
   * differently, which is the failure the note below is already about.
   *
   * 🔴 **RESOLVED HERE RATHER THAN BY A SECOND PATH, and that is the point.** An
   * override is not a different KIND of thing from an assignment — it is the same
   * question ("which catalog entry does this plate use") answered by a higher
   * authority, so it belongs in the same resolution. A swap path that resolved
   * plates its own way would be a second spelling of "which producer is behind
   * this hole", and the two would eventually disagree about a plate that is on
   * air. It also means an override naming a retired source reaches the SAME
   * refusal as a stale assignment, with the wording already written for it.
   */
  overrides?: Readonly<Record<string, string>> | undefined;
  /**
   * `ROUTE-PLATES-01` — the ROW's channel: an entry that may not be shown on it (`sourceShowableOn`,
   * v1.3 rule 1) is refused here, after the entry's own state. Absent asks nothing about channels.
   */
  channel?: number | undefined;
  /**
   * 🔴 `B-308` — the template's WHOLE declaration, in order: what numbers a plate `Plate N` in the
   * refusal (`plateLabel`). Not `declarations`, which a caller may narrow to the plates that must
   * resolve — numbered from that subset, the third plate would read `Plate 1`. Absent numbers from
   * `declarations`, which is then the whole list.
   */
  plates?: readonly { readonly sourceId: string }[] | undefined;
}): PlateAssignmentOutcome {
  const byId = new Map(input.catalog.sources.map((s) => [s.id, s] as const));
  // `B-308` — every sentence below names a plate `Plate N`; `plateIds` and `refused` keep the ids.
  const numbering = input.plates ?? input.declarations;
  const named = (plateId: string): string => plateLabel(numbering, plateId) ?? 'A plate';
  const assigned = new Map(
    input.assignments.assignments
      .filter((a) => a.templateId === input.templateId)
      .map((a) => [a.plateId, a.sourceId] as const),
  );
  // The override wins where it exists, and only there. Applied on top of the map
  // rather than consulted separately, so every reader below sees ONE answer.
  for (const [plateId, sourceId] of Object.entries(input.overrides ?? {})) {
    assigned.set(plateId, sourceId);
  }

  const plates: ResolvedPlate[] = [];
  const unassigned: string[] = [];
  const stale: string[] = [];
  const unseatable: { plateId: string; source: SourceDefinition }[] = [];
  const notShowable: { plateId: string; source: SourceDefinition }[] = [];
  const loops: { plateId: string; source: SourceDefinition }[] = [];

  for (const declaration of input.declarations) {
    // The plate's handle is its `sourceId` — the SCENE's vocabulary for a hole in this
    // template ("guest-1"), never a device and never a catalog id. §2z restated the
    // meaning; the schema field keeps its name because renaming it is a scene migration.
    // `B-308`: it is NOT the operator's word — a sentence names the plate `Plate N`.
    const plateId = declaration.sourceId;
    const sourceId = assigned.get(plateId);
    if (sourceId === undefined) {
      // Cases 1 and 2 above, indistinguishable here and deliberately so.
      unassigned.push(plateId);
      continue;
    }
    const source = byId.get(sourceId);
    if (source === undefined) {
      // The third case: an assignment naming a source the catalog does not have.
      stale.push(plateId);
      continue;
    }
    // `PLAYOUT-SOURCES-01` — the fourth: the entry is KEPT, and may not be seated now.
    if (!sourceSeatable(source)) {
      unseatable.push({ plateId, source });
      continue;
    }
    // `PLAYOUT-FEATURES-01` B (`B-298`) — usable, but this row's channel's OWN output: it would loop.
    if (input.channel !== undefined && sourceLoopsOn(source, input.channel)) {
      loops.push({ plateId, source });
      continue;
    }
    // `ROUTE-PLATES-01` — the fifth: usable, but not on this row's channel (v1.3 rule 1).
    if (input.channel !== undefined && !sourceShowableOn(source, input.channel)) {
      notShowable.push({ plateId, source });
      continue;
    }
    plates.push({ declaration, source });
  }

  if (
    unassigned.length === 0 &&
    stale.length === 0 &&
    unseatable.length === 0 &&
    notShowable.length === 0 &&
    loops.length === 0
  ) {
    return { ok: true, plates };
  }

  if (unassigned.length === 0 && stale.length === 0 && unseatable.length === 0) {
    if (loops.length > 0) {
      // `B-298` — only the first is named: the take stops there.
      const first = loops[0] as { plateId: string; source: SourceDefinition };
      const words = ownOutputWords(first.source.name, input.channel as number);
      return {
        ok: false,
        errorCode: LIVE_PLATE_SOURCE_OWN_OUTPUT,
        plateIds: loops.map((u) => u.plateId),
        refused: first,
        message: `${named(first.plateId)}: “${isolateText(words.name)}”${words.rest}`,
      };
    }
    // Only the first is named: the take stops there, as for an unseatable entry.
    const first = notShowable[0] as { plateId: string; source: SourceDefinition };
    const words = notShowableWords(first.source.name, input.channel as number);
    return {
      ok: false,
      errorCode: LIVE_PLATE_SOURCE_NOT_SHOWABLE,
      plateIds: notShowable.map((u) => u.plateId),
      refused: first,
      message: `${named(first.plateId)}: “${isolateText(words.name)}”${words.rest}`,
    };
  }

  if (unassigned.length === 0 && stale.length === 0) {
    // Only the first is named: the take stops there (`FIELD-FIXES-01-A` Decision 1).
    const first = unseatable[0] as { plateId: string; source: SourceDefinition };
    const unavailable = first.source.status === 'unavailable';
    const words = unseatableWords(first.source);
    return {
      ok: false,
      errorCode: unavailable ? LIVE_PLATE_SOURCE_UNAVAILABLE : LIVE_PLATE_SOURCE_UNUSABLE,
      plateIds: unseatable.map((u) => u.plateId),
      refused: first,
      message: `${named(first.plateId)}: “${isolateText(words.name)}”${words.rest}`,
    };
  }

  const plateIds = [...unassigned, ...stale];
  return {
    ok: false,
    errorCode: LIVE_PLATE_UNASSIGNED,
    plateIds,
    message: refusalMessage(unassigned.map(named), stale.map(named)),
  };
}

/**
 * The operator-facing sentence. It NAMES the plates — a count would send them
 * hunting through the template to find which, which is the same objection §2c
 * records against a count on the picker row. `B-308`: by `Plate N`, never by id.
 */
function refusalMessage(unassigned: readonly string[], stale: readonly string[]): string {
  const parts: string[] = [];
  if (unassigned.length > 0) {
    parts.push(
      `${plateList(unassigned)} ${unassigned.length === 1 ? 'has' : 'have'} no ` +
        `live source assigned, so ${unassigned.length === 1 ? 'it' : 'they'} would go to air empty`,
    );
  }
  if (stale.length > 0) {
    // Distinct WORDING, same code: this is a stale or hand-edited assignment rather
    // than an operator omission, and saying so is what stops them looking for an
    // assignment they will find already made.
    parts.push(
      `${plateList(stale)} ${stale.length === 1 ? 'is' : 'are'} assigned to a source ` +
        `this installation no longer has`,
    );
  }
  return `${parts.join('; and ')}. Assign ${
    unassigned.length + stale.length === 1 ? 'it' : 'them'
  } in CG Control, then take again.`;
}

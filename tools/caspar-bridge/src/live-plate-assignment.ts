import type { SourceAssignments, SourceCatalog, SourceDefinition } from '@cg/shared-ipc';
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

export interface PlateAssignmentRefusal {
  readonly errorCode: typeof LIVE_PLATE_UNASSIGNED;
  /** NAMES the plate — see the note on {@link resolvePlateAssignments}. */
  readonly message: string;
  /** The plates that could not be resolved, in declaration order. */
  readonly plateIds: readonly string[];
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
}): PlateAssignmentOutcome {
  const byId = new Map(input.catalog.sources.map((s) => [s.id, s] as const));
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

  for (const declaration of input.declarations) {
    // The plate's operator-facing handle is its `sourceId` — the SCENE's vocabulary
    // for a hole in this template ("guest-1"), never a device and never a catalog
    // id. §2z restated the meaning; the schema field keeps its name because
    // renaming it is a scene migration.
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
    plates.push({ declaration, source });
  }

  if (unassigned.length === 0 && stale.length === 0) return { ok: true, plates };

  const plateIds = [...unassigned, ...stale];
  return {
    ok: false,
    errorCode: LIVE_PLATE_UNASSIGNED,
    plateIds,
    message: refusalMessage(unassigned, stale),
  };
}

/**
 * The operator-facing sentence. It NAMES the plates — a count would send them
 * hunting through the template to find which, which is the same objection §2c
 * records against a count on the picker row.
 */
function refusalMessage(unassigned: readonly string[], stale: readonly string[]): string {
  const parts: string[] = [];
  if (unassigned.length > 0) {
    parts.push(
      `${plural(unassigned)} ${list(unassigned)} ${unassigned.length === 1 ? 'has' : 'have'} no ` +
        `live source assigned, so ${unassigned.length === 1 ? 'it' : 'they'} would go to air empty`,
    );
  }
  if (stale.length > 0) {
    // Distinct WORDING, same code: this is a stale or hand-edited assignment rather
    // than an operator omission, and saying so is what stops them looking for an
    // assignment they will find already made.
    parts.push(
      `${plural(stale)} ${list(stale)} ${stale.length === 1 ? 'is' : 'are'} assigned to a source ` +
        `this installation no longer has`,
    );
  }
  return `${parts.join('; and ')}. Assign ${
    unassigned.length + stale.length === 1 ? 'it' : 'them'
  } in CG Control, then take again.`;
}

const plural = (ids: readonly string[]): string => (ids.length === 1 ? 'plate' : 'plates');

/** `"a"`, `"a" and "b"`, `"a", "b" and "c"` — quoted, so an id with a dash reads cleanly. */
function list(ids: readonly string[]): string {
  const quoted = ids.map((id) => `"${id}"`);
  if (quoted.length === 1) return quoted[0] as string;
  return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1] as string}`;
}

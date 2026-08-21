import type { SourceCatalog, SourceDefinition, TemplateLiveSources } from '@cg/shared-ipc';
import { lookPlateRects } from '@cg/shared-ipc';
import type { LiveSourceDeclaration } from '@cg/shared-schema';

/**
 * `multibox-layout-switch` §14 / session BM — **WHICH INPUT EACH FRAME OF EACH LOOK SHOWS,
 * and therefore HOW MANY PRODUCERS THE ITEM NEEDS.**
 *
 * ── THE ONE SENTENCE THIS MODULE EXISTS TO MAKE TRUE ────────────────────────
 *
 * **A SEAT IS ONE PRODUCER PER DISTINCT RESOLVED INPUT, PER ITEM.** Not one per authored
 * plate, and not one per `(look, plate)` pair.
 *
 * The authored `routeKey` has never named a producer — `live-plate-assignment.ts` says it
 * outright (_"the SCENE's vocabulary for a hole in this template (`guest-1`), never a device
 * and never a catalog id"_) and `looks.ts` agrees (_"the symbolic id a plate's `routeKey`
 * references. Never a device string"_). It names a HOLE and supplies that hole's DEFAULT
 * binding. Once the operator may point two looks' frames at different inputs, "which
 * producer" and "which hole" stop being the same question, and this module is where they
 * are separated.
 *
 * ── WHY THE DEDUPE KEY IS THE PRODUCER ARGUMENT ─────────────────────────────
 *
 * `looks.ts`'s invariant is _"never N producers on one route"_, and a ROUTE is the wire
 * string — `route://1-2`, a `DECKLINK DEVICE` form, an NDI name. Two catalog entries that
 * resolve to the same wire string ARE the same physical input, so keying on the argument is
 * what makes the invariant mean what it says. It is also the ledger's own key material: the
 * record already stores `producer` as SENT (`live-layers.ts`), so this identity needs no new
 * persisted field and no migration of an existing ledger.
 *
 * 🔴 **WHAT THAT INVARIANT'S WORDING GETS WRONG NOW, stated here because the sentence is
 * quoted in three places and one of them is an author-facing refusal.** It reads: _"the same
 * source referenced in two looks is ONE declaration and ONE seat, held across switches."_
 * That is a CONJUNCTION over a 1:1 that no longer holds, and it breaks in BOTH directions:
 * one declaration bound to different inputs in two looks is **two** seats, and two
 * declarations bound to the same input are **one**. What survives is the final clause — never
 * N producers on one route — and it survives precisely because the dedupe moved onto the
 * input. `live-source-preflight.ts` and `LooksSection.tsx` carry the corrected wording.
 *
 * ── THE RESOLUTION ORDER, WHICH IS NOW FOUR LEVELS ──────────────────────────
 *
 *   1. **The installation's CATALOG** — what inputs this station has. Global.
 *   2. **The template's ASSIGNMENT** — which catalog entry each PLATE uses by default.
 *      Template-level, shared by every row, and the DEFAULT FOR EVERY LOOK.
 *   3. **THE ROW'S PER-LOOK BINDING (new)** — what THIS row shows in THIS look. The
 *      operator composing a rundown: _"solo will show studio-3."_
 *   4. **THE ROW'S PER-PLATE OVERRIDE (`R-048`)** — the emergency patch, and it wins
 *      EVERYWHERE.
 *
 * 🔴 **WHY THE EMERGENCY IS OUTERMOST AND NOT INNERMOST.** `R-048` exists for one shape:
 * an input is DEAD at 20:59 and the operator repoints that frame without taking the graphic
 * off air. If a per-look binding outranked it, switching to another look would bring the
 * DEAD input straight back — and the operator would have to re-patch, live, once per look,
 * having already been told the substitution was applied. The emergency is a statement about
 * the INPUT, not about one look, so it applies to every look. Neither level writes back to
 * the template assignment, so an emergency still never becomes tomorrow's configuration.
 */

/** `lookId → plateId → catalog id`. The row's per-look composition (level 3). */
export type LookSourceBindings = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** The row's per-plate emergency patch (level 4), applied to every look. */
export type PlateSourceOverrides = Readonly<Record<string, string>>;

/** One frame of one look, and the input it resolves to. */
export interface ResolvedFrame {
  /** `undefined` for a pre-LOOKS carrier's single implicit look. */
  readonly lookId: string | undefined;
  readonly plateId: string;
  readonly declaration: LiveSourceDeclaration;
  readonly source: SourceDefinition;
  /** The wire argument — the seat's identity. */
  readonly producerArg: string;
}

/** One SEAT: a producer this item needs, and every frame that can punch it. */
export interface SeatDemand {
  readonly producerArg: string;
  readonly source: SourceDefinition;
  /** Every `(look, plate)` bound to this input, in look-then-declaration order. */
  readonly frames: readonly ResolvedFrame[];
}

/** Two frames of ONE look pointed at ONE input — §6.2's refusal. */
export interface SeatCollision {
  readonly lookId: string | undefined;
  readonly producerArg: string;
  readonly sourceName: string;
  /** The plates that collide, in declaration order. At least two. */
  readonly plateIds: readonly string[];
}

export interface LookBindingPlan {
  /** Distinct inputs this item needs, keyed by wire argument. Insertion-ordered. */
  readonly seats: ReadonlyMap<string, SeatDemand>;
  /** Every resolved `(look, plate)`. */
  readonly frames: readonly ResolvedFrame[];
  /** `(look, plate)` pairs no assignment could resolve — NOT a refusal here. */
  readonly unresolved: readonly { lookId: string | undefined; plateId: string }[];
  /** §6.2 — one input in two frames of one look. */
  readonly collisions: readonly SeatCollision[];
}

/**
 * 🔴 **THE ONE RESOLUTION of "which catalog entry does this frame show", for EVERY look.**
 *
 * Every door that needs the answer — the seating plan, the assignment refusals, and the
 * band-capacity check — calls this rather than walking the levels itself. A second walk is
 * how the four levels would come to be applied in two orders, and the two would disagree
 * about a frame that is on air.
 *
 * ⚠ **TOLERANT BY CONSTRUCTION: it never refuses.** A frame whose binding names nothing is
 * reported in `unresolved` and simply has no seat. WHICH unresolved frames may refuse WHICH
 * action is the caller's question and a different one — a hole in a look nobody is showing
 * must not refuse a take (§2.9), while the same hole in the look being entered must.
 */
export function resolveLookBindings(input: {
  readonly templateId: string;
  readonly carrier: TemplateLiveSources;
  readonly assignments: readonly { templateId: string; plateId: string; sourceId: string }[];
  readonly catalog: SourceCatalog;
  readonly bindings?: LookSourceBindings | undefined;
  readonly overrides?: PlateSourceOverrides | undefined;
  /** `CommandBuilder.sourceArgument` — injected so the identity is the WIRE's, not a copy. */
  readonly argumentOf: (source: SourceDefinition) => string;
}): LookBindingPlan {
  const byCatalogId = new Map(input.catalog.sources.map((s) => [s.id, s] as const));
  const assigned = new Map(
    input.assignments
      .filter((a) => a.templateId === input.templateId)
      .map((a) => [a.plateId, a.sourceId] as const),
  );

  const seats = new Map<string, { source: SourceDefinition; frames: ResolvedFrame[] }>();
  const frames: ResolvedFrame[] = [];
  const unresolved: { lookId: string | undefined; plateId: string }[] = [];
  const collisions: SeatCollision[] = [];

  for (const lookId of lookIdsOf(input.carrier)) {
    // The look's OWN membership, through the one carrier-level resolver — never a local
    // re-derivation of "which plates does this look show" (`B-151` is what a second copy of
    // that question cost).
    const rects = lookPlateRects(input.carrier, lookId);
    const perLook = lookId === undefined ? undefined : input.bindings?.[lookId];
    /** producerArg → the plates of THIS look already bound to it (§6.2's axis). */
    const inThisLook = new Map<string, string[]>();

    // Declaration order, filtered to this look's membership — so a collision names its
    // plates in the order the author wrote them rather than the order a record iterated.
    for (const declaration of input.carrier.sources) {
      const plateId = declaration.sourceId;
      if (rects[plateId] === undefined) continue;
      const catalogId = input.overrides?.[plateId] ?? perLook?.[plateId] ?? assigned.get(plateId);
      const source = catalogId === undefined ? undefined : byCatalogId.get(catalogId);
      if (source === undefined) {
        unresolved.push({ lookId, plateId });
        continue;
      }
      const producerArg = input.argumentOf(source);
      const frame: ResolvedFrame = { lookId, plateId, declaration, source, producerArg };
      frames.push(frame);
      const seat = seats.get(producerArg);
      if (seat === undefined) seats.set(producerArg, { source, frames: [frame] });
      else seat.frames.push(frame);
      inThisLook.set(producerArg, [...(inThisLook.get(producerArg) ?? []), plateId]);
    }

    for (const [producerArg, plateIds] of inThisLook) {
      if (plateIds.length < 2) continue;
      const source = seats.get(producerArg)?.source;
      collisions.push({
        lookId,
        producerArg,
        sourceName: source?.name ?? producerArg,
        plateIds,
      });
    }
  }

  return {
    seats: new Map(
      [...seats].map(([arg, s]) => [arg, { producerArg: arg, source: s.source, frames: s.frames }]),
    ),
    frames,
    unresolved,
    collisions,
  };
}

/**
 * Every look this carrier can reach, or `[undefined]` for one that authors none.
 *
 * 🔴 **`[undefined]` IS A LOOK, AND THAT IS THE POINT.** A pre-LOOKS template has exactly one
 * fixed set of rects, which `lookPlateRects` already answers for an `undefined` id. Treating
 * it as "no looks, so no frames" would give such a template no seats at all and take every
 * existing single-plate graphic off air — the `absent`-vs-`empty` distinction the take
 * refusal already turns on, met one layer down.
 */
function lookIdsOf(carrier: TemplateLiveSources): readonly (string | undefined)[] {
  const looks = carrier.looks;
  if (looks === undefined || looks.length === 0) return [undefined];
  return looks.map((l) => l.id);
}

/**
 * 🔴 **§6.2 — THE SENTENCE FOR TWO FRAMES OF ONE LOOK POINTED AT ONE INPUT.**
 *
 * ── WHY THIS REFUSAL HAS TO EXIST AT ALL ────────────────────────────────────
 *
 * The Designer's export preflight already refuses two plates sharing one authored
 * `routeKey` in one look (`look-source-duplicate`). It cannot catch this one: the AUTHOR
 * wrote two different holes, and it is the OPERATOR who later points them at the same
 * input — a runtime action, after export, that no static check can see.
 *
 * And the outcome is silent. One input is one seat, so of the two frames only one is
 * punched: the other is a designed box with nothing in it, on air, with nothing anywhere
 * disagreeing. Measured on the shipped code before this refusal existed, the same
 * configuration did something worse — it seated the SAME route TWICE, which is exactly what
 * `looks.ts`'s invariant forbids, and two of this repo's own tests were exercising it
 * without anyone noticing.
 *
 * ⚠ It deliberately reuses the export message's vocabulary — _"one source is ONE seat, so
 * only one frame can show it"_ — so the two doors read as one rule met from two sides.
 */
export function seatCollisionMessage(collision: SeatCollision): string {
  const frames = collision.plateIds.map((id) => `"${id}"`).join(' and ');
  const look = collision.lookId === undefined ? 'this template' : `look "${collision.lookId}"`;
  return (
    `${frames} would both show "${collision.sourceName}" in ${look}. One source is ONE seat, ` +
    `so only one frame can show it and the other would go to air empty. Point one of them at ` +
    `a different source.`
  );
}

/** The plate each seat is punched by in ONE look, or absent when that look does not show it. */
export function framesOfLook(
  plan: LookBindingPlan,
  lookId: string | undefined,
): ReadonlyMap<string, ResolvedFrame> {
  const byPlate = new Map<string, ResolvedFrame>();
  for (const frame of plan.frames) if (frame.lookId === lookId) byPlate.set(frame.plateId, frame);
  return byPlate;
}

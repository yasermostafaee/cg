import type { SourceCatalog, SourceDefinition, TemplateLiveSources } from '@cg/shared-ipc';
import {
  effectiveOverridesForLook,
  lookPlateRects,
  resolvePlateSourcesForLook,
} from '@cg/shared-ipc';
import type { LiveSourceDeclaration } from '@cg/shared-schema';

/**
 * `multibox-layout-switch` §14 / session BM — **WHICH INPUT EACH FRAME OF EACH LOOK SHOWS,
 * and therefore HOW MANY PRODUCERS THE ITEM NEEDS.**
 *
 * Each distinct wire argument opens one source producer per item. If a preset shows
 * that input in several frames, each extra frame uses a separate seat fed from the
 * source producer's layer. The same numbered seats serve every preset, so the
 * maximum simultaneous use of an input determines how many seats it needs.
 *
 * A plate's routeKey identifies its frame and default binding. The resolved producer
 * argument identifies the physical input, including catalog aliases. The primary
 * seat keeps that argument as its ID for compatibility with the existing ledger.
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

/**
 * 🔴 **SESSION BQ — LEVELS 3 AND 4 ARE ORDERED IN `@cg/shared-ipc` NOW, AND THIS IS A
 * RE-EXPORT. Do not restore a local body here.**
 *
 * It was bridge-private, which is exactly why PVW's overlay could not resolve a name for a
 * look and named the template default while air showed the bound source. `B-151` was the
 * same shape one field over (the overlay never learned looks existed, that time for RECTS),
 * and BL fixed THAT by moving the resolver rather than patching the call site —
 * `lookPlateRects` carries the argument in its own doc. This is that fix applied to the
 * second field: **one function, two processes, no second spelling.**
 *
 * Both bridge readers still call it through this name: the resolver below, and the runtime's
 * refusal path (which has to hand `resolvePlateAssignments` a single `{plate → catalog id}`
 * map). The emergency wins, in every look — see this module's header, and the moved
 * function's own doc, for why.
 */
export { effectiveOverridesForLook };

/** One frame of one look, and the input it resolves to. */
export interface ResolvedFrame {
  /** `undefined` for a pre-LOOKS carrier's single implicit look. */
  readonly lookId: string | undefined;
  readonly plateId: string;
  readonly declaration: LiveSourceDeclaration;
  readonly source: SourceDefinition;
  /** The wire argument of the source producer, shared by every copy. */
  readonly producerArg: string;
  readonly seatId: string;
}

/** One live layer and every frame that can use it. */
export interface SeatDemand {
  readonly seatId: string;
  readonly producerArg: string;
  readonly source: SourceDefinition;
  /** A copy routes the primary seat's layer instead of reopening the source. */
  readonly routeFrom?: string;
  /** Every (preset, plate) that uses this seat, in preset-then-declaration order. */
  readonly frames: readonly ResolvedFrame[];
}

export interface LookBindingPlan {
  /** Primary and copy seats keyed by their stable layer identity, in demand order. */
  readonly seats: ReadonlyMap<string, SeatDemand>;
  /** Every resolved (preset, plate). */
  readonly frames: readonly ResolvedFrame[];
  /** (preset, plate) pairs no assignment could resolve. */
  readonly unresolved: readonly { lookId: string | undefined; plateId: string }[];
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
  readonly assignments: readonly {
    channel?: number | undefined;
    templateId: string;
    plateId: string;
    sourceId: string;
  }[];
  /** `CHANNEL-SOURCES-01` — the row's channel: level 2 is read ON it. */
  readonly channel: number;
  readonly catalog: SourceCatalog;
  readonly bindings?: LookSourceBindings | undefined;
  readonly overrides?: PlateSourceOverrides | undefined;
  /** `CommandBuilder.sourceArgument` — injected so the identity is the WIRE's, not a copy. */
  readonly argumentOf: (source: SourceDefinition) => string;
}): LookBindingPlan {
  const byCatalogId = new Map(input.catalog.sources.map((s) => [s.id, s] as const));
  const seats = new Map<string, Omit<SeatDemand, 'frames'> & { frames: ResolvedFrame[] }>();
  const frames: ResolvedFrame[] = [];
  const unresolved: { lookId: string | undefined; plateId: string }[] = [];

  for (const lookId of lookIdsOf(input.carrier)) {
    // The look's OWN membership, through the one carrier-level resolver — never a local
    // re-derivation of "which plates does this look show" (`B-151` is what a second copy of
    // that question cost).
    const rects = lookPlateRects(input.carrier, lookId);
    /*
      🔴 SESSION BQ — THE FOUR LEVELS ARE COMPOSED BY THE SHARED RESOLVER, not here.

      This used to read `effective?.[plateId] ?? assigned.get(plateId)` inline, which is the
      composition PVW's overlay then had no way to perform — so it was handed a name callback
      with no look in it and named the template default. The bridge now DELEGATES, so the
      preview and the wire cannot answer differently: a test asserts they agree for the same
      input, which two independent implementations would satisfy right up until they did not.
    */
    const resolvedIds = resolvePlateSourcesForLook({
      templateId: input.templateId,
      plateIds: input.carrier.sources.map((d) => d.sourceId),
      assignments: { assignments: [...input.assignments] },
      channel: input.channel,
      lookId,
      lookBindings: input.bindings,
      overrides: input.overrides,
    });
    const usesByInput = new Map<string, number>();

    // Declaration order gives each concurrent use a stable slot within this input.
    for (const declaration of input.carrier.sources) {
      const plateId = declaration.sourceId;
      if (rects[plateId] === undefined) continue;
      const catalogId = resolvedIds.get(plateId) ?? null;
      const source = catalogId === null ? undefined : byCatalogId.get(catalogId);
      if (source === undefined) {
        unresolved.push({ lookId, plateId });
        continue;
      }
      const producerArg = input.argumentOf(source);
      const copyIndex = usesByInput.get(producerArg) ?? 0;
      usesByInput.set(producerArg, copyIndex + 1);
      const seatId =
        copyIndex === 0 ? producerArg : producerArg + '\u001fcopy:' + String(copyIndex);
      const frame: ResolvedFrame = { lookId, plateId, declaration, source, producerArg, seatId };
      frames.push(frame);

      const seat = seats.get(seatId);
      if (seat === undefined) {
        seats.set(seatId, {
          seatId,
          producerArg,
          source,
          ...(copyIndex > 0 && { routeFrom: producerArg }),
          frames: [frame],
        });
      } else {
        seat.frames.push(frame);
      }
    }
  }

  return { seats, frames, unresolved };
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

/** The resolved frames of one preset, indexed by plate ID. */
export function framesOfLook(
  plan: LookBindingPlan,
  lookId: string | undefined,
): ReadonlyMap<string, ResolvedFrame> {
  const byPlate = new Map<string, ResolvedFrame>();
  for (const frame of plan.frames) if (frame.lookId === lookId) byPlate.set(frame.plateId, frame);
  return byPlate;
}

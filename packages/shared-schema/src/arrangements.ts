import { z } from 'zod';
import { LiveSourceRectSchema } from './live-source.js';
import { IdSchema } from './primitives.js';

/**
 * `multibox-layout-switch` `tasks.md` 5.1 / 5.4 — **ARRANGEMENTS: the per-arrangement
 * geometry, and the transition authored on the arrangement being ENTERED.**
 *
 * ⚠ **Vocabulary, and it is load-bearing.** A **COUNT** is how many boxes (1, 2, 3, 4…).
 * The operator never addresses a count — it is DERIVED from how many source toggles are
 * lit (D1). An **ARRANGEMENT** is a named geometry FOR a count; a count may have several,
 * one of which is its default.
 *
 * ── WHY A TABLE AND NOT A BINDING (A′, `design.md` §12.9.10) ────────────────
 *
 * `x`, `y` and `scale` are already bindable transform properties
 * (`bindings.ts:40` — verified 2026-08-19); `width` / `height` are not, and the one
 * production `transform` binding constructor hardcodes `'opacity'`. Widening bindings to
 * carry per-arrangement geometry would make the arrangement a field-driven value, which it
 * is not: it is authored, finite and enumerable. So this is an OVERRIDE TABLE read by the
 * arrangement state, and deliberately not a binding at all.
 */

/**
 * The three transition modes (`design.md` §13.5), as a DISCRIMINATED UNION rather than a
 * mode plus optional fields.
 *
 * 🔴 **The union is what makes the two measured rules unrepresentable to violate**, instead
 * of detectable after the fact — which this repo has repeatedly found to be the weaker
 * shape:
 *
 * - **A cut carries NO duration and NO easing.** _"A cut is a transition of duration
 *   zero"_ (§0), measured at 0.20 frames. `{mode:'cut', durationMs: 400}` is refused by the
 *   TYPE at authoring time and NORMALISED AWAY by the parser at load (zod strips what the
 *   arm does not declare) — deliberately not a parse ERROR, because an author switching
 *   move→cut may well leave a stale duration in the file and refusing the whole template
 *   over it would take a working graphic off air to correct a field nothing reads. Either
 *   way a duration cannot reach the runtime on a cut. And forbidding a 0 ms FADE keeps a cut
 *   spelled exactly ONE way, so nothing downstream has to decide whether two spellings
 *   agree.
 * - **A move is `linear`, on both sides.** §12.2: `linear` is the ONE name where the CSS
 *   and CasparCG tween vocabularies denote the same function (they are otherwise
 *   DISJOINT), and it measured **0.0 px** separation against 4–10 px for a pinned
 *   `cubic-bezier` table. A move is the only mode whose geometry has a server-side
 *   counterpart that must agree with it, so it is the only mode the rule binds.
 * - **A fade may use ANY easing and any duration**, because §13.5a moved it to the free
 *   side of that boundary: it fades the MASK'S LUMINANCE rather than the producer's
 *   opacity, so there is no `MIXER`, no server half and no second clock — the whole
 *   transition stays on the page. (Measured −3.4 %, the cheapest mode of the three.)
 *
 * ⚠ **`easing` is REQUIRED on every arm that has one.** That is §12.2's omitted-timing-
 * function guard expressed structurally: the CSS default `ease` measured **580–835 px**
 * from every CasparCG tween — over a third of the frame width — and `transition: left 2s`
 * is exactly what gets written by accident. A schema that cannot express "no easing stated"
 * cannot carry that mistake.
 */
export const ArrangementEasingSchema = z.enum([
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
]);
export type ArrangementEasing = z.infer<typeof ArrangementEasingSchema>;

/** Long enough for any broadcast move; short enough that a typo'd unit cannot park a switch. */
const DurationMsSchema = z.number().int().positive().max(10_000);

export const ArrangementTransitionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('cut') }),
  z.object({
    mode: z.literal('fade'),
    durationMs: DurationMsSchema,
    easing: ArrangementEasingSchema,
  }),
  z.object({
    mode: z.literal('move'),
    durationMs: DurationMsSchema,
    /** §12.2 — the ONE name both tween vocabularies share. Not a preference. */
    easing: z.literal('linear'),
  }),
]);
export type ArrangementTransition = z.infer<typeof ArrangementTransitionSchema>;

/** The cut, as a value — so no caller writes the object literal and drifts from it. */
export const CUT_TRANSITION: ArrangementTransition = { mode: 'cut' };

/**
 * ONE arrangement.
 *
 * ── WHY THERE IS NO `count` FIELD ───────────────────────────────────────────
 *
 * The count IS `cells.length`. Storing it beside the cells would be two spellings of one
 * fact, and the first edit that adds a cell without updating the number is a template whose
 * declared count and actual geometry disagree — with nothing on air to say which was meant.
 * Read it through {@link arrangementCount}.
 *
 * ── WHY CELLS ARE BARE RECTS, IN ORDER ──────────────────────────────────────
 *
 * A cell is a POSITION, not an identity. Cell order is the order lit sources are seated
 * into cells, and per-cell assignment is deliberately NOT provided: it would introduce a
 * cell as a separately addressable thing beside the plate, and the need for it is unproven.
 * An author who wants a different order authors a different order.
 *
 * **The empty list is valid** and is the count-0 arrangement — the background alone, which
 * is a real broadcast state and is what makes the operator's all-toggles-off case an
 * ordinary count instead of a special case (and, decisively, not a second spelling of STOP).
 */
export const ArrangementSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(64),
  /**
   * The cells, in order, in SCENE pixels — the box INSTANCE's box in this arrangement
   * (A′: geometry lives on the instance, never on the plate element, which is what keeps
   * `(templateId, plateId)` stable across a switch).
   */
  cells: z.array(LiveSourceRectSchema),
  /** Whether this is the default arrangement for its count. Exactly one per count. */
  isDefault: z.boolean(),
  /**
   * D2 — the transition into THIS arrangement. Per-ARRANGEMENT scope, and per-arrangement
   * is a strict SUBSET of the deferred per-pair form: a later change adds a _from_
   * dimension to entries that already exist and treats this as that row's default, so
   * taking per-pair up later needs no migration of anything an author has saved.
   */
  transition: ArrangementTransitionSchema,
  /**
   * Input 2 of {@link resolveVisibility} — this arrangement's opinion about elements,
   * `elementId → visible`. An ABSENT key is "no opinion", which is not `false`.
   *
   * This is what makes a per-arrangement background authorable without any new concept:
   * it is an ordinary element the arrangement says is visible.
   */
  visibility: z.record(IdSchema, z.boolean()).optional(),
});
export type Arrangement = z.infer<typeof ArrangementSchema>;

/** The COUNT this arrangement is for — derived, never stored (see {@link ArrangementSchema}). */
export function arrangementCount(arrangement: Pick<Arrangement, 'cells'>): number {
  return arrangement.cells.length;
}

/**
 * The arrangement list, with the one invariant that cannot be left to a UI.
 *
 * **Exactly one default per COUNT**, checked here rather than in a preflight, because both
 * failure directions are silent on air: with none, a derived count activates nothing and
 * the row goes to the refusal path for a shape the template actually has; with two, which
 * one appears depends on array order, and array order is not a decision anybody made.
 *
 * A count with NO arrangement at all is untouched by this — that is a legitimate authoring
 * choice, and reaching it is a runtime refusal rather than an authoring error.
 */
export const ArrangementsSchema = z.array(ArrangementSchema).superRefine((arrangements, ctx) => {
  const defaultsByCount = new Map<number, string[]>();
  const counts = new Set<number>();
  for (const a of arrangements) {
    const count = arrangementCount(a);
    counts.add(count);
    if (a.isDefault) defaultsByCount.set(count, [...(defaultsByCount.get(count) ?? []), a.name]);
  }
  for (const count of [...counts].sort((a, b) => a - b)) {
    const marked = defaultsByCount.get(count) ?? [];
    if (marked.length === 1) continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        marked.length === 0
          ? `the ${String(count)}-box count has no default arrangement — exactly one of its arrangements must be the default, or deriving that count activates nothing`
          : `the ${String(count)}-box count has ${String(marked.length)} default arrangements (${marked.join(', ')}) — exactly one must be the default, or which one goes on air depends on array order`,
    });
  }
});

/**
 * The default arrangement for a count, or `null` when the template authors none.
 *
 * `null` is a real answer and NOT an error here: a template need not author every count,
 * and refusing to reach an unauthored count is the runtime's job (and its refusal names
 * the count and the largest arrangement the template has), not this function's.
 */
export function defaultArrangementForCount(
  arrangements: readonly Arrangement[],
  count: number,
): Arrangement | null {
  return arrangements.find((a) => arrangementCount(a) === count && a.isDefault) ?? null;
}

// ─────────────── THE CARRIER: what the BRIDGE is told, derived once at import ───────────────

/**
 * 🔴 **`tasks.md` 5.2 — one arrangement, as the runtime receives it.**
 *
 * Derived ONCE at import beside the rest of the Live Source declaration, for the reason
 * `live-source-multibox` §1 established and nothing here changes: **no `.vcg` ever reaches
 * the bridge, the bridge parses no HTML, and the scene is discarded after import.** Anything
 * the runtime will ever need must be captured at that one moment. **No `.vcg` format change**
 * — this is derived from the scene that was already in the package.
 *
 * ── 🔴 WHY THIS CARRIES CELLS AND NOT ONE RECT PER PLATE ────────────────────
 *
 * `tasks.md` 5.2 words this as *"one rect per arrangement PER PLATE"*, and that shape is not
 * derivable at import — the reason is worth writing down because it looks derivable.
 *
 * Cell order is **the order LIT sources are seated into cells** (the Designer spec, and D1's
 * derived count). With four boxes declared and sources 1 and 3 lit, the count is 2 and those
 * two boxes take cells 0 and 1 — so which plate lands in which cell depends on the
 * OPERATOR'S TOGGLES, which no import-time derivation can know. Emitting a per-plate rect
 * would mean freezing one guess about which sources will be lit, and it would be wrong for
 * every other combination — silently, as a box in the wrong cell.
 *
 * What IS import-time knowable is split in two, and together the two are exactly the missing
 * per-plate rect:
 *
 * - **HERE: where each CELL is** — the box INSTANCE's rect in this arrangement.
 * - **On the declaration: {@link LiveSourceDeclaration.boxRelativeRect}** — where the plate's
 *   hole sits INSIDE its own box, as fractions. Arrangement-independent by construction,
 *   because that is what authoring a box as a nested composition MEANS (A′): the arrangement
 *   moves the box, and everything inside it travels unchanged.
 *
 * The bridge composes them at reconcile time (`tasks.md` 6.4), when it knows which plate is
 * in which cell. One multiply per plate, and no guess.
 */
export const LiveSourceArrangementSchema = z.object({
  id: IdSchema,
  name: z.string(),
  /** The box INSTANCE rects, in order, in SCENE pixels. Empty = the count-0 arrangement. */
  cells: z.array(LiveSourceRectSchema),
  /** Whether this is the default arrangement for its count. */
  isDefault: z.boolean(),
  /** The transition INTO this arrangement (D2). */
  transition: ArrangementTransitionSchema,
});
export type LiveSourceArrangement = z.infer<typeof LiveSourceArrangementSchema>;

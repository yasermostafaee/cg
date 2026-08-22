import { z } from 'zod';
import { IdSchema } from './primitives.js';
import { LiveSourceIdSchema } from './elements.js';

/**
 * D-137 / C-015 — the flattened axis-aligned rect a Live Source occupies, in the
 * SCENE's own pixel space (the entry composition's `resolution`), NOT in the
 * coordinates of whatever container or composition instance the element happens
 * to sit in.
 *
 * Scene pixels are the space `live-source-multibox` design.md §6's chain takes as
 * its `(px, py, pw, ph)` input, so this is the one form the bridge can consume
 * without knowing anything about the scene graph that produced it.
 */
export const LiveSourceRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type LiveSourceRect = z.infer<typeof LiveSourceRectSchema>;

/**
 * D-137 / C-015 — ONE Live Source, as the runtime sees it.
 *
 * This is the DECLARATION half of the feature: the scene is discarded after
 * import (`LibraryEntry` is `{ template, html }` and nothing else) and the bridge
 * parses no HTML, so everything the runtime will ever need about a Live Source
 * has to be captured at the single import moment. `collectLiveSources`
 * (`@cg/vcg-format`) derives one of these per Live Source; the array rides
 * `TemplateInfo` (`@cg/shared-ipc`) and is persisted with the bridge registry.
 *
 * It lives HERE, in `@cg/shared-schema`, rather than beside the wire schema,
 * because BOTH sides of the derivation need it and only one of them can see
 * `@cg/shared-ipc`: `@cg/vcg-format` (which produces it) depends on this package
 * alone. A second structurally-identical spelling in the format package is
 * exactly the drift this repo has paid for before.
 */
export const LiveSourceDeclarationSchema = z.object({
  /** The authoring element this declaration came from — the operator-facing handle. */
  elementId: IdSchema,
  /** The FILL source's symbolic id, e.g. `guest-1`. Never a device (see {@link LiveSourceIdSchema}). */
  sourceId: LiveSourceIdSchema,
  /**
   * ⚠ DEPRECATED (owner, 2026-08-10; `live-source-multibox` design.md §1a) —
   * NEVER EMITTED by `collectLiveSources`, still PARSED so every persisted
   * `TemplateInfo` from before the decision keeps loading.
   *
   * A template declares ONE symbolic id, and whether it resolves to a single
   * device or to a fill/key DEVICE PAIR is a property of the installation's
   * MAPPING (`SourceProducerSchema`'s DECKLINK arm), never of the scene. The
   * author cannot know how a source arrives at a plant, which is §12.1's
   * principle and §3's, applied one step further.
   *
   * Reading it is not the same as honouring it: the bridge resolves fill/key
   * from the MAPPING. This field survives only so a stored record parses.
   */
  keySourceId: LiveSourceIdSchema.optional(),
  /** The hole, flattened to scene pixels through its FULL ancestor chain. */
  rect: LiveSourceRectSchema,
  /**
   * `multibox-layout-switch` `tasks.md` 5.2 — **where this plate's hole sits INSIDE its own
   * BOX, as fractions of the box (0..1 on each axis).**
   *
   * A box is a nested composition instance (A′), and an arrangement positions the INSTANCE.
   * So the plate's position within its box is arrangement-INDEPENDENT by construction — that
   * is what authoring a box as a composition means — and this fraction, composed with the
   * arrangement's cell rect, is the plate's hole in that arrangement. The pair exists
   * because the per-plate rect itself is NOT derivable at import: which plate lands in which
   * cell depends on which sources the operator has lit (see `LiveSourceArrangementSchema`).
   *
   * ABSENT for a plate that is not inside a composition instance — an ordinary single-plate
   * template, which is every template that exists today. Such a plate has no box, takes part
   * in no arrangement, and keeps using {@link rect} exactly as before.
   */
  boxRelativeRect: LiveSourceRectSchema.optional(),
  /**
   * The author's DECLARATION about the source's shape, carried verbatim — the
   * bridge validates the installation's mapping against it (design.md §3). Absent
   * is a real third state ("I am not asserting anything"), not a missing value:
   * D-147 made the field optional precisely so an author who cannot see the feed
   * is not forced into a guess that can refuse a take on air.
   */
  expectedAspect: z.number().positive().optional(),
  /**
   * Whether a field binding can retarget the FILL id at playout (the
   * `live-source-id` binding target with `role: 'fill'`).
   *
   * The bridge needs this to know whether `sourceId` is the FINAL answer or
   * merely the authored default: a dynamic id is resolved per take from the
   * item's field values, and re-targeting one must not disturb its neighbours.
   * A static id can be resolved once, at load.
   */
  dynamic: z.boolean(),
  /**
   * ⚠ DEPRECATED alongside {@link keySourceId}, and now OPTIONAL — a WIDENING,
   * so every declaration persisted before the decision still parses while new
   * ones omit it entirely.
   *
   * It was required, and it had to stop being required rather than stay pinned
   * at `false`: a required field that is always the same value is a field that
   * looks like it still means something.
   */
  keyDynamic: z.boolean().optional(),
});
export type LiveSourceDeclaration = z.infer<typeof LiveSourceDeclarationSchema>;

/**
 * R-048 / C-015 phase 6 (6.9) — **THE PER-ITEM SOURCE OVERRIDE: which catalog
 * entry a plate points at FOR THIS RUN ONLY.**
 *
 * A three-plate template is on air, one input drops, and that plate goes black
 * while the other two are fine. The operator must be able to point that plate
 * somewhere else without taking the graphic off air. This is the value that
 * expresses it.
 *
 * ── THE LAYERING, WHICH IS THE WHOLE DESIGN AND MUST BE STATED WHEREVER THIS
 *    APPEARS ────────────────────────────────────────────────────────────────
 *
 *   1. **The installation's CATALOG** — what lives this station has. Global.
 *   2. **The template's ASSIGNMENT** — which catalog entry each plate uses by
 *      default. TEMPLATE-LEVEL: shared by every row carrying that template, and the
 *      default for EVERY LOOK. ⚠ **Session BP — this level FREEZES AT TAKE**: a row that
 *      is on air resolves it from {@link LiveSourceFrozenAssignmentSchema}, the snapshot
 *      its own take captured, not from the live store. Levels 1, 3 and 4 do not freeze.
 *   3. **The row's PER-LOOK composition** — {@link LiveSourceLookOverrideSchema}, added by
 *      session BM: what this row shows in one named look.
 *   4. **THIS override** — one row's substitution, on top of all three, in EVERY look.
 *
 * ⚠ **THE LEVELS WERE THREE AND ARE NOW FOUR (session BM), and THIS one moved from the
 * middle to the OUTSIDE.** It outranks the per-look composition deliberately: it exists
 * because an INPUT IS DEAD, and a dead input is dead in every look. If a per-look binding
 * won, switching look would put the dead feed straight back.
 *
 * 🔴 **IT DOES NOT WRITE BACK, and that is a safety property rather than a
 * simplification.** Editing the assignment would change every other row carrying
 * that template; editing the catalog would change the whole installation. Both
 * persist. An EMERGENCY SUBSTITUTION must never silently become the permanent
 * configuration — the operator who patched around a dead feed at 20:59 is not
 * making a decision about tomorrow's rundown.
 *
 * Keyed by PLATE ID — the scene's own handle for a hole (`guest-1`) — because the
 * override is about one hole in one row. The value is a catalog entry's
 * INSTALLATION-GENERATED id; its authority is `SourceDefinitionIdSchema` in
 * `@cg/shared-ipc`, which this package cannot import (the dependency runs the
 * other way). An id naming an entry the catalog does not have is refused at the
 * moment of the swap, where the catalog is in hand and the operator is watching —
 * not here, where the only available answer would be to drop it silently.
 */
export const LiveSourceOverrideSchema = z.record(LiveSourceIdSchema, z.string().min(1).max(64));

/**
 * Session BM — **THE ROW'S PER-LOOK COMPOSITION: `lookId → plateId → catalog id`.**
 *
 * The operator building a rundown says _"solo will show studio-3, while 2-box keeps
 * studio-1 and studio-2"_. That is a different statement from {@link LiveSourceOverrideSchema}
 * above, and it is kept in a different map for a reason worth stating where both are
 * defined:
 *
 * 🔴 **THE EMERGENCY PATCH IS NOT PER-LOOK, AND MAKING IT SO WOULD BREAK IT.** `R-048`'s
 * override exists because an INPUT IS DEAD. A dead input is dead in every look, so that
 * patch applies to all of them and outranks this map everywhere — otherwise switching look
 * would put the dead feed straight back and the operator would have to re-patch, live, once
 * per look, having already been told the substitution was applied.
 *
 * Both are per-ROW and neither writes back to the template's assignment, so the property
 * that matters is unchanged: an emergency substitution never silently becomes the permanent
 * configuration.
 *
 * ⚠ **ADDITIVE.** A row persisted before this existed simply has no entry, which reads as
 * "every look on the template's assignment" — exactly what it was.
 */
export const LiveSourceLookOverrideSchema = z.record(z.string().min(1), LiveSourceOverrideSchema);
export type LiveSourceOverride = z.infer<typeof LiveSourceOverrideSchema>;
export type LiveSourceLookOverride = z.infer<typeof LiveSourceLookOverrideSchema>;

/**
 * 🔴 **SESSION BP — THE ROW'S FROZEN LEVEL 2: the template assignment as it stood at TAKE.**
 *
 * ── THE ONE SENTENCE ────────────────────────────────────────────────────────
 *
 * **A ROW THAT IS ON AIR DOES NOT CHANGE ITS PICTURE BECAUSE SOMEBODY EDITED
 * CONFIGURATION.** The take captures the template's `{plate → catalog id}` answer and every
 * later resolution on that row — a look switch, a source swap, an UPDATE, a reconcile after
 * a blip — reads THIS, never the live assignment store.
 *
 * ── WHY IT IS A STORED VALUE AND NOT A RULE ABOUT WHO MAY EDIT ──────────────
 *
 * `B-155`: `setSourceAssignments` writes without reconciling, so an edit LURKS until the
 * next reconcile applies it — and the next reconcile is usually a look press, which then
 * carries a producer change into the middle of a switch and flashes the previous guest.
 * Two narrower answers were considered and are not enough:
 *
 *   - **disabling the editor on an on-air row** narrows WHO can reach the mechanism but
 *     leaves it intact. The assignment is TEMPLATE-wide and INSTALLATION-wide: another row
 *     carrying the same template, or **another station's Runtime against the same bridge**,
 *     can write it while this row is live. That configuration is not hypothetical — it is
 *     the one the DEFER/COMMIT ban already exists for.
 *   - **reconciling inside `setSourceAssignments`** removes the lurk by applying a
 *     template-wide edit to every row that is on air, which is the same accident arriving
 *     on time instead of late.
 *
 * Freezing closes it from every direction at once, and it is the semantically right rule
 * rather than a guard bolted onto a surface.
 *
 * ── 🔴 WHAT IS **NOT** FROZEN — three exemptions, each with its own test ────
 *
 *   - **`R-048`'s emergency swap (level 4)** applies immediately, on air, by design. It is
 *     the operator's 20:59 tool and the outermost precedence level.
 *   - **The row's per-look bindings (level 3)** reach air now, through the one binding
 *     transaction. That is what session BM built and this must not undo.
 *   - **The CATALOG (level 1)** — what a source IS. A frozen row holds a catalog *id*; if
 *     the installation re-points or retires that entry, the row follows, because the frozen
 *     fact is *which entry this plate uses*, never *what that entry resolves to*.
 *
 * The sentence "freeze the row's sources at take" would take all three away by accident.
 * **Only level 2 freezes.**
 *
 * ── ⚠ ABSENT vs EMPTY, AND THEY ARE DIFFERENT ──────────────────────────────
 *
 * **ABSENT** means NOT FROZEN — the row is off air, or was taken by a build that predates
 * this field, and resolves from the live store exactly as it always did. **An EMPTY record
 * is a real freeze to nothing**: the template had no assignment at take, and that answer is
 * pinned like any other. Every read tests presence, never emptiness — the `plateVolumes`
 * lesson (a falsy value that is a real intent), met on a different axis.
 *
 * ⚠ **STRICT: the frozen map is the row's COMPLETE answer for level 2.** A plate absent
 * from it is UNASSIGNED for this run, and does not fall through to the live store. A
 * partial freeze would leave "…except for plates that had no assignment" as a caveat, and
 * would reopen the multi-station case for exactly those plates. The operator's live door
 * for such a plate is its per-look binding (level 3), which is not frozen; the permanent
 * one is a re-take.
 *
 * Shape-identical to {@link LiveSourceOverrideSchema} and deliberately ALIASED to it rather
 * than re-declared, so the two cannot drift in what they accept. The MEANING is different
 * and this doc is where that is recorded: an override is a row's substitution ON TOP of
 * level 2; this IS level 2, held still.
 */
export const LiveSourceFrozenAssignmentSchema = LiveSourceOverrideSchema;
export type LiveSourceFrozenAssignment = z.infer<typeof LiveSourceFrozenAssignmentSchema>;

/**
 * C-015 phase 6 (6.5f) — **HOW LOUD EACH PLATE IS INTENDED TO BE, for this run.**
 *
 * ── WHY THIS EXISTS AS RETAINED STATE AND NOT ONLY IN THE BRIDGE'S LEDGER ───
 *
 * The audio rule is that every producer the bridge creates is created MUTED, and
 * audio is raised only by an EXPLICIT RECORDED INTENT naming the layer. The mute
 * half needs no memory — silence is the default. **The raise half is nothing BUT
 * memory**, and the bridge's `#liveLayers` ledger is process memory that dies with
 * the bridge.
 *
 * 🔴 So without this field a bridge blip would silently RE-MUTE a plate the
 * operator had deliberately raised: the layer comes back, the picture returns, and
 * the guest is inaudible with every console showing the row as normal. That is the
 * `B-107` / `B-109` class exactly — retention dropping state it did not model — and
 * it is the same argument that put `sourceOverride` on the OPEN axis one task ago.
 *
 * Keyed by PLATE ID, because 6.9c settled that the intent belongs to the PLATE and
 * not to the producer instance: that is precisely what lets a raised plate stay
 * audible across an on-air source swap.
 *
 * ⚠ **A value of `0` is a REAL, AUTHORED intent — "the operator muted this plate" —
 * and is NOT the same as the key being absent, which means "nobody has said".** The
 * two are indistinguishable in what they emit today and will not stay that way: the
 * absent case is what a fresh plate inherits, and a consumer that folds them
 * together loses the ability to say whether silence was chosen. Every read of this
 * map tests `=== undefined`, never truthiness — zero is falsy, and this repo has
 * paid for that three times.
 */
export const LivePlateVolumesSchema = z.record(LiveSourceIdSchema, z.number().min(0).max(1));
export type LivePlateVolumes = z.infer<typeof LivePlateVolumesSchema>;

import { z } from 'zod';
import { IdSchema } from './primitives.js';

/**
 * `multibox-layout-switch` `design.md` §14 (LOOKS, adopted 2026-08-19) — **the multi-frame
 * GROUP: looks over one shared set of live sources.**
 *
 * ⚠ **Vocabulary, and it is load-bearing.** A **LOOK** is a full sub-scene — plates, titles,
 * decor, freely placed — authored as a real nested COMPOSITION INSTANCE in the scene. Exactly
 * one look is active at a time; the switch is a cut in v1. The word is never "layer" (three
 * meanings already: scene layer, CasparCG video layer, cg-layer) and never "arrangement"
 * (that word means A′'s cell list, a different and incompatible schema).
 *
 * ── SOURCES ARE DERIVED FROM THE PLATES — `B-188` DELETED THE DECLARATION ─────
 *
 * A group used to DECLARE its sources here (`sources: LookSource[]`) and every plate had to
 * reference a declared one. **That list is gone.** The group's source list is now derived from
 * the distinct `routeKey`s the plates themselves carry, in document order of first use
 * (`deriveLookSources`, `look-sources.ts`), and a source comes into existence by pointing a
 * plate at a key.
 *
 * 🔴 **WHY, in one measurement.** The EXPORT already reduced the declaration to the used
 * set — `collectLookCarrier` dropped any declared source no look placed, and only recorded
 * rects for plates whose key was declared — so the carrier the operator and the bridge consume
 * was ALWAYS the derived set. Declaring `l1,l2,l3` and declaring `l1,l2,l3,l9` produced the
 * identical carrier `["l1","l2","l3"]`. The declaration's only surviving downstream
 * contribution was ORDER, and `deriveLookSources` now owns that. Everything else it bought was
 * an authoring-time constraint whose cost was `look-source-undeclared` — a refusal that
 * existed only because one fact was stored twice (golden rule 6, one schema up).
 *
 * The anti-goal is untouched, and is enforced where it can actually be tested: seats dedupe on
 * the resolved WIRE ARGUMENT (`live-look-bindings.ts`), so one route gets one producer however
 * many frames point at it — and two frames of ONE look pointing at the same input is refused
 * at the moment the operator does it. Two looks whose plates share a `routeKey` still resolve
 * to ONE carrier entry and therefore one default binding; deriving the list changes nothing
 * about that, because the bridge never saw the declaration in the first place.
 *
 * 🔴 **NEITHER `expectedAspect` NOR `fitMode` LIVES ON A SOURCE ANY MORE, and the owner
 * settled the question rather than this change assuming it (`B-179`).** `B-178` had already
 * moved `fitMode` per-look. The remaining argument for a per-SOURCE `expectedAspect` was that
 * an aspect asserts a property of the FEED, which cannot differ between looks. The owner
 * rejected that premise: _"aspect and fit are per-plate right now and have nothing to do with
 * the source — which I think is correct."_ `expectedAspect` is the author's intention for the
 * BOX, and the real feed wins when it is known — `resolvePlateAspect` runs source `format` →
 * source `aspect` → the element's `expectedAspect` → `assumed`. So both facts are read off the
 * plate ELEMENT: the fit per look beside the rects (`TemplateLookCarrier.fits`), the aspect
 * from the first plate serving that key in document order — the same element whose id the
 * declaration already carries. See `docs/prd/bugs-runtime.md` `B-179`.
 *
 * ── WHY `instanceId` AND NOT A CHILD LIST ──────────────────────────────────────
 *
 * A look names the ELEMENT ID of its composition instance rather than owning children,
 * because the instances are ordinary scene elements the flattener and the punch machinery
 * already walk (`design.md` §14.3 claim 2 — zero new machinery). The runtime discards a
 * `container`'s children, so a new container type was refused (§0.2); a group that OWNED
 * its subtree would be exactly that mistake one level up.
 *
 * ⚠ **v1 constraint, stated here because the runtime leans on it:** a look's instance is a
 * DIRECT child of a scene layer (root scope). The runtime's DOM read-back is root-scope
 * only, and phase 2's UI creates instances at root — a deeper instance is out of v1 scope.
 *
 * ── THE GROUPS ARRAY, AND THE v1 SINGLE-GROUP REFUSAL ─────────────────────────
 *
 * `lookGroups` is an ARRAY with an export-preflight refusal of a second entry, not a
 * singular field — the §13.6.2 shape: lifting a refusal later breaks no authored format,
 * where widening a singular field would.
 */

/**
 * How a look is ENTERED. v1 is CUT-ONLY (`design.md` §14.4 parks D2's fade/move arms with
 * the animated phase), and the object shape means the animated phase ADDS union arms
 * without breaking any authored format — the same subset argument as §13.6.2. A cut
 * carries no duration and no easing; the arm declares neither, so zod strips a stale one
 * at load rather than refusing a working template over a field nothing reads.
 */
export const LookTransitionSchema = z.object({ mode: z.literal('cut') });
export type LookTransition = z.infer<typeof LookTransitionSchema>;

/** The one v1 transition, for writers that need a value. */
export const CUT_LOOK_TRANSITION: LookTransition = { mode: 'cut' };

/** One look: a named reference to the composition INSTANCE that is its sub-scene. */
export const LookSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  /** Element id of this look's composition instance (a direct child of a scene layer). */
  instanceId: z.string().min(1),
  /** How this look is entered — a property of the look being ENTERED (§13.6.2's scope). */
  entered: LookTransitionSchema.default(CUT_LOOK_TRANSITION),
});
export type Look = z.infer<typeof LookSchema>;

export const LookGroupSchema = z
  .object({
    id: IdSchema,
    /*
      🔴 `B-188` — **THERE IS NO `sources` FIELD, and its absence is the change.**

      A group declared its sources here and the preflight refused any plate referencing
      something else. The list is derived from the plates now (`deriveLookSources`), so there is
      nothing here for a plate to contradict and `look-source-undeclared` is deleted with it.

      A stored scene or `.vcg` written before this still parses: `z.object` STRIPS unknown keys,
      so the old `sources` array is dropped at load and nothing downstream misses it — the
      carrier was already the derived set. This is `B-178`'s precedent applied to the whole
      declaration rather than to one of its fields, under `P-031`'s compatibility floor.
    */
    looks: z.array(LookSchema),
    /**
     * Which look a fresh take enters. REQUIRED as soon as the group has any look — an
     * unanswered default would make "what does take show?" an accident of array order.
     */
    defaultLookId: IdSchema.optional(),
  })
  .superRefine((group, ctx) => {
    /*
      🔴 `B-188` — the DUPLICATE-DECLARATION refusal is deleted with the list it guarded.

      It refused the same `routeKey` declared twice on one group. A derived list is distinct by
      construction, so the condition it tested can no longer arise. ⚠ It is NOT the same rule
      as `look-source-duplicate`, which survives untouched: that one refuses two PLATES sharing
      a key in one look — two frames, one seat — and is about the plates, not the list.
    */
    const lookIds = new Set<string>();
    const instanceIds = new Set<string>();
    for (const [i, look] of group.looks.entries()) {
      if (lookIds.has(look.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['looks', i, 'id'],
          message: `look id "${look.id}" is used twice`,
        });
      }
      lookIds.add(look.id);
      if (instanceIds.has(look.instanceId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['looks', i, 'instanceId'],
          message:
            `instance "${look.instanceId}" belongs to two looks — a look IS its instance, ` +
            `so two looks sharing one cannot both be "the active one"`,
        });
      }
      instanceIds.add(look.instanceId);
    }
    if (group.looks.length > 0 && group.defaultLookId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultLookId'],
        message: 'a group with looks must name its default — what a fresh take enters',
      });
    }
    if (group.defaultLookId !== undefined && !lookIds.has(group.defaultLookId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultLookId'],
        message: `defaultLookId "${group.defaultLookId}" names no look in this group`,
      });
    }
  });
export type LookGroup = z.infer<typeof LookGroupSchema>;

export const LookGroupsSchema = z.array(LookGroupSchema);
export type LookGroups = z.infer<typeof LookGroupsSchema>;

/**
 * THE group of a scene — v1 has at most one (the export preflight refuses a second), and
 * every consumer resolves it through this ONE helper rather than indexing `lookGroups`
 * locally (a second spelling of "which group" is how v1's assumption would leak).
 */
export function lookGroupOf(scene: { lookGroups?: LookGroups | undefined }): LookGroup | undefined {
  return scene.lookGroups?.[0];
}

/** The look a fresh take enters. Falls back to the first look for a tolerant read. */
export function defaultLookOf(group: LookGroup): Look | undefined {
  return group.looks.find((l) => l.id === group.defaultLookId) ?? group.looks[0];
}

/**
 * Which look owns an element whose ANCESTOR IDS are given (undefined ⇒ the element sits
 * outside every look — root scope, on screen in EVERY look). Ancestor ids come from the
 * flattener's `ancestry`; a look instance appears there by its element id.
 */
export function lookContaining(group: LookGroup, ancestorIds: readonly string[]): Look | undefined {
  return group.looks.find((l) => ancestorIds.includes(l.instanceId));
}

import { z } from 'zod';
import { LiveSourceIdSchema } from './elements.js';
import { IdSchema } from './primitives.js';

/**
 * `multibox-layout-switch` `design.md` §14 (LOOKS, adopted 2026-08-19) — **the multi-frame
 * GROUP: sources declared once, looks referencing them.**
 *
 * ⚠ **Vocabulary, and it is load-bearing.** A **LOOK** is a full sub-scene — plates, titles,
 * decor, freely placed — authored as a real nested COMPOSITION INSTANCE in the scene. Exactly
 * one look is active at a time; the switch is a cut in v1. The word is never "layer" (three
 * meanings already: scene layer, CasparCG video layer, cg-layer) and never "arrangement"
 * (that word means A′'s cell list, a different and incompatible schema).
 *
 * ── SOURCES ARE DECLARED ONCE, ON THE GROUP — a correctness condition ──────────
 *
 * A look's plate REFERENCES a declared source: the plate keeps its ordinary `routeKey`
 * field, and the reference is set-membership against {@link LookGroupSchema}'s `sources`
 * (enforced by the export preflight, tolerated at import). This is what dissolves §0.5's
 * third refusal ground: **never N producers on one route.**
 *
 * 🔴 **THAT CLAUSE SURVIVES SESSION BM; THE ONE IN FRONT OF IT DID NOT, AND THE OLD WORDING
 * IS KEPT HERE BECAUSE IT IS QUOTED IN THREE PLACES.** It read: _"the same source referenced
 * in two looks is ONE declaration and ONE seat, held across switches."_ That is a conjunction
 * over a 1:1 between a declaration and a producer, and (B′) breaks it in BOTH directions:
 * once the operator may bind each look's frame separately, one declaration bound differently
 * in two looks is TWO seats, and two declarations bound alike are ONE. What a shared
 * `routeKey` guarantees is the same DEFAULT binding, not the same seat.
 *
 * The anti-goal is untouched, and is in fact now enforced where it can actually be tested:
 * seats dedupe on the resolved WIRE ARGUMENT (`live-look-bindings.ts`), so one route gets one
 * producer however many frames point at it — and two frames of ONE look pointing at the same
 * input is refused at the moment the operator does it.
 *
 * ⚠ `expectedAspect` and `dynamic` still live on the DECLARATION, so two looks cannot
 * disagree about what a HOLE asserts. They can now disagree about what is BEHIND it: one
 * input punched by two plates that assert different aspects is reachable, and it refuses the
 * look that asserts the contradiction rather than the other.
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

/** One declared source — declared ONCE for the whole group, referenced by plates. */
export const LookSourceSchema = z.object({
  /** The symbolic id a plate's `routeKey` references. Never a device string. */
  routeKey: LiveSourceIdSchema,
  /** The aspect the design expects; a contradicting assignment is refused at take. */
  expectedAspect: z.number().positive().optional(),
  /** Whether this source carries a FILL role (see the declaration carrier). */
  dynamic: z.boolean().default(false),
});
export type LookSource = z.infer<typeof LookSourceSchema>;

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
    /** Declared ONCE. The preflight refuses a plate referencing anything else. */
    sources: z.array(LookSourceSchema),
    looks: z.array(LookSchema),
    /**
     * Which look a fresh take enters. REQUIRED as soon as the group has any look — an
     * unanswered default would make "what does take show?" an accident of array order.
     */
    defaultLookId: IdSchema.optional(),
  })
  .superRefine((group, ctx) => {
    const routeKeys = new Set<string>();
    for (const [i, s] of group.sources.entries()) {
      if (routeKeys.has(s.routeKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sources', i, 'routeKey'],
          message:
            `source "${s.routeKey}" is declared twice — a group declares each source ONCE; ` +
            `looks REFERENCE it`,
        });
      }
      routeKeys.add(s.routeKey);
    }
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

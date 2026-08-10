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
  /** The optional KEY source id of a fill+key pair. Absent ⇒ the source is fill-only. */
  keySourceId: LiveSourceIdSchema.optional(),
  /** The hole, flattened to scene pixels through its FULL ancestor chain. */
  rect: LiveSourceRectSchema,
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
  /** The same question for the KEY id (`role: 'key'`). False whenever there is no key id. */
  keyDynamic: z.boolean(),
});
export type LiveSourceDeclaration = z.infer<typeof LiveSourceDeclarationSchema>;

import { z } from 'zod';
import {
  CompositionFieldGroupSchema,
  DynamicFieldSchema,
  IdSchema,
  LiveSourceArrangementSchema,
  LiveSourceDeclarationSchema,
  LiveSourceRectSchema,
  LookTransitionSchema,
  PositionSchema,
  ResolutionSchema,
} from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Templates channels (Phase 7 §3 / Phase 8 M7.2). The Runtime's
 * watched-folder ingest populates a registry of available templates;
 * the operator UI needs the field schema (not just the URL) so it can
 * render the right editor controls. M7.2 introduces `templates.fields`
 * to expose that schema to the Renderer.
 */

/**
 * D-137 / C-015 — the LIVE SOURCE CARRIER: everything the bridge needs to place a
 * live producer behind a template's holes, derived once at import.
 *
 * ── WHY ONE BLOCK AND NOT THREE FIELDS ──────────────────────────────────────
 *
 * `resolution` and `defaultPosition` are not general-purpose additions to
 * `TemplateInfo`; they exist because the Live Source geometry chain needs them
 * (`live-source-multibox` design.md §6 — _"they ride the same carrier, derived at
 * the same moment, for the same reason"_). Grouping them makes the ONE thing a
 * reader must check — "did this template come through an importer that knew about
 * Live Sources?" — a single question with a single answer, instead of three
 * independently-absent fields whose combinations mean nothing.
 *
 * ── `defaultPosition` IS REQUIRED, AND WHY THAT IS ON-AIR ────────────────────
 *
 * The bridge appends the position query to the served URL **only when an operator
 * override exists** (`caspar-runtime.ts:3685`). With no override no `pos` rides
 * the URL and the PAGE resolves its own chain — `query override ??
 * scene.defaultPosition ?? centered`. A bridge that assumed `centered` would
 * therefore compute a different origin from the page for every template whose
 * author set a position, and the composited live box would land where the hole is
 * NOT — invisibly, because the hole is transparent.
 *
 * So the value carried here is the RESOLVED authored default —
 * `resolveDefaultPosition(scene)` (`@cg/shared-schema`), the same function whose
 * result the page's own `resolveOutputPosition` falls through to. It is never
 * absent inside this block: a declaration the bridge can act on without knowing
 * where the scene sits is not a declaration, it is a guess.
 *
 * ── WHY THE BLOCK ITSELF IS OPTIONAL ────────────────────────────────────────
 *
 * `TemplateInfo` is not only a wire shape: the bridge PERSISTS it and re-parses it
 * at boot through `PersistedTemplateSchema` (`template-registry.ts:19-30`), and a
 * record that fails that parse is SKIPPED with a warning. A newly-required
 * top-level field would therefore empty every existing station's library on the
 * first boot after upgrade. Optional at the block boundary keeps those records
 * parsing while keeping `defaultPosition` unconditionally present wherever a Live
 * Source declaration exists — which is the guarantee the on-air argument above
 * actually asks for.
 *
 * Absent is NOT "no live sources" — see {@link liveSourceCarrierState}.
 */
/** One LOOK as the bridge sees it: identity, how it is entered, and its desired rects. */
export const TemplateLookSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Cut-only in v1 (`design.md` §14.4 parks the other modes with the animated phase). */
  entered: LookTransitionSchema,
  /** routeKey → scene-px rect while this look is active. No entry = not in this look. */
  rects: z.record(z.string(), LiveSourceRectSchema),
});
export type TemplateLook = z.infer<typeof TemplateLookSchema>;

export const TemplateLiveSourcesSchema = z.object({
  /** The scene's own pixel raster — the space `sources[].rect` is expressed in. */
  resolution: ResolutionSchema,
  /** The RESOLVED authored default position (see above). Never absent. */
  defaultPosition: PositionSchema,
  /**
   * One declaration per Live Source, in document order. EMPTY is a real and
   * common answer: this template has none. The distinction between an empty
   * array and an absent block is the whole point of the block.
   */
  sources: z.array(LiveSourceDeclarationSchema),
  /**
   * `multibox-layout-switch` `tasks.md` 5.2 — the template's ARRANGEMENTS, derived once at
   * import beside {@link sources}.
   *
   * OPTIONAL, and absent is not "none": a template imported before this field existed cannot
   * say whether it has arrangements, exactly as {@link TemplateInfo.liveSources} itself
   * cannot say whether a pre-carrier template has holes. An EMPTY array is the positive
   * statement "this template has no arrangements" — which is what every template a current
   * build imports will carry, since a scene with no arrangements produces one.
   */
  arrangements: z.array(LiveSourceArrangementSchema).optional(),
  /**
   * `multibox-layout-switch` §14 (LOOKS, adopted 2026-08-19) — the template's LOOKS,
   * derived once at import beside {@link sources}.
   *
   * When PRESENT, {@link sources} is SOURCE-KEYED — one declaration per declared source,
   * deduped by routeKey — and each look's `rects` maps routeKey → the plate's scene-px
   * rect when that look is active (root-level plates outside every look appear in EVERY
   * look's map). 🔴 A source ABSENT from a look has NO entry for that look — never a
   * zero-area rect, which the bridge refuses outright. The EMPTY look is valid and carries
   * an empty map: background alone. OPTIONAL with the same absent-vs-empty contract as
   * {@link arrangements}: absent = imported before LOOKS existed; `[]` = positively none.
   */
  looks: z.array(TemplateLookSchema).optional(),
  /** Which look a fresh take enters. Present exactly when `looks` is non-empty. */
  defaultLookId: z.string().min(1).optional(),
});
export type TemplateLiveSources = z.infer<typeof TemplateLiveSourcesSchema>;

export const TemplateInfoSchema = z.object({
  templateId: IdSchema,
  /**
   * R-004 — the human-readable display name (the `.vcg` manifest's `name`; a bundled
   * starter's label). The Library shows this instead of the raw `templateId`, which for a
   * Designer-authored package is a UUID and means nothing to an operator.
   *
   * Optional and DISPLAY-ONLY: `templateId` remains the sole identity everywhere (the
   * registry key, the stack item's `templateId`, the served `/template/<id>` URL), and the
   * name never reaches an AMCP argument. Absent — or blank, which the manifest schema
   * permits since its `name` has no `.min(1)` — means "fall back to the id".
   */
  name: z.string().optional(),
  /**
   * The name of the `.vcg` FILE the operator imported, verbatim (e.g. `news-lower-third.vcg`).
   *
   * R-004 shipped `name` from the manifest, but for an operator-authored package that name
   * is the entry COMPOSITION's name — often a Designer-internal label like "Comp 1", and
   * for a manifest with a blank name the UI fell all the way back to the raw UUID. The one
   * string the operator actually chose, and the one they recognise in the Library, is the
   * file name they picked in the file dialog. It reaches the browser on `File.name` and was
   * simply being dropped at import.
   *
   * Optional and DISPLAY-ONLY, exactly like `name`: `templateId` remains the sole identity
   * (registry key, stack item's `templateId`, the served `/template/<id>` URL) and this never
   * reaches an AMCP argument. Absent for a bundled starter (there is no file) — those keep
   * their manifest name.
   */
  sourceFileName: z.string().optional(),
  templateType: z.string(),
  /** The ENTRY composition's own flat fields. */
  fields: z.array(DynamicFieldSchema),
  /**
   * B-067 — the nested-composition field namespaces (recursive). A D-119 starter is a
   * graphic composition nested in a full-frame one, and its authored fields live on the
   * NESTED comp — so `fields` alone is empty and the operator saw "No fields." Additive:
   * absent/`[]` means a flat, single-composition template, exactly as before.
   */
  groups: z.array(CompositionFieldGroupSchema).optional(),
  /**
   * R-028 (5.4) — does this template have a NEXT step (a reachable, visible
   * sequence element)? Derived ONCE at import, the moment the app holds the
   * unpacked scene, by the canonical `hasNextStep` predicate — the R-011
   * `defaultPosition` / R-018 `listFieldTargets` precedent.
   *
   * It rides `TemplateInfo` — NOT a browser-local store like those two — on
   * purpose: R-028 made the BRIDGE the catalogue of record, so a bit kept per
   * browser would light NEXT for the operator who imported and hide it for
   * everyone else, and would be lost on a bridge restart. On `TemplateInfo` it
   * is persisted with the registry and identical in every browser.
   *
   * Absent means NO next step: the safe direction. An enabled control that can
   * only no-op is the anti-pattern R-021 stage 2b named, so a template whose
   * bit predates this field simply does not offer NEXT until re-imported.
   */
  hasNext: z.boolean().optional(),
  /**
   * D-137 / C-015 — the Live Source carrier. See {@link TemplateLiveSourcesSchema}
   * for why it is one block, why `defaultPosition` inside it is required, and why
   * the block itself is optional.
   *
   * The `hasNext` precedent (above) applies in full: derived ONCE at import, the
   * one moment the app holds the unpacked scene, and carried on `TemplateInfo`
   * rather than in a browser-local store — so the bridge persists it and every
   * browser gets the same answer instead of the operator who imported getting one
   * answer and everyone else another.
   *
   * Where it DIVERGES from `hasNext` is the meaning of absent, and the divergence
   * is deliberate. `hasNext` absent means NO next step — the safe direction, since
   * the cost of being wrong is a control that is not offered. Absent HERE cannot
   * take the same shortcut: reading it as "no live sources" would put a template
   * with real holes on air with nothing composited behind them, which is a black
   * rectangle where a guest should be. Absent therefore means UNKNOWN and the
   * operator is told to re-import.
   */
  liveSources: TemplateLiveSourcesSchema.optional(),
});
export type TemplateInfo = z.infer<typeof TemplateInfoSchema>;

/**
 * D-137 / C-015 — what a template's Live Source carrier actually says. THE
 * canonical reading of {@link TemplateInfo.liveSources}, so no caller re-derives
 * the three-way distinction and quietly collapses it to two.
 *
 * - `'declared'` — the block is present and names at least one Live Source.
 * - `'none'` — the block is present and empty: this template genuinely has none.
 * - `'unknown'` — the block is ABSENT. The template was imported by a build that
 *   did not derive it, so nothing here can say whether it has holes. **This is
 *   not `'none'`.** The scene is discarded after import and the bridge parses no
 *   HTML, so the answer is not recoverable from anything the runtime still
 *   holds — only a re-import can produce it.
 */
export function liveSourceCarrierState(
  template: Pick<TemplateInfo, 'liveSources'>,
): 'declared' | 'none' | 'unknown' {
  if (template.liveSources === undefined) return 'unknown';
  return template.liveSources.sources.length > 0 ? 'declared' : 'none';
}

export const TemplatesGetChannel = defineChannel(
  'templates.get',
  z.object({ templateId: IdSchema }),
  z.union([TemplateInfoSchema, z.null()]),
);

export const TemplatesListChannel = defineChannel(
  'templates.list',
  z.void(),
  z.array(TemplateInfoSchema),
);

/**
 * Register a template in the runtime library (R-001). The `.vcg` is verified
 * (`@cg/vcg-format.verify`) and unpacked in the browser before this call — the
 * format is isomorphic, so no Node APIs reach the renderer — and the resulting
 * `TemplateInfo` is handed to the registry. `templates.list` / `templates.get`
 * see it immediately, so the operator can load it onto the stack with its field
 * schema in the Inspector. A package that fails verification never reaches here.
 *
 * B-038 Phase 2 — the request also carries `html`: the rendered **self-contained
 * standalone HTML** the browser produces from the unpacked `.vcg` (the D-019
 * single-file export, runtime + scene + images inlined). The bridge retains it
 * keyed by `templateId` so a later phase can serve it over HTTP and `CG ADD` it.
 * This is a **Runtime-only** channel (the Designer does not consume it); the
 * offline `MockRuntime` accepts and ignores `html`.
 */
export const TemplatesImportChannel = defineChannel(
  'templates.import',
  z.object({
    template: TemplateInfoSchema,
    html: z.string(),
    /**
     * R-028 part B — is this a reconnect RE-DELIVERY rather than an operator's
     * import? A re-delivery means "restore this if you lost it", never
     * "resurrect it if you dropped it on purpose": the bridge ignores one whose
     * id it has deliberately REMOVED, and keeps its own copy of an id it
     * already holds instead of letting an older browser copy overwrite it.
     *
     * Absent/false = an operator import, which always wins and clears any
     * tombstone. The flag is the browser's honest statement about which of the
     * two it is; the bridge decides what that means.
     */
    redelivery: z.boolean().optional(),
  }),
  z.object({
    registered: z.boolean(),
    templateId: IdSchema,
    /** True when a re-delivery was deliberately ignored (removed, or already held). */
    skipped: z.boolean().optional(),
  }),
);

/**
 * R-005 — remove a template from the library. The bridge is AUTHORITATIVE: it decides
 * whether the removal is allowed and returns the operator-facing reason, exactly as R-010's
 * on-air block does. The UI surfaces the refusal; it does not pre-judge it.
 *
 * Refused while ANY stack item references the template — on air or not. Removal does not
 * take a live graphic off air (CasparCG already fetched the self-contained HTML into CEF),
 * so a naive delete looks harmless and is not: the item's next out→take resolves against a
 * missing template and the row can NEVER be brought back, and `setPosition`'s re-ADD stops
 * silently. An idle/loaded row is just as poisoned as an on-air one, so the predicate is
 * "any reference", not "any on-air reference". Remove the referencing items first
 * (`stack.remove` / Remove-All) — the same unblock path R-010 uses.
 *
 * A confirmed removal must also prune the client's reconnect-reconciliation retention, or
 * the next reconnect re-imports what the operator just deleted. A REFUSED removal must
 * leave it intact.
 */
export const TemplatesRemoveChannel = defineChannel(
  'templates.remove',
  z.object({ templateId: IdSchema }),
  z.object({
    ok: z.boolean(),
    reason: z.enum(['in-use', 'unknown-template']).optional(),
    message: z.string().optional(),
  }),
);

/**
 * R-028 (o1) — the BRIDGE owns the template catalogue. Pushed with the full
 * catalogue whenever it changes (an import or a removal), so every connected
 * browser converges on the same library without polling: operator B's Library
 * re-lists the moment operator A imports. Full snapshot, not deltas — the
 * `stack.state-changed` precedent, and what makes a missed frame harmless.
 */
export const TemplatesChangedChannel = definePublishChannel(
  'templates.changed',
  z.array(TemplateInfoSchema),
);

# Design — add-keyframe-ability-registry

## D1. Where keyframe-ability lives TODAY (recon result)

Four hand-maintained sources, no central table:

1. **Schema** `AnimatablePropertySchema` (`packages/shared-schema/src/animation.ts:140`)
   — the canonical enum of 35 animatable property _paths_. The only real list.
2. **Right inspector** `StyleSection.tsx` (1501 ln) + `TextStyleSection.tsx` +
   `TransformSection.tsx`/`transform-fields.tsx`. Per kind it hand-writes fields,
   each choosing `animPointIcon` (real diamond on an `AnimatableProperty`),
   `pointIcon` (disabled no-op glyph) or no trailing (none).
3. **Timeline-left** `timelineGroupsFor()` (`keyframe-helpers.ts:228`) — a second
   hand-written per-kind row list (`TIMELINE_ROWS` + group builders). Only `shape`
   and `text` get kind-specific groups; the other 9 kinds fall through to
   `[Transform, Filter]`. (The `display`/no-op row path is dead code.)
4. **Multi-select** `shared-properties.ts` (`UNIVERSAL` + `BY_KIND`) — a third
   per-kind descriptor table; renders no diamonds (keyframe-free writes).

`StyleSection.tsx:221` and `shared-properties.ts:17` both warn `⚠️ SYNC-WITH`.
Concrete drift today: rotation has a `°` unit in the timeline but none in
multi-select; opacity is `0..1` in multi-select but shown `0..100` in the
timeline; a gradient-filled shape shows a clickable `fill.color` diamond in the
timeline-left but a dead one in the right inspector.

## D2. The registry shape (lives in the RENDERER, derives keyframe-ability from the schema)

`apps/designer/src/renderer/features/inspector/field-registry.ts` — a pure leaf
module that imports only types from `@cg/shared-schema` (no React, no store), so
both the inspector and timeline features can consume it with no import cycle.

```ts
export type InspectorSection =
  | 'Transform'
  | 'Path Style'
  | 'Text'
  | 'Border Radius'
  | 'Drop Shadow'
  | 'Text Padding'
  | 'Filter';
export type FieldKind = 'number' | 'color' | 'fill';

export interface PropertyDescriptor {
  property: AnimatableProperty; // schema enum member ⇒ keyframe-able by construction
  label: string;
  section: InspectorSection;
  fieldKind: FieldKind;
  read: (el: Element) => number | string; // STATIC value: keyframe-capture fallback + display
  keyframeable?: (el: Element) => boolean; // per-instance; default ()=>true (e.g. solid-only colour)
  multiSelect?: boolean; // does the multi editor expose it
  step?: number;
  min?: number;
  max?: number; // numeric field metadata
  unit?: string;
  factor?: number; // display unit + stored→display factor (opacity/scale)
}

export const FIELD_REGISTRY: Record<Element['type'], readonly PropertyDescriptor[]>;
export function descriptorsForKind(t: Element['type']): readonly PropertyDescriptor[];
export function keyframeableDescriptors(el: Element): readonly PropertyDescriptor[]; // filter by keyframeable(el)
export function isKeyframeable(el: Element, p: AnimatableProperty): boolean;
export function multiSelectDescriptors(el: Element): readonly PropertyDescriptor[];
```

**Location decision (renderer, not schema):** keyframe-ability at the data layer
already exists in `AnimatablePropertySchema`. The registry is a _presentation_
concern — it maps each kind's existing schema properties to how they are
presented and which panels show them, and it carries renderer-domain accessors
(`read`, field kinds, sections, units). It _derives_ keyframe-ability from the
schema: a `property` is typed as `AnimatableProperty`, so only schema-animatable
paths can be declared, and `keyframeable(el)` narrows that per instance. **No
schema change** — matching the PRD's "renderer/inspector concern" guidance.

**Consumers:**

- **Right inspector** — a single `diamondFor(el, property, frame, sel)` helper
  consults `isKeyframeable(el, property)`: real `KeyframeIndicator` when true,
  nothing when false. The bespoke field layouts (FillField, FontFamilySelect,
  clock countdown UI, the text widget grid, button groups) stay; only the
  diamond decision + the keyframe-capture `read` move to the registry.
- **Timeline-left** — `timelineGroupsFor(el)` is generated: group
  `keyframeableDescriptors(el)` by `section` in registry order, each row
  `{kind:'animatable', row:{label, property, read, unit?, factor?}}`. Replaces
  `TIMELINE_ROWS` and every group builder.
- **Multi-select** — `descriptorsFor(el)` returns `multiSelectDescriptors(el)`
  mapped to the existing `SharedPropertyDescriptor` shape (key/label/kind/
  section/prop/read/step/min/max/suffix). Replaces `UNIVERSAL`/`BY_KIND`.

## D3. Behavior-preserving strategy — two commits

**Commit 1 (behavior-preserving): registry + routing.** Introduce the registry
whose keyframe-able set per kind EXACTLY equals today's real-diamond set, and
route the three consumers to read from it. The existing suite stays green (the
truth table is unchanged). The dead no-op `pointIcon` glyphs and the
gradient→dead-glyph branch are LEFT in place in this commit (decorative, not
registry-driven), so nothing user-visible changes yet. Unify the divergent
unit/factor metadata onto the registry values that match the timeline today
(rotation `°`, opacity/scale `factor:100`); the multi editor inherits these — a
display-consistency improvement that does not change committed values.

**Commit 2 (isolated behavior change): the diamond corrections.** Flip the
single rule "diamond iff keyframe-able": remove the dead `pointIcon` glyphs
(clock digits/mode, image fit, ticker direction/speed/gap) and make the
gradient colour cases non-keyframe-able via `keyframeable(el)` (gradient ⇒
false) so both panels drop the diamond/row together. Update the truth-table /
parity tests to the post-correction target. The diff isolates exactly the
intended user-visible change.

## D4. Target truth table (post-correction; "kf" = keyframe-able / diamond)

Universal on every kind: **Transform** position.x/y, size.w/h, scale.x/y,
rotation, opacity — kf; **Filter** 9 `filter.*` — kf.

| Kind                                   | Kind-specific kf properties                                                                                                                                  | Notable non-kf (no diamond)                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| shape                                  | fill.color (solid only), stroke.color/width/dash, cornerRadius, shadow.offsetX/Y/blur/color                                                                  | fill when gradient; the `kind` select                                                                                             |
| text                                   | text.color & backgroundColor (solid only), font.size/lineHeight/letterSpacing, text-shadow.offsetX/Y/blur/color, padding.top/right/bottom/left, cornerRadius | font-family, weight, horizontal+vertical align; gradient colour cases                                                             |
| image                                  | —                                                                                                                                                            | fit                                                                                                                               |
| ticker                                 | — (deferred D-052)                                                                                                                                           | direction, speed, gap, separator, repeat, cycle seam, text family/weight/size/colour/bg, shadow, band padding, border-radius      |
| clock                                  | — (deferred D-052)                                                                                                                                           | **mode, digits** (were dead glyphs), format, target, align, text family/weight/size/colour/bg, shadow, box padding, border-radius |
| sequence                               | — (deferred D-052)                                                                                                                                           | transition/in/out/timing/ms/advance/dwell/repeat/direction, align, text styling, shadow, box padding, border-radius               |
| repeater                               | — (deferred D-052)                                                                                                                                           | composition, direction, flow, gap, max items                                                                                      |
| composition                            | —                                                                                                                                                            | (no StyleSection branch; transform/filter only)                                                                                   |
| lottie / video-placeholder / container | —                                                                                                                                                            | (transform/filter only)                                                                                                           |

Multi-select exposed subset (unchanged from today): universal (transform +
opacity + filter) on all kinds; shape adds fill.color/stroke.color/width/dash/
cornerRadius/shadow.\*; text adds text.color. Marked via `multiSelect:true`.

## D5. Risks + relationship to other items

- **This supersedes the D-050 short-path duplication.** The `⚠️ SYNC-WITH`
  warnings and the parallel `UNIVERSAL`/`BY_KIND`, `TIMELINE_ROWS`, and inline
  `animPointIcon` lists collapse into the one registry; adding/changing a
  property becomes a single declaration.
- **This is the base for D-042** (per-corner border radius): the registry models
  `cornerRadius` as one keyframe-able descriptor today; per-corner adds
  per-corner sub-property descriptors, each keyframe-able, with no consumer edits.
- **This is the base for D-052** (the deferred runtime item): the multi-select
  drag/realtime fix and the time-driven styling animation both build on the
  registry instead of re-introducing scatter. Enabling ticker/clock/sequence
  styling is a per-property `keyframeable` flip once the runtime apply-step
  (`@cg/template-runtime/animation-applier.ts`) un-gates `text.color` /
  `backgroundColor` for those kinds, applies their `textShadow`, and fixes the
  ticker's inner-viewport padding.
- **High-risk area** (the keyframe subsystem + the 1501-line `StyleSection`):
  mitigated by landing commit 1 behavior-preserving with the existing suite green
  before the corrections, plus a per-kind truth-table + right/left parity
  regression test that fails if any consumer drifts from the registry.
- **`stroke.dash` / `cornerRadius` are lossy scalars** (first dash segment;
  uniform radius / `[0]` of a per-corner tuple). The registry records the scalar
  `read`; this is unchanged from today and noted for D-042.

# Tasks — add-keyframe-ability-registry

## 1. Central registry (single source)

- [x] 1.1 New `apps/designer/src/renderer/features/inspector/field-registry.ts`
      — pure leaf module (imports only `@cg/shared-schema` types). Declares
      `PropertyDescriptor`, `InspectorSection`, `FieldKind`, `FIELD_REGISTRY`
      (per-kind ordered descriptors: universal Transform + Filter on every kind,
      plus shape Path Style / Border Radius / Drop Shadow and text Text / Drop
      Shadow / Text Padding / Border Radius), and helpers `descriptorsForKind`,
      `keyframeableDescriptors`, `isKeyframeable`, `multiSelectDescriptors`,
      `readStaticValue`, `descriptorFor`. Keyframe-able set per kind == today's
      real-diamond set (behavior-preserving). `cornerRadius` modelled as one
      descriptor, shaped for per-corner (D-042).

## 2. Route consumers through the registry (behavior-preserving)

- [x] 2.1 Right inspector: shared `KeyframeDot(el, property, frame, sel)` helper
      (`keyframe-diamond.tsx`) renders a real `KeyframeIndicator` iff
      `isKeyframeable(el, property)`, using the registry `read` for keyframe
      capture. Replaced the `animPointIcon`/`animPoint` call-sites + their inline
      read closures in `StyleSection.tsx` / `TextStyleSection.tsx`.
- [x] 2.2 Timeline-left: rewrote `timelineGroupsFor` (`keyframe-helpers.ts`) to
      generate groups from `keyframeableDescriptors(el)` grouped by `section` in
      registry order; `TIMELINE_ROWS` derived from the registry's Transform
      descriptors; removed the hand-written group builders.
- [x] 2.3 Multi-select: rewrote `descriptorsFor` (`shared-properties.ts`) to map
      `multiSelectDescriptors(el)` to `SharedPropertyDescriptor`; removed the
      hand-written `UNIVERSAL`/`BY_KIND`/`filterDesc`. `sharedEditableProperties`
      / `selectedElements` intersect-and-diff logic unchanged.
- [x] 2.4 Removed the `⚠️ SYNC-WITH` warnings at `StyleSection.tsx` /
      `shared-properties.ts` (the duplication they guard is gone).
- [x] 2.5 Behavior-preserving verified: full existing designer suite green with no
      truth-table change (commit 1 — `aa0c536`).

## 3. Diamond corrections (isolated behavior-change commit — `5d32165`)

- [x] 3.1 "Diamond iff keyframe-able": removed the dead `pointIcon`/`point` no-op
      glyphs (clock `digits`/`mode`, image `fit`, ticker `direction`/`speed`/`gap`)
      — non-keyframe-able controls render no glyph.
- [x] 3.2 Gradient colour cases: `keyframeable(el)` returns false when the relevant
      fill is a gradient (shape `fill.color`, text `text.color` / `backgroundColor`),
      so the right inspector AND the timeline-left both drop the diamond/row — fixing
      the gradient parity break.
- [x] 3.3 Deleted the now-unused `pointIcon`/`point` helpers + their
      `KeyframeIndicator` imports. (Also: render `FilterSection` for
      composition/container/lottie/video-placeholder so the right inspector matches
      the timeline-left for those kinds — filter is universal.)

## 4. Tests (write AND run)

- [x] 4.1 Truth-table unit test (`field-registry.test.ts`): per kind, the exact set
      of keyframe-able properties + each property's section — encodes the post-§2
      target; fails if any consumer drifts.
- [x] 4.2 Right/left parity: registry-level (`field-registry.test.ts`,
      `timelineGroupsFor` animatable set == `keyframeableDescriptors`) AND
      render-level (`inspector-keyframe-parity.test.ts` — renders the real
      Transform + Style inspector for each kind and compares its diamonds to the
      timeline, incl. the gradient instance).
- [x] 4.3 Corrections tests: clock `digits`/`mode` → no diamond; shape
      border-radius → diamond present (both panels); gradient fill/text colour/bg →
      no diamond either panel; solid → diamond both.
- [x] 4.4 Regression: existing animation/keyframe tests (B-005/006/007 read-path)
      and D-049/D-050 multi-select tests stay green unchanged (334 designer tests
      pass).
- [x] 4.5 E2E (`tests/e2e/keyframe-registry.spec.ts`): clock → no dead glyphs;
      shape → border-radius diamond works in the inspector (toggles at-frame);
      ticker → its text styling is NOT keyframe-able (deferred to D-052 — adapted
      from the original "ticker text size animatable" since Option 1 defers
      ticker/clock/sequence styling). Ran via `pnpm test:e2e`.

## 5. Docs, PRD, gate, ship

- [x] 5.1 Engine doc-sync: `timeline/README.md` ("Add a new animatable property"
      extension point + the authoring-surface note now point at the registry) and
      `state/README.md` (the multi-select note — registry replaces the hand-mirror
      tech debt). No inspector README exists; canvas README / engine overview
      needed no change.
- [x] 5.2 PRD: added `D-052` (deferred runtime item — keyframe-able styling for
      time-driven elements) to `docs/prd/designer.md`; `D-051` left at `[~]`.
- [ ] 5.3 Full green gate (format:check + typecheck + lint + test + build) for the
      affected workspaces, test task uncached once (`turbo --force`);
      `pnpm openspec validate add-keyframe-ability-registry --strict`.
- [ ] 5.4 Conventional commits (registry+routing, then the corrections), push,
      verify the remote head. Leave `D-051` at `[~]`; do not archive.

# Tasks — add-keyframe-ability-registry

## 1. Central registry (single source)

- [ ] 1.1 New `apps/designer/src/renderer/features/inspector/field-registry.ts`
      — pure leaf module (imports only `@cg/shared-schema` types). Declare
      `PropertyDescriptor`, `InspectorSection`, `FieldKind`, `FIELD_REGISTRY`
      (per-kind ordered descriptors: universal Transform + Filter on every kind,
      plus shape Path Style / Border Radius / Drop Shadow and text Text / Drop
      Shadow / Text Padding / Border Radius), and helpers `descriptorsForKind`,
      `keyframeableDescriptors`, `isKeyframeable`, `multiSelectDescriptors`.
      Keyframe-able set per kind == today's real-diamond set (behavior-preserving).
      `cornerRadius` modelled as one descriptor, shaped for per-corner (D-042).

## 2. Route consumers through the registry (behavior-preserving)

- [ ] 2.1 Right inspector: add a `diamondFor(el, property, frame, sel)` helper
      that renders a real `KeyframeIndicator` iff `isKeyframeable(el, property)`,
      using the registry `read` for keyframe capture. Replace `animPointIcon`
      call-sites' inline read closures in `StyleSection.tsx` /
      `TextStyleSection.tsx` (and `TransformSection.tsx`) with it. Leave the
      dead `pointIcon` glyph call-sites untouched in THIS commit.
- [ ] 2.2 Timeline-left: rewrite `timelineGroupsFor` (`keyframe-helpers.ts`) to
      generate groups from `keyframeableDescriptors(el)` grouped by `section` in
      registry order; remove `TIMELINE_ROWS` + the hand-written group builders
      (keep `TimelineGroup`/`TimelineRow`/`anim` shapes the renderer consumes).
- [ ] 2.3 Multi-select: rewrite `descriptorsFor` (`shared-properties.ts`) to map
      `multiSelectDescriptors(el)` to `SharedPropertyDescriptor`; remove the
      hand-written `UNIVERSAL`/`BY_KIND`/`filterDesc`. Keep `sharedEditableProperties`
      / `selectedElements` intersect-and-diff logic unchanged.
- [ ] 2.4 Remove the `⚠️ SYNC-WITH` warnings at `StyleSection.tsx` /
      `shared-properties.ts` (the duplication they guard is gone).
- [ ] 2.5 Verify behavior-preserving: full existing designer suite green with NO
      truth-table change (this commit must not alter any rendered diamond).

## 3. Diamond corrections (isolated behavior-change commit)

- [ ] 3.1 Apply the "diamond iff keyframe-able" rule end-to-end: remove the dead
      `pointIcon` no-op glyphs (clock `digits`/`mode`, image `fit`, ticker
      `direction`/`speed`/`gap`) — non-keyframe-able controls render no glyph.
- [ ] 3.2 Gradient colour cases: `keyframeable(el)` returns false when the
      relevant fill is a gradient (shape `fill.color`, text `text.color` /
      `backgroundColor`), so the right inspector AND the timeline-left both drop
      the diamond/row together — fixing the existing gradient parity break.
- [ ] 3.3 Delete the now-unused `pointIcon`/`point` helpers if no call-sites
      remain.

## 4. Tests (write AND run)

- [ ] 4.1 Truth-table unit test (over the registry): per kind, the exact set of
      keyframe-able properties + each property's section — encodes the post-§2
      target; fails if any consumer drifts.
- [ ] 4.2 Right/left parity unit test: per kind, the set of keyframe-able
      (diamonded) properties from the right-inspector path == the timeline-left
      `timelineGroupsFor` animatable set (incl. the gradient-instance case).
- [ ] 4.3 Corrections tests: clock `digits`/`mode` → no diamond; shape
      border-radius → diamond present (both panels); gradient fill → no diamond
      on either panel; solid fill → diamond on both.
- [ ] 4.4 Regression: existing animation/keyframe tests (B-005/006/007 read-path)
      and D-049/D-050 multi-select tests stay green unchanged.
- [ ] 4.5 E2E (extend an inspector/timeline spec): select a clock → digits/mode
      show no diamond; select a shape → border-radius shows a diamond in BOTH
      panels; select a shape with a gradient fill → no fill diamond. Run via
      `pnpm test:e2e` (turbo builds first — never a stale dist).

## 5. Docs, PRD, gate, ship

- [ ] 5.1 Engine doc-sync (same change): `state/README.md`, `timeline/README.md`,
      and the inspector docs — document the registry as the single source for
      keyframe-ability + inspector-field presence, and that new kinds/properties
      declare there.
- [ ] 5.2 PRD: add `D-052` (deferred runtime item — keyframe-able styling for
      time-driven elements) to `docs/prd/designer.md`; keep `D-051` at `[~]`.
- [ ] 5.3 Full green gate (format:check + typecheck + lint + test + build) for
      the affected workspaces, test task uncached once (`turbo --force`);
      `pnpm openspec validate add-keyframe-ability-registry --strict`.
- [ ] 5.4 Two conventional commits (registry+routing, then the corrections),
      push, verify the remote head. Leave `D-051` at `[~]`; do not archive.

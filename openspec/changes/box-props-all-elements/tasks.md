# Tasks — box-props-all-elements

## 1. Schema (@cg/shared-schema)

- [x] 1.1 `@cg/shared-schema`: add a shared `BoxStyleSchema` mixin (an optional
      `stroke` + an optional uniform-or-per-corner `cornerRadius`); extend
      text/ticker/clock/sequence to include it (shape already declares both —
      align types / refactor to the shared shape if clean). Keep `fill` vs
      `backgroundColor` / `backgroundFill` exactly as-is
- [x] 1.2 `AnimatablePropertySchema`: add `cornerRadius.tl/tr/br/bl`; keep all
      existing keys
- [x] 1.3 Migration holds: an existing `number` cornerRadius still validates (union);
      kinds gaining stroke validate with and without it

## 2. Runtime (@cg/template-runtime)

- [x] 2.1 `scene-builder`: render a 4-tuple `border-radius` for the non-shape kinds
      (mirror shape's `${tl}px ${tr}px ${br}px ${bl}px` branch); render a static
      `border` from stroke for the non-shape kinds (mirror shape's border CSS)
- [x] 2.2 `animation-applier`: make the cornerRadius path tuple-aware for ALL kinds
      — read the four `cornerRadius.tl/tr/br/bl` sub-tracks (fallback per corner to
      the static value / scalar) and recompose `border-radius` each frame; fixes
      shape's broken animated-tuple too. A uniform animated cornerRadius still works
- [x] 2.3 Do NOT ungate `applyStroke` for non-shape kinds (Option A — stroke
      animation stays shape-only; time-driven stroke/background animation is D-052)

## 3. Registry + UI (apps/designer)

- [x] 3.1 `field-registry.ts`: move `stroke.*` + `cornerRadius` into a shared box
      descriptor set included by the five kinds; add four `cornerRadius.tl/tr/br/bl`
      sub-descriptors (keyframe-able, present in per-corner mode); mark stroke
      keyframe-able only for shape (predicate). Repeater gets nothing
- [x] 3.2 `StyleSection.tsx`: add the stroke section to text/ticker/clock/sequence
      (reuse shape's controls); build the border-radius uniform↔per-corner toggle (a
      toggle icon by the uniform input that expands to four inputs side-by-side,
      tl/tr/br/bl, each with its diamond — reuse VectorField/Seg + cg-input-group)
- [x] 3.3 Toggle→uniform track-drop: on collapse, remove the tl/tr/br/bl keyframe
      tracks in ONE undo step (reuse the B-014 orphan-track clearing) so no orphaned
      still-applied tracks remain
- [x] 3.4 Verify timeline-left + multi-select inherit the box descriptors from the
      registry with NO hand-edits to those surfaces

## 4. Tests

- [x] 4.1 Schema/migration: a pre-existing `number` cornerRadius scene validates; the
      union accepts a tuple; kinds gaining stroke validate with/without it
- [x] 4.2 Runtime: static 4-tuple radius renders four corners for a non-shape kind;
      static stroke renders for a non-shape kind; an animated per-corner radius
      interpolates each corner (and the shape animated-tuple case now works)
- [x] 4.3 Toggle→uniform drops the three extra tracks; one undo restores them
      (B-014-class regression)
- [x] 4.4 Registry: stroke + cornerRadius (+ the four sub-keys) present for the five
      kinds across right inspector / timeline-left / multi-select; repeater has NONE;
      mixed-kind multi shows a box-property diamond only when all selected kinds have
      it; stroke shows NO diamond on the non-shape kinds (Option A)
- [x] 4.5 E2E (extend an inspector/canvas spec): on a text (or ticker) element set a
      stroke + a per-corner radius via the toggle → renders; keyframe one corner → it
      animates; toggle back to uniform → extra tracks gone. Run via `pnpm test:e2e`
- [x] 4.6 `.vcg` round-trip: export a scene with a 4-tuple cornerRadius + non-shape
      stroke and verify unpack/verify round-trips them

## 5. Docs + gate

- [x] 5.1 Doc-sync: `template-runtime/README.md` (box-style render + per-corner
      sub-track animation), the inspector/timeline READMEs (the toggle + box
      descriptors), note Option A's D-052 deferral
- [x] 5.2 Full green gate (format:check + typecheck + lint + test + build), test task
      uncached once (`turbo --force`);
      `pnpm openspec validate box-props-all-elements --strict`

# Tasks — a hidden content element is inert (B-034)

## 1. Runtime + schema predicate

- [x] `runtime.ts` — exclude `visible === false` from `holdTickers` / `holdCountdowns` /
      `holdSequences` AND `contentDrivers` (per kind) AND `scopeHasEffectiveHoldDrivers`.
- [x] `@cg/shared-schema` `hasEffectiveHoldDrivers` — same `visible` gate.

## 2. Designer walks + exporter

- [x] `PlayoutSection.tsx` — `hasContentElement`, `contentHoldElementsOf`, `nestedHoldGroupsOf`
      exclude `visible === false`.
- [x] `PreviewScopeTiming.tsx` — `tickersOf` + the content-source check exclude `visible === false`.
- [x] `ExporterSingleFile.ts` — `findFiniteTicker` (the `ticker-finite-with-timed-hold` preflight)
      excludes `visible === false` (found by the adversarial audit).
- [x] `PreviewModal.tsx` — `canStepScene` excludes a hidden sequence (no transport Next from a hidden
      element).
- [x] Render — already `display: none` for `!visible` (no change; covered by `hide-clock-sequence`).

## 2b. Ancestor propagation (a hidden INSTANCE/container makes its whole subtree inert)

- [x] Runtime — `FieldScopeChild` (scene-builder) + `ScopeNode` (runtime) carry the instance's
      `visible`; `aggregateContentWait` / `scopeHasEffectiveHoldDrivers` / `startContentTree` /
      `onContentStart` skip a hidden child before descending.
- [x] `scene.ts` `hasEffectiveHoldDrivers` — gate container + composition recursion on `visible`.
- [x] `PlayoutSection.tsx` — `hasContentElement` / `contentHoldElementsOf` / `nestedHoldGroupsOf`
      (analyze recursion + `findInstances`) gate container + composition on `visible`.
- [x] `PreviewScopeTiming.tsx` — `tickersOf` / `hasAnyContentIn` / `timingScopeList` skip hidden
      containers + instances.
- [x] `ExporterSingleFile.findFiniteTicker` — gate container recursion on `visible`.
- [x] `PreviewModal.canStepScene` — rewritten to walk the instance tree from the root, gating hidden
      instances/containers (so a sequence reachable only via a hidden ancestor can't be stepped).
- [x] Tests — runtime (a visible infinite driver inside a hidden instance does NOT keep the parent
      open; a visible sibling instance still drives) + the `hidden-ancestor-inert` real fixture (the
      parent settles on the finite ticker; only the visible finite ticker is an effective driver) + a
      designer E2E (hiding an INSTANCE drops its whole subtree from the parent checklist; un-hiding
      restores it).

## 2a. Real-fixture (assert against a committed scene, not only inline comps)

- [x] `fixtures/b034/hidden-content-inert.{scene.json,vcg}` (+ `.gen.mjs`) — a schema-validated
      template: content-driven parent instancing a child whose only content is a HIDDEN infinite ticker
      with a per-instance `holdOverrides` force-include, plus a hidden finite ticker (timed comp) and a
      hidden sequence.
- [x] `fixtures/b034/hidden-ancestor-inert.{scene.json,vcg}` (the master.vcg shape) — a content-driven
      parent instancing (a) a HIDDEN instance over a VISIBLE infinite sequence (no override), (b) a
      VISIBLE finite-ticker instance that drives the close, (c) a VISIBLE instance whose infinite
      sequence is excluded via a per-instance override.
- [x] Runtime fixture test (`hidden-content-fixture.test.ts`): loads `scene.json` → the force-included
      hidden crawl is inert (settles via timed); `hasEffectiveHoldDrivers` false, un-hiding flips true.
- [x] Designer fixture test (`hidden-content-vcg-fixture.test.ts`): `unpack()`s the `.vcg` (round-trips
      to `scene.json`); the hidden finite ticker raises no preflight, un-hiding it does.

## 3. Tests

- [x] Runtime (`hidden-content-inert.test.ts`): a hidden infinite ticker does NOT force an infinite
      hold (resolves to timed, settles); a hidden finite driver does not gate the hold; a parent
      `holdOverrides` force-include CANNOT resurrect a hidden NESTED driver; a hidden nested driver
      does not extend the parent hold while a visible sibling does.
- [x] Designer E2E (`hidden-content-inert.spec.ts`): hiding an own infinite ticker drops it from the
      hold checklist + the preview per-ticker timing list (warning clears); a hidden NESTED driver is
      dropped from the parent's nested checklist and un-hiding restores the row + its warning; a hidden
      sequence keeps the preview transport Next disabled.
- [x] Exporter (`exporter-single-file.test.ts`): a hidden finite ticker raises no
      `ticker-finite-with-timed-hold` preflight diagnostic.

## 4. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for the touched workspaces (turbo
      `--force`).
- [x] `pnpm test:e2e` (the new spec + adjacent hide/checklist specs).
- [x] `pnpm openspec validate hidden-content-inert --strict`.
- [x] Rounds 1–2 (visible gate + exporter preflight + nested/force-include guards) committed + pushed
      (`3b7b236`, `87c1a74`).
- [ ] Round 3 (canStepScene + real `.vcg` fixture guards) committed on `fix/hidden-content-inert`,
      HELD UNPUSHED pending the user's rebuild-and-confirm on this branch. B-034 stays `[~]`. Do NOT
      merge or archive.

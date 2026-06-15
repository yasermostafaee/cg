# Tasks — ungate-time-driven-styling (D-052)

## 1. Registry (@cg/designer — field-registry.ts)

- [ ] 1.1 Add an `isTimeDriven(el)` helper (ticker/clock/sequence).
- [ ] 1.2 `stroke.*` descriptors: keyframeable predicate `shape || isTimeDriven`
      (text stays excluded).
- [ ] 1.3 `text.color`: read `el.color` for the time-driven kinds; keyframeable for
      text PLUS the three kinds (clock/sequence gated on solid `colorFill`; ticker has
      no `colorFill`).
- [ ] 1.4 `backgroundColor`: read `el.backgroundColor` for the three kinds;
      keyframeable when `backgroundFill === undefined` (solid only) for text + the three.
- [ ] 1.5 `shadow.*`: `shadowDesc.read` also reads the time-driven kinds' `textShadow`;
      keyframeable for shape/text PLUS the three kinds.
- [ ] 1.6 `padding.*`: add descriptors for clock + sequence (read `el.padding`); NOT
      ticker. Include the chosen descriptors in the ticker/clock/sequence registry arrays.
- [ ] 1.7 Confirm `cornerRadius` descriptors unchanged.

## 2. Appliers (@cg/template-runtime — animation-applier.ts, ADDITIVE)

- [ ] 2.1 `text.color` (L70): allow `text || isTimeDriven` → `node.style.color`.
- [ ] 2.2 `backgroundColor` (L75): allow `text || isTimeDriven` → `node.style.backgroundColor`.
- [ ] 2.3 `applyStroke` (L222): guard becomes `shape || isTimeDriven`; border on root.
- [ ] 2.4 `applyShadow`: resolve `staticShadow` from `el.textShadow` for the three
      kinds AND write `text-shadow` (not `box-shadow`) for them.
- [ ] 2.5 padding: no applier change (registry-only); confirm `applyNumeric` writes
      paddingTop/... and that no ticker padding track is authorable.
- [ ] 2.6 `cornerRadius` / filter untouched.

## 3. Doc-sync

- [ ] 3.1 Registry docstring (the "deferred to D-052" note for time-driven kinds).
- [ ] 3.2 Applier docstrings ("shape-only; D-052" on stroke; the shadow branch).

## 4. Tests

- [ ] 4.1 `animation-applier.test.ts`: per-type (ticker/clock/sequence) recomposition
      for stroke, text colour, backgroundColor, shadow (text-shadow); padding for
      clock + sequence.
- [ ] 4.2 No-regression: shape stroke/colour/shadow and text colour/background/shadow
      still animate.
- [ ] 4.3 Ticker padding: no animatable track / applier doesn't apply a band padding.
- [ ] 4.4 Registry: `backgroundColor` (and text.color) NOT keyframe-able when a
      gradient fill is set (solid-only rule); keyframe-able when solid.
- [ ] 4.5 E2E (`box-props.spec.ts`): a diamond appears + animates for these props on a
      ticker/clock/sequence; selectors/aria-labels stable.

## 5. Gate + validate

- [ ] 5.1 `pnpm turbo run format:check typecheck lint test build --filter @cg/designer --filter @cg/template-runtime` (test uncached once with `--force`).
- [ ] 5.2 E2E suite.
- [ ] 5.3 `pnpm openspec validate ungate-time-driven-styling --strict`.

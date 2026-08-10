# Tasks — image fit width / height, and `none` → `original`

## 1. Schema

- [x] 1.1 Widen `ImageElementSchema.fit` to
      `['contain','cover','fill','none','fit-width','fit-height']`
      (`packages/shared-schema/src/elements.ts`). Additive ⇒ **no schema-version bump and no
      migration** (the migration registry is empty). The field comment records that `'none'`'s
      STORED value must never be "tidied" to `'original'` — every scene ever saved carries it.

## 2. Render — and the constraint

- [x] 2.1 `buildImageFitAxis` in `packages/template-runtime/src/scene-builder.ts`: a clipping box
      carrying the element's base styles, with a width- or height-pinned `<img>` centred on the
      overflowing axis. `data-cg-asset-id` STAYS on the `<img>` — every host resolves the src by
      walking `img[data-cg-asset-id]`, so moving it would leave the image permanently blank.
- [x] 2.2 🔴 **The extra node is emitted ONLY for the two new modes.** `buildImage` returns through
      an EARLY GUARD, so the legacy body is reached unchanged for `contain`/`cover`/`fill`/`none` —
      byte-identity by construction rather than by careful editing.
- [x] 2.3 Record on the function WHY no-wrapper forms were rejected: intrinsic dimensions are not in
      the scene (and would go stale when the asset is replaced), and a JS/load-time decision is the
      `B-102` class because the Designer's preview walk and the runtime's own are separate code.

## 3. Designer control

- [x] 3.1 The Inspector's fit `SelectField` offers all six options, with `labels` mapping `none` →
      **"original"**, `fit-width` → **"fit width"**, `fit-height` → **"fit height"**. The `labels`
      prop already existed; the option VALUES are untouched.

## 4. Tests

- [x] 4.1 🔴 **The byte-identity proof.** `packages/template-runtime/tests/image-fit.test.ts`
      compares the built DOM for all four pre-existing modes × four variants (plain / tinted /
      hidden / filtered) against `tests/fixtures/image-fit-golden.json`, **captured from the
      renderer BEFORE this change**. Includes a guard that the golden covers every pre-existing
      mode, so a mode cannot slip past a loop that never runs for it.
- [x] 4.2 The two new modes' geometry, the element id / opacity / filter landing on the OUTER node,
      `data-cg-asset-id` staying on the `<img>`, and a CEF-71 check that no CSS newer than the
      baseline is emitted (`B-066`).
- [x] 4.3 Schema round-trip for all six values, `none` still stored as `none`, and an unknown value
      rejected.
- [x] 4.4 **Both exporters.** `.vcg` pack → unpack for all six values
      (`packages/vcg-format/tests/roundtrip.test.ts`), and the single-file export carrying the value
      verbatim plus a check that a pre-existing mode adds no wrapper markup
      (`packages/single-file-export/tests/exporter-single-file.test.ts`).
- [x] 4.5 Designer E2E (`apps/designer/tests/e2e/image-fit-axis.spec.ts`): the control's six
      options and labels, "original" storing `none`, both new modes' geometry in the real browser,
      a pre-existing mode still rendering as a bare `<img>`, and switching back removing the
      wrapper.

## 5. Gate

- [x] 5.1 `pnpm openspec validate designer-image-fit-axis --strict`.
- [x] 5.2 Full green gate (uncached).
- [x] 5.3 ✅ **THE LINUX `gate:e2e` DEBT IS DISCHARGED.** This change alters what renders, so a
      Linux run was owed and the Windows run does not count.
      **Run: https://github.com/yasermostafaee/cg/actions/runs/31414808016** — commit `bd88ede`, the
      commit that carries this change. `status: completed`, `conclusion: success`, and the
      **`E2E (Playwright)` job's own conclusion is `success`** (not `skipped`) on `ubuntu-latest`,
      alongside `Lint • Typecheck • Test • Build=success` and `required=success`. Checked by reading
      the job conclusions, not merely that a run exists.

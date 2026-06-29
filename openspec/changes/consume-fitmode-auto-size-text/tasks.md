# Tasks — auto-size text rendering (consume `fitMode`) (D-060)

## 1. Schema (no new field)

- [ ] Confirm no schema change is needed — `fitMode` already exists
      (`packages/shared-schema/src/elements.ts:91`). Update only its docstring to
      note the runtime now consumes `autosize` (`shrink-to-fit` / `autoSqueeze`
      remain unimplemented). No version bump.

## 2. Runtime render (`@cg/template-runtime`)

- [ ] `scene-builder.ts` `applyBaseStyles`: allow the caller to SKIP writing
      `width`/`height` (e.g. a flag or a post-step override) so an auto box is not
      forced to `transform.size`.
- [ ] `scene-builder.ts` `buildText`: branch on `fitMode`. For `'fixed'`, keep
      today's behavior (width/height from `transform.size`). For `'autosize'`,
      emit `width: max-content; height: max-content` + `white-space: pre` (honor
      `\n`, no wrap) + a minimum box (≥ one line at the current font/line-height),
      keep padding + `box-sizing`, and SKIP the vertical-align flex wrapper
      (`scene-builder.ts:437-446`) while still emitting horizontal `text-align`.
- [ ] RTL anchor: for `direction: 'rtl'` + auto, pin the RIGHT edge via CSS
      `right` (derived from the anchor x vs frame width) instead of `left`; `ltr`
      / `auto` keep `left`. Vertical always top-pinned.
- [ ] `animation-applier.ts`: ignore `size` (`sizeW`/`sizeH`) track writes
      (`animation-applier.ts:55-56`) for an auto text box (content-driven).
- [ ] Verify the gradient-text inner node (`scene-builder.ts:464-481`,
      `max-width: 100%`) still maps to the glyphs inside an auto (hugged) host.

## 3. Gizmo / overlay (Designer canvas)

- [ ] `Gizmo.tsx` / `geometry.ts`: for a selected auto text element, source the
      box `w × h` from the element's RENDERED box measured in the `cgpreview`
      iframe (scene-space), not `transform.size` (`Gizmo.tsx:284-285`,
      `:344-346`). Display-only; never written back to the model.
- [ ] Disable the resize handles (4 corners + 4 edges) for an auto text box —
      do not wire `beginResize` (`Gizmo.tsx:154`); render them disabled/hidden.
      Keep body-move and rotate.
- [ ] Re-measure the box on text / `font.size` / `font.lineHeight` edits and on
      `document.fonts.ready`, so the frame stays glued (and doesn't lag a
      font-swap).
- [ ] Confirm scale + rotation still composes (B-022 parallelogram) using the
      measured `w × h`.

## 4. Inspector — alignment in Auto (D-045)

- [ ] `AlignButtonGroup.tsx`: add an optional `disabled` prop (default `false`,
      so ticker/clock/sequence are unaffected); render the disabled state.
- [ ] `StyleSection.tsx` `VAlignRow` (`:177-195`): pass
      `disabled = element.fitMode === 'autosize'` for the text element; leave
      `HAlignRow` enabled. Do NOT clear `align` / `verticalAlign` on toggle.

## 5. Exporters — verify parity (no change expected)

- [ ] Confirm `.vcg` and single-file HTML need no change — both reuse the shared
      runtime and snapshot no per-element size
      (`ExporterSingleFile.ts:253-271` sizes only the stage; `vcg-format/src` has
      no `transform.size` references). Add an exporter parity test (below).

## 6. Starter templates — audit & repair (`@cg/starter-templates`)

- [ ] Audit every text with `fitMode: 'autosize'` (breaking-news, logo-bug,
      lower-third, persian-reference, quote-card, scoreboard, fullscreen,
      showcase, …) and, per template, either keep `autosize` (if the hug is
      correct) or switch to `fixed` (if it relied on a fixed `transform.size`),
      so the shipped templates look right under real auto-size.

## 7. Tests

- [ ] Runtime unit (`@cg/template-runtime`): auto hugs both dims; `fixed`
      unchanged; `\n` → widest-line width + summed height; long line does not
      wrap; empty text keeps a minimum box; RTL pins the right edge; LTR pins the
      left; `size` track ignored in auto; gradient inner node still maps.
- [ ] Designer E2E: toggle Auto → box hugs and the element doesn't jump; resize
      handles inert in Auto (drag does nothing, stays `autosize`); V-align
      disabled + H-align enabled in Auto; toggle back to Fixed restores both
      align values and `transform.size` sizing.
- [ ] Exporter parity test: load the exported single-file HTML headless and
      assert the auto text box hugs (matches preview).

## 8. Docs / engine-sync

- [ ] `packages/template-runtime/README.md` — document the text auto-size render
      path (intrinsic sizing, `\n`, RTL anchor).
- [ ] `apps/designer/src/renderer/features/canvas/README.md` — the gizmo on a
      content-sized box (measured bounds, inert resize handles).

## 9. Gate

- [ ] `format:check` + `typecheck` + `lint` + `test` + `build` for the touched
      workspaces (`@cg/template-runtime`, `@cg/designer`, `@cg/starter-templates`,
      `@cg/shared-schema` if the docstring changed), uncached at least once.
- [ ] Run the new E2E (`pnpm test:e2e`).
- [ ] `pnpm openspec validate consume-fitmode-auto-size-text --strict`.
- [ ] Mark the PRD D-060 item `[~]` with the change dir; remind the owner to
      archive (and to schedule the coupled D-046 guard).

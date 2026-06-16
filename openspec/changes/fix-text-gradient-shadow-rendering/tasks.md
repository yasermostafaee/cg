# Tasks — fix-text-gradient-shadow-rendering (B-016, B-017)

## 1. Shared resolver

- [ ] 1.1 New `packages/template-runtime/src/text-render-node.ts`: `TEXT_NODE_DATASET` +
      `textRenderNode(host)` (returns the `data-cg-text` child if present, else the host).

## 2. Runtime render (scene-builder)

- [ ] 2.1 `buildText`: gradient branch creates an inner `data-cg-text` node (gradient +
      `background-clip:text` + `color:transparent` + glyph `filter: drop-shadow`), box
      styling stays on the outer `el`; solid branch unchanged (outer `color` + `text-shadow`).
- [ ] 2.2 `buildClock` / `buildSequence`: gradient branch renders the glyph shadow as
      `filter: drop-shadow(...)` composed onto `el.filter`; solid keeps `text-shadow`.

## 3. Ripples (bindings + applier)

- [ ] 3.1 `bindings.applyOne`: `case 'text'` (+ placeholder) and `case 'color'` (text) →
      `textRenderNode(el)`.
- [ ] 3.2 `animation-applier`: `text.color` → `textRenderNode`. `applyShadow`: text/clock/seq
      solid → `text-shadow` on the render node; text gradient → `drop-shadow` on the inner
      node; time-driven gradient → delegate to `applyFilter`. `applyFilter`: append the glyph
      `drop-shadow` for the time-driven gradient case (composed with the element filter).

## 4. Tests

- [ ] 4.1 scene-builder: B-016 (gradient colorFill + box backgroundFill → box bg on outer,
      gradient/clip on inner) for linear AND radial; B-017 (gradient + Text Shadow → inner
      `filter` has `drop-shadow`, outer box unaffected) for linear AND radial; solid unchanged.
- [ ] 4.2 scene-builder: clock/sequence gradient → `el.filter` has `drop-shadow`; solid →
      `text-shadow` (linear AND radial).
- [ ] 4.3 animation-applier: animated text-shadow over gradient text → drop-shadow on the
      right node; over solid → `text-shadow` on the outer node; box-shadow (D-057) unchanged.
- [ ] 4.4 solid↔gradient switch: binding/colour/shadow follow the correct node after a rebuild.
- [ ] 4.5 update the existing gradient-clip scene-builder test (reads the inner node now);
      E2E if observable (stable selectors).

## 5. Docs

- [ ] 5.1 designer-box-styling spec (this change) + scene-builder / applier / bindings
      docstrings describing the now node-dependent text/colour/shadow targets.

## 6. Gate

- [ ] 6.1 `pnpm turbo run format:check typecheck lint test build --filter @cg/designer
--filter @cg/template-runtime` (test uncached once with `--force`).
- [ ] 6.2 `pnpm openspec validate fix-text-gradient-shadow-rendering --strict`; screenshots
      (a) gradient + box bg both visible, (b) gradient + shadow behind glyphs, (c) clock/seq
      same, (d) solid + shadow unchanged.

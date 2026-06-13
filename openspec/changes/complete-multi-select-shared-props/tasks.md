# Tasks — complete-multi-select-shared-props

## 1. Complete shared properties

- [x] 1.1 `shared-properties.ts`: add `section` + `suffix` to the descriptor;
      widen `UNIVERSAL` (scale.x/y + the 9 `filter.*`) and `BY_KIND.shape`
      (stroke.color/width/dash, cornerRadius, shadow.offsetX/offsetY/blur/color),
      mirroring the single inspector's `prop` ids + read accessors; cornerRadius
      reads the uniform radius (per-corner tuple → "mixed")
- [x] 1.2 `⚠️ SYNC` comments at BOTH sites (shared-properties.ts header +
      `StyleSection.tsx` near ShapeSections); tech debt noted in design.md
- [x] 1.3 `MultiSelectSection`: render Transform via `Seg`/`SingleField` (+ scale)
      and the other sections (Path Style / Border Radius / Drop Shadow / Filter)
      via `NumberField` / `ColorField` / `FillField`, grouped + mixed-aware, no
      diamonds

## 2. Single-undo panel edits

- [x] 2.1 `RealtimeNumberInput`: `commitMode: 'change' | 'blur'` — `'blur'`
      defers (onChange visual-only, commit once on Enter/blur; Escape discards)
- [x] 2.2 `transform-fields` (`Seg`/`SingleField`) + `controls` (`NumberField`)
      gain `deferCommit`: input `commitMode='blur'`, drag-scrub surface dropped;
      `ColorField` gains `mixed`. Multi fields use `deferCommit` so
      `applySharedProperty` runs in ONE `runAsSingleHistoryEntry` per committed
      edit (keyframe-free, unchanged fan-out)

## 3. Thicker box

- [x] 3.1 `Gizmo.css.ts` `multiBox` border `1px → 2px` (per-shape box only)

## 4. Tests

- [x] 4.1 Unit (store): full-set intersection for two shapes
      (scale/stroke/cornerRadius/dropShadow/filter) and mixed
      (rect+ellipse → full shape set; +text → universal only); a shared
      shape-property edit applies to all, keyframe-free, in one undo
- [x] 4.2 Unit (jsdom render): the multi editor renders the full sections; a
      typed edit is visual-only until blur, then commits ONE undo across all
      selected (onChange does not write history)
- [x] 4.3 E2E `multi-select.spec.ts`: two ellipses → stroke + Border Radius +
      Drop Shadow + Filter exposed + per-shape boxes → edit stroke width + Enter
      → one undo reverts both; run `pnpm test:e2e`

## 5. Docs + gate

- [x] 5.1 Doc-sync: `features/canvas/README.md` (2px box) / inspector note
- [x] 5.2 Full green gate (format:check + typecheck + lint + test + build), test
      uncached once (`turbo --force`);
      `pnpm openspec validate complete-multi-select-shared-props --strict`

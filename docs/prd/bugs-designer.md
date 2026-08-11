# Bugs — Designer

Bug reports for the **Designer** app (`apps/designer`) and the scene-rendering it
authors/previews (`@cg/template-runtime` text/shape/lifecycle behavior). For the bug
format and Claude's per-bug loop, see [bugs.md](bugs.md).

> **B- numbers are GLOBAL** across all three bug files and are **never reused**.
> When filing a new bug, pick the next unused `B-` number regardless of which file
> it goes in. Bug files: [bugs-designer.md](bugs-designer.md) ·
> [bugs-runtime.md](bugs-runtime.md) · [bugs.md](bugs.md) (cross-cutting / tooling).

---

## [x] B-005 — inspector diamond reverts an animated property to its base value ⟨priority: high⟩ — focused fix

**Repro:**

1. Select a shape; on any animatable property (e.g. Position X) click the diamond at frame F1 to add a keyframe.
2. Move the shape on F1 (the F1 keyframe captures the new value V).
3. Scrub to a later frame F2.
4. Click the diamond (add-keyframe) next to Position X on F2.

**Expected:** a keyframe is added at F2 holding the evaluated value V (the value the field shows and the canvas renders at F2); the shape does not move. (Dragging on F2 already does this correctly.)
**Actual:** the shape reverts to the previous keyframe's pre-move base value — the diamond captured `row.read(element)` (the element's static transform) instead of the evaluated value at the playhead.
**Env:** Browser / Designer dev; reproduces on `main` (preview branch).
**Notes:** Root cause shared with B-006 — the inspector read the static value while the canvas drag path reads the evaluated value at the current frame. Fix: `TransformSection.togglePropertyKeyframe` / `StyleSection.animPointIcon` / `TextStyleSection.animPoint` now capture `effectiveAnimatableValue(el, prop, frame, staticFallback)`. Regression test: `apps/designer/tests/store-animation.test.ts` ("B-005 …"). Living-spec scenario added to `openspec/specs/designer-animation-timeline/spec.md`.

## [x] B-006 — colour field display stays stale when the property is animated ⟨priority: high⟩ — focused fix

**Repro:**

1. Select a shape that has a colour keyframe (e.g. a `fill.color` track).
2. With the playhead on a frame, edit the colour in the colour-picker / hex input.

**Expected:** both the input's displayed value AND the shape update to the new colour, and they stay in sync.
**Actual:** the shape changes (the edit lands as a keyframe via `commitAnimatable`), but the input keeps showing the old value — the colour field displayed the element's static `fill.color`/`stroke.color`/text colour instead of the evaluated colour at the current frame.
**Env:** Browser / Designer dev; reproduces on `main` (preview branch).
**Notes:** Same root cause as B-005 (read path used the static value, not the evaluated value at the playhead). Fix: colour/numeric display in `StyleSection` + `TextStyleSection` now uses `effectiveColorAt` / `effectiveNumberAt` (new colour-aware evaluators in `keyframe-helpers.ts`). Regression test: `apps/designer/tests/store-animation.test.ts` ("B-006 …").

## [x] B-007 — timeline diamond add-keyframe captures the stale base value (all properties) ⟨priority: high⟩ — focused fix

**Repro:**

1. Select a shape; on any animatable property, click the diamond to add a keyframe at frame F1, then move/edit it there (e.g. Position X → 200). The F1 keyframe correctly holds 200.
2. Move the playhead to a later frame F2. The shape correctly DISPLAYS the held value (200).
3. Click the add-keyframe diamond **in the timeline track row** for that property at F2.

**Expected:** a keyframe is added at F2 with the current evaluated value (200); the shape does not move.
**Actual:** the keyframe is added with the property's ORIGINAL/pre-move base value (e.g. 0) and the shape jumps. Dragging or editing the input at F2 captures the correct value — only the diamond was wrong. Affects ALL animatable property kinds (transform numbers, dimensions, opacity, colour).
**Env:** Browser / Designer dev; reproduces on `main` (preview branch).
**Notes:** Distinct from B-005 (which fixed the **inspector** diamonds). This is the **timeline** track-row diamond — a second add-keyframe path. Root cause: `TrackRowLabel.toggleKeyframeHere` captured `row.read(element)` — the element's static base, which is NOT updated when a keyframe is moved — instead of the evaluated value at the playhead (`effectiveRowValue`, which the row's own value readout already used). Fix: the shared `addOrToggleKeyframeAtFrame` (in `apps/designer/src/renderer/features/timeline/TrackRow.tsx`) now captures `effectiveRowValue(element, row, frame)` — one path, all value kinds. Regression tests: `apps/designer/tests/store-animation.test.ts` ("B-007 …", parametric over position.x / size.w / opacity / fill.color). Living-spec requirement generalized + scenario added in `openspec/specs/designer-animation-timeline/spec.md`.

## [x] B-008 — "Bind from canvas" creates duplicate bindings ⟨priority: high⟩ — focused fix

**Repro:**

1. Give a text element a Data key (creates a field), or add a field manually.
2. On that field click **Bind from canvas**, then click a canvas element. A binding is added and bind mode exits.
3. Re-activate **Bind from canvas** and click the **same** element again. Repeat.

**Expected:** binding the same field to the same target is idempotent — no duplicate is added (e.g. one "text on Text" binding, not five). Binding the field to a _different_ element/target is still allowed.
**Actual:** each activation+click added another identical binding, stacking duplicates (5× "text on Text" for one field).
**Env:** Browser / Designer dev; reproduces on `main` (preview branch).
**Notes:** Two requirements: (a) one activation = one bind — `CanvasOverlay` already exits bind mode (`setBindMode(null)`) after a click, verified; (b) the missing guard — `designerStore.addBinding` now **dedupes**: it no-ops when a binding with the same `fieldId` AND structurally-equal `target` already exists (helper `sameBindingTarget`). Same field → a _different_ target (other element, or same element different property) is still added. Store-level guard protects every caller. Regression test: `apps/designer/tests/fields-and-bindings.test.ts` ("B-008 …"). Spec note: the `designer-dynamic-fields` living spec is absent from the working tree (the `add-dynamic-text-fields` change is deleted), so there is no present spec to add a scenario to — the regression test is the executable spec for this fix.

## [x] B-009 — inspector inputs show a STALE value when switching elements mid-edit ⟨priority: high⟩ — focused fix

**Repro:**

1. Two text elements A and B.
2. Type a Data key (e.g. "text1") into element A's **Data key** input but do NOT press Enter / blur (value uncommitted).
3. Click element B.

**Expected:** the inspector shows B's OWN Data key (empty), not A's in-progress value.
**Actual:** the input shows "text1" (A's uncommitted draft) as B's Data key. Saving was already CORRECT ("text1" saved to A, new typing saves to B) — only the DISPLAY was wrong. Same class of bug on the element **Name** input and the **Title / Description / Pattern / Value** text fields and the **stroke / shadow colour** hex fields.
**Env:** Browser / Designer dev; reproduces on `main` (preview branch).
**Notes:** Root cause — these inspector inputs are **uncontrolled** (`defaultValue`, which only applies at mount) and relied on a React `key` derived from the committed **value** (`dk-${currentKey}`, `key-${name}`, `${label}-${value}`). When the selection moves from A to B and both share the same committed value (e.g. both Data keys empty), the key is identical, so React **reuses the same DOM node** and keeps its in-progress draft — A's uncommitted text shows under B. (Commit was fine because `onBlur` fires on A before the switch.) Fix: fold the **selected element id** into each uncontrolled input's key so it re-initialises whenever the selection changes, regardless of value equality — data-key (`dk-${element.id}-${currentKey}`) and Name (`name-${elementId}-${name}`) inputs, and a new `resetKey` prop on the shared `TextField`/`ColorField` (threaded as `element.id` from `StyleSection`/`FieldMeta`, `field.id` from `FieldsPanel`). `RealtimeNumberInput`/`SelectField` are already controlled (buffer resyncs while unfocused / native `value`) and don't exhibit it; the colour popover remounts on open, so it's unaffected. Commit-on-blur is unchanged, so a pending edit still saves to the PREVIOUS element. Regression test: `apps/designer/tests/inspector-input-resync.test.ts` (renders `DynamicDataSection`, types into A, switches to B → B shows its own value AND A's value is saved). Spec: `openspec/changes/fix-inspector-input-selection-resync/` (new `designer-inspector` capability requirement).

## [ ] B-010 — Double-click on a bound text element shows a different value ⟨priority: medium⟩

**Repro:**

1. Bind a text element to a data field (so it renders the field value, not its raw
   authored text).
2. Double-click the element to edit it on the canvas.

**Expected:** editing reflects/keeps the value consistently with what's rendered (no
mismatch between the displayed bound value and the edit surface).
**Actual:** the double-click edit surface shows a different value than the rendered
bound value (the authored/placeholder text vs the field value).
**Env:** Browser / Designer dev — confirm whether it still reproduces on the latest
`main`.
**Notes:** DEFERRED bug, logged for hygiene — **full repro / Expected / Actual and a
regression test to be detailed when scheduled**. Likely the canvas text-edit path
reads the element's authored `text` while the render path applies the binding; relates
to the bindings/`textOriginals` placeholder substitution in `@cg/template-runtime` and
the inspector read-path bugs (B-005/B-006/B-009 family).

## [ ] B-011 — Playwright preview-iframe E2E test is timing-flaky ⟨priority: low⟩

**Repro:**

1. Run the Designer E2E suite (`pnpm --filter @cg/designer test:e2e`) repeatedly.
2. Occasionally the critical-flow test fails at the live-preview assertion (the
   preview iframe hasn't rendered the field value within the 7s `expect` timeout);
   re-running passes.

**Expected:** the preview-iframe assertions are deterministic — they wait on a
"preview ready / rendered" signal, not on elapsed time, so the test never flakes.
**Actual:** intermittently fails on a timing window and passes on re-run.
**Env:** Browser / Designer dev + CI. Observed once on the `refactor/store-slices`
branch (the selection-slice commit): `setPreviewField('headline', 'Hello E2E')`
then `expect(previewFrame.getByText('Hello E2E')).toBeVisible()` timed out, green on
re-run. **Pre-existing**, unrelated to that refactor; currently **masked in CI by
`retries: 1`** (`apps/designer/playwright.config.ts`).
**Notes:** DEFERRED test-infra bug, logged for hygiene — **do not fix now.** Spec:
`apps/designer/tests/e2e/critical-flow.spec.ts` (the `compose → data key → live
preview → …` test, ~line 22); fixture: `apps/designer/tests/e2e/fixtures/designer.ts`
(`previewFrame` / `setPreviewField`). Suspected cause: the test waits on timing
rather than a deterministic "preview ready" signal from the iframe. **Proposed fix
(when scheduled):** have the preview iframe expose a readiness flag once the
runtime's ready promise resolves (post a message / set a marker attribute), and make
the E2E fixture wait on THAT instead of on time; then re-evaluate whether `retries: 1`
can stay or be removed.

## [x] B-014 — Switching a keyframed colour fill to gradient leaves an orphaned, still-applied colour track ⟨priority: high⟩

**Repro:**

1. Select a shape; give its `fill.color` (solid) a couple of keyframes so the colour animates.
2. In the inspector switch the fill from **solid** to **gradient** (or linear).

**Expected:** switching to a fill mode that is NOT keyframe-able removes the colour keyframes for that property (one undo step); the gradient renders statically and is freely editable; no colour animation remains.
**Actual:** the diamond correctly disappears (D-051: gradient isn't keyframe-able), BUT the previous colour keyframes are NOT removed — they stay on the track and the runtime KEEPS animating the colour, while the gradient colour can't be edited; switching back to solid reveals the keyframes were never gone, just hidden. UI says "not keyframe-able" while the data + playout engine still animate it — an inconsistent half-state.
**Env:** Browser / Designer dev; reproduces on `main` after D-051. PRE-EXISTING (the orphaned track predates D-051; D-051 only corrected the diamond's visibility, which exposed the contradiction). Affects every colour property with a solid↔gradient distinction — `fill` on shapes AND `text.color` / `backgroundColor` on text (same keyframeable-iff-solid rule from D-051's registry).
**Notes:** Decision (owner): **Option A** — switching to a non-keyframe-able fill/colour mode DELETES that property's keyframes, as ONE undo step (so an accidental switch is recoverable via undo). Fix where the fill/colour MODE is changed (the inspector's solid→gradient switch handler — likely in `FillPopover.tsx` / the colour-field commit path): when the new mode makes the property non-keyframe-able, remove that property's keyframe track in the same store transaction. Use D-051's registry predicate (`keyframeable(el)` — the gradient ⇒ false rule already exists) as the SINGLE source for "is this still keyframe-able", so the delete triggers exactly when the diamond would disappear — no parallel condition. Cover ALL solid↔gradient colour properties (shape `fill`, text `text.color` + `backgroundColor`), not just shape fill. Regression test: keyframe a solid fill → switch to gradient → assert the colour track is gone, the runtime no longer animates the colour, and one undo restores both the solid mode and its keyframes; parametrize over shape-fill + text-colour. (Confirm during repro that the runtime currently DOES still apply the orphaned track — i.e. the colour visibly animates after the switch — and that the value also stops being editable; if the observed symptom differs, report before fixing.) **DONE** — fixed on `main` (PR #97, `10cf6c8`: `clearOrphanColourTrack` in `fill-commit.ts`). No OpenSpec change; the regression tests are B-014's spec — `apps/designer/tests/fill-commit.test.ts` (unit, parametrized over shape-fill + text-colour) and `apps/designer/tests/e2e/regressions.spec.ts` (E2E).

## [x] B-019 — Dragging an image THUMBNAIL doesn't add it to the canvas (native img-drag steals the cell drag) ⟨priority: medium⟩

**Repro:**

1. Open the Project Assets panel with at least one imported image.
2. Drag the asset by its **thumbnail picture** onto the canvas.

**Expected:** an image element is inserted at the drop point (same as dragging by the asset
NAME), with a drag ghost showing the whole cell (image + name).
**Actual:** nothing is inserted, and the drag ghost is the image ONLY. Dragging by the NAME
works (inserts; ghost = image + name). It looks size-related (a large thumbnail "fails")
only because a bigger thumbnail fills the cell, so the grab lands on the `<img>`.
**Env:** Browser / Designer; both grid and list layouts of the assets panel.
**Root cause:** in `AssetThumb.tsx` the cell `<div>` is `draggable` and its `onDragStart`
sets `dataTransfer 'application/x-cg-asset-id'` (the key the canvas drop reads —
`CanvasOverlay.onDrop`). But the thumbnail `<img>` is **natively draggable**, so grabbing
the picture starts a browser image-drag (no `x-cg-asset-id` payload → the drop sees nothing →
no insert; ghost = the image). Grabbing the name (a `<span>`, not natively draggable) bubbles
to the cell drag, which works (default ghost = the whole cell). The `<img>` is the only
natively-draggable child of the cell.
**Fix:** set `draggable={false}` on the thumbnail `<img>` so the cell `<div>` is the SOLE drag
source. Both grab points then start the cell drag → the payload is set (canvas inserts the
image) AND the default ghost becomes the whole cell (image + name) consistently. No custom
`setDragImage` — the default cell ghost is already the desired image+name. Code defect, no
behaviour spec change (the drag-onto-canvas insert is the existing, working name-drag path).
Test: a component test asserting the thumbnail `<img>` is `draggable={false}` and the cell
carries `draggable` + an `onDragStart` that sets `application/x-cg-asset-id` to the asset id
(`apps/designer/tests/asset-thumb-drag.test.ts`). Branch: `fix/asset-thumb-drag`.
**DONE** — merged on `main` (PR #130, `adaac87`).

## [x] B-020 — adding an image fails intermittently (picker focus-timer races the change event) ⟨priority: high⟩ — focused fix

**Repro:**

1. In the Designer, open the Project Assets panel (or the Shared Library panel) and
   click **Add** → pick a single image in the OS file dialog.
2. Repeat several times.

**Expected:** every pick adds the image — reliably, no retries.
**Actual:** the import fails "most of the time" and only succeeds after a few tries —
the picked file is silently dropped (no loading tile, nothing imported). Intermittent
= a timing race.
**Env:** Browser / Designer dev (Chrome 149); regression on
`feature/D-067-image-import-loading`, introduced by the D-069 freeze fix.
**Root cause:** the D-069 cancel-hang fix added an **unconditional** 400ms
window-`focus` fallback to `pickFiles` (`apps/designer/src/platform/createDesignerBridge.ts`)
to detect a cancelled dialog. But on a **real selection** the dialog's close fires
`focus` too, arming that timer; when its 400ms elapsed before the input's slightly-later
`change` event, the fallback resolved `[]` (a false cancel) and the real selection was
dropped. When `change` happened to beat the timer it worked — hence "try several times".
**Fix:** the host fires the input `cancel` event (Chrome 149; Baseline since
Chromium 113 / Firefox 91 / Safari 16.4 — the app's whole support matrix, incl. the
Firefox File-System-Access fallback path), so cancellation is detected by `cancel`
**alone** and the racing focus-timer fallback is **removed** — nothing pre-empts
`change`. Cancel still resolves `[]` via `cancel` (the D-069 freeze/leak stays fixed) and
a real selection settles via `change` unimpeded. `pickFiles` extracted to its own module
(`apps/designer/src/platform/pickFiles.ts`) for the regression test. No spec-level
behavior change (the D-069 freeze fix touched no OpenSpec spec) → focused fix, no OpenSpec
change. Regression test: `apps/designer/tests/pick-files.test.ts` (focus-then-late-`change`
delivers the selection; ×10 reliability; multi-select; cancel resolves `[]`). Branch:
`feature/D-067-image-import-loading` (same branch as the D-067 PR).
**DONE** — merged on `main` with D-067 (PR #138, `21d9174`).

## [x] B-021 — non-image/font files import as broken tiles (picker `accept` is a bypassable hint) ⟨priority: high⟩ — focused fix

**Repro:**

1. In the Designer, open the Project Assets panel (or Shared Library) and click
   **Add** → **Image…** (or **Add library image**).
2. In the OS dialog switch the file-type filter to **All files** (the picker opens on
   images, but with "All files" set you can navigate and select any format).
3. Select a **pdf / mp3 / mp4**.

**Expected:** unsupported files are rejected — not imported, no tile — and a
non-blocking notice says which were skipped; any valid image(s) in the same selection
still import.
**Actual:** the pdf/mp3/mp4 is added with a **broken thumbnail**. The `<input accept>`
attribute only _hints_ the dialog; it does not constrain what the user can actually
select, and the store imported whatever it was given (`AssetStore.importFile` falls back
to `kind: 'image'` for any extension; `SharedImageStore` is always `image`), so the
broken tile rendered.
**Env:** Browser / Designer; both Project Assets (image + font) and Shared Library.
Reproduces on `feature/D-067-image-import-loading`.
**Root cause:** `accept` is a UI hint, trivially bypassed via "All files". The selection
was never validated after the picker returned, and the stores accept any bytes.
**Fix:** validate the SELECTION after `pick()` returns, before `store`. New single
source of truth `apps/designer/src/shared/asset-types.ts` (allowed extensions + canonical
MIME per kind, mirroring the store's `KIND_BY_EXT`) drives BOTH the picker `accept` hint
(`acceptAttr`, now consumed by `pickFiles`) and the post-pick gate (`partitionSupported`
/ `isSupportedFile`, by extension primarily, MIME as a fallback). Both panels
(`SharedLibraryPanel.addImage` for image; `ProjectAssetsPanel.importKind` for image AND
font) now split the picked files: unsupported ones are dropped before any `begin()`/tile
or `store` and reported through the app's EXISTING toast (`designerStore.showNotice` →
the bottom-centre `<Toast>` in `App.tsx`, auto-dismiss + close), with a concise message
(`skippedFilesMessage` — count + first few names for a large batch); valid ones still
import + prepend. Mixed batch → valid import, rest noticed; all-invalid → just the toast.
No bridge/schema change (renderer-side gate) → focused fix, no OpenSpec change.
Regression tests: `apps/designer/tests/import-loading.test.ts`
("post-pick file-type validation (B-021)" — shared all-invalid, shared mixed,
project-assets Image…+pdf, project-assets Font…+non-font; asserting no store call, no
tile, the valid file still imports, and the toast message via `designerStore`). Branch:
`feature/D-067-image-import-loading` (same branch as the D-067 PR).
**DONE** — merged on `main` with D-067 (PR #138, `21d9174`).

## [x] B-015 — border-radius keyframes don't migrate on uniform↔per-corner toggle ⟨priority: high⟩ — archived: openspec/changes/archive/2026-06-15-migrate-radius-keyframes-on-toggle/

<!-- Change: openspec/changes/migrate-radius-keyframes-on-toggle -->

**Repro:**

1. یک shape با border-radius کلی (uniform) بساز و رویش حداقل یک کیفریم بگذار.
2. روی toggle بزن تا به حالت ۴تایی (per-corner) برود.
3. (سناریو ب) در حالت ۴تایی یک کیفریم اضافه کن — کار می‌کند و در پریویو دیده می‌شود.
4. به حالت uniform برگرد، سپس دوباره به ۴تایی.

**Expected:** کیفریم‌ها هنگام toggle مهاجرت کنند (گزینهٔ ۲):

- uniform→per-corner: مقدار و کیفریم‌های uniform به **هر چهار گوشه** کپی شوند (بدون از-دست-رفتن).
- per-corner→uniform: اگر هر چهار گوشه یکسان بودند همان مقدار/کیفریم‌ها؛ اگر متفاوت بودند **top-left** نماینده شود و سه گوشهٔ دیگر دور ریخته شوند.
- toggle هرگز کیفریمِ زنده را بی‌سکوت گم نکند؛ آنچه روی صفحه بود بعد از toggle همان رفتار را بدهد.

**Actual:** uniform و per-corner دو دستهٔ کیفریمِ **جدا**ی غیرمرتبط‌اند و toggle فقط نمایش را عوض می‌کند (هیچ داده‌ای منتقل نمی‌شود):

- uniform دارای کیفریم → ۴تایی: کیفریم‌های uniform دیده نمی‌شوند (مخفی، نه پاک — با toggle برگشت دوباره دیده می‌شوند).
- در ۴تایی کیفریم اضافه می‌شود و کار می‌کند، ولی بعد از رفت‌وبرگشت uniform↔per-corner، کیفریم‌های چهارگوشه ناپدید می‌شوند (به‌نظر toggle موقعِ جابجایی track را بازنویسی/پاک می‌کند — recon باید روشن کند).

**Env:** Browser / Designer dev؛ روی `main` بازتولید می‌شود.
**Notes:** Root cause در `BorderRadiusSection` / `toPerCorner` / `toUniform` در `apps/designer/src/renderer/features/inspector/StyleSection.tsx`. keyframe/schema-touching — **دو-فازی (recon-only اول)**. هم‌فایل با D-055؛ **بعد از merge شدنِ D-055** برداشته شود تا تداخلِ branch نشود. تستِ رگرسیون: رفت‌وبرگشتِ toggle با کیفریمِ uniform و per-corner، و موردِ چهار-گوشهٔ-متفاوت→uniform (انتخابِ top-left).

## [x] B-016 — gradient text color wipes the box background (text element only) ⟨priority: medium⟩ — fixed: `openspec/changes/archive/2026-06-16-fix-text-gradient-shadow-rendering/` (shared with B-017)

**Repro:**

1. یک المانِ **text** بساز که هم background داشته باشد (رنگ یا fill) هم رنگِ متن.
2. رنگِ متن را روی linear/radial gradient بگذار.

**Expected:** متنِ gradient و پس‌زمینهٔ جعبه مستقل رندر شوند — پس‌زمینه نباید
محو/clip شود.
**Actual:** پس‌زمینه ترنسپرنت می‌شود و جعبه gradient ِ متن را می‌گیرد. علت: متنِ
gradient از shorthand ِ `background: <gradient>` + `background-clip: text` روی همان
node استفاده می‌کند که `background-color`/`background-image` ِ پس‌زمینهٔ واقعی را پاک
می‌کند، و بعد `background-clip: text` هرچه مانده را به glyph می‌برد.
**Env:** Browser / Designer dev؛ روی `main`. **فقط المانِ text** — ticker/clock/
sequence بعد از D-056 دیگر background ندارند (تداخل منتفی)، و ticker اصلاً colorFill
نداشت.
**Notes:** Root cause در `buildText` (`scene-builder.ts:328-337`): متنِ gradient و box
background روی یک node با هم تداخل دارند. `background-clip: text` همهٔ backgroundهای آن
node را به متن clip می‌کند، پس یک node نمی‌تواند هم متنِ gradient هم پس‌زمینهٔ جعبه
داشته باشد. **fix: یک node ِ جدا برای متنِ gradient** (یک wrapper ِ داخلیِ
layout-transparent) — box styling روی el ِ بیرونی می‌ماند. ریسکِ مهم: node ِ جدید نباید
auto-size/fit/measurement، alignment، RTL/bidi، یا target ِ inline-edit را عوض کند.
pre-existing (مستقل از D-052/D-056). تستِ رگرسیون: gradient متن + box background روی
text با هم رندر شوند (background clip نشود). keyframe/render-touching → **دو-فازی**.

## [x] B-017 — text-shadow lands ON gradient text instead of behind it ⟨priority: high⟩ — fixed: `openspec/changes/archive/2026-06-16-fix-text-gradient-shadow-rendering/` (shared with B-016)

**Repro:**

1. یک المانِ **text** بساز و رنگِ متن را روی linear/radial gradient بگذار.
2. یک **Text Shadow** بهش بده.

**Expected:** سایه **زیرِ** متن بیفتد (مثلِ حالتِ رنگِ solid)، و گرادیانِ متن کامل
دیده شود.
**Actual:** سایه **روی** متن می‌افتد و گرادیان را می‌پوشاند — متن شبیهِ «یک سایهٔ
خیلی ریز» دیده می‌شود. با تغییرِ پوزیشنِ سایه معلوم می‌شود گرادیانِ متن **درست** است
ولی زیرِ سایه پنهان شده.
**Env:** Browser / Designer dev؛ هر دو preview و export (فرقی ندارد).
**Notes:** فقط وقتی رنگِ متن **گرادیان** است رخ می‌دهد؛ با رنگِ **solid** سایه درست
زیرِ متن می‌افتد. **box-shadow و shape درست‌اند** (مشکل فقط text-shadow روی متنِ
گرادیان). ریشهٔ محتمل: گرادیانِ متن از `background-clip: text` + `color: transparent`
استفاده می‌کند؛ روی متنِ transparent، لایه‌بندیِ text-shadow نسبت به گرادیان به‌هم
می‌خورد و سایه روی glyphها می‌افتد. **هم‌ریشه با B-016** (هر دو تداخلِ
`background-clip: text` روی node ِ مشترک‌اند). نامعلوم که pre-existing است یا رگرسیونِ
D-057 (recon از git روشن کند). احتمالاً یک fix ِ مشترکِ «node ِ جدا برای متنِ گرادیان»
هر دو B-016 و B-017 را حل می‌کند. render-touching → **دو-فازی، recon مشترک با B-016.**

## [x] B-018 — Box-shadow Spread static value not writable (writeStaticAnimatable missing shadow.spread / boxShadow.spread cases) ⟨priority: high⟩ — fixed on `main`

**Repro:**

1. Add a **shape** (or a **text** element) and open its **Box Shadow** section.
2. Type a value into the **Spread** field with no keyframe on it (a plain static edit).

**Expected:** the box-shadow spread (the CSS 4th length) updates — the shadow grows /
shrinks in the preview and persists.
**Actual:** nothing happens; `el.shadow.spread` is never written. A KEYFRAMED spread
already animated correctly — only the STATIC write was broken, on BOTH the shape
(`shadow.spread`) and the text box (`boxShadow.spread`).
**Env:** Browser / Designer; both preview and export.
**Root cause:** `writeStaticAnimatable` (`apps/designer/src/renderer/state/slices/timeline.ts`)
is a `switch (property)` with cases for `shadow.offsetX/offsetY/blur/color` and
`boxShadow.offsetX/offsetY/blur/color` but NO case for `shadow.spread` or
`boxShadow.spread`, so a static Spread edit (`commitAnimatable` → `writeStaticAnimatable`)
fell through and never wrote `el.shadow.spread`. Introduced by D-043 — the keyframed path
was tested, the static path was not, so the green gate didn't catch it.
**Fix:** add a combined `shadow.spread` / `boxShadow.spread` case writing `el.shadow.spread`
(both kinds' box-shadow lives on `el.shadow`; a NEGATIVE spread / shrink is valid — no
clamp), plus a store test driving the static write path on a shape AND a text element. NO
OpenSpec change — the merged D-043 spec already requires Spread to be settable. Branch:
`fix/B-018-spread-static-write`. Mark `[x]` on merge.
**DONE** — fixed on `main`: `apps/designer/src/renderer/state/slices/timeline.ts:545-562` adds
the combined `shadow.spread` / `boxShadow.spread` case (comment cites B-018), so a static
Spread edit now writes `el.shadow.spread` (negative spread / shrink allowed, no clamp).

## [x] B-022 — scaleX/scaleY detaches the selection box, then rotate spins wrong ⟨priority: medium⟩ — archived: `openspec/changes/archive/2026-06-20-fix-selection-overlay-scale-rotate/`

> **Done** — merged (PR #141), archived
> `openspec/changes/archive/2026-06-20-fix-selection-overlay-scale-rotate/`. Sibling of the
> fixed [B-004](#) (rotation handle position) — same selection-overlay transform module.

**Repro:**

1. Select a shape (or text).
2. In the Inspector set a NON-UNIFORM scale (e.g. Scale X = 2, Scale Y = 1) — ideally
   with a non-top-left anchor, and/or a rotation already applied.
3. Then rotate the shape via the corner rotate gesture.

**Expected:** the selection border + handles stay glued to the shape under ANY scale
(uniform or not), and rotation pivots about the shape's anchor correctly regardless of
the prior scale.
**Actual:** under non-uniform scale the selection border/handles drift off the shape;
rotating afterwards pivots/spins about the wrong point. The overlay draws a rotated
RECTANGLE of the scaled size, while the renderer applies `scale(sx,sy) rotate(deg)` about
the anchor — i.e. a PARALLELOGRAM (scale applied AFTER rotation, in scene axes). The two
only agree when the scale is uniform _and_ the anchor is top-left.
**Env:** Browser / Designer dev; reproduces on `main`. The authoring shapes are rendered
by the real `@cg/template-runtime` (`scene-builder.ts` → `composeTransform`) in the
`cgpreview` iframe, so the gizmo must match that exact transform.
**Root cause:** the selection overlay composes the transform differently from the renderer
and the hit-test:

- `apps/designer/src/renderer/features/canvas/Gizmo.tsx` — the visual box bakes scale into
  width/height (`w = size.w * t.scale.x`) with the top-left pinned at `position`, then
  rotates a RECTANGLE about `anchor%` of the SCALED box. Scale-before-rotate ≠ the
  renderer's scale-after-rotate; a rotated rectangle can never trace the renderer's
  parallelogram when `scaleX ≠ scaleY`.
- `apps/designer/src/renderer/features/canvas/geometry.ts` — `localToScene` (the resize /
  rotate math, line ~84) **omits scale entirely**, so resize grab points and the rotate
  pivot (`pivotClientFromGrab`) are computed as if scale = 1. Compare the authoritative
  inverse in `hit-test.ts` (`inverseToLocal`), which DOES invert `Scale·Rotate` about the
  anchor.

**Fix:** align the overlay's transform composition (and the rotate pivot/origin) with the
renderer/hit-test `Scale·Rotate`-about-anchor map: make `geometry.ts`'s forward map and
resize/rotate math scale-aware, and render the gizmo frame + handles at the projected
parallelogram corners (screen-sized handles, not a scaled box). Keep B-004's rotate-handle
fix intact.
**Regression:** unit-test the pure forward map round-trips against `hit-test.inverseToLocal`
under non-uniform scale + rotation, and that `computeResize` keeps the fixed corner glued
under scale; a component/E2E test that scales then rotates and asserts the box tracks the
shape; re-confirm B-004 (rotate updates handle position) still passes. Capability:
`designer-shapes` (MODIFIED — the selection-gizmo requirement). **DONE** — merged on `main`
(PR #141, `bc0aa4f`), archived `openspec/changes/archive/2026-06-20-fix-selection-overlay-scale-rotate/`.

## [x] B-023 — repeater-mediated nesting cycle slips past the author-time guard ⟨priority: medium⟩ — fixed in D-086 Phase A, merged (#144, `7f21f86`); D-086 archived (#147)

> **Fixed (Phase A of D-086)** on `feat/D-086`, change
> `openspec/changes/per-composition-export-and-chrome/`. Surfaced by the D-086 export-scoping
> recon (`docs/recon/d-086-export-scoping.md`).

**Repro:**

1. Composition A contains a **repeater** whose child composition is B (A → B via a repeater
   edge).
2. Try to nest an instance of A inside B (or point B's repeater at A).

**Expected:** refused — A already reaches B, so nesting would close an infinite playout loop.
**Actual (pre-fix):** allowed. The author-time guard (`canNestComposition` →
`collectCompRefs`) only followed `composition` instance edges; a `repeater` also references a
child composition (`RepeaterElementSchema.compositionId`) but that edge was invisible to the
walker, so a repeater-mediated cycle passed the check and the runtime would recurse until its
depth cap.
**Root cause:** two ref-collectors had drifted — the field-aggregation collector
(`composition`-only, correct for fields) and the cycle-guard collector (also `composition`-only,
WRONG for reachability, since repeaters pull in a child composition's template + assets).
**Fix:** one shared, repeater-aware ref-collector in `@cg/shared-schema`
(`collectChildCompositionRefs` → `compositionClosure`), reused by the cycle guard. Field
aggregation deliberately keeps the `composition`-only collector (repeater rows don't form field
namespaces). **Regression:** `apps/designer/tests/composition-cycle-guard.test.ts` (repeater
cycle blocked, composition cycle still blocked, safe nesting allowed) +
`packages/shared-schema/tests/composition-fields.test.ts` (`compositionClosure` follows both
edge kinds). Capability: `designer-compositions` (MODIFIED — the cycle-guard requirement).

## [x] B-024 — Width / height / scale must reject negative values ⟨priority: medium⟩ — focused fix, merged (#175)

**What:** The width, height, and scale inputs must not accept negative values.
**Why:** Negative width/height/scale produce broken/invalid geometry.
**Acceptance:**

- WHEN the operator enters a negative value in width / height / scale THEN it is clamped to a non-negative value (or reverted) and no negative is committed

**Notes:** apps/designer/src/renderer/features/inspector/transform-fields.tsx (scale.x/scale.y) + the width/height size fields — add non-negative (min 0) clamping at commit.

## [x] B-025 — selection box (gizmo frame) doesn't render ⟨priority: high⟩ — merged (#146, `3e8327c`) (B-024 reserved in ROADMAP for the negative guard)

> **Fixed** — the gizmo frame is painted again; the teal accent is reverted to blue as a
> separate D-094 follow-up (see designer.md D-094).

**Repro:**

1. Select any shape on the canvas.

**Expected:** the selection frame (B-022's parallelogram outline) is visible around the shape,
on any background.
**Actual:** the corner handles render but the FRAME outline is invisible — the stroke is
absent/clipped, not teal-on-dark.
**Diagnosis (NOT a colour / D-094 token issue):** the frame's stroke reads `colors.accent`
(`Gizmo.tsx:198`, `strokeWidth={1}` at `:199`), which is a VALID token — at runtime the computed
stroke is `rgb(45,212,191)` (the teal). The frame is invisible because B-022 (`bc0aa4f`) draws
the polygon inside an SVG with `width={0} height={0}` (`Gizmo.tsx:190-191`) relying on
`overflow:'visible'` to paint outside its zero-size box; an ANCESTOR with `overflow:hidden`
clips that overflow paint, so the stroke never shows. The handles (separate absolutely-positioned
divs) are unaffected and render. **D-094 did NOT cause this** — D-094 (`5afc2f9`) changed only
`theme.ts` (accent value blue→teal + new `onAccent`) and `Button.css.ts`; it did not remove/rename
`accent` nor touch `Gizmo.tsx`. The invisibility predates and is independent of D-094.
**Root cause:** a zero-size SVG whose overflow paint is clipped by an ancestor `overflow:hidden`.
**Fix:** give the gizmo SVG a real size (`width/height: 100%`, covering the overlay) so the
polygon paints inside the viewport instead of as clipped overflow; `pointer-events:none` keeps the
handles on top and interactive. **Regression:**
`apps/designer/tests/e2e/selection-overlay-scale-rotate.spec.ts` — a new test asserts the frame's
owner SVG is non-zero-sized with a real, non-zero-width stroke; B-022's tracking + B-004 tests
still pass. Capability: `designer-shapes` (the selection-gizmo requirement — bug fix, no spec change).

## [x] B-026 — pasteboard extent clips shapes parked far off-frame ⟨priority: high⟩ — shipped (#157) + archived `openspec/changes/archive/…-pasteboard-extent-fits-content/`

> **Shipped + archived.** D-071 follow-up: the fixed 2× pasteboard extent now grows to contain
> off-frame content (grow-to-fit, Q1 = B). Merged on `main` (PR #157) and verified working (shapes
> park off-frame, stay visible/editable, export-excluded); the change `pasteboard-extent-fits-content`
> (capability `designer-canvas-viewport`, MODIFIED) is archived into `openspec/specs/`.
> **One deferred follow-up:** the whole-canvas jitter while dragging a shape FAR past the 2× boundary
> (a during-drag transient that settles correctly on drop) is filed as **B-027** [DEFERRED].

**Repro:**

1. Open the Designer, add a rectangle to the canvas.
2. Set its X position far off-frame — e.g. `x = 4000` (past the right pasteboard margin) or
   `x = -3000` (past the left margin) for a 1920×1080 frame.

**Expected:** the parked shape stays visible on the pasteboard and remains selectable/draggable so
the author can grab it back.
**Actual:** the shape leaves the iframe (which is sized to the FIXED 2× extent, scene
x∈[−960,2880]) and is **clipped — invisible and unselectable**. Parking a shape beyond ~50% of the
frame loses it.
**Env:** Browser + Designer (the authoring canvas only — export/broadcast unaffected).
**Diagnosis:** `geometry.pasteboardLayout(resolution)` (D-071 Phase B) is a pure function of the
resolution — `frame + PASTEBOARD_MARGIN_RATIO (0.5) × frame` per side — ignoring element positions.
The authoring iframe is sized to that extent and clips to its own element box, so content past the
margin is clipped away.
**Root cause:** a fixed, content-independent extent for a surface whose purpose is parking content
off-frame.
**Fix:** make the extent **grow-to-fit** (Q1 = B): a new `contentBounds(layers, currentFrame)` AABB
feeds `pasteboardLayout(resolution, content?)`, which grows the extent + frame offset only **past**
the 2× boundary (within it, byte-identical to today), shrinks back to the 2× floor (never below),
and clamps at `MAX_EXTENT_RATIO` (12×). The frame inset updates **live** via a `:root` CSS variable
on the existing `scene-replace` message (no reload), and an origin-shift `useLayoutEffect`
scroll-compensates so the visible content never jumps. `fitToViewport` still fits the FRAME;
export + broadcast (frame offset `{0,0}`) untouched. **Regression:**
`apps/designer/tests/content-bounds.test.ts` + `pasteboard.test.ts` (the B invariant, grow, shrink,
clamp, scroll-comp Δ) + `apps/designer/tests/e2e/pasteboard-extent.spec.ts` (far off all 4 sides
stays visible/selectable, within-2× no growth, left-growth no jump, shrink-to-2×, clamp).
Capability: `designer-canvas-viewport` (MODIFIED — the off-frame pasteboard requirement).

## [x] B-027 — dragging a shape far off-frame jitters the whole canvas during the drag ⟨priority: medium⟩ — merged (#234, `89db501`), archived `openspec/changes/archive/2026-07-07-fixed-pasteboard-extent/`. Switched the pasteboard from grow-to-fit to a FIXED extent (a pure function of resolution). The frame offset is now CONSTANT, so scene (0,0) never moves on a drag → no origin shift → no jitter, by construction. **Final design (extended):** (1) extent margin per side = the **larger of an absolute minimum or one full frame** — `marginX = max(5000, W)`, `marginY = max(3000, H)`; extent `W + 2·marginX` × `H + 2·marginY`, frame inset `(marginX, marginY)` (was the interim 1× multiplier, before that 7×5). The absolute floor (5000 X / 3000 Y) fixes a **small-resolution zoom-lock**: a 100×100 frame under a plain 1× multiplier was only a 300×300 pasteboard, so the cover-fit forced a ~428% min-zoom and froze zoom; with the floor it is a 10100×6100 pasteboard and zoom-out stays free. Once a frame exceeds a floor on an axis (e.g. 8000 > 5000) the margin grows with it (one frame per side → 24000-wide pasteboard); (2) **drag + nudge CLAMPED to the pasteboard**, eliminating the dead zone (a fixed extent clips the iframe + overlay, so a shape dragged beyond it was invisible AND unselectable). New pure `clampDeltaToPasteboard` + `pasteboardSceneBounds` (`geometry.ts`) bound the move so the element's full box — for a multi-selection, the whole group box (`collectGroupMoveTargets` now returns it) — stays inside; wired into `beginDrag`, `beginGroupDrag`, and `nudgeSelection`. Clamp **tightens only** (a pre-existing-outside/imported shape isn't yanked or pushed further out and can be dragged back in); a shape **larger than the pasteboard** on an axis is centered there. (3) **Edge marker** — surround `s.outer` darkened to `#0e1018` (distinct from the `#161927` pasteboard) + a subtle 1px `box-shadow` ring on `s.stage`, so the workable area reads as a defined rectangle (clamp makes this insurance, not load-bearing). (4) **Colour-doc fix** — corrected stale `#080a10` / `#a7a7a7` frame-backdrop refs to the actual `#3d4253` (+ `#5b6075` checker) in the README, `preview.ts` / `CanvasArea.css.ts` comments, and the spec. DELETED the grow-to-fit machinery: `content-bounds.ts` (`contentBounds`), `geometry.ts` `offsetShiftScroll` + `SceneAabb` + `PASTEBOARD_MARGIN_RATIO` + `MAX_EXTENT_RATIO`, and CanvasArea's `contentBox` memo + Seam 2 (the origin-shift scroll-comp `useLayoutEffect`). Seam 1 (the `--cg-frame-x/-y` inset) stays but is idempotent per-move. The minimum zoom is now the **dynamic cover-fit** (`coverZoom` = `MAX((viewportW+ε)/extentW, (viewportH+ε)/extentH)`, biased up by `COVER_OVERSHOOT_PX`): a full zoom-out always leaves the pasteboard COVERING the viewport on **all four edges** so NO empty surround ever shows (one axis may overflow + scroll). Two things had let the **trailing** (right/bottom) edges under-cover: the cover axis met the viewport EXACTLY (zero slack → a sub-pixel scroll exposed a hairline — fixed by the over-cover hair) and `s.outer` had a `0.5rem` padding that offset the stage off the **leading** edge (the cover-fit already overflows the viewport, so the padding never framed a smaller stage — REMOVED so the box the stage fills equals the box `coverZoom` targets). It recomputes on viewport (ResizeObserver) + resolution change and clamps the current zoom up if the floor rises; `ZOOM_HARD_MIN` (0.02) is just a safety net. Fit still frames the FRAME and lands above the floor (never clamped down). B-035 fit+center still works (simpler — constant offset). Capability `designer-canvas-viewport` (MODIFIED). Tests: `pasteboard.test.ts` (fixed `max(min, frame)` extent across all worked examples + the tiny-frame small-min-zoom + `clampDeltaToPasteboard` cases) + `pasteboard-extent.spec.ts` (no-grow, no-drift, **drag/nudge clamp at every edge**, a tiny 100×100 resolution does not freeze zoom, clamp holds at a small resolution); `content-bounds.test.ts` removed.

> **DEFERRED follow-up to [[B-026]] / #157.** Grow-to-fit shipped and works; this is its one
> remaining rough edge. A during-drag COSMETIC transient only — it settles correctly on pointer-up,
> nothing is lost or mispositioned. Recommended fix below is decided; not yet scheduled.

**Repro:**

1. Open the Designer, add a shape, and drag it with the pointer FAR past the 2× pasteboard boundary
   (for a 1920×1080 frame the boundary is scene x∈[−960,2880], y∈[−540,1620]) — i.e. far enough that
   the extent grows and, on the LEFT/TOP, the frame origin shifts.

**Expected:** only the dragged shape follows the cursor; the frame and every other element stay put
(the dark area STRETCHING as the extent grows is expected and fine).
**Actual:** DURING the drag the WHOLE canvas (frame + other content) jitters/drifts per pointer-move,
then SETTLES CORRECTLY on pointer-up. Within-2× drags (no origin shift) are unaffected.
**Env:** Browser + Designer (authoring canvas only — export/broadcast unaffected; the grow-to-fit
extent + scroll-comp math are correct, this is purely a paint-timing artifact).
**Root cause:** cross-document SUB-FRAME timing. The host-side origin-shift scroll-comp
(`useLayoutEffect` on `frameOffset` → `offsetShiftScroll`, `CanvasArea.tsx`) runs SYNCHRONOUSLY per
pointer-move, but the thing it compensates for — the iframe `.cg-stage` inset (`--cg-frame-x/-y`) — is
applied ASYNCHRONOUSLY (it rides the rAF-throttled `scene-replace` postMessage, and each move also
does a full runtime rebuild via `await applyScene`). So the host scroll and the iframe inset don't
land in the same paint: for the lagging frame the content drifts by the per-move delta, then snaps
back. The shape-drag cursor→scene map is NOT involved (it's a pure pointer-client delta,
`startPos + (client − start)/scale`, origin-independent — confirmed, no feedback loop).
**NOT auto-testable (important):** the drift is a SUB-FRAME transient that self-corrects after each
frame, so Playwright cannot sample it — a prior fix attempt (PR #158, now closed) passed a new E2E
drag suite while the bug remained. Do NOT trust a green gate as proof this is fixed; verify by hand
(drag a shape far off-frame and watch the frame/other content during the gesture).
**Recommended fix (decided):** switch the pasteboard to a GENEROUS FIXED extent — drift-free by
construction. No dynamic origin shift, so: remove Seam 2 (the origin-shift scroll-comp), remove Seam
1's per-move inset postMessage (bake the inset once at load), and drop the `contentBounds`-driven
layout. Accept clipping only at extreme parking distances; the fixed margin is tunable (e.g. ~2× the
frame each side — i.e. roughly today's 2× baseline made permanent). This trades the grow-to-fit reach
for guaranteed smoothness. **Alternative** (only if grow-to-fit is ever wanted back): properly solve
the cross-document sync — force the iframe to flush layout synchronously right after the host writes
the inset, AND stop doing a full per-move runtime rebuild (re-inset without `applyScene`) so the inset
and scroll land in one paint.
**Touch points:** `apps/designer/src/renderer/features/canvas/CanvasArea.tsx` (the `frameOffset`
`useLayoutEffect` + the `scene-replace` rAF effect), `geometry.ts` (`pasteboardLayout` /
`offsetShiftScroll` / `contentBounds`), `apps/designer/src/platform/preview.ts` (the `--cg-frame-x/-y`
CSS-var inset + the scene-replace `frameOffset`). Capability: `designer-canvas-viewport`.

## [x] B-028 — changing the scene size doesn't resize the canvas frame page; Fit breaks ⟨priority: high⟩ — focused fix

> Regression introduced by the pasteboard work ([[B-026]] / D-071 Phase B). The off-frame
> grow-to-fit invariant itself is fine — this is a frame-PAGE-vs-resolution sync bug on the
> scene-size-change path. Confirmed: dragging a shape does NOT change scene.resolution; the
> visible checkered page just stops matching the (new) scene size.

**Repro:**

1. Open the Designer (default 1920×1080).
2. In the composition inspector, change the size (e.g. W 1280, H 720).

**Expected:** the checkered FRAME page resizes to the new resolution and Fit re-fits/centers it; only
the dark surrounding pasteboard grows/shrinks with off-frame content (the frame page never grows from
dragging a shape).
**Actual:** the checkered frame page STAYS at the load-time resolution (1920×1080) — it no longer
matches the scene size, so it looks oversized ("the visible page grew"), and **Fit is broken after a
size change** (it fits the new resolution but the actual frame is the stale size). scene.resolution is
correct (the inspector W/H are right); only the rendered frame page is stale.
**Env:** Browser + Designer (authoring canvas; broadcast/export reload per scene so they were
unaffected).
**Root cause:** the authoring `.cg-stage` (frame page) `width`/`height` were baked as `!important`
LITERALS into the iframe srcDoc at LOAD time (`preview.ts` `#buildHtml`). A scene-size change does NOT
reload the iframe (the load effect is keyed on `sceneId` only) — it rides the no-reload
`scene-replace` postMessage, which rebuilds the runtime so the runtime sets a fresh INLINE
`.cg-stage` width from the new resolution — but the stale baked `!important` rule overrides that
inline. The frame OFFSET already avoided this by using live CSS vars (`--cg-frame-x/-y`); the
width/height did not.
**Fix:** make the frame SIZE live CSS vars too — `width: var(--cg-frame-w, <load>px) !important;
height: var(--cg-frame-h, <load>px) !important;` — and set `--cg-frame-w/-h` from `scene.resolution`
on load and on every `scene-replace` (mirrors `applyFrameOffset`). The baked value stays the
first-paint fallback.
**Acceptance:**

#### Scenario: Drag off-frame grows the pasteboard, not the frame page

- **WHEN** a shape is dragged far off the right/bottom of the frame
- **THEN** the dark pasteboard (iframe extent) grows to contain it, the checkered frame page stays
  `scene.resolution`-sized, scene.resolution is unchanged, and Fit still fits the original frame

#### Scenario: A scene-size change resizes the frame page and Fit re-centers it

- **WHEN** the composition width/height is changed in the inspector
- **THEN** the checkered frame page resizes to the new resolution and Fit fits + centers the
  resolution-sized frame (not the pasteboard extent)

**Touch points:** `apps/designer/src/platform/preview.ts` (authoring `.cg-stage` width/height →
`--cg-frame-w/-h` vars + `applyFrameSize` on load/scene-replace). Regression E2E:
`apps/designer/tests/e2e/scene-size-vs-pasteboard.spec.ts`. Capability: `designer-canvas-viewport`.

## [x] B-029 — trimming a clock/ticker/sequence's START on the timeline drops it from play/export ⟨priority: high⟩ — focused fix, merged (#187, 9737ab9)

> A content element trimmed at its START edge (lifespan.in > 0) disappears entirely from the preview
> playout + export — it never plays. scene.resolution / geometry are untouched; this is a lifespan-vs-
> playback bug.

**Repro:**

1. Add a clock (or ticker, or sequence) to a composition.
2. On the timeline, drag its START edge right by even one frame (giving it `lifespan.in > 0`).
3. Open the preview modal and Play (or export the single-file HTML and play it).

**Expected:** the element simply appears at its in-point and plays normally; its content-driven
behavior respects its lifespan (a content element that starts at frame N participates from frame N).
**Actual:** the element is hidden for the ENTIRE playout — it never appears, as if dropped. (On the
authoring canvas, scrubbing past the in-point still shows it, so it looks fine until you Play/export.)
**Env:** Browser + Designer (preview modal + exported single-file HTML).
**Root cause:** the per-element lifespan gate (`runtime.ts` `collectLifespanGates` →
`frame ∈ [in,out] ? naturalDisplay : 'none'`) was applied ONLY in `tick(frame)` — the designer
scrubber. The PlayoutController's per-frame `applyFrame` callback applied animation but NOT the
lifespan gate. So during PLAYBACK the gate was never re-evaluated: the preview modal's open-time
scrub to frame 0 (< in) hid the element, and Play never restored it (it stayed `display:none` the
whole playout). The element is never pruned from the scene/HTML — it's stuck hidden. (The export's
own off-frame prune is spatial-only and was never involved.)
**Fix:** evaluate the lifespan gate during playback too — the root scope's controller `applyFrame`
now calls the same `applyLifespanGatesAtFrame(frame)` helper as `tick`, so a start-trimmed element
appears at/after its in-point and plays, and lifespan is honored during play (not just scrubbing).
**Acceptance:**

#### Scenario: A start-trimmed content element plays instead of being dropped

- **WHEN** a clock / ticker / sequence is trimmed at its start (`lifespan.in > 0`) and the scene is
  played or exported
- **THEN** the element is present in the output and becomes visible at/after its in-point and plays
  normally (it is NOT hidden for the whole playout)

**Touch points:** `packages/template-runtime/src/runtime.ts` (`applyLifespanGatesAtFrame` shared by
`tick` + the root controller's `applyFrame`). Regression tests:
`packages/template-runtime/tests/runtime.test.ts` (B-029) +
`apps/designer/tests/e2e/trimmed-content-start.spec.ts`. Capability: `designer-playout-lifecycle`.

## [ ] B-030 — a nested TIMED-auto-out content-holder under a content-driven parent strands the parent on-air until stop() ⟨priority: low⟩ — D-104 follow-up

> A non-coordinator nested composition that contains finite content (ticker / countdown / sequence) but
> is itself set to `auto-out` with `holdSource: 'timed'`, nested under a content-driven parent, stops its
> own content drivers on its own outro BEFORE they complete — so the parent's aggregated content-wait
> (D-104) never resolves and the parent holds ON AIR indefinitely (a frozen graphic), exitable only by an
> external `stop()`. Surfaced by the D-104 adversarial review; see the archived design note
> `openspec/changes/archive/2026-06-27-nested-content-lifecycle/design.md` ("Risks / edges").

**Repro:**

1. Author a composition C with finite content (e.g. a duration countdown clock) and set C's playout to
   `auto-out` + `holdSource: 'timed'` with a short `holdMs` (shorter than the content's duration).
2. In a PARENT composition, set playout to a content-driven mode (`auto-out` / `loop-cycle` +
   `holdSource: 'content-driven'`) and nest C as a composition instance (parent has no other content).
3. Play the parent (preview modal or exported single-file HTML).

**Expected:** the parent reaches a terminal state — it holds until the nested content completes and then
plays out, and never becomes a permanently-stuck-on-air graphic.
**Actual:** C auto-outs on its `holdMs`; `onSettle` → `stopScopeContent()` halts C's countdown before it
reaches zero; the parent's content-driven hold awaits a promise that now never resolves, so the parent
stays on air indefinitely until an external `stop()`.
**Env:** Browser + Designer preview + exported single-file HTML (runtime `@cg/template-runtime`).
**Root cause / fix options:** the covered child's content lifecycle is owned by the D-104 coordinator
ancestor, but the child's OWN controller settle still halts the coordinated drivers. Either (a) when a
covered child's controller settles, resolve / drop the coordinator's wait on that child so the parent can
play out; or (b) warn at authoring when a content-bearing nested comp under a content-driven parent is set
to timed `auto-out`.
**Regression test:** a `@cg/template-runtime` test (the D-104 "STRAND" scenario) asserting the parent
reaches a terminal state (settles, or is cleanly stoppable) instead of hanging on air. Capability:
`designer-playout-lifecycle`.

## [x] B-031 — a content-driven nested composition does not drive its parent's hold, so the parent never closes on the nested content ⟨priority: high⟩ — D-104 follow-up (distinct from B-030); fixing on `fix/nested-content-drives-parent-hold` (`openspec/changes/nested-content-drives-parent-hold`)

> A composition instance whose own playout is content-driven (a "coordinator") is SKIPPED by its parent's
> aggregated content-wait (D-104's `contentTreeWait` / `startContentTree` skip nested coordinators, assuming
> they self-settle). So the parent never waits on the nested content. Compounding it, the preview's per-scope
> timing tree computes `hasContent` SHALLOWLY (own elements only, not recursing into nested instances — unlike
> the inspector's recursive `hasContentElement`), so the parent isn't even OFFERED the content-driven hold in
> the preview. Net: a graphic whose closing content lives inside a content-driven child never closes its
> background.

**Repro:**

1. Author a child composition C with a finite ticker (repeat: 1); set C's playout to content-driven (`auto-out` + `holdSource: 'content-driven'`).
2. In a PARENT P with a background animation + an out-point, nest C as a composition instance (P has no other content); mark C's ticker as hold-driving via the D-107/D-108 checklist.
3. In the preview timing, try to set P's hold to content-driven.
4. Play P (preview modal / exported single-file HTML); let the ticker finish its pass.

**Expected:** P can be set to content-driven; P holds until the nested content completes, then plays its outro — content first, background last. Per-element `drivesHold === false` opts a nested item OUT of driving the parent.
**Actual:** the preview offers P only a numeric (timed) hold, no content-driven option; and at runtime the content-driven child C is skipped, so P never waits on the ticker and the background never closes (P holds on air until `stop()`).
**Env:** Browser + Designer preview + exported single-file HTML (runtime `@cg/template-runtime`; preview UI `features/fields/PreviewScopeTiming.tsx`).
**Root cause / fix:** TWO coupled fixes for one behavior. (a) UI: make the preview's per-scope content check recurse into nested composition instances (match the inspector's recursive `hasContentElement`) so a parent whose content is entirely nested IS offered content-driven hold. (b) Runtime: stop unconditionally skipping a content-driven nested comp in `contentTreeWait`; instead include its content in the parent's wait, honoring each element's `drivesHold` (D-107) — default drives the parent, `drivesHold === false` opts out. The nested comp still runs its own outro (self-settles), giving the staggered content-first / background-last exit. Coordinate with B-030 (the inverse timed-auto-out strand) — both touch the coordinator's child handling. Verify no existing fixture/test relies on the old skip. HIGH-RISK playout engine → RECON FIRST.
**Fix:** runtime waits on a content-driven nested child's reset-safe `whenSettled()` (in `aggregateContentWait`) instead of skipping it; the preview's `hasAnyContentIn` recurses nested instances. Honors `drivesHold`; `startContentTree` unchanged (no double-start). The ticker-runtime "finite root self-settle past a nested infinite content-driven child" test is rewritten (that scenario now holds until `stop()`).
**Regression test:** `@cg/template-runtime` tests: (1) a parent with a content-driven nested child (finite content, `drivesHold` default) holds until the nested content completes then settles; (2) `drivesHold === false` on the nested item makes the parent NOT wait on it. Plus a designer/E2E test: the preview offers content-driven hold on a parent whose only content is nested. Capability: `designer-playout-lifecycle`.

## [x] B-032 — timed hold (`holdMs`) ignored for a content-less auto-out / loop-cycle composition ⟨priority: high⟩ — half 1: persist + bake holdMs (`openspec/changes/persist-timed-hold`, merged); half 2: resolve a content-less content-driven hold → timed at the boundary on `fix/content-less-timed-hold-resolution` (`openspec/changes/resolve-content-less-hold-source`, local/UNPUSHED)

> A content-less `auto-out` / `loop-cycle` composition with a timed `holdMs` closes ~immediately on
> EXPORT / on-air (any value behaving like 0). Root cause (RECON): `holdMs` was preview-session-only —
> the runtime honors it, but it was never persisted to the stored playout, so the single-file export
> baked no `holdMs`. Fix (decided): author + store `holdMs`.

**Repro:** a NEW content-less composition with an entrance + an out-point; set `auto-out` (or
`loop-cycle`) and `holdMs`; export the single-file HTML (or play on-air without a rundown).
**Root cause (preview vs export):** the runtime/controller honor `holdMs` (stored OR a preview-session
`playoutOverride`, incl. loop-cycle's between-cycle hold and the no-out-point / empty-outro case) — so
the PREVIEW holds. But the export bakes only the STORED playout (`buildPlayoutMetadata` → `playoutOf`
plus the inlined scene), and the inspector never persisted `holdMs` (D-020 made it preview-only) ⇒
exported `holdMs` undefined ⇒ `scheduleHold(0)` ⇒ collapse.
**Fix (Option 1 — persist + bake):** the inspector's Playout section now authors the STORED
`playout.holdMs` (the SAME optional field — no schema change) for a TIMED hold under `auto-out` /
`loop-cycle`; the preview session override still layers on top (`effectivePlayoutFor`:
`override.holdMs ?? stored.holdMs`). The exporter already bakes a present `holdMs` (both modes) and the
inlined scene carries it, so a standalone export now holds for the authored duration. `repeat` stays a
preview/rundown session override.
**Regression test:** `@cg/vcg-format` `buildPlayoutMetadata` bakes a stored `holdMs` (auto-out +
loop-cycle); a designer E2E for the inspector `holdMs` control (appears for timed auto-out / loop-cycle,
persists across a mode round-trip, hidden for manual); the `content-less-timed-hold` runtime + preview
guards. Capability: `designer-playout-lifecycle`.

## [x] B-033 — preview replay does not re-arm the content-driven hold (closes instantly on 2nd play) ⟨priority: high⟩ — `openspec/changes/archive/2026-06-28-replay-rearms-content-hold`

> In the preview, a content-driven hold waits correctly on the FIRST play, but pressing Play again (without reopening) makes it close instantly — it no longer waits for content. Closing and reopening the preview fixes it.

**Repro:** 1) Open a scene whose content-driven hold waits on a finite content element (own or nested). 2) Preview → Play; confirm it holds until the content completes. 3) Without reopening, press Play again.
**Expected:** every replay re-arms the hold and waits for content exactly like the first play.
**Actual:** the 2nd+ play ignores content and closes immediately; only reopening the preview restores correct behavior.
**Env:** Designer preview (runtime `@cg/template-runtime` reset/replay path + the preview Play control).
**Root cause / fix:** replay isn't fully resetting the content-completion state, so the coordinator's wait sees stale "already complete" drivers (the child's `whenComplete`/`whenSettled` is re-minted on `reset()` per B-031 — confirm replay actually triggers that reset for every driver and re-arms the coordinator's captured wait). On replay, fully reset content drivers + re-arm the content-driven hold. RECON FIRST.
**Regression test:** a runtime test that resets+replays a content-driven scene and asserts the hold re-arms (waits again) on the 2nd play; a preview/E2E play-twice guard. Capability: `designer-playout-lifecycle`.

## [x] B-034 — a hidden ticker/sequence still affects playout (drives the hold, renders, shows in preview timing) ⟨priority: high⟩ — `openspec/changes/archive/2026-06-28-hidden-content-inert`

> Hiding a content layer (ticker/sequence, possibly loop-infinite) should make it fully inert, but it still drives the content-driven hold, still renders, and still appears in the preview timing controls.

**Repro:** 1) A composition with a ticker/sequence (e.g. `repeat: infinite`). 2) Hide that layer (`visible: false`). 3) Play / preview.
**Expected:** a hidden content element is fully inert — it does NOT drive the hold, does NOT render, and does NOT appear (settings or effects) in the preview timing controls.
**Actual:** it still drives the hold (an infinite one freezes the graphic), still renders/affects output, and still shows in preview timing.
**Env:** runtime `@cg/template-runtime` (hold-driver aggregation + scene render) + Designer preview timing UI (`PlayoutSection.tsx` driver walk, `PreviewScopeTiming.tsx`).
**Root cause / fix:** visibility isn't consulted anywhere in the hold-driver determination (confirmed). Rule: `visible === false` ⟹ excluded from hold drivers (regardless of `drivesHold`/`holdOverrides`), not rendered, not listed in preview timing. Apply in the driver predicate (runtime + the D-107/D-112 walks) and the render/timing paths.
**Regression test:** a hidden infinite driver does NOT force an infinite hold (parent/comp still settles); a hidden element is absent from the preview timing list and from render. Capability: `designer-playout-lifecycle`.

## [x] B-035 — composition not fit-to-canvas on project / template open ⟨priority: medium⟩ — merged (#229, `da94a6b`). ROOT CAUSE (two compounding bugs; supersedes the first attempt): the sharper repro showed the ZOOM is correct but the CENTERING fails (frame in a corner, Fit fixes it at the same zoom), worst on the warm SWITCH path. (A) the fit gate was marked fitted on ZOOM success — `fitToViewport` set the zoom then `requestAnimationFrame(centerFrameInView)` and returned `true` before centering ran, so the gate consumed the one fit even when the deferred center later landed wrong → never retried (the first attempt's fit-once gate made the old self-correcting re-fire impossible). (B) centering ran in a single fixed rAF reading transitional `getBoundingClientRect()` + stale `scrollLeft`, raced against the switch's async iframe reload (`Preview.load().then(setHtml)`) + un-reset prior scroll → corner. PLUS a third gap (sub-question d): `editSceneOf` spreads the root scene so `scene.id` is the PROJECT id, stable across composition switches — a same-resolution comp switch never re-fit. FIX: (1) key fit on `activeCompositionId` (new `CanvasArea` prop), not `sceneId`; (2) compute centering ARITHMETICALLY from numbers — `frameCenterScroll` in `fit-on-open.ts` = `stageContentPad + (frameOffset + resolution/2)·zoom − viewport/2` — inside a layout-effect keyed on a `centerNonce` (bumped per fit request), so it runs AFTER the zoom commit + layout (settled, no rAF race) and reads no live scroll; (3) mark the gate fitted (`markFitted`) only INSIDE that centering effect, after the scroll applies, so a fit isn't consumed until centering happened (and a not-yet-measured viewport is still retried by the cold effect). Manual Fit shares the path (re-centers even at the same zoom). Unit test `fit-on-open.test.ts` (fit-once gate + the centering math — the assertion the first attempt missed) + E2E `fit-on-open.spec.ts` (new project, bundled template, AND a same-resolution composition switch are all fit + CENTERED — scroll off the corner — without a manual Fit).

**Repro:**

1. Save a project (or open a bundled template) with a composition open.
2. Reopen the project / load the template.

**Expected:** the opened composition is automatically fit and centered in the canvas viewport (identical to pressing **Fit**).
**Actual:** sometimes the composition is NOT fit — the user has to press **Fit** manually.
**Env:** Browser + Designer authoring canvas.
**Notes:** Capability `designer-canvas-viewport`. The fit-on-open path exists (the pasteboard specs reference "on project open, fit from frame bounds and center"), but it intermittently doesn't apply on template / project load — likely a timing / ordering race between scene load and the fit effect (the fit may run before the composition / resolution is ready, or before the iframe has laid out). Touch points to check: the `CanvasArea.tsx` fit effect, and the project-open / template-load path.
**Regression test:** open a saved project (and load a bundled template) with a composition that is larger / smaller than the viewport, and assert the canvas zoom + scroll match the Fit result (frame fully visible and centered) WITHOUT a manual Fit — deterministically, after scene + iframe layout settle (wait on a ready signal, not a timer).

## [x] B-036 — inspector input icons (rotate / opacity / W·H) misaligned with the value ⟨priority: low⟩ — merged (#226, `8e9bc39`): added `display:flex` + `align-items/justify-content:center` to the shared `icon` span style (`TransformSection.css.ts`), which the W/H/rotate/opacity rows (`transform-fields.tsx`) use across single- + multi-select — one shared style, so it covers every icon-input row. CSS-only (owner-verified locally).

**Repro:**

1. Open the Transform / Style inspector for any element.
2. Look at the leading icons (rotate, opacity, the W / H arrows) next to their numeric inputs.

**Expected:** each leading icon is vertically centered against its input's value text.
**Actual:** the icons sit misaligned (not vertically centered) against the value.
**Env:** Browser + Designer inspector.
**Notes:** The user verified a local fix: setting `display: flex` on the inspector icon span (`.TransformSection_icon__*`) resolves it — the icon wrapper likely lacks `display: flex` / `align-items: center`. Fix the icon-wrapper CSS (vanilla-extract) so the icon is flex-centered against the input, and check every section reusing the same icon-input row pattern (TransformSection, opacity, etc.) so all rows are consistent.
**Regression test:** a component / DOM test (or visual check) asserting the icon span uses the centered flex layout in the icon-input row, across the Transform and the other sections that reuse the pattern.

## [x] B-037 — pen tool is hard to use and only edits the first shape ⟨priority: medium⟩ — merged (#267, `ade2f9f`), archived (`openspec/changes/archive/2026-07-10-fix-pen-multi-shape`): explicit draft lifecycle (any pen exit — tool switch, composition switch, unmount — finishes a ≥2-anchor draft open / cancels a smaller one), pen stays armed after a finish (N draws → N independent elements), Esc cancels the draft, the mid-draw gizmo hijack fixed (gizmo gated off while the pen is armed), rubber-band + first-anchor close affordance, stale-draft guard (Delete/undo mid-draw), collision-safe ids. Owner-verified drawing feel 2026-07-10. Unblocks D-119

**Repro:**

1. Select the pen tool.
2. Draw a shape, then try to draw a SECOND shape on the canvas.

**Expected:** each pen draw creates a new, independent shape.
**Actual:** subsequent draws only modify the FIRST shape; you cannot create multiple pen shapes.
**Env:** Browser + Designer canvas.
**Notes:** Owner decision 2026-07-07: **KEEP + fix (direction a)** — fix the multi-shape bug and keep the pen (this also keeps the queued D-110 path-morphing meaningful). Priority raised low → medium: it now gates D-119 (rebuild starter templates) per the ROADMAP Designer order. Touch points: the pen / path tool in `CanvasOverlay` and the path-tool state (`pen-draw.ts` keeps a module-level draft that only `finishPen` clears — a tool switch mid-draw leaks it into the next pen session, which then appends to the first path; `finishPen` also forces the tool back to `cursor` after every shape, and there is no draw-state feedback, so an unfinished path silently swallows the "second" shape's clicks).
**Regression test:** (only if direction (a) is chosen) draw two pen shapes in sequence and assert two independent path elements exist, the second NOT mutating the first; if direction (b), the test/coverage follows the simplified behavior.

## [x] B-042 — at high zoom, rendered shape edges don't sit on the pixel-grid lines (sub-pixel misalignment in a repeating pattern) ⟨priority: medium⟩ — merged (#251, `b8ca72e`), archived (`openspec/changes/archive/2026-07-07-fix-pixel-grid-content-alignment`): device-raster-aligned grid layer + containing-pixel stroke snap, ruler-mark lockstep, gizmo layout-lattice fidelity (`quantizeBoxToLayout` + 1-device-px frame stroke); the residual stale-paint phenomenon split to B-045 (mitigated in the same PR). Owner-verified on the affected machine (arrow steps track live and land on the lines)

**Repro:**

1. New project → in `comp1` draw a Rectangle; set X=0, Y=0, W=320, H=120.
2. Zoom to max (6400%); scroll so the shape's right edge (scene x=320) is in view (ruler ≈318–326).
3. Compare the rendered edge against the pixel-grid line at scene x=320 (and the top edge against y-lines; repeat at other integer columns).

**Expected:** with 1 grid cell = 1 scene pixel, an edge at an integer scene coordinate lies ON the corresponding grid line (within the grid's own ≤½-device-px tolerance) — at every position and every zoom ≥ the grid threshold.
**Actual:** the edge is slightly off the line — a bit before or after — and the offset varies along the canvas in a repeating pattern (position-dependent). The grid agrees with the rulers but not with the rendered scene.
**Env:** Chrome, Designer dev + built dist, main @ 2812533; owner's new laptop (record `devicePixelRatio`). Screenshots: `docs/designer-guide/sample-assets/B-042-pic-*.jpg` (reference only if the owner has added them).
**Notes:** Suspected D-120 follow-up: the grid overlay snaps each line to the device-pixel raster (`Math.round(pos·dpr)+0.5`, same mapping as the rulers) while the stage content (scaled preview iframe) is composited un-snapped — reconcile them without breaking D-120's guarantees (crisp 1-device-px lines at ANY zoom; grid↔ruler ≤½ device px; 1-px nudge visibly moves one cell) or the B-027/B-035 viewport invariants (fixed pasteboard extent, dynamic cover-fit min zoom, fit+center math). Capability: `designer-canvas-viewport` (MODIFIED). HIGH-visibility precision defect in the D-120 headline feature (it gates D-119 starter-template work per the ROADMAP). RECON FIRST.
**Root cause (confirmed by measurement — see the change's `design.md`):** the content composites un-snapped at its IDEAL position (measured ≈0 layer displacement at dpr 1/1.25/1.5) — it's the GRID's painted strokes that land off their own math: (1) the grid canvas bitmap was stretched by `round(w·dpr)/(w·dpr)` (backing device-rounded, CSS box not — 1.00031 at dpr 1.25), so the misalignment GREW across the viewport past ½ device px; (2) the canvas element sits at a fractional device position (the studio layout's viewport is at CSS x=298.390625 — fractional at EVERY dpr), so the compositor snapped/resampled the whole layer (−0.39 device px at dpr 1, −0.5 at dpr 1.25, measured). Fix: device-raster-align the grid canvas layer (floor-align via a sub-CSS-px `left/top` nudge + CSS size = backing/dpr → raster scale exactly 1) and snap each line on the SCREEN raster (`gridCanvasAlignment` phase folded into `pixelGridLines`); stage/scroll untouched. Residual = the unavoidable per-line snap ≤½ device px, CONSTANT at integer `zoom·dpr` (6400% at dpr 1/1.25/1.5/2).
**Split (2026-07-08):** the offset still owner-visible AFTER the fix set (owner's lossless-intent `grid.jpg`, 2026-07-07) measured as the PAINTED edge sitting 22.5 device px (exactly 18/64 scene px — the previous position) left of layout, while grid strokes AND gizmo matched layout EXACTLY — a DISTINCT defect (stale raster after small position edits, not an alignment error), filed as **B-045** and mitigated in the same change dir. B-042's alignment fix set stands as measured. The original "repeating pattern" arrow-key reports are B-045's signature too (each 1-scene-px step is 1 CSS px inside the preview iframe — below the invalidation-loss threshold).

## [~] B-045 — small position edits update layout but not paint: the painted element stays frozen at its previous position (stale raster at high zoom) ⟨priority: high⟩ — MITIGATED (authoring position pin, merged with #251 `b8ca72e`; owner-verified: paint follows every edit live). Stays open for: (1) ROOT fix — engine positions via `transform: translate()`, rides D-096 (`designer.md`, rider attached; removes the pin); (2) UPSTREAM — PENDING: tracker unreachable from the owner's network (Google 403 region/IP restriction); report package preserved at `docs/upstream/b045-chromium-repro/` (minimal repro + report text), ready to submit verbatim whenever access is available; record the issue number here once filed

**Repro (deterministic, both compositors — emulated dpr 1.25 headless AND the owner's real native 1.25):**

1. New project → Rectangle; X=6.4125, Y=0, W=320, H=120; zoom 6400%; scroll the right edge into view; deselect; let it settle.
2. Select, set X=6.69 in the inspector (Δ = +0.2775 CSS px inside the preview iframe), deselect. NO scroll/zoom afterwards.
3. Compare the painted right edge against the gizmo/grid stroke (or measure a `scale:'device'` screenshot).

**Expected:** the painted edge moves to the new position (rendered scene 326.6875 — +22.5 device px at 6400%·dpr 1.25) within a frame or two.
**Actual:** the painted edge STAYS at the previous position (scene 326.40625) — measured Δ = −23.0 device px vs layout, persisting through +3 s idle AND a scroll jog. The owner's screenshot (`grid.jpg`, 2026-07-07) carries the exact same signature (−22.5). DOM truth is correct the whole time: ONE element node, `style.left` / computed style / `getBoundingClientRect` all at the NEW value — layout, grid strokes, gizmo and rulers all agree with each other; ONLY the raster is stale. Any large edit, reload, or fill change self-corrects, which made the defect look intermittent and move-history-dependent (B-042's original "repeating pattern" arrow-key reports are this bug: each 1-scene-px step is 1 CSS px inside the iframe).
**Env:** Chrome (headless emulated dpr 1.25 and headed native 1.25), Designer dev + built dist, `fix/B-042-pixel-grid-content-alignment` @ 8ed5a52 + B-042 fix set. Evidence chain: owner `grid.jpg` pixel measurement + live repro scripts (session scratchpad `b042-stale-paint.cjs`, `b042-dom-truth.cjs`) — numbers in the change's `design.md` (Take 6).
**Notes / mechanism:** the canvas preview iframe sits inside the stage scaled ×64 at 6400% (raster ≈ zoom·dpr = 80 device px per scene px). A position change of ≤ ~1 CSS px in the iframe's own coordinate space fails Chromium's paint invalidation for the composited stage layer — even though the scene-replace path REBUILDS the runtime DOM (`runtime.remove()` + `createRuntime`), i.e. node replacement does not invalidate the stale tiles either. Fix plan, three prongs: (1) **NOW (this entry)** — authoring-scoped forced invalidation in `apps/designer/src/platform/preview.ts` after `applyScene`, scoped to the changed elements' old∪new regions (not the whole stage); gated to the canvas document (`REVEAL_ON_LOAD`) so exported `.vcg` / playout output is byte-identical (baseline cg.js untouched). (2) **ROOT** — position via `transform: translate()` (compositor-tracked, never misses invalidation), queued as a rider on D-096 (`designer.md`); the mitigation is removed there. (3) **UPSTREAM** — Chromium bug with a standalone minimal repro (package preserved in-repo at `docs/upstream/b045-chromium-repro/`; the owner submits). Capability: `designer-canvas-viewport` (ADDED requirement, same change dir as B-042). NOTE: the implemented mitigation ended up STRONGER than prong (1)'s forced-invalidation sketch — every poke was measured dead; the merged fix is the authoring position pin (box at 0 + lattice-quantized translate), see the archived change's `design.md` Take 6.

## [x] B-051 — Path Style controls do nothing on pen paths (fill / stroke / width / dash silently no-op) ⟨priority: high⟩ — merged (#270, `c62c0be`), archived (`openspec/changes/archive/2026-07-13-fix-pen-path-style-commits`): `boxKind` in `writeStaticAnimatable` gains `path` and `fill.color` accepts `shape | path`, so the four dead writes (stroke width / colour / dash, solid fill) commit and render. D-056 strictness for the content-driven kinds (ticker/clock/sequence refuse stroke writes) is preserved and regression-tested. OWNER-VERIFIED in the Designer. New living-spec requirement: "Path Style edits apply" (`designer-path-element`)

**Repro:**

1. Draw a pen path (any anchors, close or finish open) — it stays selected.
2. In the Inspector's Path Style section, edit the stroke width (or the stroke colour, the dash array, or pick a new solid fill colour).

**Expected:** the value commits, the model changes, and the canvas preview re-renders with the new style (as it does for a rectangle/ellipse).
**Actual:** nothing changes — not even the model value; the field snaps back on the next re-render. Only `path` elements are affected (shapes are fine); transform and filter on the same path work.
**Env:** Browser + Designer inspector, main @ `6d1e3b0`.
**Notes:** RECON (red unit test against the live store, mechanism confirmed): the Inspector routes these edits through `commitAnimatable` → (no keyframe track) → `writeStaticAnimatable` (`state/slices/timeline.ts`), whose per-kind guards predate the D-109 `path` element: `boxKind = shape || text` gated `stroke.width` / `stroke.dash` / `stroke.color`, and `fill.color` was `shape`-only — all four writes silently no-op on a path ("pen left out of a code path"). The originally suspected cause — pen paths created without `fill`/`stroke` — is REFUTED: `pathFromScenePoints` seeds both (`element-defaults.ts`); and gradient/mode fill changes DID work (they bypass the guard via `applyFillModeChange` → raw `updateElement`), which is why only the common solid-colour/width/dash edits looked dead. Fix: `boxKind` gains `path`; `fill.color` accepts `shape | path`. The D-056 strictness for the content-driven kinds (ticker/clock/sequence refuse stroke writes) is preserved and regression-tested. Keyframed `stroke.*`/`fill.color` on paths were already fine (the registry marks them; `upsertKeyframe` is kind-agnostic); the runtime already renders path `stroke-dasharray`/fill/stroke, so the writes render and export with no runtime change.
**Regression test:** unit `apps/designer/tests/path-style-commit.test.ts` (red pre-fix: all four commits frozen at creation defaults; green post-fix; ticker refusal kept); E2E `apps/designer/tests/e2e/pen-path-style.spec.ts` — draw a pen path, set width 8 / dash 6 / stroke `#FF0000` / fill `#00AA00` via the real Inspector controls, assert the preview SVG attributes AND the single-file HTML export carry all four.

## [x] B-052 — pen/path layer shows the rectangle icon in the timeline layer list ⟨priority: low⟩ — merged (#270, `c62c0be`), archived (`openspec/changes/archive/2026-07-13-fix-pen-path-style-commits` — same change dir as [[B-051]]): `ElementRow.tsx`'s `layerTypeIcon` gains a top-level `case 'path'` → `PenTool` via the shared `Icon` (it previously fell through to the `default: Square`). Pinned by `layer-type-icon.test.ts`. OWNER-VERIFIED in the Designer

**Repro:**

1. Draw a pen path.
2. Look at its row icon in the timeline layer list.

**Expected:** the pen-tool icon (the same lucide `PenTool` the canvas toolbar uses).
**Actual:** the rectangle (Square) icon.
**Env:** Browser + Designer timeline.
**Notes:** RECON confirmed in `ElementRow.tsx` `layerTypeIcon`: the switch has no top-level `case 'path'` for the D-109 path ELEMENT type, so it falls to the `default: Square`. (The `case 'path'` that does exist sits inside the SHAPE sub-switch — the legacy `shape: 'path'` variant → `Spline`, a different thing.) Fix: top-level `case 'path'` → `PenTool` via the shared `Icon` (no new SVG). Audited the mapping while there: every other element type (text/image±shared/ticker/clock/sequence/repeater/lottie/video-placeholder/container/composition/shape variants) is correctly iconed — only `path` was missing.
**Regression test:** unit `apps/designer/tests/layer-type-icon.test.ts` — a `path` element maps to `PenTool` (and not `Square`); the other kinds keep their established icons (the helper is exported for the test).

## [x] B-057 — pen smooth-drag "sticks": points meant as corners come out curved ⟨priority: medium⟩ — merged (#272, `523d5d5`), archived (`openspec/changes/archive/2026-07-10-fix-pen-curve-and-hit-test`): corner-vs-smooth decided at pointer-UP against a SCREEN-px guard (`PEN_SMOOTH_PX`, zoom-independent; the old 3-scene-px incremental guard curled every human click), jitter-set handles cleared at release, previous smooth anchor's handles untouched (Illustrator semantics). Owner-verified 2026-07-10. RENUMBERED from B-053 (2026-07-10, owner rule for cross-track collisions): the runtime track filed its B-053 (`bugs-runtime.md`, false-ON-AIR badge) first in #271, concurrently with this filing in #272 — the runtime keeps the number. Historic references in #272's commit/PR text say B-053; in-repo docs and code refer to B-057

**Repro:**

1. Pen tool: place a point, then press-drag on the second point (segment curves — correct).
2. Place a third point with a plain click.

**Expected:** the third point is a CORNER (its side of the segments is straight; the previous smooth anchor keeps its handle — Illustrator semantics, owner decision 2026-07-08).
**Actual:** the third point comes out smooth too — with a real mouse, virtually every click curls.
**Env:** Browser + Designer canvas, main @ `c62c0be`.
**Notes:** RECON (red unit tests): two compounding defects in `pen-draw.ts` drag-to-smooth. (1) The jitter guard was 3 SCENE px — at fit zoom (~0.3) a 1-screen-px click slip is already ~3.2 scene px, so ordinary clicks fired the smooth branch (proved: a 2-screen-px slip at scale 0.5 → smooth). (2) The decision was incremental and never revisited: once `onMove` crossed the guard the anchor stayed smooth (proved: drag out 20 px, return to 1 px, release → smooth with the excursion's handles). Fix: corner-vs-smooth decided AT POINTER-UP from the total displacement against a SCREEN-px guard (`PEN_SMOOTH_PX = 3`, zoom-independent — the D-122 hysteresis lesson); the mid-hold preview stays live (corner restored when the pointer dips back under the guard); jitter-set handles actively cleared at release; only the just-placed anchor is touched (captured by reference, re-validated against the live draft) so a previous smooth anchor's handles survive — its segment side keeps the curve, per the owner's rule (`pathD` curves on either side's handle).
**Regression test:** unit `apps/designer/tests/pen-smooth-placement.test.ts` (red pre-fix); E2E `pen-curve-edit.spec.ts` — corner/smooth/corner/corner drawn with 2-px click slips → the final segment is a straight `L` and the d-string has exactly two `C`s.

## [x] B-056 — can't add a SMOOTH point to a finished path (segment insert is corner-only) ⟨priority: medium⟩ — merged (#272, `523d5d5`), archived (`openspec/changes/archive/2026-07-10-fix-pen-curve-and-hit-test`): click-DRAG on a selected path's segment inserts a SMOOTH anchor with mirrored drag-defined handles (live preview, one undo entry, at-release corner/smooth decision); plain click still inserts a corner. Owner-verified 2026-07-10. RENUMBERED from B-054 (2026-07-10, owner call): #273 concurrently filed the runtime `#loaded`-staleness bug as B-054 (`bugs-runtime.md`) — the runtime bug keeps B-054; this designer bug moved to the next free number. Historic references in #272's commit/PR text say B-054; in-repo docs and code refer to B-056

**Repro:**

1. Finish a pen path; with the Select tool, click one of its segments (an anchor is inserted — good).
2. Try to make that inserted point curved.

**Expected:** an inserted point can be smooth — press-DRAG on the segment pulls out mirrored handles (the pen's drag-to-smooth gesture on insertion); a plain click still inserts a corner.
**Actual:** only corners can be inserted; there is no gesture that yields a smooth point.
**Env:** Browser + Designer canvas (PathEditor).
**Notes:** RECON: `PathEditor.insertOnSegment` created a corner mid-point only. The "insert a corner then pull its handles" fallback was checked and REFUTED: handle dots render only for an anchor's EXISTING `in`/`out` (a fresh corner has neither — nothing to grab), and `dragHandle` computes `smooth = breakPair ? false : p.smooth` — it never converts a corner TO smooth. Fix (approach stated in `design.md`): drag-on-insert — pointer-down inserts the corner as today, window move/up listeners run the pen's gesture (mirrored handles follow the drag live, in point-space units via the same `/scale/sx|sy` mapping `dragHandle` uses), corner-vs-smooth decided at release by the B-057 screen-px guard, ONE history boundary at pointer-up (the whole insertion = one undo entry), still routed through `applyPoints` → `normalizePathPoints` → `updateElement`.
**Regression test:** unit `path-tools.test.ts` (an inserted smooth anchor round-trips `normalizePathPoints`; a corner insert carries no handles); E2E `pen-curve-edit.spec.ts` — a plain segment click inserts a corner (no `C` in the d-string), a segment click-drag inserts a smooth anchor (the path gains a `C`).

## [x] B-055 — clicking a curved shape only selects near its center (hit-test ignores bézier curvature) ⟨priority: high⟩ — merged (#272, `523d5d5`), archived (`openspec/changes/archive/2026-07-10-fix-pen-curve-and-hit-test`): `hitsPath` flattens the exact rendered cubics (16 sub-segments) into the ray-cast + grab-margin — bulges hit, concavities miss; display mapping mirrors the runtime viewBox's `max(bbox, 1)` clamp (degenerate-axis fix). Owner-verified 2026-07-10

**Repro:**

1. Draw a curved pen shape (e.g. two anchors, second placed with a big smooth drag, closed).
2. With the Select tool, click on the shape away from its center (under a curved bulge).

**Expected:** the shape selects from anywhere on its rendered area.
**Actual:** only clicks near the center (near the straight chord between anchors) select; the curved regions miss.
**Env:** Browser + Designer canvas.
**Notes:** RECON (red unit tests): `hit-test.ts` `hitsPath` ray-cast the ANCHORS-ONLY polygon and measured stroke distance to the straight chords — curvature was invisible: a bulge outside the anchor polygon missed, a concavity inside it FALSE-hit, and a two-anchor closed arc (zero-area anchor "polygon") was selectable only within the ~7-px grab margin of its chord — exactly the "only near center" symptom. Bonus defect found by the open-arc red test: the display mapping collapsed a degenerate anchors-bbox axis to factor 0, flattening a horizontal arc's curve extent. Fix: flatten each segment from the exact cubic the runtime renders (`c1 = a + a.out`, `c2 = b + b.in`, straight only when both absent — mirrors `pathD`) into 16 line sub-segments and run the SAME ray-cast + grab-margin over the flattened outline; the display mapping now mirrors the runtime viewBox's `max(bbox, 1)` clamp. Module stays pure (no `Path2D`/canvas — jsdom-testable); chord deviation shrinks ~1/N², so 16 steps stay within ~2 px of the true curve even for frame-spanning segments (well inside the grab margin) at negligible cost. The resized-path bbox mapping and open-path stroke-margin behavior are preserved.
**Regression test:** unit `apps/designer/tests/path-hit-curved.test.ts` (red pre-fix: bulge hits, concavity misses, interior hits, open arc grabs at the real curve, straight-path guard); E2E `pen-curve-edit.spec.ts` — a two-anchor closed curved lens selects from a click 15 px off its chord.

## [x] B-058 — the anchor "Delete point" menu is styled unlike the app's other context menus ⟨priority: low⟩ — merged (#280, `b841ebe`), archived (`openspec/changes/archive/2026-07-10-fix-pen-edit-mode-and-bbox`): shared `ui/ContextMenu.css.ts` chrome extracted (LayerContextMenu values canonical); the anchor/segment menu consumes it and `LayerContextMenu.css.ts` re-exports it. Owner-verified

**Repro:**

1. In a path's point-edit mode, right-click an anchor.

**Expected:** the menu looks like every other right-click menu (the timeline layer menu's chrome).
**Actual (owner, on the D-123 preview):** one-off chrome — rounder corners (6px vs 0.3rem), larger text (0.8 vs 0.74rem), and a GRAY hover instead of the app's cyan tint (the bare `Control`'s hover selector out-specified the menu item's).
**Env:** Browser + Designer canvas, main @ `c47e3bf`.
**Notes:** RECON found SIX hand-rolled context menus with drifted chrome (radius 0.3 vs 0.25rem, shadow 8/24 vs 6/18, three item paddings, two danger reds, one hard-coded background, z-index 40→3000) and NO shared primitive — the owner's "the shared component it builds on" didn't exist. Fix: the timeline `LayerContextMenu` values extracted as canonical into a NEW shared `renderer/ui/ContextMenu.css.ts` (backdrop/menu/item/itemDisabled/shortcut/divider, + the button resets and an equal-specificity hover override so the cyan tint wins on `Control bare` items); `AnchorContextMenu` consumes it (own css deleted, keyboard/aria layer kept — focus-first, arrow wrap, capture-owned Esc); `LayerContextMenu.css` re-exports the shared pieces (timeline markup untouched). The four other drifted menus converge in a follow-up (noted in the change's `design.md`).
**Regression test:** E2E `anchor-context-menu.spec.ts` (menu still opens/deletes/dismisses); the chrome share is structural (one stylesheet), asserted by the shared-class import.

## [x] B-059 — the selection box and Inspector W/H hug a path's ANCHORS, ignoring curve extents ⟨priority: high⟩ — merged (#280, `b841ebe`), archived (`openspec/changes/archive/2026-07-10-fix-pen-edit-mode-and-bbox`): size==visualBBox model — `pathVisualBBox` (exact cubic extrema) with `transform.size` == the visual extents, so the box/Inspector/off-frame consumers are generically correct. Owner-verified

**Repro:**

1. Pen: place a point; place a second with a big smooth drag; close (a two-anchor lens).
2. Select it and look at the selection box and the Inspector H.

**Expected:** the box and W/H enclose the whole visible curved shape.
**Actual (owner, screenshot):** the box hugs only the anchors — a ~1-px band across the middle — and Inspector H reads ~1.
**Env:** Browser + Designer canvas.
**Notes:** RECON (4-reader sweep, findings in the change's `design.md`): `pathBBox` is anchors-only BY CONVENTION — stored `transform.size` and the runtime viewBox are defined against it, so making it curve-aware globally re-scales every legacy path; a load-time re-bake is impossible for `.vcg` packages (integrity/signing hash `template.json`) and inexact for animated/rotated transforms — option (a) DISQUALIFIED. Fix (option b, the gizmo's auto-text display-override precedent): NEW `pathVisualBBox` in `@cg/shared-schema` (exact cubic extrema via derivative roots, the runtime's control-point convention) + closed-form display↔stored mapping (`features/canvas/path-bounds.ts`); the gizmo (single + multi) traces the visual box, resize maps back through the exact inverse, Inspector W/H shows/edits visual extents, and the off-frame export filter — found sharing the defect (a bulge-visible path with off-frame anchors was WRONGLY DROPPED from export) — folds the visual box. Stored schema, runtime render, hit-test, `.vcg`/HTML export: byte-identical.
**Regression test:** unit `packages/shared-schema/tests/path-visual-bbox.test.ts` (exact extrema incl. one-sided handles, closing segments, inward dips) + `apps/designer/tests/path-bounds.test.ts` (mapping round-trip, resize-through-display exactness, off-frame keep/drop); E2E `pen-edit-mode.spec.ts` (a curved lens's Inspector H and gizmo-polygon extent).

## [x] B-060 — right-click while drawing a pen draft should cancel it (like Esc) ⟨priority: medium⟩ — merged (#280, `b841ebe`), archived (`openspec/changes/archive/2026-07-10-fix-pen-edit-mode-and-bbox`): overlay-layer `onContextMenu` guarded `tool==='pen' && isPenDrawing()` cancels the draft (one undo restores it whole; pen stays armed); structurally disjoint from the edit-mode menus. Owner-verified

**Repro:**

1. Pen: place two or three points (draft in progress).
2. Right-click the canvas.

**Expected (owner decision):** the in-progress path cancels exactly like the drawing-Esc (element removed, one undo restores the whole path), no browser menu; with the pen armed but idle, nothing changes.
**Actual:** nothing (the native menu is suppressed app-wide; the draft stays).
**Env:** Browser + Designer canvas.
**Notes:** Implemented as `onContextMenu` on the CanvasOverlay pointer LAYER (spans the pasteboard; the pen feedback SVG is pointer-inert), guarded exactly `tool === 'pen' && isPenDrawing()` → `preventDefault` + `cancelPen()` + feedback clear. Disambiguation from the edit-mode anchor menu is structural (table in `design.md`): the anchor menu lives in `PathEditor` (cursor tool + point-edit mode only, stops propagation) and this handler requires the pen tool, which unmounts `PathEditor` — the two right-click meanings cannot cross; everywhere else right-click is untouched.
**Regression test:** E2E `pen-edit-mode.spec.ts` — right-click mid-draw cancels (element gone, pen stays armed, redraw works, undo restores the canceled path); pen-armed-idle right-click is a no-op.

## [x] B-061 — the point-edit overlay ignores rotation: anchors/handles sit on the unrotated shape ⟨priority: high⟩ — merged (#280, `b841ebe`), archived (`openspec/changes/archive/2026-07-10-fix-pen-edit-mode-and-bbox`): `PathEditor.screen()` maps through the full Scale·Rotate-about-anchor transform with exact inverse drags, and the owner re-verify round made the per-edit re-normalize render-neutral (`position' = position + (I − M)(A − A') + M·vmin`) so dragging one anchor of a rotated path leaves every untouched point in place. Owner-verified ("rock-solid")

**Repro:**

1. Draw a path, rotate it (Inspector Rotation), double-click into point-edit mode.

**Expected:** anchors, handle dots, and the segment affordances sit ON the rotated outline; drags track the pointer.
**Actual:** the overlay stays unrotated while the SVG rotates — anchors float off the shape (the D-109 `screen()` applied position + viewBox scale but no rotation term).
**Env:** Browser + Designer canvas.
**Notes:** `PathEditor.screen()` now maps point space → box-local → the element's FULL `Scale·Rotate`-about-anchor transform (reusing `geometry.localToScene`), and every drag (anchor, handle, insert) runs the exact inverse on pointer deltas (unzoom → unscale → unrotate → unmap); positions invert via the shared `hit-test.inverseToLocal`. Filed with the Prompt-11 owner batch (Issue A). **Owner re-verify round (2026-07-11):** verification found a second rotated-editing defect in this scope — dragging ONE anchor of a rotated path drifted every OTHER anchor per move tick (the per-edit re-normalize keeps `size == bbox`, which moves the pivot `anchor⊙size`; probe: 2.07 scene px per 8-px bbox tick at 30°). Fixed by making the `normalizePathPoints` reframe render-neutral under the full transform — `position' = position + (I − M)(A − A') + M·vmin`, reducing to the old `position += vmin` at rotation 0 / scale 1; reconciliation stays continuous (decision + derivation in the change's design.md).
**Regression test:** unit — the anchor-drag inverse under rotation (a dragged anchor lands under the pointer on a 30°-rotated path, `anchor-context-menu.test.ts` harness family) + `path-rotated-edit.test.ts` (drift: 30°, 90°+non-uniform scale over 3 ticks, rotated handle drag — untouched anchors render-stable to 1e-9; rotation-0 identity limit); E2E `pen-edit-mode.spec.ts` (rotated path: anchors render on the rotated outline; dragging one anchor leaves the others stationary within 1 px).

## [x] B-062 — resize-then-edit snap-back: dragging an anchor after a W/H resize reverts the size ⟨priority: high⟩ — merged (#280, `b841ebe`), archived (`openspec/changes/archive/2026-07-10-fix-pen-edit-mode-and-bbox`): a static W/H resize BAKES the scale into the point coordinates (`bakePathSize`) keeping size==visualBBox, so a later anchor-drag normalize is a no-op; `size.*` keyframes keep render-stretch semantics; ONE in-memory migration (`migratePathGeometry`/`migrateScenePaths`) converts legacy scenes at Designer load and runtime `.vcg` ingestion pixel-identically. Owner-verified incl. old-scene migration

**Repro:**

1. Draw a path; resize it via the gizmo or Inspector W/H.
2. Double-click into point-edit mode and drag any anchor.

**Expected:** the shape keeps its resized scale; only the dragged anchor moves.
**Actual:** the whole shape snaps back to its pre-resize size (points lived in a fixed local frame; W/H only wrote `transform.size`, and the anchor-drag normalize reset size to the points' bbox).
**Env:** Browser + Designer canvas.
**Notes:** OWNER MODEL DECISION (2026-07-10): converge on **size == visualBBox** — a static W/H resize now BAKES the scale into the anchor coordinates + handle vectors (like a rectangle's corners; `writeStaticAnimatable` path branch), `normalizePathPoints` re-anchors against the curve-aware `pathVisualBBox`, the runtime viewBox becomes the visual bbox, and ONE pure migration (`migratePathGeometry`/`migrateScenePaths` in `@cg/shared-schema`) converts legacy content at Designer scene load AND runtime ingestion — old projects and signed `.vcg` packages render pixel-identically (anchors keep scene spots; `size.*` keyframes scale by the constant ratio, `position.*` shift by the constant delta, static rotation/scale pivots compensated exactly; animated-rotation + legacy-resize + curves is a documented corner). `size.*` KEYFRAMES keep render-stretch semantics. This also delivers B-059's fix structurally (size IS the visual box — no display-mapping layer). Filed with the Prompt-11 owner batch (Issue B).
**Regression test:** unit `packages/shared-schema/tests/path-migration.test.ts` (conforming identity; resized-legacy pixel-fidelity; curved-arc migration; rotated-pivot compensation; keyframe compensation) + `apps/designer/tests/path-resize-bake.test.ts` (bake scales points/handles; invariant holds; anchor-drag after resize keeps the size — the exact symptom); E2E `pen-edit-mode.spec.ts` (resize → edit → no snap).

## [x] B-063 — the Ctrl add-point affordance sits off the real edge on curved/rotated paths ⟨priority: medium⟩ — merged (#280, `b841ebe`), archived (`openspec/changes/archive/2026-07-10-fix-pen-edit-mode-and-bbox`): the segment hit surfaces are per-segment cubic `<path>`s built from the same control points the runtime renders, mapped through the rotated screen transform — the copy-cursor affordance and inserts hug the true curved edge. Owner-verified

**Repro:**

1. Draw a curved path; double-click into edit mode; hold Ctrl and hover where the add affordance appears.

**Expected:** the affordance (and the insert hit surface) hugs the visible curved outline.
**Actual:** the hit-lines were straight chords between anchors in the unrotated anchor-bbox mapping — the affordance activated inside/off the shape (same root as B-059).
**Env:** Browser + Designer canvas.
**Notes:** The segment hit surfaces are now per-segment cubic `<path>`s built from the SAME control points the runtime renders, mapped through the rotation-aware `screen()` (B-061) — the affordance and inserts follow the true curved, rotated outline, and insertion lands at the NEAREST point on the curve under the cursor (32-sample search) rather than the straight midpoint. Segments stay pointer-interactive always (a plain left press falls through to normal select/drag; Ctrl/Cmd inserts; right-press opens the Issue-D Add menu). Filed with the Prompt-11 owner batch (Issue C).
**Regression test:** unit `anchor-context-menu.test.ts` (segment `data-cg-segment` surfaces; nearest-point inserts via the Add menu); E2E `pen-curve-edit.spec.ts` (Ctrl-gated insert on the curve) + `pen-edit-mode.spec.ts`.

## [x] B-068 — ensureCompositions drops scene-root lifecycle/playout when migrating a legacy root-layers scene ⟨priority: medium⟩ — merged (#293, `aede129`): `ensureCompositions` now carries `lifecycle` and `playout` into the migrated composition, so a legacy root-layers scene keeps its out-point hold and authored exit instead of resolving to `static` and freezing on the post-exit pose. Focused fix, no change dir. Confirmed shipped by the 2026-07-13 `[~]` audit

> (Originally filed as B-066 during D-119; renumbered — main's merged PR #289
> consumed B-066 for the CEF `replaceAll` boot abort. Main's merged numbers win.)

**Repro:**

1. Author (or import) a scene whose content lives in top-level `scene.layers` (no `compositions`), with `lifecycle: { outPoint }` and `playout` set at the scene root — a schema-valid shape.
2. Open it in the Designer (`designerStore.setScene` → `ensureCompositions`).
3. Preview the migrated composition and Play.

**Expected:** the migrated composition preserves the scene's `lifecycle`/`playout`, so the graphic enters, HOLDS at the out-point, and plays its authored exit per its playout mode.
**Actual:** `ensureCompositions` (apps/designer/src/renderer/state/scene-doc.ts) copies resolution/frameRange/activeRange/background/layers into the migrated composition but **silently drops `lifecycle` and `playout`** — `playoutOf` then resolves the comp to `static`: the whole timeline plays as one entrance (exit keyframes included), the hold freezes on the post-exit (typically fully transparent) pose, and stop is a hard cut. The graphic simply "disappears" after its intro.
**Env:** Browser / Designer dev; found 2026-07-12 during D-119 (the first-cut root-layer starters hit exactly this — rebuilt composition-centric as the fix).
**Notes:** One-line-ish fix: carry `...(scene.lifecycle !== undefined ? { lifecycle: scene.lifecycle } : {})` and same for `playout` into the migrated comp, + a unit test on `ensureCompositions`. The Zod schema deliberately allows root lifecycle/playout, so load must not lose them.

## [x] B-080 — preview timing durations show MILLISECONDS while the element properties show SECONDS ⟨priority: medium⟩ — merged (#322, `1002fdb`): the preview's countdown-duration and sequence-dwell controls now DISPLAY and ACCEPT seconds, each mirroring its inspector counterpart's rounding (INTEGER seconds for the countdown, fractional `step 0.5` for the dwell); the session override, the drivers and the schema still speak milliseconds. Display/input conversion only, no change dir. Follow-up to #320 (D-102 Phase 2)

**Repro:**

1. Author a composition with a countdown clock (duration target, e.g. 60s) and a sequence (default dwell e.g. 5s).
2. Note the values in the element properties / inspector: countdown `duration` = `60 s`, sequence `default dwell` = `5 s`.
3. Open the preview and look at the per-element timing rows (D-102 Phase 2, #320): the countdown's "duration" and the sequence's "item dwell".

**Expected:** the preview timing controls DISPLAY (and accept) the same unit as the element properties — SECONDS — so the operator reads `60` / `5`, edits in seconds, and never has to convert in their head.
**Actual:** both preview controls render raw MILLISECONDS (`60000` / `5000`, labelled "ms"), so the same quantity reads `6` in properties but `6000` in the preview — an operator setting a 6-second rehearsal duration can trivially type `6` and get a 6-millisecond countdown.
**Env:** Browser / Designer preview modal; post-#320.
**Notes:** Introduced by #320 (D-102 Phase 2 — per-element preview timing). UI display/input-conversion ONLY: the session override, the drivers and the schema keep milliseconds; only the two controls convert (ms ÷ 1000 to display, × 1000 on commit). Each preview row mirrors its inspector counterpart's rounding exactly — the countdown duration is INTEGER seconds (`step 1`), the sequence dwell allows FRACTIONAL seconds (`step 0.5`, `min 0.1`), as `StyleSection` does. The preview's per-scope HOLD control is deliberately NOT changed: the inspector's Playout section shows hold in milliseconds too, so it is already consistent — converting it would create the very mismatch this bug is about. No schema / session-shape / runtime / export / on-air change ⇒ no CasparCG hardware validation needed.
**Regression test:** unit `preview-timing-rows.test.ts` (a 60000 ms countdown DISPLAYS `60`; a 5000 ms dwell DISPLAYS `5`; typing `6` writes `durationMs: 6000`; typing `0.8` writes `dwellMs: 800`); E2E `preview-timing-phase2.spec.ts` (drive the seconds inputs, assert the runtime's EFFECTIVE ms stamps `data-cg-countdown-ms` / `data-cg-sequence-dwell` are unchanged in ms).

## [~] B-088 — a start-trimmed element ignores its in-point during play: the whole intro is ONE painted frame ⟨priority: high⟩ — code merged (#342, `62bbb44`) but DELIBERATELY still `[~]`: this fix changes playout TIMING and reaches the exported outputs, and ONE of its two verification gates is still outstanding. **Gate 2 (Linux `pnpm gate:e2e`) is DISCHARGED 2026-08-11** — <https://github.com/yasermostafaee/cg/actions/runs/31414808016>, commit `bd88ede`, a later `dev` HEAD that CONTAINS `62bbb44`; run `conclusion: success` and the `E2E (Playwright)` job's own conclusion is `success` (it RAN). **Gate 1 (real-CasparCG hardware check, PREVIEW + EXPORTED OUTPUT) is still OWED and has never been performed** — that is the sole reason this item is not `[x]`, and no e2e run can substitute for it: the gate exists precisely because a green suite cannot settle elapsed-time behaviour on air. See **Gates still OWED** below. Focused fix, no change dir

**Repro:**

1. In a ROOT composition (1920×1080 @50fps) whose elements carry **no keyframe animation** — e.g. furniture supplied by a D-125 `lottie` element plus a plain text/subtitle — trim the subtitle on the timeline to `lifespan = [33, 60]`.
2. Set the composition out-point past 33 (say 70).
3. Preview → Play.
4. Then extend the trim's END past the out-point (`[33, 90]`) and play again.

**Expected:** the subtitle is hidden through frames 0–32 and appears at frame 33 (0.66 s in at 50fps), in both cases.
**Actual:** step 3 — the subtitle is **never shown at all**. Step 4 — it is visible **from frame 0**, immediately at Play; the start trim never delays it. The two cases are the same defect seen from opposite sides.
**Env:** Browser / Designer preview; reproduces on `main` with and without a Lottie present (byte-identical behaviour), and in the exported outputs.

**Root cause:** `PlayoutController.playRange` (`packages/template-runtime/src/playout-controller.ts:305`) short-circuits an entire leg to a single paint when nothing is deemed frame-dependent — `if (!this.o.hasAnimation || outF <= inF) { this.o.applyFrame(outF); onEnd(); return; }`. `hasAnimation` is `scope.animated.length > 0` (`runtime.ts:963`), and `scope.animated` is populated ONLY by keyframe tracks (`scene-builder.ts:125`). Trimming writes only `lifespan`; `buildLottie` registers on `scope.lotties`, never `animated`. With `animated` empty, `entranceSettleFrame` returns `outPoint` verbatim (`animation-applier.ts:617`), so `holdEntry === outPoint`, the static settle leg is skipped (`playout-controller.ts:221`), and **the whole intro becomes one `applyFrame(outPoint)` call**. Since B-029 (#187) made the per-element lifespan gate frame-dependent (`runtime.ts:1139`), that gate is therefore evaluated **exactly once per leg** — at the out-point. If the out-point falls outside `[in, out]` the element is never shown; if inside, it is shown from the first paint. `hasAnimation` had come to conflate two different questions: "does anything need interpolating?" (a legitimate rAF optimisation) and "does anything care WHICH frame we're on?" — no longer answerable by keyframes alone.

**PRE-EXISTING, not D-125.** `git diff 89c1163 HEAD -- playout-controller.ts frame-driver.ts animation-applier.ts` (89c1163 = the commit before D-125 Phase 1) is **empty**; `playout-controller.ts` was last touched by D-114. D-125 did **not** make this likelier, either: keyframe-less root scopes were always the norm — this repo's own `lowerThirdScene` fixture carries no `animation`, so B-029's own regression tests already ran the collapse path (and, see below, encoded its output as correct). What D-125 changed is **OBSERVABILITY**: `LottieDriver` runs on its own rAF clock started inside `play()`, so a multi-second animating intro is now on screen while the composition playhead has already teleported to the out-point. Before that, a keyframe-less composition snapped to the hold instantly and there was no perceptible intro during which a mis-gated element could be noticed. That is how this surfaced.

**Fix:** separate the two questions. `playRange` sweeps when `hasAnimation || needsFrameSweep(inF, outF)`, where the new per-leg predicate is true only when a lifespan gate's boundary — it turns ON at `lifespan.in`, OFF at `lifespan.out + 1` — lands in `(inF, outF]`, i.e. when the gate's value would actually change during that leg. A leg that crosses no boundary still collapses to one paint, so the optimisation is preserved. Applied at `playRange` itself, so it covers all three legs (both intro legs and the outro) without touching `entranceSettleFrame`. Only the ROOT controller supplies the predicate, mirroring the existing `isGlobalRoot` guard on the gate.

**Two existing tests encoded this bug as correct and were corrected** (`packages/template-runtime/tests/runtime.test.ts`): one asserted `display !== 'none'` synchronously after `play()` for `lifespan {in:5,out:50}` ("play must restore it — the played frame is within [5,50]"), the other asserted `'none'` for `{in:0,out:3}`. Both were artefacts of the single collapsed paint at the out-point.

**Regression test:** `packages/template-runtime/tests/lifespan-frame-sweep.test.ts` — `[33,60]` and `[33,90]` with no keyframes (hidden at 0/10, visible at 40); a keyframed control (no regression); the collapse preserved for a no-lifespan and a leg-spanning lifespan, asserted by **rAF count** (no `FrameDriver` scheduled at all), not just visibility; and a boundary inside the OUTRO leg.

**On-air impact:** this changes playout TIMING — a composition that previously snapped through its intro instantly now sweeps it in real time whenever a trim boundary is crossed (which is the point: the trim needs elapsed time to be honoured). Warrants a real-CasparCG check before it is considered done.

**Gates still OWED — this is why the item is `[~]` and not `[x]` (updated 2026-08-11).** The code is
merged (#342, `62bbb44`). **Gate 2 is now DISCHARGED; gate 1 is not, and it is the only thing holding
this item open.** Gate 1 has never been attempted, and it may not be inferred from the merge nor from
gate 2 — a merged branch is not a discharged gate, and a green suite is not an on-air observation:

1. **Real-CasparCG hardware check (PREVIEW + EXPORTED OUTPUT) — OWED, never performed.** Required by
   this entry's own **On-air impact** line above: the fix changes playout TIMING, so an intro leg
   that previously snapped through in one paint now consumes real elapsed time whenever a trim
   boundary falls inside it. A green unit suite cannot settle that — the elapsed-time behaviour has
   to be observed on air. BOTH output paths are in scope because the **Env** line above records that
   this reproduces "in the exported outputs" as well as in preview, and the export path renders
   through the same `PlayoutController` without the preview's driver, so one can hold while the
   other fails.
2. **Linux `pnpm gate:e2e` — ✅ DISCHARGED 2026-08-11.** The fix is in `packages/template-runtime`
   (a render-path change), which is exactly the class P-009's spec (`docs/prd/platform.md`) says
   owes an E2E run, and a `win32` pass is explicitly NON-AUTHORITATIVE there. That debt is now
   settled by a COMPLETED, GREEN `e2e` job on `ubuntu-latest`:
   <https://github.com/yasermostafaee/cg/actions/runs/31414808016> — commit `bd88ede`, a later
   `dev` HEAD that CONTAINS `62bbb44` (verified with `git merge-base --is-ancestor`, not assumed
   from dates). Checked by reading the job conclusions, not merely that a run exists: run
   `status: completed` / `conclusion: success`, `E2E (Playwright)` job conclusion `success` with
   its `E2E` step actually executing (~10 min), alongside
   `Lint • Typecheck • Test • Build=success`. The job is not diff-scoped — it runs `pnpm test:e2e`,
   the entire Playwright suite — so it verifies the TREE at that SHA, this fix included.

   **SUPERSEDED text, recorded so the change is legible:** this entry previously read "OWED, and
   demonstrably NOT RUN", because #342's own `E2E (Playwright)` check was `SKIPPED` under the
   Actions billing outage and WSL is not installed on this host. Both conditions are gone — CI is
   restored and `pr.yml` runs on every push to `dev`. Do not go install WSL on the strength of the
   old sentence; it no longer applies.

**Same debt as [[B-089]], and for the same reason** — both change playout timing in the
template-runtime render path. B-089's hardware gate has since been discharged by owner report
(2026-07-20); **that report covered B-089 and says nothing about this item.** Do not carry it across:
the two fixes touch different legs (B-088 is about how OFTEN the gate runs, B-089 about WHICH
elements it covers) and were merged from different branches. B-088 needs its own observation.

## [x] B-089 — nested-instance element lifespans are never gated at all ⟨priority: medium⟩ — code merged (#369, `7f9868f`); BOTH verification gates are now discharged, so the item closes. (1) Real-CasparCG hardware check — DISCHARGED by owner report, 2026-07-20 (preview + single-file export). (2) Linux `pnpm gate:e2e` — DISCHARGED 2026-08-11 by a COMPLETED, GREEN `e2e` job on `ubuntu-latest`: <https://github.com/yasermostafaee/cg/actions/runs/31414808016>, commit `bd88ede`, a later `dev` HEAD that CONTAINS `7f9868f` (verified with `git merge-base --is-ancestor`). Run `conclusion: success`; the `E2E (Playwright)` job's own conclusion is `success` and its `E2E` step RAN for ~10 min — not `skipped`. The job is not diff-scoped: it runs `pnpm test:e2e`, the whole Playwright suite, so it verifies the TREE at that SHA including this fix. Focused fix, no change dir

**Repro:**

1. Build a composition containing an element trimmed to `lifespan = [33, 60]`.
2. Place that composition as a nested composition INSTANCE inside another composition.
3. Preview → Play the parent.

**Expected:** the nested element honours its trim, as it does when the same composition is previewed directly.
**Actual:** the trim is ignored entirely — the element is visible for the whole lifespan of the instance.
**Env:** Browser / Designer preview; also the exported outputs.
**Notes:** `collectLifespanGates` (`packages/template-runtime/src/runtime.ts:1579`) walks only `scene.layers` and resolves ids against the ROOT `built.elementMap`; every composition instance owns its own `elementMap`, so nested elements are unreachable and never enter the gate list. The per-frame application is likewise root-only (`if (isGlobalRoot) applyLifespanGatesAtFrame(frame)`, `runtime.ts:969`). Its `el.type === 'container'` recursion branch is **effectively dead** as well: `container` is built by `buildPlaceholder`, which builds no children, so container children never enter any `elementMap` either. Distinct from B-088 (which is about how OFTEN the gate runs); this is about WHICH elements it covers. Do not fold the two — B-088's fix deliberately leaves nested scopes' collapse behaviour untouched.

**Gates — BOTH DISCHARGED (closed 2026-08-11).** The code is merged and both verification gates
below now carry independent evidence, so the item is `[x]`. Each was independently confirmed or
carries an explicit owner attestation — neither was taken from a prompt or a hand-off note as if it
were a measurement this session made:

1. **Linux `pnpm gate:e2e` — ✅ DISCHARGED 2026-08-11.**
   <https://github.com/yasermostafaee/cg/actions/runs/31414808016> — commit `bd88ede`, a later
   `dev` HEAD that CONTAINS this fix's `7f9868f` (verified with `git merge-base --is-ancestor`).
   Run `status: completed` / `conclusion: success`; the `E2E (Playwright)` job's OWN conclusion is
   `success` and its `E2E` step actually executed (~10 min) — a `skipped` job would have proved
   nothing (P-029). `pnpm test:e2e` runs the whole suite, so the run verifies the TREE at that SHA.
   **SUPERSEDED text:** this entry previously read "NOT RUN … the Linux run must be done locally",
   which was true only under the Actions billing outage and the absence of WSL on this host. CI is
   restored and `pr.yml` runs on every push to `dev`; do not install WSL on the strength of the old
   sentence.
2. **Real-CasparCG hardware check (PREVIEW + SINGLE-FILE EXPORT) — DISCHARGED by OWNER REPORT,
   2026-07-20.** The owner ran the check on their own CasparCG hardware and reported it covering
   BOTH output paths — PREVIEW and SINGLE-FILE EXPORT. This project's definition of done is
   owner-verified on owner hardware, so that report discharges this gate.

   **Attribution — this session did not measure this.** It is recorded here as the owner's report,
   on the owner's authority. No hardware was available to this session and none was exercised by
   it; nothing here claims the check was independently reproduced.

   Why the gate existed: the change alters on-air timing (see On-air impact below) — a nested
   composition containing a trimmed element now sweeps its intro leg in real time where it
   previously snapped through it. A green unit/E2E suite could not settle that; the elapsed-time
   behaviour had to be observed on air. Both output paths were needed because export renders
   through the same per-scope controllers but WITHOUT the preview's driver, so one could hold
   while the other failed.

**Provenance note (why this block is worded so defensively).** An earlier close-out attempt flipped
this item to `[x]` carrying the text "`gate:e2e` green on WSL" and "the real-CasparCG check is
DISCHARGED". Both came from a session hand-off assertion, neither was independently verified, and the
first was demonstrably false — WSL is not installed on this host. The commit was reset before it
reached `main`. **Standing rule adopted from that miss: a gate asserted in a prompt, hand-off, or
CONTEXT block is NOT evidence. Verify it independently or leave the debt recorded here.**

**How the 2026-07-20 discharge above differs — the rule is intact.** What was rejected was a session
asserting that a MEASUREMENT had been taken when it had not: a claim about evidence, made by a party
who had gathered none, and false on its face for the WSL half. What gate 2 now records is the OWNER
attesting to their own check on their own hardware, labelled as an owner report rather than dressed
up as a session measurement. The first is hearsay about evidence; the second IS the evidence this
project treats as authoritative. The test is not "where did the words arrive from" but "who is
attesting, to what they personally did". Note what did NOT change: gate 1 is untouched, because
nobody has attested to it.

**Not the same root as B-090** (which is about `container` children). `flattenElements` recurses ONLY into
`container`, never `composition`, so a nested comp's elements have no timeline row at all — their WRITE
path was always fine (you author them inside their own comp, where they are top-level and `locate()`
resolves). B-089 is purely a READ/gating gap, and the two were fixed on separate branches.

**Fix:** gates are now collected PER SCOPE at BUILD time (`FieldScope.lifespanGates`, registered in
`buildLayer` beside `scope.animated`), so every composition instance owns its own — reaching nested
elements by construction instead of re-walking `scene.layers` against the root `elementMap`. Each scope's
controller applies its OWN gates at ITS OWN frame.

**Frame space:** a child's `lifespan` sits in its OWN scope's frames, not the root's — the Designer
clamps a trim to `activeDocOf(scene).frameRange`, i.e. the frame range of the composition being edited,
which is exactly the timeline that scope's controller runs. This follows the existing per-scope
lifecycle model (D-026 controllers, D-125 Phase 3a's per-scope Lottie settle); no second convention was
invented.

**Sweep predicate — B-088 one scope down, confirmed EMPIRICALLY.** Per-scope gates were wired FIRST with
`needsFrameSweep` left root-only, then the probe was run: a nested element trimmed to `[33,60]` in a
keyframe-less comp never appeared (the single collapsed paint at the out-point sits outside the trim),
and `[33,90]` was visible from frame zero (that paint sits inside it) — B-088's two failure modes exactly.
So the predicate now applies to EVERY scope, each asking only about its own gates, and is passed
`undefined` when a scope has no trims so trim-free scopes keep the collapse. Both rAF-count optimisation
tests still assert zero `FrameDriver`s for a static nested scene.

**STAMPED scopes — caught by adversarial review, would have been a live regression.** A repeater row and
a sequence composition item each get a FRESH scope that is deliberately never in `scope.children` (only
the wiring tree sees them). A first cut filled `naturalDisplay` by walking the namespace tree after the
build, which cannot reach those scopes — so their gates kept a placeholder and, on re-entering the trim,
wrote `display: ''` instead of the built value: a `visible: false` element became VISIBLE on air (a direct
B-034 violation) and a `flex`/`grid` element (text `verticalAlign`, clock, sequence) collapsed to `block`.
Newly introduced, because the old root-only collector never produced a gate for anything in a row at all.
Fixed by capturing `naturalDisplay` at BUILD time in `buildLayer` (correct for every scope by
construction), keeping the post-build walk only as a REFRESH so a boot-time `visibility` binding — which
writes `style.display` (`bindings.ts`) — retains its established semantics for reachable scopes. `tick`
likewise now walks the LIVE wiring tree plus each subtree's `scope.children`, instead of a boot-time
union, so scrub and playback agree about rows (a repeater re-stamps scopes at each play and on
`setItems`).

**Regression test:** `packages/template-runtime/tests/nested-lifespan-gate.test.ts` — nested `[33,60]` and
`[33,90]` during PLAY; nested trims under SCRUB; root + nested trims coexisting in one scene (no B-029
regression); a HIDDEN nested element staying inert (B-034); the static-case collapse preserved one scope
down, asserted by rAF count; a keyframed-sibling control; and three STAMPED-scope tests (a hidden row
element staying hidden inside its trim, a row element restoring its built `flex` rather than `''`, and
scrub gating a row) — each verified to FAIL against the placeholder version.

**On-air impact:** this changes playout TIMING. A nested composition containing a trimmed element now
sweeps its intro leg in real time where it previously snapped through it — same class as B-088, and for
the same reason (the trim needs elapsed time to be honoured). Root-scope timing is unchanged. Warrants a
real-CasparCG check before it is considered done.

## [x] B-090 — trimming a NESTED element silently does nothing ⟨priority: medium⟩ — merged (#370, `9d0ef16`): resolved by REMOVING the affordance, not by making it write — `flattenElements` (`TimelineDock.tsx`) and `flattenLayerChildren` (`state/slices/elements.ts`) now list each layer's DIRECT children only, so a container child gets no timeline row and therefore no trim gripper. The write-path branch was rejected on the evidence (a container child provably never gets a DOM node, so a persisted trim would be observable by nothing). Focused fix, no change dir

**Repro:**

1. Put an element inside a container.
2. In the timeline, drag that element's trim gripper.

**Expected (as filed):** either the trim applies, or the gripper is not offered.
**RESOLVED AS:** the gripper is **not offered** — the affordance was removed, not made to write. See the Fix
below for why the write-path branch was rejected on the evidence.
**Actual (before the fix):** nothing happens — no trim, no error, no visual feedback. The gripper is rendered and drags, then the value is discarded.
**Env:** Browser / Designer timeline.
**Notes:** The timeline renders rows for everything `flattenElements` returns, and it DOES recurse into containers — but `updateElementLifespan` resolves the target through `locate()` (`apps/designer/src/renderer/state/scene-doc.ts:182`), which searches only top-level `layer.children` via `findIndex` with no recursion, returns `null`, and the mutation early-returns (`slices/elements.ts`). So the UI offers an affordance the state layer cannot honour. Note this is a WRITE-path gap and is independent of B-089 (a READ/gating gap) — an element inside a container would still not be gated even if the trim did persist.

**Not the same root as B-089.** B-090 is about `container` children; B-089 is about `composition`
INSTANCE children. `flattenElements` recurses ONLY into `container`, never `composition`, so a nested
comp's elements have no timeline row and no gripper at all — their write path was always fine (you
author them inside their own comp, where they are top-level and `locate()` resolves). Fixed on separate
branches.

**Finding — the affordance is for a feature that does not exist yet.** `container` dispatches to
`buildPlaceholder` (`scene-builder.ts:159`), which creates an empty div and builds NO children
(`M3.2-α: not yet supported`), so a container child reaches no scope's `elementMap` and is invisible in
preview AND export. Containers are also unauthorable: `DesignerTool` has no container member, the
`TOOLS` rail has no Group button, there is no `defaultContainer` factory, and no group/ungroup/reparent
action exists anywhere — a container only enters a scene via a hand-authored `.vcg`. Every other
surface already refuses these elements: `locate()` is direct-children-only across its 17 call sites,
`reorderElement` guards them out explicitly, the canvas hit-test skips them, and the Inspector's
`findSelected` cannot find them (so selecting such a row shows no Inspector at all). The timeline's
`flattenElements` was the ONLY place in the app that recursed into containers.

**Fix — the affordance was REMOVED; the write path was deliberately NOT fixed.** `flattenElements`
(`TimelineDock.tsx`) and `flattenLayerChildren` (`state/slices/elements.ts`) now list each layer's
DIRECT children only, so no row — and therefore no trim gripper — is rendered for a container child.
The two must stay in lockstep, because `reorderElement` maps a displayed row index back through the
latter.

**Why the write-path branch was rejected.** Making the trim persist would have produced a value that
NOTHING can ever observe. A container child provably never gets a DOM node: `container` dispatches to
`buildPlaceholder`, which builds no children, so the element enters no scope's `elementMap` and is
absent from preview, export, and air alike. A `lifespan` gate needs a node to toggle; with no node there
is nothing to gate. So the two candidate write-path fixes both fail on the evidence:

- Making `locate()` recursive is a non-starter regardless — its 17 call sites all write back via
  `layer.children[elIdx]`, an index a nested element does not have, so recursion would force a 17-site
  signature refactor or silently overwrite the wrong element.
- A local recursive patcher in the D-107 (`patchDrivesHold`) / D-112 (`patchHoldOverride`) style would
  compile and would persist the value — but those patch FLAGS the runtime reads back off the scene doc,
  whereas this needs a rendered node. It would have traded a VISIBLY-inert control for an
  INVISIBLY-inert one: the gripper would move and the bar would persist while the element stayed
  invisible everywhere. That is a worse bug than the one filed, so it was rejected.

When containers are genuinely implemented (the `buildPlaceholder` TODO), the recursion returns alongside
the render — noted at both call sites and in the timeline README.

**Regression test:** `apps/designer/tests/nested-element-trim.test.ts` — the container gets a row and
grippers but its child gets neither; a trim aimed at a container child writes nothing anywhere; and the
real top-level trim path still persists and undoes.

**On-air impact:** none — designer-authoring state only, no runtime or export behaviour changes.

**Verification — and why this one closes while [[B-089]] does not.** Merged #370; local `pnpm gate`
green. That is the whole of the evidence, deliberately: this is a Designer authoring-surface fix that
REMOVES a timeline row. It has no export path and no on-air surface, so unlike B-089 it owes **no
real-CasparCG hardware check** — there is no playout behaviour for hardware to disagree with. Its
load-bearing evidence is the regression test above plus the merged fix.

**Linux `gate:e2e` — owed but NOT blocking.** It touches the timeline UI, so a Linux E2E run is owed
on the same terms as every other UI merge in this window (#330, #334, #336, #337): WSL is not
installed on this host and GitHub Actions is billing-exhausted until ~2026-08-01. It is recorded here
rather than holding the item open, because the fix's correctness does not turn on pixel geometry —
the assertion is that a row is ABSENT. Note there is no consolidated Linux-E2E backlog file in the
repo; P-009's spec (`docs/prd/platform.md`) establishes the owed-run rule, and each entry carries its
own debt, which is why it is written out here.

## [ ] B-099 — UNVERIFIED: `wireScope`'s content-start gate resolves a nested scope's hosts through the ROOT `elementMap`, so the D-104 visibility gate is likely inert for nested compositions ⟨priority: medium⟩

**Status: UNVERIFIED — filed from a static reading, no runtime probe run.** The code path below is
confirmed present on merged `main`; the _behaviour_ it implies is not. Do not treat the impact
claim as established until the probe at the bottom runs.

**Verified against merged `main` (`5a8c34a`, i.e. AFTER [[B-089]]/#369 reworked this exact
function).** #369 did not change it.

**Where:** `packages/template-runtime/src/runtime.ts:1044-1055`, inside `wireScope`.
`collectContentHost` is invoked over **per-scope** lists —

```ts
for (const t of scope.tickers) collectContentHost(t.element);
for (const c of scope.clocks) collectContentHost(c.element);
for (const sq of scope.sequences) collectContentHost(sq.element);
```

— but resolves each node through the **root** map:
`const node = built.elementMap.get(element.id)`.

**Why those are not the same map.** `scene-builder.ts:103` sets the built scene's `elementMap` to
`rootScope.elementMap` — an alias for the root scope's map alone — while `scene-builder.ts:123`
registers every element into `ctx.scope.elementMap`, i.e. _its own_ scope's map, and each nested
scope is created with a fresh `new Map` (`newScope`). No step merges a child's map into the root.
A per-scope `elementMap` is already the established way to read these nodes — `bindings.ts:89`
resolves through `scope.elementMap`.

**Expected (if the probe confirms):** a nested composition's clock / ticker / sequence HOST is
hidden until the content-start frame, then revealed — the D-104 follow-up rule that a host shows
its static initial content (a clock's frozen time, a sequence's item 1, a ticker's band) only FROM
`holdEntry`.
**Suspected actual:** for any non-root scope the lookup misses, the `if (node !== undefined)` guard
**silently skips**, `contentGates` stays empty, and `applyContentGateAtFrame` iterates nothing — so
the gate never applies and the nested host presumably shows frozen content from frame 0. Note the
failure is silent by construction: the guard turns a missed lookup into a no-op, not an error,
which is why this would not surface as a crash.

**Same bug class as [[B-089]], on the adjacent code path — and B-089's own comment names it.**
`runtime.ts:1082` records that B-088 "wired this for the ROOT scope only, **because gates were
collected against the root `elementMap`** and a nested scope had none to cross". B-089 fixed that
for the **lifespan** gates by giving every scope its own gates and carrying the node on
`scope.lifespanGates` — deliberately _not_ going through the root map. The **content** gate,
ten lines above in the same function, still does. So the defect B-089 diagnosed was repaired on one
of the two gate lists and left standing on the other.

**Probe needed (do this before fixing anything):** build a nested composition instance containing a
clock or ticker, with a `lifecycle.contentStart` marker on the nested scope; drive the playhead and
assert the HOST node's `display` is `'none'` before the content-start frame and its natural value
at/after it. If the host is visible from frame 0 — or `contentGates` is empty for that scope — the
bug is confirmed. The root-scope case should pass either way, which is the control.

**Candidate fix if confirmed:** resolve through `scope.elementMap` instead of `built.elementMap`,
matching what `bindings.ts` already does and what B-089 did for the lifespan gates. Worth checking
in the same pass whether any other consumer inside `wireScope` reaches for `built.elementMap`.

**Impact if confirmed:** playout/preview visibility only for nested compositions — the driver's
_run_ is gated separately (D-104 gated the driver; this follow-up gated the HOST), so the symptom
would be premature static content rather than a mistimed crawl.

## [ ] B-096 — the Lottie Inspector's clip total counts `op` frames, ignoring a nonzero in-point ⟨priority: low⟩

**Repro:** import a bodymovin clip whose `ip` is not 0 (e.g. `ip: 10`, `op: 120`) and select it; open
the Lottie section's "animation details" disclosure.

**Expected:** the clip total is the clip's LENGTH — `op − ip` (110 frames here).
**Actual:** it reads `clip 120 frames @ 30 fps`, i.e. `op` verbatim, overstating the clip by `ip`
frames. The seconds figure beside it is correct (it comes from `lottieTiming`'s `clip` span, which
already spans `[ip, op]`), so the two disagree.
**Env:** Designer Inspector → Lottie → animation details.

**Where:** `apps/designer/src/renderer/features/inspector/StyleSection.tsx` — the disclosure renders
`clip {timing.meta.op} frames` (raw metadata) instead of the span already computed for it. The fix is
to use the span's frame count (`timing.clip.frames`) so the frames and seconds come from ONE source,
matching the D-125 Phase-3a rule that the number shown is the number the runtime uses.

**Impact:** display-only and confined to the advanced disclosure — no runtime, export, or timing
behaviour reads it. Filed as a carried-forward remainder when D-125 was archived (2026-07-19) so it
would not be lost with the change dir; a real AE furniture clip usually has `ip: 0`, which is why it
survived the phase.

## [x] B-091 — the preview's `lottie-assets` handler rebuilds the scene mid-playback ⟨priority: low⟩ — merged (#348, `df37de2`) as part of D-125 Phase 3b-1

**Repro:** with a composition containing a Lottie playing in the preview, have a `lottie-assets` message arrive (e.g. an asset import completing during playback).

**Expected:** the live graphic is left alone while playing, as the `update` handler already guarantees.
**Actual:** the runtime is torn down and rebuilt underneath the playing graphic.
**Env:** Browser / Designer preview.
**Notes:** `apps/designer/src/platform/preview.ts:730` — the `lottie-assets` branch does `lottieAssets = msg.lottieAssets; if (currentScene && …) { await applyScene(currentScene); }`, a full rebuild with **no `!playing` guard**, unlike the `update` handler ~13 lines below (`if (runtime && !playing) runtime.tick(currentFrame)`). Introduced by D-125 (Phase 1). **Not causal for B-088** — it cannot produce that symptom, and B-088 reproduces with no Lottie at all — but it is a real latent teardown. Candidate for D-125 Phase 3.

## [ ] B-102 — images inside a sequence-item composition render in preview but NOT on CasparCG hardware ⟨priority: high⟩

**Repro:**

1. Create a composition containing an `image` element.
2. Add it as a `composition`-kind item of a `sequence`.
3. Preview — the image shows.
4. Export single-file HTML; play on real CasparCG 2.3.x.

**Expected:** the image renders on air exactly as in preview.
**Actual:** the image is absent on hardware.
**Env:** Designer preview vs real CasparCG 2.3.x (CEF, `file://`). HARDWARE-AFFECTING — a
preview/on-air parity break, the class the export pipeline exists to prevent.
**Notes:** the initial suspicion — that the exporter's asset collection may not walk compositions
referenced via sequence ITEMS, the same root-`elementMap`-only traversal class as B-089/B-099 — is
**PARTIALLY CONTRADICTED by filing-time recon**: `collectImageElements`
(`packages/single-file-export/src/image-export.ts:26`) walks the main scene AND **all**
`scene.compositions` (a sequence-item composition lives there too, however it is referenced), and
both exporters collect through it — so the naive "bytes never collected" theory does not hold for
the image-bytes path as read. The defect more likely sits elsewhere on the parity chain: how a
sequence's `composition` items mount/resolve image sources at play time under CEF, an
image-`source` variant (project vs D-040 shared) resolving differently at export than in preview,
or preview masking a failure by reading the LIVE AssetStore. Verify the real path at fix time —
the repro is the truth, the suspicion is not.
**Regression test:** exporter test asserting a sequence-item composition's image bytes land in
both `.vcg` and single-file output, PLUS the preview/hardware parity scenario (the render path,
not just collection).

## [ ] B-103 — first sequence item enters WITHOUT its transition when `repeat: 'infinite'` ⟨priority: medium⟩

**Repro:**

1. Create a sequence with ≥2 items, `transitionIn` at its default (`bottom`).
2. Set `repeat` to a finite count → play: the first item animates in.
3. Set `repeat: 'infinite'` — the SCHEMA DEFAULT (`SequenceElementSchema.repeat` defaults to
   `'infinite'`, `packages/shared-schema/src/elements.ts:461`) → play.

**Expected:** the first item enters with the same `transitionIn` motion in both repeat modes.
**Actual:** with `'infinite'` it appears instantly.
**Env:** Designer preview / template-runtime playback. Because `'infinite'` is the schema default,
this IS the out-of-box behavior — every freshly created sequence shows the defect.
**Regression test:** template-runtime sequence test on the injected clock covering first-item
entry under BOTH repeat modes.

## [~] B-104 — project assets (images, fonts) are GONE after save → Designer restart → load ⟨priority: high⟩ — being fixed by [[D-150]] (the project becomes a self-contained package): `openspec/changes/designer-project-package/`

**Repro:**

1. Import an image + a font; use both in the scene.
2. Save the project.
3. Fully restart the Designer (close the tab/browser).
4. Load the same project.

**Expected:** assets present, scene renders as saved.
**Actual:** the assets are missing from the assets panel and the scene shows a broken image /
fallback font.
**Env:** Designer, across a full browser restart. **DATA LOSS class.**
**Notes:** recon pointers (verify, don't assume): asset bytes live in the WORKSPACE under
`projects/<projectId>/assets/<kind>/<sha>.<ext>` keyed by `projectId = scene.id`
(`apps/designer/src/platform/AssetStore.ts` — `setActiveProject` / `#bytesPath`;
`workspace.ts`), while the project file itself may be an EXTERNAL File System Access file
(`ProjectStore.ts` — `handleKey` → IndexedDB-persisted `FileSystemFileHandle`). TWO candidate
break points: (a) the projectId↔workspace linkage on reload (does loading an external file
re-activate the same `projects/<projectId>/` namespace?), and (b) the workspace ROOT itself —
`initWorkspace()` prefers a previously-connected on-disk directory and silently falls back to OPFS
when the remembered handle/permission is gone, so the same projectId can resolve against a
DIFFERENT root across sessions, orphaning the bytes. The exact repro conditions (external file vs
OPFS project; same/different browser session; whether the remembered-directory permission
survived) MUST be pinned during the fix — the fix is not credible without them.
**Regression test:** persistence round-trip covering save → reload → asset resolution (bytes AND
panel listing), including the restart boundary.

**FIELD REPORT — 2026-08-02, from the owner (via the `DEBT.md` sweep).** Independently reported as
"Designer JSON save/import loses assets": the project is saved and re-imported, and the assets do
not come back. Folded in here rather than filed as a new number because it is this defect — the
same save → reload → assets-missing boundary — reported from the other side of the same seam.

**⭐ DIAGNOSED 2026-08-11, and BOTH candidates turned out to be real** (`openspec/changes/designer-project-package/`, [[D-150]]). Candidate **(a)** is the primary one and needs no permission
subtlety at all: `openDisk` / `openRecent` returned a scene WITHOUT calling
`ProjectStore.#setActive`, and `activeChanged` is what relays into `assets.setActiveProject` —
so opening a project from a real file left the asset store scoped to whatever came before, which
at boot is `null`. The scene rendered; the panel was empty; every time. Candidate **(b)** is real
too and explains the restart specificity: `restoreRememberedDirectory` calls `requestPermission()`,
which **Chromium refuses outside a user gesture**, and `initWorkspace()` runs at boot where there
is none — so after a restart the remembered folder ALWAYS fails to reopen and a bare `catch {}`
substituted a different root in silence.

The fix does not repair either link. It removes the reason a link is needed: the project carries
its own assets. The paragraph below is kept as written, because it is the state of knowledge that
produced the requirement to pin the mechanism, and that requirement was the right one.

**The mechanism is STILL NOT DIAGNOSED, and this report does not change that.** It supplies the
reproduction this entry has been asking for, not a cause. **Do not promote either candidate (a) or
(b) above to "the cause" because a repro now exists** — both remain candidates, and the item's own
requirement stands unchanged: the exact conditions (external File System Access file vs OPFS
project; same or different browser session; whether the remembered-directory permission survived)
MUST be pinned before a fix is credible. What the report does add is that the loss is reproducible
on demand for the owner, so those conditions can now actually be captured rather than guessed.

## [ ] B-105 — the sequence "Hide-show" transition produces no perceptible change ⟨priority: medium⟩

**Repro:**

1. Create a sequence with ≥2 items.
2. In the Inspector's transition preset select, pick **Hide-show** (the shipped preset key
   `hide-show` — `transitionIn: 'none'`, `transitionOut: 'none'` —
   `apps/designer/src/renderer/features/inspector/sequence-presets.ts`).
3. Play.

**Expected:** items visibly swap (out-then-in, or at minimum a clean cut between DIFFERENT items).
**Actual:** no change is perceived by the operator.
**Env:** Designer preview / playback.
**Notes:** filing-time recon sharpens what must be pinned at fix time: the preset is DOCUMENTED as
an instant hard swap — `none` = "instant cut" (`SequenceEdgeSchema`,
`packages/shared-schema/src/elements.ts:389-390`) and the preset comment reads "both sides cut
instantly (timing is moot with two `none`s)". So distinguish: (a) items fail to ADVANCE at all
under `none`/`none` — a real defect; or (b) items advance as the designed instant cut and the
operator reads it as "nothing happened" — working-as-designed, in which case the fix may be a
`fade` edge (a perceptible minimal transition) rather than a behavior repair. Decide there; the
observed behavior is filed as reported either way.
**Regression test:** sequence transition test asserting item advance is OBSERVABLE under the
Hide-show values (the item content actually changes at the boundary).

## [ ] B-106 — repeater `maxItems` is not enforced end-to-end ⟨priority: medium⟩

**Repro:**

1. Create a repeater with `maxItems: 3`.
2. Author (or bind a list of) 5 items.
3. Open preview / play at runtime.

**Expected:** at most 3 rows stamp anywhere — and the Designer's authored-items editor
refuses/flags adding past the clamp.
**Actual:** more than `maxItems` rows appear (client report).
**Env:** Designer / preview / runtime.
**Notes:** the schema documents the contract — `RepeaterElementSchema.maxItems`: "Optional stamp
clamp — at most this many rows per fresh play" (`packages/shared-schema/src/elements.ts:497-498`).
Filing-time recon shows the runtime DOES clamp at both known sites: the static authored stamp
(`clampRowCount`, `packages/template-runtime/src/scene-builder.ts:904/912`) and the driver restamp
(`packages/template-runtime/src/repeater-driver.ts:164` slices to `maxItems`) — so this is NOT a
blanket "never enforced"; some path leaks past the clamp and must be LOCATED at fix time
(candidates: a render path that bypasses `clampRowCount`, a stale build, or a bound-list update
route). What recon DID confirm as missing: the Designer side has NO guard — `StyleSection.tsx`
only edits the `maxItems` number; the authored-items editor neither refuses nor flags adding past
the clamp, so the authored count and the clamp drift apart silently.
**Regression test:** template-runtime stamp clamp (both authored items AND a bound list, covering
the leaking path once located) + a Designer-side guard test (adding past `maxItems` is
refused/flagged).

## [ ] B-110 — `multi-select.spec.ts` tests are not isolated: `:19` reads Opacity `80` where it expects `100`, because `:181` scrubbed it in a concurrent worker ⟨priority: medium⟩

**Repro:** (intermittent — surfaces only when the two tests overlap in time)

1. `pnpm gate:e2e` (or `pnpm exec playwright test tests/e2e/multi-select.spec.ts`) with
   `fullyParallel: true` and `workers: undefined` — 6 workers on a 12-core box.
2. `multi-select.spec.ts:19` ("grouped unit-bearing inspector; per-shape boxes …") and
   `multi-select.spec.ts:181` ("dragging a shared number field scrubs all selected live") land in
   DIFFERENT workers and run at the same time.

**Expected:** `:19` selects two fresh shapes and the shared Opacity control reads `100`.
**Actual (observed 2026-07-27, local Windows):**

```
Error: expect(locator).toHaveValue(expected) failed
  - waiting for getByTestId('multi-select-inspector').getByRole('spinbutton', { name: 'Opacity' })
    17 × locator resolved to <input … value="80" … aria-label="Opacity"/>
       - unexpected value "80"
```

**Why this is an ISOLATION defect and NOT the timeout class:** the element was present and stable
for the whole 7 s wait — the locator resolved **17 times**, every time to `value="80"`. Nothing was
late. The value was simply already wrong when the test looked, and `80` is precisely what `:181`
leaves behind when it scrubs the shared Opacity field. That is stale persisted project state
crossing a test boundary, not a correct assertion arriving after its budget.

**Why the distinction matters — do not fold this into [B-078](bugs.md):** B-078's fan-out is what SURFACES
this (two tests in one file can only overlap because `fullyParallel` puts them in different
workers), so the two travel together and were found in the same run. But they are different
defects with opposite fixes. Bounding Playwright's workers — B-078's named next lever — would make
the overlap rarer and the symptom disappear, while leaving the shared-state coupling entirely
intact: the tests would still be non-isolated, just less often caught. **A worker cap HIDES this
bug rather than fixing it**, which is exactly why it needs its own entry and its own fix.

**Not yet established (do not assume):** WHERE the shared state lives. The Designer persists project
state, and these two tests exercise the same fixture; whether they collide through the persisted
project, a shared storage key, or a module-level store has not been traced. That trace is the first
step of any fix — the remedy (per-test isolation of whatever is shared) depends on which it is.

**Env:** Windows, local (`fullyParallel: true`, `workers: undefined` → 6, `retries: 0`).
CI is far less exposed (`workers: CI ? 1 : undefined` → 1 worker, so the two tests cannot overlap),
which is why this surfaces locally — the same exposure asymmetry [B-078](bugs.md) records.
**Files:** `apps/designer/tests/e2e/multi-select.spec.ts` (`:19` and `:181`),
`apps/designer/playwright.config.ts`.
**Regression test:** the fix is itself the test — `:19` must read `100` with `:181` running
concurrently. Verify by running the file at `--workers=6` repeatedly, NOT at `--workers=1` (which
removes the overlap and would pass vacuously).

## [ ] B-127 — the VP8+alpha canvas spec fails with `PIPELINE_ERROR_DECODE` on a seek-fragile fixture ⟨priority: medium⟩

**Repro:** (intermittent — one red observed, passed on immediate re-run and in the two gate runs
before it)

1. `pnpm gate:e2e`.
2. `apps/designer/tests/e2e/video-canvas-render.spec.ts:146`.

**Expected:** the clip decodes and the canvas renders it.
**Actual:** `PipelineStatus::PIPELINE_ERROR_DECODE`.
**Env:** Designer E2E, Chrome media pipeline. Observed once in `.gate-logs/8372aa2a-…log`
(failing at log line 10600; green at 3530 and 7041 in the two preceding runs).

**Not a regression, and not touched.** The failing diff was entirely Runtime-app CSS/TSX plus a
Runtime E2E spec. `apps/designer/src` imports nothing from `apps/runtime/src/renderer/ui`, and the
Runtime suite was 32/32 green in the same run.

**Deliberately NOT filed under [[B-078]], and the distinction is the point.** `DEBT.md:1321`
groups this with the multi-select group-drag timeout, and that other half genuinely IS B-078 — a
_late_ assertion under harness contention, now recorded there as an occurrence. **This one is a
different failure mode.** B-078's every observed instance is a timeout or element-not-found: a
correct assertion arriving late because the machine is busy. `PIPELINE_ERROR_DECODE` is a Chrome
**media-pipeline decode fault** — the decoder rejected the bitstream. A longer timeout or a worker
cap would not change it.

**Why that matters more than the taxonomy:** filing a decode fault under a known-flaky banner is
how a real failure gets waved through. An intermittent red inside a shared gate already trains
people to re-run rather than read; parking a genuine decode bug there guarantees nobody reads it.

**Notes:** the fixture is named for this — the test's own wording calls the clip "seek-fragile"
and "the canvas-blank class", so a decode failure is the mode that fixture exists to probe. That
makes it a candidate to **stabilise or quarantine deliberately** (a fixture whose job is to be
fragile should not be able to redden a shared gate), rather than to "fix". Decide which before
touching it. Source: `DEBT.md:1343`.

## [ ] B-128 — the ticker separator picker lists EVERY asset, and selecting a font or a video records it as `kind: 'image'` ⟨priority: medium⟩

**Repro:**

1. Import a font and a video into a project (alongside at least one image).
2. Select a ticker element; in the Inspector set the separator mode to **image**.
3. Open the separator picker.

**Expected:** only assets that can be an image separator are offered.
**Actual:** every project asset and every shared-library asset is listed, fonts and videos
included.
**Env:** Designer Inspector, ticker element.

**MECHANISM: the picker half is MEASURED; the render half is NOT.** Stated separately on purpose.

**Measured — why the list is unfiltered, and what a selection writes.**
`apps/designer/src/renderer/features/inspector/TickerSeparatorControl.tsx:46` and `:51` map the
project assets and the shared library into options with **no filter on asset kind**:

```
...project.map((a) => `project:${a.assetId}`),
...shared.map((a) => `shared:${a.assetId}`),
```

And `pickImage` (`:65`–`:78`) writes the chosen asset with `kind: 'image'` **hardcoded**,
whatever the asset actually is. The schema agrees only in form:
`TickerImageSeparatorSchema` (`packages/shared-schema/src/elements.ts`) requires
`kind: z.literal('image')`, and `separator` is `z.union([z.string(), TickerImageSeparatorSchema])`
— **there is no non-image separator shape**. So choosing a font produces a valid-looking record
that asserts a falsehood: an `image` separator pointing at a font.

**NOT measured, and not guessed here:** what that record does at render time. The runtime resolves
`url: options.assetUrls?.[separator.assetId]` (`packages/template-runtime/src/runtime.ts:621`) and
the ticker driver lays the separator out from its **declared** `size` box rather than measuring
the image (`packages/template-runtime/src/ticker-driver.ts:48`), so the visible outcome on air has
not been established. **Establish it before fixing.**

**THE PRIOR QUESTION, and the reason a picker filter is not obviously the fix.** If selecting a
font or a video does _silently nothing_, there is a worse bug underneath and filtering the picker
hides it. The measurement above already shows the data model is being lied to — a non-image asset
is recorded as `kind: 'image'` — so a filter alone would stop _new_ bad records while leaving
**every template already authored with one** carrying an image separator that is not an image.
Any fix must say what happens to those.

**Acceptance:**

- The separator picker offers only assets that can serve as an image separator.
- A project that already carries a non-image separator is handled deliberately — repaired,
  or reported — not left asserting `kind: 'image'` over a font.
- The on-air behaviour of an existing bad record is established and recorded before the fix
  lands.

**Related:** [[D-039]] is the feature that introduced image/logo separators. Source:
`DEBT.md` sweep, external report (no `DEBT.md` line — reported directly by the owner).

## [~] B-129 — the Designer canvas background colour reaches the OUTPUT: air must stay transparent unless a real element was placed ⟨priority: high — reaches air⟩

**What:** the canvas backdrop the author sees while editing is carried into the rendered output.
Output must be **transparent** unless the author deliberately placed a large rectangle — which is
a real element, with a real entry in the scene, and behaves like one.

**Why:** a graphic that carries an opaque background onto air covers the video behind it. On a
broadcast overlay that is the difference between a lower-third and a full-frame card, and nothing
in the Designer tells the author it will happen — the editor looks the same either way.

⭐ **MECHANISM DIAGNOSED 2026-08-11** (was: _"MECHANISM NOT DIAGNOSED"_) — in progress:
`openspec/changes/designer-export-fidelity/`.

- `BackgroundControl.tsx` is an _"always-on scene background picker"_ writing `scene.background`.
- `scene-builder.ts:98` applied it to `.cg-stage` in **every** render mode, `output` included —
  and `:278` / `:900` / `:1041` did the same for a nested composition.

One field carried TWO facts — _"let me see my white text while I work"_ and _"this paints a
background on air"_ — and the render path could not tell them apart.

🔴 **AND A SECOND FINDING, which sharpens the item: the author never saw the backdrop ANYWAY.**
The D-071 authoring pasteboard pins `.cg-stage { background-color: #3d4253 !important }` plus the
broadcast checkerboard (`preview.ts:162-190`), and `!important` beats the runtime's inline style.
So the control had NO effect on the surface the author was looking at and FULL effect on air —
the exact reason _"nothing in the Designer tells the author it will happen"_. The fix is therefore
a pure removal of harm, not a trade.

**THE DECISION:** the backdrop MEANS the editor's affordance and nothing else. `background` is
renamed `editorBackdrop` on `Scene` and `Composition` (the name is the contract), a legacy
`background` key is normalized onto it **at parse time**, the renderer paints it **only in
`author` mode**, and both exporters emit it transparent via ONE shared `withoutEditorBackdrop`
helper. An authored background stays expressible as a real full-frame element, unchanged.

⚠ **NOT a schema-version bump + registry migration, and the reason is a measured finding worth
keeping:** `migrations.migrate()` has **ZERO production call sites**. Its docstring claims _"the
loader in `@cg/vcg-format` walks the registry"_ — nothing outside `@cg/shared-schema` and its own
tests imports `migrations`, and `schemaVersion: 1` is WRITTEN by `ProjectStore.ts:72` and
`pack.ts:87` and never read back. A registered migration would have been a conversion that never
runs. Parse-time normalization is the codebase's own precedent (`PlayoutSchema`) and executes on
every load path, because every load path parses.

**Fate of existing templates:** their EDITING appearance is unchanged (the legacy value survives
onto `editorBackdrop`); their ON-AIR appearance changes, which IS the fix. **No shipped template
is affected** — every `@cg/starter-templates` scene and composition already carried
`'transparent'` (verified, not assumed). The change is announced rather than silent: the control
now states it is editor-only and does not reach air.

**On `DEBT.md:1190` — that entry is NOT wrong, but its scope is narrower than it reads, and this
item must not be closed by citing it.** It states that two candidate causes for a separate defect
— an opaque authored `scene.background` painting `.cg-stage`, and the template's own `cg.css` —
"are both DEAD, and were measured dead". What was actually measured: in the **PVW-white**
reproduction, `.cg-stage` read `rgba(0, 0, 0, 0)`, **and both scenes involved were authored
`background: 'transparent'`**. That establishes the background mechanism was not the cause **of
the PVW white box**. It establishes nothing about a scene authored with a NON-transparent
background, because no such scene was in the measurement. The entry closed one question; this item
is the other one.

**Acceptance:**

- A scene whose author never placed a background element renders with a transparent output
  background.
- A deliberately placed full-frame rectangle still renders, unchanged — the fix must not make
  "author wanted a background" unexpressible.
- The editor's own backdrop is never a property of the exported scene.

**FIX SHAPE — make the wrong state unrepresentable, do NOT keep two values in sync.** "Editor
backdrop" and "authored background" are two different facts that have been collapsed into one
field. The fix separates them so a scene cannot carry an editor preference into air by
construction. Two values kept in sync is the shape that drifts, and drift here is silent and
on-air.

**DESIGN-FIRST — implementation needs an OpenSpec change before code.** It alters the scene schema
(splitting one field into two facts) and therefore the `.vcg` contract between the Designer, the
exporter and `@cg/template-runtime`. **Filed now regardless of that**, because a backlog entry
must exist before the design does — otherwise the debt waits on the design and is lost.

**MIGRATION WARNING — this changes ON-AIR behaviour for existing templates.** Every template that
today carries a non-transparent `scene.background` will render differently once the split lands:
what currently paints will stop painting unless it is converted into a real element. That
conversion must be **deliberate and announced**, not a silent side effect of the fix — an operator
whose station ident quietly turns transparent mid-programme has been handed a worse defect than
the one being fixed.

**Env:** Designer → export → CasparCG. Source: `DEBT.md:1190` (scope-limited, see above) plus the
owner's direct report.

## [ ] B-131 — `Modal.css.ts` carries a UTF-8 BOM, and it is SOURCE that goes into the build ⟨priority: low⟩

**What:** `apps/designer/src/renderer/features/shell/Modal.css.ts` begins with the three bytes
`EF BB BF`. It is a vanilla-extract stylesheet module, so it is compiled and its output reaches
emitted CSS.

**Why:** a BOM is invisible in every editor and survives every gate this repo runs. `prettier` does
not strip one and no gate step fails on one, which is precisely how seven of them accumulated
unnoticed (`P-025`). A byte nothing checks, in a file that produces build output, is the shape that
gets discovered downstream.

**MEASURED 2026-08-03 — the full remainder, so nobody re-runs the scan.** A repo-wide first-three-
byte check over every tracked file returns **five** BOMs. Two more were stripped from PRD docs
during the `DEBT.md` sweep, giving the seven that sweep recorded.

| file                                                                                   | class        | disposition        |
| -------------------------------------------------------------------------------------- | ------------ | ------------------ |
| `apps/designer/src/renderer/features/shell/Modal.css.ts`                               | **source**   | **this item**      |
| `openspec/changes/archive/2026-07-10-harden-redundancy-single-and-two-server/tasks.md` | archived doc | harmless remainder |
| `openspec/changes/archive/2026-07-10-runtime-server-settings/tasks.md`                 | archived doc | harmless remainder |
| `openspec/changes/archive/2026-07-10-surface-orphan-layers/tasks.md`                   | archived doc | harmless remainder |
| `openspec/changes/archive/2026-07-11-fix-setconfig-serve-restart/tasks.md`             | archived doc | harmless remainder |

The four archived `tasks.md` are markdown in a frozen archive — they are compiled by nothing and
rendered by tools that tolerate a BOM. They are listed so the count reconciles, **not** as owed
work.

**⚠ THE EFFECT ON EMITTED OUTPUT WAS NOT MEASURED.** This item records a byte, not a symptom. No
build was run, no emitted CSS was diffed, and no rendering fault has been observed or reported. The
`low` rating reflects that: it assumes no effect until measured, and **should be raised if the
measurement shows one**. Stating this explicitly because filing an unmeasured byte at a high
priority would be the same over-claim this repo has twice paid for.

**NOT A SWEEP ARTIFACT — the BOM is old.** It is present in **every** revision of the file:
`3ed7738` (_"Fix/style (#67)"_) and `aa0138a` (2026-07-23, D-128 Phase 2) both carry it. So this is
not one of `P-025`'s PowerShell `Set-Content` injections; it predates that class and arrived with
the file. Recorded because the natural assumption — "the sweep's tooling did this" — is wrong and
would send someone auditing the wrong commits.

**Acceptance:**

- The emitted CSS for `Modal.css.ts` is diffed with and without the BOM, and the result is recorded
  in this item — including "no difference" if that is the answer.
- The BOM is removed in a change that carries that measurement, with the Designer's own gate green.
- If the diff is non-empty, the item is re-rated and the visual effect is checked in the app before
  the change lands.

**DELIBERATELY NOT STRIPPED WHEN FILED.** A byte change to a `.css.ts` can reach emitted CSS, and a
measurement session must not make a product change it cannot gate. Stripping it here would be a
drive-by edit to shipped source inside a docs-only commit — exactly the kind of unmeasured change
that produces the next entry in this file.

**Env:** Designer, build. Source: the repo-wide BOM sweep recorded by the `DEBT.md` sweep's closing
session and left unfiled.

## [~] B-133 — the editor backdrop control writes to a field nobody renders, so changing it does nothing ⟨priority: high⟩ — fixed in `openspec/changes/designer-project-package/` (same session; a B-129 rename ripple)

**Repro:**

1. Create a project (this lands you inside `comp1` — every new project does).
2. Change the editor backdrop colour on the canvas header.

**Expected:** the authoring canvas shows the chosen colour.
**Actual:** nothing changes; the canvas stays as it was.
**Env:** Designer canvas, any project. Reported by the owner 2026-08-11.

**Mechanism — a stale STRING in a routing table.** `updateScene`
(`renderer/state/slices/document.ts`) decides whether a patch lands on the ACTIVE COMPOSITION or on
the scene ROOT by testing the key against a `docKeys` set of string literals. [[B-129]] renamed
`background` → `editorBackdrop` across the schema, the renderer, the runtime and both exporters —
and this literal stayed behind as `'background'`. So `editorBackdrop` was not recognised as a doc
key, fell through to the ROOT patch, and was written to `scene.editorBackdrop`; meanwhile the canvas
renders `editSceneOf`, which reads the ACTIVE COMPOSITION's `editorBackdrop`. **Written to one
place, read from another.**

⚠ **This also CORRECTS a conclusion recorded during B-129.** That change's `tasks.md` §5.4(a) said
the author never sees the backdrop because the D-071 pasteboard pins
`.cg-stage { background-color: #3d4253 !important }`. That is not the cause: in the pasteboard branch
neither `background-color` nor `background-image` carries `!important`, and the runtime sets the
`background` SHORTHAND inline — which beats both. The CSS was never the obstacle; the value simply
never arrived.

**Regression test:** `apps/designer/tests/editor-backdrop-routing.test.ts` — asserts the patch lands
on the active composition and that `editSceneOf` (what the canvas is handed) sees it. The fix also
adds a `satisfies` constraint so the next rename of a doc field is a BUILD ERROR at this table
rather than a control that quietly stops working.

## [~] B-134 — the editor backdrop paints in the Preview modal, which is a preview of AIR ⟨priority: medium⟩ — fixed in `openspec/changes/designer-project-package/` (same session)

**Repro:**

1. Set an editor backdrop colour.
2. Open the Preview modal.

**Expected:** the preview shows what air shows — no backdrop ([[B-129]]: the backdrop is an EDITOR
affordance that never reaches air).
**Actual:** the backdrop paints in the preview, so the preview disagrees with the export.
**Env:** Designer Preview modal. Reported by the owner 2026-08-11, immediately after [[B-133]].

**Mechanism.** B-129 gated the backdrop on `mode === 'author'`, and the Preview modal boots in
`'author'` **deliberately** — it cannot show real live video either, so a Live Source must still
paint its SMPTE bars there (D-137 §9). One flag was carrying two different questions, and the modal
is the surface where their answers differ.

**Fix.** A SECOND axis, `paintEditorBackdrop`, rather than a third `RenderMode`: the modal needs
`'author'` and "no backdrop" **simultaneously**, which no single enum value can express. Threaded on
`BuildCtx` for the same reason `mode` is — a nested composition inherits it by construction, so a
composition three levels down cannot paint a backdrop the surface above it suppressed.

**Regression test:** `packages/template-runtime/tests/editor-backdrop-surface.test.ts` — canvas
paints, preview does not, output never does, and the axis defaults to ON so no existing caller
changes meaning.

## [~] B-136 — video is NEVER visible in PVW, though CasparCG, the HTML export and the Designer preview all render it ⟨priority: high — PVW is the operator's pre-air check⟩

> **✅ FIXED — and the mechanism is now OBSERVED, not inferred.**
> `openspec/changes/video-plays-in-preview-and-pvw`. `apps/runtime/index.html` gained
> `media-src 'self' data:`; no other directive was touched.
>
> **The runtime confirmation this item asked for was obtained — programmatically, not by hand.**
> A real-Chromium E2E (`apps/runtime/tests/e2e/pvw-video.spec.ts`) put a `data:video/webm` on the
> PVW surface and recorded Chromium's own refusal, verbatim:
>
> > Loading media from `'data:video/webm;base64,…'` violates the following Content Security Policy
> > directive: `"default-src 'self'"`. **Note that 'media-src' was not explicitly set, so
> > 'default-src' is used as a fallback.** The action has been blocked.
>
> That is the exact line the item predicted DevTools would show. **Present ⇒ proved**, by this
> item's own stated test. Pre-fix the `<video>` never left `readyState 0`; post-fix it decodes and
> no violation is raised. The FINAL spec was re-run against a build with the directive removed, to
> confirm it still fails there.
>
> **The `blob:` scheme was deliberately NOT admitted**, though the Designer's policy carries it:
> nothing in `apps/runtime` creates an object URL (no `createObjectURL`, no `blob:` anywhere in
> `apps/runtime/src`), and the exporter inlines video as `data:`. Narrowest policy that covers the
> real need; the reasoning sits in a comment beside the directive.
>
> **The availability rider is CLOSED, and it gates [[D-150]]'s archive: a video asset DOES survive
> a `.cgproj` save → reopen.** Established by test, not by claim —
> `apps/designer/tests/project-package-restart.test.ts` now reopens a package into a workspace
> holding NONE of the bytes and asserts the video is still listed, still `kind: 'video'`, under a
> STABLE `assetId` (so a placed element still resolves), with byte-identical content and its D-128
> `provenance` intact. The existing restart cases covered images and fonts only, which is why the
> gap could sit open. **D-150 is therefore cleared as a cause of this bug on both axes** — it
> changed neither resolution (established from diffs when filed) nor availability (established
> here).
>
> The latent trap the rider pointed at is real and is filed separately as [[B-138]] — `preview.ts`'s
> unresolved-asset branch has an `IMG` leg only, so a missing VIDEO is silently invisible. It is not
> fixed here; see that item.

**Repro:**

1. Import a video into a project and place it on a scene.
2. Export / import the template into CG Control (the Runtime app) and put the row into REHEARSE.
3. Look at the PVW (PREVIEW) panel. Press PLAY.

**Expected:** PVW shows the video, because PVW's whole purpose is to show what air will show.
**Actual:** the video is not visible in PVW. Everything else on the scene renders. CG Control's PVW
does not show videos at all.
**Env:** CG Control (Runtime SPA) PVW. Found in live testing by the owner on the `.cgproj` build.

**🔴 THREE SURFACES RENDER IT AND ONE DOES NOT — that asymmetry IS the bug.** The same video plays
correctly in the **CasparCG output**, in the **HTML export**, and in the **Designer's** own preview.
Reported as UNCONDITIONAL: it holds for a small in-scene clip and for a full-frame background video,
and in the scene configurations where [[B-137]] does not occur.

**Why this is not cosmetic.** It does not reach air — but PVW is what an operator trusts BEFORE
taking something to air, and [runtime.md](runtime.md):2059 already states the requirement it
violates: "an operator must **never** be able to believe PVW is showing the real picture". A PVW
that silently omits an element teaches the operator to trust a picture that is not the picture.

**The Designer's PVW and CG Control's PVW are TWO separate implementations, not one shared surface**
— established from code, and the reason this is filed as ONE bug against the Runtime:

|           | Designer                                                                                                       | CG Control (Runtime)                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Surface   | canvas iframe + Preview modal (`CanvasArea.tsx:940`, `PreviewModal.tsx:402`)                                   | PVW panel (`PreviewPanel.tsx:144` → `RehearsalStage.tsx:446` → `RehearsalFrame.tsx:232`) |
| Document  | generated at runtime by `apps/designer/src/platform/preview.ts`, importing the live ESM `@cg/template-runtime` | the **already-exported single-file page**, replayed verbatim from `LibraryStore.html()`  |
| Video src | `blob:` object URLs (`assetUrlCache.ts:41`)                                                                    | a base64 `data:video/webm` URI inlined by `@cg/single-file-export`                       |

The only shared layer is `@cg/template-runtime`'s scene builder. `frameEnvironment.ts:30-47` states
outright that the Runtime SPA deliberately does not depend on it. **The Designer's preview is a
different asset path under a different CSP, and it works — so the fix belongs to the Runtime.**

**Mechanism — strongly supported by code, needs one runtime confirmation.** `apps/runtime/index.html:8`
declares a CSP with `img-src 'self' data: blob:` and `font-src 'self' data:` but **no `media-src`**,
so media falls back to `default-src 'self'` and a `data:` video is refused. `apps/designer/index.html:8`
**does** carry `media-src 'self' blob: data:`. PVW's frame is an `<iframe srcDoc>`
(`RehearsalFrame.tsx:232`), and a `srcdoc` document **inherits its embedder's CSP** — the exported
page declares its own permissive `media-src data:` (`exporter-single-file.ts:409`), but an inherited
policy is enforced IN ADDITION and the intersection wins. This predicts the reported asymmetry
exactly, including why only video fails: images, fonts and inline scripts all survive the
intersection because the Runtime CSP admits them, and **media is the only class it omits**.

The repo already knows this failure mode. `openspec/changes/archive/2026-07-27-video-import-element/design.md:265-269`
records it verbatim for the Designer: "the app CSP had no `media-src`, so `default-src 'self'`
blocked every `blob:` `<video>` — stored WebMs were byte-perfect but undecodable… srcdoc documents
INHERIT the embedding page's CSP".

**⚠️ NOT A REGRESSION — established from git, not from a build.** `git log -S"media-src" -- apps/runtime/index.html`
returns **zero commits**: that directive has never existed in the Runtime page, across all 8 commits
that file has ever had. The same pickaxe on the Designer returns `aa0138a` (D-128 Phase 2), i.e. the
Designer gained the directive at the exact moment it first needed to play video. **The Runtime was
never given the equivalent when D-128 Phase 5 taught the exporter to inline video**, so this is an
ORIGINAL GAP, not something recent work broke — there was never a working state to regress from.

**The two named suspects were diffed and both CLEAR — established from git, no build and no
worktree.** ⚠ **First, a correction to the premise:** `94be0efb` is NOT "the head prior to SESSION
D" — it **is** one of that run's own commits, the B-129 fix (`fix(schema,runtime,export): B-129 —
the canvas backdrop is an EDITOR fact…`, 2026-08-11 13:59). The true prior head is **`bd9dc57`**
(2026-08-11 14:24, docs + one comment). The window below is therefore `94be0efb..HEAD`, which is the
WIDEST honest window since it contains B-129 itself.

- **D-150 / B-104 (`8cad898`) moved asset resolution into the `.cgproj` package — the PVW asset path
  did NOT change.** That commit touches none of `preview.ts`, `assetUrlCache.ts`, `useAssets.ts`,
  `CanvasArea.tsx`, `PreviewModal.tsx`, `scene-builder.ts`, `runtime.ts`, `video-driver.ts`,
  `video-poster.ts`, or any `apps/runtime/.../monitors/` file. `AssetStore.ts`'s diff is two hunks,
  both pure additions; every pre-existing method including `bytes()` is byte-identical, and
  `assets.url` does not appear in the diff at all.
- **B-129 / B-133 / B-134 — the render MODE PVW renders through did NOT change.** In `267cf3b`'s
  `preview.ts` diff `mode: 'author'` is a **context line**, unchanged on both surfaces. B-134 added a
  SECOND boolean axis (`paintEditorBackdrop`) read at exactly four sites that do nothing but set a
  background colour. B-133 (`a3ed312`) is confined to a string table in `document.ts`.
- **Last commit to touch the PVW render path:** `267cf3b` (2026-08-11 15:46, B-134) for the preview
  host / scene builder / runtime boot; the Runtime's own PVW monitor files were last changed
  behaviourally at `f075570` (2026-07-31). The video element renderer itself last changed at
  `7379dad` (2026-07-25) and `VideoDriver` at `404558b` (2026-07-25) — all before this build.

**⚠️ ONE RIDER — the single way D-150 could still be causal WITHOUT showing in a diff.** It did not
change asset RESOLUTION, but it did change asset **AVAILABILITY** (`adoptFromPackage` replaces the
asset index wholesale), and diffs cannot say whether the video asset survives a `.cgproj`
save → reopen. That matters because of a **latent trap in unchanged code**: `preview.ts:414-448`'s
unresolved branch has an `IMG` leg **only**, so an unresolved VIDEO assetId yields a `<video>` with
no `src`, **no placeholder, no `data-cg-missing` marker and no console line** — silently invisible,
which is exactly the reported symptom. That code dates to `cb5a3ad` (2026-07-26) and is unchanged.
**One-glance runtime check: does the Project Assets panel still list the video after reopening the
`.cgproj`?** If NO, D-150 is implicated via availability rather than resolution, and the silence is
the missing VIDEO leg. Worth fixing regardless of this bug's outcome.

**⚠️ WHICH SURFACE "PVW" NAMES is worth pinning with the owner.** The literal `PREVIEW (PVW)` panel
is the **Runtime's**; the Designer's modal is titled `Preview · WxH`, not PVW. This item is filed
against the Runtime PVW on that reading, which also matches "CG Control's PVW does not show videos
at all". If the owner meant the Designer modal, the CSP mechanism does not apply (the Designer's CSP
already admits media) and the availability rider above becomes the leading candidate instead.

**A perception confound to rule out first, since it landed in the same build.** After `267cf3b`
(B-134) the Preview modal no longer paints the scene's backdrop colour — a checkerboard now sits
where a colour used to. That CANNOT make a video invisible, but "the video is not visible" and "the
area behind the video looks different now" are easy to conflate in a live test.

**Four candidates checked and dispositioned before filing** (none covers this):

- **[[B-127]] — RULED OUT.** A test-flake item about one E2E spec on the **Designer editor canvas**,
  a third surface again. That spec asserts `paused === true` — it pins an at-rest poster, never
  playback. The "canvas-blank class" its fixture probes is a CLOSED root cause (the VP8 alpha-plane
  keyframe misalignment, fixed by the poster ladder + GOP pinning — `video-poster.ts:9-13`).
- **[[B-102]] — OVERLAPS AS A CLASS, DOES NOT SHARE THE SURFACE.** It is the standing example of a
  preview/air parity break, so cite it — but its direction is INVERTED and its element kind differs:
  B-102 is _Designer preview good / CasparCG hardware bad_ on **images**; this is _CasparCG + HTML
  export good / Runtime PVW bad_ on **video**. B-102's failing surface is this bug's working one.
- **`preview-blank-until-play` (the watch item inside [[B-095]], [bugs.md](bugs.md):722) — RULED
  OUT.** It is a gate-contention flake watch about `cg-pending` never clearing, which blanks the
  WHOLE stage, all element kinds, at preview boot. Here the rest of the scene renders.
- **The PVW-white reproduction at `DEBT.md:1190` — SAME SURFACE, but NOT a re-open.** It did measure
  this surface: `.cg-stage` reading `rgba(0,0,0,0)` inside the PVW rehearsal frame
  (`RehearsalFrame.tsx:53-56`). But the defect it closed was an **opaque canvas that occluded
  EVERYTHING** — `DEBT.md:1171`: "the composite was correct and invisible". Here the rest of the
  scene is visible and only the video is missing, so the white-canvas mode has not returned. Its fix
  (`color-scheme: light`) governs canvas opacity and says nothing about `<video>`. Recorded
  explicitly so nobody closes this as "that white thing again".

**⚠️ FILING HAZARD — do not close this as by-design.** There IS a recorded decision that something
shows nothing in PVW: `openspec/changes/live-source-multibox/design.md:2029` — "v1 shows an EMPTY,
TRANSPARENT region in PVW". That covers **Live Source** (SDI/NDI) ONLY. This bug is D-128 **file
video**, which [designer.md](designer.md):3619 draws the line on explicitly. Discriminator: the HTML
export also renders through `mode: 'output'` and paints zero pixels for a Live Source, so the fact
that the HTML export SHOWS this element proves it is a real `video` element.

**Ruled out as mechanisms, so nobody re-checks them:** PVW renders **LIVE DOM, not a snapshot** —
zero hits for `toDataURL` / `html-to-image` / `drawImage` / `captureStream` in `apps/runtime/src`;
a real `<video>` is genuinely in that DOM. Render mode is not it either: `buildVideo`
(`scene-builder.ts:1209-1224`) has **no mode check at all** — no skip, no poster-only, no hide — and
`withoutEditorBackdrop` strips only the backdrop field. Nor is it CSS: the frame is
`background: transparent` with per-frame z-index from real layer order, none of it video-specific.

**Fix size: ~1 line + tests.** Add `media-src 'self' data: blob:;` to `apps/runtime/index.html:8`,
mirroring the Designer. **Why it was never caught:** `apps/runtime` has no test touching a real
`video` element — its only "video" is `type: 'video-placeholder'` (`template-delivery.test.ts:471`)
— and every CSP assertion tests the ARTIFACT's own CSP, never the embedding page's. The regression
test must assert the embedder's CSP contains `media-src` with `data:`, plus a PVW E2E.

**⚠️ NEEDS OWNER CONFIRMATION AT THE MACHINE — one minute, and it settles the mechanism.** Put a
video template into REHEARSE, open DevTools, and look for:
`Refused to load media from 'data:video/webm;base64,…' because it violates the following Content
Security Policy directive: "default-src 'self'"`. **Present ⇒ proved. Absent ⇒ the CSP mechanism is
wrong** and the next candidate is whether the `.vcg` packaged the video bytes at all (grep the
retained page for `data:video/` — though its absence would also break CasparCG, which the report
argues against). CSP inheritance into `srcdoc` is browser behaviour that cannot be executed from a
code read; the repo RELIES on it and documents it, but this session could not run it.

**Regression test:** an assertion that `apps/runtime/index.html`'s CSP admits `data:` media, plus a
PVW E2E mirroring `apps/designer/tests/e2e/video-import.spec.ts`.

## [~] B-137 — video stays PAUSED in the Designer preview after a scene rebuild, and reopening the preview is the only cure ⟨priority: high — the preview is the authoring feedback loop⟩

> **✅ FIXED — and the code-derived mechanism is now OBSERVED.**
> `openspec/changes/video-plays-in-preview-and-pvw`. Three changes, all in the fix shape this item
> specified: the video handle re-resolves its node by `data-cg-element-id` when the captured one
> reports `isConnected === false` (`runtime.ts`, host-agnostic, reusing `recover()`'s existing
> re-pointing precedent); the Lottie map a preview is handed is SCENE-SCOPED (`getForScene`),
> killing the stickiness at source; and a rejected `play()` is now reported once per element.
>
> **The mechanism reproduced exactly as diagnosed, on the first attempt.** In
> `apps/designer/tests/e2e/video-preview-rebuild.spec.ts`, pre-fix: the video plays and advances,
> then after the owner's own gesture (a ticker's `cycle seam` in the modal's session timing
> controls) it sits at `paused === true`, frozen at the IDENTICAL `currentTime`, on the ATTACHED
> node. Two independent code investigations had converged on this mechanism without ever running it;
> it is now run.
>
> ⚠️ **One correction to the reproduction recipe, worth carrying:** a rebuild returns the preview to
> its pending (blank, armed) state, because the modal is a BROADCAST surface that shows nothing
> until play. So a video sitting paused AT THAT INSTANT is correct, not the bug. **The defect is
> what happens on the NEXT play** — every other element starts and the video does not, which is
> precisely the owner's "it plays again only after CLOSING the preview". The regression test asserts
> after a second play for exactly this reason.

### 🔴 THE OPEN QUESTION IS CLOSED — reading (A) and reading (B) are BOTH DISSOLVED

**The trigger is what forces a REBUILD.** Neither "any ANIMATING element" (A) nor "only a
timeline/lifecycle DRIVER" (B) survives, and the third answer code review proposed is confirmed.

**The evidence is experiment 2, and it is now a permanent test** — `EXPERIMENT 2` in
`video-preview-rebuild.spec.ts`. A video **ALONE** on the scene: no ticker, no Lottie, no animated
companion of ANY kind. It plays and advances; a preview TIMING knob then rebuilds the scene; on the
next play it is frozen. Pre-fix that test fails on exactly that assertion, post-fix it passes.
**With no animating companion anywhere on the scene, the companion cannot have been the variable.**

Every ticker-specific and Lottie-specific detail in the original report is therefore a red herring
about the TRIGGER — they force rebuilds, which is all they ever contributed. (The Lottie remains
special in one respect, and only one: it is what made the freeze STICKY, via the module-level cache.
That is a separate half of the bug and it is fixed separately.)

⚠️ **The two hypotheses the filing session refuted STAY REFUTED — do not re-run them.** Autoplay
policy is not the cause (it is why the failure was SILENT, which the new logging addresses), and a
stepped/deterministic frame driver does not exist in this engine. Nothing found here re-opens
either. Experiments 1, 3 and 4 in the list at the end are now MOOT: 3 was the decider and experiment
2 settled the same question more directly, without needing a GIF or a second video.

**Repro** (as reported by the owner):

1. Put a video and a ticker on the scene. Open the preview.
2. Toggle the ticker's `infinite` or `cycle seam` checkbox. **→ the video pauses.**
3. It plays again only after CLOSING the preview and opening it anew.

And the sticky variant:

1. Put a video on the scene. Add a Lottie element beside it. Open the preview. **→ the video shows
   paused.**
2. REMOVE the Lottie. **→ the video is STILL paused.** The state does not come back on its own.

**Expected:** the video keeps playing across an edit, as it does before the edit.
**Actual:** it pauses, and in the Lottie case the pause is sticky — undoing the change that caused
it does not undo it.
**Env:** Designer preview. **Preview-only — the CasparCG output is CORRECT in both cases.** Found in
live testing by the owner on the `.cgproj` build.

**SCOPE — a full-frame background video has NO immunity.** Video is also used as the background of
an ENTIRE template, full frame, and the same pausing occurs there. This is NOT a lower-third /
ticker-backdrop defect and must not be worded as one. Confirmed from code: there is no
background/full-frame video concept in the schema — a background is a real full-frame element — so
every video goes through the same `buildVideo`, the same pooling and the same driver binding. A
full-frame clip fails identically, and more visibly, because it is the whole frame.

**KNOWN GOOD, and the exact limit of what it proves.** Video alone, or beside only shapes and
live-source elements, plays correctly in the preview, the CasparCG output and the HTML export (video
there is `loop` on, `driven hold = no`). ⚠ **But a "live source" in the Designer today is only a
STATIC IMAGE PLACEHOLDER** — `buildLiveSource` (`scene-builder.ts:1426-1442`) paints SMPTE bars in
author mode and nothing in output mode; real live playback has never been tested. So it is a static
element and proves nothing about motion.

**🔴 OPEN QUESTION — the evidence does not separate two readings, and this is filed UNRESOLVED.**
Every known-good companion is STATIC and every known-bad companion is TIME-DRIVEN, so the
observations are equally consistent with:

- **(A) any ANIMATING element breaks it**, or
- **(B) only a timeline/lifecycle DRIVER breaks it.**

Do not resolve this by picking a reading. **Code review proposes a third answer that would dissolve
both** — see the mechanism below: what matters may be neither animation nor driving, but simply
**what forces a scene rebuild**. Experiment 3 in the list at the end is the one that decides it.

**Mechanism — strongly supported by code, and it is NOT either hypothesis the session started with.**
The preview iframe transplants the OLD `<video>` DOM node back over the freshly built one after
every in-iframe rebuild, but nothing re-points the newly built `VideoDriver` at it. The driver ends
up commanding a detached, src-less orphan; the node the operator can SEE is the one the previous
driver explicitly paused during teardown, and no code path ever plays it again.

1. An edit posts a rebuild into the already-open preview → `applyScene` (`preview.ts:531-599`).
2. `preview.ts:552` `harvestVideos()` stores the live `<video>` into `videoPool`; `:553`
   `runtime.remove()` tears the runtime down, which reaches `video-driver.ts:292-308` →
   **`this.handle.pause()`**. The pooled node is now explicitly paused.
3. `createRuntime` builds a FRESH `<video>` and `runtime.ts:999` — `let media = v.container` — closes
   over it. Only `recover()` (`:1042`) ever re-points that variable, and only on a terminal
   `media.error`.
4. `preview.ts:401` `fresh.replaceWith(pooled)` — the DOM now shows the pooled, PAUSED node while the
   driver holds the fresh one, now detached. Worse, the src walk at `:414` uses
   `document.querySelectorAll`, so the detached node **never receives a `src` at all**.
5. Play calls `handle.play()` on that orphan; the rejection is swallowed at `runtime.ts:1002-1007`.
   No console trace, no evidence.

**Why the stickiness.** `lottieAssetCache.getAll()` (`lottieAssetCache.ts:29-33`) returns the whole
MODULE-LEVEL cache, never scene-scoped. Deleting the Lottie ELEMENT does not evict the parsed
ASSET — only `clearAll()` on project change does (`:89-92`) — so the "are there Lottie assets?"
test at `preview.ts:884` stays true and keeps forcing rebuilds for the rest of the session. **The
stickiness lives in module state, not in the engine**, which is why removing the element cannot undo
it and why reopening the preview can: a fresh document starts with an empty `videoPool`, so the
transplant branch is not taken.

**Both hypotheses this session was asked to test are REFUTED — recorded so they are not re-run:**

- **Autoplay policy: refuted as the CAUSE.** The element is created `muted = true`
  (`scene-builder.ts:1216`) with `playsinline`, no `autoplay` attribute and no `loop` attribute, and
  the rebuild path re-asserts `fresh.muted = true` (`runtime.ts:1037-1040`) precisely because an
  unmuted rebuilt element would be blocked. A muted, `playsinline` video in a same-origin `srcdoc`
  iframe is allowed to autoplay without user activation. **But it is exactly why the real failure is
  SILENT:** `play()` rejections are swallowed everywhere (`runtime.ts:1002-1007`,
  `video-driver.ts:75` — documented as intentional).
- **A stepped / deterministic frame driver: refuted — it does not exist.** There is no stepped or
  hold-driver mode in `@cg/template-runtime`, and no code advances a `<video>` by writing
  `currentTime` per frame. `video-driver.ts:10-28` states the inverse architecture outright: a
  `<video>` **advances itself** and the driver only re-anchors it. The one state where a video
  legitimately sits paused and positioned by `currentTime` is `holdBehavior: 'freeze'`, an authored
  per-element property nothing about a ticker or a Lottie can flip. And the driver set is rebuilt
  from scratch on every `createRuntime` — **not latched** — which is a second reason it cannot
  explain the stickiness.
- **The multiple-computation-sites concern was checked and is CLEAN today.** The driving-element set
  is computed in six places (`scene.ts:470-511`, `runtime.ts:269-302`, the build-time collection at
  `runtime.ts:952`/`:1070`, `playout-metadata.ts:44`, `PlayoutSection.tsx:630`,
  `PreviewScopeTiming.tsx:112`). The prior `visible === false` finding appears fixed in both
  predicates — they agree, with the opt-in/opt-out asymmetry spelled identically. **None of it is on
  this bug's path.**

**⚠️ NOT A REGRESSION — established from git, no build and no worktree.** Every file that could
produce this is untouched across `94be0efb..HEAD` (the widest honest window — see [[B-136]] for why
`94be0efb` is not the commit the report assumed): `video-driver.ts`, `ticker-driver.ts` (last
changed **2026-06-26**, roughly seven weeks before this build), `playout-controller.ts`,
`lottie-driver.ts`, `CanvasArea.tsx`, `PreviewModal.tsx`, `PreviewHost.tsx`, and the
`videoPool` / `harvestVideos` / `reconcileVideos` block in `preview.ts` (unchanged since `cb5a3ad`,
2026-07-26). D-150 / B-104 touches no preview file at all; B-133's only edit is a routing string
table; B-134's only edit is a background-colour gate. **The structure that produces this dates to
`c41bba8` (2026-07-23) and `cb5a3ad` (2026-07-26)** — it predates the `.cgproj` build the owner
found it on. The build is where it was NOTICED, not where it was introduced.

**Corroboration worth recording: two independent code investigations converged on the same
mechanism**, from different starting points (one hypothesis-testing the preview, one reading diffs
for a regression verdict), and neither was looking for the other's answer. That is why the mechanism
below is stated with confidence despite no live observation — but it is still CODE-DERIVED, and the
experiments at the end are what would make it OBSERVED.

**Related, not duplicates.** [[B-091]] (`[x]`, merged) is the nearest mechanism precedent: the
preview's `lottie-assets` handler did a full `applyScene` rebuild mid-playback with no `!playing`
guard. Its fix covered the `lottie-assets` TRIGGER only; the edit-driven triggers here are a
different entry point, and the "removing the Lottie does not restore it" stickiness is new
information present in no existing item. [[B-027]] establishes that "any edit ⇒ full runtime
rebuild" is a known standing cost; this is the first item to report that rebuild destroying media
playback state.

**Do these two bugs share a root? NO.** [[B-136]] is a Content-Security-Policy gap in a different
application (`apps/runtime`), on a different asset scheme (`data:` vs `blob:`), on a surface that
does not run this code at all — `videoPool` / `harvestVideos` / `reconcileVideos` exist ONLY in
`apps/designer/src/platform/preview.ts`. They share a subsystem (video) and a symptom class ("video
missing where it should be"), and nothing else. Fixing either does not touch the other.

**Fix size: ~20 lines in one engine file + tests.** At `runtime.ts:999`, replace the captured
`let media = v.container` with a resolver that re-queries the live node by
`data-cg-element-id` when `media.isConnected === false` — the variable is already mutable, and
`recover()` already does exactly this re-pointing on a different trigger. Host-agnostic, so it also
covers any future harness that reparents nodes. Two cheap adjacent improvements worth doing in the
same change: scope the posted Lottie map to the scene's own Lottie ids (killing the stickiness at
source), and stop swallowing the `play()` rejection blind — logging it once per element would have
surfaced this in minutes.

**⚠️ Would `live-source-multibox` phases 5–6 make this WORSE? NO — answered explicitly.** A real live
element would NOT join the timeline driver set and would NOT be ticked by the `<video>` path. A Live
Source is a `<div>` hole by construction (`scene-builder.ts:1426-1442`), never a media element;
CasparCG composites the real picture on a LOWER channel layer, so nothing enters the DOM to be
pooled. Phases 5–6 are entirely bridge-side (`caspar-runtime.ts`, `command-builder.ts`) and mention
neither `drivesHold` nor `VideoDriver`. The Designer preview will still show SMPTE bars after phase
6 — `preview.ts:559-568` says so. **A fix here does not collide with phases 5–6**: no shared file,
no shared predicate.

### ⚠️ READY-TO-RUN EXPERIMENTS — for the owner, at the machine, in minutes

These are what the code cannot settle. Run them in order; each says what its outcome means.

1. **Does a plain SHAPE rebuild the preview, and does the video survive it?** With a video playing in
   the preview, add and then remove a plain rectangle. **Video keeps playing ⇒ a shape edit does not
   reach the rebuild path**, and rebuild-on-any-edit is not the trigger — narrowing which edits
   matter. **Video pauses ⇒ the trigger is far broader than the report suggests**, and the item's
   priority should rise.
2. **The decisive one — change a preview TIMING knob with NO ticker and NO Lottie on the scene.**
   Video alone; open the preview; change any knob in the preview's own timing panel (hold ms, mode,
   scope dwell). **Video freezes ⇒ the mechanism above is confirmed**, and everything
   ticker-specific and Lottie-specific in the report is a red herring — the trigger is simply "what
   forces a rebuild". **Video keeps playing ⇒ the mechanism is incomplete** and something
   ticker/Lottie-specific is really in play.
3. **Separate "any animating element" from "timeline driver" — the open question above.** Add an
   element that ANIMATES but does NOT drive the timeline. **All three are authorable today**, so
   there is no excuse to skip this: a keyframe-animated shape, an **animated GIF** (`gif` is an
   accepted image import — `asset-types.ts:26-27`), or a **second video**. Code review PREDICTS the
   GIF and the animated shape will NOT reproduce the freeze (they force no rebuild), while a second
   video WILL (it is pooled identically). **That predicted split kills reading (A) and reading (B)
   together** and confirms the third answer. **If instead the GIF DOES freeze it, both the mechanism
   above and reading (B) are wrong**, and reading (A) survives.
4. **See the orphan directly.** With the freeze showing, in the preview iframe's console:
   `document.querySelectorAll('video[data-cg-element-id]')`. **Two nodes, one detached with no
   `src` ⇒ the transplant mechanism is visible in the DOM**, which is proof rather than inference.
5. **Settle WHICH checkbox the report means** — this one changes the diagnosis if it goes the other
   way. Code review assumes the `infinite` / `cycle seam` controls are the **preview modal's own**
   per-ticker session controls (`PreviewTimingControls.tsx:296-317`), not the Inspector's. That
   matters because the modal renders a SNAPSHOT of the scene, so an INSPECTOR edit cannot reach an
   already-open modal at all. **If the owner is certain the toggle was in the Inspector, a second,
   undiagnosed mechanism is in play** and this item needs re-opening at the diagnosis level.

**Regression test (once the mechanism is confirmed):** a Preview-**modal** E2E — play, post a scene
rebuild, play again, assert the VISIBLE `video[data-cg-element-id]` has `paused === false` and an
advancing `currentTime`. The existing coverage misses exactly this: `video-import.spec.ts:229-259`
pins the transplant, but against the **canvas** iframe, which never plays, and it asserts node
identity and `currentTime` — never `!paused` after a rebuild.

## [ ] B-138 — an unresolved VIDEO asset in the preview is SILENTLY invisible: no placeholder, no marker, no console line ⟨priority: medium — it makes a whole class of asset failure undiagnosable⟩

**Repro (constructed — this is a latent trap, not a reported field failure):**

1. Place a video element on a scene.
2. Put the preview in a state where that `assetId` does not resolve to a URL — the asset is missing,
   or simply not yet primed at the moment the preview walks the tree.
3. Look at the preview, and at the console.

**Expected:** the same treatment an unresolved IMAGE gets — a visible placeholder and a
`data-cg-missing` marker — or, failing that, SOME evidence that an asset did not resolve.
**Actual:** a `<video>` with no `src`. Nothing is painted, nothing is marked, nothing is logged. The
element is indistinguishable from one that was never placed.

**Mechanism — exact, and confined to one branch.** In `apps/designer/src/platform/preview.ts`, the
asset walk in `applyAssetUrls()` ends:

```js
} else if (tag === 'IMG' && node.getAttribute('data-cg-missing') !== '1') {
  node.src = MISSING_IMG;
  node.setAttribute('data-cg-missing', '1');
}
```

The unresolved leg tests `tag === 'IMG'`. The walk itself admits BOTH kinds a few lines above
(`if (tag !== 'IMG' && tag !== 'VIDEO') return;`), so a VIDEO reaches this branch and falls straight
out of it. The resolved leg handles VIDEO properly; only the UNRESOLVED leg is image-only. Dates to
`cb5a3ad` (2026-07-26) and is unchanged since.

**Why it is worth its own item.** It is a DIAGNOSABILITY defect, and its cost is paid by other bugs:
"the video is not visible" is exactly what [[B-136]] reported, and this branch is the reason such a
report cannot be told apart from a CSP refusal, a missing asset, or a packaging failure without
attaching a debugger. [[B-136]] named it as the leading alternative candidate precisely because it
produces an identical symptom through a completely different cause.

**⚠️ It is NOT what caused [[B-136]], and that is now settled rather than assumed.** B-136's
mechanism was proved directly (Chromium's own CSP refusal, captured verbatim), and the availability
question that would have implicated this path — does a video survive a `.cgproj` reopen? — was
answered YES by test. So this is a trap that has not yet sprung, filed before it does.

**Why it was NOT fixed in the session that found it** (session I, which fixed B-136 and B-137), even
though a fix was authorised if it stayed confined. It did not meet the bar, on two counts:

- **It needs a product decision that is the owner's, not the implementer's:** what should a missing
  VIDEO actually SHOW? `MISSING_IMG` is an image data URI and cannot be a `<video>`'s `src`. The
  options — a poster frame, a CSS background, an overlaid box, or marker-and-log only with no visual
  at all — are a design call. Shipping marker-and-log alone would half-close the item and make the
  remaining half harder to see.
- **Its test cannot be a unit test.** This code lives inside the generated `<script>` string that
  `#buildHtml` emits, so covering it honestly means another Designer E2E — more than "confined to
  that one branch, with its own test".

**Fix shape when taken:** decide the visual treatment, then extend the unresolved leg to VIDEO —
setting `data-cg-missing="1"` and logging once per element (the once-per-element discipline [[B-137]]
established for `play()` rejections applies here for the same reason: this walk re-runs on DOM
mutations). An E2E asserting the marker appears on a video whose assetId resolves to nothing.

**Related:** [[B-136]] (the identical symptom from a different cause, and the item that surfaced
this), [[B-137]] (the once-per-element logging precedent).

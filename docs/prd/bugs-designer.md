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

## [~] B-088 — a start-trimmed element ignores its in-point during play: the whole intro is ONE painted frame ⟨priority: high⟩ — branch: `fix/b088-collapsed-intro-lifespan`; focused fix, no change dir

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

## [~] B-089 — nested-instance element lifespans are never gated at all ⟨priority: medium⟩

**Repro:**

1. Build a composition containing an element trimmed to `lifespan = [33, 60]`.
2. Place that composition as a nested composition INSTANCE inside another composition.
3. Preview → Play the parent.

**Expected:** the nested element honours its trim, as it does when the same composition is previewed directly.
**Actual:** the trim is ignored entirely — the element is visible for the whole lifespan of the instance.
**Env:** Browser / Designer preview; also the exported outputs.
**Notes:** `collectLifespanGates` (`packages/template-runtime/src/runtime.ts:1579`) walks only `scene.layers` and resolves ids against the ROOT `built.elementMap`; every composition instance owns its own `elementMap`, so nested elements are unreachable and never enter the gate list. The per-frame application is likewise root-only (`if (isGlobalRoot) applyLifespanGatesAtFrame(frame)`, `runtime.ts:969`). Its `el.type === 'container'` recursion branch is **effectively dead** as well: `container` is built by `buildPlaceholder`, which builds no children, so container children never enter any `elementMap` either. Distinct from B-088 (which is about how OFTEN the gate runs); this is about WHICH elements it covers. Do not fold the two — B-088's fix deliberately leaves nested scopes' collapse behaviour untouched.

**In progress** — branch `fix/b089-nested-lifespan-gates`.

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

## [~] B-090 — trimming a NESTED element silently does nothing ⟨priority: medium⟩

**Repro:**

1. Put an element inside a container.
2. In the timeline, drag that element's trim gripper.

**Expected (as filed):** either the trim applies, or the gripper is not offered.
**RESOLVED AS:** the gripper is **not offered** — the affordance was removed, not made to write. See the Fix
below for why the write-path branch was rejected on the evidence.
**Actual (before the fix):** nothing happens — no trim, no error, no visual feedback. The gripper is rendered and drags, then the value is discarded.
**Env:** Browser / Designer timeline.
**Notes:** The timeline renders rows for everything `flattenElements` returns, and it DOES recurse into containers — but `updateElementLifespan` resolves the target through `locate()` (`apps/designer/src/renderer/state/scene-doc.ts:182`), which searches only top-level `layer.children` via `findIndex` with no recursion, returns `null`, and the mutation early-returns (`slices/elements.ts`). So the UI offers an affordance the state layer cannot honour. Note this is a WRITE-path gap and is independent of B-089 (a READ/gating gap) — an element inside a container would still not be gated even if the trim did persist.

**In progress** — branch `fix/b090-container-child-rows`.

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

## [~] B-091 — the preview's `lottie-assets` handler rebuilds the scene mid-playback ⟨priority: low⟩ — branch `feat/D-125-phase3b1-ui-polish` (D-125 Phase 3b-1)

**Repro:** with a composition containing a Lottie playing in the preview, have a `lottie-assets` message arrive (e.g. an asset import completing during playback).

**Expected:** the live graphic is left alone while playing, as the `update` handler already guarantees.
**Actual:** the runtime is torn down and rebuilt underneath the playing graphic.
**Env:** Browser / Designer preview.
**Notes:** `apps/designer/src/platform/preview.ts:730` — the `lottie-assets` branch does `lottieAssets = msg.lottieAssets; if (currentScene && …) { await applyScene(currentScene); }`, a full rebuild with **no `!playing` guard**, unlike the `update` handler ~13 lines below (`if (runtime && !playing) runtime.tick(currentFrame)`). Introduced by D-125 (Phase 1). **Not causal for B-088** — it cannot produce that symptom, and B-088 reproduces with no Lottie at all — but it is a real latent teardown. Candidate for D-125 Phase 3.

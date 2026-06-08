# Bugs — backlog

Bug reports. Unlike features, every bug needs a **repro** — that's what lets
Claude reproduce, fix, and add a regression test. See `README.md` for IDs and
statuses.

## Bug format

Copy this block per bug (use `B-` IDs):

```md
## [~] B-001 — panels position and design ⟨priority: high⟩ — folded into `openspec/changes/add-animation-timeline-dock/`

**Repro:**

1. فونتها و تکستها درشت هستن
2. بعضی مقادیر و آیکونها در پنل پراپرتی وجود ندارند
   **Expected:** دقیقا مثل تصاویر که در تسک D-006 به آنها اشاره شده کل پنلها و دیزاین پیاده سازی شود
   **Actual:** all pics are related to D-006: `docs/designer-guide/sample-assets/D-006-pic-*`
   **Env:** Browser + app (e.g. Chrome / Designer dev) — and whether it reproduces
   in the latest `main`.
   **Notes:** check this website https://app.loopic.io/studio and crawl and see all the codes, i have got those screenshots from this website

## [~] B-002 — point frames action ⟨priority: high⟩ — folded into `openspec/changes/add-animation-timeline-dock/`

**Repro:**

1. درست کار نکردن پوینتها
2. عدم نمایش پراپرتی درست مربوط به پوینتها
   **Expected:**
   وقتی روی یک پوینت کلیک میکنیم باید در قسمت لایه ها هم رنگ آیکون پوینت در لایه مربوطه زرد شود و همچنین در بخش پراپرتی یعنی پنل سمت راست باید آیکون پونت وجود داشته باشه
   دقیقا مثل تصاویر قرار داده شده
   چیزی که الان نمایش داده میشه زمانی که روی پوینتها کلیک میکنیم مناسب زمانیست که دابل کلیک کنیم نه کلیک

برای هر پوینت باید مقدار متفاوت وجود داشته باشه یعنی اگر در لایه positionx 3 تا پوینت داریم هر کدوم باید بتونن مقادیر متفاوت داشته باشن
**Actual:** What happens instead (error text / screenshot path if any).
**Env:**  
**Notes:** تصاویر مربوط به تسک D-006 رو با دقت بسیار بسیار بالا بررسی کن

## [~] B-003 — point frames style ⟨priority: high⟩ — focused fix

**Repro:**

1. framepoint color style is wrong

**Expected:**
❯
A- We have 2 states of a framepoint on properties area on right panel and on the left of the timeline area:
1- Empty: if a point exist or not it just shows an empty point.
2- Index is exactly on the same frame with a point: point on properties areas must be yellow.

B- We have 2 states of a framepoint on the timeline area:
1- all framepoints are yellow.
2- A point is selected: use a blue border around the selected point and also the line after that.

just use a curve tiny line on the line between framepoints not a "f" letter.

**Actual:**
**Env:**  
**Notes:** see screenshots in: `docs/designer-guide/sample-assets/B-003-pic-*`

## [x] B-004 — rotation style ⟨priority: high⟩

**Repro:**

1. when change the rotaion of a shape or text the transition border and handle wont be changed position.

**Expected:**
work correctly

**Actual:**
**Env:**  
**Notes:** see screenshots in: `docs/designer-guide/sample-assets/B-004-pic-0`
```

Claude's loop for a bug (per `README.md` processing contract): reproduce →
diagnose → fix → **add a regression test** that fails before and passes after →
green gate → commit. Track it as an OpenSpec change only if the fix changes
spec-level behavior; otherwise a focused fix + test is enough (note that in the
proposal/commit).

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

**Expected:** binding the same field to the same target is idempotent — no duplicate is added (e.g. one "text on Text" binding, not five). Binding the field to a *different* element/target is still allowed.
**Actual:** each activation+click added another identical binding, stacking duplicates (5× "text on Text" for one field).
**Env:** Browser / Designer dev; reproduces on `main` (preview branch).
**Notes:** Two requirements: (a) one activation = one bind — `CanvasOverlay` already exits bind mode (`setBindMode(null)`) after a click, verified; (b) the missing guard — `designerStore.addBinding` now **dedupes**: it no-ops when a binding with the same `fieldId` AND structurally-equal `target` already exists (helper `sameBindingTarget`). Same field → a *different* target (other element, or same element different property) is still added. Store-level guard protects every caller. Regression test: `apps/designer/tests/fields-and-bindings.test.ts` ("B-008 …"). Spec note: the `designer-dynamic-fields` living spec is absent from the working tree (the `add-dynamic-text-fields` change is deleted), so there is no present spec to add a scenario to — the regression test is the executable spec for this fix.

<!-- Add new open bugs above this line using the format. Example:

## [ ] B-001 — Export blocked dialog shows wrong error count
**Repro:**
1. Open a scene with 2 unbound required fields
2. Click Export
**Expected:** "Export blocked: 2 validation errors"
**Actual:** Shows "1 error"
**Env:** Chrome / Designer dev, reproduces on main
**Notes:** apps/designer/src/renderer/features/status/StatusBar.tsx

-->

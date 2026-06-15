# Bugs — backlog

Bug reports. Unlike features, every bug needs a **repro** — that's what lets
Claude reproduce, fix, and add a regression test. See `README.md` for IDs and
statuses.

## Bug format

Copy this block per bug (use `B-` IDs):

```md
## [x] B-001 — panels position and design ⟨priority: high⟩ — folded into `openspec/changes/archive/2026-06-15-add-animation-timeline-dock/`

**Repro:**

1. فونتها و تکستها درشت هستن
2. بعضی مقادیر و آیکونها در پنل پراپرتی وجود ندارند
   **Expected:** دقیقا مثل تصاویر که در تسک D-006 به آنها اشاره شده کل پنلها و دیزاین پیاده سازی شود
   **Actual:** all pics are related to D-006: `docs/designer-guide/sample-assets/D-006-pic-*`
   **Env:** Browser + app (e.g. Chrome / Designer dev) — and whether it reproduces
   in the latest `main`.
   **Notes:** check this website https://app.loopic.io/studio and crawl and see all the codes, i have got those screenshots from this website

## [x] B-002 — point frames action ⟨priority: high⟩ — folded into `openspec/changes/archive/2026-06-15-add-animation-timeline-dock/`

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

## [x] B-012 — CI: soak-runner "Reconciler is not a constructor" (typecheck-emit race) ⟨priority: low⟩

**Repro:** nondeterministic in CI (raced twice on PR #79: runs `27288006490`
@ `6c7c00c` and `27288386408` attempt 1 @ `ee4401c`); identical reruns passed.

1. `Lint•Typecheck•Test•Build` failed in `@cg/soak-runner`
   `tests/harness.test.ts` — 7/9 tests with `TypeError: Reconciler is not a
constructor` (the `@cg/caspar-client` import resolved to undefined).

**Expected:** soak-runner's vitest always sees a fully-built
`caspar-client/dist`.
**Actual — root cause (diagnosed, fixed):** NOT an API drift and NOT a one-off:
soak-runner type-checks and passes 9/9 against current `@cg/caspar-client`
built from a fully clean tree. The real bug: lib packages used
`typecheck: tsc -b`, which **emits `dist/`** — the same files `build` emits —
while turbo's `typecheck` task declared only `*.tsbuildinfo` outputs and had
**no edge to the package's own `build`** (both depend only on `^build`), so
`X#typecheck` and `X#build` ran two concurrent `tsc -b` over the same
`dist/` + `tsconfig.tsbuildinfo`. Turbo snapshotted `caspar-client#build`
outputs while the sibling typecheck `tsc` was still writing → torn dist in the
cache artifact → restored on cache hit in the Test step (the
"`@cg/caspar-client:build` output inside the Test step" was cache-hit log
replay accompanying that restore) → vitest imported a half-written dist →
`Reconciler` undefined. Reruns passed because the failed job skipped its
"Post Cache Turbo" upload, so the poisoned artifact never left the runner.
**Env:** GitHub Actions; widest race window on broad cache invalidation
(schema change → many packages rebuilding concurrently).
**Notes:** FIXED — `fix/turbo-typecheck-emit-race`: every `typecheck`
script is now plain-mode `tsc --noEmit` with a private
`--tsBuildInfoFile typecheck.tsbuildinfo` (pure reader; build mode is out:
`tsc -b --noEmit` TS6310-fails whenever a referenced project is out of date,
and otherwise writes tsbuildinfo across the whole reference closure — other
packages' build state). Turbo's `typecheck` task declares `outputs: []` so no
stale state is ever restored over a build's coherent dist+tsbuildinfo pair,
and the `build` task's outputs exclude `typecheck.tsbuildinfo` so build
artifacts stay deterministic.
Regression pin: `tools/soak-runner/tests/typecheck-no-emit.test.ts` (fails if
any workspace typecheck script can emit, or turbo typecheck regrows outputs).
Also fixed alongside: `@cg/template-fixtures#build` turbo outputs/inputs (CI
warned "no output files found"; outputs go to repo-root `fixtures/templates/**`
and its real inputs are `build.mjs` + `*.scene.mjs`, so cache hits never
restored the fixtures and scene edits didn't bust the cache).

## [ ] B-013 — `clean` scripts fail on Windows (rimraf 6 + unexpanded glob) ⟨priority: low⟩

**Repro:**

1. On Windows, run `pnpm --filter @cg/audit clean` (or `pnpm turbo run clean`).

**Expected:** `dist` and `*.tsbuildinfo` removed in every package.
**Actual:** rimraf 6 receives the literal `*.tsbuildinfo` (no shell glob
expansion on Windows) and exits 1 before deleting anything, so
`pnpm turbo run clean` aborts mid-graph. POSIX shells expand the glob first, so
CI/dev on Linux/macOS is unaffected.
**Env:** Windows only; all packages with `clean: rimraf dist *.tsbuildinfo`.
**Notes:** Fix is mechanical: `rimraf --glob dist "*.tsbuildinfo"` in every
package's clean script. Surfaced while reproducing B-012 from a clean tree.

## [x] B-014 — Switching a keyframed colour fill to gradient leaves an orphaned, still-applied colour track ⟨priority: high⟩

**Repro:**

1. Select a shape; give its `fill.color` (solid) a couple of keyframes so the colour animates.
2. In the inspector switch the fill from **solid** to **gradient** (or linear).

**Expected:** switching to a fill mode that is NOT keyframe-able removes the colour keyframes for that property (one undo step); the gradient renders statically and is freely editable; no colour animation remains.
**Actual:** the diamond correctly disappears (D-051: gradient isn't keyframe-able), BUT the previous colour keyframes are NOT removed — they stay on the track and the runtime KEEPS animating the colour, while the gradient colour can't be edited; switching back to solid reveals the keyframes were never gone, just hidden. UI says "not keyframe-able" while the data + playout engine still animate it — an inconsistent half-state.
**Env:** Browser / Designer dev; reproduces on `main` after D-051. PRE-EXISTING (the orphaned track predates D-051; D-051 only corrected the diamond's visibility, which exposed the contradiction). Affects every colour property with a solid↔gradient distinction — `fill` on shapes AND `text.color` / `backgroundColor` on text (same keyframeable-iff-solid rule from D-051's registry).
**Notes:** Decision (owner): **Option A** — switching to a non-keyframe-able fill/colour mode DELETES that property's keyframes, as ONE undo step (so an accidental switch is recoverable via undo). Fix where the fill/colour MODE is changed (the inspector's solid→gradient switch handler — likely in `FillPopover.tsx` / the colour-field commit path): when the new mode makes the property non-keyframe-able, remove that property's keyframe track in the same store transaction. Use D-051's registry predicate (`keyframeable(el)` — the gradient ⇒ false rule already exists) as the SINGLE source for "is this still keyframe-able", so the delete triggers exactly when the diamond would disappear — no parallel condition. Cover ALL solid↔gradient colour properties (shape `fill`, text `text.color` + `backgroundColor`), not just shape fill. Regression test: keyframe a solid fill → switch to gradient → assert the colour track is gone, the runtime no longer animates the colour, and one undo restores both the solid mode and its keyframes; parametrize over shape-fill + text-colour. (Confirm during repro that the runtime currently DOES still apply the orphaned track — i.e. the colour visibly animates after the switch — and that the value also stops being editable; if the observed symptom differs, report before fixing.) **DONE** — fixed on `main` (PR #97, `10cf6c8`: `clearOrphanColourTrack` in `fill-commit.ts`). No OpenSpec change; the regression tests are B-014's spec — `apps/designer/tests/fill-commit.test.ts` (unit, parametrized over shape-fill + text-colour) and `apps/designer/tests/e2e/regressions.spec.ts` (E2E).

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

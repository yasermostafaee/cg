# Designer — backlog

Features for the visual editor (`apps/designer`). See `README.md` for the
format and how Claude processes these.

## [ ] D-001 — Image / asset import UI ⟨priority: high⟩

**What:** A visible "Import image" affordance in the Designer that lets the
operator pick a file, store it, and place it on the canvas as an image element.
**Why:** `AssetStore` and the `assets.import` bridge method already exist, but
the renderer has no button, so images can't be added at all today.
**Acceptance:**

- WHEN the operator clicks "Import image" and picks a file THEN the asset is
  stored in the workspace and appears in the asset list
- WHEN an imported asset is placed THEN an image element referencing it is added
  to the scene and selected
- WHEN the scene is previewed or exported THEN the image renders (asset bytes
  inlined as a data URL in preview; bundled into the `.vcg` on export)
  **Notes:** `AssetStore.importFile` + `bridge.assets.import` exist; preview
  currently skips assets — inline imported bytes as data URLs in
  `src/platform/preview.ts`.

## [ ] D-002 — Connect a real on-disk folder (File System Access) ⟨priority: medium⟩

**What:** A "Connect folder" control + an indicator of the active storage
backend (folder / OPFS / memory).
**Why:** `workspace.connectDirectory()` (File System Access) exists but isn't
surfaced; operators can't choose a real library folder.
**Acceptance:**

- WHEN the operator clicks "Connect folder" THEN the browser folder picker opens
  and the chosen folder becomes the project library (remembered next session)
- WHEN no folder is connected THEN the UI shows the current backend (OPFS or memory)
  **Notes:** `connectDirectory()` + handle persistence already in `@cg/storage`.

## [ ] D-003 — Replace window.prompt save/export with real dialogs ⟨priority: medium⟩

**What:** Replace the `window.prompt` flows for Save-As and Export with proper
in-app dialogs (and `showSaveFilePicker` where available).
**Why:** `StatusBar` uses `window.prompt` for the save path and the `.vcg`
output name — crude and easy to mis-enter.
**Acceptance:**

- WHEN the operator saves a new project THEN a dialog collects the name/location
  (no `window.prompt`)
- WHEN the operator exports THEN the `.vcg` downloads with a sensible default
  filename and no prompt
  **Notes:** `apps/designer/src/renderer/features/status/StatusBar.tsx`.

## [ ] D-004 — Preview font + asset fidelity ⟨priority: medium⟩

**What:** Make the live preview match the exported `.vcg` for fonts and assets.
**Why:** The Blob-URL preview inlines the scene but not fonts/assets, so Persian
shaping and images may differ from what the Runtime plays.
**Acceptance:**

- WHEN a scene uses a bundled font THEN the preview renders with that font (not a
  fallback)
- WHEN a scene has image elements THEN the preview shows them
  **Notes:** depends on D-001 for assets; relates to P-001 (offline fonts).

## [ ] D-005 — Elliptical hit-testing for shapes ⟨priority: low⟩

**What:** Select ellipses by their actual elliptical area, not the bounding box.
**Why:** Known limitation from the ellipse change — clicking a bbox corner
outside the ellipse still selects it.
**Acceptance:**

- WHEN the operator clicks inside an ellipse THEN it selects
- WHEN the operator clicks a bbox corner outside the ellipse outline THEN it does
  not select (selects whatever is actually under the cursor)
  **Notes:** `features/canvas/hit-test.ts`. Modifies the `designer-shapes`
  capability (`## MODIFIED Requirements`).

## [~] D-006 — ⟨priority: high⟩ — change: `openspec/changes/add-animation-timeline-dock/`

**What:** add layers with framepoint for any shape to make animate
**Why:** I need to make animate by all shaped and this is the main role of this app.
**Acceptance:**

- باید برای هر shape که به صفحه اضافه میکنیم چند لایه از قبیل width, height, positionX, positionY, scaleX, scaleY, rotation, opacity اضافه شود و برای هر لایه بتوانیم روی هر فریم یک پوینت اضافه کنیم و در آن پوینت بشه مقادیر هر لایه را تغییر داد
  برای این کار چند تصویر از یک نرم افزار دیگه قرار میدم که میتونی ایده بگیری ازش
  ابتدای تایملاین یعنی فریم 0 باید بعد از محل قرارگیری لایه ها باشد نه قبل از اونها.
  وقتی روی یک پونت کلیک کرده ایم و زرد رنگ هست اگر مثلا positionx را در آن پوینت تغییر دادیم و پوینتهای دیگری هم داشتیم فقط پوینتی که روی آن قرار داریم باید موقعیتش تقییر کند و موقعیت سایر پونتها ثابت میمونه که این باعث ایجاد انیمیشن میشه.
  هم با زدن آیکون پوینت کنار نام لایه ها میتوان پوینت اضافه کرد هم اگر حداقل یک پوینت در یک لایه از قبل داشتیم و روی فریمی غیر از فریم مربوط به آن پوینت بودیم اگر تغییری مربوط به همان لایه داشتیم مثلا ابتدا در لایه positionx به صورت دستی یعنی با کلیک روی آیکون پوینت کلیک میکنیم و پوینت در محل قرارگیری ایندکس در فریم مربوطه اضافه میشود سپس اگر ایندکس جابجا شده بود و روی فریم دیگری قرار داشت حالا اگر shape مربوطه را درگ کردیم و positionx اون تغییر کرد باید اتوماتیک یک پوینت با مقدار پوزیشن جدید در فریم مربوطه اضافه بشه. این یک مثال بود و برای بقیه لایه ها هم همچین چیزی صادق هست.
  تصاویر نمونه رو که گذاشتم رو بسیار با دقت بالا بررسی کن و نحوه قرارگیری تایملاین در کنار لایه ها و همچنین پنل سمت راست که شامل پراپرتیهای هر shape و یا هر point هست بسته به اینکه چه چیزی انتخاب شده رو با تمام جزییاتشون در نظر بگیر و پیاده سازی کن.
  حتی چینش آیکونها و دکمه ها و حتی تعدادشون به شدت مهم هست ممکنه که در فازهایی که قبلا تعریف کردیم اینها نباشه ولی اینها به شدت مهم هستن و میتونی حتی به فازهایی که از قبل بودن اضافه شون کنی یا فازهای جدید در نظر بگیری انتخابش با خودت.
  کدهای قدیمی هم که قرار دادم برای گرفتن ایده خیلی دقیق بررسی کن برای پیاده کردن انیمیشن و افزودن پوینتها تقریبا خیلی خوب کار میکنن

**Notes:** see these pics: `docs/designer-guide/sample-assets/D-006-pic-*`

see the files inside the: `docs/designer-guide/sample-assets/D-006-old-codes`. these codes had been written by meself for this a few mounths ago but they are uncompele and raw, you can just see them to get an idea and know whay I whant for frame points

## [~] D-007 — redesign style and elements (priority: high) — change: `openspec/changes/redesign-studio-loopic-style/`

**What:** change the style like a sample website
**Why:** this website is perfect and finaly we need an app like that with whole the features
**Acceptance:**

- At first page we have the same page. user can select a Demo(sample) project or new project.
- if select a new project show the modal to select size and fps.
- after that we show the studio page.
- you must change all the elements, panels and menu like that webapp.
- we need certeinly the all features like as zoomIn zoomOut the sceen by icons and hold ctrl+mouse scroll also scroll the sceen.
- move tools bar to top of the sceen like the webapp (cursor, rectangle, text, ellipse, hand, image)
- add right click for remove the points.
- and any features you see inside the video.
  **Notes:** see the video: `docs/designer-guide/sample-assets/D-007-video-0`

## [~] D-008 — redesign and reorder style and elements (priority: high) — focused fix, no openspec change

**What:** change the position of sceen tools
**Why:** it gets extra space
**Acceptance:**

- for top navbar just put this menu: Home(current it shows as projects), File, Edit, View, Help (we use options for these later)
- on the top of sceen : put zoomIn, zoomOut, percent, +, - , fit on the right side. and shape tools on the left side.
- remove color picker from on top of sceen area. it is also exist in sceen properties area and it's enough
  **Notes:** see the pic: `docs/designer-guide/sample-assets/D-008-pic-0`

## [~] D-009 — redesign and reorder style and elements (priority: high) — focused fix

**What:** add other properties for shapes and text
**Why:** we need more properties for make a usefull animation
**Acceptance:**

- see deeply the screenshots and add all new properties and styles.
- add a line between framepoints like the screenshots.
- show the empty point icon for any layer.
- inside the properties area on the right we need separeted point icons for positionX and positionY, width and height, scaleX and scaleY like the screenshots `D-009-pic-2`.
- **Notes:** see all the pics for D-009: `docs/designer-guide/sample-assets/D-009-pic-*`

## [~] D-010 — add new properties (priority: high)

**What:** add other properties for shapes and text on 2 areas: right area and the area on the left of the timeline.
**Why:** we need more properties for make an usefull animation
**Acceptance:**

- see deeply the screenshots and add all new properties and styles.
  1- add Path style, Border radius, Drop Shadow and Filter sections for the shapes.
  2- add Text, Drop Shadow, Text Padding, Border radius and Filter sections for the text.
  **Notes:** see these pics : `docs/designer-guide/sample-assets/D-010-pic-*`

## [~] D-011 — project assets (priority: high)

**What:** add new panel for project assets
**Why:** we need this panel to add our resourses like fonts or images for use them inside the project
**Acceptance:**

- add the panel to the left of the sceen panel
- keep the buttons and tools above of the sceen on its panel(sceen panel).
- we can add fonts and images by click on the add icon
- we can drag the images on the assets panel to the sceen and they became like a shape and we can add any points for them.
- if we add any font to assets we can see that font inside the select options font on Text section in properties panel on the right
  **Notes:** see this screenshot : `docs/designer-guide/sample-assets/D-011-pic-0`

## [x] D-012 — Scene active region (resizable play window, total stays) ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-03-add-scene-active-region/`

**What:** Dragging the timeline scene bar's right gripper resizes a separate
**active region** (the play / export / preview window) instead of the scene's
total frame count. The ruler keeps its full frame count and the trailing
"remaining" frames stay visible but inactive.
**Why:** Today the scene bar's gripper rewrites `scene.frameRange.out`, which
also drives the ruler/grid/playhead — so resizing instantly shrinks the whole
timeline and the remaining frames vanish. Loopic (reference video) keeps the
total fixed while editing and only narrows the played/exported window.
**Acceptance:**

- WHEN the operator drags the scene bar's right gripper to a shorter frame THEN
  the active region's out-point shrinks but the ruler keeps the full total
  frame count and the trailing frames stay visible (dimmed / inactive)
- WHEN the operator is dragging the gripper THEN the scene's total frame count
  (`frameRange.out`) is not mutated
- WHEN the operator plays or steps THEN the playhead loops within the active
  region, not the full total
- WHEN the scene is exported or previewed THEN only the active-region frames are
  produced
- WHEN the active region is shorter than the total THEN keyframes that sit
  beyond the active out-point stay visible on their tracks but are ignored by
  play / export / preview (kept-but-inactive)
- WHEN the operator changes the Inspector Duration field THEN the total frame
  count changes and the active region is clamped to stay within the new total
  **Notes:** reference video `c:\Users\yaser\OneDrive\Desktop\timeline.mp4`
  (Loopic). Root cause in `TimelineDock.tsx` (`startSceneResize` →
  `setSceneDurationFrames`) + the single `scene.frameRange` doing double duty.
  Add `scene.activeRange` to `@cg/shared-schema`; repoint runtime/export/preview
  play range (`template-runtime/src/runtime.ts:62`) to the active region.

## [x] D-013 — Layer right-click context menu ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-03-add-layer-context-menu/`

**What:** Right-clicking a layer (element row) in the timeline opens a context
menu with: **Color** (palette submenu), **Fit workspace**, **Copy**, **Cut**,
**Paste**, **Duplicate**, **Delete**. ("Move to nested composition" is deferred
until nested compositions exist.)
**Why:** Operators need quick per-layer actions without hunting through panels;
matches the reference tool's layer menu.
**Acceptance:**

- WHEN the operator right-clicks a layer row THEN a context menu opens at the
  cursor with Color ▶, Fit workspace, Copy, Cut, Paste, Duplicate, Delete
- WHEN the operator hovers Color and picks a swatch THEN that layer's timeline
  lifespan bar takes the chosen color (persisted on the element)
- WHEN the operator clicks Fit workspace THEN the layer's lifespan is set to span
  the scene's active region
- WHEN the operator clicks Copy/Cut then Paste THEN a fresh clone (new ids) is
  inserted into the timeline; Cut also removes the original; Paste is disabled
  with an empty clipboard
- WHEN the operator clicks Duplicate THEN a clone is inserted right after the
  original in the same layer and selected
- WHEN the operator clicks Delete THEN the layer is removed
- WHEN the operator clicks outside the menu or presses Escape THEN it closes
  **Notes:** see `c:\Users\yaser\OneDrive\Desktop\tc.png`. Scribbled-out items in
  the screenshot are intentionally excluded. Adds `timelineColor` to the element
  base schema; reuses the existing `removeElement` and clipboard-clone helpers.

## [x] D-014 — Stackable keyframes (drag a point onto another keeps both) ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-03-add-stacked-keyframes/`

**What:** Dragging a framepoint onto (or past) another no longer deletes the
other — both are kept on the same frame, and points can be stacked further.
Two points on one frame with different values form an instant "step".
**Why:** Today `moveKeyframe` overwrites the destination (and run-over delete),
losing data; the operator wants to pile points on a frame and pull them apart
again.
**Acceptance:**

- WHEN a point is dragged onto a frame that already has one THEN both points
  remain on that frame (neither is deleted)
- WHEN more points are dragged onto the same frame THEN they all stack
- WHEN a stacked point is dragged off THEN it leaves and the others stay
- WHEN a track has two points on the same frame with different values THEN the
  runtime renders an instant jump at that frame (no crash / no NaN)
- WHEN a scene authored before this change is loaded THEN it still validates and
  plays (keyframe ids are assigned on load)
  **Notes:** adds an optional stable `id` to `KeyframeSchema`; timeline drag uses
  a new id-based `moveKeyframeById` (no destination delete); diamonds key + fan by
  id. Selection/edit/delete stay frame-based.

## [~] D-015 — View menu: ruler + snapping toggles ⟨priority: medium⟩ — change: `openspec/changes/add-view-menu-ruler-snapping/`

**What:** Add two toggles to the top **View** menu: **Ruler** (show/hide canvas
pixel rulers) and **Snapping** (enable/disable snap-to-edges/centers while
dragging elements on the canvas).
**Why:** Operators need rulers to read positions and snapping to align elements
precisely; the View menu was a disabled placeholder.
**Acceptance:**

- WHEN the operator opens View THEN it shows Ruler and Snapping items, each with
  a checkmark reflecting its current on/off state
- WHEN Ruler is on THEN top + left pixel rulers overlay the canvas, aligned to
  the scene and scaling with zoom / scroll
- WHEN Snapping is on and an element is dragged THEN its edges/center snap to the
  canvas edges/center and to other elements' edges/centers, with guide lines
- WHEN Snapping is off THEN dragging moves freely with no snap or guides
- WHEN the operator drags from the top ruler THEN a horizontal guide is created;
  dragging from the left ruler creates a vertical guide; guides can be moved and
  removed (drop off-canvas / double-click) and elements snap to them
  **Notes:** view prefs live in the store (`rulerVisible`, `snappingEnabled`,
  `snapGuides`, `guides`); no schema change. Smart-guide snapping + guide snap
  targets in `CanvasOverlay` beginDrag; ruler + draggable guides in `CanvasArea`.

## [~] D-016 — Cubic-bézier keyframe easing editor ⟨priority: high⟩ — change: `openspec/changes/add-bezier-easing/`

**What:** Replace the keyframe Easing dropdown with a cubic-bézier interpolation
editor — a Preset dropdown, a draggable curve graph (PROGRESS × TIME) with two
control handles, and P1/P2 (X,Y) fields. Keeps element/property/frame/value.
**Why:** Named easings are too coarse; operators need precise per-keyframe
curves like the reference tool.
**Acceptance:**

- WHEN the Keyframe Inspector is open THEN it shows a curve editor with a Preset
  dropdown (Linear, Ease In/Out/In-Out, Sine, Custom), the bézier curve, two
  draggable handles, and editable P1/P2 X/Y fields
- WHEN a preset is chosen THEN the curve + P1/P2 update to that preset
- WHEN a handle is dragged or a P1/P2 field edited THEN the curve updates and the
  preset shows "Custom" if it no longer matches a preset
- WHEN a keyframe has a custom curve THEN the runtime eases its outgoing segment
  through that cubic-bézier (matching the canvas)
- WHEN a scene authored before this change is loaded THEN it still validates and
  plays (named easing used when no bézier is set)
  **Notes:** adds optional `Keyframe.bezier` + a shared `cubicBezierEase` solver and
  `EASING_PRESETS` to `@cg/shared-schema`; runtime + designer interpolation honor
  it; new `EasingEditor.tsx`.

## [~] D-017 — Click-to-open + multi-select keyframes ⟨priority: high⟩ — change: `openspec/changes/multi-select-keyframes/`

**What:** A single click on a keyframe point (or the segment between two) opens
the Keyframe Inspector (no double-click). Shift/Ctrl-click adds points to a
multi-selection so easing can be applied to all at once. With >1 selected, the
inspector hides frame/value/property and shows only the easing editor + a
"Remove keyframes" button.
**Why:** Faster editing; batch-easing multiple points together.
**Acceptance:**

- WHEN the operator clicks a point or the segment between two THEN the Keyframe
  Inspector opens for it (single click, no double-click needed)
- WHEN the operator Shift/Ctrl-clicks points THEN they accumulate in the
  selection and all are highlighted
- WHEN more than one point is selected THEN the inspector hides frame/value/
  property and shows only the easing editor (applied to all) and a button
  labelled "Remove keyframes"
- WHEN the operator changes easing with multiple selected THEN every selected
  point gets that curve
- WHEN Delete is pressed THEN all selected points are removed
  **Notes:** store gains `selectedKeyframes` (multi) + `addKeyframeToSelection`;
  supersedes the old single/double-click split from `add-animation-timeline-dock`.

## [~] D-018 — Dynamic text fields (data binding + live preview) ⟨priority: high⟩

**What:** A text element becomes a runtime data field when it's given a **Data
key** in the inspector. Setting the key auto-creates/updates a scene-level
`field` (id = key) and a text `binding` to that element, so `fields[]`+`bindings[]`
stay the single source of truth. Add a "Dynamic / Data" inspector section
(key, title, description, required, type text|number, multiline, min/max length,
pattern, default) and a **preview field form** that edits values live. Also make
the runtime correct for the CasparCG flow: `update()` may arrive before `play()`,
and the legacy XML payload must parse.
**Why:** The editor can render scenes but text can't be driven by data at
playout, and the operator can't try values in the preview. This is the core of a
broadcast CG template.
**Acceptance:**

- WHEN the operator sets a non-empty Data key on a text element THEN a scene
  field (id = key) and a text binding to that element are created and the field
  appears in the Fields list
- WHEN the operator sets a Data key that duplicates an existing field key THEN
  the inspector warns and does not create a conflicting field
- WHEN the operator clears a text element's Data key THEN its backing field and
  binding are removed and the element renders its static text
- WHEN the operator edits a dynamic field's value in the preview form THEN the
  previewed text updates live using the same runtime as on-air
- WHEN `update(data)` is called before `play()` THEN the values are retained and
  applied on play, so order does not matter
- WHEN a payload arrives as CasparCG legacy XML
  (`<templateData><componentData id="KEY"><data id="text" value="V"/></componentData>…`)
  THEN it is parsed to `{KEY:"V"}` and applied; a JSON string or an
  already-parsed object is also accepted; unknown keys are ignored
- WHEN a field has `maxLength` and a longer value arrives THEN the text is
  truncated to `maxLength` and the element's existing auto-size / auto-squeeze
  applies
  **Notes:** Convenience layer over the existing `@cg/shared-schema`
  `fields[]`+`bindings[]` and `@cg/template-runtime` `applyFieldValues` — do NOT
  add a parallel field-on-element model. Inspector "Key" row already = element
  name; call the new concept **Data key**. Runtime fix in
  `packages/template-runtime/src/runtime.ts` (`play()` merge) and
  `adapters/caspar-globals.ts` (XML parse). Preview plumbing already exists
  (`apps/designer/src/platform/preview.ts`, `bridge.preview.update`).
  Change: `openspec/changes/add-dynamic-text-fields/`.

## [~] D-019 — Single-file CasparCG HTML export (+ embedded GDD) ⟨priority: high⟩

**What:** A "Download HTML" action that exports the current composition as **one
self-contained, `file://`-safe `.html`** to drop into CasparCG's `templates/`:
all CSS/JS inlined, images as base64, fonts as base64 `@font-face`, a classic
(IIFE) build of the shared `@cg/template-runtime`, transparent stage at the
composition resolution, and an embedded **GDD** JSON-schema generated from the
dynamic fields. Reuses the same runtime source as the preview and the `.vcg`.
**Why:** The current `.vcg` `index.html` uses ES-module `import` + `fetch`, which
does not run when loaded as a `file://` template; there is no output you can drop
straight into CasparCG, and no GDD for standard CG clients.
**Acceptance:**

- WHEN the operator clicks "Download HTML" THEN one `.html` downloads with all
  CSS, JS, images (base64) and fonts (base64) inlined and no external references
- WHEN that file is opened directly in Chrome THEN there are no console errors,
  and calling `window.update({…})` then `window.play()` updates and animates (in
  either order)
- WHEN the file is loaded as a CasparCG template and `CG ADD … "{data}" 1` /
  `CG PLAY` / `CG UPDATE` / `CG STOP` are issued THEN the graphic plays, shows the
  ADD data, updates on UPDATE, and exits on STOP (`CG NEXT` is a safe no-op for a
  single-step template)
- WHEN the composition has dynamic fields THEN the exported file embeds a
  `<script name="graphics-data-definition" type="application/json+gdd">` block
  whose JSON-schema lists every dynamic field with the correct `type`/`gddType`
  and `minLength`/`maxLength`/`pattern`/`default`, with required fields in the
  top-level `required` array
- WHEN the same composition is previewed and exported THEN preview behavior
  equals exported-file behavior (shared runtime source)
  **Notes:** Depends on D-018 (dynamic fields + the `play()` fix). Add the IIFE
  runtime build alongside today's ESM bundle (same source, different format);
  feed it via `apps/designer/src/platform/cg-runtime.js`. Keep the GDD generator
  behind a small interface so an OGraf exporter can be added later (do NOT build
  OGraf now). Keep CSS within common CasparCG CEF builds (63 = 2.2, 71 = 2.3.x,
  117 = 2.4.x). Leaves the existing `.vcg` exporter unchanged.
  Change: `openspec/changes/add-caspar-single-file-export/`.

## [~] D-020 — Animation lifecycle + playout timing ⟨priority: high⟩

**What:** Give every composition an explicit **IN / HOLD / OUT** lifecycle and a
no-code **playout-timing** config, plus the runtime behavior to execute it. The
author marks an **intro-end** (the hold frame) and an **outro-start** on the
timeline (inside the existing active region); the runtime then plays the intro
once and **holds** (instead of looping the whole range), `stop()` plays the
outro, and new `pause()`/`resume()` freeze/continue the current frame. A
per-composition timing config chooses `manual` (operator drives out),
`auto-out` (hold for T then out), `loop-cycle` (intro→hold(T)→outro repeated N
times or forever), or `content-driven` (duration computed from content — the
crawler; computation delivered by the ticker item). Phase markers + timing
config + the outro duration are exported in the template metadata.
**Why:** This is the foundation every animated template needs and that the
crawler, the looping logo, hold/pause-before-close, and timed auto-out all build
on. The current runtime loops the entire timeline continuously, which is wrong
for a broadcast template that must open, hold, and exit on command. Retrofitting
this later would mean re-authoring every template and reworking the frame driver.
**Acceptance:**

- WHEN the author marks an intro-end and an outro-start on the timeline (within
  the active region) THEN the composition stores them and IN/HOLD/OUT are derived
  with `activeRange.in ≤ introEnd ≤ outroStart ≤ activeRange.out`
- WHEN `play()` runs THEN the intro plays once and the composition holds at the
  hold frame — it does not loop the whole range and does not auto-play the outro
- WHEN `stop()` runs THEN the outro plays from the outro-start to the
  active-region end
- WHEN `pause()` is called THEN the current frame freezes, and `resume()`
  continues from that frame
- WHEN the timing mode is `auto-out` with hold = T THEN after the intro and T ms
  of hold the outro plays automatically
- WHEN the timing mode is `loop-cycle` with hold = T and repeat = N (or infinite)
  THEN the composition repeats intro→hold(T)→outro for N cycles, or until `stop()`
- WHEN a composition with phase markers + timing config is exported THEN the
  template metadata carries the intro/outro frames, the mode, hold, repeat, and
  the **outro duration in ms**
- WHEN the composition is previewed THEN play / hold / pause / auto-out /
  loop-cycle behave identically to the exported file (same runtime source)
  **Notes:** New capability `designer-playout-lifecycle`; phase markers live
  inside `designer-animation-timeline`'s `activeRange` (that spec is not
  modified). Builds on **D-018** (runtime + preview) and **extends D-019**'s
  export metadata. The current `FrameDriver` full-range loop is replaced by
  "play a sub-range once and hold" + a cycle orchestrator. `content-driven` mode
  is declared here; its width/duration computation lands with the ticker item.
  `pause`/`resume` are runtime + control-layer methods (exposable on air later via
  `CG INVOKE "pause"`, which takes no args); the exported outro duration lets the
  control layer schedule precise timed auto-out.
  Change: `openspec/changes/add-animation-lifecycle-timing/`.

## [x] D-022 — App-wide button/control consistency (shared Button/Control + states) ⟨priority: medium⟩ — focused fix

**What:** Make hover / active / focus-visible / disabled the DEFAULT for every
interactive button, not a per-button afterthought.
**Why:** Buttons across the app (toolbar, panels, inspector, timeline, dialogs)
were raw `<button>`s with ad-hoc styling and inconsistent (often missing)
interactive states.
**Acceptance:**

- WHEN a developer needs a button THEN they use the shared `Button` (labelled) or
  `Control` (icon-only) from `apps/designer/src/renderer/ui/`, a vanilla-extract
  recipe on `renderer/theme.ts` (variants primary/secondary/ghost/danger/bare,
  sizes, `selected` for toggles) — no `@cg/ui` change, no palette change
- WHEN any existing Designer button is rendered THEN it routes through
  `Button`/`Control` and has hover / active / focus-visible / disabled states
- WHEN a raw `<button>` is added in `src/renderer/**` (outside `ui/`) THEN lint
  errors (`no-restricted-syntax` in `apps/designer/eslint.config.mjs`)
- WHEN the top-menu buttons (Preview / Export / HTML / Save) are used THEN they
  show proper hover/active/focus-visible/disabled states
  **Notes:** UI-consistency (quality) work — no spec behavior change. The later
  D-020 preview-modal polish reuses these shared components (no preview-specific
  button styles). `bare` variant = states-only escape hatch for bespoke surfaces
  (menu items, list rows, the keyframe diamond).

## [~] D-023 — Delete key removes the selection (keyframe precedence) ⟨priority: medium⟩ — change: `openspec/changes/add-delete-key-selection/`

**What:** Delete/Backspace removes the current selection from the keyboard.
**Why:** Layers/shapes could only be removed via the right-click menu; operators
expect the Delete key. Clicking a keyframe selects both the keyframe and its parent,
so the key needs a clear precedence.
**Acceptance:**

- WHEN a keyframe is selected (which also selects its parent) and Delete/Backspace
  is pressed THEN the keyframe(s) are deleted and the parent layer/shape remains
- WHEN no keyframe is selected and a layer/shape is selected THEN Delete/Backspace
  removes the selected layer(s)/shape(s)
- WHEN an input/textarea/select/contentEditable is focused THEN Delete/Backspace
  deletes nothing (it edits the field)
- WHEN several of the prioritised kind are selected THEN all are deleted
- WHEN nothing is selected THEN it is a no-op; the delete is a single undo step
  **Notes:** Handled globally in `App` via `designerStore.deleteSelection()`
  (precedence + multi-delete); the timeline's old keyframe-only Delete handler was
  removed. No schema/runtime change. Change: `openspec/changes/add-delete-key-selection/`.

## [~] D-024 — Double-click to drill into a nested child composition ⟨priority: medium⟩ — change: `openspec/changes/add-drill-into-composition/`

**What:** Double-clicking a shape inside a nested composition instance navigates to
editing that child composition and selects the double-clicked shape (AE/Figma/Loopic
style).
**Why:** Today a nested child can only be selected as a unit; editing its insides
means finding it in the compositions list and opening it.
**Model:** Compositions are SHARED, reusable definitions — a child has no single
parent. So NO breadcrumb / "back to parent"; navigation stays via the compositions
list. Drill-in = open-from-list + select the shape; navigation + selection only, no
new edit semantics, no per-instance overrides (editing the shape edits the shared
child, affecting every parent).
**Acceptance:**

- WHEN the operator double-clicks a shape visually inside a nested composition
  instance THEN the editing context switches to that child and the shape is selected
- WHEN the operator single-clicks the instance THEN it is selected as a whole unit
- WHEN drilled in THEN no breadcrumb / back-to-parent affordance is shown
- WHEN double-clicking at arbitrary depth THEN each double-click drills one level
  **Notes:** `features/canvas/drill.ts` maps the cursor into the child's coordinate
  space (inverts the instance transform, scales into child resolution) and
  hit-tests the child's shapes; `store.openCompositionAndSelect` does the atomic
  open-child + select. No schema/runtime change. Change: `openspec/changes/add-drill-into-composition/`.

## [~] D-025 — Nested-composition field scoping + instance namespacing ⟨priority: high⟩ — change: `openspec/changes/add-nested-composition-field-scoping/`

**What:** Fields are per-composition; nested child instances expose their fields in
the parent under a per-instance namespace (nested objects), with values routed to
the right child copy. Model: Option C (instance-scoped namespacing).
**Why:** Fields were project-global (every comp showed all fields), and nested
children's values never updated; the same child instanced twice couldn't be set
independently.
**Acceptance:**

- WHEN a standalone composition is open THEN it shows only its own field(s), flat
- WHEN a parent nests a child THEN the child's fields appear grouped under the
  instance's namespace (nested object in data/GDD)
- WHEN the same child is instanced twice (home/away) THEN two independent namespaces
  with independent values
- WHEN a namespaced field is set in the parent preview THEN the right nested child's
  element updates
- WHEN a second instance is added/renamed to a taken name THEN it's uniquified
  **Notes:** schema-first (`Composition.fields/bindings` + `composition-fields.ts`
  helpers); runtime field-scope tree + `applyScopedFieldValues`; GDD nested objects;
  legacy global fields migrated on load. Change: `openspec/changes/add-nested-composition-field-scoping/`.

## [~] D-026 — Nested-lifecycle cascade + shared project fps ⟨priority: high⟩ — change: `openspec/changes/add-nested-lifecycle-cascade/`

**What:** `play/stop/pause/resume/remove` cascade recursively to every nested
composition instance — each runs its OWN intro→hold→outro at its own out-point — by
building a controller tree over the D-025 field-scope tree (hybrid: the parent keeps
its own controller for its direct elements). Frame rate becomes a single
project-level setting (`Scene.frameRate`); `Composition.frameRate` is dropped and the
inspector fps is read-only.
**Why:** D-020's lifecycle was top-level-only — it animated nested elements along the
parent timeline, so a child could not hold/exit on its own. And per-composition fps
let nested children disagree, whereas a CasparCG channel has one fps.
**Acceptance:**

- WHEN the parent is played THEN each nested child holds at its OWN out-point
  independently (different children → different held frames at the same time)
- WHEN the parent is stopped THEN each child plays its OWN outro
- WHEN the parent is paused/resumed THEN the cascade freezes/continues every child
- WHEN the parent has its own out-point THEN its direct elements hold at it AND the
  cascade still applies to children
- WHEN nesting is arbitrarily deep THEN the cascade reaches grandchildren
- WHEN a project is opened THEN every composition shares the single project fps
  (`Scene.frameRate`), and a legacy per-composition fps is stripped on load; the
  inspector fps is read-only
  **Notes:** child offset 0 for v1 (no `lifespan` overload); root scope drives the
  global machine/events + session playout override, children use their own stored
  playout; single fps applied across all scopes (FrameDriver is time-based).
  Refinements (same change): cascade `stop()` is **state-aware** — a child that
  already finished (auto-out exited / finite loop-cycle or content-driven completed)
  is NOT re-exited; active/infinite/manual/paused children still exit. Preview timing
  overrides (mode/holdMs/repeat) are **per-scope**, grouped by the parent + nested
  instance names, session-only. Change:
  `openspec/changes/add-nested-lifecycle-cascade/`.

<!-- Backlog stubs (registered for hygiene; Acceptance to be detailed when scheduled). -->

## [ ] D-027 — Digital clock element ⟨priority: medium⟩

**What:** A clock element that renders live wall-clock / countdown / count-up time
with a format string (and Persian-digit support).
**Why:** Clocks are a staple broadcast graphic; today there's no time-driven element.
**Acceptance to be detailed when scheduled.**
**Notes:** new element type → `@cg/shared-schema` + `@cg/template-runtime` render
(see the "add a new element type" extension point in
`packages/template-runtime/README.md`); reuse `@cg/text-shaping` for digits. Needs a
runtime time source (relates to the FrameDriver clock seam).

## [~] D-028 — Ticker / crawler ⟨priority: high⟩

**What:** A new `ticker` element type: a clipped horizontal band that scrolls a
list of text items continuously (marquee/crawl). The scroll duration is
content-driven — measured content width ÷ `speed` (px/s) — supplied to the
composition's `content-driven` playout mode and looped via its `repeat`
(`'infinite'` | N passes then exit). Items are authored on the element
(`items: [{ id, text }]`) and can be driven dynamically through a new `list`
field type bound to the ticker; `update()` reconciles items by stable id.
`direction: 'rtl' | 'ltr'` is the reading direction (Persian default `'rtl'`:
RTL item layout, track moves visually left→right, mirroring the news starter).
**Why:** News crawls are a core deliverable and the most-requested template
type; today both ticker starters fake the crawl with hard-coded keyframes over
a fixed distance, so long text clips and short text leaves dead air.
**Acceptance:**

- WHEN a ticker's items are replaced with longer text THEN the pass duration
  grows proportionally (measured width ÷ speed) with no manual duration edit
- WHEN playout `repeat` is N THEN the composition exits after exactly N passes;
  WHEN `'infinite'` THEN the crawl runs until `stop()`
- WHEN `update()` delivers a new items list THEN items reconcile by stable id —
  existing items keep position, new items append, removed items leave once
  off-screen — with no restart or visual jump
- WHEN the crawl wraps around THEN the loop seam shows no gap or flash
- WHEN fonts are still loading THEN measurement waits for `document.fonts.ready`
  (no mis-measured first pass; in the Designer preview this includes
  operator-imported `asset-*` fonts)
- WHEN `direction` is `'rtl'` THEN items lay out right-to-left with per-item
  bidi isolation (mixed RTL/LTR items render correctly) and the track moves
  visually left→right; `'ltr'` is the mirror
- WHEN the same scene is previewed and exported THEN the ticker behaves
  identically (single-file export carries it; GDD represents the list field)
- WHEN the operator scrubs the timeline THEN the ticker does not move and the
  UI states it is time-driven (scrub does not apply)
- WHEN a `list` field is bound to a ticker THEN the preview field form shows an
  items editor (add/remove/reorder) that live-updates the crawl
  **Notes:** first consumer of D-020 `content-driven` + the `durationHook` seam —
  the runtime self-wires a per-scope hook from the ticker element (no boot-option
  wiring needed in preview/export; `RuntimeBootOptions.durationHook` stays as the
  external override/test seam). New `list` field type has an extensible item shape
  (required `id` + open fields; the ticker reads `text`) so the repeater (D-030)
  and sequence (D-029) can reuse it. Lists travel as JSON only (legacy CasparCG
  XML payloads can't carry them). Change dir:
  `openspec/changes/add-ticker-element/`.

## [ ] D-029 — Sequence / now-next ⟨priority: medium⟩

**What:** A template that pages through a sequence of entries (e.g. now/next/later)
advancing on command or on a timer.
**Why:** Rundown-style "now & next" lower-thirds are common and not expressible today.
**Acceptance to be detailed when scheduled.**
**Notes:** pairs with D-031 (`steps` + real `next()`) and the rundown control app
(C-002). Depends on D-018.

## [ ] D-030 — Repeater / data-driven layout ⟨priority: medium⟩

**What:** Repeat a sub-layout once per row of a data array (leaderboards, lineups,
results tables), laying out instances automatically.
**Why:** Tabular graphics today need manual duplication; a repeater is the scalable
primitive.
**Acceptance to be detailed when scheduled.**
**Notes:** likely composes the nested-composition instancing (D-025) with an
array-typed field; layout strategy (stack/grid) TBD. Depends on D-025.

## [ ] D-031 — Multi-step templates (`steps`) + real `next()` ⟨priority: medium⟩

**What:** Author discrete steps in a template and wire CasparCG `next()` /
`runtime.next()` to advance between them.
**Why:** `TemplateRuntime.next()` is currently an optional stub; multi-step graphics
(builds, reveals) need it.
**Acceptance to be detailed when scheduled.**
**Notes:** schema (`steps`) → runtime `next()` implementation in
`@cg/template-runtime` (today `next` is unimplemented in `createRuntime`). Underpins
D-029. Capture behaviour as an OpenSpec change.

## [ ] D-032 — Temporal start-offset for nested instances ⟨priority: medium⟩

**What:** Let each nested composition instance start its lifecycle at a per-instance
time offset (staggered entrances), instead of all starting at the cascade `play()`.
**Why:** D-026 explicitly ships child offset 0 for v1; staggering is the natural next
step for choreographed multi-instance graphics.
**Acceptance to be detailed when scheduled.**
**Notes:** extends the D-026 cascade (per-scope delay before `startIntro`); depends on
D-026.

## [ ] D-033 — Reverse-on-stop option ⟨priority: low⟩

**What:** A playout option to play the entrance in reverse as the exit (instead of a
separate outro range).
**Why:** A common quick way to author a clean exit without a dedicated outro segment.
**Acceptance to be detailed when scheduled.**
**Notes:** a PlayoutController option (see "add a new playout mode / lifecycle
behaviour" in `packages/template-runtime/README.md`); depends on D-020.

## [ ] D-034 — Per-cycle event ⟨priority: low⟩

**What:** Emit a runtime event at the boundary of each `loop-cycle` / `content-driven`
pass (so the host can react / swap data per cycle).
**Why:** Looping/content-driven graphics need a hook to advance data each pass.
**Acceptance to be detailed when scheduled.**
**Notes:** extends the `EventBus` + `PlayoutController.onOutroEnd` cycle boundary;
distinct from D-021 (idle loop during hold). Depends on D-020.

## [ ] D-035 — `store.ts` refactor ⟨priority: low⟩

**What:** Break up / restructure the Designer renderer store for clarity and
testability once the feature set settles.
**Why:** The store has accreted across many features; a refactor reduces risk and
eases future work.
**Acceptance to be detailed when scheduled.**
**Notes:** **do AFTER feature churn settles**, and only **with tests in place first**
(relates to D-038 + P-004) so the refactor is safety-netted. No behaviour change.

## [ ] D-036 — Engine docs + coverage: canvas editor (Item 2 step 2) ⟨priority: medium⟩

**What:** Internal architecture docs + test-coverage pass for the Designer canvas
editor, mirroring the template-runtime engine docs effort (Item 2 step 1).
**Why:** The canvas editor is core + churned; it needs the same "how it's built +
extension points + coverage" treatment so it stays maintainable.
**Acceptance to be detailed when scheduled.**
**Notes:** docs + tests only, no behaviour change (track as a quality item like the
template-runtime pass); follow the engine doc-sync rule in `CLAUDE.md`. Companion to
D-037.

## [ ] D-037 — Engine docs + coverage: animation/keyframe (Item 2 step 3) ⟨priority: medium⟩

**What:** Internal architecture docs + test-coverage pass for the Designer
animation/keyframe subsystem (timeline, keyframe-helpers, evaluators).
**Why:** Animation is the most bug-prone area (see B-005/006/007); docs + coverage
harden it.
**Acceptance to be detailed when scheduled.**
**Notes:** docs + tests only, no behaviour change; quality item. Companion to D-036.

## [ ] D-038 — Broaden Designer UI unit coverage ⟨priority: low⟩

**What:** Grow unit-test coverage of the Designer renderer (inspector sections,
panels, store reducers) beyond the current animation/binding focus.
**Why:** Many UI paths are only covered by E2E (P-005) or not at all; unit coverage
catches regressions faster.
**Acceptance to be detailed when scheduled.**
**Notes:** complements P-004 (Exporter/Preview tests) and P-005 (E2E); prerequisite
safety net for D-035.

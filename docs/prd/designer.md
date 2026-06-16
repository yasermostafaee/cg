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

## [x] D-006 — ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-15-add-animation-timeline-dock/`

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

## [x] D-007 — redesign style and elements (priority: high) — archived: `openspec/changes/archive/2026-06-15-redesign-studio-loopic-style/`

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

## [x] D-015 — View menu: ruler + snapping toggles ⟨priority: medium⟩ — archived: `openspec/changes/archive/2026-06-15-add-view-menu-ruler-snapping/`

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

## [x] D-016 — Cubic-bézier keyframe easing editor ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-15-add-bezier-easing/`

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

## [x] D-017 — Click-to-open + multi-select keyframes ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-15-multi-select-keyframes/`

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

## [x] D-018 — Dynamic text fields (data binding + live preview) ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-15-add-dynamic-text-fields/`

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

## [x] D-020 — Animation lifecycle + playout timing ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-15-add-animation-lifecycle-timing/`

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

## [ ] D-021 — Idle loop during hold ⟨priority: high⟩

**What:** بگذار یک composition به‌اختیار **یک تکهٔ انتهایی را حینِ hold لوپ کند**،
به‌جای یخ‌زدن — تا لوگو نبض بزند، یک bug «نفس بکشد» و... . یک marker اختیاریِ
`holdLoopStart` داخلِ entrance اضافه می‌شود؛ وقتی ست شد، در فازِ HOLD، playhead
پیوسته `[holdLoopStart → outPoint]` را لوپ می‌کند (آن segment بخشی از entrance است و
بارِ اول کامل پخش می‌شود، بعد replay — بدونِ ناحیهٔ مرده). وقتی ست نشد، hold دقیقاً
مثلِ D-020 روی `outPoint` یخ می‌زند. به‌صورتِ پیش‌فرض خاموش (یک marker).
توگل/markerها در designer، تست‌پذیر در preview modal.
**Why:** حرکتِ ظریفِ مداوم وقتی گرافیک روی صفحه نشسته یک نیازِ رایجِ پخش است.
مدلِ تک-markerِ D-020 hold را یخ می‌زند؛ این، idle loop را به‌صورتِ opt-in اضافه
می‌کند بدونِ برگرداندنِ ناحیهٔ مردهٔ دو-marker.
**Acceptance:**

- WHEN `holdLoopStart` ست است و `play()` به hold می‌رسد THEN playhead پیوسته
  `[holdLoopStart → outPoint]` را لوپ می‌کند به‌جای یخ‌زدن
- WHEN `holdLoopStart` ست نیست THEN hold روی `outPoint` یخ می‌زند (رفتارِ D-020، بدونِ تغییر)
- WHEN `holdLoopStart` ست است THEN invariant ِ `activeRange.in ≤ holdLoopStart ≤ outPoint`
  برقرار است، و segment بارِ اول کامل پخش می‌شود (به‌عنوان بخشی از entrance) قبل از شروعِ لوپ
- WHEN مود `auto-out` یا `loop-cycle` با idle loop است THEN idle حینِ hold/dwell لوپ می‌کند
  و خروج (`[outPoint → activeRange.out]`) بعد از `holdMs` عادی پخش می‌شود
- WHEN `stop()` حینِ idle loop صدا زده شود THEN خروج از `outPoint` تا انتهای active region پخش می‌شود
- WHEN previewed THEN idle loop دقیقاً مثلِ فایلِ export رفتار می‌کند و designer می‌تواند در preview modal توگل/تستش کند

**Notes:** ADDED requirement روی capabilityِ `designer-playout-lifecycle`؛
**وابسته به D-020** (markerِ تک `outPoint` + hold). بدونِ ناحیهٔ مرده — segmentِ لوپ
یک tailِ replay‌شدهٔ entrance است. چون scene از قبل `holdLoopStart` را حمل می‌کند،
export فقط metadata است. idle segment را به‌صورتِ **چرخهٔ بی‌درز** بنویس
(حالتِ شروع ≈ حالتِ پایان) تا هر لوپ پرشِ دیداری نداشته باشد.
Change (جدید، وقتی پیاده شد): `openspec/changes/add-hold-idle-loop/`.

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

## [x] D-023 — Delete key removes the selection (keyframe precedence) ⟨priority: medium⟩ — archived: `openspec/changes/archive/2026-06-15-add-delete-key-selection/`

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

## [x] D-024 — Double-click to drill into a nested child composition ⟨priority: medium⟩ — archived: `openspec/changes/archive/2026-06-15-add-drill-into-composition/`

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

## [x] D-025 — Nested-composition field scoping + instance namespacing ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-15-add-nested-composition-field-scoping/`

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

## [x] D-026 — Nested-lifecycle cascade + shared project fps ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-15-add-nested-lifecycle-cascade/`

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

## [x] D-027 — Digital clock element ⟨priority: medium⟩

**What:** A new `clock` element type that renders live time as text — three
modes: `wall` (current local time), `countup` (stopwatch), and `countdown` (to
a `duration` or an absolute `datetime` target) — through a format string
(`HH H hh h mm m ss s A a` tokens + literal text) with Persian / Arabic-Indic
digit support via `@cg/text-shaping`. The clock is time-driven like the
ticker: a small per-element `ClockDriver` (on the ticker's self-wire pattern)
repaints the text once per second; a `countdown` reaching zero signals
completion and participates in the scope's `holdSource: 'content-driven'`
hold alongside finite tickers, so an `auto-out` composition exits exactly at
00:00. Wall/countup never complete (not content sources). Text styling
(font/color/shadow/background/padding/radius) mirrors the ticker's subset.
**Why:** Clocks are a staple broadcast graphic (time-of-day bugs, countdown to
air, match timers); there is no time-driven element today and keyframes can't
tick real time. The ticker built exactly the seams this needs (per-scope
drivers, injectable `RuntimeClock`, content-driven completion) — the clock is
the smallest element that reuses them.
**Acceptance:**

- WHEN the operator picks the Clock tool and clicks the canvas THEN a clock
  element is added (default `wall`, format `HH:mm:ss`, Persian digits,
  Vazirmatn) and the authoring canvas shows the current time
- WHEN mode is `wall` THEN during playback the text ticks once per second with
  the machine's local time, formatted by the format string
- WHEN mode is `countup` THEN the count starts at zero at each hold entry and
  counts up in ACTIVE (unpaused) time until `stop()`; each `loop-cycle` cycle
  restarts it from zero
- WHEN mode is `countdown` with a `duration` target THEN the display starts at
  the full duration, counts down in active time during the hold, clamps at
  zero (never negative), and signals completion exactly at 00:00; each
  `loop-cycle` cycle re-runs the full count
- WHEN mode is `countdown` with a `datetime` target THEN remaining = target −
  real now (pause does not delay a real deadline), clamping at zero and
  signalling completion; a target already in the past completes immediately
  (zero-length content hold)
- WHEN a composition holds with `holdSource: 'content-driven'` THEN the hold
  ends when ALL the scope's content sources complete — finite tickers AND
  countdown clocks (`Promise.all`); wall/countup clocks are NOT content
  sources and never extend the hold
- WHEN `pause()` is called THEN the displayed time freezes in every mode;
  `resume()` continues a relative count with no jump, and an absolute clock
  (wall / datetime countdown) resumes showing the true current value
- WHEN the format omits a larger unit THEN the largest present unit absorbs
  the overflow (`mm:ss` → `90:00` for a 90-minute countdown); non-token
  characters pass through literally
- WHEN digits is `persian` (default) or `arabic-indic` THEN digits map via
  `@cg/text-shaping`, the time string stays LTR (bidi-isolated) inside RTL
  layouts, and width is stable (tabular numerals)
- WHEN the operator scrubs the timeline THEN the clock does not move and the
  inspector states it is time-driven (same affordance as the ticker)
- WHEN a composition contains a countdown clock THEN the playout inspector
  offers the content-driven hold source (copy generalized beyond "ticker")
- WHEN the same scene is previewed and exported THEN the clock behaves
  identically (the single-file export carries the driver; the clock adds no
  fields, so the GDD is unchanged)
  **Notes:** New capability `designer-clock-element` + `## MODIFIED
Requirements` on `designer-playout-lifecycle` (the content-completion
  requirement generalizes "tickers" → content sources; every existing
  scenario preserved). Schema-first: `ClockElementSchema` (`type: 'clock'`)
  in the `@cg/shared-schema` element union. Runtime: `buildClock` in
  `scene-builder.ts` (collected on `scope.clocks`, cf. `scope.tickers`) +
  `clock-driver.ts` on the TickerDriver lifecycle surface
  (start/pause/resume/stop/reset/destroy/whenComplete, injectable
  `RuntimeClock`), wired in `createRuntime` (hold-entry reset+start, cascade,
  content-source `Promise.all`); repaint only when the formatted string
  changes; `font-variant-numeric: tabular-nums`. Designer: Clock tool,
  `defaultClock`, `ClockSections` in `StyleSection.tsx`
  (mode/format/digits/target + `TextStyleSection` reuse),
  `hasContentElement` + copy in `PlayoutSection.tsx`. OUT OF SCOPE v1 (record
  in design.md): date tokens (Jalali `dateFa` already exists in
  `@cg/text-shaping`), blinking separator, timezone offset, field-driven
  target, overrun-after-zero count-up, starter template. Change dir:
  `openspec/changes/archive/2026-06-11-add-clock-element/`.

## [x] D-028 — Ticker / crawler ⟨priority: high⟩

**What:** A new `ticker` element type: a clipped horizontal band that scrolls a
list of text items continuously (marquee/crawl). The scroll duration is
content-driven — measured content width ÷ `speed` (px/s). The ticker owns its
own crawl loop: `repeat` (`'infinite'` default | N passes) with
`cycleBoundary: 'seamless' | 'drain'`; a finite run ends cleanly (the last
item fully exits the band) and signals completion, which the composition's
`holdSource: 'content-driven'` hold awaits — usable under `auto-out` AND
`loop-cycle`, whose `repeat` counts open/close cycles. Items are authored on
the element
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
- WHEN a ticker's `repeat` is N THEN feeding stops after pass N and the run
  completes when the last item has fully exited the band (clean end, never cut
  mid-scroll, completion signalled); WHEN `'infinite'` (the default) THEN the
  crawl runs until `stop()`
- WHEN `cycleBoundary` is `'seamless'` THEN the next pass follows the last at
  the configured spacing; WHEN `'drain'` THEN the band empties between passes
- WHEN a composition holds with `holdSource: 'content-driven'` THEN the hold
  lasts until every scope ticker completes (usable under `auto-out` AND
  `loop-cycle`; an infinite ticker holds until `stop()`); WHEN `loop-cycle`
  `repeat: 3` contains a ticker with `repeat: 2` THEN each cycle holds for 2
  crawl passes with the full open/close between — the content is seen 6×
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
  **Notes:** supersedes D-020's `content-driven` _mode_ + `durationHook` seam
  with a completion model — the runtime self-wires each scope's content-driven
  hold from its tickers' completion signals (`Promise.all`; no boot-option
  wiring needed in preview/export; `RuntimeBootOptions.contentHold` is the
  root-scope external override/test seam), and a stored legacy
  `mode: 'content-driven'` normalizes to `loop-cycle` +
  `holdSource: 'content-driven'`. New `list` field type has an extensible item shape
  (required `id` + open fields; the ticker reads `text`) so the repeater (D-030)
  and sequence (D-029) can reuse it. Lists travel as JSON only (legacy CasparCG
  XML payloads can't carry them). Change dir:
  `openspec/changes/archive/2026-06-10-add-ticker-element/`.

## [x] D-029 — Sequence / now-next element ⟨priority: medium⟩

**What:** A new `sequence` element type: a clipped box that shows ONE item of
an ordered list at a time and advances — on a per-item timer (`dwellMs`,
falling back to the element's `defaultDwellMs`) and/or on command
(`CG NEXT` / `runtime.next()`, implemented for real in this change). The move
between items is a DECOMPOSED, fully authorable transition: an IN edge
(`top|bottom|left|right|none`), an OUT edge (same set), and a timing
(`simultaneous` push vs `sequential` out-then-in), each motion over
`transitionMs` — with named presets over those fields (Push up/down/left/
right, Slide up/down/left/right, Hide-show, else Custom), and the
decomposition itself as the extensible seam for future styles (e.g. fade).
Items are authored on the element (`{ id, text, dwellMs? }`) and can be
driven dynamically through the D-028 `list` field (reconciled by stable id).
`repeat: 'infinite' | N` counts full passes; a finite sequence is a CONTENT
SOURCE: advancing past the last item of pass N (by timer or by next())
signals completion to the scope's `holdSource: 'content-driven'` hold,
alongside finite tickers and countdown clocks. Text styling mirrors the
ticker/clock subset; reading `direction` ('rtl' default) drives per-item
bidi isolation (transition edges are physical — no hidden mirroring).
**Why:** Rundown-style now/next lower-thirds are a staple and not
expressible today; and `TemplateRuntime.next()` is a stub even though the
CasparCG global is already wired — this lands its first real consumer and
the per-scope dispatch seam the future steps model (D-031) plugs into.
**Acceptance:**

- WHEN the operator picks the Sequence tool and clicks the canvas THEN a
  sequence element is added (3 sample Persian now/next items, `rtl`,
  `advance: 'auto'`, `defaultDwellMs: 5000`, `transitionIn: 'bottom'`,
  `transitionOut: 'top'`, `transitionTiming: 'simultaneous'` — the "Push up"
  preset — `transitionMs: 400`, `repeat: 'infinite'`) and the authoring
  canvas shows item 1
- WHEN playback runs THEN item 1 displays statically through the intro and
  advancing begins at hold entry; each hold entry (every `loop-cycle` cycle)
  starts a fresh run from item 1
- WHEN `advance` is `'auto'` THEN each item holds for its own `dwellMs`
  (falling back to `defaultDwellMs`) and then transitions to the next item
- WHEN a transition runs THEN the outgoing item exits through its OUT edge
  and the incoming enters from its IN edge, per the timing —
  `'simultaneous'` moves both together (push), `'sequential'` completes the
  exit before the entry begins — each motion lasting `transitionMs`, clipped
  to the box; an edge of `'none'` makes that side an instant cut (IN `none`
  - OUT `none` = the hide-show hard swap)
- WHEN the operator picks a transition preset THEN the three fields are set
  accordingly (Push × 4 = simultaneous, Slide × 4 = sequential, Hide-show =
  none/none) and editing any field afterwards shows **Custom** — every
  IN × OUT × timing combination is authorable
- WHEN `direction` is `'rtl'` THEN items render with per-item bidi
  isolation; transition edges stay physical and explicit (the
  Persian-natural horizontal motion is the Push/Slide **right** presets,
  matching the crawl direction)
- WHEN `advance` is `'manual'` THEN no dwell timers run and only `next()`
  advances
- WHEN `next()` / `CG NEXT` arrives THEN the sequence advances one item with
  its transition (in `'auto'` the new item's dwell restarts); a template
  with no sequences keeps `next()` a safe no-op; a `next()` before the run
  has started (during the intro) is ignored
- WHEN `repeat` is N THEN advancing past the last item of pass N — by timer
  OR by `next()` — completes the run: the last item stays on screen and
  completion is signalled; `'infinite'` cycles until `stop()`
- WHEN a composition holds with `holdSource: 'content-driven'` THEN finite
  sequences join finite tickers and countdown clocks in the same
  `Promise.all`; an infinite sequence holds the scope until `stop()`
- WHEN `update()` delivers a bound `list` value THEN items reconcile by
  stable id; the CURRENT item is never yanked mid-display (a text edit
  applies in place; a removal takes effect at the next advance); per-item
  `dwellMs` carried in the list value is honored
- WHEN items are edited in the inspector or the preview field form THEN the
  shared items editor exposes an optional per-item dwell, and unknown item
  fields are preserved (existing editor invariant)
- WHEN `pause()` is called THEN the dwell timer AND any in-flight transition
  freeze; `resume()` continues both with no jump
- WHEN the operator scrubs the timeline THEN the sequence does not move and
  the inspector states it is time-driven (same affordance as ticker/clock)
- WHEN a composition contains a sequence THEN the playout inspector offers
  the content-driven hold source (copy generalized: ticker passes /
  countdown / sequence passes)
- WHEN the same scene is previewed and exported THEN behavior is identical;
  the preview modal transport gains a **Next** control; the GDD represents
  the bound list field exactly as D-028 (lists remain JSON-only — the
  existing preflight warning covers it)
  **Notes:** New capability `designer-sequence-element` + `## MODIFIED
Requirements` on `designer-playout-lifecycle` (content sources gain finite
  sequences as the third member; all existing scenarios preserved).
  Schema-first: `SequenceElementSchema` (`type: 'sequence'`) +
  `SequenceItemSchema { id, text, dwellMs? }` in the element union. Runtime:
  `buildSequence` in `scene-builder.ts` (collected on `scope.sequences`) +
  `sequence-driver.ts` on the established driver surface
  (start/pause/resume/stop/reset/destroy/whenComplete/next/setItems,
  injectable `RuntimeClock`, hold-entry reset+start, full cascade); the
  transition is a small MOTION MAPPER over the in/out/timing decomposition
  (edge → vector; `none` = instant; future styles extend the enums + mapper
  — no breaking change); `createRuntime` implements `runtime.next()`
  cascading per scope to its sequence drivers — the dispatch seam D-031's
  steps model will plug into (D-031 Notes updated in the same change). New
  binding target `sequence-items` mirroring `ticker-items`;
  `ListItemsEditor` gains a prop-gated dwell column; Next button in
  `PreviewTransport.tsx`; transition Preset select follows the EasingEditor
  Preset/Custom pattern. Items are text-only in v1 (rich per-item layout
  belongs to D-030); per-item transition overrides are out of v1; fix the
  `ListItemSchema` comment nit (`text`/`dwellMs`). Change dir:
  `openspec/changes/archive/2026-06-11-add-sequence-element/`.

## [x] D-030 — Repeater / data-driven layout ⟨priority: medium⟩

**What:** A new `repeater` element type: a clipped box that renders one
instance of a referenced child composition PER ROW of a data list, laid out
automatically along an axis (`direction: 'column' | 'row'`, `gap`, the row
axis ordered by `flow: 'rtl' | 'ltr'`), each cell scaled to fit the box's
cross axis with the child's aspect preserved. The data surface is ONE
`list` field (binding target `repeater-items`) whose item keys are the
child composition's field ids — authored `items` on the element are the
design-time rows and the seed when a Data key is set. Liveness model B: row
VALUES update live mid-hold (positional application; a shorter list hides
the surplus rows, and regrowth within the stamped count re-shows them),
while the row COUNT is stamped at each fresh `play()` from the CURRENT
effective items (so the CasparCG ADD-data → PLAY flow honors any count);
growth beyond the stamped count applies at the next fresh play. Every
stamped row is a REAL nested scope: it runs the child's own lifecycle in
lockstep (offset 0), cascades pause/stop, and its inner content sources
join the ROW's content-driven hold — all by reuse of the D-025/D-026
machinery. Rows do NOT appear as per-instance namespaced field groups in
the parent; the single list field is the data surface, and the GDD derives
the list's ITEM SCHEMA from the child composition's fields.
**Why:** Tabular graphics (leaderboards, lineups, results) today need
manual duplication of elements per row; the repeater is the scalable
primitive. The instancing, field-scoping, and lifecycle-cascade groundwork
(D-025/D-026) plus the open list item shape (D-028) were built for exactly
this composition.
**Acceptance:**

- WHEN the operator picks the Repeater tool and clicks the canvas with at
  least one valid (non-cyclic) other composition in the scene THEN a
  repeater is added referencing the first valid composition (changeable in
  the inspector) with 3 seeded rows (item keys = the child's field ids,
  default values) and the authoring canvas shows the 3 rows; with NO valid
  composition the tool does not insert and a hint explains why
- WHEN `direction` is `'column'` THEN cells fill the box width (child
  aspect preserved) and stack top-to-bottom with `gap`; WHEN `'row'` THEN
  cells fill the box height and lay along the row axis ordered by `flow`
  (`'rtl'` default); overflow is clipped
- WHEN a row cell is edited in the items editor (inspector or preview field
  form — columns derived from the child's fields) THEN that row's rendered
  values update; unknown item fields are preserved (existing editor
  invariant)
- WHEN the operator sets a Data key THEN a `list` field is seeded from the
  authored items and bound `repeater-items`, and the GDD represents that
  field with an ITEM SCHEMA derived from the child composition's fields
  (types, constraints, required)
- WHEN `play()` runs THEN rows are stamped from the CURRENT effective items
  (a retained `update()` delivered before play is honored — 8 items ⇒ 8
  rows), clamped by `maxItems` when set
- WHEN `update()` delivers a list mid-hold THEN existing rows' values
  update live in place (positional — reordering values is live); a SHORTER
  list hides the surplus rows (re-shown if a later update regrows within
  the stamped count); a LONGER list takes effect at the next fresh play /
  cycle
- WHEN the child composition has its own out-point THEN every row holds at
  it and plays its own outro on `stop()` — lockstep (offset 0), exactly the
  D-026 nested semantics; `pause()`/`resume()` cascade into rows
- WHEN a row's child contains a content source (e.g. a countdown) THEN it
  participates in that ROW scope's content-driven hold — unchanged
  per-scope semantics; the lifecycle living spec is NOT modified by this
  item
- WHEN the chosen composition would create a cycle (self/ancestor) THEN the
  inspector blocks the selection, and the runtime's depth/visited guard
  renders an empty box if forced
- WHEN the operator scrubs the timeline THEN rows behave exactly as
  authored nested instances do (no new scrub rule)
- WHEN the composition is previewed and exported THEN behavior is
  identical; the exported file boots clean and `update()` with a different
  row count followed by re-play stamps the new count
- WHEN the existing test suite runs after the wiring refactor THEN it stays
  green — extracting the per-scope wiring into a reusable subtree factory
  is behavior-preserving for static trees
  **Notes:** New capability `designer-repeater-element`;
  `designer-playout-lifecycle` is NOT modified (rows are ordinary scopes —
  if implementation appears to force a wording change there, STOP and
  report). Depends on D-025/D-026 (merged); reuses the D-028 open
  `ListItemSchema` for items. Schema-first: `RepeaterElementSchema`
  (`type: 'repeater'`, required `compositionId`,
  `direction`/`flow`/`gap`/`maxItems?`, `items`). Runtime: `buildRepeater`
  (+ a row builder mirroring `buildComposition`'s inner stage; rows
  collected on `scope.repeaters`, NOT pushed into `scope.children` —
  wiring-tree yes, namespace-tree no) + `repeater-driver.ts` (stamp /
  teardown at fresh play, positional live values, hide-surplus; NOT a
  content source itself; no `whenComplete`); the centerpiece refactor
  extracts `createRuntime`'s per-scope wiring (driver instantiation +
  `buildScopeController`) into a reusable `wireScopeSubtree(scope, path)`
  factory with symmetric teardown, called by the driver per row. GDD:
  derive the bound list's item schema from the child's fields in
  `@cg/vcg-format` (extend the capability owning GDD list representation
  via `## MODIFIED Requirements` if one exists, else put the requirement in
  the new capability — report which). Designer: Repeater tool,
  `defaultRepeater`, `RepeaterSections` (composition select with the
  existing cycle guard, direction/flow/gap/maxItems, columned items editor
  — `ListItemsEditor` generalized with a `columns` prop derived from the
  child's fields, used by the inspector AND the preview form), Data-key
  flow mirroring ticker/sequence; `PlayoutSection` unchanged. OUT OF SCOPE
  v1 (record in design.md): live count changes mid-hold + per-row
  enter/exit transitions (the model-A follow-up), per-row stagger (D-032),
  grid layout, explicit `itemSize` override, guaranteed row drill-in.
  Change dir: `openspec/changes/archive/2026-06-13-add-repeater-element/`.

## [ ] D-031 — Multi-step templates (`steps`) + real `next()` ⟨priority: medium⟩

**What:** Author discrete steps in a template and wire CasparCG `next()` /
`runtime.next()` to advance between them.
**Why:** `TemplateRuntime.next()` is currently an optional stub; multi-step graphics
(builds, reveals) need it.
**Acceptance to be detailed when scheduled.**
**Notes:** schema (`steps`) → runtime `next()` implementation in
`@cg/template-runtime`. UPDATE (with D-029): the `next()` PLUMBING now
exists — `createRuntime` implements `next()` and cascades it per scope to
registered consumers (the D-029 sequence drivers are the first; CasparCG's
`CG NEXT` global was already wired). This item is therefore rescoped to the
authored multi-STEP model itself (discrete template states / step ranges)
plugging into that same dispatch — including defining its precedence vs.
in-scope sequences. No longer blocks D-029. Capture behaviour as an OpenSpec
change.

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

## [ ] D-039 — Ticker image/logo separators ⟨priority: low⟩

**What:** Let the ticker's `separator` be an image/logo instead of (or alongside)
a text glyph: the operator picks a logo from the project's asset/logo list and the
runtime renders it between items, sized to the band and vertically centred —
design TBD when scheduled.
**Why:** Branded crawls (channel bug between headlines) are a common broadcast
look; a text-only separator can't express it.
**Acceptance to be detailed when scheduled.**
**Notes:** extends the D-028 ticker (`TickerElement.separator` would widen to a
union, e.g. `string | { assetId }`); the treadmill driver already measures and
feeds separator nodes generically, so the work is mostly schema + asset
resolution + the inspector picker. Relates to the asset pipeline (preview blob
URLs / export inlining) the image element already uses.

## [ ] D-040 — Shared image library + logo element ⟨priority: medium⟩

**What:** A device-level **shared image library** (network logos, persistent
bugs) that lives ONCE outside any single project, plus the existing canvas
"logo/image" tool — currently inert — wired to pick from it. The operator
adds images to the shared library once; in any project a logo element
references one by id and the inspector's combo box lists the library. The
reference is a DESIGN-TIME convenience only: at export the resolved bytes are
INLINED into the `.vcg` / single-file HTML exactly like a per-project asset,
so the played file stays self-contained (CasparCG CEF on `file://` cannot
reach the library). Storage lives in a new `@cg/storage` namespace alongside
projects — "shared" means shared across projects ON THIS storage backend
(no central backend exists; if the operator points `@cg/storage` at a real
folder / network drive, OS-level sharing across machines falls out for free,
but that is the operator's setup, not a feature we build).
**Why:** A channel logo or persistent bug is reused across every project and
composition; re-importing it per project (the D-001 per-project flow, which
stays) is wasteful and drifts. The canvas already has a logo/image tool but
it inserts nothing and its picker is empty because the shared source it was
meant to read never existed.
**Acceptance:**

- WHEN the operator opens the shared image library and adds an image THEN it
  is stored in the shared `@cg/storage` namespace (not in any project) and
  appears in the library list, persisting across projects and sessions
- WHEN the operator removes a library image THEN it leaves the library list;
  projects that already EXPORTED it are unaffected (bytes were inlined), and
  a still-open project that only REFERENCES it falls back to a visible
  missing-asset placeholder with a clear warning (never a crash)
- WHEN the operator uses the canvas logo/image tool with a non-empty library
  THEN a logo element is inserted and selected (default sized to the image's
  aspect), referencing the first/selected library image; WHEN the library is
  empty THEN the tool does not silently insert nothing — it surfaces a hint
  to add a library image first
- WHEN a logo element is selected THEN its inspector shows a combo box
  listing the shared library (thumbnail + name) and changing the selection
  re-points the element to that image
- WHEN a scene containing a logo element is PREVIEWED THEN the live preview
  resolves the bytes from the shared library and renders them (asset
  resolution tries the shared library AND the project store)
- WHEN a scene containing a logo element is EXPORTED (`.vcg` or single-file
  HTML) THEN the resolved bytes are inlined (base64 / packaged) exactly like
  a per-project image — no external reference, and the exported file renders
  the logo with no network/`file://` access
- WHEN the same logo is used in two different projects THEN each resolves and
  inlines independently from the one shared source (no per-project re-import)
- WHEN a logo element references a library id that no longer resolves at
  export THEN export reports it via the existing preflight/validation path
  (blocked or clearly warned — consistent with how unresolved assets are
  handled today), not a silent broken export
  **Notes:** New capability `designer-shared-image-library`. Storage-first:
  add a shared-asset namespace + API to `@cg/storage` (mirror the existing
  per-project `AssetStore` surface — import/list/get/remove — but
  project-independent); reuse the existing asset byte/blob handling, do NOT
  invent a parallel encoding. Schema: a logo element kind (or the existing
  image element widened with a `source: 'project' | 'shared'` + the shared
  id) in `@cg/shared-schema` — pick the smaller diff and record which in
  design.md. The CENTRAL refactor + main risk: the asset resolver becomes
  TWO-SOURCE (shared-library first, then project) everywhere bytes are
  resolved — `apps/designer/src/platform/preview.ts` AND both exporters
  (`@cg/vcg-format` packaging + `ExporterSingleFile.ts` base64 inlining) —
  so a referenced library image is found in preview, `.vcg`, and HTML alike;
  this is where it most easily breaks and MUST be covered by tests on all
  three paths. Designer: a Shared Library panel/affordance to manage the
  device library (add/list/remove with thumbnails); wire the existing inert
  canvas logo/image tool + its inspector combo box to the library; the
  insertion guard mirrors D-030's (no library image ⇒ hint, no silent
  insert). Relates to D-001 (per-project assets, unchanged) and P-001
  (offline fonts — same "broadcast machines are air-gapped, inline
  everything" rationale). OUT OF SCOPE v1 (record in design.md): cross-
  machine/central sync (no backend), categories/folders/tagging in the
  library, SVG-specific handling beyond what the image element already does,
  per-project overrides of a shared image. Change:
  `openspec/changes/add-shared-image-library/`.

## [x] D-041 — Multi-select elements (canvas + layers) + shared-property editing ⟨priority: high⟩

**What:** Select multiple elements — on the canvas (shift/ctrl-click to
add/remove; plain click still replaces) and in the timeline layer rows (same
modifiers) — to move and delete them together, and edit their COMMON
properties at once from the inspector. With a homogeneous selection (e.g. two
rectangles) every property of that kind is editable; with a MIXED selection
(e.g. a text + an ellipse) only the shared properties show, and a field whose
values differ across the selection shows a "mixed" state until set. Editing a
shared field applies to every selected element as ONE undo step. Group MOVE
drags all selected elements by the same delta (one undo step) with a single
bounding-box gizmo around the whole selection; delete removes them all (the
existing multi-aware delete). Selection is the existing `Set<string>` — this
fills the `size === 1`-only gaps in the inspector, the gizmo, and drag.
**Why:** Today only a single element can be moved or have its properties
changed; there is no way to reposition, delete, or recolour several at once,
even though their properties largely overlap. The selection state is already
a set — the renderer just collapses to "single or nothing" everywhere.
**Acceptance:**

- WHEN the operator shift/ctrl-clicks elements on the canvas THEN each toggles
  in/out of the selection (a plain click still replaces the selection with the
  one clicked); the same modifiers on timeline layer rows build the same
  multi-selection, and the two surfaces stay in sync
- WHEN more than one element is selected THEN every selected element shows a
  selected affordance on the canvas (and its layer row is highlighted), and a
  single bounding box spanning the whole selection is shown
- WHEN a multi-selection is dragged on the canvas THEN all selected elements
  move by the same delta as ONE undo step; locked/hidden elements in the set
  are not moved (consistent with single-element drag)
- WHEN more than one element is selected THEN the inspector shows a
  multi-selection editor exposing only the properties COMMON to the selected
  kinds — for a homogeneous selection that is the full property set of the
  kind; for a mixed selection it is the shared subset (at minimum the common
  transform: position X/Y, width, height, rotation, opacity, and fill where
  all selected kinds have it)
- WHEN a shared property has the same value across all selected elements THEN
  the field shows that value; WHEN the values differ THEN the field shows a
  neutral "mixed" state and does not coerce them until edited
- WHEN the operator edits a shared property with several elements selected
  THEN the new value applies to every selected element as ONE undo step, and
  the canvas + inspector reflect it
- WHEN several elements are selected and Delete/Backspace is pressed THEN all
  selected elements are removed in one step (the existing multi-aware delete),
  unless an input/textarea/contentEditable is focused
- WHEN the multi-selection editor is shown THEN per-keyframe controls (the
  diamonds) are hidden — group editing in v1 sets static values only and does
  not add/alter keyframes
- WHEN exactly one element is selected THEN the inspector, gizmo, and drag
  behave exactly as today (no regression to single-selection editing)
- WHEN a multi-selection is reduced to one element THEN the full
  single-element inspector returns; WHEN it is cleared THEN the inspector
  shows its empty state
  **Notes:** Foundation item — no schema change; `selection` is already
  `ReadonlySet<string>` with `setSelection(ids[])`. The work fills the three
  `selection.size === 1` gaps: (a) `InspectorPanel.findSelected` →
  add a multi-selection path computing the shared-property set across the
  selected kinds and rendering a multi editor; (b) `CanvasOverlay` gizmo →
  a bounding-box-only gizmo for >1 (move, no resize/rotate handles in v1);
  (c) selection building → shift/ctrl branches in `CanvasOverlay.onPointerDown`
  and `ElementRow.onClick` (today both unconditionally `setSelection([id])`).
  Group edits fan out over the existing `updateElement(id, patch)` /
  `commitAnimatable(id, prop, value)` store methods wrapped in one undo
  transaction; group move reuses the existing drag delta applied per selected
  id; group delete already exists (`deleteSelection`, D-023) — keep it intact.
  Shared-kind property model: derive each kind's editable property set and
  intersect; "mixed" is a display state in the inspector inputs, not a schema
  value. OUT OF SCOPE v1 (record in design.md): marquee / rubber-band
  selection, group resize/rotate (bounding-box scaling), group keyframe
  add/edit, and aligning/distributing the selection. Change:
  `openspec/changes/archive/2026-06-14-add-multi-select-editing/`.

## [x] D-042 — Per-corner border radius + stroke for all background-capable elements ⟨priority: medium⟩ — archived: `openspec/changes/archive/2026-06-14-box-props-all-elements/`

**What:** Give every background-capable element (shape, text, ticker, clock,
sequence — NOT repeater, which has no background) both a **stroke/border** and a
**per-corner border radius** with a per-element toggle between a single uniform
value and four independent corners (matching the Loopic reference: a uniform
input + a toggle icon that expands to four side-by-side inputs in the right
inspector, four stacked rows Top-left / Top-right / Bottom-right / Bottom-left in
the timeline-left inspector). Shape already has both; the work extends them to
text/ticker/clock/sequence. Per-corner radius is keyframe-able on all five kinds;
this also fixes a latent bug where an animated 4-tuple cornerRadius is currently
broken even for shapes. Stroke stays keyframe-able for shapes as today; animating
stroke on the time-driven kinds (ticker/clock/sequence) is explicitly deferred to
D-052 (the runtime ungating), so those kinds get static stroke + a stroke section
now, with stroke keyframes only where the runtime already applies them.
**Why:** Border and rounded corners are basic box styling the owner wants on any
element that can have a background, not just shapes; and per-corner radius (a
common broadcast look) has no UI today and a half-done schema. Centralizing the
box properties also fixes the broken animated-tuple path.
**Acceptance:**

- WHEN any of shape/text/ticker/clock/sequence is inspected THEN it exposes a
  stroke section (color/width/dash) and a border-radius control, each grouped as
  in the single-element inspector; repeater (no background) does NOT
- WHEN the operator toggles a border-radius control to per-corner THEN it shows
  four inputs (right inspector: side-by-side; timeline-left: four stacked rows in
  tl/tr/br/bl order) and each corner is independently editable; toggling back to
  uniform collapses to one value
- WHEN the per-corner toggle state is set on one element THEN it is per-element
  (another element can be uniform at the same time) and persists on the element
- WHEN a per-corner radius is rendered (static) on any of the five kinds THEN the
  runtime emits the four-value border-radius (not a broken single value), and
  preview == export
- WHEN a static stroke is set on text/ticker/clock/sequence THEN the runtime
  renders the border (mirroring shape), in preview and export
- WHEN a corner radius is keyframed on any of the five kinds THEN it animates
  correctly (via per-corner sub-tracks recomposed each frame), fixing the
  previously-broken animated-tuple case for shapes too
- WHEN the operator toggles a per-corner radius back to uniform AND extra
  per-corner keyframe tracks exist THEN those extra tracks are removed in ONE
  undo step (no orphaned still-applied tracks — the B-014 class)
- WHEN stroke is keyframed on a shape THEN it animates as today (unchanged); the
  multi editor and timeline-left show the new box-property diamonds via the D-051
  registry; stroke animation on ticker/clock/sequence is NOT offered here
  (deferred to D-052)
- WHEN a scene authored before this change is loaded, played, previewed, and
  exported THEN it stays valid (uniform `number` cornerRadius still in the union;
  kinds without stroke before now simply have none until set)
  **Notes:** Depends on D-051 (registry drives the new descriptors' inspector
  presence + keyframe-ability across all three surfaces) — recon confirmed the
  registry left the seam (cornerRadius read/multiRead already union-aware). Scope
  decision: **Option A** — D-042 ships static stroke+radius on all five kinds +
  per-corner radius keyframing everywhere; stroke keyframing stays shape-only;
  time-driven stroke/background animation is D-052 (do NOT ungate applyStroke for
  non-shape here). Schema: a shared `BoxStyleSchema` mixin (`stroke?` +
  `cornerRadius: number | [tl,tr,br,bl]`) extended by the five kinds (shape
  already matches); keep `fill` vs `backgroundColor` as the per-kind background
  (do NOT unify). Add four animatable sub-property keys `cornerRadius.tl/tr/br/bl`
  for per-corner keyframing + tuple recomposition in `animation-applier`. Runtime:
  non-shape static tuple render + non-shape static border (mirror shape's
  branches); fix the animated-tuple path for ALL kinds incl. shape. UI: the
  uniform↔per-corner toggle in StyleSection reusing `VectorField`/`cg-input-group`
  (the Position-X/Y + shadow-offset pattern); timeline-left + multi-select follow
  via the registry. The cornerRadius-union change ripples to scene-builder,
  animation-applier, the registry read/multiRead, the inspector, AND `.vcg`
  export — verify export/import round-trips a 4-tuple. Toggle→uniform dropping the
  extra tracks reuses the B-014 orphan-track clearing approach. Change:
  `openspec/changes/box-props-all-elements/`.

## [ ] D-043 — Extended drop-shadow (outset/inset + spread) + text-shadow section ⟨priority: medium⟩

**What:** Drop-shadow gains outset/inset (no keyframe) and spread (keyframable) — the
full CSS box-shadow model; text elements additionally get a separate text-shadow
section (like drop-shadow but without outset/inset and spread).
**Why:** Current shadow is missing inset and spread; text has no dedicated text-shadow.
**Acceptance to be detailed when scheduled.**
**Notes:** schema-first (shadow model). New templates will rely on it.

## [ ] D-044 — Font-weight for plain text ⟨priority: low⟩

**What:** Add the font-weight control (already present on ticker/sequence) to the
plain text element.
**Why:** Plain text can't set weight today though ticker/sequence can.
**Acceptance to be detailed when scheduled.**
**Notes:** small schema/UI parity item.

## [ ] D-045 — Unify text alignment + vertical align for ticker/sequence + align is not keyframable ⟨priority: medium⟩

**What:** Make alignment consistent across text/ticker/sequence (the text model is the
target), add vertical align to ticker/sequence, and make alignment (horizontal AND
vertical) non-keyframable.
**Why:** Alignment differs per element type today; ticker/sequence lack vertical align.
**Acceptance to be detailed when scheduled.**
**Notes:** behavioral; must land before the D-048 visual polish (same controls). Loopic
refs: docs/designer-guide/sample-assets/D-045-align-0.png / -1.png.

## [ ] D-046 — Sizing=auto behavior (modal + squeeze off + no keyframes on text-metrics) ⟨priority: high⟩

**What:** Setting sizing to auto shows a confirm modal, disables auto-squeeze (set to
no), and forbids keyframes on font-size / font / letter-spacing / line-height —
existing keyframes on those four are removed and new ones blocked until sizing is set
back to fixed.
**Why:** auto sizing conflicts with keyframed text metrics; today it's unguarded.
**Acceptance to be detailed when scheduled.**
**Notes:** most sensitive behavioral item — touches the keyframe model + schema. Loopic
ref for the modal: (owner to add).

## [ ] D-047 — Layer reordering via drag (z-index) + drop indicator ⟨priority: medium⟩

**What:** Reorder layers (z-index) by dragging the layer-row title up/down, with a
horizontal drop-indicator line shown above/below the cursor at the droppable position.
**Why:** No way to change layer stacking order today.
**Acceptance to be detailed when scheduled.**
**Notes:** independent of the text chain; touches layer order + timeline interaction.

## [ ] D-048 — Inspector visual polish (align/padding/sizing buttons, text-settings popover, no blue button) ⟨priority: medium⟩

**What:** Match Loopic for the align buttons, the padding layout (four inputs side-by-
side, not one per row), and the sizing(auto/fixed)/auto-squeeze/text-wrap controls;
a small settings popover for text (font-weight/decoration/transform/variant/style); no
blue accent button inside the inspector — styles consistent with the properties panel.
**Why:** Current inspector controls are visually inconsistent with the reference.
**Acceptance to be detailed when scheduled.**
**Notes:** appearance only, no behavior change; MUST come after D-045/D-046 (depends on
their final controls). Loopic refs: docs/designer-guide/sample-assets/textalign.png-era
shots → D-045-align-0/1.png, D-048-textpadding-0.png, D-048-popover-0.png.

## [x] D-049 — Multi-select inspector parity + units + per-shape selection boxes ⟨priority: high⟩

**What:** Fix three follow-up gaps in the D-041 multi-selection editor so it
matches single-selection UX. (a) Shared properties render with the SAME
primitives as the single-element inspector — horizontal-drag number inputs,
grouped under their section headers (e.g. opacity and position X under
Transform), not a flat ad-hoc layout. (b) Properties with a display unit show
it exactly as single-selection does (opacity as `%`, and every other united
property likewise). (c) The multi-selection gizmo draws a selection box around
EACH selected shape individually (no single bounding box around the whole
group); dragging any one shape moves the whole selection. Keyframe-aware group
move is explicitly NOT in this item (tracked separately).
**Why:** D-041 shipped multi-edit with a bespoke flat editor that drops the
familiar drag-inputs, section grouping, and unit suffixes, and a whole-group
bounding box whose empty interior is draggable in a confusing way. These are
parity regressions against the single-element inspector the operator already
knows.
**Acceptance:**

- WHEN more than one element is selected THEN each shared property uses the
  same input primitive as the single-element inspector (horizontal-drag
  number fields, colour controls, etc.), not a different widget
- WHEN shared properties are shown THEN they are grouped under the same
  section headers as single selection (transform properties under Transform,
  etc.), in the same order, rather than a flat list
- WHEN a shared property has a display unit THEN the multi editor shows that
  unit exactly as single selection does (opacity in `%`; every other united
  property shows its unit)
- WHEN a "mixed" shared field is displayed THEN it still uses the correct
  primitive + unit and shows the neutral mixed state until edited (the D-041
  mixed behavior is preserved, just rendered with the right control)
- WHEN more than one shape is selected THEN a selection box is drawn around
  each selected shape individually and NO single group-spanning bounding box
  is shown
- WHEN the operator presses on one selected shape and drags THEN the whole
  selection moves together (group move is unchanged); pressing in empty space
  between shapes does NOT drag the group (there is no group box to grab)
- WHEN exactly one element is selected THEN the inspector and gizmo are
  unchanged (no regression)
  **Notes:** Follow-up to D-041 (`designer-multi-select`); extend that living
  capability via `## MODIFIED Requirements` (the multi-editor rendering + the
  gizmo box requirement), preserving all other scenarios. NO new behavior in
  group move/delete/selection-building, and NO keyframe change — group move
  stays keyframe-free here (the keyframe-aware version is a separate item).
  Likely files: `MultiSelectSection.tsx` (reuse the single-inspector input
  primitives + section grouping + unit formatting instead of bespoke widgets —
  factor shared render helpers out of `StyleSection`/`TransformSection` rather
  than duplicating), and `Gizmo.tsx` `MultiGizmo` (per-shape boxes, drop the
  union bounding box; keep the press-on-member group-drag, remove the
  empty-interior drag region). No schema change. Loopic single-inspector look
  is the reference for the input/unit styling. Change:
  `openspec/changes/archive/2026-06-14-fix-multi-select-inspector-parity/`.

## [x] D-050 — Multi-select: complete shared properties + single-undo panel edits + thicker box ⟨priority: high⟩

**What:** Finish the D-049 multi-selection editor. (a) Expose ALL properties
common to the selected kinds — not just the transform subset — so several
shapes (e.g. circles, or circles + rectangles) also share scale, stroke,
border-radius, drop-shadow, filter, etc.; the intersection is computed over
the real editable-property sets of the selected kinds (text/ticker/etc. still
contribute only what they genuinely share). (b) A shared-property edit typed
in the inspector commits as ONE undo step exactly like single selection —
keystrokes show live via onChange, but only Enter/blur records a history
entry (today the multi path records intermediate values, so many redos are
needed to revert one edit). (c) The per-shape multi-selection box is 1px
thicker for visibility. All of this stays keyframe-free — diamonds and
keyframe-aware group editing remain out of scope (separate item).
**Why:** D-049 restored input parity but the multi editor still lists only a
limited property subset (the original ask was ALL shared properties), and
inspector number edits in multi mode spam the undo stack with intermediate
values instead of one entry per committed edit.
**Acceptance:**

- WHEN several elements of the same kind are selected (e.g. two ellipses)
  THEN the inspector exposes every property of that kind (scale, stroke,
  border-radius, drop-shadow, filter, … — not just position/size/opacity),
  each grouped under its section
- WHEN a mixed-kind selection is selected THEN the inspector exposes exactly
  the properties common to all selected kinds (rectangles + ellipses share
  most shape properties; text/ticker contribute only their genuine overlap),
  computed from the kinds' real editable-property sets
- WHEN the operator edits a shared number field in the inspector THEN
  keystrokes update the value live (onChange) but ONLY Enter or blur records
  a single undo entry, and one undo reverts the whole edit across all
  selected elements (parity with single-selection commit-on-blur)
- WHEN a shared property is "mixed" THEN it still shows the mixed state and
  edits commit the same single-undo way
- WHEN more than one shape is selected THEN each per-shape selection box is
  drawn 1px thicker than before for readability
- WHEN exactly one element is selected THEN inspector, undo behavior, and
  selection box are unchanged (no regression)
- WHEN a shared edit or group move is made THEN no keyframe is created or
  altered (this item stays keyframe-free; diamonds remain hidden in multi)
  **Notes:** Second follow-up to D-041 (`designer-multi-select`); extend that
  living capability via `## MODIFIED Requirements` (the shared-property set +
  the single-undo panel-edit guarantee + the box thickness), preserving other
  scenarios. (a) widen the shared-property intersection helper
  (shared-properties.ts) to enumerate each kind's FULL editable-property set
  by mirroring the single inspector's prop ids + read accessors (there is no
  central metadata table — short-path duplication, kept in sync by comments
  at both sites; recorded as tech debt in design.md), then intersect; the
  multi editor renders each shared section with the existing single-inspector
  primitives (the D-049 `transform-fields.tsx` pattern). Agree/"mixed"
  computation applies per property as in D-049. (b) the panel-edit undo bug:
  the D-049 multi field wires onCommit=applySharedProperty and
  RealtimeNumberInput fires onCommit on every onChange keystroke, while
  applySharedProperty wraps each in runAsSingleHistoryEntry → one undo entry
  PER KEYSTROKE; fix by moving the applySharedProperty fan-out off onChange
  onto the commit handler (Enter/blur), one runAsSingleHistoryEntry per
  committed edit, onChange staying visual — matching single selection. (c)
  bump the `multiBox` border from 1px to 2px in `Gizmo.css.ts`. Group MOVE
  undo and keyframe-aware multi editing are explicitly OUT of scope here —
  they belong to the keyframe-aware item (diamonds + one-undo group drag).
  Change: `openspec/changes/archive/2026-06-14-complete-multi-select-shared-props/`.

## [x] D-051 — Central keyframe-ability + inspector-field registry (single source) ⟨priority: high⟩

**What:** Introduce ONE central, per-element-kind registry that declares, for
every property, (1) whether it is keyframe-able (shows a diamond) and (2)
whether/where it appears in the inspectors — and make all three consumers read
from it: the right inspector (StyleSection), the timeline-left inspector, and
the multi-select editor. This replaces today's scattered, hand-written
per-kind decisions so a NEW element kind or property is defined once and is
automatically correct everywhere. Pure refactor + correctness pass: behavior
is unchanged EXCEPT the explicit diamond corrections below. Diamonds present
on the right inspector for a property MUST also appear for that property in the
timeline-left inspector (and vice-versa) — the registry guarantees parity.
**Why:** Keyframe-ability and inspector-field presence are currently decided
ad-hoc in multiple files (StyleSection hand-writes each kind; the timeline
panel and multi-select duplicate property knowledge — the D-050 tech-debt
note). This drift produced wrong diamonds (some properties have a useless
diamond, some that should animate have none) and right/left-panel
inconsistency, and it means every new element kind re-introduces the risk.
**Acceptance:**

- WHEN any property is rendered in the right inspector, the timeline-left
  inspector, or the multi-select editor THEN its keyframe-ability (diamond)
  and its presence/section come from ONE central per-kind registry, not
  per-file hand-written logic
- WHEN a property shows a keyframe diamond in the right inspector THEN the
  same property shows a keyframe affordance in the timeline-left inspector,
  and vice-versa (no panel disagrees with the other)
- WHEN the clock's `digits` or `mode` is shown THEN it has NO keyframe diamond
  (discrete settings, not animatable)
- WHEN border-radius, drop-shadow / text-shadow, or box-padding is shown (on
  any kind that has them) THEN each IS keyframe-able (diamond present) in both
  panels
- WHEN a ticker's, clock's, or sequence's TEXT properties are shown THEN they
  are keyframe-able EXCEPT font-family, font-weight, and the alignments (which
  have no diamond), matching the text element's own rule
- WHEN font-family, font-weight, or any alignment (horizontal/vertical) is
  shown on any element THEN it has NO keyframe diamond
- WHEN a NEW element kind or property is added in the future THEN declaring it
  once in the registry makes its diamonds and inspector presence correct in
  all three consumers with no per-file edits
- WHEN scenes authored before this change are loaded, played, previewed, and
  exported THEN behavior is unchanged (this is a refactor; the only intended
  user-visible change is the corrected diamond set above)
- WHEN the existing animation/keyframe behavior is exercised THEN it is
  unchanged — keyframing, evaluation, the B-005/006/007 read-path fixes, and
  the D-049/D-050 multi-select rules all still hold
  **Notes:** Foundation refactor — supersedes the D-050 "short-path
  duplication" tech debt (the scattered property lists fold into the
  registry). NO schema change to the data model itself; the registry is a
  RENDERER/inspector concern (it describes how each kind's existing schema
  properties are presented + animated), unless recon shows keyframe-ability is
  better expressed in `@cg/shared-schema` — if so, report before doing it.
  This is a prerequisite reordered AHEAD of D-042 (per-corner radius) and the
  pending multi-select drag/realtime fix, so both land on the registry instead
  of re-introducing scatter. Likely touches: a new registry module (per-kind
  property descriptors: id, section, keyframeable, panel presence), consumed
  by StyleSection.tsx, the timeline-left inspector, and MultiSelectSection.tsx
  / shared-properties.ts (which collapses into reading the registry). High-risk
  area (touches the keyframe subsystem + the large StyleSection) — must go with
  thorough regression tests and a behavior-preserving proof (existing suite
  green BEFORE the diamond corrections are layered on). Change:
  `openspec/changes/archive/2026-06-14-add-keyframe-ability-registry/`.

## [x] D-052 — Keyframe-able styling for time-driven elements ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-15-ungate-time-driven-styling/`

**What:** استایلِ موجودِ ticker/clock/sequence (که امروز فقط ثابت است) را
**کیفریم‌پذیر** کن — همان الگوی cornerRadius در D-042. این انواع از قبل stroke /
رنگِ متن / backgroundColor / shadow / padding را به‌صورتِ static رندر می‌کنند؛ گیت
فقط روی animation است (دو لایه: field-registry که diamond نمی‌دهد، و runtime applier
که این استایل‌ها را به shape/text محدود می‌کند). D-052 آن گیتِ animation را برای این
سه نوع باز می‌کند.
**Why:** نویسنده باید بتواند رنگ/stroke/سایهٔ یک ticker یا clock یا sequence را
انیمیت کند (مثلِ shape/text)، نه فقط ثابت بگذارد. D-042 مرز را تمیز گذاشت
(cornerRadius از قبل باز شد)؛ این، بقیهٔ استایل‌ها را باز می‌کند.
**Acceptance:**

- WHEN روی ticker/clock/sequence یک track برای stroke (color/width/dash) اضافه شود
  THEN diamond در registry ظاهر می‌شود و runtime آن را روی band/box/stage root اعمال
  می‌کند (مثلِ stroke ثابتِ امروز)
- WHEN روی این سه نوع رنگِ متن (`color`) کیفریم شود THEN اعمال می‌شود و به items/
  digit span ارث می‌رسد (همان‌جا که static می‌نشیند)
- WHEN روی این سه نوع `backgroundColor` کیفریم شود THEN اعمال می‌شود — **فقط وقتی
  variant ِ solid ست است**؛ روی backgroundFill/colorFill ِ gradient هیچ diamond ظاهر
  نمی‌شود (gradient interpolate نمی‌شود)، دقیقاً مثلِ قاعدهٔ موجودِ fill.color
- WHEN روی این سه نوع shadow (offsetX/Y/blur/color) کیفریم شود THEN applier از
  `el.textShadow` می‌خواند و `text-shadow` می‌نویسد (نه box-shadow)، و اعمال می‌شود
- WHEN روی **clock یا sequence** padding (top/right/bottom/left) کیفریم شود THEN
  به‌صورتِ CSS padding روی root اعمال می‌شود
- WHEN روی **ticker** padding باشد THEN کیفریم‌پذیر **نیست** (معوق — padding ِ ticker
  روی inner viewport است و `viewportWidth` ِ درایور را تغذیه می‌کند؛ animate کردنش
  اندازه‌گیریِ crawl را desync می‌کند) — UI نباید diamond بدهد
- WHEN هرکدام از این استایل‌ها روی shape/text کیفریم شود THEN دقیقاً مثلِ امروز کار
  می‌کند (un-gating باید **additive** باشد؛ مسیرِ shape/text هرگز برداشته نشود)
- WHEN previewed و exported THEN رفتار یکسان است (همان runtime)

**Notes:** OpenSpec change با `## MODIFIED` روی دو capability ِ living:
`designer-inspector-registry` (carve-out پراپرتیهای حالا-فعال، مثلِ کاری که D-042
برای cornerRadius کرد) و `designer-box-styling` (اجازهٔ stroke animation روی
ticker/clock/sequence). کارِ runtime در `@cg/template-runtime` (اپلایرها) — بدونِ
capability ِ جدا؛ رفتار با specهای designer + تست‌های applier پین می‌شود. **پرخطر
(موتورِ پخش) — فاز ۱ recon انجام شد.** ticker padding عمداً معوق (follow-up). نکتهٔ
نام‌گذاری: مسیرِ animatable همان `text.color` است ولی روی این سه نوع فیلدِ static
به‌نامِ `color` است (یک object نیست) — اپلایر صرفاً node color را ست می‌کند.
Change: `openspec/changes/ungate-time-driven-styling/`.

## [x] D-053 — Multi-select number fields: drag + realtime with single-undo commit ⟨priority: high⟩

**What:** Restore single-selection UX to multi-select number fields: a field
scrubs by horizontal drag and updates live (onChange) while editing, AND each
committed edit (drag drop / Enter / blur) is exactly ONE undo entry. Replace the
D-050 type-to-edit workaround (drag + realtime removed) with the same model
single-selection uses — apply live without a history boundary so a burst
coalesces, set the boundary once on commit.
**Why:** D-050 made multi number-field undo deterministic by disabling drag and
realtime (commit-on-blur only), diverging from the single-selection feel the
owner asked for. Now that the cause is understood (applySharedProperty wraps
each apply in runAsSingleHistoryEntry — a leading+trailing boundary — so per-
keystroke/tick it spawned one undo each), the fix is to mirror the single drag:
live writes with no per-tick boundary (time-coalesced), one boundary on commit.
**Acceptance:**

- WHEN the operator drags a multi-select number field horizontally THEN all
  selected elements update live during the drag (realtime, like single
  selection), and the whole drag is ONE undo entry on release
- WHEN the operator types into a multi-select number field THEN the value
  updates live on each keystroke (onChange) across the selection, and the whole
  typed edit is ONE undo entry committed (a history boundary is set) on Enter or
  blur — exactly as single selection commits, isolated from the next edit
- WHEN the operator presses Escape while editing a multi-select number field
  THEN editing ends without a further change (parity with single selection — the
  last live value stays; Ctrl+Z reverts the whole one-entry edit). NOTE: this
  supersedes D-050's deferred "Escape discards" semantic, which the live model
  cannot honour (writes already applied on each keystroke)
- WHEN a committed multi edit is undone THEN one undo reverts the whole edit
  across all selected elements (no per-tick/per-keystroke undo spam)
- WHEN a multi-select number field is shown THEN it uses the SAME input
  primitive as single selection (drag-scrub enabled), not a type-to-edit-only
  field
- WHEN a shared field is "mixed" THEN it still shows the mixed state and edits
  commit the same single-undo, realtime way
- WHEN exactly one element is selected THEN its number-field behavior is
  unchanged (no regression to the single-selection scrub/commit path)
- WHEN a multi edit is made THEN it stays keyframe-free (this item does not add
  keyframes — keyframe-aware group editing is D-054)
  **Notes:** Follow-up to D-050 (`designer-multi-select`); reverses the
  type-to-edit trade-off in D-050's design.md. Root cause (confirmed in code):
  `applySharedProperty` (elements.ts) wraps the fan-out in
  `runAsSingleHistoryEntry` (leading+trailing `markHistoryBoundary`); fired per
  onChange it isolates every keystroke/tick into its own undo group, so D-050
  disabled realtime/drag. Fix: add a LIVE multi-apply path that fans
  `writeStaticAnimatable` over the selected ids WITHOUT a history boundary
  (writes time-coalesce in `store-core.set`'s COALESCE window, exactly like the
  single drag), and call `markHistoryBoundary()` once at the gesture/commit
  endpoint (drag drop / Enter / blur) — mirroring how single-selection drag
  coalesces ticks and boundaries only on pointerup. Re-enable drag-scrub +
  onChange-live on the multi number fields (remove D-050's `deferCommit` /
  `commitMode='blur'` on them); keep `applySharedProperty`'s boundary-wrapped
  form for discrete/instant commits (e.g. colour pick) that should each be one
  entry. Keyframe-free (writeStaticAnimatable); diamonds + keyframe-aware group
  move are D-054. Change: `openspec/changes/archive/2026-06-14-multi-select-realtime-fields/`.

## [x] D-054 — Keyframe-aware group move + diamonds in multi-select ⟨priority: high⟩

**What:** Make multi-select behave like single selection, fanned out. (1) Group
move on canvas is keyframe-aware: a selected member with a track on the moved
axis gets a keyframe at the playhead (as if dragged individually), else its
static base is written — exactly the single-drag rule. (2) The right-inspector
multi editor shows keyframe diamonds for properties keyframe-able across the
whole selection; clicking one toggles a keyframe on every selected element (one
undo). A partial selection (some members keyframed at this frame, some not) gets
a distinct THIRD diamond state (different colour). (3) Group field edits become
keyframe-aware too (Option B), so the same property never behaves differently
between a field edit and a canvas drag and the diamond never lies. D-053's
realtime/one-undo field behavior is preserved (an un-animated member still lands
on its static base — the keyframe-free path is just what the shared commit takes
for un-animated members).
**Why:** D-041/049/050/053 kept group editing keyframe-free (diamonds hidden,
group move/field edits write the static base) to avoid regressing the single
drag (D-006) and the B-005/006/007 read-path fixes. The owner wants group move
to keyframe animated members at the playhead and working diamonds in the multi
inspector — i.e. multi == single, fanned out.
**Acceptance:**

- WHEN a multi-selection is dragged on canvas AND a selected member has a track
  on the moved axis THEN that member gets a keyframe at the current frame holding
  the dragged value (as if dragged alone); a member with no track on that axis
  has its static base written; the whole drag is ONE undo entry
- WHEN a dragged member has a position track THEN the keyframe captures the
  evaluated-at-playhead start value plus the drag delta (B-005-safe — no revert
  to a stale base)
- WHEN more than one element is selected THEN the right inspector shows a
  keyframe diamond for every property that is keyframe-able for ALL selected
  kinds (per the D-051 registry); properties not shared/keyframe-able across the
  selection show no diamond
- WHEN every selected element has a keyframe at the current frame for a shared
  property THEN its diamond shows the "at-frame" (filled) state; WHEN none do,
  the "empty" state; WHEN SOME do and some don't, a distinct THIRD "partial"
  state (visually different colour)
- WHEN the operator clicks a shared property's diamond AND all selected already
  have a keyframe there THEN the keyframe is removed from all; WHEN some or none
  do THEN a keyframe is added to every selected element that lacks one — each as
  ONE undo entry across the selection
- WHEN the operator edits a shared property's value in the multi inspector AND a
  selected member has a track for it THEN that member keyframes at the playhead;
  an un-animated member gets its static base — same rule as the canvas drag, and
  still realtime + one undo on commit (D-053 preserved)
- WHEN exactly one element is selected THEN single-drag, the single inspector
  diamonds, commitAnimatable, togglePropertyKeyframe, upsertKeyframe, and the
  B-005/006/007 behavior are ALL unchanged (no regression)
- WHEN a scene is played/previewed/exported after a group keyframe edit THEN the
  keyframes behave identically to ones authored via single selection
  **Notes:** Final multi-select chain item; depends on D-051 (registry drives
  diamond presence) and D-053 (the live fan-out + onCommitBoundary infra).
  Confirmed reuse seam (recon): `commitAnimatable` (timeline.ts) already routes
  keyframe-at-playhead-vs-static internally; group paths must call THAT shared
  helper in a loop. (1) Group move: in `beginGroupDrag` (CanvasOverlay.tsx) swap
  the two `writeStaticAnimatable` calls → `commitAnimatable` (per axis, per
  member) — leading+trailing boundaries already correct; `m.x/m.y` are already
  the evaluated-at-playhead start (group-move.ts), so B-005-safe. (2) Field
  edits: add a keyframe-aware sibling of D-053's `applySharedPropertyLive` (loop
  `commitAnimatable`, no per-tick boundary, `onCommitBoundary` unchanged); point
  MultiSelectSection number fields at it. (3) Diamonds: render a point per shared
  keyframe-able property (gate on all-selected `isKeyframeable`), an aggregate
  variant (empty / at-frame / partial — add the third `KeyframeIndicator`
  variant), and a fan-out `togglePropertyKeyframe` over the selection wrapped in
  ONE `runAsSingleHistoryEntry`. DO NOT modify `commitAnimatable`,
  `togglePropertyKeyframe`, `upsertKeyframe`, or the single-drag handlers — only
  add new callers (the recon's near-zero-regression strategy). Group move stays
  position-only (resize/rotate group is still out); non-transform shared-prop
  diamonds (stroke/shadow/…) are field-edit-only. Mixed-kind: a property shows a
  diamond only if keyframe-able for every selected kind. Change:
  `openspec/changes/archive/2026-06-14-keyframe-aware-group-move/`.

## [~] D-055 — border-radius UI visual polish (match Loopic) ⟨priority: medium⟩

**What:** اصلاح ظاهرِ کنترلِ border-radius در inspector تا با تصاویرِ مرجعِ Loopic بخواند. عملکرد (از D-042) درست است؛ این فقط ظاهر/چیدمان است.
**Why:** کنترلِ فعلی کار می‌کند ولی ظاهرش با مرجع نمی‌خواند: حالتِ چهارگوشه فشرده است، toggle یک نوارِ جدا اضافه کرده، و آیکونِ حالتِ یکنواخت تودرتوست.
**Acceptance:**

- WHEN per-corner radius فعال است THEN چهار اینپوتِ تمیزِ کنارِ هم با diamond نمایش داده شود (نه فشرده با آیکونِ گوشه‌دارِ داخلِ هر اینپوت)
- WHEN حالتِ per-corner فعال است THEN toggle همان آیکونِ گوشهٔ راست باشد که شکلش تغییر می‌کند (نه یک نوارِ پهنِ جدا در ردیفِ پایین)
- WHEN حالتِ uniform فعال است THEN آیکونِ toggle مربعِ گوشه‌گردِ ساده باشد (نه آیکونِ تودرتو)

**Notes:** کاملاً ظاهری، بدون تغییرِ schema/runtime/spec behavior — focused fix، احتمالاً بدون OpenSpec change. مرجع: `docs/designer-guide/sample-assets/D-042-radius-0.png` (یکنواخت) و `D-042-radius-1.png` (چهارگوشه). وضعیتِ فعلی برای مقایسه: `D-042-radius-3.png` / `D-042-radius-4.png`.

## [x] D-056 — Strip box styling from content-driven element types ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-15-strip-box-styling-content-driven/`

**What:** انواعِ محتوا-محور (ticker/clock/sequence) **جعبه نیستند** — فقط متن/دیتای
خود را می‌آورند. box-styling (background رنگ+fill، border-radius، box padding،
path-style شاملِ stroke، box drop-shadow) را از این انواع بردار؛ اگر پس‌زمینه/سایهٔ
جعبه لازم است، یک shape ِ جدا زیرشان می‌نشیند (دیزاینر هماهنگ می‌کند). فقط
**text-shadow + رنگِ متن (شاملِ gradient) + font/text styling** روی این انواع می‌ماند.
المانِ `text` کاملاً **بدونِ تغییر** است (همه‌چیزش را نگه می‌دارد). repeater از قبل
box-free است (بدونِ تغییر). این بخشی از D-042/D-052 را برای این سه نوع **برمی‌گرداند**
— عمدی.
**Why:** این انواع ذاتاً محتوا-محورند؛ دادنِ box-styling ِ کامل بهشان یعنی تکرارِ کاری
که shape بهتر می‌کند، به‌علاوهٔ پیچیدگی (مثلِ تداخلِ gradient/background). معماریِ
لایه‌ای (shape ِ پس‌زمینه + متن رویش) تمیزتر است و با جریانِ Lottie/AF هم سازگار
(کلِ ظاهر درونِ asset پخته شده).
**Acceptance:**

- WHEN یک ticker/clock/sequence در inspector باز شود THEN کنترل‌های background،
  border-radius، box padding، stroke/path-style، و box drop-shadow **نمایش داده
  نمی‌شوند**؛ فقط رنگِ متن (شاملِ gradient)، Text Shadow، و font/text styling هست
- WHEN روی این انواع چیزی کیفریم شود THEN فقط transform/opacity/filter + رنگِ متن +
  shadow (text-shadow) کیفریم‌پذیرند؛ stroke/cornerRadius/background/padding **نه**
- WHEN این انواع رندر شوند (canvas/preview/export) THEN runtime هیچ background/
  stroke/border-radius/box-padding برایشان نقاشی نمی‌کند؛ فقط متن + text-shadow +
  رنگِ متن (شاملِ gradient)
- WHEN بخشِ سایهٔ این انواع دیده شود THEN عنوانش **"Text Shadow"** است (نه "Drop
  Shadow")، و offsetX/offsetY در **یک خط** هستند (مثلِ المانِ text) — جذبِ ب/ج
- WHEN المانِ **text** یا **shape** باز/رندر شود THEN box-styling‌اش دقیقاً مثلِ امروز
  است (reversionها kind-gated؛ text/shape هرگز لمس نمی‌شوند)
- WHEN یک stroke به‌صورتِ برنامه‌ای روی این انواع ست شود THEN برای آنها **نوشته
  نمی‌شود** (boxKind برای stroke به shape/text باریک شده — strict)

**Notes:** OpenSpec change با `## MODIFIED`/`## RENAMED` روی ۵ capability:
`designer-box-styling` + `designer-inspector-registry` (carve-back) و
`designer-ticker-element` + `designer-clock-element` + `designer-sequence-element`
(توصیفِ زیرمجموعهٔ styling). migration = گزینهٔ ب (schema فیلدها را نگه می‌دارد —
بدونِ تغییرِ breaking؛ دادهٔ مرده بی‌ضرر چون این انواع هنوز جایی استفاده نشده‌اند)،
**جز** boxKind برای stroke که strict باریک می‌شود. **برمی‌گرداند** D-042 (cornerRadius)
و D-052 (stroke/text-color/background/shadow/padding) را برای این سه نوع. B-016 برای
clock/sequence منتفی می‌شود (background رفت)؛ برای text جدا می‌ماند (B-016 ِ باریک).
repeater دست‌نخورده. **پرخطر (schema/موتورِ پخش/بازگردانیِ specها) — فاز ۱ recon انجام
شد.** Change: `openspec/changes/strip-box-styling-content-driven/`.

## [~] D-057 — Separate text-shadow and box-shadow on the text element ⟨priority: medium⟩ — change: `openspec/changes/separate-text-box-shadow/`

**What:** المانِ text باید **دو** بخشِ سایهٔ مجزا داشته باشد: «Text Shadow»
(`text-shadow`، روی متن) و «Box Shadow» (`box-shadow`، روی جعبه). امروز text فقط یک
بخشِ سایه در UI دارد (با نامِ غلطِ «Drop Shadow» که به `textShadow` وصل است). این
آیتم آن را به «Text Shadow» تغییرِ نام می‌دهد و یک بخشِ «Box Shadow» اضافه می‌کند
(روی فیلدِ `shadow` ِ box که از قبل در schema هست). همچنین برای **یکدستی**، بخشِ
سایهٔ shape (مستطیل/دایره) — که الان «Drop Shadow» نام دارد و به `box-shadow` وصل است
— نامش به «Box Shadow» تغییر می‌کند (فقط برچسب، بدونِ تغییرِ رفتار).
**Why:** text واقعاً یک جعبهٔ کامل است؛ هم سایهٔ متن هم سایهٔ جعبه معنا دارد، ولی
امروز فقط یکی در دسترس است و اسمش هم گمراه‌کننده است. نام‌گذاریِ یکدست («Text Shadow»
برای متن، «Box Shadow» برای جعبه) در کلِ اپ شفاف‌تر است.
**Acceptance:**

- WHEN المانِ text در inspector باز شود THEN دو بخشِ سایهٔ مجزا دارد: «Text Shadow»
  (روی `textShadow`) و «Box Shadow» (روی `shadow` ِ box)، هر دو مستقل
- WHEN روی text یک «Box Shadow» ست/کیفریم شود THEN به‌صورتِ `box-shadow` رندر می‌شود
  (مستقل از text-shadow) و کیفریم‌پذیر است
- WHEN روی text یک «Text Shadow» ست/کیفریم شود THEN به‌صورتِ `text-shadow` رندر
  می‌شود (رفتارِ امروز، فقط نامِ بخش از «Drop Shadow» به «Text Shadow» عوض شده)
- WHEN یک shape (مستطیل/دایره) در inspector باز شود THEN بخشِ سایه‌اش «Box Shadow»
  نام دارد (قبلاً «Drop Shadow») و رفتارش دقیقاً مثلِ امروز است (`box-shadow`،
  کیفریم‌پذیر) — فقط برچسب عوض شده
- WHEN previewed و exported THEN هر دو سایهٔ text یکسان رفتار می‌کنند

**Notes:** فیلدِ `shadow` ِ box از قبل روی text در schema هست (recon تأیید کند که در
UI نمایش داده نمی‌شود و در scene-builder/applier برای text رندر می‌شود یا باید اضافه
شود). فقط text بخشِ جدید می‌گیرد؛ shape فقط تغییرِ نام. انواعِ محتوا-محور
(ticker/clock/sequence) از D-056 فقط «Text Shadow» دارند — دست نمی‌خورند.
render/keyframe-touching → **دو-فازی (recon اول)**. احتمالاً `## MODIFIED` روی
capabilityِ مربوط به shadow/styling. Change: `openspec/changes/separate-text-box-shadow/`.

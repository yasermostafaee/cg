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
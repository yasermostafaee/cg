# Designer — backlog

Features for the visual editor (`apps/designer`). See `README.md` for the
format and how Claude processes these.

## [ ] D-001 — Image / asset import UI   ⟨priority: high⟩
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

## [ ] D-002 — Connect a real on-disk folder (File System Access)   ⟨priority: medium⟩
**What:** A "Connect folder" control + an indicator of the active storage
backend (folder / OPFS / memory).
**Why:** `workspace.connectDirectory()` (File System Access) exists but isn't
surfaced; operators can't choose a real library folder.
**Acceptance:**
- WHEN the operator clicks "Connect folder" THEN the browser folder picker opens
  and the chosen folder becomes the project library (remembered next session)
- WHEN no folder is connected THEN the UI shows the current backend (OPFS or memory)
**Notes:** `connectDirectory()` + handle persistence already in `@cg/storage`.

## [ ] D-003 — Replace window.prompt save/export with real dialogs   ⟨priority: medium⟩
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

## [ ] D-004 — Preview font + asset fidelity   ⟨priority: medium⟩
**What:** Make the live preview match the exported `.vcg` for fonts and assets.
**Why:** The Blob-URL preview inlines the scene but not fonts/assets, so Persian
shaping and images may differ from what the Runtime plays.
**Acceptance:**
- WHEN a scene uses a bundled font THEN the preview renders with that font (not a
  fallback)
- WHEN a scene has image elements THEN the preview shows them
**Notes:** depends on D-001 for assets; relates to P-001 (offline fonts).

## [ ] D-005 — Elliptical hit-testing for shapes   ⟨priority: low⟩
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


## [~] D-007 — redesign style and elements   (priority: high) — change: `openspec/changes/redesign-studio-loopic-style/`
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

## [~] D-008 — redesign and reorder style and elements   (priority: high) — focused fix, no openspec change
**What:** change the position of sceen tools
**Why:** it gets extra space
**Acceptance:**
- for top navbar just put this menu: Home(current it shows as projects), File, Edit, View, Help (we use options for these later)
- on the top of sceen : put zoomIn, zoomOut, percent, +, - , fit on the right side. and shape tools on the left side. 
- remove color picker from on top of sceen area. it is also exist in sceen properties area and it's enough
**Notes:** see the pic: `docs/designer-guide/sample-assets/D-008-pic-0`

## [~] D-009 — redesign and reorder style and elements   (priority: high) — focused fix
**What:** add other properties for shapes and text
**Why:** we need more properties for make a usefull animation
**Acceptance:**
- see deeply the screenshots and add all new properties and styles.
- add a line between framepoints like the screenshots.
- show the empty point icon for any layer.
- inside the properties area on the right we need separeted point icons for positionX and positionY, width and height, scaleX and scaleY like the screenshots `D-009-pic-2`.
- 
**Notes:** see all the pics for D-009: `docs/designer-guide/sample-assets/D-009-pic-*`

## [~] D-010 — add new properties   (priority: high)
**What:** add other properties for shapes and text on 2 areas: right area and the area on the left of the timeline.
**Why:** we need more properties for make an usefull animation
**Acceptance:**
- see deeply the screenshots and add all new properties and styles.
  1- add Path style, Border radius, Drop Shadow and Filter sections for the shapes.
  2- add Text, Drop Shadow, Text Padding, Border radius and Filter sections for the text.
**Notes:** see these pics : `docs/designer-guide/sample-assets/D-010-pic-*`


## [~] D-011 — project assets   (priority: high)
**What:** add new panel for project assets
**Why:** we need this panel to add our resourses like fonts or images for use them inside the project
**Acceptance:**
- add the panel to the left of the sceen panel
- keep the buttons and tools above of the sceen on its panel(sceen panel).
- we can add fonts and images by click on the add icon
- we can drag the images on the assets panel to the sceen and they became like a shape and we can add any points for them.
- if we add any font to assets we can see that font inside the select options font on Text section in properties panel on the right
**Notes:** see this screenshot : `docs/designer-guide/sample-assets/D-011-pic-0`

## [~] D-012 — Scene active region (resizable play window, total stays)   ⟨priority: high⟩ — change: `openspec/changes/add-scene-active-region/`
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

## [~] D-013 — Layer right-click context menu   ⟨priority: high⟩ — change: `openspec/changes/add-layer-context-menu/`
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
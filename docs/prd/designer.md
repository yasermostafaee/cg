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
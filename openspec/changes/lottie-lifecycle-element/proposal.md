# Lottie lifecycle element — import AE → bodymovin as a lifecycle-aware element (D-125)

## Why

Broadcast furniture (animated backgrounds, lower-thirds, bugs) is authored in After Effects and
exported through bodymovin/Lottie. Re-creating it natively is neither realistic nor desirable — we
want to **play** it, not port it. The pieces are already half-present and inert:
`LottieElementSchema` (`assetId`/`speed`/`loopMode`/`segment`/`fieldOverrides`), the `lottie`
manifest asset kind (`AssetKindSchema`, `KIND_BY_EXT` `json→lottie`), the `lottie-override` binding
target, and `@cg/lottie-bridge` (a real `lottie-web` wrapper + a real import allowlist) all exist —
but nothing is wired. `scene-builder` renders a placeholder div (`scene-builder.ts:156`),
`lottie-override` is a no-op pinned by a test (`bindings.ts:210`), `resolveBinding` never offers the
target, and the Designer has no tool, factory, or Inspector to create the element.

The gap that actually matters is **not** "play a Lottie". It is **LIFECYCLE**. An opaque,
self-playing animation only earns its place if it plugs into IN / HOLD / OUT — so a native ticker
can hold the graphic on air over it (the D-107/D-112 model, unchanged) and the outro still fires on
stop. The runtime today has **no** "play your outro now" hook: `out()` blanket-fades every
`[data-cg-content]` root for 400 ms and `stop()` hard-hides it, and only then do the controllers
play the BACKGROUND outro. The sole precedent for an element-owned exit is `SequenceDriver`'s D-116
`'exit'` phase, which resolves `whenComplete()` late. This change adds the element-outro seam the
Lottie needs, modeled on it.

## What Changes

- **Import → validate → place.** A `.json` / `.lottie` import validates through
  `@cg/lottie-bridge`'s allowlist (3D layers / expressions / effects / audio rejected with a readable
  reason), lands as a `lottie` asset (the store already writes `assets/lottie/<sha>.json`), and a new
  Lottie tool / drag-drop creates a `lottie` element on the canvas.
- **Opaque, positionable, timed.** The element is positioned / scaled / rotated / opacity-animated
  and timed on the timeline like any other element; the Inspector exposes speed, hold behaviour, and
  the phase mapping — but never the animation's internal keyframes (opaque by design; no keyframes
  are converted to native ones).
- **Phase mapping (new schema).** The element carries a **phase mapping** in the animation's own
  frame space — an intro-end and an outro-start frame, plus an optional idle segment — read from the
  bodymovin `markers` array when present, else marked by hand in the Inspector. `@cg/lottie-bridge`
  gains marker reading (it has none today). Those phases map **onto** the composition's shipped
  lifecycle (`outPoint` + optional `contentStart`, `LifecycleSchema`) **by phase** (intro↔IN,
  freeze/idle↔HOLD, outro↔OUT), not by rescaling the animation's frames.
- **Driven-frame render.** `scene-builder` mounts `lottie_light` (via the bridge, `autoplay: false`)
  and a new **`LottieDriver`** in `@cg/template-runtime` drives it frame-by-frame off the injected
  `RuntimeClock` (`goToAndStop`), exactly like the ticker/clock/sequence drivers — so pause/resume is
  in lockstep with the `FrameDriver` playhead with **zero drift** and the whole lifecycle is
  deterministic under a fake clock. On play the intro runs once and the element HOLDS (freeze at the
  hold frame by default, or loops the mapped idle segment opt-in).
- **The element-outro seam (the crux).** `out()` / `stop()` let each Lottie play its OUTRO
  (outro-start → op) **before** the background outro (content-first / background-last, per
  D-085 / D-105), awaiting all element outros, then playing the background and settling **CLEARED**
  with every driver halted. Modeled on `SequenceDriver`'s `'exit'` phase.
- **Content-driven hold participation.** The Lottie does **not** drive the content-driven hold by
  default (`drivesHold`-style opt-out — the **inverse** default of ticker/clock/sequence, whose
  absent flag drives). It can be opted IN, in which case its intro-completion (freeze) gates the
  hold; an idle-looping Lottie that opts in never completes and holds until `stop()` (like an
  infinite ticker).
- **Field overrides.** `lottie-override` stops being a no-op: text / colour (image if cheap) resolve
  through the existing fields/bindings model — a secondary path, since the native overlay carries the
  dynamic content.
- **Both exporters.** `.vcg` packs the JSON as `assets/lottie/<sha>.json` bytes (mirroring images);
  single-file HTML inlines the JSON as a JS literal (a `lottieAssets` map, like `scene`) **and** the
  player bundle, so it runs under CasparCG's CEF from `file://` with **zero external requests**.
- **Bundle strategy (OWNER DECISION — measured, recommended, not silently picked).** The player adds
  a fixed ~**425.7 KB** (unminified, `minify:false` as `bundle-runtime.mjs` ships today) / ~68.5 KB
  gzip to the export bundle. See `design.md` §D5 for the measurements and the recommendation
  (conditional second esbuild entry), left for owner review.

## Capabilities

- **`designer-lottie-element`** (NEW capability, `## ADDED Requirements`) — import→validate→place;
  opaque/positionable/timed; marker vs manual phases; intro-once then hold (freeze/idle); the native
  ticker on top drives the hold and the Lottie does not by default (opt-in); stop/out plays the
  Lottie outro then the background and settles CLEARED; pause/resume lockstep; field overrides through
  the existing bindings model; preview == `.vcg` == single-file HTML, running under CEF from
  `file://` with zero external requests.
- **`designer-playout-lifecycle`** (`## MODIFIED Requirements`) — the composition's IN / HOLD / OUT
  and the coordinated exit gain the **element-outro seam**: `out()` / `stop()` await each
  element-owned outro (the Lottie) before the background outro, preserving content-first /
  background-last and the CLEARED settle.

## Impact

**Schema (`@cg/shared-schema`)**

- `elements.ts` — extend `LottieElementSchema` with a `phases` mapping (intro-end / outro-start +
  optional idle segment, in animation frames), a `holdBehavior` (`'freeze'` default | `'idle-loop'`),
  and a `drivesHold` opt-in (absent ⇒ does **not** drive — the inverse of ticker/clock/sequence).
- `bindings.ts` — no shape change (`lottie-override` already `{ elementId, layer, prop }`); tighten
  `fieldOverrides` once the bridge lands.

**Lottie bridge (`@cg/lottie-bridge`)**

- Switch `runtime.ts` from the full `lottie-web` build to `lottie-web/build/player/lottie_light`
  (zero `eval`/`new Function`, no WASM, ES5-era — the CEF-from-`file://` requirement).
- Add marker reading + `markersToSegments` (`markers[]` → intro/idle/outro segment frames; validity
  rules + fallback to manual). The wrapper already exposes `goToFrame` / `autoplay:false`, so the
  driven-frame model needs no new player capability.

**Runtime (`@cg/template-runtime`)**

- Add `@cg/lottie-bridge` as a dependency (it is not one today — this is what puts `lottie_light` in
  the bundle and under the CEF-compat scan).
- `scene-builder.ts` — replace the lottie placeholder with a `createLottiePlayer` mount.
- New `lottie-driver.ts` (`reset`/`start`/`pause`/`resume`/`stop`/`destroy`/`whenComplete` +
  `playOutro()`), a `scope.lotties` collection, and the element-outro seam in `runtime.ts`'s
  `out()`/`stop()` (await element outros before `playBackgroundOutroAndSettle`).
- `bindings.ts` — implement the `lottie-override` case through the bridge.
- Driver plugs into the pause/resume/reset/stop/remove cascades and the `RuntimeClock`.

**Exporters**

- `@cg/single-file-export` — new `lottie-export.ts` (`collectLottieElements` / `resolveLottieAsset`,
  mirroring `image-export.ts`); `ExporterSingleFile` inlines the JSON into a `lottieAssets` map and
  includes the player bundle.
- `apps/designer/src/platform/Exporter.ts` — `#gatherBinaries` packs `assets/lottie/<sha>.json` +
  an `AssetEntry { kind: 'lottie' }`; the `.vcg` boot builds `lottieAssets`.
- `packages/single-file-export/scripts/bundle-runtime.mjs` + `cef-compat.test.ts` — emit the player
  bundle (per the §D5 strategy) and extend the CEF-compat artifact scan to cover it.

**Designer UI (`apps/designer/src/renderer`)**

- `features/assets/ProjectAssetsPanel.tsx` — a `Lottie…` import item + widen `importKind` union +
  delete-warning copy (the `lottie` asset kind, `AssetStore` path, and `mimeOf` already exist).
- `state/store-core.ts` (`DesignerTool`) + `features/canvas/CanvasToolbar.tsx` — a Lottie tool.
- `state/element-defaults.ts` — a `defaultLottie` factory (mirror `defaultImage`).
- `features/canvas/CanvasOverlay.tsx` — placement branch + the `onDrop` seam (drag a lottie asset).
- `features/inspector/StyleSection.tsx` — a `LottieSections` (speed / hold behaviour / phase mapping),
  replacing the current Filter-only fall-through for `lottie`.
- `features/fields/bind-resolver.ts` — offer `lottie-override` as a selectable target (+ a layer/prop
  picker); `describeBinding` already renders it.
- `platform/preview.ts` — extend the iframe `assetUrls` seam to deliver the Lottie JSON (a
  `lottieAssets` map) to `createRuntime`.

**Docs**

- PRD `docs/prd/designer.md` D-125 → `[~]`; engine doc-sync for the changed runtime contracts
  (`docs/engines/overview.md`, `packages/template-runtime/README.md`,
  `apps/designer/src/renderer/features/canvas/README.md`).

## Notes / non-goals

- **OUT OF SCOPE v1** (per PRD): converting a Lottie into editable native paths/keyframes; editing the
  animation internals; AE expressions (rejected by the importer's allowlist); mask / matte / trim-path
  fidelity guarantees beyond what the player itself renders (precedent: D-109 deferred external SVG
  path import).
- **Player stays a CANDIDATE.** `lottie_light` is the leading candidate on the artifact scan, but per
  the B-066 lesson it is confirmed only by a real smoke test on **CasparCG 2.3.x CEF hardware**;
  modern Chrome proves nothing. That hardware smoke is a **pre-archive gate** (see `design.md` §D7).
- **CI reality (until ~Aug 1):** GitHub Actions quota is exhausted — a red `required` check is a
  billing block, not a code failure. The gate for THIS design-only step is `pnpm format:check` +
  `pnpm openspec validate`. The implementation prompt that follows requires local `pnpm gate` +
  `pnpm gate:e2e` on Linux/WSL/Docker plus the CEF hardware smoke before archive.

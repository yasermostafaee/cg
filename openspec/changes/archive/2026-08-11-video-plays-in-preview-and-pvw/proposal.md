# Video must be VISIBLE in PVW and must keep PLAYING across a preview rebuild

## Why

**Two filed bugs, no shared root — and that separation is the point.** Both are "a video is missing
where it should be", both were found in the same live session, and they have nothing else in common:
different application, different asset scheme, different surface, different mechanism. They are
fixed in one change because they were diagnosed together, not because they share a cause.

- **[[B-136]] — the Runtime's PVW never showed a video at all.** `apps/runtime/index.html` declared
  no `media-src`, so media fell through to `default-src 'self'`. PVW replays an already-exported
  single-file page inside an `<iframe srcDoc>`, and a `srcdoc` document INHERITS its embedder's
  CSP — enforced IN ADDITION to the artifact's own, intersection wins. The artifact has carried
  `media-src data:` since D-128 Phase 5, so it was always willing to play its own bytes; the page
  around it was not. Images, fonts and inline scripts all survived the intersection because the
  Runtime CSP admits them, and **media was the only class it omitted** — which is exactly why only
  video was invisible while the rest of the scene rendered.

  **NOT a regression.** `git log -S"media-src" -- apps/runtime/index.html` returns zero commits
  across all eight the file has ever had. The Designer gained the directive at `aa0138a` (D-128
  Phase 2), the moment it first needed to play video; the Runtime was never given the equivalent
  when Phase 5 taught the exporter to inline video. There was never a working state to regress from.

  Why it is not cosmetic: it never reaches air, but `runtime.md`:2059 already requires that "an
  operator must **never** be able to believe PVW is showing the real picture". A PVW that silently
  omits an element teaches the operator to trust a picture that is not the picture.

- **[[B-137]] — a video froze in the Designer preview after any scene rebuild.** The preview iframe
  pools the live `<video>` and transplants it back over the freshly built one, so a transform-only
  edit never re-fetches the media. Nothing re-pointed the newly built `VideoDriver` at it. The
  driver commanded a DETACHED, src-less orphan — and a detached element with a valid `src` plays
  quite happily, reporting success — while the node the operator could SEE was the one the OUTGOING
  driver explicitly paused during teardown. No code path ever played that one again.

  The pause was also STICKY: the preview forces a rebuild whenever it is handed a non-empty Lottie
  map, and that map came from `lottieAssetCache.getAll()` — the whole MODULE-LEVEL cache. Deleting
  the Lottie ELEMENT does not evict the parsed ASSET, so the rebuild-forcing condition stayed true
  for the rest of the session and undoing the change could not undo the freeze. The stickiness lived
  in module state, not in the engine, which is why reopening the preview cured it and removing the
  element did not.

  **NOT a regression** either: the structure dates to `c41bba8` / `cb5a3ad` (2026-07-23 / 26) and is
  untouched across the window the report suspected. The build is where it was NOTICED.

**Both mechanisms were code-derived when filed, with no live observation. This change OBSERVES
both** — each fix landed behind a test that failed first, for the diagnosed reason.

## What Changes

- **`apps/runtime/index.html` gains `media-src 'self' data:`** — and nothing else. No other
  directive is touched or loosened. Deliberately NARROWER than the Designer's `'self' blob: data:`:
  nothing in `apps/runtime` creates an object URL, so admitting `blob:` would widen the policy past
  the need.
- **`@cg/template-runtime`'s video handle re-resolves its node.** A `live()` resolver re-queries by
  `data-cg-element-id` when the captured node reports `isConnected === false`, and every handle
  member reads through it. HOST-AGNOSTIC by construction: any harness that reparents nodes is
  covered without knowing this driver exists. It reuses the re-pointing `recover()` already performs
  on a different trigger rather than inventing a second mechanism.
- **The Lottie map a preview is handed is SCENE-SCOPED** (`getForScene`), killing the stickiness at
  source: delete the Lottie and the rebuild-forcing condition goes false. No player that could ever
  have mounted is lost — an id the scene does not reference could not have mounted one.
- **A rejected `play()` is REPORTED, once per element.** The silence was load-bearing to this bug's
  invisibility: a driver commanding an orphan looked like nothing at all for weeks. Once per
  element, latched, on a path that can be re-entered every tick — the logging is part of the fix,
  not a nicety, and must not become a per-frame spam source.

## Impact

- **Affected specs:** `runtime-ui` (PVW renders every element kind the artifact carries),
  `designer-video-element` (the preview keeps media playing across a rebuild).
- **Affected code:** `apps/runtime/index.html`, `packages/template-runtime/src/runtime.ts`,
  `apps/designer/src/renderer/features/assets/lottieAssetCache.ts`,
  `apps/designer/src/renderer/features/fields/PreviewModal.tsx`.
- **On-air risk: NONE for B-136** (PVW is a pre-air monitor; the CSP change cannot reach the
  CasparCG output, which already renders video correctly). **B-137 touches `@cg/template-runtime`,
  which IS on the export path** — but the new resolver is inert unless a node is detached, which
  never happens in an exported page or on hardware, and the `recover()` precedent it follows is
  already live there.
- **Docs:** `packages/template-runtime/README.md` gains the driver's node-binding contract.
- **Related, not fixed here:** [[B-138]] — `preview.ts`'s unresolved-asset branch has an `IMG` leg
  only, so a missing VIDEO is silently invisible. Filed with its mechanism; see the item for why it
  is not folded in.

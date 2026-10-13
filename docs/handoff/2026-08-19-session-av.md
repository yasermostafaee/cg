# Session AV — Stage C2: the Designer's arrangement authoring surface (stage C is complete)

**Read at `1b05cf68886c6eb69540a6519e965158d077923e`, pulled 2026-08-19.** It **matched** the
expected tip `1b05cf68`; no delta.

⚠ `git pull --ff-only` errored with _"Cannot fast-forward to multiple branches"_ — a local quirk
(the `design/live-source-multibox` branch has a `[gone]` upstream), not a tree problem. Verified
instead with an explicit `git fetch origin dev` + `git ls-remote`, which agree. Worth knowing before
the next session reads it as a real failure.

⚠ **The owner's uncommitted `tools/caspar-bridge/src/template-http-server.ts` was not touched.**
Every commit staged explicit paths and `git diff --cached --stat` was read before each.

**Gate: green and uncached — `89 successful, 89 total` / `0 cached, 89 total`.**

---

## 0. C1's owed Linux `gate:e2e` is DISCHARGED

Commit `1b05cf68`: <https://github.com/yasermostafaee/cg/actions/runs/32241631336> —
`conclusion: success`, with the **`E2E (Playwright)` job having RUN** (`success`, not `skipped`).
Recorded in `tasks.md` beside the stage-C header so the evidence outlives this session.

---

## 1. 🔴 The two findings, and both came from the code rather than the plan

### `arrangements` were on the wrong document

C1 put them on the root `Scene`, reasoning that an arrangement positions box INSTANCES so it belongs
to the thing containing them. **That is right about the runtime and wrong about authoring**, because
this Designer has no root-scene editing surface at all — `editSceneOf` says so in its own first
line: _"No 'main scene': editing always targets a composition"_. With arrangements only on the
Scene, two compositions in one project would share one arrangement list, and the second author to
touch it would silently retune the first's boxes.

`Composition.arrangements` now exists too, and `editSceneOf` **projects** it onto the working scene —
the same one-way mechanism `resolution`, `frameRange`, `activeRange`, `lifecycle`, `playout`,
`editorBackdrop`, `layers`, `fields` and `bindings` already use. **A projection, not a second
spelling**: the Scene field is the projection's TARGET and the only thing `collectArrangements` ever
reads.

### 🔴 `setArrangementView` could not move a box — and C1's tests could not see it

C1 built it to make the MASK follow a moved plate, and it does. But **nothing moved the plate.**
`sceneMaskHoles` consumes the geometry override, so every C1 test passed while the boxes never
budged: **the matrix asked where the HOLE was and never where the BOX was.**

`applyArrangementToNodes` is the missing half. It touches ONLY the elements an arrangement names,
plus those it previously moved and no longer does (so switching back RESTORES) — writing
`width`/`height` onto an auto-sized text element would destroy D-060's content sizing, and writing
`display` onto a lifespan-gated element would un-hide it mid-timeline.

⚠ **The lesson is not "add a test" but WHICH test.** C2's acceptance reads the box's real rendered
rect out of the preview iframe, so it asks the question an operator would. Asserting the store, or
the option list, is exactly how `autoSqueeze` (`B-147`), `resolvePlateAspect`'s `assumed` flag
(`B-143`) and `liveLayers()` (`B-145`) all passed while being unreachable.

⚠ **A stale bundle masked it for two rebuild cycles.** `bundle-runtime.mjs` regenerates
`single-file-export`'s `src/generated`, but the Designer imports its **dist** — so the chain is
`template-runtime` → `single-file-export` → `designer`, and skipping the middle build leaves the
iframe running yesterday's runtime while every grep says the code is there. `dist` held **0**
occurrences of the new function while `src/generated` held 2. Red-then-green is only evidence with
the WHOLE chain rebuilt.

---

## 2. What the surface is

- **The arrangements list** — a collapsible section in the right panel beside Playout, because an
  arrangement is a property of the COMPOSITION. Carries the list, the per-count default (★), the
  cell geometry, and 5.4's mode + duration + easing.
- **The active-arrangement selector** — in the **canvas header**, always visible. It is not in the
  right panel on purpose: that panel switches to element properties the moment you select something
  to adjust, which is exactly when you need the selector.
- **The timeline rows** — the eye reports `resolveVisibility`'s ANSWER and, with an arrangement
  active, writes THAT arrangement's opinion. A diamond marks an override and clicking it clears it.
- **D4's flag** — beside the element, shown only when the composition has arrangements.

**Invariants held:** no count field anywhere (every count is computed from `cells.length` at
display); one default per COUNT, maintained on add and on delete and scoped to the count so one
click cannot strip every other count's default; visibility only ever through the one function.

---

## 3. The preflight was not the clean swap the plan assumed

The plan expected `live-source-overlap`'s INPUT to be swapped. **It cannot be**, and the reason is
structural: that loop runs PER COMPOSITION DOCUMENT and `collectFlat` descends into containers only,
never into a `composition` instance. Under A′ each box IS an instance, so two boxes are never
flattened into one coordinate space and **that loop cannot fire between them, with or without
arrangements.** There was nothing to suppress; what was missing was the check.

So it is an ADDITION: a per-arrangement pass over the SHARED flattener, so the preflight and the
canvas measure the same hole. **The rule itself is unchanged.** `arrangementViewOf` moved into the
state slice so both consumers use ONE mapping — if they disagreed, the author would be shown an
overlap the canvas does not display, or a clean canvas that fails export.

---

## 4. What to check

⭐ **The §5 walkthrough is automated as `apps/designer/tests/e2e/arrangements.spec.ts`** and passes
3/3 against the built `dist`. What it does, and what I saw:

1. authors a Box composition (plate + title) and nests two instances of it;
2. adds a 2-box and a 1-box arrangement — the picker lists both, labelled from `cells.length`;
3. switches between them and **reads the first box's rendered rect out of the iframe**: 464 px wide
   in the 2-box arrangement, full-frame in the 1-box one. Before `applyArrangementToNodes` it was
   464 px in **both**, which is how the gap was found.

Plus a negative control (no picker until an arrangement exists) and the per-count default rule.

⚠ **What I did NOT do: drive the app by hand and take screenshots.** The walkthrough is executed by
the spec against the real built app and the real preview iframe, which is stronger evidence than a
screenshot for the geometry claim — but it is not a human looking at the styling, and steps 6 and 7
of §5 (setting a mode/duration by hand, reading the refusal in the UI) are covered by unit tests
rather than by eye. Worth ten minutes with the Designer open.

---

## 5. Flags

- 🔴 **A Linux `gate:e2e` is OWED for this session** — it is a Designer UI change with a new E2E
  spec. Discharge it on the pushed commit and record the run URL in `tasks.md`.
- ⚠ **`arrangementViewOf`'s positional mapping is an AUTHORING convenience, not the runtime rule.**
  Box instances in document order fill cells in order. At play time which box lands in which cell is
  decided by which sources are LIT (D1), which is an operator fact that does not exist while
  authoring. The two agree only when every declared source is lit. Stage E is where that stops being
  a safe simplification, and it should be re-read then.
- ⚠ **Cell geometry is authored as NUMBERS, not by dragging on the canvas.** The section exposes
  x/y/width/height per cell. Dragging a cell directly on the canvas is the obvious next affordance
  and is not built.
- **Still open before Stage E:** `tasks.md` 2.8 (`B-145`'s display half), untouched this session as
  instructed.
- **Anchor drift:** `live-source-preflight.ts:178` had moved — the overlap loop now starts at 315,
  pushed down by my own C1 stamped-scope refusal. `CompositionsPanel.tsx:54` and
  `CanvasOverlay.tsx:544,688` (`canNestCompositionInActive`) all held.

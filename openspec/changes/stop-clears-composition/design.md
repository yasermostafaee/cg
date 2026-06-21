# Design — Stop / close = CLEARED (D-085)

> **STEP-0 RECON.** Read-only current-state map + locked-design decisions. No source/test/build
> touched. `proposal.md` / `specs/` / `tasks.md` are intentionally left as scaffold. All claims
> below are `file:line` against the post-D-087 tree (branch `feat/D-085-stop-cleared` off
> `main@04fe219`). D-085 currently lives only in `docs/ROADMAP.md:68` (`[DESIGN]`) — it is **not
> yet** a `docs/prd/designer.md` entry; filing it is part of the implement phase, not recon.

## Locked design (Option 1 "CLEARED")

On Stop, after the OUT/outro finishes (or **immediately** when there is no outro), the WHOLE
composition is CLEARED from the stage — NOT frozen on its last frame — taking content-driven
elements (ticker / clock / sequence) and nested children with it, with no manual per-element
opacity-out keyframes. No default fade-out (deferred). ADDED requirement on
`designer-playout-lifecycle`.

---

## CRITICAL FIRST QUESTION — what did D-087 already change, and does Stop already go blank?

**Answer: YES, post-D-087 the stage already goes blank on Stop — and it is a VISIBILITY clear,
not a true unmount.** Concretely:

- The runtime has modelled "blank on settle" since D-026/D-028 (pre-D-087): the ROOT scope's
  settle adds `body.cg-pending`, and `.cg-pending .cg-stage { visibility: hidden }`
  ([css.ts:20-22](packages/template-runtime/src/css.ts#L20)) hides the entire stage
  (`built.container` is the `.cg-stage`, [scene-builder.ts:67-68](packages/template-runtime/src/scene-builder.ts#L67)).
- **What D-087 changed** is _only_ the Designer **preview document**, not the runtime: pre-D-087
  the preview lifted `.cg-pending` with an `!important` override so the operator saw frame 0,
  which ALSO meant a stopped composition stayed visible (the original D-085 complaint — content
  lingered because the overlay was lifted). D-087 added the `broadcast` flag +
  `REVEAL_ON_LOAD` gate ([preview.ts:50](apps/designer/src/platform/preview.ts#L50),
  [:84-88](apps/designer/src/platform/preview.ts#L84), [:168](apps/designer/src/platform/preview.ts#L168),
  [:329](apps/designer/src/platform/preview.ts#L329)); the Preview **modal** now passes
  `broadcast: true` and does NOT lift `cg-pending`. So in the modal (and always in the export)
  Stop → `cg-pending` → the stage (incl. ticker/clock/sequence) goes blank.
- It is a **VISIBILITY overlay, not a true clear**: on settle the runtime calls `.stop()` on
  every driver and adds `cg-pending`; `built.container` and every element node stay **mounted**
  (hidden). The drivers are **stopped**, not left ticking under the overlay (see §3). A genuine
  unmount (`built.container.remove()` + `cg-removed`) exists only on the separate `remove()` /
  CG REMOVE path ([runtime.ts:599-609](packages/template-runtime/src/runtime.ts#L599)).

**Consequence for D-085:** the locked behaviour ("clear after OUT, immediate when no outro,
content-driven + nested go too, not frozen on last frame") is **already produced** by the
existing runtime, and D-087 made it observable in the preview. D-085 is therefore **mostly an
ADDED spec requirement + proving tests**, NOT a risky lifecycle rewrite — _provided_ we accept
the visibility-clear mechanism (recommended below). The existing spec even already says Stop
"settle[s] hidden" ([designer-playout-lifecycle/spec.md:173-174](openspec/specs/designer-playout-lifecycle/spec.md))
and that self-settle freezes nested crawls (spec line 131-145) — D-085 names the guarantee
("CLEARED", proven for content-driven + nested) and locks it with tests.

---

## Current-state map (post-D-087, file:line)

### 1. Runtime lifecycle — `createRuntime` / `play` / `stop` / `pause` / IN-HOLD-OUT / outPoint

- `createRuntime` builds the stage and adds `cg-pending` (blank) immediately
  ([runtime.ts:117-125](packages/template-runtime/src/runtime.ts#L117); `cg-pending` add :122).
- IN/HOLD/OUT is per-scope in `PlayoutController`: intro `[active.in → outPoint]`, frozen hold at
  `outPoint`, outro `[outPoint → active.out]`; `outPoint = lifecycle.outPoint ?? active.out`
  ([playout-controller.ts:181-183](packages/template-runtime/src/playout-controller.ts#L181)),
  so an **absent out-point ⇒ empty outro ⇒ instant settle**.
- `stop()` = `cascade(rootNode, c => c.stop())`
  ([runtime.ts:562-570](packages/template-runtime/src/runtime.ts#L562)). Controller `stop()`:
  settled→no-op, else force last cycle + `startOutro()`
  ([playout-controller.ts:133-141](packages/template-runtime/src/playout-controller.ts#L133)).
- The OUT completes at `onOutroEnd` → `settled = true` → `onSettle()`
  ([playout-controller.ts:236-252](packages/template-runtime/src/playout-controller.ts#L236)).
- **After OUT completes the composition lands HIDDEN (cg-pending), MOUNTED, drivers stopped —
  NOT frozen-visible and NOT unmounted.** The ROOT's `onSettle` is `onRootSettled`
  ([runtime.ts:326-331](packages/template-runtime/src/runtime.ts#L326),
  [:470-479](packages/template-runtime/src/runtime.ts#L470)); a non-root scope's `onSettle` is
  `stopScopeContent` ([runtime.ts:312-316](packages/template-runtime/src/runtime.ts#L312)).
- `remove()` is the only TRUE-clear path: `destroy()` every subtree + `built.container.remove()`
  - swap `cg-pending`→`cg-removed`
    ([runtime.ts:599-609](packages/template-runtime/src/runtime.ts#L599)).

### 2. `cg-pending` — set / cleared / re-added; what it does to the DOM

- **Set:** `createRuntime` ([runtime.ts:122](packages/template-runtime/src/runtime.ts#L122)).
- **Cleared:** `play()` at play-start ([runtime.ts:511](packages/template-runtime/src/runtime.ts#L511)).
- **Re-added ("settle"):** `rootOnSettle` ([runtime.ts:181-185](packages/template-runtime/src/runtime.ts#L181)),
  called from `onRootSettled` ([runtime.ts:478](packages/template-runtime/src/runtime.ts#L478)).
  **"Settle" fires when the ROOT controller's OUT completes** (`onOutroEnd → onSettle`,
  controller:236-252) — i.e. after the outro, or instantly for an empty outro. It is NOT a timer
  and NOT after the intro/hold; it is the terminal of an exit (manual `stop()` OR a finite
  auto-out / loop-cycle / content-driven completing on its own).
- **DOM effect:** purely CSS visibility — `.cg-pending .cg-stage { visibility: hidden }`
  ([css.ts:20-22](packages/template-runtime/src/css.ts#L20)). The nodes stay in the DOM; nothing
  is removed. (`.cg-removed .cg-stage { display: none }` is the separate `remove()` state,
  css.ts:23-25.) **This overlay is exactly the mechanism D-087 already toggles — the crux of the
  overlap question.**

### 3. Content-driven drivers (ticker / clock / sequence) — do they keep running after stop?

- **They are STOPPED at settle, not left ticking.** `onRootSettled` sweeps `t.stop()` / `c.stop()`
  / `s.stop()` / `r.stop()` across every subtree **before** `rootOnSettle` adds `cg-pending`
  ([runtime.ts:472-477](packages/template-runtime/src/runtime.ts#L472) then :478). A non-root
  scope also stops its own drivers at its own settle (`stopScopeContent`, runtime:312-316).
- Driver `stop()` cancels the animation frame: e.g. `TickerDriver.stop()` paints the final offset
  then `cancelFrame()` ([ticker-driver.ts:250-255](packages/template-runtime/src/ticker-driver.ts#L250)).
  So the crawl/clock/sequence loop halts — no rAF/timer runs under the hidden stage. (This is the
  existing "Root self-settle takes every nested scope off air" guarantee, spec:131-145.)
- **DOM residue:** `stop()` leaves the driver's nodes (e.g. fed ticker spans) in place (hidden);
  `reset()` is what releases them ([ticker-driver.ts:264-283](packages/template-runtime/src/ticker-driver.ts#L264)),
  and `play()` calls `reset()` on every driver, so a later run starts clean. Content-driven
  elements have **no opacity-out** — they don't fade; they vanish when `cg-pending` hits. That is
  the locked design (no fade; clear at the terminal).

### 4. Nested compositions (D-024/025/026) — cascade on clear

- Children are wired into a controller tree paralleling the scope tree (`ScopeNode`,
  [runtime.ts:63-67](packages/template-runtime/src/runtime.ts#L63); `cascade`
  [runtime.ts:465-468](packages/template-runtime/src/runtime.ts#L465)).
- Manual `stop()` cascades `c.stop()` to every controller (runtime:569); each nested scope plays
  its OWN outro then settles (its `onSettle = stopScopeContent`). On the ROOT's settle,
  `onRootSettled` ALSO `cascade(... c.stop())` + sweeps ALL subtree drivers (runtime:471-477),
  and `rootOnSettle` adds `cg-pending` to `body`, hiding **every** nested child at once
  (runtime:183). So nested children are cleared (hidden) + their drivers stopped + their
  controllers settled. **Edge:** if a child's outro outlasts the root's, the root settle's
  `cg-pending` hides that child mid-outro (the parent governs the global clear) — minor, note in
  the spec.

### 5. Preview (`preview.ts` + `PreviewModal`) — so clear-on-stop is observable/testable

- `#buildHtml(scene, broadcast)` ([preview.ts:77](apps/designer/src/platform/preview.ts#L77));
  the modal passes `broadcast: true` (PreviewModal load), so the document does NOT lift
  `cg-pending` (`pendingOverrideCss` empty, [preview.ts:84-88](apps/designer/src/platform/preview.ts#L84);
  `REVEAL_ON_LOAD = false`, :168; reveal gate :329). Hence Stop → `cg-pending` → blank is visible
  in the modal.
- Transport: `PreviewModal` `onStop` → `dispatch.stop()` → `post({ action: 'stop' })`
  ([PreviewModal.tsx:201](apps/designer/src/renderer/features/fields/PreviewModal.tsx#L201),
  [:235-236](apps/designer/src/renderer/features/fields/PreviewModal.tsx#L235),
  [:326](apps/designer/src/renderer/features/fields/PreviewModal.tsx#L326)); the modal also posts
  `stop` on close/unmount (:280). The iframe handles `action === 'stop'` → `window.stop()`
  ([preview.ts:392-393](apps/designer/src/platform/preview.ts#L392)).
- `window.stop` is `runtime.stop()` (CG STOP), `window.remove` is `runtime.remove()` (CG REMOVE)
  ([caspar-globals.ts:37-45](packages/template-runtime/src/adapters/caspar-globals.ts#L37)) —
  the two are deliberately distinct.

### 6. Export runtime (.vcg / single-file HTML) — same terminal path?

- **Yes — identical.** Single-file HTML boots `<body class="cg-pending">` then
  `CG.createRuntime(scene, …)` + `CG.installCasparGlobals(runtime)`
  ([ExporterSingleFile.ts:277-283](apps/designer/src/platform/ExporterSingleFile.ts#L277)); the
  `.vcg` `index.html` does the same `createRuntime` + `installCasparGlobals`
  ([Exporter.ts:304-310](apps/designer/src/platform/Exporter.ts#L304)). Both share the one
  `@cg/template-runtime` source (ExporterSingleFile header comment, :48), so CG STOP →
  `runtime.stop()` → outro → `cg-pending` is byte-for-byte the same on air as in the preview.

---

## Decisions (current → options → recommendation). NOT implemented here.

### A. Terminal mechanism — TRUE clear (unmount) vs VISIBILITY clear (cg-pending)

- **Current:** VISIBILITY clear (`cg-pending`, visibility:hidden) + driver `.stop()` + controller
  settle. A true unmount exists only on `remove()` (CG REMOVE).
- **Option A1 — VISIBILITY clear (RECOMMENDED).** Keep/extend the `cg-pending` overlay the
  settle already toggles (and D-087 already drives in the modal). Rationale: (1) **avoid double
  mechanisms** — one overlay, already wired; (2) **matches CasparCG** — STOP = play-out + hide,
  REMOVE = destroy; `caspar-globals` maps them distinctly (caspar-globals:37-45), so making STOP
  unmount would conflate the two; (3) **cheap, safe re-play** — `play()` just removes
  `cg-pending` + resets drivers (§E), no rebuild; (4) lowest risk for a HIGH-RISK lifecycle file.
- **Option A2 — TRUE clear on stop (NOT recommended).** Make settle empty `built.container`
  (like `remove()`), so a later play re-builds from scratch. Costs: collides with `remove()`'s
  `removed` lock ([runtime.ts:599-604](packages/template-runtime/src/runtime.ts#L599)) which
  blocks `play()`; needs a NEW rebuildable "cleared-but-replayable" state; loses the painted-OUT
  frame; deviates from CG STOP. High risk, no user-visible gain over A1 (both look blank).
- **Recommendation: A1.** D-085's "clear" = the existing `cg-pending` settle, asserted and
  spec'd. Treat A2 as explicitly out of scope unless a concrete requirement (e.g. memory of a
  giant template between runs) forces it later.

### B. Timing — clear AFTER outro; immediate when none

- **Current already correct.** The clear fires at the ROOT `onSettle` = `onRootSettled` →
  `rootOnSettle` (cg-pending). The OUT runs first (`startOutro`→`onOutroEnd`→`onSettle`,
  controller:229-252); an **empty outro is detected by `outPoint === active.out`**
  (controller:181-183) and settles instantly. **Hook to use: `onRootSettled` / `rootOnSettle`
  (runtime:470-479 / 181-185)** — no new timing needed.

### C. Content-driven drivers actually STOPPED (not just hidden)

- **Current already correct:** `onRootSettled` sweeps `t/c/s/r.stop()` (runtime:472-477) before
  `cg-pending`; non-root scopes via `stopScopeContent`; driver `stop()` cancels rAF
  (ticker-driver:250-255). If the implement phase wants belt-and-suspenders against any future
  overlay-lift, it could `reset()` (release DOM) at settle instead of `stop()` — but that drops
  the painted OUT frame, so **keep `stop()`**; the test (below) is what guards the guarantee.

### D. Nested cascade — parent clear clears children + stops their drivers

- **Current already correct** (runtime:471-477 + body `cg-pending` hides all nested; manual stop
  cascade :569). D-085's job is to **prove** it (nested-child-GONE test) and spec the edge where a
  longer child outro is cut by the parent settle.

### E. Re-play after clear — fresh intro, no stuck `settled`, drivers re-init

- **Current already correct:** `controller.play()` calls `reset()` first (clears `settled`/phase)
  then `startIntro()` ([playout-controller.ts:118-122](packages/template-runtime/src/playout-controller.ts#L118));
  `runtime.play()` removes `cg-pending` (:511), re-stamps repeaters (:518-523), resets tickers
  (:526) / clocks (:531-536) / sequences (:539), then `cascade(c => c.play())` (:544). Already
  proven by the repeater E2E (play → stop → `cg-pending` → play → 4 fresh rows,
  `repeater.spec.ts` test 2). No reset-path work needed.

---

## File-touch list (implement phase — for reference; NOT touched in recon)

Given Recommendation A1, the expected footprint is **spec + tests, with at most a small runtime
hardening**:

- `openspec/changes/stop-clears-composition/` — fill `proposal.md`, `tasks.md`, and
  `specs/designer-playout-lifecycle/spec.md` (`## ADDED Requirements`: "Stop clears the
  composition" — terminal CLEAR via the settle overlay; content-driven + nested go too; not
  frozen on last frame; no default fade; re-play is fresh).
- `docs/prd/designer.md` — file the D-085 item (`## [ ] D-085 …`), flip the ROADMAP line.
- `packages/template-runtime/src/runtime.ts` — **only if a test exposes a gap.** Most likely a
  comment/assertion that the settle path is the single CLEAR; possibly hoist a driver `.stop()`
  to `onExitStart` if the team wants content frozen the instant Stop is pressed (vs at settle) —
  a scope decision, default NO.
- `apps/designer/tests/` (unit) + `apps/designer/tests/e2e/` (Playwright) — new coverage (below).
- No bridge / schema / exporter / `preview.ts` changes expected (the seam already exists).
- Engine doc-sync: `packages/template-runtime/README.md` — document Stop = CLEARED terminal vs
  Remove = unmount, if the README doesn't already.

## Test + E2E plan

- **Unit (`@cg/template-runtime`, fake clock):** with a content-driven scope, after `stop()`
  settles: (a) `body.classList.contains('cg-pending')` is true; (b) the ticker/clock/sequence
  driver's `isRunning`/rAF is false (no frame scheduled); (c) `built.container` is STILL in the
  DOM (visibility clear, not unmount — guards against an accidental A2). A nested-parent case:
  after parent `stop()` settles, the nested child's driver is stopped and `cg-pending` hides the
  body.
- **E2E (Playwright, broadcast preview):**
  - _Content-driven GONE after Stop:_ author a ticker (or sequence), open the modal (`broadcast`),
    Play (crawl visible), Stop → assert `previewFrame body` has `cg-pending` AND the ticker
    item/text is hidden (`toBeHidden()`), AND no `[data-cg-ticker-item]` keeps moving (final
    offset stable). Mirrors the D-087 blank-on-stop assertion but specifically on a content-driven
    element.
  - _Nested child GONE after Stop:_ a parent nesting a child with a bound text; Play (child text
    visible, per `regressions.spec.ts` D-026 cascade), Stop → assert the child's text is hidden
    and `body.cg-pending`.
  - _Clean re-play:_ Stop → Play again → the composition re-runs the intro and the content is
    visible again (guards decision E end-to-end).
  - Reuse fixtures: `openPreviewModal` / `play` / `stop` / `previewFrame` (designer.ts:554-593).

## Top risks

1. **"It's already done" over-confidence.** The strongest claim here is that A1 is ~free. Risk:
   an unproven edge (a driver kind whose `stop()` doesn't cancel its loop, or a scope whose
   settle path differs). Mitigation: the unit tests assert "no frame scheduled" per driver kind
   (ticker/clock/sequence/repeater) — if one fails, that's the real D-085 code change, localized.
2. **Manual-stop nested timing.** A child outro longer than the parent's is cut by the parent
   settle (runtime:478 hides body). Acceptable per locked design, but must be spec'd so it isn't
   later read as a bug.
3. **Scope creep to A2 (true unmount).** Tempting to "really clear" the DOM; it conflicts with
   `remove()` and re-play. Keep A2 out unless a concrete need appears.
4. **HIGH-RISK file.** `runtime.ts` lifecycle is dense and shared by preview + both exporters; any
   real change must run the full `@cg/template-runtime` + `@cg/designer` gate AND `pnpm test:e2e`,
   not just unit — a regression here breaks on-air playout, not only the editor.

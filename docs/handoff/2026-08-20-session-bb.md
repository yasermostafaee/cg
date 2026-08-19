# Session BB — LOOKS phase 2: the Designer authoring UI. A′ disabled, not deleted.

## THE STATE, first (read this cold)

- **Remote:** `origin/dev` = the SHA the session report quotes (the handoff commit is the tip;
  the last FEATURE commit is `2ee11fe5`). **Safe to pull — every step landed and was pushed at
  its own checkpoint.**
- **All six BB steps landed** (1 toolbar/slice · 2 sources surface + plate picker · 3 looks list ·
  4 the selector wired to `setActiveLook` · 5 A′ entry points disabled · 6 the refusal family
  surfaced), plus the e2e acceptance walk with four screenshots in `docs/handoff/img/bb-*.png`.
- **BA's owed Linux `gate:e2e` went GREEN**:
  <https://github.com/yasermostafaee/cg/actions/runs/32278566981> — attempt 2, `success`, the
  `E2E (Playwright)` job RAN (10 m 51 s). Attempt 1 was an apt-mirror stall killed at
  `timeout-minutes: 20` **before Playwright started** — infrastructure, not the suite. Recorded
  in `tasks.md` §1b.
- 🔴 **CORRECTION (same evening): the run on `2ee11fe5` was RED** —
  <https://github.com/yasermostafaee/cg/actions/runs/32288446144>, two failures, both this
  session's and both fixed in the follow-up commit that carries this note: (1) `looks.spec`
  placed plates by viewport-relative clicks, so on CI they landed overlapping, the preflight
  refused the export with an alert the fixture auto-dismisses, and the download wait timed out —
  the grid is now WRITTEN in scene coordinates through the Transform panel (deterministic, and
  six more D-154-class panel→canvas writes); (2) `icon-pack.spec`'s toolbar pin predates the
  multi-frame button — updated for the deliberately changed surface. **BB's `gate:e2e` is
  therefore discharged only by the run on the FIX commit or later** — the session report quotes
  it; check it before building on top.
- **The single next action:** author the real 6-box debate template by hand (the walk below), then
  phase 3 — stage D's reconcile on the look carrier (`tasks.md` §1b), and later P2.DEL (the A′
  CODE deletion — re-scoped, still open).

## 1. What you can now do in the Designer

1. **Toolbar** (right end of the tools): **Add multi-frame group** — one per template (v1);
   the button disables itself once the group exists.
2. **Looks section** (right panel, composition scope): declare **sources ONCE**
   (`live-1` … — add/remove; the routeKey is fixed at declaration), add **looks**, rename them,
   set the **default** (★ — what a fresh take enters), open a look's contents (✎), remove a look
   (its sub-scene composition stays in the project).
3. **A plate references a declared source through a PICKER** — with a group in the project the
   free-text source-id field does not exist. A dangling value shows as "(undeclared)".
4. **The Active-look selector** (canvas header) switches the canvas through
   `runtime.setActiveLook` — phase 1's D.5 seam, now with its first production caller. No
   "as authored" option: exactly one look is always active, like the operator's picker (§14.5).
5. **Refusals appear IN the Looks section while you work** — undeclared reference, same source
   twice in one look, cross-boundary overlap, second group — same wording as the export
   preflight, which still blocks export.

## 2. A′ — disabled, NOT deleted (owner decision, 2026-08-19)

The Arrangements section, the arrangement picker, the cell overlay and the per-element D4
checkbox are **unmounted**; their code compiles and their 38 unit tests still pass, so a bug in
the new surface cannot strand you — the old code is one revert away. The A′ E2E spec is skipped
with the decision cited. **`tasks.md` §1b P2.DEL is re-scoped to the CODE deletion**, due once a
real template has been authored on the new path.

## 3. The acceptance walk (already run headlessly; screenshots committed)

`apps/designer/tests/e2e/looks.spec.ts` performs it: new project → group → six sources →
6-box look (six plates via the picker + title) → solo look → selector switch (6 visible plates
↔ 1) → export carries `lookGroups`. Stills: `docs/handoff/img/bb-step3…`, `bb-step4…`,
`bb-step5…`, `bb-step5b…`.

🔴 **What a screenshot could NOT show, and what the DOM said instead:** the stage is
transparent, so a hidden look and an absent one photograph identically — the spec asserts the
hidden looks' plates have **no bounding box at all** (`display: none` up the instance chain, not
merely covered); and panel→canvas coherence is asserted by **writing** Transform X = 320 and
requiring the rendered box to land at 320 × scale (the D-154 regression class). Both held.

## 4. Notes and honest edges

- **Two defects the walk itself caught, both fixed in-session:** `addLook` auto-selected the new
  instance, flipping the right panel to element properties and hiding the very section in use
  (creation now leaves nothing selected); and the canvas hit-test would have sent a click or the
  D-024 double-click drill to the TOPMOST look rather than the shown one — hidden looks'
  instances are now excluded from hit-testing.
- **§6.7 was scoped:** there is no e2e fixture for a `.vcg` re-import walk. The spec asserts the
  exported single-file HTML carries the group (`lookGroups`, the look ids); the scene→carrier
  round-trip is pinned at unit level (`scene-doc` projection test, `look-carrier` tests). The
  "Export (.vcg)" button exists — a hand re-import check is worth one minute of your time.
- `exportHtml` in the spec timed out ONCE and passed on re-run (3.2 s total) — not reproduced;
  noted rather than diagnosed.
- **`D-152` already describes the source-declaration surface** (BA's rewrite) — nothing added,
  nothing minted.
- Sources UI is add/remove/name-at-declaration; `expectedAspect`/`dynamic` are schema-carried but
  not yet surfaced — a phase-3-adjacent nicety, not a blocker.

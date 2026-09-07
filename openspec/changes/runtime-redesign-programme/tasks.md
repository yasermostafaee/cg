# Tasks — `RUNTIME-REDESIGN-01`, the ten phases

🔴 **READ THIS BEFORE CHOOSING A PHASE.** This file is the programme's phase state.
`docs/ui-reference/runtime-redesign/PROMPT.md` is the authority for what each phase MEANS; this
file records which are done. **Each session takes the next unfinished phase, finishes it, and
reports.** Do not start a later phase because an earlier one looks easy — the ordering is
load-bearing and stated at each step.

**Phase state at 2026-09-07:** Phase 1 COMPLETE. Phases 2–10 not started. Next: **Phase 2**.

**Every phase from 2 onward owes a Linux `e2e` run URL beside its ticked item.** A ticked box with
no URL is not a discharge — it is a claim, and the next reader cannot check it (golden rule 12).

---

## Phase 1 — Discovery and the deletion guard _(no product code)_ — COMPLETE

- [x] 1.1 Read the repo instructions and all twelve golden rules, the OpenSpec process, the Runtime
      source tree, the bridge channel contracts in `packages/shared-ipc`, the shared UI primitives
      (`ui/Modal.tsx`, `ui/focusTrap.ts`, `ui/Tabs.tsx`, `ui/Notice.tsx`, `ui/RecordDialog.tsx`) and
      the token home `renderer/theme.ts` with its `tokenHome.test.ts` guard. No component, function
      or path below was guessed; each was located by grep against the tree at `869e2719`.
- [x] 1.2 **THE MAP** — `design.md` §1, in four tables (shell and chrome · the layers card · the
      Inspector and monitors · the dialogs) plus the token home. Every surface the reference
      touches, the component that renders it today, and the bridge channel that feeds it.
- [x] 1.3 **THE DELETION GUARD** — `design.md` §3. **Twenty-six surfaces**, built from the source
      tree rather than taken from `PROMPT.md` §1.3 (which supplies seven). Each carries where it
      lives now, what it looks like after the redesign, and a named test. **Twenty-one already have
      a test that asserts they render under their condition; five do not and are owed by Phase 9** —
      `BridgeSkewBanner`, `RasterMismatchBanner`, `FailoverBanner`, the restore-MIGRATIONS strip,
      the delegated `Tooltip`, and the context-menu suppression. (That is five components plus the
      suppression, which shares no component of its own.)
- [x] 1.4 **The change document** — this change: `proposal.md`, `design.md`, `tasks.md` and the
      `runtime-ui` spec delta that makes the guard a requirement rather than a note.
- [x] 1.5 **The two open questions surfaced, not decided** — `design.md` §4 (where the bridge is
      single-channel today, per namespace, with `stack` named as the one that decides Phase 7) and
      §5 (what identifies the audit actor once the picker is gone, with the three options the owner
      must choose between).
- [x] 1.6 **Three contradictions with `PROMPT.md` recorded** — `design.md` §0: the reference DOES
      draw a lock screen (and on a dialog primitive, which §9 forbids adopting); its audit log has
      no actor column at all; its Station-setup section set already matches the app's five.
- [x] 1.7 **No product file changed.** The reference itself is committed by path in this session so
      the authority for all ten phases is in the repo rather than in one machine's working tree.

## Phase 2 — Tokens and primitives _(no visible change beyond colour)_

- [ ] 2.1 Bring the reference's palette into `renderer/theme.ts` as ROLE tokens — `--bg #0b1017`,
      `--surface #141b25`, `--raised #1b2532`, `--inset #0e151e`, `--line #2d3a49`, `--soft #24303d`,
      `--text #eef3f9`, `--secondary #bbc8d7`, `--muted #8e9eaf`, and the accent pairs `blue #74cdf6`
      / `mint #85e4b6` / `purple #c3acff` / `amber #f3cd88` / `red #ffaaa7` with their `*bg`
      companions. 🔴 No literal anywhere; `tokenHome.test.ts` stays green, its positive control
      included.
- [ ] 2.2 Geometry becomes tokens — row padding, action-button heights, the icon-button box.
      ⚠ Keep `--r-modal-foot-h` as a FLOOR: a height that belongs to being a footer cannot be a
      function of what a section puts in it.
- [ ] 2.3 🔴 State what the new palette does to the measured decisions and do NOT overwrite them:
      the marked-row fill `rgb(145 93 5)` and the inks measured at 5.06:1 and 3.86:1. If contrast
      changes, report the new numbers and ASK.
- [ ] 2.4 Re-measure every semantic ink against the new surfaces — on air, refusal amber, danger
      red — and say which now fail their ratio.
- [ ] 2.5 `pnpm --filter @cg/runtime test:e2e` run locally, and a Linux `e2e` run URL recorded here.

## Phase 3 — The layers table

- [ ] 3.1 🔴 **RED-FIRST, BEFORE TOUCHING THE TABLE: `Update` does not take.** For a row that does
      not own the live layer, an Update must cause no `PLAY`, no un-mute and no fill (golden rule
      10). Its own test, red first.
- [ ] 3.2 Adopt precisely: row height and cell padding (`16px 17px`), the `#`/State/Name/Template/
      verbs widths (55px · 135px · 33%), the table `min-width`, hover `#1b2a3a`, selected `#192e40`
      with `inset 3px 0 0` the blue, the empty-row title treatment, the Graphics-beds divider row.
- [ ] 3.3 The six row verbs keep a fixed place and size. Header labels, in order: Item, Play, On
      PVW, Next, Stop, Clear. `min-height 34px` text buttons, 32×34 icon buttons, the destructive
      group split off by a left border with 30px buttons. Each verb its own hover; the top bar's
      Clear all and Remove all too. Look buttons keep their large click target.
- [ ] 3.4 The command contract is unchanged: Load, Take, Update, Stop, Clear, Remove keep their
      exact meanings. `R-017`'s on-air REMOVE refusal keeps its canonical sentence; the bulk gates
      and the published `removeExempt` answer stay. Do not re-derive an answer the bridge publishes.
- [ ] 3.5 A measured property table (row height, paddings, the six verb boxes, hover and selected
      colours) reference-vs-app, every delta fixed or argued. Geometry measured in Playwright, never
      jsdom (golden rule 12c).
- [ ] 3.6 e2e run, URL recorded here.

## Phase 4 — Looks

- [ ] 4.1 The number and arrangement of Looks are read from the TEMPLATE's own definition, through
      the real schema's equivalent of the prototype's `authoredLooks(t) = t.layouts`. Only the looks
      the template actually declares are shown.
- [ ] 4.2 🔴 A six-frame template may declare looks of 1, 2, 3, 4, 5 and 6 frames. Frame count, look
      count and look id are three different things; none may stand in for another. No look is
      invented from the frame count.
- [ ] 4.3 🔴 RED-FIRST: switching a look preserves the source-to-frame relationship. Switch away and
      back — the same source is on the same frame.
- [ ] 4.4 e2e run, URL recorded here.

## Phase 5 — Preview, program and the Inspector

- [ ] 5.1 The preview is multi-layer, as `06-preview-program.html` shows.
- [ ] 5.2 🔴 Three things stay INDEPENDENT: which row is SELECTED, which rows are IN PVW, and
      whether the monitors are SHOWN. Independence proved by test for all three pairs.
- [ ] 5.3 The Inspector is available the moment a row is selected, and each row's draft is kept — a
      draft is not lost by selecting another row and coming back.
- [ ] 5.4 The Update button stays pinned at the foot at every panel height; X and Y align; an input's
      focus is one ring, not two; subtitle items reorder by their grip handle.
- [ ] 5.5 e2e run, URL recorded here.

## Phase 6 — Live plates and audio

- [ ] 6.1 🔴 Live plates are the layers occupied by inputs, NOT the source catalogue. Report where
      each is read from — `design.md` §1.2 already names both seams; restate the measured answer.
- [ ] 6.2 Plate controls and the audio modal open by right-click, plus `ContextMenu` and `Shift+F10`.
      Keyboard parity is not optional. ⚠ The app's app-wide native-menu suppression stays, with text
      inputs exempt (guard item 23).
- [ ] 6.3 `ON = 100 % · OFF = 0 %`. 🔴 SOLO is scoped to the group belonging to the owning row —
      including that row's hidden frames — and nothing outside it. The test names the owning row.
- [ ] 6.4 🔴 RED-FIRST: changing audio must not put a ready row on air.
- [ ] 6.5 e2e run, URL recorded here.

## Phase 7 — Settings and channels

- [ ] 7.1 Settings opens the full Station setup modal from `09-channel-settings.html`. ⚠ Mark the
      earlier mockups in `docs/design/` superseded in ONE line; do not work from them.
- [ ] 7.2 The channel list is shaped to be filled from an API — a UI shape, not a schema migration.
- [ ] 7.3 🔴 Per-channel settings and state separated by channel id; station-wide settings keep
      their real scope. ⚠ No persisted key, file or schema change. **Read `design.md` §4 first** —
      the single-channel gap is already filed per namespace, and `stack` carries no channel at all.
      Invent no multi-channel contract, and do not re-scope `silenceAllLivePlates` in passing.
- [ ] 7.4 Everything already decided about this dialog survives: one Settings entry point, the fixed
      frame measured on TWO edges, per-section footers and refusals, the footer rule (a section with
      a commit gets `Revert` + `Apply …`; one without gets `Close`), `B-237`'s confirmation that
      NAMES the templates and plates it would drop, and `B-238`'s refusal being shown.
- [ ] 7.5 Channel-keyed state proved by test; `persistedKeyCensus.test.ts` unchanged; e2e run URL
      recorded here.

## Phase 8 — Template library, import, and the audit log

- [ ] 8.1 Library and import follow `01` and `02`. ⚠ The real `.vcg` validation and import path is
      preserved EXACTLY — the prototype's import is theatre. Proved by the existing import tests.
- [ ] 8.2 The audit log follows `03`.
- [ ] 8.3 🔴 **BLOCKED ON THE OWNER.** Removing the manual console-name picker must not remove the
      audit's ability to say WHO. `design.md` §5 has the measurement: the picker is the ONLY writer
      of the actor in the product, and the reference draws no actor column at all, so `B-143`'s
      caveat has no column to sit beside. The owner picks (a) keep the picker, (b) accept a
      permanently `unattributed` log and say so plainly, or (c) supply a different identity. Do not
      quietly ship a log that names nobody.
- [ ] 8.4 e2e run, URL recorded here.

## Phase 9 — The surfaces the reference does not draw

- [ ] 9.1 Bring every one of `design.md` §3's twenty-six items into the new design, dressed in the
      new tokens, each still appearing when its condition holds.
- [ ] 9.2 🔴 The lock screen keeps its own chrome and its no-exit contract. It is deliberately NOT
      on the modal primitive, and the reference's own `unlock-dialog` must not be used as an
      argument to put it there.
- [ ] 9.3 Write the five owed tests: `bridgeSkewBanner.dom.test.ts`, `rasterMismatchBanner.dom.test.ts`
      (including that `unreadable` and `unconfigured` render NOTHING), `failoverBanner.dom.test.ts`
      (including the `offline-mock` suppression), `layersPanel.restoreMigrations.dom.test.ts`,
      `tooltip.dom.test.ts`, and `contextMenuSuppression.dom.test.ts` (both halves). Strengthen the
      engage-lock assertion off `numericInput.dom.test.ts`.
- [ ] 9.4 One test per guarded surface, each proving it still renders under its condition; the
      lock's contract asserted unchanged. e2e run URL recorded here.

## Phase 10 — Verification

- [ ] 10.1 The air-sensitive scenarios end to end: an Update on a row that does not own the live
      layer sends nothing; REMOVE on air is refused with its sentence; CLEAR/STOP behave as
      contracted; an audio change plays nothing; a look switch preserves sources; the restart notice
      fires and PUT BACK ON AIR restores.
- [ ] 10.2 Channel independence: an action on one channel does not disturb another's state.
- [ ] 10.3 `pnpm gate` uncached, in the foreground, `0 cached` stated; OpenSpec validated strictly;
      and a COMPLETED, GREEN Linux `e2e` job on the CODE head with its URL, duration, and
      confirmation that it RAN — not that it was skipped.

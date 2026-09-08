# Tasks — `RUNTIME-REDESIGN-01`, the ten phases

🔴 **READ THIS BEFORE CHOOSING A PHASE.** This file is the programme's phase state.
`docs/ui-reference/runtime-redesign/PROMPT.md` is the authority for what each phase MEANS; this
file records which are done. **Each session takes the next unfinished phase, finishes it, and
reports.** Do not start a later phase because an earlier one looks easy — the ordering is
load-bearing and stated at each step.

**Phase state at 2026-09-08:** Phases 1, 2 (with addendum 2A), 3, 4, 5, 6, 7 and **8** COMPLETE,
each with its Linux `e2e` URL beside the ticked item. Phases 9–10 not started. Next: **Phase 9**.
⚠ Phase 7 answered owner question **A15** first (`design.md` §14.0) and filed the three
single-channel gaps as **`R-062`** — read §14.7 before touching a bulk verb or the channel list.
⚠ Phase 8 applied **A1** (the picker stays; guard item 27 built back and discharged, `design.md`
§15.6) and recorded **A16** on `R-062` (PANIC stays unscoped; its label names its scope). Phase 9
takes guard items 1–26 — item 27 is DONE — and reads `design.md` §15.7 for the one question Phase
8 filed for the owner (the picker's select-then-load flow).
⚠ `PROMPT.md` §0 carries the rule Phase 3 learned — **the reference is judged as RENDERED, not as
authored: measure it in a browser at 1280 × 800 and quote what you read** — Phase 5 counted the
waves it hides (`.inspector` is restated 33 times; `design.md` §12.1) and Phase 6 counted the
plates pane's and the dialog's (`.plate-table` 20, `.audio-modal` 10; `design.md` §13.4). Read
**A12** below before any phase labels anything about air, **A13** before touching what a control
persists, and `design.md` §13 before touching the plates tab or the audio dialog.

⚠ **2A IS AN ADDENDUM, NOT A PHASE.** The programme still has TEN phases; 2A is recorded under
Phase 2 because it closes something Phase 2 escalated, and numbering it as an eleventh would make
the ledger lie about how much of the programme is done.

**Every phase from 2 onward owes a Linux `e2e` run URL beside its ticked item.** A ticked box with
no URL is not a discharge — it is a claim, and the next reader cannot check it (golden rule 12).

---

## OWNER ANSWERS ON RECORD — read these before any phase that touches them

- **A1 · The audit-name picker STAYS** (`PROMPT.md` §8 point 8, answered 2026-09-07). Kept, made
  small, and kept BESIDE the actor column in the audit panel; the objection was visual clutter, not
  the capability. It is NOT relocated to Station setup, and `B-143`'s caveat does not move. The
  reference draws no actor column, so **Phase 8 must ADD ONE BACK** in the new tokens. Recorded in
  `design.md` §5b and filed as **guard item 27** (§3), whose test is owed by Phase 8.
- **A2 · `docs/design/station-setup-{mockup,redesigned}.html` are ABANDONED** — untracked, not
  relevant, not to be committed. `PROMPT.md` §7's "mark them superseded" is discharged by
  `design.md` §6. **Phase 7 must not chase them.**
- **A3 · The §4 single-channel finding was TOO STRONG and is corrected.** `itemId` is one stack
  item = one operator ROW, and `StackItemStateSchema.slot` carries `{channel, layer, server}`, so
  the channel lives INSIDE the item and the per-row verbs are **already channel-agnostic**. The
  real gap is exactly three things — the five `z.void()` bulk verbs, no channel-discovery call, and
  `fixedLayers` as the single channel authority. `silenceAllLivePlates` stays unscoped ON PURPOSE.
  Restated in `design.md` §4.

- **A4 · 🔴 TWO GREENS IS A RULE, NOT AN OVERSIGHT** (2026-09-08; `design.md` §9). The reference
  spends one mint on `.badge.live`, `.badge.success` and the footer's `healthy`; the console keeps
  `--r-onair` distinct at `rgb(44 255 122)`. Vivid saturated = ON AIR, pastel mint = healthy, because
  an operator must never read "the bridge is fine" as "this row is on air" and _alarm severity by
  air-criticality_ cannot survive one hue carrying both. **Here the drawing is wrong and the console
  is right.** Pinned by assertion in `theme.test.ts` — that they DIFFER, never what either is.
  🔴 **No later phase may collapse them.**
- **A5 · The marked-row edge bars at 3.68:1 are CORRECT and stay.** `controls.css`'s rule says they
  follow the notice's ink; holding 3.86:1 would have kept a measurement and discarded the design it
  measured. Above the 3:1 graphic floor. **Closed, not owed.**
- **A6 · `--r-text-muted` at 4.39:1 on the table header is an ACCEPTED FAIL that Phase 3 closes.**
  It stays on the owed list **until Phase 3 has actually run** — an expectation is not a discharge.
  ✅ Closed by Phase 3 at 4.89:1 (`design.md` §10.4).
- **A8 · 🔴 WAVE 1 IS REJECTED** (2026-09-08, before Phase 4; `design.md` §11.1). The reference's
  stylesheet's first wave — `32×34` icon verbs, a 30 px destructive group, `16px 17px` cells — was
  never rendered by anyone and shrinks the STOP and CLEAR hit targets on an on-air console.
  **`48 × 36` stays. No later phase reopens it.**
- **A9 · `--r-row-icon-btn-narrow-w` is DELETED**, not kept documented-dead: a token read by
  nothing with a comment saying it is dead is a trap. Gone from the token home in Phase 4.
- **A10 / A11 · `PROMPT.md` amended, by path, in its own commit (`0572102e`)**: §0 gains THE
  REFERENCE IS JUDGED AS RENDERED, NOT AS AUTHORED (every phase measures it in a browser at
  1280 × 800 and quotes what it read); §3's quoted numbers are marked SUPERSEDED in place by
  `design.md` §10.2, the section kept so the error stays visible. §§4–10 quote no stylesheet
  number or selector — checked, none found.
- **A12 · 🔴 NO SECOND CLAIM ABOUT AIR ON A ROW THAT ALREADY SAYS WHAT IS ON AIR** (recorded in
  Phase 5, 2026-09-08; `design.md` §12.8; now a requirement in the `runtime-ui` spec delta). The
  reference's `ON AIR LOOK` / `Cut · now` look label is NOT adopted, and the reason is a rule for
  the whole programme: two claims about air on one row can disagree during a transition, and the
  operator then has to choose which to believe. The state cell is the one claim; `· NOW` is
  `B-168`'s existing immediacy word and not a second claim. The same rule keeps the reference's
  `3 rows on air` monitor caption out. **Phase 6 (the audio modal), Phase 8 (the audit log's row
  lines) and Phase 9 (every guard surface re-dressed) read this before drawing a badge.**
  ✅ Phase 6 applied it twice: the dialog's `On air` context badge is NOT adopted, and the
  dialog's own _"audible on air"_ — printed under any raised plate, on a READY row included —
  was replaced by the ledger's word (`design.md` §13.2).
- **A13 · 🔴 `R-060` IS CLOSED: `monitorsShown` DOES NOT PERSIST** (2026-09-08, before Phase 6).
  Session-only, exactly as Phase 5 built it. The rule behind it, for every later phase: **a
  control that HIDES a safety surface does not persist its hidden state** — this product
  prefers a known safe state after a restart over a remembered one, the same call as the
  unpersisted rehearsal flag and reset-to-idle on reconnect. Off the owed list; recorded on
  `R-060` and as a requirement in the `runtime-ui` spec delta.
- **A14 · `R-061` IS SPLIT** (2026-09-08, before Phase 6). **(a) DONE in Phase 6:** the Inspector
  is headed by the ROW's operator name (`operatorRowName`, ids on the heading's `title`, the
  template on the line beneath) — golden rule 11, made urgent by per-row drafts that survive a
  round trip. Asserted as the PROPERTY (the heading carries what the one composition names the
  selected row, and follows selection), never the string. **(b) PARKED, not built:** a Reset
  for the position draft — Discard already undoes edits.
- **A15 · 🔴 MUTE'S REMOVAL WAS A DELIBERATE REMOVAL, DECIDED AT THE WIRE** (2026-09-08, before
  Phase 7; `design.md` §14.0). Phase 6 removed the audio dialog's MUTE as "OFF's twin" without
  evidence beside the claim. The evidence: MUTE's handler and OFF's were the same map
  (`{ [plate]: 0 }`) through the same channel to the same bridge method and the same and ONLY
  audio verb the builder has (`MIXER c-l VOLUME 0`); one intent record (`#plateVolumes`), one
  published field, one boot adoption, one re-assert — no mute FLAG exists anywhere in the tree;
  OFF reaches every state MUTE reached and one more. Recorded as guard item **28, CLOSED**
  (`design.md` §3). Nothing restored. The rule for later phases: a removal the reference implies
  is still a REMOVAL and is written down with its wire evidence, never reported as a "Fixed" row.
- **A16 · 🔴 `silenceAllLivePlates` STAYS UNSCOPED** (2026-09-08, Phase 8; recorded on `R-062`
  in `docs/prd/runtime.md`). It takes `z.void()` on purpose — PANIC's scope is not the caller's
  to choose — and the scope question is a PRECONDITION OF EVER SHIPPING REAL MULTI-CHANNEL,
  decided then with the operator's workflow in front of us, never in passing. That is the
  answer, not an open question. The assumption is made VISIBLE where the operator reads it: the
  plates toolbar's control is `SILENCE ALL BOXES · EVERY CHANNEL`, its accessible name and
  tooltip say the same (golden rule 11), so when multi-channel arrives the label is the thing
  that has to change and cannot be forgotten. One control, its label and its tooltip — no
  behaviour change, no wire change (`liveSourcesPanel.dom.test.ts`, "A16 — the panic label names
  its scope"; `stack.silenceAllLivePlates` untouched by diff).

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
- [x] 1.3 **THE DELETION GUARD** — `design.md` §3. **Twenty-seven surfaces**, built from the source
      tree rather than taken from `PROMPT.md` §1.3 (which supplies seven). Each carries where it
      lives now, what it looks like after the redesign, and a named test. **Twenty-one already have
      a test that asserts they render under their condition; five do not and are owed by Phase 9**
      _(as of Phase 1 — Phase 3 discharged the restore-migrations strip, so four remain, see 9.3)_ —
      `BridgeSkewBanner`, `RasterMismatchBanner`, `FailoverBanner`, the restore-MIGRATIONS strip,
      the delegated `Tooltip`, and the context-menu suppression. (That is five components plus the
      suppression, which shares no component of its own.)
      ⭐ **Item 27 was added in PHASE 2** by owner answer A1 — the audit log's ACTOR COLUMN, its
      `B-143` caveat and the picker that writes it. Its caveat has three green tests; **the COLUMN
      has none and is owed by Phase 8** (`auditPanel.actorColumn.dom.test.ts`). It is the one guard
      item the redesign must ADD BACK rather than merely preserve.
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

## Phase 2 — Tokens and primitives _(no visible change beyond colour)_ — COMPLETE

The record is `design.md` §7: the mapping rule, what moved, what was held and why, the geometry
tokens, the full contrast table, and the two things escalated to the owner.

- [x] 2.1 The nineteen reference values are module-private constants in `renderer/theme.ts` and the
      app's roles point at them by the rule in `design.md` §7.1 — **a role adopts a reference value
      IFF the reference declares a value for THAT role**, otherwise it keeps its own. Twenty roles
      moved, six token roles are new (`--r-text-secondary`, `--r-border-soft`, `--r-caution-bg`,
      `--r-danger-bg`, `--r-ok-bg`, `--r-rehearsing-bg`) plus `colors.textSecondary`. The
      reference's `--bluebg` had a home already: it went to `--r-accent-fill`.
      🔴 No literal outside the token home: `tokenHome.test.ts` green, positive control included.
      ⚠ `@cg/ui` is UNTOUCHED — it is shared with the Designer and tokens-only, so the Runtime's
      page chrome moved out of `chrome.*` and into its own home rather than repainting the Designer.
- [x] 2.2 Geometry tokens declared: `--r-row-pad`, `--r-btn-h`, `--r-btn-h-small`,
      `--r-row-action-h`, `--r-icon-btn-box`, `--r-row-icon-btn-w`/`-h`, `--r-row-icon-btn-narrow-w`.
      **Read by nothing** — applying them is a layout change and Phase 3 owns it.
      _(Phase 3 corrected the `--r-row-*` values to the rendered ones; Phase 4 DELETED
      `--r-row-icon-btn-narrow-w` under owner answer A9.)_
      ⚠ `--r-modal-foot-h` unchanged at `59px` and still a FLOOR; nothing above may compose into it.
- [x] 2.3 🔴 The measured decisions, stated and NOT re-tuned. `rgb(145 93 5)` untouched;
      `markedRowInk` still **5.06:1**. **The edge bars CHANGED: 3.86:1 → 3.68:1**, because
      `controls.css`'s own rule says they follow the notice's ink and Phase 2 moved that ink —
      pinning the value would have kept a NUMBER by discarding the DESIGN it served. Still above the
      3:1 graphic floor. Reported, not re-tuned; restoring 3.86:1 means choosing a new amber and
      that is the owner's.
- [x] 2.4 Every semantic ink re-measured — `design.md` §7.5, fourteen inks × six surfaces.
      🔴 **Two fails, both escalated in §7.6:** `colors.errorText` (the owner's `rgb(255 28 28)`,
      untouched — the SURFACES moved under it) now reads 4.48 / 4.00 / 3.94 / 3.12 on panel, raised,
      row and table header; and `--r-text-muted` reads 4.39 on the table header, which Phase 3
      closes when it adopts the reference's own header ground.
      ⭐ **The alarm severity split is INTACT and was checked:** the bridge-skew band still fills
      with the held amber and cannot read red; the output alarm and raster banner still fill red.
- [x] 2.5 `pnpm --filter @cg/runtime test:e2e` — **116 passed (1.5 m)**, Windows, against a fresh
      `vite build`. ⚠ **NON-AUTHORITATIVE** (golden rule 12a), so it is not what discharges this.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `fdf8f19f`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34148037877> — run `conclusion: success`,
      9 m 43 s. The **`E2E (Playwright)` job RAN** (17:32:47Z → 17:42:12Z, `conclusion: success`);
      it was not skipped, which is the half a green run alone does not prove (golden rule 12b).
      `Lint • Typecheck • Test • Build` also ran green.

### Phase 2A — the error red splits _(owner-ordered addendum to Phase 2, 2026-09-08)_ — COMPLETE

⚠ An ADDENDUM, not an eleventh phase. It closes what 2.4 escalated. Record: `design.md` §8.

- [x] 2A.1 🔴 **The owner's reading, and the thing to carry forward: ONE TOKEN WAS DOING TWO JOBS
      WITH TWO DIFFERENT FLOORS.** `rgb(255 28 28)` fails the 4.5 AA TEXT floor on four of six
      grounds and passes the 3.0 GRAPHIC floor on all six (worst 3.12). **So the answer is a SPLIT,
      not a re-tune** — the ink was never wrong, it was being asked two questions.
- [x] 2A.2 `--r-error-mark` KEEPS `rgb(255 28 28)` byte for byte — not lifted, not darkened, not
      derived. `--r-error-text` becomes `REF_RED` `#ffaaa7`, the reference's own red, already in
      the palette. **No colour invented.** `tokenHome.test.ts` green.
- [x] 2A.3 All **nine** sites classified from what they RENDER, not what they are called
      (`design.md` §8.3). ⚠ Phase 2's own note named SEVEN and was wrong — `OutputsSection.air`
      and `ChannelSection.verdict.mismatch` were missing; both are WORD. **Four sites are BOTH** —
      the row's state cell, the header tally, the status bar's health pill and the link indicator —
      and each takes BOTH tokens at the seam that already existed.
      ⚠ **One ambiguous call, declared:** the status bar's `⚠ NO SERVER — SIMULATED` glyph is
      INSIDE the string at text size, so it is classified WORD; giving it its own colour would mean
      splitting a sentence, which this phase forbids.
- [x] 2A.4 🔴 **Re-measured, both roles, all six grounds** (`design.md` §8.2). **NO SITE IS BELOW
      ITS OWN FLOOR**, and the stronger form holds: the MARK's worst reading anywhere is **3.12**
      (floor 3.0) and the TEXT's is **6.63** (floor 4.5), so no site can fail whichever ground it
      turns out to sit on — which is what makes this survive Phase 3 moving the table's grounds.
- [x] 2A.5 Assertions added: the two error roles are DISTINCT and the ERROR state hands each half
      to the right element; every other state leaves `labelColor` absent so the split cannot leak;
      the status bar's LED takes the mark **and** its word takes the text (both halves, positively).
      Plus **A4's pin**: `--r-onair` is NOT `--r-success`/`--r-ok-text`, asserted as a DIFFERENCE
      with a positive control, never as a literal.
- [x] 2A.6 `pnpm --filter @cg/runtime test:e2e` — **116 passed (1.2 m)**, Windows, against a fresh
      `vite build`. ⚠ **NON-AUTHORITATIVE** (golden rule 12a), so it is not what discharges this.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `cb2a7dad`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34164735377> — run `conclusion: success`,
      10 m 26 s. The **`E2E (Playwright)` job RAN** (21:53:37Z → 22:03:48Z, 10 m 11 s,
      `conclusion: success`); it was not skipped, which is the half a green run alone does not
      prove (golden rule 12b). `Lint • Typecheck • Test • Build` also ran green.

## Phase 3 — The layers table — COMPLETE

The record is `design.md` §10: the contradiction, the measured table, the corrected tokens, A6's
closing number, the red-first proof and the guard.

- [x] 3.1 🔴 **RED-FIRST, BEFORE TOUCHING THE TABLE: `Update` does not take.**
      `tools/caspar-bridge/tests/update-does-not-take.integration.test.ts` — five cases on the mock's
      real AMCP trace: a never-taken row under a field-only update; the same row binding a NEW
      input; **TAKE → OUT → UPDATE with a swapped input, then the next TAKE seats the swap** (the
      owner's plant sequence, uncovered until now); TAKE → STOP → settled off air → UPDATE; and a
      POSITIVE CONTROL on an on-air row that must `PLAY`. **RED with `#ownsLiveSeats`'s gate
      neutralised (four `PLAY`s on each of the three owns-nothing cases), GREEN with it restored,
      5 / 5.** Spec delta: `specs/runtime-live-source-routing/spec.md`.
- [x] 3.2 ⚠ **ADOPTED FROM THE REFERENCE AS RENDERED, NOT AS THIS ITEM QUOTES IT** — the numbers
      here (`16px 17px`, 55/135/33%, `#1b2a3a`, `#192e40` + `inset 3px 0 0`, the `.row-title`
      treatment) are the stylesheet's FIRST wave, overridden four times in the same file and
      matching no element the prototype emits; measured in Chromium the reference paints 67 px rows
      with `15px 12px` cells, hover `#1F2937`, a 2 px selection frame and `rgb(91 93 96)` empty rows
      — this console's own table (`design.md` §10.1). Every delta against the RENDERED reference is
      fixed or argued in §10.2. FIXED: the Graphics-beds band (25 px, `4px 12px`, panel ground,
      strong top rule — `--r-bed-divider-h`), the geometry tokens corrected and READ
      (`--r-row-pad`, `--r-row-icon-btn-w/-h`, `--r-row-verb-gap`), the header ground (A6).
      ARGUED: the palette-only deltas, `B-224`'s columns, the density model in place of a
      `min-width`, the band's wording. **The wave-1 geometry was NOT applied** — it would shrink a
      hit target the model calls a floor, to match a drawing nobody can see; if the owner wants
      that iteration it is a token flip, and the report asks.
- [x] 3.3 The six verbs keep a fixed place and size: `48 × 36` in `repeat(6, 48px)` gapped 12, from
      the tokens, measured; header words `ITEM · PLAY · ON PVW · NEXT · STOP · CLEAR` in order (the
      reference paints the same six upper-cased by CSS). The verb glyph is now the reference's
      20 px (`--r-row-verb-glyph`). Each verb's own hover is pinned by `rehearse-layout.spec.ts`;
      **STOP ALL and CLEAR ALL's hovers and REMOVE ALL's refused-does-not-light are now pinned in
      Playwright** (`layer-table-geometry.spec.ts`). The `32 × 34` / `34px` / destructive-group
      `30px` this item names are the dead wave-1 rules — `--r-row-icon-btn-narrow-w` is kept,
      documented as dead and read by nothing, for the owner's decision. Look buttons untouched at
      their 36 px target. _(ANSWERED before Phase 4 — A8: wave 1 rejected, `48 × 36` stays; A9:
      the token deleted. Phase 4 then took the Look buttons to the rendered 38 × ≥100.)_
- [x] 3.4 The command contract is unchanged and asserted unchanged: no verb, gate, refusal or
      sentence was touched; `REMOVE_ON_AIR_REASON`, the bulk gates and the published `removeExempt`
      keep every test they had (`design.md` §10.7). Nothing re-derives a bridge answer.
- [x] 3.5 The measured property table — `design.md` §10.2, thirty rows, reference-vs-app, both
      columns Chromium readings; the app's side is asserted by
      `apps/runtime/tests/e2e/layer-table-geometry.spec.ts` against the token home (four tests:
      the row and its verbs; hover and selection; the header's AA contrast and the band; the top
      bar's hovers). **A6 closes: `--r-text-muted` on the header ground 4.39:1 → 4.89:1**, measured
      by arithmetic and in the browser; the ink not re-tuned (§10.4).
- [x] 3.6 `pnpm --filter @cg/runtime test:e2e` — **120 passed (1.2 m)**, Windows, against a fresh
      `vite build`. ⚠ **NON-AUTHORITATIVE** (golden rule 12a), so it is not what discharges this.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `9fa0393a`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34169950446> — run `conclusion: success`,
      10 m 29 s (23:24:50Z → 23:35:19Z). The **`E2E (Playwright)` job RAN** (23:25:04Z → 23:35:11Z,
      10 m 07 s, `conclusion: success`); it was not skipped, which is the half a green run alone
      does not prove (golden rule 12b). `Lint • Typecheck • Test • Build` also ran green
      (23:25:04Z → 23:29:41Z).

## Phase 4 — Looks — COMPLETE

The record is `design.md` §11: the owner's answers and the amended authority file, what
contradicted the prompt, the measured strip, the fixture, the two red-first proofs and the guard.

- [x] 4.1 The number and arrangement of Looks are read from the TEMPLATE's own definition: the real
      equivalent of `authoredLooks(t) = t.layouts` is `TemplateLiveSources.looks` — the export
      (`collectLookCarrier`) of the scene's authored `LookGroup` — which `lookOptionsOf` reads and
      which now also supplies each look's ARRANGEMENT: a segment carries a frame thumbnail drawn
      from that look's own rects over the carrier's resolution, not from the prototype's invented
      `--cols` grid. The strip took the RENDERED reference's geometry (38 px, 100 px floor,
      `5px 12px`, radius 5, 13 px, 27 × 19 thumbnail, gaps 8 / 10 / 79) as `--r-look-*` tokens from
      `LOOK_STRIP_PX`, measured reference-vs-app in `design.md` §11.3; the reference's
      `ON AIR LOOK` / `Cut · now` label was NOT adopted (§11.2, argued). Only the looks the template
      declares are shown — nothing in the tree derives one from a frame count (§11.2).
- [x] 4.2 🔴 Frame count, look count and look id proved to be three different things against an
      IRREGULAR set: the e2e-armed library's `e2e-looks-six` — six frames, FIVE looks of 1, 2, 3, 4
      and 6 frames (no five-frame look), word ids with irregular membership (`pair` = frames 2 and
      5). `lookPicker.dom.test.ts` pins five options, `[1,2,3,4,6]`, `pair`'s membership and one
      rendered cell per frame; `look-set-and-switch.spec.ts` drives it on the built app — five
      segments, no `[data-look-frames="5"]`, `trio` (the authored default, third) marked. No look is
      invented from the frame count.
- [x] 4.3 🔴 RED-FIRST, twice, same defect shape (a switch that forgets the ROW's composition and
      re-derives frames from the TEMPLATE), each round trip carrying a per-look binding so a
      re-derivation cannot pass for the answer. **Wire:**
      `tools/caspar-bridge/tests/look-switch-preserves-bindings.integration.test.ts` — RED with the
      bridge's `setActiveLook` neutralised (frame 1 back on `route://2` instead of `route://9`),
      GREEN restored, 2 / 2, no `PLAY` on the way back. **Surface:** the spec's third test on PVW —
      RED with the mock's `setActiveLook` neutralised (`l-3` read `Studio 1` after the round trip),
      GREEN restored, 3 / 3; the first red attempt landed on the positive control because the
      fixture's `solo` did not move frame 1, the fixture was corrected and the red taken again on
      the property (§11.5). Spec deltas in both `specs/` files.
- [x] 4.4 `pnpm --filter @cg/runtime test:e2e` — **123 passed (1.5 m)**, Windows, against a fresh
      `vite build`. ⚠ **NON-AUTHORITATIVE** (golden rule 12a), so it is not what discharges this.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `382ff847`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34202226427> — run `conclusion: success`,
      10 m 27 s (08:00:49Z → 08:11:16Z). The **`E2E (Playwright)` job RAN** (08:01:01Z → 08:11:11Z,
      10 m 10 s, `conclusion: success`); it was not skipped, which is the half a green run alone
      does not prove (golden rule 12b). `Lint • Typecheck • Test • Build` also ran green
      (08:01:01Z → 08:06:09Z). ⚠ The same run covers `0572102e` (the `PROMPT.md` amendment): both
      commits went up in one push, and the jobs are whole-tree.

## Phase 5 — Preview, program and the Inspector — COMPLETE

The record is `design.md` §12: what contradicted the prompt, the measured Inspector and monitor
tables with every delta fixed or argued, the wave count, the red-first matrix, the guard, the
numbers filed and A12.

- [x] 5.1 The preview is multi-layer, as `06-preview-program.html` shows — and already was
      (`R-022`, `rehearse-composite.spec.ts`); the reference's two `.pvw-composite-layer`s stacked
      by layer in one scaled raster are the app's `iframe[data-rehearsal-frame]`s by real layer.
      The strip takes the reference's rendered **230 px** as its default (was 180: the PVW stage
      grew from 86 to 136 px) and gains the reference's **`Show monitors` / `Hide monitors`**
      toggle (`aria-expanded`, `aria-controls="monitor-strip"`) in the Layers header — the app had
      no way to fold the strip away except the Layers fullscreen, which also took the Inspector
      column. Session state, not persisted (`R-060` filed); `reset()` brings it back. The
      monitors' other deltas — 32 px heads, a hue per monitor, `CH 1`, zoom, guides, `3 rows on
air` — are ARGUED in §12.3, the last under A12.
- [x] 5.2 🔴 Three things stay INDEPENDENT, proved for all three pairs in BOTH directions on the
      whole `App` — `tests/workspaceIndependence.dom.test.ts` (jsdom, the mock bridge under
      `App`) and `tests/e2e/workspace-independence.spec.ts` (Chromium). **RED FIRST in two rounds
      of planted couplings** (§12.5): round A wired select → PVW, select → monitors, PVW →
      monitors and reddened exactly tests 1, 3, 5 (plus 2 through its precondition); round B
      wired the three reverse directions and reddened exactly 2, 4, 6 (plus 3 through its
      precondition). 7 / 7 green in both engines with the plants removed. The PVW set is read
      from the bridge, never from a badge. Spec delta: `specs/runtime-ui/spec.md`.
- [x] 5.3 The Inspector opens the moment a row is selected (unchanged, `inspector-open-close`),
      and every kind of draft survives a selection round trip — fields, plates and per-look inputs
      already did through `draftStore`; **the on-air POSITION draft did not** (`PositionPicker`'s
      `useState`, remounted per item) and now lives in the same store, per item, offsets kept as
      typed, swept by prune and deliberately left by DISCARD (UPDATE does not send it). **RED
      FIRST** — `positionPicker.dom.test.ts`'s round-trip case against the `useState` picker,
      GREEN on the store; `draftStore.test.ts` covers the map. No persisted key, file or schema.
- [x] 5.4 Geometry, in Playwright only (golden rule 12c) — `tests/e2e/inspector-geometry.spec.ts`:
      the Update button pinned at the foot at **three** panel heights (800 / 620 / 480) with the
      list shorter and longer than the panel, scrolled to top and bottom; X and Y on one top, one
      height, one width and one baseline with `Apply position`, growing equal at fullscreen; one
      ring on a position box, a text field and a list item with no ancestor ring; subtitle items
      reordered by a real HTML5 drag of the grip handle. The rendered numbers the phase adopted
      are read back from the token home (`--r-insp-*`, `INSPECTOR_PX`): 396 px column, 31 px /
      13 px fields, 32 px position boxes, 12 px semibold headings in the second ink, a `9px 12px`
      foot with its shadow, 104 × 32 `Discard · Update`, and the reference's hint sentence.
      Guard items **19** (`divider-across-iframe`, `draft-survives-fullscreen`, `panel-scroll`)
      and **20** (`inspector-open-close`) re-run green on the built app (§12.6).
- [x] 5.5 `pnpm --filter @cg/runtime test:e2e` — **135 passed (1.6 m)**, Windows, against a fresh
      `vite build`. ⚠ **NON-AUTHORITATIVE** (golden rule 12a), so it is not what discharges this.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `d71f4ed2`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34209072709> — run `conclusion: success`,
      10 m 57 s (09:16:21Z → 09:27:18Z). The **`E2E (Playwright)` job RAN** (09:16:36Z →
      09:27:10Z, 10 m 34 s, `conclusion: success`, its `E2E` step executed 09:17:28Z → 09:26:59Z);
      it was not skipped, which is the half a green run alone does not prove (golden rule 12b).
      `Lint • Typecheck • Test • Build` also ran green (09:16:36Z → 09:20:17Z).

## Phase 6 — Live plates and audio — COMPLETE

The record is `design.md` §13: what contradicted the prompt, the two seams, the measured plates
pane and dialog with every delta fixed or argued, the wave counts, the red-first matrix, guard
item 23's discharge, A13/A14, and the numbers filed.

- [x] 6.0 🔴 **BEFORE THE PHASE WORK — guard item 23 got its test FIRST**, both halves:
      `apps/runtime/tests/contextMenuSuppression.dom.test.ts` on the whole `App` — (1) a
      right-click on chrome with no menu of its own is cancelled, (2) the same right-click inside
      an Inspector text field is NOT, (3) the row's own menu still opens with the native one
      cancelled. **RED FIRST, twice, in `App.tsx`:** the exemption removed reddened exactly (2);
      the `preventDefault` removed reddened exactly (1); (3) stayed green under both, which is
      what makes it a control. 3 / 3 restored. **Discharged — Phase 9.3 now owes FOUR tests**
      (`bridgeSkewBanner`, `rasterMismatchBanner`, `failoverBanner`, `tooltip`), not five.
- [x] 6.1 🔴 Live plates are the layers occupied by inputs, NOT the source catalogue — measured,
      not restated: **LIVE PLATES** are read from the bridge's LEDGER, channel `liveLayers.state`
      / `onStateChanged`, through `hooks/useLiveLayers.ts` → `liveLayerRows()` → the LIVE SOURCES
      tab (`LiveSourcesPanel`), one row per layer the bridge itself seated (a tree-wide grep for
      the hook finds one consumer, `LayersPanel.tsx`). The **SOURCE CATALOGUE** is
      installation-wide, channel `sources.config` / `onConfigChanged` / `setConfig`, through
      `features/sources/sourceStore.ts`, edited in Station setup's `SourcesSection` — and
      `LiveSourcesPanel` imports NOTHING from `sources/`. The pane says so in the toolbar's scope
      note. Different channel, different lifetime, different surface.
- [x] 6.2 Plate controls and the audio modal open by RIGHT-CLICK, plus `ContextMenu` and
      `Shift+F10`, from BOTH doors: the layer row (right-click / the keys → the row's own menu →
      AUDIO; `useContextMenu.openAt` is the keyboard's door, `isContextMenuKey` the ONE predicate
      for the pair) and the seated plate on LIVE SOURCES (right-click / the keys → the OWNING
      ROW's dialog with THAT plate's fader focused, `data-modal-autofocus`). Proved in jsdom on
      the whole `App` (`plateAudioAccess.dom.test.ts`, 5 tests) and on the panel alone
      (`liveSourcesPanel.dom.test.ts`, 4 new cases incl. a stranded plate opening nothing), and in
      Chromium (`e2e/live-plate-audio-access.spec.ts`). ⚠ Guard item 23 stays: the app-wide
      suppression is untouched, the panel's rows call `preventDefault` themselves only when they
      opened something. Golden rule 11: the dialog names its row (`operatorRowName`, ids on
      `title`); `R-028`: the coordinate stays in the sentence (`on 1-10`).
- [x] 6.3 `ON = 100 % · OFF = 0 %` — on the dialog's footer in the reference's words and on
      every ON/OFF control's `title`; MUTE (OFF's twin) removed to the reference. 🔴 SOLO is
      scoped to the OWNING ROW's group — every plate the template declares plus every seat the
      ledger holds for the row (the union pre-seat, HIDDEN frames included) — and nothing outside
      it. **The tests NAME the owning row:** at the wire (`audio-does-not-take` §2 — SOLO on
      `item-1` puts `MIXER … VOLUME` only on `item-1`'s layers, silences its held `live-3` in the
      record, leaves `item-2`'s three intents at 1 and its ledger empty) and on the surface
      (`plateAudioAccess` §3 — SOLO on `item-irib-news`'s `guest-1` zeroes its HIDDEN `guest-2`
      and leaves `item-looks`'s intents untouched). A12: the per-plate word is the LEDGER's
      (`plateAudioPill` / `NOT SEATED`), never a local `value > 0`.
- [x] 6.4 🔴 RED-FIRST: changing audio must not put a ready row on air —
      `tools/caspar-bridge/tests/audio-does-not-take.integration.test.ts`, at the wire: a
      never-taken row under ON; the same under a SOLO map; TAKE → OUT → settled → ON, then the
      next TAKE seats the plate at the recorded volume; a POSITIVE CONTROL (on air, ON → exactly
      one `MIXER 1-N VOLUME 1`, no `PLAY`, no fill). **RED with a planted seat-on-raise in
      `setLivePlateVolume`** (`#planLiveSeating` + `#applyLivePlates` ahead of the gate): the
      three ready-row cases went red with three `PLAY`s and seats in the ledger each, the SOLO
      scope case went red too (the plant seated `item-2` PAST the one-carrier gate), the positive
      control stayed green. Restored, 5 / 5. Spec delta: `specs/runtime-live-source-routing`.
- [x] 6.5 `pnpm --filter @cg/runtime test:e2e` — **139 passed (1.7 m)**, Windows, against a fresh
      `vite build`. ⚠ **NON-AUTHORITATIVE** (golden rule 12a), so it is not what discharges this.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `c5d07d9a`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34217958356> — run `conclusion: success`,
      11 m 17 s (10:55:13Z → 11:06:30Z). The **`E2E (Playwright)` job RAN** (10:55:24Z →
      11:06:23Z, 10 m 59 s, `conclusion: success`, its `E2E` step executed 10:56:28Z → 11:06:07Z);
      it was not skipped, which is the half a green run alone does not prove (golden rule 12b).
      `Lint • Typecheck • Test • Build` also ran green (10:55:24Z → 11:01:10Z).

## Phase 7 — Settings and channels — COMPLETE

The record is `design.md` §14: A15 at the wire (§14.0), what contradicted the prompt, what was
built and where each per-channel and station-wide fact is read from, the measured dialog and
Channel pane with every delta fixed or argued, the wave counts, the red-first matrix, guard item
28 closed, the three gaps filed as `R-062`, and what was not done.

- [x] 7.0 🔴 **A15 ANSWERED FIRST** — MUTE's removal decided from the wire and the tree, not by
      preference (`design.md` §14.0): OFF is exactly equivalent (same map, same channel, same
      method, same and only verb `MIXER c-l VOLUME 0`; one intent record, no mute flag anywhere;
      OFF ⊇ MUTE). Recorded as a DELIBERATE removal, guard item **28 CLOSED** (§3); owner answer
      A15 on record above.
- [x] 7.1 Settings opens the full Station setup modal from `09-channel-settings.html` — measured
      in Chromium at 1280 × 800 through its shadow root (`design.md` §14.3–14.4: `.settings` is
      restated 17 times, `.tab` 12; the outer page's `.channel-modal` rules paint no element) and
      brought in as `STATION_SETUP_PX` → `--r-setup-*` / `--r-video-*` / `--r-output-*`, the fixed
      frame and `--r-modal-foot-h` re-pointed at the reference (1140 × min(810, vh − 64); a 74 px
      FLOOR, still a floor). The `docs/design/station-setup-{mockup,redesigned}.html` mockups are
      ABANDONED (owner answer A2, `design.md` §6) — one line, not chased; they are untracked and
      cannot be marked.
- [x] 7.2 The channel list is a LIST shaped to be filled from an API — `channelIds(bank, settings)` — the union of the two channel sources the bridge already publishes — one
      `CHANNEL N` tab each, the selection a channel id in `channelStore` (session-only). A UI
      shape: no schema, no key, no discovery call invented (owner answer A3). Red-first:
      `channelScope.dom.test.ts` (3 of 4 red against the one-element strip), `channelList.test.ts`.
- [x] 7.3 🔴 Per-channel settings and state separated by channel id: Station setup's Channel tab
      reports the SELECTED channel — its raster verdict and its outputs — and nothing of another's
      (`ChannelSection` + `OutputsSection` with `channel`), the dialog's subtitle naming it;
      station-wide sections (Servers, Live sources, Text file delimiters, Layers) render IDENTICAL
      DOM under channel 1 and channel 2. Red-first: `stationSetupChannelKeyed.dom.test.ts` (4 of 5
      red against the every-channel pane; the station-wide case is the control). The three gaps
      are FILED as **`R-062`** with the trap written into it; `silenceAllLivePlates` and every
      bulk verb untouched by diff. **OutputsSection re-shaped** to the reference table (`Slot · Configured output · Runtime status`) with its `N of M running` count, every B-223 row
      kept beneath it (`outputsSection.dom.test.ts` 22 / 22, +6 red-first).
- [x] 7.4 Everything already decided about this dialog survives, each still asserted: one Settings
      entry point (`station-setup.spec.ts` §1); the fixed frame on TWO edges
      (`station-setup-frame.spec.ts`, its short-section reading taken at the programme's 1280 ×
      800); per-section footers and refusals; the footer rule (`Revert` + `Apply …` or nothing —
      `B-240`); `B-237`'s naming confirmation; `B-238`'s shown refusal (`removeRowRefusal`
      11 / 11). Sixteen Station setup, token-home and rail suites re-run green (128) with the four
      new ones.
- [x] 7.5 Channel-keyed state proved by test (7.2, 7.3); **`persistedKeyCensus.test.ts` unchanged**
      — `git diff` on it is empty, it is green, and the new `features/channels/` modules spell no
      storage (grep). `pnpm --filter @cg/runtime test:e2e` — **141 passed (1.8 m)**, Windows,
      against a fresh `vite build`, after two geometry corrections the first run surfaced (a 45 px
      tab under the console's line-height; the frame spec's slack read at 720 tall). ⚠
      **NON-AUTHORITATIVE** (golden rule 12a), so it is not what discharges this.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `f9fd0d03`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34225793746> — run `conclusion: success`,
      11 m 03 s (12:23:22Z → 12:34:25Z). The **`E2E (Playwright)` job RAN** (12:23:37Z →
      12:34:19Z, 10 m 42 s, `conclusion: success`, its `E2E` step executed 12:24:40Z → 12:34:10Z);
      it was not skipped, which is the half a green run alone does not prove (golden rule 12b).
      `Lint • Typecheck • Test • Build` also ran green (12:23:36Z → 12:31:26Z).

## Phase 8 — Template library, import, and the audit log — COMPLETE

The record is `design.md` §15: the import path's evidence first (§15.0), what contradicted the
prompt, what was built and where each fact is read from, the three surfaces measured in Chromium
with every delta fixed or argued (§15.3), the wave counts and the shadow-root check (§15.4), the
red-first matrix (§15.5), guard item 27 discharged (§15.6), and what was not done (§15.7).

- [x] 8.1 Library and import follow `01` and `02` — as RENDERED (all three dialogs are in the OUTER
      document; no shadow root at any of the three starts; `.modal-head` restated 10 times,
      `.template-detail` 9, `.import-step` 9). The picker: a search, three kind chips by the
      bridge's own `requiredBankFor`, rows as thumbnail · name · a meta line FROM THE CARRIER with
      the reasons as chips, the reference's footer sentence (true here: a LOAD is list-only), the
      primitive's `wide`; `02`'s drop zone at the foot of the list, feeding the SAME chain.
      ⚠ **The real `.vcg` validation and import path is preserved EXACTLY:** `importVcgFile.ts`,
      `templateDelivery.ts`, `fixedSlotLoad.ts` and `@cg/vcg-format` untouched by diff; the
      existing import suites byte for byte unchanged and green (16 + 4 + 2 + 7 + 1 + 5 unit,
      2 + 8 + 1 e2e — `design.md` §15.0); a DROPPED non-package reaches the row's error channel as
      `“garbage.vcg” failed verification…`, the sentence only the chain's own `verify` produces.
      The one-press load contract, `Delete from station` and `Import a .vcg…` unchanged (twenty
      specs drive them). The reference's select-then-`Load into` flow, detail aside, `Into` select,
      `Manage` view and import wizard are ARGUED (§15.3); the picker's flow is filed as a question
      for the owner (§15.7), not decided.
- [x] 8.2 The audit log follows `03` — a `ledger` frame (`--r-modal-w-ledger`, the primitive's
      fourth width), the reference's subtitle, a tools row (search over what the row SHOWS,
      `Action` first, `Result` from the schema's outcomes, the app's `Actor` filter kept,
      `Refresh`), `12px 16px` head at 12 px, `15px 16px` cells at 13 px, the item cell's strong
      line over small lines with **`on c-l` from `entry.slot`** (golden rule 11 ⭐ — the log entry
      keeps the layer number; the row did not before), the outcome as a tag in the 2A inks, the
      code beneath it, `N of M events` and `Reset filters` in the footer. `B-210`'s band, `B-211`'s
      on-row ids and `B-141`'s four empty states unchanged; `View event`, the per-row date, `Date`
      and `Follow` ARGUED (§15.3). `auditPanel.filters.dom.test.ts` (5).
- [x] 8.3 ✅ **A1 APPLIED — the picker STAYS, small, beside the actor column; the caveat did not
      move.** 🔴 **Guard item 27 BUILT BACK and DISCHARGED** (`design.md` §3, §15.6): `Actor`
      heads the second column, a row's cell carries `entry.actor` in its own `<bdi>`, the field is
      132 × 39 in ONE strip with the `B-143` caveat (byte for byte), the strip above the table over
      its first columns; nothing in Station setup. `auditPanel.actorColumn.dom.test.ts` (5) — **RED
      FIRST by a plant removing the header and the cell: the three column cases red while the
      caveat's three older tests stayed green, which is exactly the hole the item named**; the
      geometry in Chromium (`library-audit-geometry.spec.ts`). Still owed after 27: Phase 9's four
      tests (`9.3`) for items 1–26, Phase 10's end-to-end pass. Nothing of 27.
      ✅ **A16 done (the small part):** `SILENCE ALL BOXES · EVERY CHANNEL` — label, accessible
      name and tooltip name the scope; `silenceAllLivePlates` untouched; recorded on `R-062`.
- [x] 8.4 `pnpm gate` — **`93 successful, 93 total · 0 cached, 93 total`**, foreground, prettier
      clean, OpenSpec `78 passed, 0 failed`. `pnpm --filter @cg/runtime test:e2e` — **143 passed
      (1.9 m)**, Windows, against the gate's fresh build, after one geometry correction the first
      run surfaced (the search box and the selects painted 41 / 42 under the console's inherited
      1.55 line-height where the reference paints 40 / 39 — declared as heights with the
      reference's line-height, the Phase 7 tab lesson again). ⚠ **NON-AUTHORITATIVE** (golden
      rule 12a), so it is not what discharges this.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `5f4793b4`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34235812109> — run `conclusion: success`,
      11 m 39 s (14:03:20Z → 14:14:59Z). The **`E2E (Playwright)` job RAN** (14:03:37Z →
      14:14:51Z, 11 m 14 s, `conclusion: success`, its `E2E` step executed 14:04:57Z →
      14:14:39Z); it was not skipped, which is the half a green run alone does not prove (golden
      rule 12b). `Lint • Typecheck • Test • Build` also ran green (14:03:33Z → 14:08:37Z).

## Phase 9 — The surfaces the reference does not draw

- [ ] 9.1 Bring `design.md` §3's guard items 1–26 into the new design, dressed in the new tokens,
      each still appearing when its condition holds. ⚠ **Item 27 is PHASE 8's**, not this phase's —
      it is the audit log's actor column, which Phase 8 builds and tests.
- [ ] 9.2 🔴 The lock screen keeps its own chrome and its no-exit contract. It is deliberately NOT
      on the modal primitive, and the reference's own `unlock-dialog` must not be used as an
      argument to put it there.
- [ ] 9.3 Write the owed tests: `bridgeSkewBanner.dom.test.ts`, `rasterMismatchBanner.dom.test.ts`
      (including that `unreadable` and `unconfigured` render NOTHING), `failoverBanner.dom.test.ts`
      (including the `offline-mock` suppression) and `tooltip.dom.test.ts`. Strengthen the
      engage-lock assertion off `numericInput.dom.test.ts`.
      ✅ **`layersPanel.restoreMigrations.dom.test.ts` was DISCHARGED BY PHASE 3** (six cases,
      green), written before the table it lives beside was restructured — guard item 11 is no
      longer owed here.
      ✅ **`contextMenuSuppression.dom.test.ts` was DISCHARGED BY PHASE 6** (both halves plus the
      row-menu control, each half taken red against its own plant in `App.tsx`), written BEFORE
      that phase rewired right-click — guard item 23 is no longer owed here. **Four owed:** the
      three banners and the tooltip.
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

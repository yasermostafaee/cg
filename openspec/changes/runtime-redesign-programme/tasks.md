# Tasks — `RUNTIME-REDESIGN-01`, the ten phases

🔴 **READ THIS BEFORE CHOOSING A PHASE.** This file is the programme's phase state.
`docs/ui-reference/runtime-redesign/PROMPT.md` is the authority for what each phase MEANS; this
file records which are done. **Each session takes the next unfinished phase, finishes it, and
reports.** Do not start a later phase because an earlier one looks easy — the ordering is
load-bearing and stated at each step.

**Phase state at 2026-09-08: THE PROGRAMME IS COMPLETE.** All ten phases (1, 2 with addendum
2A, 3, 4, 5, 6, 7, 8, 9 and **10**) are done, each with its Linux `e2e` URL beside the ticked
item. **The closing position — the deletion guard's final count, all sixteen owner answers and
where each is recorded, what remains open and who owns it, and whether any phase left a
remainder — is `design.md` §17.6.** Read that before opening any follow-up work.
⚠ Phase 9 PLANT-TESTED every deletion-guard item (`design.md` §16.1): read that table before
trusting any ✅ in §3 — a ✅ says a test exists; the table says what goes red when the surface
is removed. Phase 10 re-runs the guard end to end and owes nothing else to the guard.
⚠ Phase 7 answered owner question **A15** first (`design.md` §14.0) and filed the three
single-channel gaps as **`R-062`** — read §14.7 before touching a bulk verb or the channel list.
⚠ Phase 8 applied **A1** (the picker stays; guard item 27 built back and discharged, `design.md`
§15.6) and recorded **A16** on `R-062` (PANIC stays unscoped; its label names its scope). Phase 9
takes guard items 1–26 — item 27 is DONE — and reads `design.md` §15.7 for the one question Phase
8 filed for the owner (the picker's select-then-load flow) — **ANSWERED 2026-09-09:
the owner adopted it (`RUNTIME-REPAIR-05`, design.md §22).**
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
  - ⚠ **AMENDED 2026-09-09 (`MONITORS-01`) — THE RULE STANDS; THE DEFAULT WAS A DIFFERENT
    QUESTION AND HAS MOVED TO HIDDEN.** A13 answered `R-060`, whose subject is PERSISTENCE
    ("should 'monitors hidden' survive a reload?"). It never decided the shipped BOOT state,
    which was Phase 5's and rested on the strip being confidence monitoring. It is not: PGM is
    a fixed empty placeholder for the unbuilt `C-016` and PVW is a local browser render of the
    rehearsing rows (`R-022` — nothing reaches CasparCG), so the strip was costing 247.2 px and
    three rows of the layer list. `DEFAULT_MONITORS_SHOWN = false`. **A13's non-persistence rule
    is UNCHANGED and still enforced** — the flag is written by nothing and read from nothing.
    ⚠ What does change is A13's own EXAMPLE: with the default hidden, "a known safe state after
    a restart" no longer means SHOWN. The load-bearing half — a KNOWN state over a REMEMBERED
    one — survives that intact. **Do not read the flip as A13 being overturned, and do not
    "reconcile" the two by re-persisting the flag.** Full argument: `design.md` §19.2.
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
      ~~The one-press load contract and `Import a .vcg…` unchanged~~ — REVERSED
      2026-09-09, see §22 (twenty
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

## Phase 9 — The surfaces the reference does not draw — COMPLETE

The record is `design.md` §16: what contradicted the prompt, the plant pass per guard item
(§16.1), what was built, the measured notice / toast / lock (§16.3), the caution split (§16.4),
the lock (§16.5), the red-first matrix (§16.6), what was not done (§16.7) and the runs (§16.8).

- [x] 9.0 🔴 **THE PLANT PASS, FIRST — every guard item, not the four.** Each of the 28 items had
      its render deleted (or its condition made unreachable), the whole runtime unit suite ran
      against the plant, and what reddened was recorded; 33 unit plants (items 14, 16, 17 per
      sub-surface) plus two Playwright plants for items 19 and 20 against a fresh build; every
      plant reverted by its original bytes. **All 23 ✅ entries reddened; the four 🔴 entries (5, 7,
      9, 22) stayed green, as the ledger said; item 28 has nothing to plant.** Two depths the pass
      surfaced and this phase closed: item 16 rode on the digit suite alone, and item 22's first
      new suite (component-only) was itself not a guard — the unmount plant stayed green under it
      until an App-level case existed. Per-item table: `design.md` §16.1.
- [x] 9.1 Guard items 1–26 dressed in the new tokens and still appearing under their conditions.
      The reference gives three of them a SHAPE, measured in Chromium (§16.3): the `.notice` box
      and its three pairs (`NOTICE_PX`, `--r-notice-*` — the warn pair MOVED, the plain pair NEW;
      read by items 1–4, 5, 9 and `Notice`), the toast (`TOAST_PX`, `--r-toast-*`; item 18) and
      the unlock dialog's look (`LOCK_PX`, `--r-lock-*`; item 15). The failover banner (item 9) is
      a STRIP whose tone is the situation's — `B-172` CLOSED, the `--r-alarm-*` family deleted, the
      `offline-mock` suppression moved into the component. Items 6, 8, 10–14, 17, 19–21, 23–26
      already read tokens alone (`tokenHome.test.ts`) and were re-verified by plant, not
      re-dressed. Item 27 was Phase 8's and is untouched.
- [x] 9.2 🔴 The lock keeps its own chrome and its no-exit contract (§16.5): the reference's LOOK
      (icon box, `Console locked`, the mono PIN field, `Unlock console` full width) over the app's
      own scrim and card; not a `<dialog>`, no ✕ / Escape / backdrop, the same `useFocusTrap`.
      Pinned as PROPERTIES in `lockOverlay.contract.dom.test.ts` (6) and, in a real engine, in
      `e2e/guard-surfaces-geometry.spec.ts`. The prototype's own `#unlock-dialog` was measured
      refusing its `cancel` event — even the drawing has no Escape. `RUNTIME LOCKED` / `UNLOCK`
      swept (`git grep`): two e2e specs re-pointed, nothing else quoted them.
- [x] 9.3 The owed tests written and each taken RED by re-planting the same removal (§16.6):
      `bridgeSkewBanner.dom.test.ts` (5; amber-never-red by token identity),
      `rasterMismatchBanner.dom.test.ts` (7; `unreadable` twice, `unconfigured` and `match` render
      NOTHING), `failoverBanner.dom.test.ts` (9; the `offline-mock` suppression with its positive
      control), `tooltip.dom.test.ts` (5; the contract AND the App-level mount). The engage-lock
      assertion taken off `numericInput.dom.test.ts`: `engageLockDialog.dom.test.ts` (6, including
      the status bar's door). Spec deltas in `specs/runtime-ui/spec.md`.
      ✅ **`--r-caution` / `pending` SPLIT** (§16.4, the item Phase 2 held): the skew band takes the
      reference's caution PAIR; the CLEAR verb reads `--r-caution-fill`; the ink token is read as
      ink only, every reader grepped.
- [x] 9.4 One test per guarded surface, each proving it still renders under its condition, and
      each proved to REDDEN when the surface is removed (§16.1). `pnpm gate` —
      **`93 successful, 93 total · 0 cached, 93 total`**, foreground, 3 m 26 s, prettier clean,
      OpenSpec 78 passed / 0 failed (its first run was red on ONE lint error in the new e2e spec,
      an inline `import()` type — fixed, re-run green). `pnpm --filter @cg/runtime test:e2e` — **145 passed (3.8 m)**,
      Windows, against the gate's fresh build, on the third run: the first two lost 1 and then 4
      specs to `page.goto` load timeouts (the `B-098` class) with two STALE `vite preview` servers
      from earlier sessions still on the host; with those stopped, the four re-ran 20 / 20 and the
      full suite clean. ⚠ **NON-AUTHORITATIVE** (golden rule 12a), so it is not what discharges
      this.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `be883e3c`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34251084406> — run `conclusion: success`,
      12 m 38 s (16:26:44Z → 16:39:22Z). The **`E2E (Playwright)` job RAN** (16:26:55Z →
      16:38:51Z, 11 m 56 s, `conclusion: success`, its `E2E` step executed 16:28:12Z → 16:37:50Z);
      it was not skipped, which is the half a green run alone does not prove (golden rule 12b).
      `Lint • Typecheck • Test • Build` also ran green (16:26:55Z → 16:30:46Z).

## Phase 10 — Verification — COMPLETE

The record is `design.md` §17: what contradicted the prompt (§17.0), the six scenarios at the
wire and their plant pass (§17.1), channel independence with its honest bound (§17.2), the
`B-245` sweep in full with its positive control (§17.3), the `P-025` hook and the live
turbo-inputs hole it exposed (§17.4), what was not done (§17.5), **the programme's closing
position (§17.6)** and the runs (§17.7).

- [x] 10.1 🔴 The six air-sensitive scenarios END TO END, in ONE operator session on ONE bridge,
      asserted at the WIRE — `tools/caspar-bridge/tests/air-sensitive-endtoend.integration.test.ts`.
      Not a copy of the six suites that own these properties: it proves they survive COMPOSITION,
      on a row that has been updated, taken, refused a REMOVE, look-switched, stopped, resumed,
      cleared, re-taken and had its air taken by a server restart. Every reading is the mock's
      AMCP trace, the mock's layer state or the bridge's ledger — never a UI. **UPDATE on a row
      owning no live layer sends nothing** (with a TAKE beside it as the positive control that
      the trace is live); **REMOVE on air is refused** with `REMOVE_ON_AIR_CODE`, naming STOP and
      CLEAR, destroying nothing and keeping every seated plate; **an audio change reaches nothing**
      yet records its intent; **a look switch preserves the source-to-frame relationship** through
      a disjoint look, by `MIXER FILL` and no `PLAY`; **STOP sends `CG STOP`** with no CLEAR and
      no re-ADD, the resume is a bare `PLAY`, and **CLEAR destroys**; **the restart notice fires,
      nothing reaches the wire between the restart and the press, and PUT BACK ON AIR restores** —
      `B-225`/`B-227`'s DETECT AND SAY, ONE PRESS, exercised as the PRESS.
      ⚠ **The canonical SENTENCE is honestly split** (§17.1): the bridge is Node and
      `REMOVE_ON_AIR_REASON` is a renderer constant, so the wire proves the refusal and the shared
      code, and `removeRowRefusal.dom.test.ts` proves that code becomes the sentence. Together
      they are it; neither alone is.
      🔴 **Green on a first run is not evidence: six plants, six reddenings** (§17.1.1) — each
      applied alone to `caspar-runtime.ts`, each landing on the assertion that names it, each
      reverted by its ORIGINAL BYTES (`Buffer.equals` confirmed). P4 was refined into P4b because
      its redness landed on the notice wait rather than on the contract's own assertion.
- [x] 10.2 Channel independence — **proved at the STORE and UI level, and bounded out loud**
      (§17.2): `apps/runtime/tests/channelIndependence.dom.test.ts`, 8 tests in four sections that
      each name their level. 🔴 **It is NOT provable at the wire and this phase says so rather
      than dressing a UI test as a contract test:** the bridge is single-channel in exactly three
      places (`R-062`), so there is no second channel to disturb, and `MockRuntime.load()` writes
      no `item.slot` either. What IS proved: §1 the ADDRESS is the item and the CHANNEL rides
      inside it, and no per-row verb accepts a channel; §2 two rows **on the same layer number,
      different channels** — the discriminating case — and STOP on one dispatches that row's
      `{ itemId }` (re-parsed through the channel's own request schema) while the other is
      `outerHTML`-identical; §3 the five bulk verbs PINNED as `z.void()`, so §10's sentence is
      FALSE for them BY DESIGN (owner answer A16) and the day one gains a channel this reddens;
      §4 the selection is a pure scope change. Plants: C1 (dispatch by layer) reddened; C2 (a bulk
      verb gains a channel) reddened **only after rebuilding `@cg/shared-ipc`** — recorded,
      because a plant against a workspace dependency is not a plant until it is built.
- [x] 10.3 🔴 **`B-245` SWEPT IN FULL — no remainder** (§17.3). All **154** non-e2e test files
      under `apps/runtime/tests` **as the tree stood at the sweep** — 155 in the commit, the
      difference being this phase's own spec, which was untracked while `git grep` ran and is
      named rather than folded into the count (§17.3); pass 1 re-run with it present returns the
      same single comment hit. In two `git grep` passes (never `grep -r`/ripgrep): the
      mechanical layout reads returned **one hit, and it is a comment**; the wide geometry-word net
      returned **45 `expect` lines, every one read and classified**, not sampled. **ZERO instances
      of the class** — 15 incidental word matches, 9 pure-function arithmetic, 13 declared
      values (style objects, emitted CSS/SVG text, manifest data), 7 inline styles each with a
      positive control beside it, and `layerTableHeader:140` investigated as the one candidate and
      CLEARED (`styles.stateHead` is a real inline object whose sibling `styles.cell` sets
      `overflow: hidden`, so the realistic regression reddens it). `packages/*/tests` and
      `tools/*/tests` return zero too. Nothing to move to Playwright, nothing to delete.
      🔴 **THE POSITIVE CONTROL:** a probe spec asserting `rect.width === 0`, `offsetWidth === 0`,
      `scrollHeight === 0` and the verb block `!== 48` on a REAL `LayerRow` (67 px with `48 × 36`
      verbs in Chromium) **PASSED** — the hazard is live — and the sweep's own grep went from 8
      hits to 1 when the probe was deleted, so the instrument is proven live too. Probe deleted.
- [x] 10.4 🔴 **`P-025` — the commit-msg BOM hook, IN and PROVED BOTH WAYS** (§17.4).
      `.husky/commit-msg` → `commit-msg-cli.mjs` → `commit-msg-decision.mjs` (+ `types/`, 8 unit
      tests, every case written in BYTES rather than a string literal, because a text round trip
      is what makes this defect invisible). It refuses only a mark at byte 0, names which one, and
      **FAILS OPEN** on anything unreadable. Proved against a real `git commit` in a throwaway
      repository: **the positive control first** — a clean message carrying an em-dash and Persian
      COMMITTED with no BOM in `git cat-file` — then the same message plus three bytes REFUSED with
      its one-line remedy, and `rev-list --count` = 1.
      ⚠ **`be883e3c` and `e800fd4e` STAND** — no force-push, no rewrite; the owner's call.
      ⭐ **And the new `types/` file exposed a LIVE turbo-inputs hole, closed in the same commit:**
      `typecheck` and `lint` both READ `types/**` (tsconfig `include`, the eslint node tier) and
      neither hashed it. **Measured, not asserted** — a real type error planted there came back
      `cache hit, replaying logs` with exit 0; with `types/**` added to both tasks' `inputs` the
      same plant is a cache MISS and exit 2.
- [x] 10.5 `pnpm gate` uncached, in the foreground, `0 cached` stated; OpenSpec validated strictly;
      and a COMPLETED, GREEN Linux `e2e` job on the CODE head with its URL, duration, and
      confirmation that it RAN — not that it was skipped.
      ⚠ **The Linux `e2e` owed on `b9325b25` is DECLARED SUPERSEDED, on the owner's instruction:**
      it is many heads back and covered by six later green runs whose `E2E (Playwright)` job was
      confirmed to have RUN (Phases 2A, 3, 4, 5, 6, 7, 8, 9 above), and the jobs are whole-tree.
      Not chased.
      `pnpm gate` — **`93 successful, 93 total · 0 cached, 93 total`**, foreground, 3 m 17 s,
      prettier clean, OpenSpec `78 passed, 0 failed` (its first run was red on two REAL lint
      errors this phase introduced and fixed — four literal `U+FEFF` characters in the BOM guard's
      own comments, and a hand-built `Layer ${n}` alias the `cg/bank-shape` rule caught on a test
      fixture; see `design.md` §17.4). `pnpm --filter @cg/runtime test:e2e` — **145 passed
      (1.7 m)**, Windows, against a re-stamped build (the staleness guard refused the first
      attempt, correctly: the `C2` plant had rebuilt `@cg/shared-ipc` under the app's `dist`).
      ⚠ **NON-AUTHORITATIVE** (golden rule 12a), so it is not what discharges this.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `86e67dc1`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34259488065> — run `conclusion: success`,
      10 m 47 s (17:50:23Z → 18:01:10Z). The **`E2E (Playwright)` job RAN** (17:50:33Z →
      18:01:04Z, 10 m 31 s, `conclusion: success`, its `E2E` step executed 17:51:16Z → 18:00:53Z,
      9 m 37 s); it was not skipped, which is the half a green run alone does not prove (golden
      rule 12b). `Lint • Typecheck • Test • Build` also ran green (17:50:33Z → 17:56:26Z), and
      `Docs check` green. ⭐ The `e2e` job running at all was predicted before the push rather than
      hoped for: `classifyChangedSet` over this commit's eleven paths returns
      `{ kind: 'code', needsE2e: true }` (`P-029`).

## `MONITORS-01` — the monitors default, and the cheap bucket (2026-09-09)

- [x] **A — the fact, traced in the code before the decision.** PGM (`MonitorPanel`) renders a
      fixed empty box: no data input, no bridge call. PVW (`PreviewPanel` → `RehearsalStage`) is
      a LOCAL browser render of the rehearsing rows in a `srcdoc` frame with
      `@cg/template-runtime` inlined — `R-022`, _"nothing is ever sent to CasparCG"_ — and it
      deliberately omits on-air rows. **Case (i): what the console BELIEVES.** `C-016` (the real
      programme-channel grab) is `[ ]`; only its recon kit exists, and its own fourth acceptance
      bullet says its panel would be **OFF by default**. Recorded in `design.md` §19.1.
- [x] **B — the default flipped to HIDDEN** (`DEFAULT_MONITORS_SHOWN`, one home, three readers).
      Chrome above the first data row **428.7 → 181.5 px**, rows **4 → 7**, folded figure
      unchanged from `AUDIT-CLOSE-01`'s to the tenth of a pixel. `design.md` §19.4.
- [x] **A13 handled explicitly, in all four places the rule lives** — `design.md` §19.2,
      this file's A13 bullet, `R-060` in `docs/prd/runtime.md`, and the `runtime-ui` spec. The
      non-persistence RULE stands and is still enforced; A13 answered `R-060`, which is about
      PERSISTENCE, and never decided the boot state. What the flip touches is A13's own EXAMPLE
      ("a known safe state" meant SHOWN); the load-bearing half — a KNOWN state over a REMEMBERED
      one — survives intact. **Not to be read as A13 overturned, and not to be "reconciled" by
      re-persisting the flag.**
- [x] **The toggle is unconditional and proved on both sides of golden rule 12(c)** —
      `shell-chrome.spec.ts` §B4 (Chromium: visible, contained in `[data-app-header]`, carries
      the WORD, > 60 px wide, one press yields both panes) and `monitorsDefault.dom.test.ts`
      (jsdom, whole `App`: exactly one such control page-wide, with a POSITIVE CONTROL).
      **Red-first:** the old default planted back reddened **5 assertions across the two files**;
      reverted by ORIGINAL BYTES, `SequenceEqual` true and `PLANTED` absent.
- [x] **C — the cheap twenty-four.** FIXED 13 (rows 12, 19, 23, 30, 54, 58, 71, 74, 77, 84, 85,
      90, 92), each measured in Chromium at 1280 × 800 before it was applied. ARGUED 7 (rows 3,
      4, 9, 10, 20, 21 and row 38's ground) — ONE finding: every value in them is absent from the
      reference's own nineteen declared `:root` colours, and the app measures equal or better on
      every pair. Neither: rows 32/33 (owner request + the out-of-scope button family) and row 15
      (stale — Phase 4 had already adopted it). `design.md` §19.5.
- [x] 🔴 **THE BUDGET — 7 of 23 is 30 %, over the quarter, so the session STOPPED** rather than
      arguing the rest, as `AUDIT-CLOSE-01` did at 29 %. Scored on the twenty rows this session
      could decide it is 35 %; both are published.
- [x] ⚠ **REPORTED, NOT RE-TUNED — two for the owner.** (1) The row HOVER is **1.02:1** here and
      **1.04:1** in the reference; neither is a hover anyone can see, and adopting the drawing's
      value would not fix it — a visible hover needs a value neither tree has. (2) The half-step
      weights do not render as half steps in EITHER tree: this app ships Exo 2 as five static
      faces (450→500, 550→600, 650→700, measured by rendered width) and the reference's own stack
      loads no face at all. Row 92 is therefore a visual no-op and rows 54/84/85/90 land one step
      heavier.
- [x] **The runs.**
      `pnpm gate` — **`93 successful, 93 total · 0 cached, 93 total`**, foreground, **261.6 s**,
      footer `---- gate ended 2026-09-09T11:02:25.583Z (exit 0, 261.6s)` (`P-045`); OpenSpec
      `78 passed, 0 failed`; `pnpm format:check` clean.
      `pnpm exec playwright test` (runtime) — **151 passed (2.0 m)**, Windows, against a fresh
      `vite build`. ⚠ **NON-AUTHORITATIVE** (golden rule 12a), and its FIRST run was **12 failed**
      — eleven specs whose subject lives inside the strip, plus one real logic error of this
      session's own (a reset control that had correctly just disappeared). The name-based sweep
      had found only five of the eleven; the six it missed address the rehearsal iframes and
      never say "monitor". Fixed once, on the fixture, as `app.showMonitors()`.
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `7e9ebc55`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34344132162> — run `conclusion: success`.
      The **`E2E (Playwright)` job RAN** (11:10:32Z → 11:21:33Z, **11 m 01 s**,
      `conclusion: success`); it was **not skipped**, which is the half a green run alone does not
      prove (golden rule 12b, `P-029`). `Lint • Typecheck • Test • Build` also ran green
      (11:10:33Z → 11:14:42Z, 4 m 09 s), `Docs check` green, `required` green.

## `REPAIR-03` — the modal family, and three corrections (2026-09-09)

- [x] **A — ENUMERATED FROM THE TREE:** 13 dialog surfaces, each mapped to its reference file or
      `data-start` state (`design.md` §20.0). The two with NO reference equivalent are the
      live-source swap dialog and `usePrompt`; the two built differently on purpose are the
      import wizard (audit row 107) and the lock (`B-229`). The two bucket-D dialogs the audit
      named are `#confirm-dialog` = `useConfirm` (×15 call sites) and the engage-lock editor =
      `EngageLockDialog`.
- [x] 🔴 **SHADOW ROOT AND WAVES, CHECKED FIRST — and both answers surprised.** The shadow root
      does NOT exist on `04-playout-layers.html`: `attachShadow` runs once and
      `createStationSetup` builds it on demand, so it appears only under `data-start=channels`.
      And **CSSOM is blocked over `file://`** — `document.styleSheets` reports ZERO rules for a
      file with 1,067 — so waves are counted from the file TEXT and every value from
      `getComputedStyle`. Outer sheet: 82,256 bytes / 1,067 rules (`.modal` 2, head 3, foot 3,
      body 1, icon 2, `.btn` 1). Shadow sheet: 29,098 / 402 (`.settings` 4, `.panel-foot` 4,
      `.tab` 3, `.sub-dialog` 2, `.btn` 2).
      ⭐ **A refinement to "only the last wave paints":** `.modal`'s second restatement is
      `width:100vw` inside a narrow `@media`, so it is NOT what paints at 1280 × 800. The rule
      governs restatements at equal specificity in the SAME conditional context; every width
      here was taken by opening the dialog.
- [x] 🔴 **THE REFERENCE HAS THREE DIALOG FAMILIES** (`design.md` §20.2), with three radii, three
      footer floors and two different primaries. The app's four sizes are mapped by family.
- [x] **B — the four EMBLEMS (62, 72, 98, 113), the WIDTH TABLE (70) and the BUTTON FAMILY
      (87, 106)**, all measured before they were applied. `prose` 460 → **500**, `wide` 720 →
      **860**; `ledger` and `fixed` already matched. Frame radius 6 → **14**, shadow
      `0 4px 16px` → **`0 30px 100px`**; footer band + **72 px** floor; footer button 36 → **39**,
      radius 4 → **7**.
- [x] 🔴 **THE GREEN RULE — and it cost ZERO code.** The reference's mint primary is not adopted
      (green means AIR or HEALTH here). The screenshot was a SAMPLE and was not eyedropped:
      `R-055`'s family already carries `add` and `primary`, and at the call sites **`Add
delimiter` and `Add source` already pass `variant="add"`** and every dialog confirm already
      passes `primary`. No role fell through to `default`. Counted as the owner's bucket-A
      ARGUED, not re-argued. ⭐ The reference's own OUTER `.btn.primary` is `#74cdf6` — this
      app's `--r-accent` — so only its shadow family was ever mint.
- [x] **A1 — `AUDIT.md` CORRECTED IN PLACE.** Its recommendation section contradicted its own
      Part 3. Under the owner's narrow test, **9 of the 15 values in rows 3/4/20/21/38 are
      ADOPTIONS**: rows 20, 21 and 38's ground taken whole, row 3's border a no-op, row 4's ink
      argued on `R-055` instead. The six that stay argued each carry a re-measurement rather than
      the label (verb ink 13.87 vs 11.86, PVW hover 1.48 vs 1.32, selection frame 8.55 vs 7.10).
- [x] **A2 — the row hover was a DEFECT IN BOTH TREES** (1.02:1 here, 1.04:1 in the reference).
      Now `#283443` at **1.20:1**, from neither, capped there by the AA floor on the row's own
      muted ink (**4.61:1**). Asserted as PROPERTIES in `layer-row-hover.spec.ts`.
      ⚠ **Reported:** hover vs the SELECTED fill is 1.04:1 and cannot be widened without either
      dropping `--r-text-muted` below AA or moving the selection wash — both the owner's calls.
      The 2 px accent frame (8.55:1) is what separates them, and that is what is asserted.
- [x] **A3 — `--r-weight-450/550/650` DELETED** (owner answer A9: a token that cannot render is
      a dead token). Exo 2 ships five static faces, so they resolved to 500/600/700 and one was
      a visual no-op; each rule now spells the face that paints and **nothing on screen moved**.
      ⭐ **FINDING:** the reference loads NO face at all (`document.fonts` empty), so it does not
      render its own half steps either — a half step there is evidence of INTENT, never a value
      to transcribe. No faces were added; that is a font-loading decision and the owner's.
- [x] **HARD STOPS HELD.** The lock stays off the primitive — `lockOverlay.contract.dom.test.ts`
      re-run unchanged (C1); the `Revert + Apply …` / `Close` footer rule untouched (C2);
      `--r-modal-foot-h` stays a FLOOR and the two numbers are disambiguated by family — **74 px
      `fixed`, 72 px base, and 59 was neither** (C3, `design.md` §20.4); `B-237`/`B-238`/`R-052`
      untouched (C4); `modal-message-containment.spec.ts` green plus a new §C5 assertion that no
      region is full-bleed on a NON-fixed dialog either (C5).
- [x] 🔴 **THE BUDGET — FIXED 17 · ARGUED 5 = 23 %, UNDER the quarter**, so the session did not
      stop. Counting the owner's green rule as instructed; without it, 4 of 21 = 19 %.
- [x] ⚠ **REPORTED, NOT RE-TUNED.** Every TEXT ratio clears AA. Three adopted values sit below
      the 3.0 graphic floor — all the drawing's own, all decorative rather than identifying
      (WCAG 1.4.11 covers boundaries essential to identify a control): the look segment's rest
      border **2.86:1**, the modal frame's edge **1.96:1**, the emblem's edge **1.60:1**.
- [x] **The runs.**
      `pnpm gate` — **`93 successful, 93 total · 0 cached, 93 total`**, foreground, **245.3 s**,
      footer `---- gate ended 2026-09-09T12:32:07.948Z (exit 0, 245.3s)`; OpenSpec `78 passed,
0 failed`; `format:check` clean. ⚠ Its FIRST run was RED on `tokenHome.test.ts` — a
      `var(--r-modal-btn-pad)` spelled inside a COMMENT, which that guard reads as a live
      reference because it scans the raw file. A real catch of a real dangling name.
      `pnpm exec playwright test` — **157 passed (2.1 m)**, Windows, against a fresh build.
      ⚠ **NON-AUTHORITATIVE** (golden rule 12a); its first run was 2 failed, both value tests
      pinning numbers this session moved (the hover fill and the picker's 720).
      ✅ **DISCHARGED — Linux `e2e`, on the CODE head `720ff69c`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34352223429> — run
      `conclusion: success`. The **`E2E (Playwright)` job RAN** (12:38:58Z → 12:49:45Z,
      **10 m 47 s**, `conclusion: success`); it was **not skipped** (golden rule 12b, `P-029`).
      `Lint • Typecheck • Test • Build` also ran green (12:38:58Z → 12:41:53Z, 2 m 55 s),
      `Docs check` and `required` green.

### `RUNTIME-REPAIR-04` — the picker family (2026-09-09)

- [x] The picker's frame and its second column, at the reference's measured values — 1120 wide
      (`--r-modal-w-library`, a fifth `Modal` size), split `776px 342px`, the aside 342 at its
      own ground and rule. `design.md` §21.0–§21.1, `library-audit-geometry.spec.ts`.
- [x] The `Manage` view (audit row 101), through the owner's gate: 2 new controls, no new data —
      the usage count is the stack snapshot the layer table already reads. §21.2,
      `picker-manage-geometry.spec.ts`.
- [x] 🔴 `Delete from station` is OFF EVERY ROW and behind `Manage` (`design.md` §18.4, decided
      there and built here). What it DECIDES is unchanged: confirm first, the scope and the
      plate-binding cascade named in the confirm, the bridge authoritative on the refusal,
      `B-212`'s places and remedies intact. §21.4, `templatePicker.manage.dom.test.ts` (5) and
      `templateRemoval.dom.test.ts` (10, one added press per case).
- [x] The drop zone moved into the aside — the audit's own finding that it sat below the fold at
      the foot of the list.
- [x] Linux `e2e` DISCHARGED on the code head `885e89f0`:
      <https://github.com/yasermostafaee/cg/actions/runs/34364994282> — `conclusion: success`,
      `E2E (Playwright)` **RAN** 14:39:08Z → 14:50:14Z (11 m 6 s). Not skipped (`P-029`).
- [ ] NOT BUILT, recorded in §21.9: the row hover's SECOND channel (lift the row's own ink one
      step on hover, muted → secondary — it moves away from the AA floor that capped the ground);
      and the import wizard, which is a FEATURE and not a delta (audit row 107).

### `RUNTIME-REPAIR-05` — the picker split in two (2026-09-09)

- [x] 🔴 **The library was proved LOAD-BEARING before anything was built** (§22.0). The owner
      had authorised removing it; all four questions say it stays, and the fourth is decisive —
      `LibraryStore` persists to OPFS and `WebSocketRuntime` reconciles it TO the bridge on every
      connect, so the browser-local library IS the registry.
- [x] **Templates**: a row SELECTS (`aria-pressed`), the aside reads the selection out with a
      verdict, the footer's primary commits it onto the named row; `Enter` and double-click
      route through the same `commit`. `templatePicker.select.dom.test.ts` (8).
- [x] **Import**: its own 750 px dialog (the reference's `#import-dialog`), the drop zone and
      **`Choose file` inside it — audit row 111 CLOSED**. It registers to the station and binds
      no row; `fixedSlotLoad.test.ts` asserts that as a flat invariant.
- [x] 🔴 **No refusal condition changed** (§22.4). `requiredBankFor` is still the only thing
      that stops a load; the import chain's refusals are the same chain as before, now shown
      inside the import dialog rather than in a toast rendered under its own backdrop.
- [x] **§3 — the messages express state**: the two-line paragraph under every refused row is
      gone, its sentence read from ONE source by the chip, the tooltip and the aside. Nothing on
      a row over 4 words; the header sub-line 6. 1054 → 754 characters, 28 % shorter.
- [x] **§4 — the reversed decision is written in all seven places** the old one was recorded,
      dated, with the reason (§22.2). §15.1's filed question is ANSWERED.
- [x] Linux `e2e` DISCHARGED on the code head `a28e0687`:
      <https://github.com/yasermostafaee/cg/actions/runs/34377894915> — `conclusion: success`,
      `E2E (Playwright)` **RAN** 16:37:49Z → 16:48:55Z (11 m 6 s). Not skipped (`P-029`).
- [x] Linux `e2e` DISCHARGED on the docs head `6b4e29c4` as well — two commits, two
      discharges, so neither inherits the other's:
      <https://github.com/yasermostafaee/cg/actions/runs/34380878473> — `conclusion: success`,
      `E2E (Playwright)` **RAN** 17:06:43Z → 17:18:31Z (11 m 48 s). Not skipped (`P-029`).
- [x] 🔴 **THE SPAN DISCHARGED, after `P-046` left it undischarged.** `acf3cf1a` (the owner's
      commit) hit `P-046` and its `e2e` job died before the suite, so `6fe7ffb6` and `eb92725f`
      landed on top of an undischarged tree. Closed by `CI-BROWSER-DEPS-01` at `1c86f0c1`:
      <https://github.com/yasermostafaee/cg/actions/runs/34401286747> — `conclusion: success`,
      `E2E (Playwright)` **RAN** 20:29:48Z → 20:40:45Z (**10 m 57 s**). Not skipped, not cancelled.
      ⚠ The `e2e` job runs the WHOLE Playwright suite with no `--filter` and no changed-file
      input, so a run that EXECUTED it verifies the tree at that SHA — the same whole-tree
      reasoning `P-030` rests on. This one therefore covers **`acf3cf1a`, `6fe7ffb6`, `eb92725f`
      and `1c86f0c1`**.
      ⚠ It is a `workflow_dispatch` run, and deliberately: a push of `.github/workflows/**` +
      `CLAUDE.md` + a PRD file classifies as unable to affect rendering, so the push run SKIPPED
      both heavy jobs (run 34401133859). The dispatch lever exists in `pr.yml` for exactly this —
      _"a manual run always runs BOTH heavy jobs … the correct behaviour for a recovery lever"_ —
      and it takes the classifier's fail-safe branch, so it can only ever over-run.
- [ ] NOT BUILT, recorded in §22.7: the row hover's second channel; the import wizard's
      `Review`/`Complete` steps; the reference's 24 px check circle.

## `SETTINGS-DIALOG-01` — the settings dialog's tab bodies, one of four — IN PROGRESS

The record is `design.md` §23: what contradicted the prompt (23.0), the footer contradiction
resolved by date (23.1), the measured Servers body with every delta FIXED or ARGUED (23.2), the
red-first proof and the plant that found a vacuous assertion (23.3), the before/after geometry
(23.4), the FIXED/ARGUED total (23.5), and the remainder by audit row (23.6).

- [x] S.0 🔴 **§0.3's contradiction resolved by DATE, and BOTH stale copies corrected.**
      `B-240`'s footer rule stands (built 2026-09-07 12:53, `95181658`); `PROMPT.md` §7's later
      restatement and `station-setup/specs/runtime-ui/spec.md`'s per-tab scenarios were stale
      copies of the pre-`B-240` rule and now agree with it. ⚠ The reference itself draws a
      `Close` on its auto-save pane — measured, and ARGUED (bucket A) rather than adopted.
- [x] S.1 **§2 needed no build.** Phase 7 had already measured and rebuilt the frame, rail and
      footer from `09-channel-settings.html`; re-measured here at 1140 × 736 in Chromium, with
      Channel first and both rail marks readable from any tab (23.0).
- [x] S.2 **§3 — the SERVERS body (audit row 135) rebuilt to the measured reference:** the
      `.field` idiom (label above control, `gap:7px`, a 36 px control floor at radius 8), the
      `1.8fr 1fr 1fr` endpoint grid, the A/B chip, the backup empty state, and `Redundancy`
      folded into the connection card as the reference draws it. Tokens: `--r-setup-field-*`,
      `--r-setup-empty-*`, `--r-setup-switch-row-*`, `--r-setup-notice-*` — geometry only, every
      ink a role token. 🔴 **No refusal CONDITION changed**, and the pinned message region is
      still the only home for an event (`.cg-setup-notice` asserted ABSENT on the pane).
- [x] S.3 **Red-first, with a green control:** three plants against
      `station-setup-geometry.spec.ts` §3, all three RED on the assertion that names each. ⭐ The
      third plant initially came back GREEN and exposed a VACUOUS assertion — the empty state's
      text block was unread; closed rather than weakened (23.3).
- [x] S.4 🔴 **STOPPED AT SERVERS on the budget rule**, not because the list ended: 9 FIXED /
      4 ARGUED = **31 %**, over 18.0's quarter. Rows 134, 136 and 137 are named as the
      remainder with what the reference draws for each (23.6). Rows 138, 141, 142 untouched.
- [x] S.5 `pnpm gate` × 2 — foreground, uncached, **93 successful · 0 cached** each, both logs
      carrying their `---- gate ended … (exit 0)` footer (`P-045`);
      `pnpm --filter @cg/runtime test:e2e` **160 passed** (Windows, against a fresh build).
      ⚠ **NON-AUTHORITATIVE** (golden rule 12a), so it is not what discharges this.
      ✅ **DISCHARGED — Linux `e2e`, on BOTH of this session's commits, each on its own run:** - `465735f3` — <https://github.com/yasermostafaee/cg/actions/runs/34478098885>
      (`conclusion: success`; the **`E2E (Playwright)` job RAN** 619 s, its **`E2E` step**
      `completed/success` — checked at the STEP level, not just the job) - `0fda92cd` — <https://github.com/yasermostafaee/cg/actions/runs/34480073813>
      (`conclusion: success`; the **job RAN** 671 s, its **`E2E` step** `completed/success`)

      Neither commit inherits the other's discharge, and both are render changes, so both owed
      one. See 23.7 — including that `P-046`'s deps step and launch probe both passed, while its
      retry and escalation paths remain unexercised and that item stays open.

## `SETTINGS-MATCH-02` — the dialog matched pane by pane (2026-09-11)

- [x] M.1 🔴 **Defect 1 — the card colours.** Root cause was our own token-home sentence
      ("only the GEOMETRY is transcribed"), right about the mint and wrong about the neutrals.
      The depth was INVERTED: a `#0b1017` card on a `#141b25` frame against the drawing's
      `#191e25` on `#15191f`. Ten role tokens, scoped to `[data-modal-size='fixed']`. The INK is
      argued, not adopted — the largest per-channel delta is 11 of 255 (design.md 24.2).
- [x] M.2 🔴 **Defect 2 — the Servers rail item.** Measured: it was NOT clipped, in any state
      (197 × 44 on all five, `scrollHeight === clientHeight`). What was half-painted was the
      MARK — a 0.55 rem dot where the reference draws an 18 px count chip and a 13 px amber
      lock. Both built; the chip says HOW MANY rows are waiting.
- [x] M.3 🔴 **Defect 3 — the Layers pane, built from the reference** (23.6's row 137): the
      head's summary tags and `<details>`, a filter bar with `Shown only` and an `N of M rows`
      read-out, the five-column table (`Layer · Show · Row name · Template · actions`) with the
      coordinate and its row number, a switch, `Unassigned`, the `visibility locked` labels, the
      dirty-row marks, the footnote, the `Graphics beds` head over the same table, an empty
      state. ⚠ `B-235` stays FILED — a layer another system uses is still absent from this pane.
- [x] M.4 🔴 **Defect 4 — the frame.** The outer box was ALREADY fixed (1140 × 736, five times,
      before any change). What moved was the RAIL: a Servers refusal took 109 px out of the body.
      The frame is a rail beside a panel now, as the reference's is; the rail measures **639 on
      all five tabs** (was 565/565/565/565/456).
- [x] M.5 🔴 **The owner's plant report, mid-session** («این قسمت نامرتبه»): two causes, both
      measured — a `<details>` gap declared once and read at one call site, and
      `SETTINGS-DIALOG-01`'s field box mis-transcribed as `36 / 7px 10px` where the reference
      renders **`42 / 10px 12px`** (checked against the painted box AND the drawing's own text).
- [x] M.6 **§8 — the sub-dialog family.** One frame (`record`, the reference's 480), the kind
      picker as a segmented radio group, the live delimiter PREVIEW, the destructive shape with
      its emblem. ⭐ The delimiter's remove had NO confirmation at all and now has one. 🔴 Our
      remove-confirm keeps OUR sentence (`B-237`'s cascade, named) over the reference's "check
      any template bindings" — the frame is adopted, the safety decision is not.
- [x] M.7 **§9 — three message classes.** The pane BANNER is two weights and names the remedy;
      measured at the pane's content column exactly, 20 px clear of the footer. The CARD HELP
      STRIP is standing and lives in its one card — the remote-host note was an amber `refusal`
      `Notice` for a fact that refuses nothing (`R-055`). The FOOTER is one short clause.
- [x] M.8 **§10 — normalise, then constrain.** The contract table is read from the schema, and
      **three of the eight fields are ADDRESSES** where letters are legal (`z.string().min(1)`;
      `isLoopbackHost` accepts `localhost` and `::1`). Two SILENT CLAMPS removed (the DeckLink
      device index and the route channel both rewrote `0` to `1`). Persian and Arabic-Indic
      digits normalise before anything asks whether a character is a digit — driven in a browser
      through a real clipboard paste, because paste is the path a keystroke filter would break.
- [x] M.9 🔴 **`B-240` AMENDED, 2026-09-11, and written down in five places** — the owner asked
      for the reference's `Close` on the panes with nothing to commit. Its substance is intact:
      one name for discard, one for commit, never a `Close` beside an `Apply`, and it routes
      through the dialog's own unapplied-draft guard. Written in `sections.ts` (`commits`),
      `setupFooterVocabulary.dom.test.ts`, `station-setup/specs/runtime-ui/spec.md`,
      `PROMPT.md` §7 and `design.md` 23.1.
- [x] M.10 ✅ **Linux `gate:e2e` — DISCHARGED on `e6a128fb`:**
      <https://github.com/yasermostafaee/cg/actions/runs/34624352527> — run
      `conclusion: success`, the **`E2E (Playwright)` job RAN** 16:51:20Z → 17:02:34Z (**674 s**,
      `conclusion: success`), and its **`E2E` step itself is `completed/success`** — checked at
      the STEP level, not just the job, because `P-046`'s red was a green-looking job whose suite
      never ran and `P-029`'s is its mirror. Not skipped, not cancelled.
      `Lint · Typecheck · Test · Build` green beside it (203 s).

      🔴 **THE FIRST RUN OF THIS WORK WAS RED, AND THE RED WAS IN MY OWN TEST — recorded rather
      than hidden, because it is golden rule 12a with nothing left to interpret.** `9431e3cd` →
      <https://github.com/yasermostafaee/cg/actions/runs/34622060974>, `e2e` **failure** with the
      **`E2E` step itself `completed/failure`** (so it genuinely ran — not `P-046`'s dead step and
      not `P-029`'s skip). One spec of 168:

      · `station-setup-match.spec.ts` §10 —
      `NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Write permission denied`.
      The §10.7 paste leg went through `navigator.clipboard.writeText` + `Ctrl+V`, which works on
      Windows against system Chrome and is DENIED on CI's bundled headless Chromium. The system
      clipboard is an OS permission surface rather than product behaviour, and routing through it
      added a way for the spec to fail for a reason it is not about while removing nothing from
      what it proves: `keyboard.insertText` delivers the whole string in ONE `input` event, which
      is what a paste looks like to the handler. Fixed in `e6a128fb`, with the reading and the
      reason in the spec.

      ⚠ **The process point is the same one `11.9` made and it repeated exactly:** a green
      Windows suite (168 passed) was a reason to push and never a claim that the change was
      verified. Windows found none of this; the Linux run found it in eleven minutes.

      ⭐ `P-046`'s remedy is exercised again on both runs: `Install system deps for cached
      browser` **succeeded** and the launch **probe** passed on each. Its RETRY and ESCALATION
      paths remain unexercised and that item stays open.

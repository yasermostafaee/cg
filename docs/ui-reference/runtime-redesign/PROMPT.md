# PROMPT `RUNTIME-REDESIGN-01` — build CG Control to the owner's approved reference, in ten phases

**Prompt ID:** `RUNTIME-REDESIGN-01` — **REPLACES ALL PREVIOUS VERSIONS** of any prompt carrying this ID or
this title. This file is the single authority; if a chat message and this file disagree, **this file wins**
unless the message says it replaces it.
If this prompt references a section you cannot find in this text, **stop and ask** — do not reconstruct it.
If a premise in a phase fails, stop that phase, say so, and continue the others.

**This is a PROGRAMME, not one session.** It has ten phases. **Each session takes the next unfinished phase,
finishes it, and reports.** Do not start a later phase because an earlier one looks easy; the ordering is
load-bearing and stated at each step. **Say at the top of your report which phase you took and which
remain.** The phase's state of completion is recorded in this programme's OpenSpec change (Phase 1 opens
it) — **read that before choosing a phase, rather than assuming.**

**The goal:** the Runtime app looks and behaves like the owner's approved design at
`docs/ui-reference/runtime-redesign/`, **without losing a single behaviour, refusal, or safety surface the
product already has.**

---

## §0 — THE REFERENCE, AND HOW TO READ IT

- **Nine files, one prototype.** They differ only in `<title>` and `<body data-start="…">`. **Read
  `04-playout-layers.html` as the source of truth and switch `data-start` to reach the others:**
  `templates` · `import` · `audit` · `layers` · `inspector` · `monitors` · `plates` · `audio` · `channels`.
  **Do not diff them.**
- ⭐ **The approved thing is the LOOK and the INTERACTIONS.** Its sample data, its timers, and its
  JavaScript simulation are **not** the app's logic and must not enter it. **Real state, persistence,
  refusals and `.vcg` validation/import continue to come from the bridge and the existing contracts.**
- 🔴 **The prototype's template shape is not the schema.** `t.layouts`, `t.plateIds`, `t.defaultSources`,
  `t.supportsNext` are the prototype's invention. **The real shape is `@cg/shared-schema` plus the `.vcg`
  manifest, and it wins.** The owner did not supply every input format precisely because none of them may
  shrink.
- **The interface stays English and LTR for now**, and must render existing Persian text correctly (isolate
  it — the repo already has the rule). **Nothing is translated.**
- 🔴 **THE REFERENCE IS JUDGED AS RENDERED, NOT AS AUTHORED** _(added 2026-09-08, after Phase 3)_. The
  prototype's single stylesheet was appended to in **four waves**, each restating the same selectors at equal
  or higher specificity, and a browser paints the **LAST**; wave 1's selectors (`.row-title`,
  `.destructive-group`, `.row-actions .btn`, `.row-actions .icon-btn`) match **no element the prototype
  emits**. **Every phase measures the reference in a browser at 1280 × 800 and quotes what it READ — never a
  rule it found in the file.** The stylesheet is what was authored; the browser is what the owner approved.
  ⚠ The rendered layer table is **this console's own table in its pre-Phase-2 hexes** — the prototype was
  built FROM the product — so a delta against the rendered reference is usually a palette move Phase 2
  already made, not a design decision (`design.md` §10.1). A number quoted from the stylesheet without a
  browser reading beside it is not evidence; Phase 2 transcribed the dead wave into tokens that way, and
  Phase 3 had to correct every one of them.

## §1 — PHASE 1: DISCOVERY AND THE DELETION GUARD _(no product code)_

🔴 **Do not guess a component name, a function name, or an internal path. Discover them.**

1. **Read first:** the repo's instructions and **every golden rule in `CLAUDE.md` (12 of them now)**, the
   OpenSpec process, the Runtime source tree, the bridge channel contracts in `packages/shared-ipc`, the
   shared UI primitives (`ui/Modal.tsx`, `ui/focusTrap.ts`, `ui/Tabs.tsx`, `ui/Notice.tsx`,
   `RecordDialog`), and **the token home in `theme.ts` with its `tokenHome.test.ts` guard**.
2. **Produce a MAP**, in the report and as an OpenSpec change document: every surface the reference
   touches, the component that renders it today, and the bridge channel that feeds it.
3. 🔴🔴 **Produce the DELETION GUARD — the most important deliverable of this phase.** **Enumerate every
   surface the app has TODAY that the reference does NOT draw.** These are known and the list is **not**
   complete, so build it rather than taking this one: **the restart / empty-air notice with PUT BACK ON
   AIR** (`B-225`/`B-227`, confirmed on the plant) · **the orphan-layers banner** (`B-235`'s "never
   declared" group) · **the bridge-skew banner** · **the output alarm** (`B-223`) · **the lock screen**
   (`B-229` — it is deliberately off the modal primitive, because _a lock with a way out is not a lock_) ·
   **the connection and failover banners** · **the command toast**.
   **For each: where it lives now, what it will look like after the redesign, and the test that proves it
   still appears.** ⭐⭐ **A redesign that implements only what is drawn deletes everything that is not, and
   nobody notices until the night it was needed.**
4. **Open the OpenSpec change** for the programme, with the phases as its tasks.

**Acceptance:** the map, the deletion guard with a test named per item, and the change document. **No
product file changed.**

## §2 — PHASE 2: TOKENS AND PRIMITIVES _(no visible change beyond colour)_

1. **Bring the reference's palette and geometry into the token home as ROLE tokens** — `--bg #0b1017`,
   `--surface #141b25`, `--raised #1b2532`, `--inset #0e151e`, `--line #2d3a49`, `--soft #24303d`,
   `--text #eef3f9`, `--secondary #bbc8d7`, `--muted #8e9eaf`, and the accent pairs `blue #74cdf6` /
   `mint #85e4b6` / `purple #c3acff` / `amber #f3cd88` / `red #ffaaa7` with their `*bg` companions.
   🔴 **No literal anywhere; `tokenHome.test.ts` stays green.**
2. **Geometry becomes tokens too** — row padding, action-button heights, the icon-button box, and ⚠ **keep
   `--r-modal-foot-h` as a floor**: _a height that belongs to being a footer cannot be a function of what a
   section puts in it._
3. 🔴 **State what this does to the measured decisions and do not silently overwrite them:** the owner's
   **marked-row fill `rgb(145 93 5)`** and the inks measured at **5.06:1** and **3.86:1**. If the new
   palette changes their contrast, **report the new numbers and ask** — do not re-tune them yourself.
4. **Re-measure the semantic colours against the new surfaces** — on air, refusal amber, danger red — and
   say which now fail their ratio.

**Acceptance:** the whole app takes the new palette from tokens; `tokenHome.test.ts` green; a contrast table
for every semantic ink; **`pnpm --filter @cg/runtime test:e2e` run locally** (golden rule 12).

## §3 — PHASE 3: THE LAYERS TABLE

> ⚠ **SUPERSEDED (2026-09-08) — the numbers this section quotes are wave-1 CSS that no browser paints.**
> `16px 17px`, `55px · 135px · 33%`, the `835px` `min-width`, hover `#1b2a3a`, selected `#192e40` with
> `inset 3px 0 0`, the `.row-title` empty-row treatment, `min-height 34px`, `32×34` and the 30px
> destructive group were read off the stylesheet's FIRST wave, which the same file overrides four times
> further down, and `.row-title` / `.destructive-group` / `.row-actions .btn` match no element the
> prototype emits (§0's rendered-not-authored rule, added because of this). **The measured table is
> `design.md` §10.2** — 67 px rows, `15px 12px` cells, six `48 × 36` verbs in a 12 px grid, hover `#1F2937`,
> a 2 px selection frame, `rgb(91 93 96)` empty rows — and it is what Phase 3 built. **Owner answer A8: wave
> 1 is REJECTED.** Nobody ever saw it rendered, and `32×34` with a 30px destructive group shrinks the STOP
> and CLEAR hit targets on an on-air console; **`48 × 36` stays and no later phase reopens it** (the
> dead-rule token was deleted under A9, not kept). The two paragraphs below are kept as written so the
> error stays visible; read them as history, not as the target. §§4–10 were checked for the same defect
> on 2026-09-08 and quote **no** number or selector from the stylesheet — §4's `authoredLooks(t) =
t.layouts` is the prototype's SCRIPT, already flagged as its invention.

**Adopt from the reference, precisely:** row height and cell padding (`16px 17px`), the
`#`/State/Name/Template/verbs column widths (55px · 135px · 33%), the table's `min-width`, **hover
`#1b2a3a`**, **selected `#192e40` with `inset 3px 0 0` the blue**, the empty-row title treatment, and **the
Graphics-beds divider row**. _(superseded — see the note above)_
**The six row verbs keep a fixed place and size** — header labels **`Item · Play · On PVW · Next · Stop ·
Clear`**; `min-height 34px` for the text buttons, **32×34** for the icon buttons, and **the destructive
group split off by a left border with 30px buttons**. **Each verb gets its own hover treatment**, and so do
the top bar's **Clear all** and **Remove all**. **The Look buttons keep their large click target.**
_(the sizes are superseded — see the note above; the header words, the per-verb hovers and the Look
buttons' large target are rendered facts and stand)_

🔴 **The command contract does not change, and this is the phase where it is most at risk:**

- **Load, Take, Update, Stop, Clear and Remove keep their existing meanings**, exactly.
- 🔴 **`Update` does not take.** For a row that **does not own the live layer**, an Update must not cause a
  `PLAY`, an unmute, or a fill. **Red-first this**, as its own test, before touching the table.
- **The existing refusals stay:** `R-017`'s on-air REMOVE refusal with its canonical sentence, the bulk
  gates, and the published `removeExempt` answer. **Do not re-derive an answer the bridge publishes.**

**Acceptance:** a measured property table (row height, paddings, the six verb boxes, hover and selected
colours) reference-vs-app with every delta fixed or argued; the Update-does-not-take test; every existing
refusal still asserted; e2e run.

## §4 — PHASE 4: LOOKS

**The number and arrangement of Looks are read from the template's own definition** — the prototype models
this as `authoredLooks(t) = t.layouts`, with the visible plates coming from the selected look's rects.
**Use the real schema's equivalent, discovered in Phase 1.**
🔴 **A six-frame template may declare looks of 1, 2, 3, 4, 5 and 6 frames.** ⭐⭐ **Frame count, look count
and look id are three different things — do not let any of them stand in for another.** **Only the looks the
template actually declares are shown.**
**Switching a look preserves the source-to-frame relationship.** **Red-first that**: switch away and back,
and the same source is on the same frame.

**Acceptance:** a template with an irregular look set renders exactly its own looks; the switch preserves
bindings; no look is invented from the frame count.

## §5 — PHASE 5: PREVIEW, PROGRAM AND THE INSPECTOR

- **The preview is multi-layer**, as `06-preview-program.html` shows.
- 🔴 **Three things stay independent: which row is SELECTED, which rows are IN PVW, and whether the monitors
  are SHOWN.** ⭐ Coupling any two of these is the easiest mistake in this phase and the hardest to notice.
- **The Inspector is available the moment a row is selected**, and **each row's draft is kept** — a draft is
  not lost by selecting another row and coming back.
- **The Update button stays pinned at the foot of the panel**; **X and Y align**; **an input's focus is one
  ring, not two**; **subtitle items reorder by their grip handle.**

**Acceptance:** independence proved by test for all three pairs; drafts survive a round trip; the footer
stays pinned at every panel height; e2e run.

## §6 — PHASE 6: LIVE PLATES AND AUDIO

- 🔴 **Live plates are the layers occupied by inputs. They are NOT the source catalogue** — the catalogue is
  installation-wide and lives in Station setup; a plate is a seated layer. **Say in the report where each of
  the two is read from.**
- **The plate controls and the audio modal open by right-click**, plus the keyboard equivalents the
  reference wires (`ContextMenu`, `Shift+F10`). **Keyboard parity is not optional.**
- **`ON = 100 % · OFF = 0 %`**, and 🔴 **SOLO is scoped to the group belonging to the owning row —
  including that row's hidden frames — and nothing outside it.**
- 🔴 **Changing audio must not put a ready row on air.** **Red-first that** — it is the air-safety assertion
  of this phase.

**Acceptance:** the SOLO scope test names the owning row; the audio-does-not-play test is red-first;
right-click and keyboard both reach the modal.

## §7 — PHASE 7: SETTINGS AND CHANNELS

- **The Settings button opens the full Station setup modal from the final reference**
  (`09-channel-settings.html`), which supersedes the earlier settings mockups in `docs/design/`. ⚠ **Mark
  those superseded in one line; do not work from them.**
- **The channel list is not tied to the prototype's fixed count** — it is shaped to be filled from an API.
  ⭐ **That is a UI shape, not a schema migration.**
- 🔴 **Per-channel settings and state are separated by channel id; station-wide settings keep their real
  scope.** ⚠ **No persisted key, file or schema changes in this phase.** Where the bridge is single-channel
  today, **say so and file the gap — do not invent a multi-channel contract.**
- **Everything already decided about this dialog survives:** one Settings entry point, the fixed frame
  measured on **two** edges, per-section footers and refusals, the footer rule (a section with a commit gets
  `Revert` + `Apply …`; a section without one gets a single **`Close`**, which dismisses the dialog and
  commits nothing), the `B-237` confirmation that **names** the templates and plates it
  would drop, and the `B-238` refusal that is shown.

  🔴 **That footer rule has now been settled TWICE, in opposite directions, and this line has been
  wrong in both — so read the dating rather than the sentence.** `B-240` retired the per-section
  `Close` in `95181658` (2026-09-07) because it was a THIRD answer to one job; this line still said
  `Close` six hours later and `SETTINGS-DIALOG-01` corrected it to "no buttons at all". **The owner
  then looked at the reference — which draws `Close` on exactly those three panes — and asked for it
  back (`SETTINGS-MATCH-02`, 2026-09-11), so `Close` is correct again and this line is correct again
  for the first time.** What `B-240` was actually protecting never moved and is what makes the
  amendment safe: the `Close` is the DIALOG's own dismissal on the dialog's own path (it asks before
  dropping a draft), it is never beside an `Apply`, and discard is still `Revert` and nothing else.
  `sections.ts`'s `commits` column is where the rule lives; `setupFooterVocabulary.dom.test.ts`
  asserts it.

**Acceptance:** channel-keyed state proved by test; the persisted-key census unchanged; every Station setup
decision still asserted; e2e run.

## §8 — PHASE 8: TEMPLATE LIBRARY, IMPORT, AND THE AUDIT LOG

- **The library and import surfaces follow `01` and `02`** — ⚠ **and the real `.vcg` validation and import
  path is preserved exactly.** The prototype's import is theatre; the product's is not.
- **The audit log follows `03`.**
- 🔴 **Point 8's decision, and it is a decision, not a deletion: removing the manual console-name picker
  from the interface must not remove the audit's ability to say WHO did something.** ⚠ `B-143` put the
  _"self-declared and unverified"_ caveat beside the actor column **on purpose**. **Say what identifies the
  actor after the picker is gone, and what happens to that caveat.** If the honest answer is "the actor
  becomes less identifiable", **say that plainly and let the owner decide** — do not quietly ship a log that
  names nobody.

**Acceptance:** import still validates and refuses what it refused before, proved by the existing tests; the
audit records an actor and the report states how it is now determined.

## §9 — PHASE 9: THE SURFACES THE REFERENCE DOES NOT DRAW

**Bring every item from Phase 1's deletion guard into the new design**, each one dressed in the new tokens
and each one still appearing when its condition holds.
🔴 **The lock screen keeps its own chrome and its no-exit contract** — it is deliberately not on the modal
primitive, and **the reference must not be used as an argument to put it there.**

**Acceptance:** one test per guarded surface, each proving it still renders under its condition; the lock's
contract asserted unchanged.

## §10 — PHASE 10: VERIFICATION

- **The air-sensitive scenarios, end to end:** an Update on a row that does not own the live layer sends
  nothing; REMOVE on air is refused with its sentence; CLEAR/STOP behave as contracted; an audio change
  plays nothing; a look switch preserves sources; the restart notice fires and PUT BACK ON AIR restores.
- **Channel independence:** an action on one channel does not disturb another's state.
- **The project's gates:** `pnpm gate` uncached, in the foreground, `0 cached` stated; OpenSpec validated;
  **and a completed, green Linux `e2e` job on the CODE head with its URL, duration, and that it RAN** —
  ⭐ **golden rule 12: a green gate is no evidence about anything that renders.**

## §11 — GLOBAL RULES FOR EVERY PHASE

**TypeScript strict; the browser/Node boundary respected; the OpenSpec process followed.** Red-first for
every behaviour change, source stashed. **Assert the property, not the artefact that happens to express it
today.** ⚠ **A red-first assertion against a constant that does not exist yet is
`expect(undefined).toBe(undefined)`** — assert non-empty first, then identity. ⚠ **jsdom has no layout, so a
dom test asserting a box, an edge or an overflow compares zeros** — geometry belongs in Playwright.
🔴 **Hard stops:** no AMCP to `192.168.21.114` · **delete nothing on the owner's machine** · the bank
fencing, the refusal and preflight paths, `reconcileOnReconnect` and the `LockPolicy` table are untouchable
· **no persisted key, file or schema change without naming every producer and consumer first** · **no colour
literal** · **nothing translated** · **`git add -A` is not used — stage by path and name the paths**
(`P-044`).

## §12 — REPORT SHAPE, EVERY PHASE

Open with the Prompt ID **and the phase number**. Then: what you discovered that contradicted this prompt ·
what you built · the measured comparison where the phase has one · the red-first proofs · what you did
**not** do and why · **the deletion guard's status** · the phases remaining · numbers filed and taken ·
`pnpm gate` (`0 cached`, foreground), the commit verified against `git ls-remote origin dev`, and the e2e
URL, duration and that it RAN on the code head.

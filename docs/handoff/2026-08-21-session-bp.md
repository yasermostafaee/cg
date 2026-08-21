# Session BP — the row freezes its assignment at TAKE, and the placement question stops being a correctness question

> **Safe to pull.** Everything below is on `dev`; see §0 for the pushed SHA. `pnpm gate` is green
> uncached (`0 cached, 89 total`).
>
> **Letter:** `BP`. `BN` is still free and still reserved for the confidence-grab recon; `BO` was
> the previous session.

## 0. State

| Fact                   | Value                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Tip read at start      | `0ed9be81` — `HEAD == origin/dev`, tree clean, zero delta                                  |
| **BO's owed e2e**      | ✅ **DISCHARGED** — see §6                                                                 |
| **Pushed**             | `a5e7b9eb` — verified by `git ls-remote origin dev`, never by an exit code                 |
| **This session’s e2e** | ✅ **DISCHARGED** — see §6                                                                 |
| Resolved               | `tasks.md` **7.16** (the assignment collapse). `B-155`'s CAUSE closed; the item stays OPEN |

## 1. The decision, in one sentence

> **A row that is ON AIR does not change its picture because somebody edited configuration.**

The take captures the template's `{plate → catalog entry}` — level 2 — and every later resolution on
that row (look switch, `R-048` swap, UPDATE, reconcile after a blip) reads that snapshot. It thaws at
a **landed** `out`/`stop`, dies at `remove`, and a **re-take re-captures**, which is how an operator
adopts an edited default.

🔴 **Only level 2 freezes.** The sentence _"freeze the row's sources at take"_ would take three
things away by accident, so each has its own test: `R-048`'s emergency swap still reaches air in one
action; the row's per-look bindings still reach air; the CATALOG still moves the row (the snapshot
names which ENTRY a plate uses, never what that entry resolves to).

**Why not BO's (c) — "disable the editor on an on-air row".** It narrows WHO can reach the mechanism
and leaves the mechanism intact: the assignment is template-wide and installation-wide, so another
row on the same template — or **another station's Runtime against the same bridge** — can write it
while this row is live. Asserted on the wire: two rows of one template on air at once, resolving
different level-2 answers, each pinned by its own take.

## 2. What landed

- **The freeze** — `LiveSourceFrozenAssignmentSchema` (published + retained), `#frozenAssignments` /
  `#assignmentsFor` / `#thawAssignment` / `LevelTwoSource` in the bridge, `MockRuntime` parity,
  `StackRetentionStore`.
  - **The pin is `plan.resolvedFrom`, not a second read of the store** — one evaluation, two uses
    (golden rule 7 on a value). A re-read would sit on the near side of the take's `await`s with
    `setSourceAssignments` free to land between them.
  - **`LevelTwoSource` is its own parameter, not read off `scope`.** They agree today; `scope` says
    which frames may REFUSE and this says where level 2 COMES FROM. And it must be `'fresh'` for the
    take, or a re-taken row is welded to its first take and the editor is inert for it.
- **The surface the freeze made necessary.** LIVE PLATES shows the LIVE assignment (it is the
  control for that value, and the draft's dirty baseline), so on a frozen row it shows something the
  row is not resolving. It now names the captured source beside the picker, per plate, only where
  they disagree.
  - 🔴 **Gated on `patched`, not `overridden` — and that distinction caught a false sentence.**
    `overridden` means "the patch diverges from the PICKER", which is FALSE for a patch equal to the
    live default. Such a patch is still in force and still outranks the pin, so the first cut of this
    line would have announced the frozen source while the patch had the plate somewhere else.
    `onAirPlateSource` now answers both questions and says which is which.
- **§1.3's badge colours** — green / violet / blue, from `colors.onAir` / `colors.rehearsing` /
  `colors.ready`, asserted against the TOKEN. Three comments handled explicitly rather than
  overridden: `styles.live`'s "NOT GREEN" REPLACED (its premise died with `B-156`), `--r-rehearsing`'s
  rule WIDENED in wording (state indicators may; controls still may not), and a note at `--r-ready`
  naming the `--r-accent` trap (same hex, opposite rule). `data-look-badge` gained `rehearsing` —
  two states sharing `not-on-air` was `B-156`'s collapse in the attribute.
- **`B-153`'s coverage gap, filed** (§3 of the prompt) — the handshake compares ROUTES, so it cannot
  see a stale bundle that calls the same routes and strips a field in its own zod parse. That is the
  shape behind 7.19's §3c. ⚠ The version compare stays rejected; the candidate recorded is a build
  stamp beside the route set, **not built**.
- **A raw NUL byte removed from `@cg/shared-ipc/channels/sources.ts`** — one dedupe-key separator,
  written as a literal instead of a NUL escape. Same string at runtime; a file containing one reads as
  BINARY to `grep -r` and ripgrep, so every tree-wide sweep skipped the module that owns
  `SourceAssignments`. ⚠ `git grep` was NOT blind (it samples only the first 8000 bytes and the NUL
  sat past that) — which is exactly what made the hole look closed.
  - **A tree-wide sweep found a SECOND one** in `tools/caspar-amcp-probe/src/lifecycle-probe.ts`
    (four, in an OSC packet parser). Both are fixed; **every one of the 2399 text-ish tracked files
    is now NUL-free**, and the 113 remaining hits are all genuine binaries (fonts, PNGs, video
    fixtures, `.vcg` zips).
  - 🔴 **And this session then wrote one into THIS FILE, in the paragraph describing the hazard.**
    Writing the six characters of the escape through a JSON tool argument produces the byte, not the
    text. Caught by re-running the scan rather than by anything failing: prettier does not object,
    no lint rule fires, and `git grep` reads the file fine. **If you write about NUL bytes, scan the
    file you wrote** — `node -e "…readFileSync(p).indexOf(0)"` is the whole check.

### Two guards that were passing vacuously, found while extending them

1. **`stack-retention`'s field-parity guard derived its KEYS and hand-wrote its FIXTURE.** A new
   field forgotten in `toRetained` was `undefined` on the row and therefore never a candidate for
   having been dropped — the guard read as complete and would have passed on the exact omission it
   exists to catch. The fixture's own completeness is now asserted from the same derived list.
   Mutation-checked afterwards: it reddens naming `frozenAssignment`.
2. **`#published()`'s fast-path guard never listed `lookSourceOverride`** — an item carrying only
   that field was returned unchanged, dropping it. Narrow to reach (it needs `activeLookId` to be
   `undefined` too, i.e. a bound row whose template is no longer registered), which is why nothing
   caught it. Both it and `frozenAssignment` are now in the guard, with a note that the list is
   load-bearing.

## 3. Two existing tests changed, both deliberately

- **`B-155 — an assignment change LURKS…` is INVERTED.** It asserted the DEFECT (the look press
  issuing a `PLAY` with the edited source), which was right while nothing was fixed. The cause is
  gone, so it now asserts the switch is a pure cut, plus a positive control that a re-take adopts the
  edit. Leaving it would have left a test **demanding the flash**.
- **`an ON-AIR row with an EMPTY ledger still reconciles` had its FIXTURE rebuilt.** It arranged its
  state through the lurk — assign after the take, count the two `PLAY`s. Its SUBJECT (that
  `setActiveLook` reads the STATUS, not an empty ledger) is unchanged and is now asserted more
  sharply: a refusal naming the unassigned plates is positive proof the plan was built, where the old
  spelling could not tell "reconciled and seated" from "reconciled and refused".

⚠ **The consequence that made that necessary, stated so it is not rediscovered:** a plate that
resolved to NOTHING at take is unassigned for that run. The snapshot is the row's COMPLETE level-2
answer; a partial freeze would leave "…except for plates that had no assignment" as a caveat and
reopen the multi-station case for exactly those plates. The live door for such a plate is its
per-look binding; the permanent one is a re-take.

## 4. §1.2 — placement, deferred by decision

`LivePlatesSection` is **not moved and not removed**, and BO's stale note in its header saying the
collapse was pending is REPLACED. Direction is recorded in `tasks.md` **7.16b**: the template's own
entry, **not** the Live sources modal (_"that modal is about defining the INPUTS themselves"_).

**Does a host exist? Narrowly, and it is not obviously the right one.**
`features/fixedLayers/useTemplatePicker.tsx` is by its own header _"the ONLY template list in the
product"_ — it lists what the browser holds, carries R-005's template removal, and already reads
assignments (`forgetTemplateAssignments`, unassigned-plate marks). Against it: it is a MODAL reached
from a row's `LOAD`, so hanging installation config off it makes a config editor reachable only by
starting a playout action. `features/library/` is logic only, no panel. So probably a NEW surface.

## 5. What CANNOT be claimed

🔴 **That the plant no longer flashes.** This removes the CAUSE, asserted on the AMCP wire.
`B-155`'s residual is a PLANT MEASUREMENT — `6.9a`, `§3b`, and the frame count at 25 fps reproduced
twice with the channel read EMPTY before and after — and it is still owed. `7.15` is deliberately
**not ticked**; ticking it on a green suite is the precise mistake that item's own text forbids.

🔴 **That §3c (7.19) is explained.** The `B-153` filing describes a gap that WOULD produce that
report; it is not evidence that it did. Still needs the owner's build/refresh state, or a repro on a
page hard-reloaded against the current bridge.

**Not done, and not asked for:** §5.5's Persian/RTL case on the masked label (still owed from BM-2).

## 6. Verification

- **BO's owed Linux `gate:e2e` — DISCHARGED.**
  <https://github.com/yasermostafaee/cg/actions/runs/32506793703> — head `0ed9be81`, `completed` +
  `success`, and the **`E2E (Playwright)` job RAN** (17:11:00Z → 17:19:49Z), not skipped.
- `pnpm gate` — green, **uncached** (`0 cached, 89 total`; openspec 58/58 valid).
- `@cg/caspar-bridge` 78 files / 598 tests · `@cg/runtime` 95 files / 870 tests — full suites, not
  just the new specs.
- **Mutation-checked, not assumed:** bypassing the pin reddens 3 of the 9 freeze tests (and named the
  wire lines); omitting `frozenAssignment` from `toRetained` reddens the retention guard naming the
  field.
- The new E2E ran locally, 2/2.
- ✅ **THIS session’s Linux `gate:e2e` — DISCHARGED.**
  <https://github.com/yasermostafaee/cg/actions/runs/32524325718> — head `a5e7b9eb`, the tip
  carrying every change of the session, `completed` + `success`, and the **`E2E (Playwright)` job
  RAN** (2026-08-21 20:35:38Z → 20:45:57Z), not skipped. Also written beside `tasks.md` 7.16/7.20,
  so the evidence outlives this file.
  ⚠ It discharges NOTHING for `B-155`’s residual, which owes a PLANT measurement rather than a
  suite. A green Linux run says the cause is gone from the wire; it says nothing whatever about
  what the plant renders.

## 7. Flags for the owner

1. **On-air / product source** — this changes what a live row resolves. That is the point, and it is
   the class that must never land silently.
2. **The Linux `gate:e2e` for this session’s tip is DISCHARGED** — §6 carries the run URL. What is
   still owed is the PLANT measurement behind `B-155`, which no CI run can supply.
3. **No shared config changed.** `CLAUDE.md`, `turbo.json`, root `package.json` and the gate-hook are
   untouched. ⚠ **One candidate, deliberately NOT taken:** golden rule 9 makes `git grep` the sweep
   instrument, and §2's NUL finding is a case where a file can be invisible to `grep -r`/ripgrep
   while `git grep` happens to work. A one-line addendum to rule 9 would record that; this session
   was not asked for a rule and did not write one.

## 8. Out of scope — named untouched

`B-155`'s plant residual · 7.15's frame count · 7.17 (stale title) · the confidence-grab recon
(`BN`) · the unexplained 2× · AW's banner · BC's two deferred findings · P2.DEL · Session E ·
`template-http-server.ts` (read only, never staged).

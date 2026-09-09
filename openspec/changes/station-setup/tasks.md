# Tasks — Station setup (`STATION-SETUP-02`)

## 0. Premises

- [x] 0.1 Pulled to `576a72eb`; the modal contract exists (`runtime-modal-contract`) and the
      derived census enrols the dialogs by import; the dead `settings.*` channel is gone (not
      looked for; each row uses its real bridge channel).

## R. Riders

- [x] R1 `P-045` — the Stop hook streams the gate's output into its log through a file
      descriptor (`tools/gate-hook/src/gate-run.mjs`); no pipe, no `maxBuffer`. Proved by a
      run: a 2 MiB child through the same function exits with its own code and every byte in
      the log, with the OLD shape's death (`ENOBUFS`, `SIGTERM`, `status: null`) as the
      positive control (`gate-run.test.ts`). `CLAUDE.md`'s `P-040` remedy text corrected: read
      the footer first; a footer-less log is a capture that died.
- [x] R2 the marked row's muted texts take `colors.markedRowInk` (5.06:1 on the owner's
      `rgb(145 93 5)`); `textMuted` measured 2.19:1 there. The edge bars take the notice's INK
      (`#FCD34D`, 3.86:1) — they were the strip's border at 1.11:1 and had vanished. Ratios
      asserted against the fill PARSED from the stylesheet (`emptiedAirRowContrast.dom.test.ts`).
      ⚠ There is no description column; the second muted text is the "(not in this browser)"
      marker, and the stale note that named a description was corrected.
- [x] R3 SENT, not observed late: the `R-022` startup volume re-assert lands on 1-95 140–160 ms
      after HEALTHY in 12/12 probe rounds, on the first sweep tick; the spec's read happened
      2–12 ms after HEALTHY and lost the race once under gate load (492 ms). `boot()` now waits
      for the re-assert as a deterministic barrier and the MIGRATES spec measures from a
      baseline — the migration's traffic alone.

## 1. The shape

- [x] 1.1 `ServerSettingsPanel` → `StationSetupDialog`, wide by the contract's criterion,
      sections from ONE table (`sections.ts`), a jump row, one pinned region with each message
      prefixed by its section.
- [x] 1.2 The on-air guard scoped to Servers and stated; `APPLY SERVERS` named for its scope;
      `AsyncButton` kept for Apply (documented exception).

## 2. What moves in

- [x] 2.1 Live sources → `SourcesSection`; the status bar's SOURCES is a deep link.
- [x] 2.2 Delimiters → `DelimitersSection`; the Inspector's gear is a deep link; Reset is a
      body control.
- [x] 2.3 Candidate layers → `CandidateLayersSection`, both of the old dialog's shapes (the
      editor, and the explainer as the section's empty state); Configure and "What the bridge
      needs" are deep links; Apply/Revert in the section; an accepted apply reports and stays.
- [x] 2.4 Channel raster → `ChannelRasterSection`, the first UI for `channelSettings.set`.
      ⚠ SUPERSEDED 2026-09-07 by `STATION-CHROME-01` §4 — the raster is REPORTED, in a
      read-only `Channel` tab (`ChannelSection.tsx`); `ChannelRasterSection` is deleted.
- [x] 2.5 Reserved / live layers → `StationLayersSection`, read-only.
      ⚠ SUPERSEDED 2026-09-07 by `STATION-CHROME-01` §3 — Station layers left settings for
      the panel it already has; the live-layer LEDGER moved with it rather than vanishing.
- [x] 2.6 The four old dialog modules deleted; every entry point either a deep link or gone.

## 3. What must not move — proved

- [x] 3.1 `stationSetupScope.dom.test.ts`: six specs, each a render or source check on the
      surface that keeps the setting AND a render + source check that Station setup has no
      second control.

## 4. Zero persisted keys change — proved

- [x] 4.1 `persistedKeyCensus.test.ts` (browser) and `persisted-files-census.test.ts` (bridge)
      derive the inventories from the tree and pin them to `576a72eb`'s. Identical.

## 5. B-116 first

- [x] 5.1 Red-first: `template-registry-siblings.test.ts` writes both sibling files with the
      REAL stores and showed `skipped: 2` before the fix.
- [x] 5.2 The rule: `isRegistryRecordName` — a record is a file the registry would have
      written. No file moves. The raster row ships.

## 6. The two shapes

- [x] 6.1 `livePlates.dom.test.ts` edits the catalog through the section and asserts the
      assignments channel is never written; `stationSetupScope.dom.test.ts` asserts the source.

## 7. Contract and census

- [x] 7.1 `modalMessageRegion.dom.test.ts` enrols `stationSetup/StationSetupDialog.tsx` by the
      same rule as every dialog (it imports the primitive) and passes every static invariant;
      the four folded modules are asserted ABSENT from the derived set.
- [x] 7.2 `modalDismissRole.dom.test.ts`: Cancel is `cancel`, `APPLY SERVERS` is `primary`,
      the footer has exactly two actions.
- [ ] 7.3 `ownerLabelFor`'s raw-itemId fallback → `shortId` — NOT taken; it would grow the
      diff into `liveLayerRows.ts` and its tests, outside this change's files.

## 8. The sweep

- [x] 8.1 `git grep -n -i` over `apps packages tools docs openspec CLAUDE.md DEBT.md` for
      `Open server settings`, `Open live sources`, `Server connection settings`,
      `Server connection ▸`, the four module names, `Candidate layers —`, `Live sources modal`,
      `delimiters dialog`. Hits in live code and the operator guide fixed; historical records
      (PRD entries, handoffs, archived changes, `Notice.tsx`'s before-table, `DEBT.md`) left
      as records. Positive control: the sweep found the e2e specs before they were edited.
- [x] 8.2 Playwright: `server-settings`, `pgm-output-missing`, `live-source-sources`,
      `modal-message-in-viewport`, `pvw-live-plate-placeholder` re-pointed (dialog name, deep
      link names, `Done` → `Cancel`, `Add` scoped to the Live sources region because the
      dialog now has two); `station-setup.spec.ts` added.

## 9. Gate and the Linux e2e

- [x] 9.1 `pnpm gate`, uncached, foreground, `0 cached` — run THROUGH `gate-run.mjs` so the
      run itself is R1's real-gate proof (see the session report for the log size).
- [x] 9.2 Linux `gate:e2e` — **DISCHARGED** on `30a0cf17` (the head carrying this work):
      <https://github.com/yasermostafaee/cg/actions/runs/34045753015> — `E2E (Playwright)`
      **RAN** and passed, 16:32:16 → 16:42:40 (**624 s**), run `conclusion: success`, with
      `Lint • Typecheck • Test • Build` green beside it (358 s).
      ⚠ The FIRST run of this work (`df693ce9`,
      <https://github.com/yasermostafaee/cg/actions/runs/34044676672>) was RED on both heavy
      jobs and is recorded rather than hidden: the `ENOBUFS` control asserted Windows's death
      signature, the fallback fixture's `process.exit` dropped a pipe write on Linux, and the
      new e2e matched region names by substring (`Outputs` also found `Program outputs`) and
      set a raster while the seed's rows were on air. Fixed in `30a0cf17`; a failing run
      discharges nothing.

## 10. `STATION-CHROME-02` — the container changed, the contents did not

- [x] 10.1 §1 ONE DOOR. The status bar's `SOURCES` and the Layers bar's `Configure` are gone
      (`StatusBar.tsx`, `App.tsx`, `LayersPanel.tsx`); `onOpenSources` deleted from the props.
      The DEEP-LINK MECHANISM is untouched and two entry points still carry it: the Inspector's
      delimiter gear, and the Layers empty state. The empty state's sentence, which NAMED the
      removed button, now reads `SETTINGS ▸ Layers`.
- [x] 10.2 §2 ONE FRAME. `Modal` gains `size="fixed"` — `min(1000px,100%)` ×
      `min(680px, 100vh-48px)` from the token home, flush chrome, body `flex: 1`, footer bar.
      `station-setup-frame.spec.ts` measures the dialog box AND the footer's top edge on all
      five tabs, plus the pane's overflow and the short section's slack. It found a real
      regression: §5's longer footer sentence wrapped against `maxWidth: 58ch` and moved the
      footer's top edge.
- [x] 10.3 §3 ONE VOCABULARY, in `controls.css`: `.cg-rail*`, `.cg-table*`, `.cg-card*`,
      `.cg-btn--quiet` + the canonical `.cg-list-remove` hover. Six new role tokens in
      `theme.ts` (rail hover/selected fill+line, table rule + row hover, danger wash) and four
      frame sizes. No new literal at a call site; `tokenHome.test.ts` green.
- [x] 10.4 🔴 THE WHITE BOX (owner-reported, and measured before the fix). A rail tab's
      selected style merged the `borderColor` LONGHAND over the `border` SHORTHAND; React
      removes the longhand on deselect, which deletes the shorthand's colour declarations too,
      leaving a width and a style with no colour — Chrome paints it WHITE. Every visited tab
      kept a white box. Fixed by moving the rail to classes; `railWhiteBox.dom.test.ts` guards
      the structure, and the rail gains the hover inline styles could never express.
- [x] 10.5 The group headings are distinct from their items (owner, same day): items to full
      `--r-text`, headings muted + smaller + tracked out + a rule above. Separated on three
      channels rather than by dimming, which would have pushed a small uppercase label under
      4.5:1.
- [x] 10.6 §5 The Live-sources footer no longer claims nothing is waiting while `Apply band`
      sits above it. `Close`'s tooltip corrected on the same rule.
- [x] 10.7 The sweep (golden rule 9), `git grep -n -i --untracked`: `APPLY SERVERS`,
      `Open Station setup at Live sources`, `Saved as you go`, `Remove…`, the five card
      titles. Fixed in live code, tests and e2e; the mockup and historical records left as
      records. It found `server-settings.spec.ts` matching a card title's SHOUTED form, which
      the shared `text-transform` had made unmatchable.
- [x] 10.8 Linux `gate:e2e` for `STATION-CHROME-02` — **DISCHARGED** on `6fad13d6`, the head
      carrying this work: <https://github.com/yasermostafaee/cg/actions/runs/34101121005> —
      `E2E (Playwright)` **RAN** (not skipped) and passed, 08:32:37 → 08:43:04 (**627 s**),
      run `conclusion: success`, with `Lint • Typecheck • Test • Build` green beside it
      (200 s). The local `pnpm gate` was `0 cached, 93 total`, exit 0, 257 s.

## 11. `SOURCE-DELETE-GATE-03` — one destroys without asking, one refuses without saying

- [x] 11.1 🔴 `B-237` — the live-source bin and Edit now ASK. The fallout is computed IN
      ADVANCE with the bridge's own `pruneAssignmentsForCatalog`, on the bridge's own published
      assignments, so the question names every template and plate — and HOW MANY BOXES a
      multi-box template binds. ⚠ NO bridge refusal was added: §1's on-air-refuse row was
      WITHDRAWN by the owner against `sources.ts`'s written decision (an installation must be
      able to retire a live), and the cascade takes nothing off air — level 2 is frozen at
      take. Red-first proved by reverting the guard: **4 failed / 3 passed**.
- [x] 11.2 🔴 `B-238` — the Layers remove. TWO defects: it CONFIRMED where `R-017` refuses
      (`Remove and clear (ON AIR)`), and the refusal that came back rendered NOTHING because
      `stack.remove` RESOLVES `{ accepted: false, errorCode: 'on-air' }` and the result was
      discarded, with `reportCommandError` only in a `catch` the refusal never enters.
      Measured on the running app before the fix: item stays on air, `msg: null`, no toast.
      Fixed by consuming `removeIsRefused` (the published answer) and `errorCodeMessage`
      (which has mapped the code to `REMOVE_ON_AIR_REASON` all along).
- [x] 11.3 🔴 `B-239` — **and my first fix for it was wrong.** The reported diagnosis was that
      a standing sentence OCCUPIED the message region; measurement showed the region is
      conditional and ABSENT at rest on four of five tabs, with `footerRest` a separate node
      one row below. The silence was that nothing was ever reported (11.2). The sentence stays
      — it is the commit contract, pinned while the legend that duplicates it scrolls away —
      and now wears the app's LABEL treatment so it cannot be read as an event. The first
      red-first spec asserted the deletion and was rewritten before being made green.
- [x] 11.4 🔴 `B-240` — the footer's three answers for one job. `Close` removed from every
      section footer (dismissal is the ✕ / Escape / backdrop); `Cancel` → `Revert`, section
      scoped, shown only when dirty from the SAME read the rail's dot makes; read-only and
      as-you-go tabs carry no buttons. And the thing it hid: dismissing with unapplied edits
      now asks, naming the sections.
- [x] 11.5 `B-241` FILED, and **SWEPT — the sweep found a worse, live instance than the one
      that was filed.** The class: `bridge.ts:890` puts `route.channel.response.safeParse(result).data`
      on the wire, so a handler returning a field its schema does not declare has it deleted
      with no error anywhere. Nothing type-checks the two against each other — `Route.handle`
      is `(req: unknown) => unknown` (`bridge.ts:440`), so a hand-written TS annotation is the
      only thing that can disagree with the Zod schema, and a conditional spread defeats even
      that. Boundary: all 80 `defineChannel`s, 62 routed; 12 are arrays/unions and structurally
      immune at the top level; the other 50 strip. **8 hits:** - 🔴 **`stack.out` loses `errorCode` — LIVE, UNMITIGATED, and its own bug.** The schema
      declares `{ accepted }` ALONE (`stack.ts:149`) while the handler returns
      `{ accepted, errorCode? }` (`caspar-runtime.ts:3839`). `B-141` widened the
      IMPLEMENTATION to add that code and never widened the channel — so **B-141's fix has
      been reverted on the wire for its entire life.** `LayerRow`'s CLEAR feeds
      `asyncResultMessage`, whose both branches then die, and the operator is told
      `"Not accepted."` on the console's ESCAPE HATCH — the verb `caspar-runtime.ts:3894`
      itself calls _"the verb where it matters MOST"_. Filed as `B-244`. - 🔴 `stack.remove` loses `message` — the original instance, confirmed. Degraded rather
      than blank (the code maps to the canonical sentence), but the LAYER NUMBER the bridge
      computed is lost, which matters at the two call sites with no row context. - DEAD WEIGHT ×6: `command` on `out`/`take`/`update`/`stop`/`next` (it feeds the audit
      entry, which the renderer reads from `audit.recent`, not from the verb), and `sent` on
      `set-plate-volume` (consumed inside the bridge only).
      ⚠ The REQUEST direction strips identically (`bridge.ts:844`) and is sharper: for the five
      whole-object config channels the stripped copy is what gets PERSISTED
      (`bridge.ts:1118/1164/1260/1266/1274`), so a newer browser's field is dropped AND the
      drop written to the station's config file.
      Neither is fixed here: §7 forbids a schema change unless required, and B-238 does not
      require one.
- [x] 11.6 `B5` — `useTemplatePicker`'s stale comment (`there is no code to quote`) corrected;
      it now quotes the code, which `R-017` added.
- [ ] 11.7 `B-242` FILED, not taken — a removed delimiter's attached field falls back to
      showing its raw characters (`\n (in use)`) instead of the name it had. Behaviour is
      unchanged and correct (the VALUE is stored, not the id, so nothing re-splits); only the
      human label is lost.
      ⭐ **`B-242` IS THIS DEFECT AND ONLY THIS ONE.** The number was briefly double-booked: the
      `RUNTIME-REDESIGN-01` programme also used it for golden rule 12c's jsdom-has-no-layout
      hazard. `DOCS-TRUTH-01` settled it on 2026-09-09 from git history — this filing landed in
      `95181658` (2026-09-07), the hazard's first citation in `9fa0393a` (2026-09-08), so
      first-filed keeps the number and **the jsdom hazard is now `B-245`**.
- [ ] 11.8 `B-243` FILED, not taken — a MOCK/BRIDGE PARITY gap found by verifying 11.2 on the
      running app. `item-blocked-restore` is `on-air` AND publishes `removeExempt: true`, so
      `removeIsRefused` correctly leaves its control LIVE (the real bridge's `#removeRefusal`
      consults `#removeExempt` and would accept). But `MockRuntime.remove()` refuses on bare
      `isOnAirStatus`, ignoring the exemption it itself published — measured:
      `{ accepted: false, errorCode: 'on-air' }`. The mock's own note explains why the OTHER
      exemption (`B-212`, an item on no declared row) is unreachable there, and is silent about
      this one. One line to fix (`&& !item.removeExempt`), but it changes mock behaviour that
      other specs may lean on, so it is filed rather than taken here. ⭐ It is also the reason
      11.2's second half is not hypothetical: this is a live case where the control is
      correctly enabled and the answer comes back a refusal.
- [x] 11.9 Linux `gate:e2e` for `SOURCE-DELETE-GATE-03` — **DISCHARGED** on `b9325b25`, the
      head carrying this work: <https://github.com/yasermostafaee/cg/actions/runs/34108923579>
      — `E2E (Playwright)` **RAN** (not skipped) and passed, 09:58:21 → 10:08:13 (**592 s**),
      run `conclusion: success`, with `Lint • Typecheck • Test • Build` green beside it
      (183 s). Local `pnpm gate`: `0 cached, 93 total`, 1225 tests.
      🔴 **The FIRST run of this work was RED and is recorded rather than hidden.**
      `95181658` → <https://github.com/yasermostafaee/cg/actions/runs/34106268123>, `e2e`
      **failure**, 3 specs of 116. All three were consequences of `B-240` and all three live
      in the suite `pnpm gate` does not run (`P-028`), so a green local gate said nothing
      about any of them:
      · `station-setup-frame.spec.ts` — **the real one, and §2's own assertion caught it.**
      Removing the per-section `Close` left three tabs with NO footer buttons, so their
      footer collapsed 59px → 41px and its TOP EDGE moved 18px along the rail. The outer box
      stayed identical (`220,110,1000,680`) the whole time, which is exactly why that spec
      measures two edges. Fixed with `--r-modal-foot-h`, a FLOOR — the same argument
      `--r-panel-bar-h` makes: a height that belongs to BEING a footer is not a function of
      what a section puts in it. Measured after: `footTop 730`, `footH 59`, all five.
      · `live-source-sources.spec.ts` — now answers the delete CONFIRMATION before asserting
      the cascade notice. It asserts strictly more than before: the template and plate are
      named while the operator can still decline.
      · `modal-message-in-viewport.spec.ts` — asserts the FOOTER ROW stays in view rather than
      a `Close` button in it. The claim was never about a particular word.
      ⚠ **The process lesson:** the frame was measured after `STATION-CHROME-02` and NOT
      re-measured after `B-240` changed the footer's contents, because `pnpm gate` was green.
      A green gate is not evidence about anything that renders. The local runtime e2e is now
      run before pushing render work — it caught all three (116 passed after the fix), and one
      further local red (`assignment-freeze`) proved to be a `page.goto` load flake that
      passes in isolation and never touches these gates.

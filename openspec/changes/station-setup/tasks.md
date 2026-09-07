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
- [ ] 10.8 Linux `gate:e2e` for `STATION-CHROME-02` — OWED. This change is entirely about what
      renders.

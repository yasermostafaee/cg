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
- [x] 2.5 Reserved / live layers → `StationLayersSection`, read-only.
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
- [ ] 9.2 Linux `gate:e2e` — OWED. Discharged only by a COMPLETED, GREEN `e2e` job on a
      `dev` head containing this work, cited by run URL, duration, and that it RAN.

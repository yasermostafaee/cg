# Tasks — R-055, three chrome corrections

## 1. The purple hover

- [x] 1.1 Name the violet weights that were literals: `--r-rehearsing-mid` (`#8B5CF6`) and
      `--r-rehearsing-deep` (`#6D28D9`), in `theme.ts` `cssVars` and mirrored in `controls.css`.
      Naming them is what makes it visible that the hover's border `#A78BFA` IS `--r-rehearsing`.
- [x] 1.2 Add `--r-accent-lift` (`#7DD3FC`) — the sky's HOVER weight. It did not exist, and its
      absence is the mechanical reason the sky toggle had nowhere to lift to and inherited the
      violet.
- [x] 1.3 A scoped `.cg-panel-actions .cg-btn.is-on:hover / :active`, at higher specificity than the
      unscoped `.is-on` rules, lifting to `--r-accent-lift` and pressing to `--r-accent-strong`.
- [x] 1.4 Token parity green (`tests/tokenParity.test.ts`, `tests/theme.test.ts`).
- [x] 1.5 **Other borrowers, swept.** SEARCH: the unscoped `.is-on` hover/active rules also cover
      `.cg-btn--verb` and `.cg-btn--neutral`. `[data-verb-tone='play'].is-on` is the only other
      control that could reach them and is **unreachable** — the rules carry `:not(:disabled)` and
      PLAY is disabled whenever it is active. **Deliberately left**: the verb and neutral toggles
      whose base fill IS `--r-rehearsing-strong`, because for them the violet is correct.

## 2. The failover button

- [x] 2.1 `variant="caution"` removed from the status bar's `⇄ FAILOVER`; it now takes the default
      variant its SERVERS / SOURCES / LOG neighbours wear. Disabled state and `title` unchanged.

## 3. The rename

- [x] 3.1 The tab label `'PLAYOUT'` → `'STATION LAYERS'`, and its renderer-local tab id
      `'playout'` → `'station-layers'`.
- [x] 3.2 Renderer-local identifiers renamed: `PlayoutPanel` → `StationLayersPanel` (file too),
      `playoutOccupancy.ts` → `stationLayerOccupancy.ts`, `hasPlayoutOccupant` →
      `hasStationLayerOccupant`, `clearablePlayoutLayers` → `clearableStationLayers`,
      `PlayoutOccupancyView` → `StationLayerOccupancyView`, `usePlayoutLayers` → `useStationLayers`
      (file too), and the test file with them.
- [x] 3.3 **LEFT UNCHANGED, and named here so the boundary is legible** — every wire name:
      the channel strings `playoutLayers.state`, `playoutLayers.state-changed`,
      `playoutLayers.clear`; the channel constants `PlayoutLayers*Channel`; the shared contract type
      `PlayoutLayerState`; the refusal union `PlayoutLayersClearReason`; and the bridge surface
      `window.cg.playoutLayers`. Renaming these churns the protocol for no user-visible gain.
- [x] 3.4 The E2E selector `getByRole('tab', { name: /PLAYOUT/ })` →
      `/STATION LAYERS/` in `tests/e2e/fixtures/runtime.ts` — the one fixture every position spec
      goes through.
- [x] 3.5 The two prose comments describing the strip as `"Channel 1 | Channel 2 | Playout"`.
- [x] 3.6 SEARCH after the rename: no `'PLAYOUT'`, `/PLAYOUT/` or `'playout'` literal remains in
      `apps/runtime/src` or `apps/runtime/tests`, and no renderer-local identifier spelling survives.

## 4. Gate

- [x] 4.1 `pnpm openspec validate cg-control-chrome-corrections --strict`.
- [x] 4.2 `@cg/runtime` typecheck clean; 758 tests pass across 87 files after the rename.
- [ ] 4.3 Full green gate — run once at the end of the session.
- [x] 4.4 PRD item `[~]` with this change dir.
- [ ] 4.5 **Linux `e2e` still owed — no run URL.** This changes what renders (a hover colour, a
      button variant, a tab label the E2E fixture selects on). A ticked box with no URL is a claim,
      not a discharge.

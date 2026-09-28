# Tasks — channel-sources (`CHANNEL-SOURCES-01` v1, `R-072`)

Lane: FULL (the path to air reads the defaults; a persisted key changes shape).

## §0 Establish

- [x] 0.1 Where the band is stored, who writes it, why `--fake` has none; the installer declares none
      (`design.md` §0.1).
- [x] 0.2 Every reader of the band (§0.2).
- [x] 0.3 Where the banner came from, and why (§0.3).
- [x] 0.4 Where Source defaults were stored and keyed; every reader (§0.4).
- [x] 0.5 What "a channel added later" means today, and where the copy is taken from (§0.5).

## §1 Build

- [ ] 1.1 Decision 1 — the effective band (declared, else 60–79) and Station setup showing it: **STOPPED** at the
      prompt's hard stop. The design record says the band is DECLARED, never defaulted, with a reason
      (`packages/shared-ipc/src/channels/sources.ts:426`; `live-source-multibox/tasks.md:935` note 4). The
      owner decides.
- [x] 1.2 Decision 2 — `TemplateSourceAssignmentSchema.channel`; `assignmentsOnChannel` as the one reader;
      every reader by the row's channel (bridge, mock, console, PVW).
- [x] 1.3 Decision 2 — the one-time copy on the first load of the station's file, written back
      (`migrateAssignmentsToChannels`, `bridge.ts`).
- [x] 1.4 Decision 2 — a joining channel starts from a copy (`copyAssignmentsToChannel`; the runtime's
      `#applyBanks`, persisted after `set-banks` / `set-config`; the mock's `setFixedLayerBanks`).
- [x] 1.5 Decision 2 — the dialog edits its row's channel (`withChannelDefaults`) and is titled
      `Source defaults · CH n`; the picker's `Needs a source` and the swap dialog read the row's channel.
- [x] 1.6 Decision 3 — the no-band refusal recorded on the row, `refusalOnRow`; `takeRefusalLine`'s clause
      (commit `007ea1ce`).

## §2 Tests — each with its control

- [ ] 2.1 A fresh `--fake` station seats a two-plate take in 60–79 with no band declared: **not written** —
      decision 1 stopped.
- [x] 2.2 A change on CH 2 leaves CH 1's defaults and its take unchanged; control: CH 2 uses it —
      `tools/caspar-bridge/tests/channel-source-defaults.integration.test.ts` (the wire's routes and each row's
      frozen assignment; red under a channel-blind accessor and under a channel-blind shared reader).
- [x] 2.3 The migration: station-wide defaults on every declared channel, the file rewritten, a take unchanged;
      a second load copies nothing (bytes identical) — same file.
- [x] 2.4 A channel added later (over the socket, `fixedLayers.set-banks`) gets a persisted copy; a move carries
      the defaults — same file.
- [x] 2.5 The shared functions — `packages/shared-ipc/tests/channel-defaults.test.ts` (10), and the channel
      argument through `plate-source-resolution.test.ts` / `sources.test.ts`.
- [x] 2.6 The console (jsdom): the dialog on a CH 2 row shows CH 2's defaults and writes CH 2's entry with CH 1's
      byte-identical (`livePlates.dom.test.ts`); the swap dialog's `assigned:` is the row's channel's
      (`liveSourceSwap.dom.test.ts`); the picker's `Needs a source` reads the destination's channel
      (`templatePicker.select.dom.test.ts`) — each red under a channel-blind plant of its surface.
- [x] 2.7 E2E — `apps/runtime/tests/e2e/source-defaults.spec.ts`: a default set on CH 2 stays on CH 2 (red under
      a channel-blind reader); a channel declared later starts from a copy (red with the copy removed).
- [x] 2.8 The refusal line — `live-seating.integration.test.ts` (the row's record, `refusalOnRow`, nothing
      sent), `takeRefusalLine.test.ts`, e2e `take-refusal-line.spec.ts` (row and Inspector, no banner, not on CH
      2; control: a landed take clears it).

## Gate and discharge

- [ ] Z.1 `pnpm gate` green; `pnpm openspec validate --all --strict`.
- [ ] Z.2 CI run URL, jobs confirmed RAN (PR workflow's `ci` and `e2e`; the installer workflow).
- [ ] Z.3 `pnpm dev:station --fake` with `Bed 59`: **not run** — its ports are held by the owner's own stack on
      this host (5250, 5174, 5280, UDP 6250); left to the owner.

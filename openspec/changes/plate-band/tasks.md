# Tasks — plate-band (`PLATE-BAND-01` v1, `R-073`)

Lane: FULL for all three items. One commit per item, each with its own pre-push gate.

## §0 Establish

- [x] 0.1 Where "declared, never filled in" lived (code and design record), and what "reserved layers" means
      (`design.md` §0.1).
- [x] 0.2 How the bridge knows a station is linked to the Playout (§0.2).
- [x] 0.3 Where the Source defaults change is authorised, and where the channel fence is (§0.3).
- [x] 0.4 The race in `media-plates.integration.test.ts:563` — confirmed by a planted pause (§0.4).

## §1 Build

- [x] 1.1 The effective band — `plateBandInForce` (`@cg/shared-ipc`): declared; else 60–79 on a Playout-linked
      station whose own config claims no layer there; else none. `playoutLinked` from the auth config; the
      seating plan, the binding-change check and the own-layer test read it; a bank change that moves it
      publishes the catalogue again; the boot line names it.
- [x] 1.2 Station setup → Live sources shows the band in force (`ConsoleSourceCatalogSchema.plateBand`,
      `publishedPlateBand`), `default` when computed; the offline console answers as an unlinked station.
- [x] 1.3 The Source defaults change passes through the channel grant — `channelsForRequest` resolves a
      `sources.set-assignments` to the channels whose defaults it changes (`assignmentChangeFootprint`, over
      `@cg/shared-ipc`'s `channelsWhoseDefaultsDiffer`), and the permission gate refuses any not granted with
      `authzChannelRefusal`. The lock reads the same footprint (`design.md` choice 10).
- [x] 1.4 The race — `media-plates.integration.test.ts:563` waits for the re-send's own commit (`1ce93cb1`),
      and its sibling `route-plates.integration.test.ts:617`, which the pre-push gate met (`9d732331`).

## §2 Tests — each with its control

- [x] 2.1 `tools/caspar-bridge/tests/plate-band.integration.test.ts` — a linked station with no band seats a
      two-plate take in 60–79 at the wire; controls: a declared 70–79 is used as declared; a station
      reserving 65 gets no default (the row line, nothing sent); an unlinked station keeps today's rule.
      Planted: the seating plan reading the declared band → the headline red; the link not passed → the
      headline and the published band red.
- [x] 2.2 Boot — a config reserving 60–79 boots with its files unchanged; control: the same reservation beside
      a DECLARED 60–79 is refused at boot (same file).
- [x] 2.3 The console is told the band in force; a declared band replaces it; withdrawn, the default is back and
      the file holds no band (same file). Planted: the read carrying no band → red.
- [x] 2.4 A bank change: rows in 60–79 turn the default off and publish; control: a standard bank publishes
      nothing (same file). Planted: no re-publish → red.
- [x] 2.5 The owner's `Bed 59` on the fake station — `fake-station.integration.test.ts`: signed in, the fake
      Playout's own inputs, no band anywhere → both plates in 60–79 on channel 1. Planted: the link not passed
      → red.
- [x] 2.6 `packages/shared-ipc/tests/plate-band.test.ts` — the three rules, each "none" beside its control;
      the file schema drops a band in force. Planted: the link ignored → red; every claim ignored → 4 red.
- [x] 2.7 `apps/runtime/tests/plateBandSummary.dom.test.ts` — `Currently 60–79 · default · 20 layers.`;
      declared; none; an older bridge; the fields and Apply declaring it. Planted: the pane reading the
      declared band → red.
- [x] 2.8 E2E `apps/runtime/tests/e2e/plate-band.spec.ts` — a real linked bridge (the CLI) and a real browser:
      `60–79 · default` and the boot line; controls: reserved 65 (the old line), declared 70–79. Local,
      Windows (non-authoritative): 3 passed; planted pane → red.
- [x] 2.9 `tools/caspar-bridge/tests/source-defaults-grant.integration.test.ts`, over a real socket with real
      tokens — a station-admin holding CH 2 only is refused on CH 1 with the channel sentence and nothing
      changes; control: the same principal changes CH 2 and CH 1 stays; a `"*"` station-admin changes both;
      an operator-role principal is refused by role; auth off refuses nothing; under a lock covering CH 1 a
      CH 2 save passes and a CH 1 save is refused. Planted: the footprint empty (the code before) → the
      refusal and the lock case red; the footprint as every NAMED channel → the CH 2 control red.
      `channel-defaults.test.ts` (5 new): what a save changes, whole-set, order, removal, fit mode,
      station-wide, an undeclared channel. `livePlates.dom.test.ts`: the dialog shows the gate's sentence,
      keeps the edit, adopts nothing (planted: the sentence swallowed → red).
- [x] 2.10 The race — reproduced red under a 300 ms pause, green with the new wait, red under a planted
      `OPACITY 1` re-send; both files 47/47 (`P-057`).

## Gate and discharge

- [x] Z.0 Item 3 — pre-push gate at `9d732331`: 96/96, 0 cached (`gate-20260928T142540Z-12316.log`).
- [ ] Z.1 `pnpm gate` green on the change; `pnpm openspec validate --all --strict`.
- [ ] Z.2 CI — the `e2e` and installer runs COMPLETED and GREEN with the jobs confirmed RAN; URLs here.
- [ ] Z.3 `pnpm dev:station --fake`, `Bed 59` with no band declared — if its ports are free.

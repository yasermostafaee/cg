# plate-band — a Playout-linked station gets the plate band 60–79 with no hand step; Source defaults obey the channel grant (`R-073`)

Prompt: `PLATE-BAND-01` (v1), 2026-09-28. Order: after `CHANNEL-SOURCES-01` (`a802a7c0`, docs `9e6b1606`).

## Why

`CHANNEL-SOURCES-01` stopped its decision 1 at the prompt's hard stop: the design record said the plate band
is declared by hand and never filled in, for two recorded reasons — (1) a default would be this project
choosing layer numbers for a plant it cannot see, and (2) a station whose reserved layers sit inside the band
would fail to boot after the upgrade (`packages/shared-ipc/src/channels/sources.ts`, the band's doc;
`openspec/changes/live-source-multibox/tasks.md` note 4). So on `pnpm dev:station --fake` a take of `Bed 59`
with two plates was still refused until someone pressed Apply in Station setup → Live sources.

The owner's decision (2026-09-28) answers both reasons:

1. **Reason 1 no longer holds for a Playout-linked station.** The contract fixes the layers: the Playout owns
   1–49; CG Control owns 50–99 — beds 50–59, plates 60–79, template rows 80–99
   (`docs/integration/playout/PLAYOUT-INTEGRATION-CONTRACT-v1.md` §7; C5 as the Playout answered it,
   `PLAYOUT-CG-RESPONSE-V13-STATE-v1.md` §3.5). The plant's layer numbers are known.
2. **Reason 2 becomes the condition.** A station linked to the Playout with no declared band uses 60–79,
   unless its own config reserves any layer in 60–79 — then it gets no default and today's one-line row
   refusal stays. A declared band is used exactly as declared. A station not linked to the Playout keeps
   today's rule.

And: **Source defaults obey the channel grant.** An operator whose grant (`cg_channels`) does not include a
channel is refused when changing that channel's Source defaults, with the existing channel refusal; `"*"`
holds every channel. (`CHANNEL-SOURCES-01` filed this for the owner — its `design.md` choice 10.)

## What changes

- **The plate band in force** — one reader, `plateBandInForce` (`@cg/shared-ipc`): the declared band; else,
  on a Playout-linked station, 60–79 unless the station's own config claims a layer there (a reserved layer,
  a bank row, or a dynamic policy range); else none. The bridge's seating plan, its binding-change check and
  its own-layer test read it; the bridge publishes it beside the catalogue (`sources.config`, a console-only
  schema with `plateBand`), and its boot line names it and why. It is COMPUTED and never written into the
  station's config — the file's schema has no field for it.
- **Station setup → Live sources** shows the band in force and says `default` when it is the computed one:
  `Currently 60–79 · default · 20 layers.` The station-admin's fields show it; only a press of Apply band
  declares it.
- **Source defaults through the channel grant** — the permission gate judges a `sources.set-assignments` by
  the channels whose defaults it changes, as it judges `fixedLayers.set-banks` by the banks it changes.
- **Two reconnect tests made deterministic** (`P-057`, test only) — `media-plates.integration.test.ts:563`
  and its sibling `route-plates.integration.test.ts:617` wait for the re-send's own commit, not the first
  plate's last line.

## What does NOT change

- A take's wire, the take order, `LOOK-SWITCH-01`'s pre-seat and `FIELD-FIXES-01-A`.
- A DECLARED band is validated at boot and at every change exactly as before; a declared band that overlaps
  a reservation still refuses to boot. The default never reaches that validator as a declaration.
- A station not linked to the Playout (auth off, the offline console) keeps today's rule: declared, or none.
- The refusal a take meets when no band is in force: one line on its row (`CHANNEL-SOURCES-01` decision 3).

## Impact

- `@cg/shared-ipc` `channels/sources.ts` — `plateBandInForce`, `PlateBandInForceSchema`,
  `ConsoleSourceCatalogSchema` (the `sources.config` reply and `sources.config-changed` payload),
  `publishedPlateBand`; `playout-sources.ts` — `consoleSourceCatalog`. No persisted key changes.
- `tools/caspar-bridge` — `caspar-runtime.ts` (`playoutLinked`, the three band readers, a re-publish when a
  bank change moves the band), `bridge.ts` (the link, the published band, the grant footprint of
  `sources.set-assignments`), `bin/caspar-bridge.mjs` (the boot line).
- `apps/runtime` — Station setup → Live sources, the source store, the offline mock and its bridge (parity:
  unlinked).

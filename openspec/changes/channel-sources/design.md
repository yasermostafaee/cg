# Design — channel-sources (`CHANNEL-SOURCES-01` v1)

Lane: FULL (the path to air reads the defaults; a persisted key changes shape; an IPC reply gains a field's use).
Line anchors are at the commit that carries this change.

## §0 — Established

### 0.1 Where the band is stored, who writes it, and why `dev:station --fake` has none

- **Stored** as `layerRange` on the source catalogue (`SourceCatalogSchema`, `packages/shared-ipc/src/channels/sources.ts:468`),
  persisted in `~/.cg-runtime/bridge-source-catalog.json` (`tools/caspar-bridge/bin/caspar-bridge.mjs:182`,
  `tools/caspar-bridge/src/source-catalog-store.ts`). Absent ⇒ no band.
- **Written** only by `sources.set-config` (`SourcesSetConfigChannel`, `sources.ts:1160`; body `SourceBandConfigSchema`,
  `sources.ts:488`), from Station setup → Live sources → the band editor, which OFFERS
  `SUGGESTED_LIVE_SOURCE_LAYER_RANGE` (= `LAYER_BANDS.plate`, 60–79, `sources.ts:453`) and applies it only when a
  station-admin presses Apply. The bridge persists it (`bridge.ts:3539–3542`, `persistBand`).
- **Why `--fake` has none:** nothing on the way to a running station writes one. `dev:station` (with or without
  `--fake`) names the catalogue file under its own state directory (`tools/dev-station/src/station-plan.mjs:114`,
  passed as `--source-catalog-path` at `:176`) and writes nothing into it, so the bridge starts with an empty
  catalogue; first-run then writes the connection and the fixed-layer banks
  (`apps/runtime/src/renderer/features/firstRun/firstRunStation.ts`), never a band. **The installer declares none
  either:** the CG Control sidecar (`apps/runtime/src-tauri/src/sidecar.rs`) carries no band and no catalogue, and
  its first run is the same first-run screen.
- **Why none is defaulted — a recorded reason, not an accident** (the prompt's hard stop):
  `sources.ts:426` _"DECLARED, never defaulted … applying it automatically would be this project choosing layer
  numbers for a plant it cannot see, and a station whose reservation already sits inside the band would then fail
  to boot on upgrade"_; `openspec/changes/live-source-multibox/tasks.md:935` (note 4, the same decision and the
  same reason); `design.md:237` of that change (`layerRange?: … // DECLARED, never defaulted (§4)`); and the
  2026-09-14 re-band kept it (`sources.ts:446`, _"offered in the editor and never applied on its own"_).
  **Decision 1 is therefore STOPPED** and reported to the owner with this reason.

### 0.2 Every place that reads the band

- `tools/caspar-bridge/src/caspar-runtime.ts:6244` — the seating plan (`#planLiveSeating`): no band ⇒
  `LIVE_PLATE_NO_RANGE` (`live-plate-seating.ts:24`), with the sentence at `caspar-runtime.ts:6251`.
- `caspar-runtime.ts:6475` — a binding change that needs a new seat (`#refuseBindingChange`).
- `caspar-runtime.ts:13358` — `#isOwnConfiguredLayer` (whether a layer is ours, for the send-seam and clears).
- `tools/caspar-bridge/src/bridge.ts:1643` — the boot catalogue in force, handed to the Playout provider
  (`playout-sources.ts:305`, published with the catalogue at `:628`).
- `tools/caspar-bridge/bin/caspar-bridge.mjs:839` — the CLI's boot description line.
- `packages/shared-ipc/src/channels/sources.ts:800` — `validateSourceCatalog` (disjointness against banks and
  reservations).
- The console: `apps/runtime/src/renderer/features/sources/SourcesSection.tsx:80` (Station setup → Live sources)
  and `sourceStore.ts:160–167`; the offline mock, `apps/runtime/src/platform/MockRuntime.ts:2248–2288`.

### 0.3 Where the banner came from, and why it was a banner

The take's `refusePlan` in `caspar-runtime.ts` recorded a row refusal (`takeRefusal`, `refusalOnRow: true`) only
when a PLATE was refused (`refused.refused`). The no-band refusal has no plate — the band is the station's — so it
fell through to a bare `{ accepted: false, errorCode, message }`. The console reads a take reply without
`refusalOnRow` through `asyncResultMessage` (`apps/runtime/src/renderer/ui/asyncButtonController.ts:83`) into the
console-wide `RefusalBanner` (`features/status/RefusalBanner.tsx:67`). Fixed in the take (`#takeImpl`,
`caspar-runtime.ts:4274`) — decision 3.

### 0.4 Where Source defaults were stored and keyed, and every reader

- **Stored** in `~/.cg-runtime/bridge-source-assignments.json` (`caspar-bridge.mjs:186`,
  `source-assignments-store.ts`), shape `SourceAssignments` = `{ assignments: TemplateSourceAssignment[] }`,
  **keyed (template, plate)** — `validateSourceAssignments` refused a duplicate of that pair. No channel anywhere,
  which is the owner's report 2 exactly.
- **Readers (all now by channel):** the seating plan every seating path goes through — take, look switch, swap,
  restore — `#planLiveSeating` (`caspar-runtime.ts:5863`; `#assignmentMapFor` for what a take freezes and
  `#assignmentsFor` for the plan, `:5944–6018`); `#refuseBindingChange` (`:6426`, its read at `:6446`);
  `resolveLookBindings` (`live-look-bindings.ts`); the console's
  `appliedPlateSources` (`features/inspector/livePlates.ts`) behind the Inspector's LIVE PLATES, Look inputs'
  `Default (…)` and the Source defaults dialog; PVW (`features/monitors/livePlateGeometry.ts`); the Layers table's
  row names; the swap dialog's `assigned:` line; the template picker's `Needs a source`; `applyDraft`'s inert
  `sendPlateAssignments`; the mock (`MockRuntime.#assignmentMapFor`).

### 0.5 What "a channel added later" means today

A channel joins the declared set through `fixedLayers.set-banks` (or `set-config`): first-run's channel step, or
Station setup → Change channel… (`features/stationSetup/ChannelScopeCards.tsx:34`), which reuses first-run's
channel step. A move (one bank for one) is the same call. The runtime applies it in `#applyBanks`, which now calls
`#copyDefaultsToJoiningChannels` (`caspar-runtime.ts:5329`, `:5346`); the bridge persists the result after the
reply is ok (`bridge.ts:3325`, `:3347`, `persistDefaultsIfCopied`).

## §1 — What was built

### Decision 2 — per-channel defaults

- `TemplateSourceAssignmentSchema.channel` — a positive integer, OPTIONAL. An entry without it is station-wide:
  it answers on a channel only where that channel has no entry of its own for the plate. After the first load no
  station-wide entry is left on a station with a declared channel, so the fallback is only the reading of a file
  written before this change, or of a station with no channel yet.
- ONE reader: `assignmentsOnChannel(value, channel)` (`sources.ts:1022`). Every reader above goes through it, so no
  two of them can disagree about which default a plate uses (golden rule 6).
- The first load: `migrateAssignmentsToChannels` (`sources.ts:1041`), run by `bridge.ts:1665` over the declared
  banks' channels when the value came from the file; the result is written back at once. Idempotent — a set with no
  station-wide entry comes back as it was — which is "a second load copies nothing".
- A channel joining: `copyAssignmentsToChannel` (`sources.ts:1066`) — for each template, the LOWEST prior channel
  that holds defaults of its own for it is copied whole, and a plate the new channel already holds is kept.
- The dialog's write: `withChannelDefaults` (`sources.ts:1096`) — only this channel's entries for this template;
  the entry already there is spread so `fitMode` survives.
- The console reads the row's channel through `itemChannelOf` (`features/channels/itemChannel.ts`): the item's
  `slot`, else the bank row it is bound to (the offline mock writes no `slot`), else the channel on show. It is
  passed down as a prop — the Inspector sections, the swap dialog, the picker's request — never subscribed in a
  leaf (`B-156`; the picker is mounted by every `LayerRow`).

### Decision 3 — the no-band refusal on the row

`caspar-runtime.ts:4274` (`#takeImpl`): a take refused `LIVE_PLATE_NO_RANGE` records `takeRefusal { code }` on its row and
answers `refusalOnRow: true`; nothing was sent. The console's `takeRefusalLine` gains the clause
`no live source layer band is declared — nothing was sent.` (`features/layers/takeRefusalLine.tsx`,
`NO_BAND_CODE`). A take that lands withdraws it, as for every take refusal.

## Choices made (the smaller and safer option each time)

1. `channel` is optional rather than required, so a file written before this change still parses and reads the
   same until its one-time copy.
2. The first-load copy runs only on a value read from the station's FILE — not on an in-process value (the
   integration rigs) and not in the offline mock, whose reads fall back to station-wide entries and so answer
   identically.
3. A joining channel copies from the lowest donor channel holding the template, whole — never a plate-by-plate
   mixture of channels.
4. The dialog title is `Source defaults · CH n`, the console's own `· CH n` spelling.
5. The picker's `Needs a source` reads the destination row's channel, carried in the pick request; a pick with no
   destination (only tests open one) claims none.
6. `applyDraft`'s inert `sendPlateAssignments` writes per channel when the item has a `slot`, else as before.
7. The template-delete confirmation still counts bindings station-wide: it removes them from every channel.
8. The refusal line is the take's only; a look switch keeps its own surface (`look-switch-all-or-nothing`).
9. Decision 1 stopped at the recorded reason; nothing of it was built, including Station setup showing an
   "effective" band.
10. `sources.set-assignments` keeps the station-level gate it had (`bridge.ts:3547`, `operator` / lock
    `station-admin`) and is not fenced per channel. Its channels are INSIDE the list — data about which channel
    a default belongs to, not a door onto that channel — which is how the fence's census now classifies it
    (`station-channel-fence.integration.test.ts`, beside `fixedLayers.set-banks` and `stack.restore`). This is
    no wider than before: when defaults were station-wide, any operator allowed to write them changed every
    channel's. Whether a channel-scoped operator's write should be judged per channel is **filed for the
    owner** — it would be a new refusal condition.

# Design — plate-band (`PLATE-BAND-01` v1, `R-073`)

Lane: FULL for all three items (the band decides what reaches air; the grant is a refusal condition; the race
is a test on the take path). Anchors marked `@9e6b1606` are at the commit this prompt started from; the rest
are at the commit that carries this change.

## §0 — Established

### 0.1 Where "declared, never filled in" lived, and what "reserved layers" means

- **In code** it was a documented rule with no default anywhere: `packages/shared-ipc/src/channels/sources.ts`
  — the band's own doc (`LiveSourceLayerRangeSchema`, `:426@9e6b1606`, _"DECLARED, never defaulted …"_) and
  `SUGGESTED_LIVE_SOURCE_LAYER_RANGE` (`:446@9e6b1606`, _"offered in the editor and never applied on its
  own"_). The seating plan refused a take when the catalogue carried no `layerRange`
  (`#planLiveSeating`, `tools/caspar-bridge/src/caspar-runtime.ts:6244@9e6b1606`, `LIVE_PLATE_NO_RANGE`).
- **In the design record**: `openspec/changes/live-source-multibox/tasks.md:935` (note 4) and that change's
  `design.md:237` (`layerRange?: … // DECLARED, never defaulted (§4)`); restated by `channel-sources`
  (`design.md` §0.1, `proposal.md`) and `docs/prd/runtime.md` `R-072`.
- **"Reserved layers"** are `ReservedLayersSchema` (`packages/shared-ipc/src/channels/fixedLayers.ts:510`):
  `R-028` / `C-015`'s layers the Playout owns, declared as inclusive ranges in install config
  (`bridge-reserved-layers.json`, `--reserved-layers-path` or `--reserved-layers`), expanded by
  `reservedLayerNumbers` (`:524`), resolved once in `createBridge` (`tools/caspar-bridge/src/bridge.ts:1611`)
  and handed to the boot validator, every change and the allocation fence. A band meets them in
  `validateSourceCatalog` (`overlaps-reserved`, `sources.ts:838@9e6b1606`).
- **The station's config claims layers in two more ways**, each of which a plate must never share: its banks
  (operator rows and beds — the same validator refuses a band over them, `overlaps-fixed-bank` /
  `low-bank-not-below-band`), and a deployment's dynamic policy (`BridgeOptions.layerPolicy`; the shipped
  `DEFAULT_LAYER_POLICY` is empty, but the suite's `TEST_LAYER_POLICY` gives `custom` 60–69, and that
  validator does not read the policy).

### 0.2 How the bridge knows a station is linked to the Playout

- `resolvePlayoutSettings` (`tools/caspar-bridge/src/playout-config.ts:228`), precedence flags >
  `bridge-playout.json` > off: `mode: 'playout'` with a `PlayoutAuthConfig` (an address, or an issuer and its
  JWKS) is the link; anything else is `AUTH_OFF`. It is resolved first in `createBridge`
  (`bridge.ts:1545`), before anything binds.
- `pnpm dev:station` — with or without `--fake` — runs the bridge's `--set-playout-address` one-shot first
  (it writes `{ auth: 'playout', playout: { address } }`) and starts the bridge with `--playout-address`
  (`tools/dev-station/src/station-plan.mjs`, `setAddressArgs` and `bridgeArgs`). The installed CG Control's
  first run writes the address the same way (ADR 0011). Both are linked.
- Not a link: auth off (the offline console, `MockRuntime`), and a test's local provider
  (`BridgeOptions.playoutSources` with auth off) — nothing about the plant is known from either.

### 0.3 Where the Source defaults change is authorised, and where the channel fence is

- `sources.set-assignments` — `route(SourcesSetAssignmentsChannel, 'operator', 'station-admin', …)`
  (`bridge.ts:3547@9e6b1606`). `route()` is `(channel, lock, perm, handle)` (`bridge.ts:2954@9e6b1606`), so the
  write takes the `station-admin` PERMISSION class (one of the ten, pinned in
  `authz-classes.integration.test.ts`) and is refused while the console is locked. An operator-role principal
  is refused by role first, whatever it is granted (`AUTHZ_ROLE_REFUSAL`).
- The request gate has two channel fences:
  - **the permission gate**, `authzRefusal` (`bridge.ts:1355@9e6b1606`): the role, then every channel that
    `channelsForRequest` (`bridge.ts:1183@9e6b1606`, "the ONE resolver") resolves must be granted —
    `grantsChannel` (`packages/shared-ipc/src/channels/auth.ts:388`, `'*'` grants every channel) — or the
    request is refused with `authzChannelRefusal(n)` (`auth.ts:443`: _"This sign-in does not cover channel n,
    so that command was refused — nothing was sent to CasparCG. …"_). Auth off answers first and refuses
    nothing.
  - **the station fence**, `stationRefusal` (`bridge.ts:1321@9e6b1606`): a top-level `channel` this station
    does not declare → `channelNotDeclaredRefusal`.
- `channelsForRequest` answered `[]` for `sources.set-assignments` (no top-level `channel`, no `itemId`) —
  "nothing to authorise" — so the grant never judged a Source default. `CHANNEL-SOURCES-01` classified its
  nested `req.assignments[].channel` beside `fixedLayers.set-banks` in the station fence's census and filed
  the question (its `design.md` choice 10). The lock reads the same resolver (`lockRefuses`,
  `bridge.ts:809@9e6b1606`).
- **Built:** the "existing channel-fence refusal" the owner names is therefore the permission gate's
  `authzChannelRefusal` — the grant is the principal's, and the station fence is about the station.

### 0.4 The race in `media-plates.integration.test.ts:563` — confirmed

After the reconnect the test waited for the SHOWN plate's `MIXER 2-60 OPACITY 1 DEFER` and then asserted the
held clip's lines. `#resendLiveMixerState` (`caspar-runtime.ts:8048@9e6b1606`) sends one record's lines at a
time, each awaited, and the row's one `MIXER <ch> COMMIT` last — so the shown plate's line is the FIRST
record's last line, and the clip's follow it. A 300 ms pause planted between the two records turned the test
red with CI's own message (`expected [ 'VERSION', 'INFO', …(4) ] to include 'MIXER 2-61 OPACITY 0 DEFER'`).
The pre-push gate at `1ce93cb1` then met the same wait in `route-plates.integration.test.ts:617`
(`gate-20260928T141642Z-25016.log`).

## Choices made (the smaller and safer option each time)

1. **"Its own config claims a layer in 60–79"** is read as everything that config can put there: a reserved
   layer (the owner's words), a bank row or bed, and a dynamic policy range. The first two are exactly "the
   default would not pass the validator a declared band must pass" (`checkSourceCatalogAgainstBanks`), so the
   default can never be the thing that fails a boot; the third is added because a plate must never share the
   dynamic allocator's layers and that validator does not read the policy.
2. **Linked is the auth config naming a Playout** (`auth.mode === 'playout'`), resolved once and fixed for the
   process — a new address restarts the bridge.
3. **Computed, published, never stored.** The band in force goes to a console beside the catalogue through a
   console-only schema (`ConsoleSourceCatalogSchema.plateBand`); `SourceCatalogSchema`, the file's shape, has
   no field for it, so no writer can put the default in the file, and a hand-written file that tried is
   stripped of it on load.
4. **A bank change that moves the band publishes the catalogue again** (`#applyBanks`), so a console never
   keeps showing a band the next take will not seat in. Nothing is sent to CasparCG.
5. **Station setup's fields show the band in force**, the default included, and say `default` in the summary.
   Applying them untouched declares the band — by a station-admin's press, never on its own.
6. **The boot line names the band in force and why** (ASCII by the CLI's rule). For the default it reads
   `plate band 60-79 by default: linked to the Playout, none declared`; for a linked station with none in
   force it says that the station's config claims a layer in the plate band.
7. **The offline console is not linked** (auth off, §0.2), so its band is the declared one or none — parity
   through the same `plateBandInForce`.
8. **The race fix waits for the re-send's own end** (the row's one commit), as
   `look-switch-all-or-nothing`'s reconnect test already did — same margin, no retry. Both spellings of the
   wait were fixed (two sweeps: the drop, and the wait loop on a plate's line; no third test waits that way).
9. **Source defaults are judged on the channels a save CHANGES, not the channels it names** — the
   `set-banks` precedent (`bankChangeFootprint`). The console sends the whole set on every save, so judging
   every named channel would refuse a channel-2 admin's own channel-2 save for carrying channel 1's entries
   unchanged. "Changes" is read through `assignmentsOnChannel`, the one reader: an entry added, removed,
   repointed or given another fit mode, and a station-wide entry on every channel it answers on. The refusal
   is the permission gate's existing sentence; the station fence is unchanged (a Source default is data
   about a channel, not a door onto it).
10. **The lock reads the same footprint** — a consequence, flagged rather than chosen. `channelsForRequest` is
    the one resolver for both gates, as for `set-banks`. Before this, a defaults save resolved to no channel,
    which a channel-scoped lock reads as touching every channel the principal holds; now a principal holding
    channels 1 and 2 may save channel 2's defaults under a lock covering channel 1 — as every other channel-2
    verb under that lock already could (`lock-scope`'s `MULTI-CHANNEL-01` case) — and is still refused
    channel 1's. An every-channel lock (auth off, or an engager holding `"*"`) refuses every save, as before.
11. **Found, not changed: a whole-set rewrite by a channel-limited admin.** "Delete from station"
    (`forgetTemplateAssignments`) and a re-import's reconcile (`reconcileAssignmentsForImport`) rewrite a
    template's defaults on EVERY channel. A station-admin who does not hold one of those channels is now
    refused that rewrite with the channel sentence, which the console shows; the template's bindings on
    that channel then stay until someone who holds it removes them. That is the owner's rule applied as
    written, and it is reported rather than worked around.

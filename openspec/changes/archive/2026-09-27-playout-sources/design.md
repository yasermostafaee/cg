# Design — playout-sources (`PLAYOUT-SOURCES-01` v5)

Prompt `PLAYOUT-SOURCES-01` (v5), run inside `DAY-RUN-01` (v2) on 2026-09-27. The run file listed v4; the v4
file on disk is retired by the owner's own note ("a run file that lists … v4 … runs v5 in its place, under the
same conditions"), so v5 is what ran. Read at `dev` `67909f96`. Nothing here connected to `192.168.21.111` or
`.114`: everything is built and tested against the fake Playout and the AMCP mock.

The contract is the eight letters in `docs/integration/playout/` (seven adopted by this change; V13-STATE was
already there). Where their answer differs from our request, their answer wins; the deviations table is in that
folder's README.

## §0 — Established first (fixed nothing)

### §0.1 Where a catalogue id travels — 7 places and one log

The id rule is `SourceDefinitionIdSchema` (`packages/shared-ipc/src/channels/sources.ts:275-279`:
`min(1).max(64)`, `^[A-Za-z0-9][A-Za-z0-9_-]*$`), used by exactly two fields: `SourceDefinition.id` (:284) and
`TemplateSourceAssignment.sourceId` (:387).

1. **The catalogue.** `bridge-source-catalog.json`; IPC `sources.config` / `set-config` / `config-changed`
   (sources.ts:890, 903, 933); the mock's localStorage `cg-runtime:source-catalog` (`MockRuntime.ts:82`).
2. **Template assignments.** `bridge-source-assignments.json`; IPC `sources.assignments` / `set-assignments` /
   `assignments-changed`, and `droppedAssignments` in the set-config answer.
3. **The `R-048` patch.** `#sourceOverrides` (`caspar-runtime.ts:1203`) → `StackItemState.sourceOverride`
   (`item-state.ts:125`). Schema `LiveSourceOverrideSchema` (`live-source.ts:160`: `max(64)`, no alphabet). Write
   door `stack.swap-live-source`, `sourceId: z.string().min(1)` (`stack.ts:243`, no max). The bridge checks
   membership (`caspar-runtime.ts:8796-8806`); the mock does not.
4. **Per-look bindings.** `#lookSourceBindings` (:1213) → `lookSourceOverride` (`item-state.ts:136`); written by
   `stack.update.lookBindings` (`stack.ts:106`) with no catalogue check (:6172-6174).
5. **The maps a take freezes.** `#frozenAssignments` (:1242), set from `plan.resolvedFrom` (:3981, :5535) →
   `frozenAssignment` (`item-state.ts:151`).
6. **A take refusal.** `#takeRefusals` (:1355) stores `sourceId` (:4173, :6996); `TakeRefusalSchema.sourceId`
   (`item-state.ts:95`). Published, deliberately not retained.
7. **The browser's retention.** OPFS `stack/retained.json` (`StackRetentionStore.ts:5`) holds places 3–5 and gives
   them back through `stack.restore` (`stack.ts:827-829`), re-applied with no catalogue check (:2925-2949).

Plus **`bridge.log`**: the boot prune prints `templateId/plateId -> sourceId` (`bin/caspar-bridge.mjs:869`).

**Named but NOT places.** The **live-layer ledger**'s `sourceId` is the PLATE id (`caspar-runtime.ts:7989`,
`live-layers.ts:58-59`); the catalogue entry appears there only as the resolved `producer` string. The **audit**
has no source field (`packages/shared-schema/src/runtime/audit.ts`; the mapper, `caspar-runtime.ts:11664-11693`).
Seven places, inside the 6–10 predicted; places 6 and 7 are the easy ones to miss (6 is published-only and loosely
typed; 7 is persisted by the BROWSER, not the bridge).

**Confirmed:** `in-li-1a2b3c4d` (14) and `md-m-26840fa3fd1c409f99f6b53e80a7ca0f` (37) pass
`SourceDefinitionIdSchema` and every other rule on these paths (`max(64)` or `min(1)`). No prefix rule exists; the
only `src-` literal is the generator (sources.ts:469). A Playout id is 1–48 of `[A-Za-z0-9_-]`, so `in-` / `md-` +
48 is at most 51, and the prefix makes the first character alphanumeric whatever the Playout's is.

### §0.2 Readers of `SourceCatalog.sources`

- **Renderer, 19 sites in 7 files:** `LivePlatesSection.tsx:270, 277`; `LooksBindingsSection.tsx:264, 576`;
  `TemplateDefaultsDialog.tsx:221, 254`; `LayersPanel.tsx:975`; `LiveSourceSwapDialog.tsx:87, 139`;
  `PreviewPanel.tsx:272`; `SourcesSection.tsx:215, 340, 359, 373, 393, 561, 569, 582, 583` (the editor).
- **Bridge, 4:** `caspar-runtime.ts:8799` (swap membership); `live-look-bindings.ts:149` (`byCatalogId`, the seat
  plan); `live-plate-assignment.ts:103` (the take refusal); `bin/caspar-bridge.mjs:830, 841, 843` (the boot line).
- **Shared, 3:** `sources.ts:621, 775, 854`. The **mock** reaches `.sources` only through those three.
- **Tests, 4** (+1 schema census): `sourceDeleteGate.dom.test.ts:156`, `assignment-freeze.integration.test.ts:448`,
  `live-look-bindings.test.ts:303`, `source-catalog-boot.integration.test.ts:246`.

### §0.3 Every path that prunes a binding because its catalogue entry is gone

1. **Boot:** `bridge.ts:1614-1618` prunes then validates — in memory only (stderr names the drops,
   `bin:868-870`; the file is not rewritten).
2. **`sources.set-config`:** `caspar-runtime.ts:11896-11900` cascades, publishes and returns `droppedAssignments`;
   `bridge.ts:3336-3338` persists the file when something dropped.
3. **The mock on every read:** `MockRuntime.ts:1893-1898` (it feeds the take freeze, :1160-1165).
4. **The mock's set-config:** `MockRuntime.ts:1924-1932`.
5. **The renderer mirror:** `sourceStore.ts:163-173` drops the acknowledged `droppedAssignments`.
6. **The renderer's delete preview** (deletes nothing): `SourcesSection.tsx:212-218`.

The patch, the per-look bindings and the frozen maps are **never** pruned; a dead id there resolves to
`unresolved` (`live-look-bindings.ts:185-189`) and the take refuses `live-source-unassigned`
(`live-plate-assignment.ts:131-135`). The ledger keeps a seat whose entry vanished (`caspar-runtime.ts:8579-8582`).
**Decision (§1.C):** under this change the catalogue is rebuilt from Playout reads, so paths 1–5 are removed from
those rebuilds entirely (§1.C below); nothing a read does can delete a binding.

### §0.4 What the offline pieces use for sources today

- **`pnpm dev`** (auth off) starts no bridge (`package.json:23`); the console dials a bridge at `:5280` and uses the
  mock only in test mode (`createRuntimeBridge.ts:51`). A hand-started bridge reads `~/.cg-runtime`'s catalogue.
- **The mock** keeps the catalogue in localStorage and never seeds one (`MockRuntime.ts:82, 94-109`).
- **The e2e fixtures:** `app` arms `CG_E2E` + `CG_E2E_FIXED_BANK` (`fixtures/runtime.ts:1043-1066`), catalogue
  empty; the only helper drives the Add dialog (`addLiveSource`, `runtime.ts:242-257`).
- **`dev:station --fake`:** a fake Playout (D1–D4, D8, D9), `@cg/amcp-mock` on 5250, the bridge on 5280, Vite on
  5174 — all on `127.0.0.1`, state wiped each run, catalogue EMPTY (`station-plan.mjs:114`), `~/.cg-runtime` never
  read (`tools/dev-station/tests/isolation.test.ts:77`).
- **Specs that WRITE a catalogue: 19 files** — e2e by `setConfig` (5): `assignment-freeze`, `look-set-and-switch`,
  `pvw-look-source-name`, `source-defaults-link`, `source-defaults`; e2e through the UI (6): `add-dialog`,
  `live-source-sources`, `modal-message-containment`, `modal-message-in-viewport`, `pvw-live-plate-placeholder`,
  `settings-polish`; jsdom (4): `sourceStore`, `sourceDeleteGate`, `sourcesSection`, `decklinkKeyDeviceHonesty`;
  bridge (4): `assignment-freeze`, `live-look-reconcile`, `source-catalog-boot`, `source-catalog-store`. Plus
  `tools/skew-harness/src/run.ts:704, 728`. (20 more bridge files SEED an in-process catalogue; not writes.)

### §0.5 The D4 and D9 readers

- **D4 (`PlayoutCatalogue`, `playout-catalogue.ts:131`)**: bearer `usableBearer`, checked at use
  (`bridge.ts:1555`; `playout-auth.ts:411-416`); a 1 s tick with a 5 s floor (:40, :52), an immediate read on each
  sign-in (`bridge.ts:2002-2010`), on demand via `channels.catalogue`; `If-None-Match` while rows are held, `304`
  keeps; before the first sign-in ABSENT with no request (:199-206); any failure → ABSENT (:233-237); in memory only.
- **D9 (`PlayoutAuth` revocation poll, `playout-auth.ts:149`)**: 60 s; keeps its last list on failure; in memory.
- **The census** `tools/caspar-bridge/tests/persisted-files-census.test.ts:50-71` lists 9 `bridge-*` files.
- **The new readers copy D4** — `usableBearer` at use, the tick/floor shape, a read at sign-in, never in a verb's
  path — **except "absent on failure"**: their last good list is persisted and stays in force (ADR 0010 rule 14).

### §0.6 UI primitives

No anchored panel or popover in `apps/runtime/src/renderer/ui/` (`ContextMenu` opens at a point; `Tooltip` is
`title`-driven; `Modal` clips its overflow, `Modal.tsx:138-143`, so a popover inside a dialog must portal). No
virtualised list anywhere, and no windowing dependency. There IS a shared `Tabs` (`TabStrip`, `Tabs.tsx:173`),
`Tag`, `Icon` (lucide), `TextInput`. So **one `Popover` and one `VirtualList` are added to `renderer/ui/`**. The
runtime has no `Select` primitive: today's field look is `select.cg-field` (`controls.css:1498-1512`).

### §0.7 Media plates today

- **`PLAY` with no `LOOP`:** `playSource` (`command-builder.ts:396-398`), media arm `quote(producer.file)`
  (:629-630); one caller, `#startSeatProducer` (`caspar-runtime.ts:7714-7722`). No `LOOP` anywhere.
- **`canHoldLivePlate` answers `false` for media** (`live-plate-release.ts:155-165`), so a media plate a look does
  not show is torn down rather than held (:222-231), and re-`PLAY`ed when shown again.
- **An absolute `media.file` is accepted:** the arm is `file: z.string().min(1)` (sources.ts:240) and
  `validateSourceCatalog` checks no file rule.
- **`quote()` is byte-exact for those paths** (drive letter, colon, spaces, Persian): `escape.ts:56-81` changes
  only `\`, `"`, LF and CR. ⚠ Recorded, not filed: a path with a BACKSLASH is not byte-exact — `\` is doubled for
  the template-data path's double un-escape, and a `PLAY` argument is un-escaped once. D11's `clip` always uses
  `/` (their answer §2.1), so no D11 item reaches it.

### §0.8 The backup server — a defect, FILED as `B-286`

One line is built and `#send` hands it to `RedundancyAdapter.send` (`caspar-runtime.ts:12785`), which mirrors the
SAME string to B (`redundancy-adapter.ts:250-253`, `mirror-sync`, the default) or replays the journaled string at
failover (:195-199, :492-503). There is one catalogue per bridge (`caspar-runtime.ts:1793`) and per-server config
holds only host and ports (`connections.ts:306-311`). **So B is sent A's media path, byte for byte** — and a backup
Playout is a separate install whose paths can differ (their answer, S1). Filed as `B-286`
(`docs/prd/bugs-runtime.md`); not fixed here.

### §0.9 A loopback `casparHost` → the Playout's host

`isLoopbackCasparHost` (`playout-catalogue.ts:110-116`: `localhost`, `::1`, `[::1]`, `127/8`) and
`resolveCatalogueHost(row, playoutHost)` (:118-129, typed to D4's row) inside the D4 reader (:232), with
`playoutHost` from `playoutHostOf` (`bridge.ts:1386-1392`). The JOIN is inline: `hosts.includes(row.casparHost)`
over `configuredCasparHosts` plus the declared-channel test (`bridge.ts:1094`). **What was needed:** the host
rewrite generalised to any `{ casparHost }` and the join extracted into ONE predicate, so D10 rows and v1.3's
`compatibleChannels` join by exactly D4's rule (§1.H).

### §0.10 OSC paths

The mapper parses `foreground/file/path` into `{ path }` on every channel and layer (`event-mapper.ts:38-42`), but
it is kept only in the change tracker's memory, for an interest layer (`change-tracker.ts:12-20`); plate layers
are never interest layers (`interest.ts:54-60`), and nothing logs, publishes or persists it. The OSC `producer`
string (measured values are kind names: `html`, `ffmpeg`, `empty`) is logged once to stderr
(`caspar-runtime.ts:12657-12662`), published in orphans, owned-occupancy, fixed rows, station layers and
`setup.channel-occupancy`, and shown by those surfaces. **Decision:** the mapper drops the path, keeping only that
a file event occurred; the producer string is published as the kind it is, and any value that carries `://` or a
path separator is reduced to its first token (so "a producer is there" still reaches every place). The real stream
credential leaks were on the AMCP side, not OSC: the ledger's `producer` (persisted, published, shown "sent as"),
`amcp.log`, the audit `command`, one stderr line, and the 404 sentence — all handled by §1.E.

## Decisions (what was built)

### D1 — Contract shapes live in `@cg/shared-ipc`, once

D10 (`PlayoutInputsBodySchema`, v1.2 + v1.3, `epoch` optional), D11 (`PlayoutMediaPageSchema`, item), the per-input
leniency (an input that fails is listed `unusable` with its reason, never voids the list) — one module the bridge,
the fake Playout and the mock all import.

### D2 — One builder turns the two lists into the catalogue in force

`buildPlayoutSourceCatalog` (`@cg/shared-ipc`) takes the persisted inputs, the bound media and the station's
channel join, and returns the `SourceCatalog` everything already consumes. Ids `in-<id>` / `md-<id>`. Each entry
may now carry `origin` (`input` / `media`), `status` (`unusable` / `unavailable`), a `reason`, `channels` (the
compatible channels of THIS station, from `compatibleChannels`) and `media` facts. The bridge and the mock both
call it — the one resolution path.

### D3 — Readers and stores (bridge)

`PlayoutSources` (`tools/caspar-bridge/src/playout-sources.ts`): D10 at sign-in, every 30 s with `If-None-Match`,
and on demand when a picker opens and the last read is older than 5 s; the bound media re-read by `ids=` (≤100 per
call) every 30 s, at sign-in and when a picker opens; a media search route. Bearer: `usableBearer` at use. Two new
store files — `bridge-playout-inputs.json` and `bridge-bound-media.json` — beside the station state and in the
census. **A failed read or a `304` changes nothing; the last good list stays in force across an outage and a
restart.** (ADR 0010 rule 14.)

### D4 — Unavailable, never pruned

An input a SUCCESSFUL read no longer lists, or a bound media id a successful `ids=` read leaves out, becomes
`unavailable` and stays in the catalogue with its last-known name; bindings to it are kept and shown tagged. A take
or look switch that would seat it is refused before any AMCP with `source-unavailable`, recorded on the row. A
later read that lists it again clears the tag. `pruneAssignmentsForCatalog` never runs on these rebuilds: the
boot prune and the set-config cascade are gone (§1.F), and the mock's read-time prune with them.

### D5 — The one retry

A media `PLAY` answered `404` inside a take or a look switch triggers ONE `ids=` read bounded at 1.5 s; if the
`clip` changed, that `PLAY` is retried ONCE with the fresh path; otherwise it fails exactly as `FIELD-FIXES-01-A`
decided. It is the only Playout read inside a verb, and only on its failure path.

### D6 — The wire: one sanctioned change

`producerArgument`'s `ndi` arm sends `[NDI] "<source>"` (their answer, `newtek_ndi_producer.cpp:289-292`); every
other arm, the fit chain, seating, release, the freeze and the fences are unchanged and pinned byte for byte.

### D7 — Credentials

One `redactUrlCredentials` (`@cg/shared-ipc`) writes `scheme://user:pass@` as `scheme://***@` in the AMCP log, the
audit `command`, the bridge's stderr lines, a take refusal's `command`, the published ledger `producer` and the
published catalogue. The console never shows a stream URL at all (the A sentence says "the stream" instead).

### D8 — v1.3 shapes, parsed and shown; `route` gated

`epoch` optional and stored; a `route` input parses with `layer` (required), `videoMode`, `compatibleChannels`,
`available`/`reason`. **`routeInputGate()`** (answering `ROUTE_NOT_SUPPORTED_YET`, `@cg/shared-ipc`) is the ONE
gate: every `route` input is `unusable`, "Not supported yet.", and no `PLAY … route://` from D10 is ever sent.
`ROUTE-PLATES-01` lifts it by making that one function answer `null`. D4's `videoMode` (nullable) and
`pendingRestart` are parsed leniently and published; a `null` never voids a row.

### D9 — Audio for D10 plates (v1.3 rule 2; C1)

A plate whose source is a D10 input (`origin: 'input'`) is seated muted on EVERY seating: its `VOLUME 0` is in the
hide step, committed before its `PLAY` — and on an in-place replace, where the picture is deliberately not hidden
(`LOOK-SWITCH-01` choice 3), the `VOLUME 0` alone still goes first. Nothing automatic raises it: the take's
`VOLUME 1` is the template layer's only (pinned), the connect sweep never covers the plate band (pinned). Every
raise of a D10 plate — the reveal to its declared volume, a return from HELD, an operator raise — ramps:
`MIXER <ch>-<L> VOLUME <v> 25`. Silences (OFF, PANIC) stay immediate. The declared volume is the existing
per-plate setting, default 0. Non-D10 plates, the page layer and beds are unchanged.

### D10 — Every binding door asks the one rule

A NEW binding must be bindable wherever it is made — the template defaults (`sources.set-assignments`), a row's
look bindings (`stack.update`) and the swap (`stack.swap-live-source`) — and all three ask `unbindableChange`
(`@cg/shared-ipc`), the swap with nothing held to compare against. One rule, one set of sentences, no id in them. A
binding already held passes whatever became of its entry. Each door binds a media id from the bridge's own reads
first, and a refusal refuses the whole request.

### D11 — The offline console is the bridge's twin, not a lookalike

The mock's catalogue is `buildPlayoutSourceCatalog` over a seeded Playout (`window.CG_E2E_PLAYOUT_SOURCES`, which an
e2e arms and nothing ships); its three binding doors bind media from its own library and ask the same rule; its
media search normalises, pages and refuses a stale cursor as the Playout does; and it hands the console the
catalogue REDACTED (`redactCatalogForConsole`), as the bridge's route does, so the console never even holds a
password. What it does not model: a take refused because a plate's entry is unavailable is the bridge's refusal
(integration-tested); the mock's takes always land.

### D12 — Station setup's Live sources tab says what is true of it now

The tab's contract was `immediate` ("Auto-save"), and its legend and footer said the catalogue saves as you go.
Nothing on the tab saves as you go any more: the list is the Playout's and the band is applied by its own button.
So it takes the Channel pane's station-admin shape — `separate` ("Apply separately"), _"Listed by the Playout.
Apply band sets the layer band."_, _"Nothing to apply here — Apply band applies on its own."_ A non-admin's
read-only contract is unchanged.

### D13 — The picker's panel owns the keyboard and the pointer while it is open

It is portalled to `body` and arms a layer on the trap stack: Tab stays inside it, Escape closes IT and never the
dialog under it, and focus returns to its field. Because a React portal bubbles synthetic events through the React
tree, the panel's backdrop stops the click, the key and the right-press, so nothing done in the panel is also done
to the surface beneath (a layer row opens its menu on Shift+F10). A right-press inside the panel neither closes it
nor opens a menu.

## Choices made (the smaller and safer option each time)

1. **Ran v5, not the retired v4** — the owner's note in the v4 file names this run.
2. **§1.F: `sources.set-config` KEEPS its name and carries only the band** (`{ layerRange }`); an older console's
   `sources` is ignored. Smaller than a new route: the console's one call site changes its payload only.
3. **The hand-made catalogue file is ignored, not deleted.** Its `sources` are neither loaded nor rewritten; the
   band still lives there. A plate bound to a hand-made `src-*` id reads as unassigned (P-031, no shim).
4. **§1.G: the auth-off provider is a TEST provider** (`tools/caspar-bridge/tests/support/local-playout-sources.ts`)
   injected in-process through `createBridge({ playoutSources })`; it is never under `src/`, so it can never reach
   the sidecar bundle — and a bundle test pins that. A hand-started auth-off bridge has no lists;
   `dev:station --fake` is the dev path with lists, through the REAL reader against the fake Playout. The mock is
   fed the same shapes by a test flag and holds no built-in list. One resolution path: D2's builder.
5. **Duplicate names:** both listed, both usable, each with a `reason` naming the clash (shown in `title`), never
   merged. Our name key is case- and space-insensitive while the Playout's uniqueness is exact, so making both
   unusable would hide two real inputs over a letter case.
6. **The bound media set only grows** (`lastBoundAt` refreshed on each bind). Collecting it would need every
   binding store, and the browser's retained rows arrive after boot — collecting early would strand them.
7. **The plate in a sentence is named by its id** (`guest-1`), the author's name for the hole; the row by
   `operatorRowName`.
8. **`sources.refresh`** (read class) is the "picker opened" signal; it never waits on the Playout.
9. **OSC:** the path is dropped at the mapper rather than redacted, because nothing reads it.
10. **The mock keeps its bound media under `cg-runtime:bound-media`** — the one new persisted key, test mode only,
    mirroring `bridge-bound-media.json` (census updated).
11. **An in-place replace of a D10 input is muted first** (the hide step's `VOLUME 0` alone), and its volume is put
    back if the replace is refused, so a refused replace never leaves a plate silenced that was audible.
12. **A stream URL is shown as the word `stream`** in the audit line and in the live-sources readout; a `404` on a
    stream reads "the server could not open the stream." rather than naming a file.
13. **The picker's field carries `data-picker-value`** (the bound id) for finders; it is never shown.
14. **e2e seeding is opt-in** (`test.use({ playoutSources: E2E_PLAYOUT })`); the default is no Playout, the real
    state of a station whose Playout has shared nothing, so specs that never touch sources are unchanged.
15. **§5 of `add-dialog` and of `settings-polish` are retired with the dialog they measured** (the kind fields and
    the kind options); the claims that never depended on WHICH sub-dialog (the keyboard trap, the sub-family frame,
    its footer gap, its scrim, its destructive outline) are carried by the delimiter Add and Remove.
16. **`sourceDeleteGate.dom.test.ts` is deleted**: it tested only the removed editor's delete gate (`B-237`).
17. **The pending `live-source-multibox` and `station-setup` deltas are amended in place**, each change dated, rather
    than superseded by a MODIFIED delta here — a MODIFIED header over an unarchived ADDED one would collide at
    archive.
18. **The bridge's swap asks `unbindableChange`** instead of its own copy of the same two checks (identical words);
    one rule, one spelling (D10).
19. **The operator guide is unchanged**: it has no live-sources section (every heading checked).

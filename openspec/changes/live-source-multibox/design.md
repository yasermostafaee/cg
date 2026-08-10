# Design — Live Source multi-box

Evidence gathered 2026-08-03 against `dev` @ `a65383c`. Every `file:line` is as the file reads on
that commit; line numbers quoted inside PRD items and inside `DEBT.md` were re-located by symbol and
are **not** trusted.

**A convention used throughout.** Wherever this document asserts that something **does not exist**,
the assertion is followed by a `SEARCH:` line giving the exact command, the scope and the result.
An unevidenced absence gets re-derived by the next session; this repo has paid for that twice
(`DEBT.md:1301-1303`, `docs/prd/runtime.md:1302`).

---

## 0. Already settled — do not relitigate

D-137 (`docs/prd/designer.md:3557-3605`) and C-015 (`docs/prd/caspar.md:365-425`) fix the following,
and this design takes them as given: the user-facing name **Live Source**; the schema type stays
`video-placeholder`; the element carries a source id, an optional key source id, an
`expectedAspect` and an optional poster; the id is bindable through the existing fields/bindings
model; the authoring surfaces show **procedural SMPTE bars** plus the id label; both exports render
a **fully transparent hole**; **axis-aligned only in v1**, because `MIXER FILL` is axis-aligned.

## 0b. Measured on hardware, 2026-08-03 — the two facts the design rests on

Against CasparCG `2.5.0 69e8ad5`, `1080i5000` channel, two `route://1-1` producers read off the
screen consumer. **Both facts were subsequently re-confirmed QUALITATIVELY on the target build,
2.3.2 — see §3's cross-build check.** The pixel-accurate placement below is a 2.5.0 measurement and
was deliberately not repeated; what the design needs from 2.3.2 is the semantics, and it has them.

1. **`MIXER FILL x y x-scale y-scale` normalizes PER AXIS against the channel raster** — `x` and
   `x-scale` against width, `y` and `y-scale` against height. `FILL 0.1 0.2 0.3 0.4` on 1920×1080
   produced a box at ≈(192, 216) sized ≈576×432. The competing hypothesis (both axes against width)
   predicts 576×768 and was falsified.
   **Re-measured independently and to the pixel from a second screenshot:**
   `FILL 0.5 0.5 0.5 0.5` placed the box at exactly **(960, 540)** sized **960×540** on a 1920×1080
   channel. Two measurements, different argument values, same conclusion — this is the one term the
   whole geometry chain rests on, so it is recorded twice deliberately.
2. 🔴 **`MIXER FILL` STRETCHES.** It does not letterbox, pillarbox or crop. A 4:3 rect and a 16:9
   rect fed from the same route showed identical framing edge to edge — nothing was cropped, so the
   image was scaled non-uniformly to fill the rect.

Also confirmed on the wire: the producer form is `PLAY <ch>-<layer> "route://CHANNEL-LAYER"`;
**there is no `ROUTE` verb**; and `MIXER … CLEAR` is required to reset mixer state, because mixer
state survives `CLEAR` (the doctrine is already written down for `VOLUME` at
`tools/caspar-bridge/src/command-builder.ts:128-130`).

**Fact 2 is a design input, not a footnote.** It is why §3 and §6 below exist.

---

## 1. The carrier — how a declaration reaches the bridge

### The constraint, established before choosing

Three facts close off most of the option space:

- **No `.vcg` ever reaches the bridge.** The only production `unpack()` is in the browser
  (`apps/runtime/src/renderer/features/library/templateDelivery.ts:154`); what crosses the wire is
  `{ template: TemplateInfo, html }` (`:238`), stored opaquely
  (`tools/caspar-bridge/src/template-registry.ts:112-116`).
- **The bridge parses no HTML.**
  `SEARCH:` `git --no-pager grep -rn -e "JSDOM" -e "parse5" -e "cheerio" -e "DOMParser" -e "matchAll" -e "<script" -- tools/caspar-bridge/src` over all 12 bridge source files → the only regex-ish hits are a URL route (`template-http-server.ts:155`) and a layer-range parser (`reserved-layers-store.ts:76`). No parser, and no parser dependency in `tools/caspar-bridge/package.json`.
- **The scene is discarded after import.** `LibraryEntry` is `{ template, html }` and nothing else
  (`apps/runtime/src/platform/library/LibraryStore.ts:10-13`).

So anything the runtime will ever need must be **captured at the one import moment** or re-derived
from the retained HTML.

### DECISION — a `liveSources` declaration block on `TemplateInfo`, derived once at import

A new optional array on `TemplateInfoSchema` (`packages/shared-ipc/src/channels/templates.ts:14-70`),
populated in `produceTemplateDelivery` (`templateDelivery.ts:177-189`) beside the existing derived
facts, carried by `TemplatesImportChannel`, persisted by the bridge registry
(`template-registry.ts:168-193`) and by the browser's OPFS copy.

**The precedent is exact and shipped: `hasNext`** (`packages/shared-ipc/src/channels/templates.ts:53-69`),
derived once at import by a canonical predicate (`templateDelivery.ts:188`). Its docstring already
argues this case in full — a bit kept per browser "would light NEXT for the operator who imported
and hide it for everyone else, and would be lost on a bridge restart."

**Templates imported before this change** carry no `liveSources` block. Absent ⇒ **the template
declares no Live Sources** ⇒ the take behaves exactly as it does today: the template plays, and
nothing is composited. This is the same safe direction `hasNext` chose ("absent means NO",
`templates.ts:66-68`). It is not silent: a template whose scene contains a `video-placeholder` but
whose declaration block is absent is **re-import-required**, and the Runtime says so on the row.

### Rejected

| Option                                                                | Why not                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — a `.vcg` manifest section**                                     | The manifest never reaches the bridge, so a second carrier hop would still be needed. Also `ManifestSchema` is a plain `z.object` with no `.passthrough()` (`packages/shared-schema/src/manifest.ts:53-76`), so a new section is **silently stripped** at unpack — an added key would look like it worked. |
| **C — a browser-local side store** (the `defaultPositionStore` shape) | The bridge is a **separate process** and cannot read a browser store. It is the party that must place the layers (`docs/prd/caspar.md:382-386`).                                                                                                                                                           |
| **D — a `<script type="application/json">` block parsed bridge-side** | The bridge would have to start parsing HTML, which it does none of, and it would put a parse on the serve path that `template-http-server.ts:153-170` keeps free of work. Kept as a **fallback if §12.2 forces a separate render path**, since the block would then already exist.                         |
| **E — the served-URL query**                                          | It works (`caspar-runtime.ts:3678-3692` appends `cw`/`ch`) but it is **bridge → page**. This is page → bridge.                                                                                                                                                                                             |
| **F — a scene collector**                                             | Not an alternative — it is the _producer_ of the data. It combines with the chosen option: a `collectLiveSources(scene)` mirroring `collectVideoElements` feeds the derivation at import.                                                                                                                  |

---

## 1a. ⭐ AMENDED 2026-08-10 — a template declares ONE id; fill+key is a property of the MAPPING

**DECIDED 2026-08-10 (owner). This supersedes the optional KEY SOURCE ID on the element**, which §0
lists among the things D-137 and C-015 had settled. It is not a new principle; it is this design's
own principle applied one step further.

**The decision.** A template declares **ONE symbolic source id**. Whether that id resolves to a
single device or to a fill/key **DEVICE PAIR** is a property of the **MAPPING** in CG Control, never
of the scene.

**The reasoning, which is §12.1's and §3's, re-run.** §12.1 already settled that the Designer never
names a concrete device. Fill+key is exactly that kind of fact: it is how a source ARRIVES at a
particular plant, and the author cannot know it — the same argument §3 makes for `expectedAspect`
being an assertion rather than the fit input. An author asked "is guest 2 fill+key here?" is being
asked an installation question, and a wrong answer is a wrong take on air. The previous automation
had this right: ONE preset carrying MASTER and SLAVE (`ciab-client-tools.json`, `ChannelInput` —
`MasterNumber` and `SlaveNumber` on one entry).

It is also strictly less to carry: **one fewer field for the author, one fewer concept for the
operator, one fewer arm in the schema.**

**Consequences — all DOCS-ONLY in this change; nothing here is implemented yet.**

- The element declares one id. §1's carrier and §3's rules follow.
- ⚠ **`keySourceId` is NOT removed from the schema.** It shipped in phase 1 and it is OPTIONAL, so
  deleting it is a MIGRATION, not a tidy-up. It is marked **DEPRECATED — never written by new
  documents**, and stays parseable so every stored scene keeps loading. Removing it is a later,
  separate decision with its own migration.
- The Inspector's **`key id` control and its hint (D-147 task 3, `tasks.md` 1.12) are REMOVED** when
  this amendment is implemented. That is filed as an explicit UN-DO task (`tasks.md` 4.8) under the
  phase that owns the Inspector, not left as a silent deletion — a control that stops being written
  but stays on screen is worse than either state.
- The device pair lands on §2's `SourceMappingsSchema`, on the **DECKLINK arm** (`keyDevice`).
- **C-021**'s subject changes: it is now a MAPPING-LEVEL device pair, not a second declared id.

---

## 2. ⭐ How a live plate becomes a real producer

Today this is **two English sentences** (`docs/prd/caspar.md:371-373` and its acceptance
restatement at `:379-381`) and nothing else.

`SEARCH:` `git --no-pager grep -rn -i -e "source-mapping" -e "sourceMapping" -e "sourceId" -e "source-id" -e "sourceMap" -e "producerMap" -e "inputMap" -e "keySourceId" -- packages tools apps` → **0 hits** for every mapping-shaped name. `git --no-pager grep -rn -e "routeKey" -- packages tools apps` → **3 hits**: the declaration (`packages/shared-schema/src/elements.ts:1019`) and two test fixtures (`packages/shared-schema/tests/elements.test.ts:299,311`). `Glob **/*store*.ts` under `tools/caspar-bridge/src` → exactly five stores, none of them a sources store. And `packages/shared-ipc/src/channels/` contains 19 channel files, none defining such a channel.

### 2z. ⭐ RESHAPED 2026-08-10 (owner) — TWO INDEPENDENT STORES, JOINED BY ONE OPERATOR ACTION

**This supersedes the single keyed store phase 4 first shipped, and it removes a weakness
rather than adding a feature.** It is recorded first because everything below is written in
its terms.

**What it was.** ONE store keyed by the id a TEMPLATE declares: the operator added `guest-1`
because some scene said `guest-1`.

**What it is.** Two halves that know nothing about each other until an operator joins them:

1. **The CATALOG** — the installation builds its list of lives INDEPENDENTLY, with no
   reference to any template and no dependence on any declared id. Each entry carries an
   **installation-generated id**, a human **NAME** ("Studio A", "Baku", "Skype 1") and its
   producer definition.
2. **The ASSIGNMENTS** — each imported TEMPLATE gets, **per live plate**, a property whose
   value is one of those defined sources. **The operator assigns once, per template.**

🔴 **The reasoning, recorded so it is not re-litigated.** Binding by NAME MATCH silently
requires the **AUTHOR** to guess the installation's naming convention — which contradicts
§12.1's own principle that the Designer knows nothing about the installation. Explicit
assignment removes the guess: **the author names plates for the LAYOUT, the installation
names sources for what they ARE, and one deliberate operator action joins them.** The
template stays exactly as portable as before; only the join improves.

⚠ **A template's declared `sourceId` is therefore a PLATE IDENTIFIER, not an installation
key.** The schema field is NOT renamed — that is a scene migration — and every rule attached
to it (the rect, `expectedAspect`, every preflight code in §3 and `tasks.md` 1.8/1.8a) is
unchanged. What changed is what it MEANS.

**The rework was cheap and was taken immediately.** No mapping file exists on any machine, so
there is no migration; phase 6 resolves a plate to a producer through this shape, so the cost
only grows.

### DECISION — TWO bridge-owned stores, with a **deliberately split doctrine**

| Axis                    | Doctrine followed   | Mechanism                                                                                                                                                                     |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Writability**         | **fixed-layers**    | A `sources.*` IPC channel (`config` / `setConfig` / `assignments` / `setAssignments` + two publish channels), edited by the operator. Until they say it, NOTHING reaches air. |
| **Absent file**         | **reserved-layers** | Absent ⇒ **NOTHING DEFINED / NOTHING ASSIGNED**. **No built-in default.**                                                                                                     |
| **Present but invalid** | both agree          | **HARD boot failure**, before the WebSocket binds.                                                                                                                            |

**Paths:** `~/.cg-runtime/bridge-source-catalog.json` (flag `--source-catalog-path`) and
`~/.cg-runtime/bridge-source-assignments.json` (flag `--source-assignments-path`), beside the
existing four.

**Why the ASSIGNMENTS are bridge-side too, beside the template registry.** The bridge is what
resolves a plate to a producer at take. A browser-local assignment would mean the console
that bound the plate is the only console that can take the item — while every other console
in the gallery is looking at the same rundown.

⚠ **NEITHER may live in `templatesDir`,** and the trap is closest for the assignments file
because it is ABOUT templates. `TemplateRegistry.loadPersisted` reads **every** `*.json` there
as a template — `tools/caspar-bridge/src/template-registry.ts:75` `fs.readdirSync(this.#persistDir)`
and `:87` `if (!name.endsWith('.json')) continue;` is the _only_ filter.
`SEARCH:` `git --no-pager grep -rn -i -e "skipFiles" -e "IGNORED_FILES" -e "isTemplateFile" -- tools/caspar-bridge/src` → **1 hit**, which is that `.endsWith` include-filter itself. There is no exclusion list. Two files already trip it (`delimiters.json`, `channel-settings.json`), producing the false _"skipping unusable persisted template … re-import it to restore durability"_ on every boot (filed as B-116).

### 🔴 The inversion, stated because it will be mis-copied

**Both this and reserved-layers say "absent = nothing". The safety direction is opposite.**

- **Reserved layers — "absent = nothing reserved" is FAIL-OPEN.** With no file, the bridge
  happily allocates onto the playout system's layers. The doctrine is chosen anyway because
  the alternative (guessing a reservation) is worse, and
  `tools/caspar-bridge/src/reserved-layers-store.ts:15-18` records the reasoning.
- **Live sources — "absent = nothing defined and nothing assigned" is FAIL-CLOSED.** With no
  files, no plate resolves and **nothing reaches air.**

**Why no built-in default, explicitly.** A default fixed-layer bank is safe because 70–99 is
empty — a default is a guess about _our own_ layer numbering. A default **input definition**
is a guess about **hardware nobody in this project can see**, and a wrong guess puts the wrong
source on air. C-015's own acceptance already prescribes the right behaviour for the empty
case (`docs/prd/caspar.md:396-397`): the take refuses legibly with a distinct errorCode, never
a silent empty hole on air. The absent files are simply the case where **every** plate is
unassigned, and it resolves through that same rule.

### Shape

```
SourceCatalogSchema = {
  sources: Array<{
    id: string,                     // INSTALLATION-generated (`nextSourceId`), never a scene's id
    name: string,                   // REQUIRED — "Studio A", "Baku". The only handle the operator sees.
    format?: string,                // the SIGNAL format, e.g. '1080i5000'. The fit aspect DERIVES from it (§3a).
    aspect?: number,                // fallback when `format` yields none (AUTO / unlisted)
    producer:
      | { kind: 'route',    channel: number, layer?: number }
      | { kind: 'decklink', device: number, keyDevice?: number }
      | { kind: 'ndi',      source: string, lowBandwidth?: boolean }
      | { kind: 'media',    file: string },
  }>,
  layerRange?: { start: number, end: number },   // DECLARED, never defaulted (§4)
}

SourceAssignmentsSchema = {
  assignments: Array<{ templateId: string, plateId: string, sourceId: string }>,
}
```

A **discriminated union on `kind`**, not a free string, so an unreachable producer form is a
parse error at the boundary rather than an AMCP `400` at take time. `route` carries an
optional `layer` because the measured grammar `route://(?<CHANNEL>\d+)(-(?<LAYER>\d+))?`
makes it optional.

**`keyDevice` on the DECKLINK arm is where fill+key lives** — it moved off the element, see
§1a. It is on that arm ALONE and deliberately: a fill/key pair is two physical SDI inputs. A
`route` or an `ndi` source carries its own alpha or none, and offering the field there would
invite an operator to configure a pair that cannot exist. **The DECKLINK arm carries no
`format`** — §3a made the ENTRY's format the one that determines the fit, and two spellings of
one fact with nothing to say which the crop was computed from is precisely the drift that
decision exists to prevent.

**The id is INSTALLATION-generated and NEVER REUSED**, and that is a safety property rather
than tidiness: a counter handing out the lowest free number would re-issue a retired source's
id, and a stale assignment — hand-written, or restored with an older file — would then RE-BIND
silently to a source nobody chose. `nextSourceId` is random and collision-checked, so a
retired id never comes back. It is belt to the delete cascade's braces (§2c).

**The NAME is required and must be unique.** It is the only handle the assignment picker
shows, so an entry without one is an entry nobody can assign, and two entries called "Studio
A" leave the operator choosing blind. Both are refusals (`duplicate-name` beside
`duplicate-id`).

### 2c. ⭐ THE THREE CASES THE MODEL MUST ANSWER — behaviours, not open questions

**1. A plate with no assignment.** A freshly imported template has none, and that is the
ORDINARY state rather than a fault. The template picker row NAMES which plates are unassigned
(not a count — a count sends the operator hunting), the Inspector's LIVE PLATES section marks
each one, and **the take refuses legibly naming the plate**. `tasks.md` 6.7's refusal wording
is extended accordingly: it assumed a missing MAPPING and must also cover a missing
ASSIGNMENT.

**2. Deleting a source that is assigned somewhere.** The delete is **NOT refused** — an
installation must be able to retire a live — and it is **NOT left to dangle**: an assignment
that dangles until air is the failure this project exists to prevent. It **CASCADES**
bridge-side in the same operation, the surface **names at the moment of deletion** which
templates referenced it, and those plates then read as needing a source, with the take
refusing for that reason.

⚠ **REMOVED rather than TOMBSTONED, and the reason is recorded.** A tombstone would be a
second "assigned, but not really" state that every consumer — the row, the take, the picker,
C-022's HTTP view — would have to learn and could get wrong, and it would give a re-created id
something to silently re-bind to. "Unassigned" is the truth about such a plate and is a state
the whole feature already handles. What a tombstone would have carried — WHICH source went —
the deletion report carries instead, to where the operator actually is.

The same prune is the LOAD-time reading of an assignments file that disagrees with the catalog
beside it (two files, hand-editable, restorable apart): it is pruned **loudly** on the boot
line rather than made a boot failure. The unusable-FILE rule is unchanged — a file that will
not parse has no reading at all, while a dangling reference has a perfectly clear one.

**3. One source assigned to two plates at once.** **PERMITTED**, and it means two producers
reading one input. Unremarkable for `route://`; **a DECKLINK input may refuse a second open.**
🔴 **Recorded as a RECON QUESTION for phase 6's measurement session** (`amcp-poke`, the same
session as §3b's `DEFER`/`COMMIT` and R-048's occupied-layer `PLAY`), and **until it is
answered the UI does not present it as guaranteed** — nothing anywhere says it will work.

### 2d. ⭐ WHERE THE BINDING LIVES — the Inspector, not the sources modal (owner, 2026-08-10)

**DECIDED after the first implementation put both jobs in one dialog.** Defining sources stays
in the **Live sources modal**; BINDING a plate is in the **INSPECTOR**, shown when the
template is selected.

**The cost that decided it, measured rather than argued:** the modal then did two unrelated
jobs, and with two templates imported it already listed **six plates and scrolled** before a
single source existed. The binding belongs beside the thing being bound; selecting a template
shows **that template's** plates instead of every plate in the station.

🔴 **The assignment is TEMPLATE-LEVEL and the UI SAYS SO.** It is the default for every use of
that template, so editing it from one row changes what other rows carrying the same template
will do. That is **one honest line in the section, not a tooltip** — an operator must not
discover it by surprise on air. `R-048`'s fast on-air swap is the **per-run OVERRIDE** on top
of it, and the override **does NOT write back**: an emergency substitution must never silently
become the permanent configuration.

⚠ **A template not on a row cannot be assigned, and that is ACCEPTED.** Under R-028 every
template that will be used is on a declared row, so loading it is the natural first step, and
the take would refuse an unassigned plate anyway. Recorded as the decision rather than left as
an omission.

### 2a. Where this shape comes from — the plant's PREVIOUS automation

**RECORDED 2026-08-10 (owner), and it is the reason §1a and §3's amendment are corrections rather
than preferences.** The system this project replaces defined lives like this:

- Each live was **created in CG Control**: the operator set its **type**, its **master** and
  **slave** devices, its **format**, and so on.
- It was saved as a **preset in a DATABASE**.
- The **playout application read that list** and added entries to its own **RUNDOWN**. Playout here
  is the **CIAB client** (a modified CasparCG Client), and it keeps that role.

So the phase-4 **source CATALOG** is the successor to that database table, and it gains a **SECOND
CONSUMER**: playout. That is filed as **C-022** (a read-only HTTP view of the list on the server the
bridge already runs) rather than letting playout open the JSON by path, which would couple it to
this machine's filesystem layout and give it no stable shape to read. ⚠ The 2026-08-10 reshape made
that consumer's job STRICTLY BETTER: what it now reads is a list of NAMED lives, which is what a
rundown wants, rather than a set of ids invented by whichever template happened to be authored
first.

**The corroborating artifact** is `docs/recon/ciab-client-tools.json`, the CIAB client's tool
definitions — `ChannelInput` carries exactly `Type`, `StreamPath`, `MasterNumber`, `SlaveNumber`,
`Format`, `Transition`, `Duration`, `Tween`. MASTER + SLAVE on ONE entry is the fill/key pair; the
per-entry `Format` is the format field above.

🔴 **Read that file with the care its provenance demands.** It describes a **MODIFIED client**, not
the CasparCG **server**, and its capture date is unknown (the owner says it may be out of date). Its
`Matrix / Route` tool drives an external **Samim / BlackMagic VideoHub over IP** and is **not AMCP at
all**; `ATEM / *` addresses a Blackmagic switcher; `ChannelInput` / `ChannelRecord` /
`ChannelSnapshot` are the product's own tools. Only the **`Mixers`** folder tracks AMCP's `MIXER`
surface closely enough to be evidence about the server. Nothing below reads a client tool as a
server capability.

### Following the store precedent exactly

- **Atomic write** — mkdir → tmp → rename, mirroring `fixed-layers-store.ts:305-310`.
- **Boot order** — loaded and validated in `tools/caspar-bridge/src/bridge.ts` **before**
  `new WebSocketServer(...)`, so a conflict resolves loudly at startup rather than at a take. The
  pinning-test shape already exists: `tools/caspar-bridge/tests/fixed-layers-boot.integration.test.ts:134-165`
  asserts a conflicting bank throws before binding _and_ that no port is left listening.
- **Provenance on stderr** — each store returns `{ value, source }` and the boot line prints where
  its value came from, following `describeFixedBank` (`bin/caspar-bridge.mjs:162-182`), whose own
  header records why: on 2026-08-01 two machines ran different banks and nothing anywhere said so.
  A live source list is _exactly_ the class of install config that differs silently between machines.
  The assignments line ALSO prints what the boot **PRUNED** (§2c), because a plate that was bound
  and now is not must not become one silently.
- **Refusal wording** — reason codes derived from a wire const so store and channel cannot drift,
  as `FIXED_LAYERS_SET_CONFIG_REASONS` already does. **Two unions here**, one per store
  (`SOURCES_SET_CONFIG_REASONS` / `SOURCES_SET_ASSIGNMENTS_REASONS`), and the operator-facing
  sentences are keyed off them so a validator code cannot ship without one.
- **THE PURE VALIDATORS LIVE IN `@cg/shared-ipc`, NOT IN THE BRIDGE.** `validateSourceCatalog`,
  `validateSourceAssignments` and `pruneAssignmentsForCatalog` are all there, so the bridge and the
  offline mock share ONE definition of a legal catalog, a legal assignment, and what a deletion
  orphans. Only load / save / provenance stayed bridge-side, because only that half needs a
  filesystem. **This split is what let the 2026-08-10 reshape land in one place.**

### The settings surface — TWO of them, per §2d

**Defining** sources is the **Live sources modal**, modelled on **`DelimitersModal`**
(`apps/runtime/src/renderer/features/inspector/DelimitersModal.tsx`) rather than
`FixedBankConfigModal`, because a source list is a list editor and not a read-only ceiling.
**Binding** a plate is the **INSPECTOR's `LIVE PLATES` section**, shown for a selected template
(§2d records why it is not in the modal). Both go through the same store and inherit the same two
behaviours, copied deliberately:

- **No optimistic local update** — _"The local cache is NOT updated optimistically. The bridge is
  the owner and can refuse"_ (`delimiterStore.ts:134-140`).
- **`describeCommitFailure`'s older-bridge translation** (`:162-171`) — a station whose bridge
  predates this feature must be told that rather than shown a generic failure.

🔴 **AND A THIRD, MEASURED IN USE: A REFUSAL MUST NEVER SHOW A WIRE IDENTIFIER.** An operator met
`invalid request for sources.set-config` — the bridge's own frame validator (`bridge.ts`,
`invalid request for ${frame.channel}`) reaching the screen verbatim. It names an IPC channel and
there is nothing to do with it. **It was not a typo, it was a STATE:** the browser was talking to a
bridge PROCESS whose build predated this channel's shape, so the payload was legal in the page and
rejected on the wire. `unknown channel` was already translated — the case where the bridge has never
heard of the feature — and this is its sibling, where the bridge knows the channel and disagrees
about its shape. Both now say the same operator-facing sentence, and the per-reason sentences are
keyed off the wire's own unions so the two cannot drift.

⚠ **Two payload bugs in the same class were found and fixed with it**, because each produced that
same bare message: a fresh `ndi` / `media` producer was created with an EMPTY name (which its own
`z.string().min(1)` rejects), and the numeric controls accepted `0` for `channel` / `device` /
`keyDevice` (all `z.number().int().positive()`). **A control must not be able to produce a value
the contract forbids** — the floor is now the schema's own.

`SEARCH:` `git --no-pager grep -rn -e "channelSettings.set" -- apps/runtime/src` → **0 renderer call sites** (the three repo-wide hits are the channel-name literal, the bridge calling its own store, and a `.settings.find` false positive). So `channelSettings` is **not** a usable settings-surface precedent; `FixedBankConfigModal` and `DelimitersModal` are the only two.

---

## 3. Symbolic versus concrete — and the stretch problem

`routeKey` is `z.string().min(1)` (`packages/shared-schema/src/elements.ts:1019`). `'guest-1'`,
`'DECKLINK DEVICE 3'` and `'C:\media\guest.mp4'` all parse identically, and **nothing anywhere
validates it** — no schema refinement, no preflight, no lint, no UI (there is no UI: see §9).

### ⭐ WHAT THE DECLARED ID IS, AFTER §2z — a PLATE IDENTIFIER

**Restated here rather than renamed.** The element's `sourceId` names a HOLE IN THIS TEMPLATE and
nothing outside it: the author picks it for the LAYOUT (`guest-1`, `guest-2`), and it is joined to
an installation source by a deliberate operator action, never by matching its text against anything.

⚠ **The schema field keeps its name** — renaming it is a scene migration and is out of scope
(`proposal.md`) — and **every rule below is unchanged**: the symbolic form, the preflight codes, the
flattened rect, `expectedAspect`, `tasks.md` 1.8 and 1.8a. Only the MEANING is restated. The
symbolic-form refinement in particular still earns its keep for a reason that survives the reshape:
a device-shaped plate id is an author writing an installation fact into a scene, which is exactly
what this design forbids whether or not anything would have matched it.

### DECISION — a scene may NOT name a device. Enforced in two places.

1. **Schema** — the id gets a format refinement: a symbolic identifier
   (`/^[a-z0-9][a-z0-9_-]*$/i`), which rejects `DECKLINK DEVICE 3` (spaces), `route://1-1` (colon,
   slashes) and a file path (backslashes, colon) **by construction**.
2. **Preflight** — a new `live-source-*` issue code. This costs **no wire change**:
   `ExportIssue.code` is `z.string().min(1)`, an open string
   (`packages/shared-ipc/src/channels/export.ts:16-24`).

The template therefore stays portable: it names its own plates, and the plate → source binding is an
**installation** concern, which is what both items promise (`docs/prd/caspar.md:374-376`). §2z makes
that stronger rather than weaker — under a name match the template was portable only to a plant that
had adopted the author's vocabulary.

### 🔴 The aspect decision, forced by hardware fact 2

`MIXER FILL` **stretches**. `expectedAspect` exists and has **zero consumers**.
`SEARCH:` `git --no-pager grep -rn -e "expectedAspect" -- packages tools apps` → **3 hits**: the declaration (`elements.ts:1018`) and two round-trip test fixtures (`elements.test.ts:298,310`). No renderer, exporter, bridge or runtime reads it.

So today, if a source's real aspect differs from the authored hole, **a face goes on air stretched
and nothing prevents it.**

**A correction to how this was first weighed.** The first three options below all answer _"how do
we PREVENT a mismatch?"_. Only the last two answer _"a mismatch has happened — how do we RESOLVE
it?"_, which is the question that actually matters, because the source a plate is assigned to is an
installation fact the author never sees and therefore a mismatch is always possible.

| Option                                                                                               | Verdict                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Constrain the hole at authoring time** — the Inspector locks the hole's aspect to `expectedAspect` | **Rejected.** It forbids a legitimate design (a deliberately non-16:9 window) and it cannot help at all when the _source_ is not what the author expected.                                                                                                                       |
| **Warn at preflight**                                                                                | **Kept as a supplement, not the answer.** It checks an _authored_ value against nothing at author time, and — decisively — **a warning does not block**: only `severity: 'error'` gates export (`apps/designer/src/renderer/features/compositions/CompositionActionBar.tsx:41`). |
| **Stretch (do nothing)**                                                                             | **Rejected.** This is today's behaviour, and it puts a distorted face on air.                                                                                                                                                                                                    |
| **Pillarbox** — fit the source inside the hole, preserving aspect, leaving margins                   | **REJECTED — see below.**                                                                                                                                                                                                                                                        |
| **Crop-to-fill** — scale to cover the hole, preserving aspect, clip the overflow                     | **ADOPTED.**                                                                                                                                                                                                                                                                     |

### DECISION — crop-to-fill

**The rule:** scale the source so it **covers** the hole with its proportions intact — matched
scale factors on both axes, sized by the _larger_ of the two required ratios — and clip the
overflow to the hole rect.

**Why not pillarbox, which an earlier draft of this document adopted.** A pillarbox is honest, but
it puts **black bars inside a frame the designer drew**. A multi-box guest window is a designed
graphic element, not a video player viewport: bars inside it do not read as "the source is 4:3",
they read as **a fault on air**. Crop-to-fill preserves proportions _and_ fills the window, which
is the ordinary broadcast convention for a multi-box. The cost of crop-to-fill — losing the edges
of the source frame — is the cost every broadcaster already accepts for this shot, whereas the cost
of pillarbox is a graphic that looks broken.

### The mechanism — `FILL` + `CLIP`, MEASURED 2026-08-03

`MIXER CLIP` and `MIXER CROP` are both registered on the plant's 2.3.2 binary, in the **same
contiguous command block** as `FILL` — verified by a read-only UTF-16LE scan of
`D:\programs\CasparCG\casparcg.exe` at `0x68a018`:

```
… MIXER CONTRAST | MIXER LEVELS | MIXER FILL | MIXER CLIP | MIXER ANCHOR | MIXER CROP | MIXER ROTATION …
```

**The chosen composition is `FILL` + `CLIP`:** emit a `FILL` whose rect is aspect-matched and
therefore _oversized on one axis_, then `MIXER CLIP` to the hole rect so the overflow is not drawn.
`CLIP` is chosen over `CROP` because `CLIP` takes a rect in the **same channel-normalized
coordinate space as `FILL`**, which is the space §6's chain already derives — so it composes with
arithmetic already being computed, and needs no second coordinate model.

**MEASURED, CasparCG `2.5.0 69e8ad5`, `1080i5000`.** From a clean reset (`CLEAR` + `MIXER CLEAR` on
both layers first — mixer state survives `CLEAR`, so an unclean frame is how this gets misread),
one command at a time with a look between each:

| step                             | observed                                         |
| -------------------------------- | ------------------------------------------------ |
| `PLAY 1-1 "m" LOOP`              | full-frame background                            |
| `PLAY 1-2 "route://1-1"`         | no visible change — identical full-frame overlay |
| `MIXER 1-2 FILL 0.5 0.5 0.5 0.5` | box appears bottom-right                         |
| `MIXER 1-2 CLIP 0 0 0.5 0.5`     | **box disappears entirely, nothing elsewhere**   |

**CONFIRMED, and it is exactly what this design assumed: `CLIP`'s rect is in CHANNEL-NORMALIZED
space, the same space as `FILL`, and it MASKS — it does not travel with `FILL`.** A top-left clip
window and a bottom-right fill box do not intersect, so the layer renders nothing. That last row is
the whole proof: had `CLIP` been source-relative, or had it moved with the fill rect, the box would
have survived in some form.

**`MIXER CROP` is therefore no longer needed as a fallback** for coordinate space or composition
order. It stays recorded only as the alternative if the partial-overlap question below resolves
against `CLIP`.

🔴 **The coupling this creates, stated because it is the failure mode.** Because `CLIP` masks in
channel space and does **not** travel with `FILL`, the two rects are **not independent** — they are
two outputs of the same §6 derivation and must be emitted together from one computation. Changing
one without the other does not degrade gracefully: a fill box that moves out from under its clip
window renders **nothing at all**, which on air is a black hole where a guest should be. The spec
delta therefore requires them emitted as a pair, and `tasks.md` 6.1 builds them as one call rather
than two independent builder methods.

⚠ **Still owed, and 6.3a is narrowed to exactly this** — coordinate space and composition order are
settled, so what remains is:

1. **Is `CLIP` purely an intersection mask under PARTIAL overlap?** The measurement above tests
   disjoint rects (renders nothing) and, implicitly, containment. The crop-to-fill case is neither:
   the fill rect is _larger_ than the clip rect on one axis, so the expected result is the
   intersection. That specific geometry has not been looked at.
2. **What rounding and precision does the server accept for the four arguments?** §6 emits computed
   fractions, not round numbers, and no recorded precision exists. `css()` uses 6 decimals for the
   CSS side (`packages/template-runtime/src/position.ts:202-204`); whether AMCP accepts the same is
   unknown.

Neither needs capture hardware — two `route://` producers reproduce both.

### ✅ Cross-build check — DONE. Both facts hold on the target build.

The measurements above were taken on the side-by-side **2.5.0** install, while C-015's target plant
is **2.3.2**. That gap is now closed. **Measured 2026-08-03 on the plant build itself** —
CasparCG **2.3.2** at `D:\programs\CasparCG`, same machine, same clean-reset procedure (`CLEAR` +
`MIXER CLEAR` on both layers), one command at a time:

| step                             | observed on 2.3.2        |
| -------------------------------- | ------------------------ |
| `MIXER 1-2 FILL 0.5 0.5 0.5 0.5` | box appears bottom-right |
| `MIXER 1-2 CLIP 0 0 0.5 0.5`     | box disappears entirely  |

**Same behaviour as 2.5.0.** So both load-bearing mixer facts now hold on the build the feature
actually targets, not only on the side-by-side install: `FILL` places per-axis against the channel
raster, and `CLIP` is a channel-space intersection mask that does not travel with `FILL`.

🔴 **The distinction that must survive this, because it is the kind of thing a later reader
flattens.** The 2.3.2 check is **QUALITATIVE** — box present, then absent, by eye. **What carried
across builds is the SEMANTICS. The ARITHMETIC was not re-measured on 2.3.2**: the pixel-accurate
placement in §0b — `FILL 0.5 0.5 0.5 0.5` landing at exactly (960, 540) sized 960×540 — was
measured on **2.5.0 only**.

**Nothing in this design depends on it having been.** §6's chain needs the _normalization basis_
(per-axis against the raster) and the _masking semantics_, both of which are confirmed on 2.3.2.
It does not need the pixel measurement repeated; that measurement's job was to falsify the
competing basis hypothesis, and it did.

### ⭐ What `expectedAspect` MEANS under this decision

The two readings are different fields that happen to share a name, and this design picks one:

> **`expectedAspect` is a DECLARATION to validate the mapped source against. It is NOT the input to
> the fit computation.**

- **The fit input is the ASSIGNED SOURCE's aspect** — an installation fact, recorded beside the
  producer in §2's `SourceCatalogSchema`. The operator who defined "Studio A" knows what the plant
  delivers; the author does not.
  **AMENDED 2026-08-10 (owner): that aspect is DERIVED FROM THE MAPPING'S `format`, not typed.**
  See §3a below for the chain and the reason.
- **`expectedAspect` is the author's assertion** — "this window is designed for a 16:9 feed". The
  bridge compares it against the ASSIGNED SOURCE's aspect and **refuses the take with a distinct
  errorCode when they disagree**, rather than silently cropping something the author never
  anticipated.
- **Fallback, recorded as a fallback:** where the assigned source states no aspect, the fit uses
  `expectedAspect` as the assumed source aspect. This keeps the feature usable before every source
  is fully described, and it degrades to the author's best guess rather than to a stretch.

This is what makes the decision coherent: crop-to-fill _discards picture_, so it must be driven by
what the source actually is, not by what the author hoped. Driving a crop from an authored guess
would silently cut the wrong part of a face.

**`expectedAspect` therefore acquires its first consumer and becomes load-bearing** — which is why
§3's schema work and §6's geometry work sit in the same phase.

**Open residual, unchanged:** whether the producer's real raster can be read back at run time (so
the fit could use measured truth rather than the source's declared aspect) is unknown — §12.3. If
it can, it supersedes the source's `aspect` as the fit input and `expectedAspect` stays exactly
what it is here: a declaration to validate against.

### 3a. AMENDED 2026-08-10 — the SOURCE carries the FORMAT, and the fit aspect DERIVES from it

⚠ **Written before §2z and re-pointed by it, not superseded.** Every word below held of the mapping
ENTRY and now holds of the CATALOG ENTRY; the fit chain is unchanged, and the only difference is
which of the two stores the plate reaches it through.

**The previous automation's live definition carried a format**, and the artifact shows the exact
vocabulary. `ciab-client-tools.json`, `ChannelInput` → `Format` is a **37**-value combo, default
`PAL` (this document said 39 when it was authored; the artifact was re-counted in phase 4 and the
list quoted below — which was always right — is 37 long):

```
AUTO · PAL · NTSC · 576p2500
720p2398 · 720p2400 · 720p2500 · 720p2997 · 720p3000 · 720p5000 · 720p5994 · 720p6000
1080p2398 · 1080p2400 · 1080p2500 · 1080p2997 · 1080p3000 · 1080p5000 · 1080p5994 · 1080p6000
1080i5000 · 1080i5994 · 1080i6000
1556p2398 · 1556p2400 · 1556p2500
2160p2398 · 2160p2400 · 2160p2500 · 2160p2997 · 2160p3000
dci1080p2398 · dci1080p2400 · dci1080p2500 · dci2160p2398 · dci2160p2400 · dci2160p2500
```

and `ChannelInput` → `Type` is exactly five values, quoted **verbatim from the file**:

```
Stream · Ndi · Decklink · BlueFish · Rout
```

⚠ **`Rout`, not `Route` — that is what the artifact literally says** (and the owner's description
said "Route"). Recorded as the file has it, because this list is the reason to have the file at all;
whether the client's own spelling is a typo is not something this document can settle.

**DECISION — the fit aspect is DERIVED from `format`, never typed by hand.** A hand-entered aspect
is a number that can be wrong on air, and it can be wrong while looking entirely reasonable:
`1080i5000` is 16:9 whatever anyone types beside it. The operator already has to state the format —
the previous system asked for it, and it is the field that actually determines the raster.

**The chain, in order, recorded so no reader re-derives it.** Step 0, after §2z, is the ASSIGNMENT:
the plate's assigned catalog entry is what steps 1 and 2 read, and a plate with NO assignment
refuses the take before any of this (§2c, `tasks.md` 6.7).

1. **the assigned source's `format`** → its aspect (`1080i5000` → 16:9, `PAL` → 4:3, …);
2. **the assigned source's explicit `aspect`** — the fallback where the format yields none, i.e.
   `AUTO` or a format outside the list above;
3. **the element's `expectedAspect`** — the author's best guess, last;
4. **neither side states anything** → still open, and still `tasks.md` 6.3's to settle.

🔴 **`expectedAspect` IS UNCHANGED BY THIS, and this sentence exists so a later reader does not
collapse the two.** It remains the AUTHOR'S ASSERTION that the bridge VALIDATES the assigned source
against,
refusing the take with a distinct errorCode when the two disagree (above). It appearing at step 3 of
the fit chain is a FALLBACK for an undescribed source, not a promotion to fit input. The two roles
are different questions about the same number: "what shape is this feed?" (the installation's
source) and "what shape did the author design for?" (the element).

### 3b. OPEN RECON QUESTION — `DEFER` / `COMMIT`, and whether `FILL` and `CLIP` land on ONE frame

**Not a decision. A question, with its risk, recorded because it bears on task 6.1.**

The plant's client exposes a **`Defer` boolean on 14 of its `Mixers` tools** (`ciab-client-tools.json`
— `AnchorPoint`, `Brightness`, `Clipping`, `Contrast`, `Crop`, `Distort`, `Grid`, `Levels`, `Mask`,
`Opacity`, `Rotation`, `Saturation`, `Transform`, `Volume`) plus a bare **`Commit`** tool with no
properties at all. That is the AMCP `MIXER … DEFER` / `MIXER <ch> COMMIT` pair.

**Why it matters here.** Task 6.1 requires `FILL` and `CLIP` to be emitted as a PAIR from one
computation. Sending them together in one batch is **not** the same as their landing on the SAME
FRAME, and the failure if they do not is the one §3 already measured: a fill box that is momentarily
out from under its clip window renders **nothing at all**. Deferring both and committing once is the
mechanism that would make it atomic.

🔴 **The risk, which is why this is not already a decision.** `COMMIT` is **CHANNEL-scoped**, and
this project forbids channel-scoped MIXER commands (`caspar-runtime.ts:2718-2724`). Worse, per
R-021's own rationale **this plant runs several Runtime stations against one CasparCG** — so a
`COMMIT` we send might apply **another controller's** deferred changes. That is the same class of
harm the channel-scoped ban exists to prevent.

**The question, answerable with `amcp-poke` on the plant's 2.3.2 and needing no capture card:**

> Does `MIXER <ch> COMMIT` apply only the DEFERRING CONNECTION's queued changes, or every deferred
> change on the channel?

Run it alongside phase 6 and **in the SAME session as R-048's replace measurement** — both are AMCP
probes on the same build, and pairing them costs one session instead of two.

---

## 4. 🔴 R-028 — the collision, and the landing order

### The state of R-028

`openspec/changes/runtime-unified-layer-rows/tasks.md` — **22 checked, 14 open**. Section 6 is
**entirely open** (6.1–6.4 at `:140-147`); task 1.2 (`:27-33`) is `[x]` and is C-015's own seam.

### R-028's own doctrine is the thing to extend, not to fight

`design.md:185` (§i) states it: **"Declared, never detected"** — because OSC carries producer _kind_,
not identity, so "a playout graphic and one of ours are both `html`", and _"without declaration,
R-009's orphan sweep flags healthy playout graphics as ORPHANS."_

A Live Source layer is the **same problem one step further out**: a layer whose owner cannot be
inferred from the wire. The answer is therefore the same answer — **declare it** — and this design
does not invent a new mechanism so much as add a third member to an existing set.

### What section 6 would cement if it landed first

| Task                         | Verbatim                                                                                                         | Effect on a Live Source layer                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6.2** (`tasks.md:142-143`) | _"R-009 orphan sweep NARROWED, still running: candidates become layers nobody declared."_                        | A Live Source layer **is** a layer nobody declared, under a two-class model. It becomes a reclaim candidate — the exact opposite of C-015's _"never an R-009 reclaim target"_ (`caspar.md:403-404`).            |
| **6.3** (`:144`)             | _"R-015's foreign refusal unchanged outside declared ranges; regression-test the boundary."_                     | The Live Source range would be outside every declared range, so a **bridge-owned non-html producer** meets a refusal built for foreign ones. This is C-015's own _"THE structural risk"_ (`caspar.md:409-413`). |
| **6.1** (`:140-141`)         | _"`LayerManager.allocate()` … MUST have no caller that puts an operator graphic on air. Assert that in a test."_ | Written first, the test fixes the allocation story before Live Source allocation is designed. Written after, it can be written to permit a **declared, non-operator** allocation.                               |
| **6.4** (`:145-147`)         | _"`LayerPolicy` ranges become DESCRIPTIVE."_                                                                     | **This is the opportunity.** It frees 10–59.                                                                                                                                                                    |

### DECISION — landing order

> **This design lands FIRST, as a design. R-028's section 6 then implements a THREE-class declared
> model, and this change's implementation phases follow it.**

Concretely:

1. **This change merges as a design** (no product code — see `tasks.md` §0). ✅ done.
2. **R-028 section 6 is amended before implementation** to narrow the R-009 sweep against
   _three_ declared classes, and to write 6.1's test so it permits a declared non-operator
   allocation. That amendment is task **6.5** in R-028, defined in this change's `tasks.md` §7 as a
   cross-change obligation. ✅ **DONE 2026-08-08** — R-028's `tasks.md` now carries 6.5 (the
   three-class model), a rewritten 6.1, a 6.4 confirmed against the code, and an 8.3 naming the
   ownership class as well as `reservedLayers`.
3. **This change's OWNERSHIP phases land after R-028 section 6 is implemented.**

**Which phases that binds — SHARPENED 2026-08-08, because step 3 was written more broadly than its
own argument supports.** The argument above is entirely about the layer-ownership doors: the R-009
sweep, the C-014 quarantine and the R-015 refusal. That is **phases 5 and 6**, plus the range
validation in phase 4. It is **not** about phases 1–3:

| Phase                               | Touches an ownership door?    | Order constraint                                                |
| ----------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| **1 — schema + authoring**          | no — Designer-only            | **none.** No bridge, no wire, no layer. Landed 2026-08-08.      |
| **2 — declaration + carrier**       | no — a `TemplateInfo` field   | none (2.6 is a comment correction R-028's 6.5 explicitly cites) |
| **3 — mock**                        | no — test infrastructure      | none; it BLOCKS 4 and 5                                         |
| **4 — source stores + settings**    | 4.5 only (range disjointness) | 4.5 wants R-028's 6.4 (the freed 10–59) to be real              |
| **5 — ownership**                   | **yes, all three doors**      | **after R-028 section 6**                                       |
| **6 — producer + geometry + audio** | yes (creates on those layers) | **after phase 5**                                               |

**The rule, stated so it cannot be read as a licence to start phase 5 early:** what must not happen
is a window in which a live guest box exists on a layer R-009's un-narrowed sweep can reclaim.
Phases 1–3 create no such layer, so they carry no such window. Phase 5 does, and is the phase the
landing order is about.

**Why this order and not the reverse.** R-028's section 6 is a _narrowing_ — it removes candidates
from a sweep and asserts an absence in a test. A narrowing written against an incomplete class list
is not a bug that shows up in review; it is a **silently correct-looking test** that forbids the
third class. The reverse order (build Live Sources first, then narrow) would mean the sweep flags
live guest boxes as orphans in the window between them, which is an operator being invited to clear
a face off air.

### The layer range — 10–59, freed by R-028's own 6.4

Under R-028 the map is: playout **60–69** declared, operator rows **70–99** declared, and
**10–59 released** when `LayerPolicy` becomes descriptive (`design.md:57-84` §c). Templates sit on
70–99; C-015 needs sources _below_ the template's layer. **10–59 is directly below 70–99, is fifty
layers wide, and is freed by R-028 itself.**

This supersedes the recon's "1–9 is the only free band", which was measured against **today's**
policy. Under R-028's own §k that policy is descriptive, and 1–9 (nine layers, enough for four
fill+key boxes on the whole channel) is not a viable address space.

**The Live Source range is declared config**, in the same file as the source catalog (§2), validated
disjoint from the fixed bank and the reserved range at load **and** at change — extending the
existing `validateFixedBank` checks (`tools/caspar-bridge/src/fixed-layers-store.ts:145-166`),
which already do exactly this for two of the three classes.

### ⚠ The `reservedLayers` trap — and a correction to the code's own comments

**Do not put Live Source layers in `reservedLayers`.** It fixes the R-009 line and breaks three
others:

- `allocate()` skips reserved layers — `packages/caspar-client/src/layers/layer-manager.ts:210`
  `if (this.reservedLayers.has(layer)) continue;`
- `reserve()` refuses them — `:246` `if (this.reservedLayers.has(slot.layer)) return false;`
- `clearLayer` refuses them as `reserved` — `tools/caspar-bridge/src/caspar-runtime.ts:2679-2681`

A Live Source on a reserved layer is **unplaceable and unclearable through every existing door.**

**The correction, and it matters because the code invites the mistake.**
`tools/caspar-bridge/src/caspar-runtime.ts:295-300` tags `#reservedLayers` as _"R-028 / C-015"_, and
`tools/caspar-bridge/tests/fixed-layers-store.test.ts:76` calls it _"the C-015 Live Source seam"_.
**The code says otherwise:** `packages/shared-ipc/src/channels/fixedLayers.ts:161-166` defines
reserved layers as _"the layer numbers the **company's playout system** owns"_, and
`reserved-layers-store.ts:5-10` restates it. `reservedLayers` is a **fence AWAY from a foreign
owner** — the exact inverse of a record of layers **we** own. R-028's task 1.2 wired it as "C-015's
seam" and marked it done with the list empty; that satisfied the _disjointness_ half of C-015 and
none of the _ownership_ half. The comments are corrected as part of this change's phase 2.

### DECISION — the ledger

`#slots` is `Map<itemId, CommandSlot>` — **one** coordinate per item
(`tools/caspar-bridge/src/caspar-runtime.ts:310`), mutated at exactly three sites (`:1073`, `:1211`,
`:2799`), every entry created from an operator stack item. An item owning N layers is
**unrepresentable**.
`SEARCH:` `git --no-pager grep -rn -i -e "ledger" -e "ownedLayers" -e "bridgeOwned" -e "layerOwner" -- packages tools apps` → ~40 hits, **zero in `tools/caspar-bridge/`**; every one is the unrelated outro ledger in `@cg/template-runtime` or one prose simile. A full enumeration of `CasparRuntime`'s 46 private fields finds no per-layer owner record.

A **new** `#liveLayers: Map<string, LiveLayerRecord[]>` keyed by itemId, each record
`{ slot, sourceId, role: 'fill' | 'key', producer, fill }`. It is **added beside `#slots`, not
folded into it** — `#slots` answers "where does this item's _template_ live", which every verb
depends on, and widening its value type would touch all nine read sites for a reason none of them
share.

**The three exemptions, each targeting the right door:**

| Door                      | Current gate                                                                                                                 | Live Source treatment                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **R-009 sweep**           | `owned` = the values of `#slots` only (`caspar-runtime.ts:2390-2393`); exemptions are reserved layers and `#slots`           | `owned` gains the `#liveLayers` coordinates. One line, and it is the whole fix.                                                          |
| **C-014 quarantine**      | `#reconcileForeignQuarantine` tests `occ.producer === 'html'` **first** (`:3520`), with `isAllocated` a later veto (`:3532`) | Live Source coordinates are skipped **before** the kind test, since the kind test is exactly what a bridge-owned non-html layer defeats. |
| **R-015 foreign refusal** | see below — **not** a simple exemption                                                                                       | see below                                                                                                                                |

### C5 — why C-015's R-015 exemption cannot be applied as worded

C-015 asks that Live Source layers be _"exempt from R-015's foreign-refusal (the bridge may CLEAR
what it owns)"_ (`caspar.md:401-403`). Applying that literally is **backwards**:

- `clearLayer` is the **operator-facing `layers.clear` path only**. Its own docstring says
  _"clearing owned layers is Out/Remove's job"_ (`caspar-runtime.ts:2649-2651`), and it refuses an
  owned layer with `reason: 'owned'` at `:2682-2686` — **before** the `producer !== 'html'` test at
  `:2690`.
- So the bridge needs **no exemption** to clear what it owns: its own teardown calls
  `#builder.out(slot)` directly and never routes through `clearLayer`.
- Granting the exemption as worded would make Live Source layers **operator-clearable** — inverting
  the protection.

**DECISION:** Live Source layers are refused by `clearLayer` with a **new, distinct reason**
(`live-source`, not `foreign` and not `owned`), so the operator is told _what_ the layer is and
_why_ it is not theirs to clear. Teardown remains the bridge's own path.

**The precedent for a config-declared carve-out already exists and is owner-approved:**
`docs/prd/runtime.md:882-885` records that inside the fixed range, operator Clear works on **any**
producer including non-html — _"a deliberate, owner-approved carve-out of R-015's foreign-refusal"_
— implemented as `clearBankLayer` (`caspar-runtime.ts:2577-2643`), whose guards are purely
config (`:2615` reserved, `:2628` bank membership) and which **never consults producer kind**. That
is the shape this design follows.

### C6 — "sole discriminator" is already stale

C-015 says non-html producer kind is _"the SOLE foreign/owned discriminator"_ (`caspar.md:409-411`).
It is not: `clearLayer` evaluates **reserved** then **owned** before kind, and `clearBankLayer`
consults no kind at all. `docs/prd/runtime.md:886-888` already names three composing ownership
notions _including_ C-015's ledger. The risk C-015 flags is real; its framing understates the
precedent. Corrected in the PRD as part of this change.

---

## 5. The producer verb

`SEARCH:` `git --no-pager grep -rn -i -e "MIXER FILL" -e "mixerFill" -e "MIXER_FILL" -e "MIXER KEYER" -- packages tools apps` (including `--untracked`) → **0 hits**, no spelling, no casing. A second search for `MIXER ` returns 40 hits, all `VOLUME` or `CLEAR`. The only AMCP MIXER construction anywhere is `command-builder.ts:141`.

`tools/caspar-bridge/src/command-builder.ts` is 154 lines and emits **seven** commands
(`:56, :61, :66, :87, :102, :107, :140`) — all `CG …`-scoped or `MIXER … VOLUME`, all through
`target()` at `:146-148` which unconditionally produces `<channel>-<layer>`. **`take()` is
`CG … PLAY 0`** — it plays a template _inside_ an already-ADDed html producer and cannot start any
other kind. There is no escape hatch.

Corroborating evidence that the absence is real rather than unsearched:
`tools/caspar-bridge/tests/clear-all-broadcast-safety.integration.test.ts:62-76` defines its own raw
TCP `sendRaw()` — documented _"This is deliberately NOT the bridge"_ — because the bridge exposes no
way to send `PLAY 1-1 "program-feed.mov"`. The test is itself evidence of the gap.

### DECISION — three new builder methods, all layer-scoped

```
playSource(slot, producer)   →  PLAY  <ch>-<layer> "<producer-argument>"
mixerFit(slot, fit)          →  MIXER <ch>-<layer> FILL x y sx sy
                             +  MIXER <ch>-<layer> CLIP x y sx sy      ← ALWAYS both
mixerClear(slot)             →  MIXER <ch>-<layer> CLEAR
```

- `playSource` takes the **discriminated union from §2**, never a string, so the argument is built
  from a parsed shape. All user-supplied values go through `quote()` exactly once, as the class's
  existing contract requires (`command-builder.ts:44-52`).
- 🔴 **`mixerFit` emits the `FILL` and the `CLIP` as a PAIR, from one computation — deliberately
  NOT two independent methods.** Measured (§3): `CLIP` masks in channel space and does not travel
  with `FILL`, so a caller that set one without the other could put the fill box outside its clip
  window, and the layer would render **nothing at all**. Two methods make that a caller mistake;
  one method makes it unrepresentable. This is the same reasoning as Golden Rule 7 — a single
  condition that governs two commands is evaluated once.
- `mixerClear` is **not optional tidiness**. Mixer state survives `CLEAR`
  (`command-builder.ts:128-130`, and measured on hardware), so a Live Source teardown that omits it
  leaves a `FILL` **and now a `CLIP`** on the layer that a later, unrelated graphic inherits — and
  an inherited `CLIP` is the worse of the two, because it makes an otherwise-correct graphic
  invisible with nothing on the wire explaining why.

### The channel-scoped safety doctrine applies unchanged

`caspar-runtime.ts:2718-2724`: _"**BROADCAST SAFETY — this is per-LAYER, never per-channel.** … It
MUST NEVER emit a channel-level `CLEAR <channel>` — that wipes the ENTIRE channel, including the
program/background signal this app does not manage and must never touch."_

All three new methods route through `target(slot)` and are therefore **layer-scoped by
construction**, exactly like the existing seven. `MIXER <ch> …` (channel-scoped) and `CLEAR ALL` are
**forbidden**, and this is stated in the spec delta so a future "simplification" cannot introduce
one. The bridge's complete channel-scoped surface stays at exactly one command — the read-only
`INFO <channel>` (`caspar-runtime.ts:3309`).

---

## 6. Geometry

### The chain is fully determined by hardware fact 1

For a hole at scene-px `(px, py)` with size `(pw, ph)`, on a channel raster `R`:

```
s      = min(R.w/1920, R.h/1080)                       position.ts:174-176
pad    = ((R.w − 1920·s)/2, (R.h − 1080·s)/2)          position.ts:185-194
(ax,ay)= ANCHOR_FRACTIONS[position.anchor]             position.ts:56-66
Tx     = ax·(1920 − scene.w) + offset.x                position.ts:112
Ty     = ay·(1080 − scene.h) + offset.y                position.ts:113

X = pad.x + s·(Tx + px)    W = s·pw
Y = pad.y + s·(Ty + py)    H = s·ph

FILL = [ X/R.w , Y/R.h , W/R.w , H/R.h ]               ← per axis (fact 1)
```

then **fitted** for aspect per §3 before emission.

🔴 **The naive form is wrong and must not be used.** Normalizing by `scene.resolution` alone — which
is C-015's own wording at `caspar.md:384` — omits `s`, `pad` and the anchor translate. Worked
example: a 960×540 scene, centred, on a 1440×1080 channel, hole at x=100 → the chain gives
`x = 0.302083`; the naive form gives `100/960 = 0.104` — **wrong by a fifth of the frame width**.
The `s = 0.75`, `pad = (0,135)` values are the ones
`packages/template-runtime/tests/output-position.test.ts:162,169` already asserts.

**A second mismatch, from hardware fact 2:** the page scales **uniformly** and letterboxes
(`outputScale` is a single `Math.min`), while `MIXER FILL` normalizes **per axis** and stretches.
They agree only on a 16:9 raster. The chain above reproduces the page's transform exactly, which is
what makes them agree on every raster.

### DECISION — the derivation lives in the BRIDGE, and TWO terms must be added to the wire

Most of the right-hand side is already bridge-resolvable — `R` from
`ChannelSettingsStore.rasterFor(channel)` (`channel-settings-store.ts:131-134`), the operator's
override from `#positions.get(itemId)` (`caspar-runtime.ts:3680`), `REFERENCE_FRAME` a constant.

`SEARCH:` `TemplateInfoSchema` (`packages/shared-ipc/src/channels/templates.ts:14-70`) read field by field: `templateId`, `name`, `sourceFileName`, `templateType`, `fields`, `groups`, `hasNext` — **no resolution, no defaultPosition**. `defaultPosition` is extracted in the browser (`templateDelivery.ts:209`) into a browser-local `Map` (`apps/runtime/src/renderer/features/stack/defaultPositionStore.ts:13-26`).

So **`resolution` AND `defaultPosition` both join the `liveSources` declaration block** on
`TemplateInfo` (§1) — they ride the same carrier, derived at the same moment, for the same reason.

🔴 **CORRECTION — an earlier draft of this document said `defaultPosition` was "deliberately not
added", on the grounds that the bridge holds the operator's effective position in `#positions` and
would otherwise use the same `centred` default the page does. That was WRONG, and it would have put
the live box in a different place from its hole on every template whose author set a position.**

The bridge appends the position query **only when an override exists** —
`caspar-runtime.ts:3685`: `if (position !== undefined) params.push(positionQuery(position));`. With
no override, no `pos` rides the URL, and the page then resolves its own fallback chain:

```
query override ?? scene.defaultPosition ?? centered        position.ts:92-97
```

So for an item with **no operator override on a template with an authored `defaultPosition`**, the
page uses `scene.defaultPosition` while a bridge assuming `centred` would compute a different
`Tx/Ty` — and the composited source lands somewhere the hole is not. The code already says as much
one comment above: _"a graphic with no operator override still has an authored position"_
(`caspar-runtime.ts:3672-3673`).

The bridge therefore resolves the **same three-step chain the page does**, from the same inputs:
`#positions.get(itemId)` ?? the carried `defaultPosition` ?? centred.

### 🔴 The duplication guard — one arithmetic, not two copies

Deriving the FILL bridge-side means the placement arithmetic exists on both sides of the seam. **If
`position.ts` changes and the bridge copy does not, nothing errors: the live box simply slides off
its hole on air.** There is no test that would catch it, and no operator signal — the hole is
transparent, so the failure looks like a mis-authored template.

**This repo has already solved this exact class once, in this exact code path, and wrote down why.**
`caspar-runtime.ts:3681-3684`, on why the bridge calls `positionQuery` from `@cg/shared-schema`
rather than formatting the string itself:

> _"`positionQuery` (@cg/shared-schema), never a local spelling: PVW's rehearsal frame now hands the
> SAME string to the page's own `applyOutputPosition`, and two spellings of one override is how a
> preview comes to place a graphic differently from air."_

**DECISION — the same remedy, applied to the arithmetic instead of the string. Two guards, both in
the geometry phase:**

1. **ONE IMPLEMENTATION.** The pure, DOM-free half of `position.ts` — `REFERENCE_FRAME`,
   `ANCHOR_FRACTIONS`, `outputTranslate`, `outputScale`, `outputLetterbox` — moves into
   `@cg/shared-schema` beside `positionQuery` (`packages/shared-schema/src/scene.ts:260`, already
   the home of `PositionSchema` and `PositionAnchorSchema`). `@cg/template-runtime` re-exports them
   so no page-side import churns, and the bridge imports them directly — **it already depends on
   `@cg/shared-schema`** (`tools/caspar-bridge/package.json`), so this adds no dependency.
   Only `applyOutputPosition` and `resolveChannelRaster` stay behind: they touch `document` and
   `window` (`position.ts:246-247`, `:257-259`, `:274`) and are the page's alone.
2. **A CONTRACT TEST** pinning the two computations to each other over a fixed table of
   `(scene.resolution, channel raster, hole rect, position)` triples, asserting that the bridge's
   normalized FILL and the page's composed CSS transform place the same scene-px point at the same
   raster pixel. The table MUST include **at least one non-16:9 raster** — on a 16:9 raster `s = 1`
   and `pad = (0,0)`, so every term collapses and the test would pass against a _wrong_
   implementation. `1440×1080` is the case already pinned page-side at
   `packages/template-runtime/tests/output-position.test.ts:162,169` (`s = 0.75`, `pad = (0,135)`),
   which gives the test a known-good anchor on both sides. `720×576` (`pal`) is included as a second
   non-16:9 case with a different pad axis.

Guard 1 makes divergence impossible for the shared terms; guard 2 catches divergence in the
_composition_ of them, which is the part that cannot be shared because one side emits CSS and the
other emits AMCP. Both land in **phase 6 with the geometry work** (`tasks.md` 6.2a, 6.2b) — a guard
written a phase later is a guard that was absent exactly when the arithmetic was first written.

### The hole's rect must be computed at IMPORT, not at take

`SEARCH:` `git --no-pager grep -rn -i -e "frameAabb" -e "localToScene" -e "absoluteRect" -e "worldRect" -e "boundingBox" -- apps packages` → the only ancestor-composing function is `frameAabb` (`apps/designer/src/renderer/state/off-frame.ts:74-97`), which is **Designer-renderer code**, exported from no package, imported only by `scene-doc.ts:17`.

And it composes less than is needed. It folds `position`, `anchor`, `size`, `scale`, `rotation`
through **container** ancestors only (`off-frame.ts:117-151`). It does **not** compose:

1. **Composition-INSTANCE scale** — a `composition` element hits the "static leaf" branch and its
   children are never walked, so the instance's inner
   `scale(size.w/comp.resolution.width, …)` (`packages/template-runtime/src/scene-builder.ts:258-260`)
   is never applied. This is precisely the D-119 shape a Live Source will sit in.
2. **`skew`** — carried by `TransformSchema` and emitted at `scene-builder.ts:455-463`.
3. **Animated values** — `frameAabb` reads `el.transform` statically.
4. The composition instance's own clip box (`overflow:hidden`, `scene-builder.ts:239`).

**DECISION:** a **new** `collectLiveSources(scene)` in `@cg/vcg-format` (isomorphic, beside
`buildPlayoutMetadata`) composes the full ancestor chain including composition instances, and emits
one flattened axis-aligned scene-px rect per Live Source. It runs at import, feeding §1's carrier.
`frameAabb` is **not** reused — it is renderer-local and composes the wrong set — but its
`localToParent` arithmetic (`off-frame.ts:50-60`) is the correct per-level kernel and is lifted.

**Clamping:** `.cg-stage` has `overflow: hidden` (`packages/template-runtime/src/css.ts:8-13`), so a
hole partly outside the scene rect is clipped on the template layer — but the live source behind it
would **not** be. The bridge therefore clamps the FILL to the scene rect.

### Animation — refused in v1, with the reason

`position.x/y`, `size.w/h` and `scale.x/y` are all keyframable
(`packages/shared-schema/src/animation.ts`, `AnimatablePropertySchema`); `anchor` and `skew` are
not. A static `FILL` behind an animated hole **desyncs**, and the hole is transparent, so the
failure mode is a live face sliding out from behind its frame on air.

**v1 refuses it**: a Live Source carrying any geometry keyframe is a preflight **error**
(`severity: 'error'`, which blocks export — unlike a warning, see §3). **The refusal covers the
ANCESTOR CHAIN, not only the element** — an animated parent moves the hole identically, and this
flattener reads transforms statically (see "Animated values" above), so an element-local check
passes exactly the case that breaks. Rotation is refused on the same chain and for a related reason:
the emitted rect is axis-aligned, so a rotated hole declares its BOUNDING BOX and the live picture
shows outside the frame the author drew.

### The v2 path, recorded as a SHAPE rather than as a plan

**Animating a Live Source is possible in principle, and the blocker is not the command.**
`MIXER FILL` accepts a **tween and a duration** — the plant's client exposes the full easing
vocabulary against exactly the tools that matter (`docs/recon/ciab-client-tools.json`: the
`Transform` entry — the client's name for `MIXER FILL` — and the `Clipping` entry — its name for
`MIXER CLIP` — each carry a `Tween` combo of 44 easings, `Linear` through `EaseOutInBounce`, beside
a `Duration`). So the server can move a live box smoothly, and a naive reading says "emit a tween
per keyframe segment and it is done".

🔴 **The hard part is the SYNC, and nothing today reconciles it.** The template's HTML animates on
**its own clock** — `requestAnimationFrame` inside CEF, driven by the scene's frame rate and started
when the page plays — while the `MIXER` tween runs on the **server's** clock, started when the
command lands. Two independent timelines, no shared origin, no shared tick, and no feedback from
either to the other. A 500 ms move that begins 40 ms late, or that eases on a different curve than
the CSS did, produces exactly the failure v1 refuses outright: the hole and the picture separate,
and a guest slides out from behind their own frame — worse for being intermittent.

**What a later phase would have to solve, then, is not "can we tween" but:** what establishes a
common time origin between a CEF page and the AMCP connection; what bounds the drift between them
over the length of a move; and what happens on the frame where they disagree. Per-frame `MIXER FILL`
emission at the channel frame rate is the brute-force alternative and has its own cost (a command
per frame per plate on a shared socket). Recorded here so the next reader starts from the real
problem instead of rediscovering that the tween exists.

⚠ The easing lists cited above are from the CLIENT's tool definitions, whose `Mixers` folder tracks
AMCP's `MIXER` surface — but the file describes a MODIFIED client of unknown vintage, so the
vocabulary is a lead to verify on the server, not a settled server capability.

---

## 7. ⭐ The on-air audio cluster — one rule

R-029, R-042 and Live Source audio are one problem. The evidence:

- **`CG ADD` has exactly one construction site** (`command-builder.ts:56-58`) and one emit
  chokepoint, `#sendAdd` (`caspar-runtime.ts:3644`, sending at `:3693-3697`). It has **four**
  callers: `#loadOnto` (`:1121`), `#decidePendingRestores` (`:1394`), `setPosition` (`:1436`), and
  `take()`'s pre-roll (`:1550`). **Only `take()` is rehearse-guarded** (`:1527`).
- **The `load()` gap is live.** `#loadOnto` is reached from `loadFixed` with `listOnly = true`
  (`:1013`) — which emits nothing — and from the dynamic `load()` at `:897` with `listOnly`
  **unset**, which emits. `#loadOnto` has no rehearse guard of its own.
  `SEARCH:` `git --no-pager grep -n "#rehearsing" -- tools/caspar-bridge/src/caspar-runtime.ts` → the only reads are `take()`'s at `:1527` and `enterRehearse`'s idempotence check at `:1673`. None is inside `#loadOnto`.
  The renderer is fenced (`apps/runtime/tests/dynamicLoadUnreachable.test.ts:45-54` scans for
  `stack.load(`), but **that test binds the renderer only** — `stack.load` is still a live routed
  channel (`tools/caspar-bridge/src/bridge.ts:516-518`) reachable by any WebSocket client.
- **Every mute path is keyed on a stack item or the bank range.** All four `mixerVolume` call sites:
  `take()` `:1597-1601` and `enterRehearse` `:1714-1718` and `exitRehearse` `:1794-1801` all resolve
  through `#slots.get(itemId)`; `#reassertDeclaredVolumes` `:1875-1879` walks
  `bank.start … bank.start+count-1`.
  **A Live Source layer is not a stack item, so it can never be a `#slots` value** — which makes the
  first three structurally incapable of touching one.
  `SEARCH:` `git --no-pager grep -rn -e "mixerVolume" -- packages tools apps` → exactly four call sites, all listed above. No other code anywhere sends a `MIXER … VOLUME`.

### DECISION — mute at creation, unmute only by explicit intent

> **Every producer the bridge creates is created muted. Audio is raised only by an explicit,
> recorded intent naming the layer. This applies to Live Source layers and to template layers
> alike.**

For a Live Source layer that means: `playSource` is **immediately followed** by
`MIXER <ch>-<layer> VOLUME 0`, in the same command batch, before the layer can be composited. A live
guest feed carries the guest's live audio; a pre-rolled box must be silent until the take.

Three consequences, each deliberate:

1. **It closes R-042 for Live Sources by construction** — there is no window in which an unmuted
   live producer exists, because the mute is part of creation rather than a follow-up. R-042's
   `mute-before-ADD` for _template_ layers remains its own item; this rule is stated so the two
   cannot diverge.
2. **It requires a per-layer volume ledger.** `INTENDED_VOLUME = 1` is a single global constant
   (`caspar-runtime.ts:117`) whose own comment calls it _"the seam a future per-layer volume feature
   would replace"_. `#liveLayers` (§4) carries the intended volume per record; this is that feature,
   scoped to Live Sources.
3. ⚠ **It constrains the layer range choice.** `#reassertDeclaredVolumes` blankets
   `bank.start … bank.start+count` with `VOLUME 1` once per process, consulting nothing about what
   is on those layers (`:1872-1879`). **Had the Live Source range been carved inside 70–99, that
   walk would have unmuted every live box at first reachability, with nothing recording it.**
   Choosing 10–59 (§4) avoids it. This is recorded because it is a non-obvious second reason for the
   range choice, and a future move of the range would silently reintroduce it.

### ⭐ What the rule must cover — WIDENED 2026-08-08 (owner, §12.4)

The rule above was written for `playSource`. **It is not a Live Source rule; it is THE rule**, and
the owner's third call makes that explicit: R-029, R-042 and B-121 are closed by this one rule, in
this wave, not by three separate fixes later. So it applies to **both** producer-creating verbs:

| Verb                            | Where the mute goes                                                                                          | Closes               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| `playSource` (new, §5)          | `MIXER … VOLUME 0` **immediately after**, in the same batch, before the layer can be composited              | Live Source audio    |
| `CG ADD` (existing, `#sendAdd`) | `MIXER … VOLUME 0` **BEFORE the ADD**, on the wire, asserted on the trace and not by the absence of an error | **R-029**, **R-042** |

🔴 **The orders differ, and the difference is not cosmetic.** For `playSource` the producer does not
exist until the `PLAY`, so the mute cannot precede it and "same batch, before compositing" is the
strongest available guarantee. For `CG ADD` the mute **must precede the ADD**: a bare `CG ADD` puts
the template's audio on air on 2.5.0 (measured at 0.24 s, `docs/prd/runtime.md` R-029), so
ADD-then-mute is the same leak, just shorter — _"an implementation that gets the order wrong looks
correct in every test that does not listen"_ (R-042). MIXER state is channel state and survives
`CLEAR` / `CG REMOVE` (`command-builder.ts:128-130`), which is what makes a mute-first order legal
at all: the volume can be set on a layer before anything is on it.

**All four `CG ADD` call sites, and what each gets — B-121 is the third row.** `#sendAdd`
(`caspar-runtime.ts:3644`) is the single emit chokepoint, which is why the rule is implementable at
one place; the guard question is nonetheless per-site and is pinned per-site by test:

| #   | site                                         | today                                    | under this rule                                                     |
| --- | -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| 1   | `#loadOnto` (via `loadFixed`) `:1121`        | rehearse-guarded                         | guard stays; the mute makes the guard's job survivable (R-042)      |
| 2   | `#decidePendingRestores` `:1394` — reconnect | **NOT guarded** — a blip re-ADDs unmuted | **B-121:** mute before the re-ADD, or do not ADD                    |
| 3   | `setPosition` `:1436`                        | not guarded, and safe                    | unchanged behaviour; **pinned by test so it stays that way**        |
| 4   | `take()`'s pre-roll `:1550`                  | `take()` refuses `rehearsing` first      | unchanged; `take()` already re-asserts `INTENDED_VOLUME` at `:1597` |

**The unmute half already exists and is deliberately not rebuilt.** `take()` re-asserts
`INTENDED_VOLUME` **unconditionally on every take** (`caspar-runtime.ts:1597-1601`), with a comment
arguing at length why it is in the play path rather than in a rehearse-exit step. That re-assert
**is** the "explicit recorded intent" this rule names. Adding a second unmute path would be the
`B-100`/`P-012` failure — one rule, two spellings.

### ⚠ What this rule does NOT close — stated, not silently widened

**R-029's second acceptance bullet is NOT discharged by a bridge-side mute, and this design does not
attempt it.** That bullet reads: _"WHEN that cued item is then taken (`PLAY`) THEN its audio is
audible, from the start of the audio — containment must not eat the head."_

- A bridge-side mute **contains** the leak for every template regardless of who authored it — that
  is R-029's containment option 2, and it is what this rule adopts.
- It does **not** rewind anything. On 2.5.0 the audio is already running at `CG ADD` (that is the
  defect), so a mute held from ADD to take means the take unmutes **mid-stream**: the head is eaten
  by however long the operator cued ahead.
- Preserving the head needs R-029's option **1** — gating audio on the template's own `play()`
  lifecycle rather than on load — which is a **`@cg/template-runtime` + export-validation** change,
  enforced at export time per R-029's own fourth acceptance bullet. **None of that is in this
  design's scope**, and it is not added here.

So: **R-029's containment is discharged by this wave; R-029's head bullet is not, and R-029 stays
`[~]` carrying exactly that residual.** It is recorded in the item itself, so the next reader does
not read `[~]` as "the audio question is answered". R-042 and B-121 are closed in full — neither
depends on the head.

**Not fixed here, recorded:** `caspar-runtime.ts:1646-1650` still asserts the rehearse mute _"IS the
safety condition … if it does not land, rehearse is REFUSED"_, flatly contradicted by the code ~64
lines below where entry proceeds with `muted: false`. Product code is out of scope for this change;
it is listed in the PR under _Findings to file_.

---

## 8. Testability — the mock must gain three things

`tools/amcp-mock` is what most tests run against, and it **fails silently** for exactly the forms
this feature needs:

- Its whole producer model is `producerFor` (`tools/amcp-mock/src/handlers.ts:100-104`): two
  outcomes, `'html'` or `'ffmpeg'`. `PLAY 1-11 "route://1-10"` returns **`202`** and is recorded as
  **`ffmpeg`**; `PLAY 1-11 DECKLINK DEVICE 1` returns `202` with the device number discarded.
- `LayerState.producer` is `'empty' | 'html' | 'ffmpeg'` (`tools/amcp-mock/src/types.ts:44`), and
  carries **no fill geometry** — only `volume` (`:85`).
- `handleMixer` implements **only** `VOLUME` (`:45-60`); everything else is `400`.

**This violates the mock's own written doctrine** (`handlers.ts:36-38`): _"an unimplemented sub-verb
that silently `202`s would let a wrong command look correct, which is the one thing a mock must
never do."_ `handleMixer` obeys it; `handlePlay` does not — it refuses only on **addressing**
(`401` bad slot `:111`, `404` bad channel `:112`) and then `202`s any producer argument.

**The load-bearing consequence:** a routed Live Source layer reports `ffmpeg`, which is
indistinguishable from a foreign video layer — **the very discriminator §4's ownership work turns
on.** Without the mock changes, none of §4 is testable.

### DECISION — three additions, in this order

1. **Widen the producer union** to include `'route' | 'decklink' | 'ndi'` (`types.ts:44`) and
   replace `producerFor` with a real first-argument classifier. One site; `PLAY` and `LOAD` both
   inherit it.
2. **Make an unrecognised producer form a REFUSAL**, restoring `handlers.ts:36-38`'s doctrine to
   `handlePlay`. Without this a typo reads as success.
3. **Model `MIXER … FILL`** and add fill geometry to `LayerState`, so a test can assert the
   normalized rect the bridge derived — which is the only way §6's arithmetic is checkable offline.

`SEARCH:` `git --no-pager grep -rn -i -e "fill" -e "geometry" -e "transform" -- tools/amcp-mock/src` → no fill/geometry/transform state of any kind. And every existing test needing a foreign kind bypasses AMCP entirely, injecting it on the OSC wire via `MockHandle.emitOsc` (e.g. `tools/caspar-bridge/tests/protect-video-layers.integration.test.ts:153-156`) — which is itself evidence that the AMCP door does not exist.

**A fidelity gap to fix while there:** `producerFor` compares `a.toUpperCase() === 'HTML'`, so
CasparCG's real `[HTML]` tag never matches; every mock-facing test therefore uses a non-CasparCG
argument order. It has never mattered because the bridge only ever emits `CG ADD` — **it starts
mattering the moment §5 makes the bridge emit `PLAY`.**

---

## 9. Rehearse / preview rendering — and the seam that does not exist

### C3 — there is no render-mode seam

D-137 requires SMPTE bars on the canvas and preview, and zero painted pixels in export. **The code
has no seam to hang that on.** `buildScene(scene, doc)` takes **no mode argument**
(`packages/template-runtime/src/scene-builder.ts:81`), and its only production caller is
`createRuntime` (`packages/template-runtime/src/runtime.ts:420`), which every surface boots. The
Designer canvas's "authoring" difference is achieved entirely by **CSS injected into the page**
(`apps/designer/src/platform/preview.ts:66,110,131-164`), never by a builder flag.

Worse, the surfaces receive **different scenes**: the canvas gets `editSceneOf`, while the Preview
modal gets the **export-scoped, off-frame-filtered** scene
(`apps/designer/src/renderer/features/compositions/CompositionActionBar.tsx:44-52` →
`apps/designer/src/renderer/state/scene-doc.ts:158-170`). D-137 treats "the canvas or Designer
preview" as one bucket opposite export; the code splits three ways.

**DECISION:** add an explicit `mode: 'author' | 'output'` to `RuntimeBootOptions`
(`runtime.ts:394`), threaded to `buildScene`. Every boot site names its mode: the canvas and the
Preview modal pass `'author'`; `packages/single-file-export/src/exporter-single-file.ts:429` and the
`.vcg` boot (`apps/designer/src/platform/Exporter.ts:636-649`) pass `'output'`.

**The mode is an ENUM, not a boolean, and that is deliberate — DECIDED 2026-08-08 (§12.2).** v1 has
exactly two modes and a boolean would carry them. It is an enum so a third — `'rehearse'` — can be
added later **without reopening §12.2's decision**, which is that rehearse shows an empty
transparent region in PVW and no second render path is built now.

Stated precisely, because the seam alone is not the whole of it: rehearse renders the **retained
exported page verbatim** (`RehearsalFrame.tsx:236`, `srcDoc={html}`), and that page was built in
`'output'` mode at export time. So adding `'rehearse'` later means either a third exported artifact
or a boot mode the retained page can be told at load — and this seam is the one named point where
that choice lands, instead of an argument about what "preview" means spread across three surfaces.
§1's rejected option D (a `<script type="application/json">` block) is retained as the carrier that
would then already exist. **v1 builds neither.** Both are kept cheap so the decision can be
revisited as a feature rather than as a redesign.

**Rejected: CSS-only bars** (matching how the canvas already differs). The bars would then ship
inside both exports' stylesheet and be one selector away from painting on air — for an element whose
entire contract is that it paints nothing. A mode the exporters _declare_ is auditable; a mode
inferred from which stylesheet won is not.

### The zone-css hazard, closed at the same time

`packages/template-runtime/src/zone-css.ts:159-169` gives `video-placeholder` a `background-color`
zone slot, compiled into an `!important` rule shipped by both exporters (`:330-332`). Fallback is
`transparent`, so it is inert until opted into — and `zoneOverrides` is reachable from no UI
(`SEARCH:` `git --no-pager grep -rn "zoneOverrides" -- apps/designer/src` → **0 hits**) — but it is
representable in a hand-edited scene. In `'output'` mode a Live Source is excluded from zone
compilation, so the hole cannot be filled.

### C8 — out-of-frame silently deletes, it does not warn

D-137 says out-of-frame **warns** (`designer.md:3590-3591`). The shipped behaviour is the opposite:
`dropFullyOffFrameForExport` **removes** fully-off-frame static elements from both exports and from
the Preview modal (`apps/designer/src/renderer/state/off-frame.ts:186-197`, reached from
`scene-doc.ts:170`, the one function `CompositionActionBar.tsx:46` calls). A Live Source dragged
fully off-frame would vanish from the `.vcg` with no message — **and its declaration with it**, so
the bridge would place nothing and say nothing.

**DECISION:** a Live Source is **exempt from the off-frame drop** and is instead a preflight
**error**. An element that is a contract with the runtime must never be silently removed from the
artifact that carries the contract.

---

## 9a. 🔴 THE BACKDROP PUNCH — "paints nothing" is necessary and NOT sufficient

**FOUND 2026-08-10 (owner), and MEASURED before being written down.** The client's main scenario is a
multi-box layout, and those layouts normally carry a **designed OPAQUE BACKDROP** behind the boxes.
This design had no answer for that, and as it stands the backdrop covers every live source.

### Why the gap exists

The whole HTML page is **ONE CasparCG layer**, sitting above the Live Source layers. Inside that
page the backdrop is an ordinary element beneath the plates. §9's `mode` seam makes a Live Source
paint **zero pixels** in `'output'` — but **painting nothing is not the same as ERASING what is
beneath it in the same page.** The backdrop therefore survives at the plate's rect, opaque, and the
live picture composited on the layer BELOW is never seen.

### The measurement, not the inference

`buildScene` was run in `'output'` mode over a scene holding an opaque full-frame rectangle
(`#123456`) with a Live Source above it, and the built DOM inspected:

```
backdropPresent      true          backdropBackground   #123456
platePresent         true          plateBackground      (none)
plateBackgroundImage (none)        plateMixBlendMode    (none)
plateMask            (none)        plateClipPath        (none)
plateIsolation       (none)        plateChildCount      0
anyDestinationOut    false         anyMaskAnywhere      false

<div data-cg-element-id="live-a" data-cg-placeholder-for="video-placeholder"
     data-cg-live-source="guest-1" class="cg-element"
     style="left: 100px; top: 200px; width: 640px; height: 360px;
            opacity: 1; transform-origin: 0% 0%;"></div>
```

**The plate is an EMPTY, GEOMETRY-ONLY `<div>`.** It paints nothing and it erases nothing, and
nothing anywhere in the built page carries a `destination-out`, a mask or a clip-path. The gap is
real. (The probe was a throwaway test; it was **deleted** in the commit that recorded this, rather
than left behind as a test that the fix would have to delete — see the tasks below.)

### The requirement, stated plainly

> In `'output'` mode a Live Source SHALL make the page **TRANSPARENT over its own rect**, erasing
> whatever the template painted beneath it, so the live layer below the CasparCG layer is visible.

`tasks.md` **1.5 is restated accordingly**: "zero painted pixels" was necessary and is not
sufficient. This stays consistent with the box-shadow amendment already recorded — the **HOLE** is
transparent; the element may still paint **OUTSIDE** its own rect.

### Two candidate mechanisms — recorded with trade-offs, NEITHER chosen

**Neither is picked on reasoning.** The choice waits on the measurement below.

| Mechanism                                          | For                                                                                                                                                             | Against                                                                                                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`mix-blend-mode: destination-out` on the plate** | Element-local; no coupling to the backdrop at all. The erase follows the element's OWN box, so a `border-radius` on the plate produces a ROUNDED hole for free. | **Scope.** It erases within its stacking / isolation group, and what reaches the PAGE's root alpha depends on the isolation above it. That interaction is precisely the thing to measure, not to reason about. |
| **Masking the BACKDROP with the plate rects**      | Predictable, and easy to reason about locally.                                                                                                                  | **Couples the backdrop to the plates** — the backdrop must know where every plate is — and that coupling has to be recomputed whenever a plate moves.                                                          |

### 🔴 The recon, and it must run on the RIGHT browser

**Measure on the CEF inside the plant's CasparCG 2.3.2 — NOT on desktop Chrome.** `B-066` is exactly
this class of mistake: a root `tsconfig` `es2022` setting that `SyntaxError`d on CEF 71 while every
local check passed. Blend modes, isolation and root-alpha behaviour are the same kind of thing —
they work everywhere we develop and are a question mark on a Chromium-71 baseline compositing to an
SDI consumer.

**What must be shown:** the chosen mechanism produces REAL TRANSPARENCY in the **exported
single-file page**, under that CEF, with the live layer visible behind it. **Record the measurement,
not the expectation.** Until it is run, no mechanism is chosen — that is the whole point of listing
two.

### 9a.1 ⭐ AMENDED 2026-08-10 — the plate gains a STROKE, and it CONSTRAINS the punch

**DECIDED 2026-08-10 (owner).** A Live Source may carry a **stroke (colour + width)**. It is the same
class as the box-shadow already allowed — paint on the TEMPLATE layer, OUTSIDE the hole, live picture
untouched — and a coloured frame around each guest box is what a multi-box design actually wants.

This is recorded INSIDE §9a rather than beside it because it **narrows which punch mechanism can be
chosen**, and §9a was written before the stroke was asked for.

⚠ **Note what §9a's own measurement established:** the plate is an EMPTY, GEOMETRY-ONLY `<div>` that
paints nothing at all. **A stroke would be the first thing it ever paints**, which is exactly why the
interaction below is not hypothetical.

#### The element, as amended

```
video-placeholder = {
  routeKey: LiveSourceId,          // ONE symbolic id (§1a)
  keySourceId?: LiveSourceId,      // DEPRECATED (§1a) — parsed, never written
  expectedAspect?: number,         // the author's ASSERTION (§3)
  posterAssetId?: Id,
  stroke?: { width, color, dash? },  // NEW — paints OUTSIDE the hole
  // shadow: already allowed by the box-shadow amendment, same rule
}
```

#### Constraint 1 — the stroke sits OUTSIDE the hole; the declared rect IS the transparent area

A stroke drawn ON or INSIDE the edge covers part of the live picture, so the visible area becomes
**smaller than the rect `collectLiveSources` declared** — and §3's crop-to-fill would then be computed
for an area that is partly hidden. The author would be cropping a face to fit a box, part of which is
under their own frame.

**What already exists, checked rather than assumed.** There IS a stroke model:
`StrokeSchema = { width, color, dash? }` (`packages/shared-schema/src/primitives.ts:117-121`), shared
through `BoxStyleSchema` by shape / text / ticker / clock / sequence, and separately by `path`.
🔴 **It has NO alignment notion — no inside / centre / outside anywhere.**

**And it does not need one here.** Box kinds render a stroke as a CSS **`border`**
(`scene-builder.ts:1133-1135`: `el.style.border = '<w>px <solid|dashed> <color>'`), and there is **no
`box-sizing` reset anywhere in `@cg/template-runtime`** — so the CSS default `content-box` applies and
the border is painted **OUTSIDE** the declared `width`/`height`. The declared rect stays the content
box, which is exactly what `collectLiveSources` reads (`transform.size`).

**So: this element REUSES `StrokeSchema` unchanged and takes the OUTSIDE behaviour the existing
renderer already produces. No alignment field is invented, and no second stroke concept appears.** If
a later change adds an alignment notion for shapes, a Live Source offers only `outside` — for the
reason above, not as a limitation of the control.

#### Constraint 2 — 🔴 THE PUNCH MUST NOT ERASE WHAT THE ELEMENT PAINTS OUTSIDE ITS HOLE

**A REQUIREMENT ON THE MECHANISM, not a footnote.** An erase driven by the element's OWN PAINTED
ALPHA — which is precisely what `mix-blend-mode: destination-out` is — would erase the element's own
stroke along with everything else, and **nothing would be visible**: no frame, and a hole that ate the
thing meant to outline it.

> **The punch SHALL be scoped to the HOLE'S FILL AREA. The stroke and the shadow SHALL survive it.**

**The two candidates are NOT symmetric about this, and that asymmetry is now part of the choice:**

| Mechanism                                          | Behaviour under constraint 2                                                                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Masking the BACKDROP with the plate rects**      | **Cannot** erase the plate's own paint — the plate is not the eraser. The stroke survives by construction.                                                                                                                                                |
| **`mix-blend-mode: destination-out` on the plate** | **Must be scoped deliberately** to avoid eating its own stroke — e.g. the erase carried by an inner fill node while the stroke is painted by an outer one. Buildable, but it is now a thing the mechanism has to get right rather than a property it has. |

#### The measurement plan, EXTENDED

§9a's CEF measurement must now demonstrate **BOTH**:

1. real transparency over the hole, with the live layer visible behind it; **and**
2. **an INTACT stroke and shadow around it.**

**A mechanism that punches correctly and eats its own stroke passes the old criterion and fails the
feature.** Criterion 2 is not a refinement of criterion 1 — it is a second, independent way to fail.

**The measurement has NOT been run and NO mechanism has been chosen** (§9a records both candidates
precisely because the choice waits on it), so there is no settled decision to re-open here. This
constraint arrives BEFORE the choice, which is the order that costs nothing.

#### Two consequences, recorded where they will be looked for

- **A rounded hole and a stroke must round TOGETHER**, or the frame will not follow the picture — see
  the border-radius note below, which this qualifies.
- **Neither stroke nor shadow enters the hole rect**, so neither affects `collectLiveSources`'
  geometry nor task 1.8's OVERLAP check. **Two plates whose strokes or shadows overlap is not a
  fault; two plates whose HOLES overlap is.** The overlap check reads the declared rect and must keep
  reading only that.

### The consequence for BORDER RADIUS, recorded so the Inspector work can be revisited

The Inspector currently offers **no `border-radius`** on a Live Source (a `video-placeholder` is a
"bare" kind in `field-registry.ts` and never carried `BOX_DESCS`). Recorded here because the reason
matters and would otherwise be lost:

- **Once a punch mechanism exists, `border-radius` becomes MEANINGFUL AND HONEST in the multi-box
  case** — the CSS hole rounds, and the live rectangle's square corners are covered by the backdrop
  that is being punched. The author gets exactly what they drew.
- **The earlier framing — "rounding is impossible" — was reasoning about the LONE-PLATE case:** a
  plate over the programme feed with NOTHING opaque behind it. There, the corners have nothing to
  hide them, and `MIXER FILL`/`CLIP` are rectangular, so a rounded plate floating over the programme
  **stays unachievable in v1 either way.**

Both cases are real; they are simply different, and the multi-box one is what the client authors.
So the control is withheld pending the mechanism, not because the idea is wrong.

⚠ **And when it lands, the HOLE and the STROKE must round TOGETHER** (§9a.1): a rounded hole inside a
square frame — or the reverse — is worse than either alone, because the frame stops following the
picture it is drawn around.

---

## 9b. ⭐ PROPOSED 2026-08-10 (owner) — THE MULTI-BOX ON A CHANNEL OF ITS OWN

**STATUS — EVALUATED AND RECOMMENDED IN PRINCIPLE; NOT ADOPTED.** It is an **operating model this
design does not have**, and it is gated on four measurements plus one owner question, all recorded in
**§12.5**. **No task's status or scope changes on the strength of this section**, and in particular
**§9a's punch work is NOT weakened by the fallback in 9b.5** — a fallback is insurance, not a
decision.

### The model

The whole composition — backdrop, frames, every live plate — is built on a **CasparCG channel of its
own**, separate from the channel carrying the playlist, and is **visible there before anything
reaches air**. When the multi-box is wanted on air the operator switches to it and pauses the
playlist; when the connection ends, air returns to the playlist.

**It moves WHERE the layers live. It does not change WHAT the bridge sends** — see 9b.6.

### 9b.1 Isolation, which is the real prize — a structural answer to C-023

C-023 (`docs/prd/caspar.md:934-983`) wants a periodically-refreshed still per live source so the
operator can confirm a feed before it is needed. Its second shaping constraint (`:958-963`) is the
hard one: producing a picture means **PLAYING the source somewhere**, doing that on the air channel
risks putting it on air, so it needs **a channel with no air-carrying consumer** — and whether this
installation has or can gain one is recorded there as an OPEN recon question, deliberately not
assumed.

**This model supplies exactly that channel.** It also supplies something C-023 did not ask for and
would rather have: the operator sees **the ASSEMBLED result** — every plate in its real geometry,
inside its real frame, over the real backdrop — instead of four separate stills that are each
correct and say nothing about the composition.

🔴 **One sharpening, because the guarantee is TEMPORAL and reads as structural.** Under the air path
recommended in 9b.4 the dedicated channel never gains a consumer of its own — air is always taken
from the playlist channel — so "no air-carrying consumer" holds **permanently, in the config**. But
while the air route is UP, that channel's picture **is on air by reference**, and playing a source
there to grab a thumbnail puts it on air exactly as a consumer would.

> The isolation C-023 needs is **the route being DOWN**, not the channel being consumer-less.

So a probing grab is free while the multi-box is off air and is a **live picture change** while it is
on. That is a constraint on C-023's mechanism, not an objection to this model — but C-023 must not be
closed by pointing at this channel and stopping there.

### 9b.2 The feedback trap — moot in one direction, MANDATORY in the other

**What is in this repo, checked rather than assumed. `A3`'s analysis is NOT in this repo at this
commit.**
`SEARCH:` `git --no-pager grep -rn -i -e "feedback loop" -e "route.*same channel" -e "loop back" -- openspec docs`
→ 5 hits, all unrelated (a drag-origin note at `docs/prd/bugs-designer.md:525`, a timeline loop in
two specs, a pixel-grid note in an archived change). This section therefore states the structural
fact itself and names A3 for when it lands; it does **not** summarise a document it cannot read.

**The fact.** Routing a channel into a layer of THAT SAME channel is a loop — the channel's program
mix would contain a producer reading the channel's program mix. The address form that avoids it is
the **channel-and-layer** one, and this design already carries it: §2's producer union gives `route`
an optional `layer` because the measured grammar `route://(?<CHANNEL>\d+)(-(?<LAYER>\d+))?` makes it
optional (`design.md:200-202`), and §0b measured `PLAY 1-2 "route://1-1"` rendering layer 1's picture
on layer 2 with no runaway (`design.md:344`).

**Between two DIFFERENT channels there is no loop — in ONE direction.** A studio plate on the
dedicated channel showing the playlist becomes a plain `route://<playlist channel>`, and A3's
workaround is unnecessary **for that leg**.

🔴 **But 9b.4's recommended air path supplies the OTHER leg, and the two legs form a CYCLE.** The
playlist channel carries `route://<dedicated>` full-frame — that is how the multi-box reaches air —
while the dedicated channel carries `route://<playlist>` inside the studio plate. Substitute one into
the other and the studio plate shows a picture that contains the studio plate: a **mirror tunnel**,
one frame deeper per hop. It is the exact trap A3 named, displaced one channel outward, and it is
reachable only by combining two decisions that are individually sound.

**The mitigation is A3's own workaround, resurrected.** Address the studio plate at the playlist's
own video **LAYER** — `route://<playlist channel>-<playlist layer>` — so it reads that layer and not
the mix that carries the air route back. §0b's `route://1-1` result is evidence that the layer-scoped
form reads a layer rather than a mix; **the cycle itself has not been run**, so it is filed as
measurement **M4** in §12.5.

Two consequences, stated plainly:

- **Do not delete A3's analysis.** It governs the single-channel installation unchanged — and under
  the recommended air path it governs the studio plate here too.
- **The air path and the studio plate are COUPLED.** Under the TriCaster-switching path (9b.4,
  rejected) the playlist channel carries no route back and no cycle exists. Choosing the air path
  that touches nothing in the plant is what re-imports the workaround. That is a real cost of the
  recommendation, and it is still by far the cheaper side.

### 9b.3 Layer pressure ends — for the plates. The code is not there yet, and one layer never moves.

**The claim.** On a dedicated channel there is no playout-owned reserved range to fence against, so
§4's three-class ownership model degenerates to "everything here is ours". **True of the PLANT. Not
true of the CODE, and not true of the whole model.** Three measured qualifications:

1. **The reserved fence has NO channel dimension.** `ReservedLayersSchema` is `{ ranges: [{from,to}] }`
   — layer numbers only (`packages/shared-ipc/src/channels/fixedLayers.ts:177-188`), flattened to a
   bare list by `reservedLayerNumbers` (`:190-197`) — and `LayerManager` documents the fence as
   applying on **EVERY channel** (`packages/caspar-client/src/layers/layer-manager.ts:82-90`, and
   `:165`: _"channel-agnostic fence"_). Declaring the multi-box on another channel therefore does
   **not** free 60–69 there; the fence follows the NUMBER. Either it gains a channel dimension, or
   the dedicated channel simply avoids those numbers — which costs nothing, since 10–59 and 70–99
   are both free there. The point is that "everything here is ours" is a statement about the plant
   that the code does not make.
2. **"Ours" is an installation claim, and this plant runs SEVERAL Runtime stations against one
   CasparCG** (§3b, R-021's own rationale). A second station taking the same channel breaks the claim
   exactly as a playout graphic would. The dedicated channel must therefore be **declared config,
   validated for disjointness** by the same machinery as the bank and the reserved range (§4's _"The
   Live Source range is declared config"_) — never assumed by being "the other channel".
3. **The bridge knows exactly ONE channel today.** `#declaredChannels()` returns
   `[this.#fixedBank?.channel ?? DEFAULT_CHANNEL]` — a one-element array
   (`tools/caspar-bridge/src/caspar-runtime.ts:3288-3290`). The plural is in the signature, not in the
   content, and both R-030's per-channel mode read (`:2374-2379`) and the channel-settings hydrate
   (`:606`) iterate it. A second channel is a small, bounded change at a place already shaped for it
   — but **it is not free configuration**, which is how "the channel number becomes configuration"
   will otherwise be read.

🔴 **And ONE layer does not move.** Under 9b.4's air path a bridge-owned, non-html, full-frame
`route://<dedicated>` layer lives on the **playlist** channel — a Live Source layer in everything but
name, on the shared channel, subject to every door §4 is about: the R-009 sweep, the C-014
quarantine, the R-015 refusal. **§4's three-class model is needed regardless**, and it is needed for
the single most consequential layer in the model — the one covering the entire frame.

⚠ **Its layer NUMBER is a consequence to resolve, not a detail.** It must sit **above** the playlist
picture in order to cover it, and playout owns 60–69, so it cannot live in the 10–59 band §4 chose —
that band is deliberately BELOW the template. It lands in or above 70–99, which is the fixed operator
bank's territory. Recorded here; not decided.

**The code must still support the single-channel case.** This is configuration, not a replacement: an
installation with one channel gets today's model unchanged, and §4 is what makes that possible.

### 9b.4 🔴 THE ONE REAL DECISION — how the dedicated channel reaches air

| Route                                                                                                                                                                | What it requires                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **The TriCaster switches between two iVGA inputs**, one per channel                                                                                                  | a **second air-carrying consumer** on the playout box, a second TriCaster input, and **a change to the plant's air path** |
| **The playlist channel routes the dedicated channel over itself** — `route://<dedicated>` full-frame on a layer above the playlist, cleared when the connection ends | one bridge-owned layer on a channel this system already addresses. **No change to the plant's air path.**                 |

> **RECOMMENDED: the second — the playlist channel routes the dedicated channel over itself.**

**The reason is C-020, and it is not a preference.** `docs/prd/caspar.md:775-826` establishes that
this plant's **entire picture** reaches air over `<newtek-ivga />` into a TriCaster — the production
config declares `<system-audio />` + `<newtek-ivga />` + `<screen />` and there is no Decklink card
(`:803-806`) — that **2.4.0 removed the iVGA consumer** and 2.5.0 inherits the removal, that
`Processing.AirSend.x64.dll` is **absent** from the 2.5.0 install, and that starting 2.5.0 against
today's config stops output **entirely: the whole picture, not just audio**. C-020 is `high`,
**deferred** pending the playout integration, and it **BLOCKS C-018**. The air path is the most
fragile thing in this installation and it already carries an open, deferred, blocking debt.

A model that needs a **second** air-carrying consumer adds to exactly that debt, on exactly that
path, and buys a failure mode it does not need. The route-over-itself model touches none of it:

- **air stays on the playlist channel permanently** — one consumer, unchanged, the one running today;
- **the switch is a LAYER that arrives and leaves** — which is a thing this system already does
  safely and per-layer by construction (§5, `caspar-runtime.ts:2718-2724`);
- **it degrades to the playlist.** If the route layer never arrives, or is cleared early, air is the
  playlist — which is what air is anyway. The TriCaster path's equivalent failure is a switcher input
  showing an unbuilt or black channel.

**The consequence for the playlist — an OPERATING INSTRUCTION, not a feature.** With the route
covering it, **pausing the playlist is the OPERATOR'S action in CIAB**, not something this system
does. CIAB owns the programme bed and keeps that role: C-002 (`docs/prd/caspar.md:52-58`) records
that a rundown inside this Runtime was considered and **rejected**, precisely because _"two
applications each believing they own the channel is worse for the operator than two with clear
roles"_. This system must not reach for the playlist transport to tidy up a covered playlist.

**But it matters, and it belongs where an operator will read it: a playlist left running returns
MID-ITEM.** The route HIDES the playlist, it does not pause it. When the connection ends and the
layer is cleared, air cuts to wherever the playlist has got to by then.

### 9b.5 A fallback for §9a's punch — recorded because §9a has none

On a dedicated channel the backdrop can be moved **OUT of the template**, onto a CasparCG layer
**BELOW** the live sources. Then **no punch is needed at all** — the backdrop is under the plates,
not over them, and the template layer above carries only what paints outside the holes.

**Two things it dissolves, and they are the two §9a is stuck on:**

- **The requirement itself.** §9a's punch exists because the page is ONE layer and painting nothing
  is not erasing (`design.md:1138-1142`). With nothing opaque above the live layer, there is nothing
  to erase.
- **§9a.1's constraint 2 becomes free.** The stroke and shadow live on the template layer above and
  can never be eaten, because no erase runs — the asymmetry between the two candidate mechanisms
  (`design.md:1257-1262`) stops mattering.

**Why it is WORSE as a primary design** — the owner's own objection, and it is the right one: **two
artifacts to coordinate instead of one.** The backdrop's geometry and the holes' geometry would live
in two places that can drift, and the export would have to emit a backdrop artifact CasparCG can play
— which `proposal.md` currently rules out (_"No `.vcg` format change is required"_).

⚠ **It is not exclusive to a dedicated channel.** A backdrop layer below the plates is placeable on
one channel too. What the dedicated channel adds is that covering everything beneath is **harmless
there**; on the playlist channel a full-frame opaque backdrop also covers the playlist picture, which
is a different decision rather than a free one.

🔴 **This changes NOTHING about §9a's tasks today.** The fallback is what happens **IF the CEF
measurement in §9a shows that `destination-out` does not work under CEF 71** — §9a has no fallback,
that is a real gap, and this closes it. It is **not** a reason to defer, narrow or soften either the
measurement or the punch work: the single-channel installation has no dedicated channel to fall back
to, and the mechanism choice is owed either way.

### 9b.6 What this model does NOT change — so nobody reads it as a redesign

| Unaffected                                                                 | Why                                                                                                                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The source stores and their CG Control surfaces** (§2, phase 4 — landed) | they define what lives exist and which of them each plate uses. Which channel a producer is PLAYED on is in neither of them.                                         |
| **The scene-px → `FILL` / `CLIP` arithmetic** (§6, phase 6)                | `FILL` normalizes per axis against **the channel raster it runs on** (§0b, fact 1). Run it on the dedicated channel and it uses that raster; the chain is identical. |
| **The born-muted audio rule** (§7, task 6.5)                               | it is a property of how a producer is CREATED, on whatever channel it is created.                                                                                    |
| **The on-air plate swap** (`R-048`, tasks 6.9–6.9f)                        | it replaces a producer on a layer.                                                                                                                                   |

**The channel number becomes configuration; none of the logic moves.** The precedent exists already:
`FixedLayerBankSchema` carries `channel` (`packages/shared-ipc/src/channels/fixedLayers.ts:45-47`)
with `DEFAULT_FIXED_BANK_CHANNEL = 1` (`:31`), and every verb in §5 is layer-scoped through
`target(slot)` where a slot is `{ channel, layer }` — so a different channel is a different slot
VALUE, not a different code path.

⚠ **One earlier note reads like a contradiction and is not.** `tasks.md` §7a records, from the same
2026-08-10 session, that _"a second output channel this Runtime alone would drive … does not exist
today and justifies nothing now"_ — C-002 carries it in full (`docs/prd/caspar.md:60-62`). That note
is about a second channel **driven to its own consumer** (a studio monitor, a video wall, a stream)
being used as motivation for a feature. **This is not that:** under 9b.4 the dedicated channel has no
consumer of its own, and its picture returns to the playlist channel. C-002's note ends _"if such a
channel ever appears, this note is where to start"_ — both places now point here.

### 9b.7 What must be measured before any of this is adopted

Three measurements the owner named, a fourth this evaluation adds (the cycle, 9b.2), and one owner
question — **all in §12.5**. None is guessable, all run on the plant's CasparCG **2.3.2**, and **no
task moves until they land.**

---

## 10. Phasing — each phase landable and verifiable without capture hardware

Only `route://` is provable on a dev machine (`route` needs no card; DECLINK has no card in this
plant per C-020, and NDI is module-gated). Every phase below is verifiable with a looping media file
plus two `route://` producers.

| Phase                                    | Content                                                                                                                         | Verifiable how                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **1 — Schema + authoring**               | additive schema fields, the id refinement (§3), the creation path (C2), SMPTE bars behind the §9 mode seam, preflight codes     | unit + Designer E2E; no bridge                                 |
| **2 — Declaration + carrier**            | `collectLiveSources`, `resolution` + `liveSources` on `TemplateInfo`, the ledger type, the `reservedLayers` comment corrections | unit + integration against the mock                            |
| **3 — Mock**                             | §8's three additions                                                                                                            | the mock's own suite; **blocks phase 4**                       |
| **4 — Mapping store + settings surface** | `SourceMappingStore`, `sources.*` channel, CG Control modal, boot validation                                                    | integration + DOM tests                                        |
| **5 — Ownership**                        | `#liveLayers`, the three door exemptions, the `live-source` clear reason                                                        | integration against the mock — **only possible after phase 3** |
| **6 — Producer + geometry + audio**      | `playSource` / `mixerFit` / `mixerClear`, the §6 chain, the §7 mute rule                                                        | integration; then the two-box `route://` demo on real hardware |
| **7 — Hardware**                         | fill+key, DECKLINK, NDI                                                                                                         | **cannot be closed on this installation** — see §12.1          |

---

## 11. Contradictions carried by the filed items

Corrected in the PRD as part of this change: **C1** (C-015's migration-cost evidence — the type
appears in **no** living spec and **no** stored scene; `SEARCH:` `git --no-pager grep -rn "video-placeholder" -- openspec/specs` → 0 hits, and a byte-scan of all six tracked `.vcg` archives finds none), **C2** (D-137's "standalone creation unchanged" — there is no creation path to leave unchanged; `SEARCH:` `DesignerTool` at `apps/designer/src/renderer/state/store-core.ts:19-30` lists 11 tools, none of them a Live Source, and `element-defaults.ts` has 13 factories, none for `video-placeholder`), **C5** and **C6** (§4), and **C8** (§9).

**Recorded, not corrected** (out of scope): `DEBT.md:1301-1303`'s `OUTPUT_FRAME` prose is stale —
the constant was renamed `REFERENCE_FRAME` and moved to `packages/template-runtime/src/position.ts:41`
by `3e9bbc9` — but **`DEBT.md` is a frozen evidence archive and must not be edited**. Likewise
`caspar-runtime.ts:1646-1650` (§7) is product code.

---

## 12. Owner decisions

**§12.1 and §12.2 were authored as open questions and are ANSWERED — DECIDED 2026-08-08.** A third
decision (§12.4) was made at the same time. §12.3 remains open on its own terms, and **§12.5 (added
2026-08-10) is open in full** — four measurements and one owner question carried by §9b. They are
recorded here rather than left in the prompt that carried them, because a prompt is ephemeral and the
spec is the memory. **Do not re-open 12.1, 12.2 or 12.4.**

### 12.1 C-015's acceptance on a plant with no Decklink card — DECIDED 2026-08-08

**The question as it was asked.** C-015 makes real-hardware verification part of done
(`docs/prd/caspar.md:405`, and the Notes at `:404`: _"On-air behavior throughout ⇒ real-hardware
verification is part of done."_). But **this plant has no Decklink card** — C-020 records the config
declares `<system-audio />` + `<newtek-ivga />` + `<screen />`, and fill+key reaches air over NewTek
iVGA into a TriCaster (`docs/prd/caspar.md:753-754`). C-020 is itself **deferred** pending that
integration. So the DECKLINK arm can only ever be parse-verified here, and fill+key cannot be
validated at all.

**DECIDED, in the owner's framing: the Designer never names a concrete device, so C-015's
done-condition is about ASSIGNMENT, not about capture hardware.** A template declares **symbolic**
live source ids only (§3, enforced at the schema boundary and again at preflight); binding each id
to a concrete producer happens in **CG Control**, per installation (§2). C-015's acceptance
therefore narrows to two conditions, and **both are dischargeable on this plant**:

- **(a)** for a template declaring N live sources, CG Control can assign **each of them
  individually** to a concrete producer, persisted bridge-side — §2's `SourceMappingStore` plus its
  settings surface (`tasks.md` §4).
- **(b)** the two-box `route://` demo runs on the plant's real CasparCG **2.3.2**, which needs no
  capture card (§10, `tasks.md` 6.8).

**What is split OUT, and where it went.** The DECKLINK and NDI arms are **parse-verified only** on
this installation, and **fill+key cannot be validated here at all**. Those three are filed as their
own item — **C-021** (`docs/prd/caspar.md`), `[!]` blocked on hardware, cross-referenced from C-015
in both directions. They are not deleted from the product; they are moved to the item that can
actually own a hardware debt.

🔴 **The consequence worth stating plainly, because it is what the decision buys: with that split,
phases 1–6 carry NO undischargeable hardware debt.** The two mixer facts the geometry rests on —
`FILL`'s per-axis normalization and `CLIP`'s masking semantics — are confirmed **on 2.3.2** (§3's
cross-build check). What remains un-dischargeable here is exactly DECKLINK, NDI live use, and
fill+key, and that is now C-021's to carry rather than a fog over the whole feature.

### 12.2 The rehearse contradiction (C4) — DECIDED 2026-08-08

**The question as it was asked.**
`apps/runtime/src/renderer/features/monitors/RehearsalStage.tsx:95-96` and
`packages/shared-ipc/src/channels/rehearse.ts:55-56` both stated, in identical words, that _"after
C-015 a Live Source region renders as a labelled placeholder rather than video"_. But rehearse
renders the **retained exported page verbatim** (`RehearsalFrame.tsx:236`, `srcDoc={html}`), and
D-137 requires that page to paint nothing. Either the operator sees an empty transparent region in
PVW, or a separate render path must be built.

**DECIDED — v1 shows an EMPTY, TRANSPARENT region in PVW. No second render path is built now.**
The retained exported page is rendered **verbatim** and paints nothing where a Live Source is —
which is the same thing the template itself puts on air. PVW therefore shows the operator exactly
what the template contributes, and the live box's absence in rehearse is a true statement about the
template rather than a rendering gap: what fills the hole on air is a CasparCG layer the bridge
places, which no browser preview was ever going to show.

Two consequences, both carried out in this change:

1. **The two comments that asserted the opposite are CORRECTED**, in the same wave that records this
   decision. They now say what v1 actually does and name the decision, so the next reader does not
   re-derive a placeholder that was never built.
2. **§9's `mode: 'author' | 'output'` seam stays written so a third `'rehearse'` mode can be added
   later WITHOUT reopening this decision.** The seam is an explicit, declared enum on
   `RuntimeBootOptions` — not a CSS accident and not a boolean — so adding `'rehearse'` is a widening
   at one named point rather than an argument about what preview means. §1's rejected option D (a
   `<script type="application/json">` block parsed bridge-side) is likewise retained as the fallback
   carrier if a separate rehearse render path is ever chosen. **v1 does neither**; both are kept
   cheap so the decision above can be revisited as a feature rather than as a redesign.

### 12.3 Can the true producer aspect be read at run time? — STILL OPEN

§3's **crop-to-fill** uses the assigned source's `aspect`, falling back to `expectedAspect` — an **authored
guess** about a source the author cannot see. Whether CasparCG reports a producer's real raster (via
`INFO <ch>-<layer>` or OSC) is **unknown**, and nothing in this repo records it. If it can, the fit
should use truth, the source's `aspect` becomes the fallback, and `expectedAspect` stays exactly
what §3 makes it: a declaration to validate against. This is a hardware recon question, answerable
with `amcp-poke` in the same session as phase 6. **It blocks nothing** — the fallback chain is
defined without it.

### 12.4 The audio cluster lands inside THIS wave — DECIDED 2026-08-08

`proposal.md` already states that **R-029, R-042 and Live Source audio are one problem, not three**,
and §7 states the rule. The owner's third call makes that operational: **the cluster is not a
follow-up wave — §7's rule is implemented here, and it must discharge all of it.**

Concretely, `tasks.md` 6.5 is widened from "the audio rule" into the rule plus the three items it
closes:

| Item                                    | What it needs from §7's rule                                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-029** (`docs/prd/runtime.md`, high) | the rule must cover the **`CG ADD` path**, not only `playSource` — `CG ADD` with no `PLAY` already produces audio on 2.5.0, so cueing airs the audio.     |
| **R-042** (`docs/prd/runtime.md`)       | **mute BEFORE the ADD**, so LOAD can run during rehearse with no audible leak. Ordering is the whole difficulty; ADD-then-mute is the same leak, shorter. |
| **B-121** (`docs/prd/bugs-runtime.md`)  | `CG ADD` **call site 2**, the reconnect reconciliation, is not rehearse-guarded, so a bridge blip re-ADDs an UNMUTED producer under rehearse.             |

All three flip to `[~]` naming this change dir. §7 carries the rule, the four call sites, and the
one residual the rule does **not** close — see §7's _"What this rule does NOT close"_.

### 12.5 The dedicated-channel multi-box (§9b) — FOUR MEASUREMENTS AND ONE OWNER QUESTION, ALL OPEN

**Recorded 2026-08-10.** §9b evaluates the owner's proposal and recommends it in principle. It is
**not adopted, and nothing moves until these land.** All four measurements run on the plant's
CasparCG **2.3.2** with `node tools/spikes/amcp-poke/amcp-poke.mjs`, none needs a capture card, and
together they are one session's work — pair them, exactly as §3b pairs its own question with R-048's
replace measurement.

#### M1 — does the machine have HEADROOM for a second channel?

A second full HTML-rendering channel is not free: it is a second CEF instance plus that channel's
compositing, at the plant's raster. **Record the CPU/GPU cost MEASURED, not estimated** — baseline
the single-channel plant first, then the two-channel case under the real multi-box template, and
record **dropped/late frames alongside the load**, because a channel that keeps up on average and
drops on peaks is a fail that an average hides.

**What is already known about the box:** CPU **Intel Core i5-10400**, AVX2 present
(`docs/recon/2026-07-28-casparcg-250-validation.md:39-41`); the production channel is **1080i5000**
(`:34-36`). **Its GPU is not recorded anywhere in this repo.**
`SEARCH:` `git --no-pager grep -rn -i -e "gpu" -e "nvidia" -e "graphics card" -- docs/recon docs/prd/caspar.md`
→ **0 hits.** So the GPU half of this question begins by identifying the adapter.

#### M2 — does `route://<channel>` carry AUDIO, or only video?

The guests' audio must reach air, and under 9b.4 this is the path it would travel. **Nothing in this
repo answers it.**
`SEARCH:` `git --no-pager grep -rn -i "route" -- docs/recon` → 5 hits, none about audio (one
`system-audio` note, the `Matrix / Route` VideoHub caveat, two `ciab-client-tools.json` keys, one
export-scoping line).

Measure with a media file that HAS audio, played on the dedicated channel and routed to the playlist
channel, and confirm it **at the air path** — not only as a mixer number. The adjacent fact that
makes this worth care: on **2.3.x**, HTML template audio bypasses the channel mix entirely
(system device only, CasparCG/server#669 — `docs/recon/2026-07-28-casparcg-250-validation.md:265-271`),
which is why C-019 is blocked on C-018. Live source producers are **not** HTML producers, so their
audio should be in the mix on 2.3.2 — the open question is only what the ROUTE producer does with it.

⚠ **It compounds with §7.** The plates are born MUTED and unmuted only by explicit intent, and that
unmute happens on the **dedicated** channel — so a video-only route means an operator unmuting
something that can never be heard.

🔴 **If it carries video only, the model needs an audio answer BEFORE it can be adopted.** Say that,
rather than assuming the audio follows the picture.

#### M3 — must the two channels share a VIDEO FORMAT and FRAME RATE?

If they differ, the route resamples — which costs quality and possibly frames. **Record what the
server actually DOES** when they differ: resample silently, drop/duplicate frames, or refuse the
producer. Not what the format specification implies. R-030 already reads each declared channel's mode
over `INFO` and holds configured-vs-reported (`caspar-runtime.ts:2374-2379`, `#channelSettings`), so
a mismatch has somewhere to surface once the answer is known.

#### M4 — ADDED BY THIS EVALUATION (§9b.2): does the two-channel CYCLE bite, and does the layer-scoped address break it?

With `route://<dedicated>` on the playlist channel (the air path) **and** `route://<playlist>` in the
studio plate, the composition contains itself. Measure both halves:

- **(a) the whole-channel form** — confirm it produces the mirror tunnel rather than something benign;
- **(b) `route://<playlist>-<layer>`** — confirm the layer-scoped form reads that LAYER and not the
  mix that carries the route back. §0b's `PLAY 1-2 "route://1-1"` result suggests it does, but does
  not prove it **for a channel that is itself carrying a route back**.

This is the one measurement that can change the **studio plate's address**, so it belongs before
adoption rather than after.

#### The OWNER QUESTION — is a second channel acceptable in the production config at all, and WHO changes that config?

The production install's config is `D:\programs\CasparCG\casparcg.config`: channel **1080i5000**
(line 13), consumers `<system-audio />` + `<newtek-ivga />` + `<screen />` (lines 15–19), AMCP 5250,
OSC `predefined-client` 127.0.0.1:6250 (`docs/recon/2026-07-28-casparcg-250-validation.md:34-37`).
**Nothing in this repo records a second channel there.**
`SEARCH:` `git --no-pager grep -rn -i -e "second channel" -e "<channel" -- docs/prd/caspar.md docs/recon`
→ 1 hit, unrelated (`INFO` reply richness at `:133`).

Adding a channel means editing that file and restarting CasparCG — **which is this plant's air path**
— so it is planned maintenance, never a live change. And that config sits on the same side of the
integration boundary C-020 is deferred on, which makes "who changes it" a real question rather than a
formality.

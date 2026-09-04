# Design — the surfaces that would not say (RUNTIME-FIX-0904)

## 1. The one question, answered from the code

**Does a row's LOAD reach the wire? No.** The Runtime's only load path is
`fixedLayers.load` (`fixedSlotLoad.ts:36`) → `loadFixed` (`caspar-runtime.ts`) →
`#loadOnto(…, listOnly = true)`, where `reachable = !listOnly && …` is false by construction:
no adopt-`CLEAR`, no `CG ADD`, nothing. The audit's `load … ok` two milliseconds after
`import … ok` is bridge-local. `stack.load` (the dynamic path, which DOES pre-roll) has no
caller in the renderer.

**The take's wire sequence, on a list-only-loaded row** (`#takeImpl`): refusals that touch nothing
(rehearsing / unknown-item / disconnected / exclusivity / looks / seating plan), then
`#sendAdd` — `MIXER <ch>-<layer> VOLUME 0`, then `CG <ch>-<layer> ADD 0 "<url>?cw=…&ch=…" 0
"<data>"` — then `MIXER … VOLUME 1`, then the plate seating (plate rows only), then
`CG … PLAY 0`. `MIXER` never answers 404; so a take that left with `amcp-404` was refused at the
`CG ADD` (a refused `CG PLAY` would need the ADD to have landed first).

**The prediction — "load reaches the wire and sends CG ADD" — FAILED.** The dialog sentence it was
inferred from (_"…show live sources with no graphic over them, while CG ADD still reports
success"_) describes the TAKE-time `CG ADD`, and it is accurate about that command: CasparCG's
`create_cg_producer` accepts any `http:` / `https:` reference without fetching it. The sentence
never said WHEN the ADD is sent; the inference did. No product text needed correcting for it.
One stale comment did — `fixedSlotLoad.ts` still said the chain ends by "pre-roll[ing] it".

## 2. What makes `.114` answer 404 — measured where it could be, handed off where it could not

The bridge's real audit record (readable on this host, which IS the bridge host) shows the same
template on the same layer through the same bridge process **accepted** at `11:35:34Z`
(`load` then `take … ok`, which is a `CG ADD` + `CG PLAY` both `202`) and **refused** at
`11:37:32Z` after a `CLEAR` — the first of fourteen. The bridge did not restart between the two
(the running process dates from `12:18:58Z`; the previous one wrote both rows). No `set-config`
was applied (the connection file dates from 2026-08-24).

CasparCG `69e8ad5` (`cg_proxy.cpp`, `html_producer.cpp`, `AMCPCommandQueue.cpp`, fetched):
`find_record` returns the `.html` record for ANY name ("a hack to allow query params"),
`html::create_cg_producer` returns empty only for a name that is neither a template-folder
file nor `http:`/`https:`-prefixed, `get_or_create_proxy` returns empty only when
`find_record` misses or the factory returns empty, and `cg_add_command` maps that to
`file_not_found` → `404`. **A URL `CG ADD` on that build cannot answer 404 while an html cg
producer is registered.** Reachability of the serve host is therefore NOT the cause (it yields
`202` + no graphic, exactly as the dialog says), and the observed 404 means: **the server
process answering at `192.168.21.114:5250` changed between `11:36:44Z` and `11:37:32Z`, and the
one answering since has no html producer registered.** That is (b) in a specific form — CEF did
not initialise in the current process, or a different build/install was started — and it is a
plant fact only the plant's log can confirm. The measurement handed to the owner is in
`B-214`. Serving on this side was verified: all three templates answer `200` on the live
ephemeral port, and the host firewall allows node.exe inbound on the domain profile.

## 3. Recording the command — one chokepoint, carried out, never contradicting a result

`#send` is the single place every AMCP line passes, so it is the single place the answer can be
paired with the line. On a non-ok answer (or a throw) it returns `command: summarizeWireLine(line)`
beside `errorCode`; each verb's refusal return carries it out; `auditVerdict` copies it. The
summariser keeps the verb, the target and the FIRST quoted argument — for `CG ADD` the URL,
which carries the ephemeral port — and elides later quoted arguments, capped at 200 characters
under the schema's 256. It never throws. A refusal that never reached the wire records no
command: honest absence, pinned by test.

## 4. The audit panel — names primary, ids secondary, and the record untouched

The record on disk is right and stays exactly as it is. What changes is the READING:

- `auditTimeParts(ts, tz?)` → `{ date, time, utc }` via `Intl.DateTimeFormat` in the browser's
  zone; the incident stamp `12:18:47.561Z` renders `15:48:47` in `Asia/Tehran` (pinned). The
  date is a band where it changes down the newest-first list.
- `placeName(slot, bank)` names a bank layer through `layerAlias` / `defaultLayerAlias` — the
  same two functions the table uses — and a layer outside the bank as `layer N (not a row)`.
- `templateName` goes through `templateDisplayName`, so the file name outranks the manifest name
  exactly as on the row.
- `shortId` shows `item-e602d912…` / `f00a5363…`; the full id is the `title` and the copy
  button's payload. The copy confirms locally (icon flips), because a toast renders UNDER a modal.
- The console-name caveat sentence is byte-identical, and a test pins it.

## 5. The refusal that names where — and why the two items were invisible

`templates.remove` now carries `references: { itemId, slot? }[]`; `describeTemplateReferences`
in `@cg/shared-ipc` is the ONE wording for the bridge, the mock and the disconnected library
path. A row is named as the table names it; a layer outside the bank is named as CasparCG names
it, with "not one of this station's rows" said out loud; an item with no layer is said to have
none. Remove All is not mentioned.

The picker renders each reference under the list with its remedy: **Show <row>** closes the
picker and asks the table (`rowFocus.ts`, a subscribe/emit pair like `commandFeedback`) to scroll
to the row's `data-layer`, focus it and select its item; an item NO row shows gets **Remove item**,
confirm-gated, naming its layer and what removal does, issuing `stack.remove` for that one id.

Why were they invisible? The audit trace answers: both items' first entries are `load … failed
wrong-bank` on layer 99, which leaves a slotless `error` item in the reconciler; the browser
retains it; the next resync's `restore()` finds no retained slot and **`#slotForRestore` falls
through to `#allocate()`** — the `custom` policy range, layers 60–69 — so the items came back on
dynamic layers outside every declared bank, held them (`CLEAR ALL` sent `CLEAR 1-60` to the
plant), blocked the deletion, and appeared on no row. Filed as `B-215`; not fixed here (restore
and the refusal path are outside this prompt's boundary).

## 6. The tally — two numbers, two predicates, one file

`State (n)` was `items.filter(isOnAir).length`: STOP ALL's predicate, which counts `error`
because an errored row MAY be showing something and must be offered STOP. Derivation: the
reconciled `status`, i.e. the bridge's ack refined by OSC — not raw intent (a refused take
settles to `error`). So the count was ack-derived, and its defect is specifically that `error`
wore the air colour. Now `airTally` returns `{ onAir, inError }`: `onAir` through
`isOnAirOrUnsettled` (the renderer's one spelling of the R-010 predicate; the Server settings
gate now delegates to it), `inError` for `error` rows that are not pending. The header renders
`(2 on air)` and `(2 in error)` separately, keeps the §4 grey, and STOP ALL keeps `isOnAir`.

## 7. The boot line

`TemplateRegistry.loadPersisted()` already returned `{ loaded, skipped }` and the constructor
discarded it. It is kept as `templateProvenance` (with the directory), surfaced on the
`BridgeHandle` as `templates`, and printed by the CLI beside its siblings:
`templates: 3 loaded from … - 1 skipped as unusable (see the warnings above)`. On this station
that line would read `3 loaded … 1 skipped` today — the skipped file is `delimiters.json`, which
`B-116` already records as living in the wrong directory.

## 8. Boundaries held

No wire behaviour changed: nothing about the refusal path, the mixer, bank fencing or restore.
The plant was not connected to. The `medi2` catalog entry was not renamed (it has a generated id
`src-du5scb`; the name is not a key anywhere — the safe rename is the owner's, from the Sources
dialog). The serve-port default was not changed (`C-032` records the recommendation).

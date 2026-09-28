# channel-templates — design

## §0 — what was there (established before building)

1. **Storage.** `TemplateRegistry` (`tools/caspar-bridge/src/template-registry.ts`) held ONE entry per
   template id — `{ info, html }` — persisted as `templatesDir/<slug>-<12 hex of sha256(id)>.json`
   (`registryRecordFileName`), loaded at boot in `importedAt` order. There was no version: a re-import
   replaced the entry (`Map.set`) and its file. The serve path is the template HTTP server
   (`template-http-server.ts`; ephemeral by default, TCP 7911 in the installed CG Control — the sidecar
   passes it, `apps/runtime/src-tauri/src/sidecar.rs:211`), one route `GET /template/<id>` reading
   `registry.html(id)` per request. A row (stack item) refers to a template
   by `templateId` only; the bridge resolved its info and HTML from the station-wide map at load, take
   (`#sendAdd`), restore and every plate/look read.
2. **Paths.** List/get: `templates.list` / `templates.get` (`read` class). Import: `templates.import`
   (`operator` class; lock `operator-unless-redelivery`), from the picker's `Import a .vcg` / a dropped
   `.vcg` (`importVcgToStation` → `importVcgFile` → `importTemplateFromBytes`), and from the reconnect
   re-delivery (`WebSocketRuntime.#resync`, `redelivery: true`). Remove: `templates.remove`
   (`operator`; lock `operator`), from the picker's row icon. None carried a channel, so
   `channelsForRequest` answered `[]` for all four: the ROLE was checked, the channel grant never.
3. **Re-import.** Rows: kept their `templateId`; their info became the new version at once and their
   next `CG ADD` fetched the new HTML (the on-air page kept the old bytes in CEF, while its serve path
   now served the new ones). Source defaults: the bridge touched none; the CONSOLE's
   `reconcileAssignmentsForImport` dropped the defaults of plates the new version no longer declares,
   on every channel, in one station-wide `sources.set-assignments`. Delete did the same through
   `forgetTemplateAssignments` (every channel's defaults for the template). `sources.set-assignments` is
   `station-admin`, judged since `PLATE-BAND-01` on every channel it changes — hence the refusal
   `PLATE-BAND-01` recorded as found (`R-073`).
4. **In-use gate.** `CasparRuntime.#templateRemoveImpl`: refused `in-use` while ANY reconciler item
   references the template id — any status, any channel, with or without a layer — naming each place
   (`describeTemplateReferences`, `B-212`). The offline twin: `LibraryStore.remove` against the last
   stack; the mock: `MockRuntime.templateRemove`.
5. **Station-wide assumptions.** The Designer has no link to the runtime library. In the console:
   `useTemplateIndex` (rows, Inspector heading, PVW, orphan banner, operator names), the Inspector's own
   `templates.get`, PVW's `templates.html`, the audit panel's names and `LibraryStore` (keyed by id) all
   read one entry per id. The fence census (`station-channel-fence.integration.test.ts`) pinned the
   routes carrying a `channel` key; no `templates.*` route was among them.

## Decisions

1. **A version is its content.** `templateVersionId(info, html)` = 16 hex of sha256 over the info
   (keys sorted) and the HTML. Importing the same package on a second channel produces the same two
   things, so it names the same version and reuses its one file (decision 3). The exporter is
   deterministic (no clock, no randomness in `@cg/single-file-export`), and the file NAME is part of the
   info (`sourceFileName`), so the same file imported twice is one version.
2. **The serve key keeps the wire.** A version is served at `/template/<key>`, where the key is the bare
   template id when no other stored version of that id has it, and `<templateId>~<versionId>`
   otherwise, fixed for the version's life. So a station with one version per template — every station
   on the day of the upgrade, and every re-import that nothing holds (the old version is collected BEFORE
   the new one takes a key) — `CG ADD`s exactly the URL it always did; only a second version alive beside
   the first gets a qualified path. One path segment: the route table (a security boundary,
   `template-server-route-set.test.ts`) is unchanged, and `/template/t1/extra` still 404s.
3. **Holds, pins, collection.** A row HOLDS the version of its last successful `CG ADD` (persisted in the
   index, so a restart cannot orphan a page on air); an ADD in flight PINS its version in memory (a
   re-import mid-take cannot collect the page CasparCG is fetching). A version is removed — memory and
   file — when no list, hold or pin keeps it. A hold is released when the row leaves the stack
   (`item-removed`) or moves to another version at its next ADD. A cleared row keeps its hold until then:
   over-keeping a file is safe, under-keeping would break the hard stop.
4. **Resolution per row.** Every bridge read of a template resolves through the ROW's channel list
   (`getOn(slot.channel, id)`, or `#templateOfItem` for item-keyed reads); a row on no channel reads the
   station-wide entry. A load onto a row whose channel does not list the template is `unknown-template`,
   the existing code; a coordinate that is not a row keeps its old precedence (`not-fixed`).
5. **The wire.** The four template requests gain an optional top-level `channel`. With it: the station
   fence refuses an undeclared channel; the grant and a channel-scoped lock judge an import or a
   removal on that channel alone. Reads are exempt from the GRANT (`channelsForRequest` answers `[]` for
   `templates.list/get`): a read-only channel is still shown and its rows must still be named. Without
   a channel, a write is the station-wide act and is judged on its footprint
   (`templateActionFootprint`: every declared channel for an import, every listing channel for a
   removal, the restore targets for a re-delivery). `templates.changed` keeps its payload (the
   station-wide reading); consumers re-read the channels they show.
6. **Re-delivery.** Each browser record carries the channel it was imported on and is re-delivered there
   (local-wins, as `B-085` decided, on that one channel). A record written before the lists re-delivers
   naming no channel, which RESTORES a template no channel lists and never replaces a version: it cannot
   say whose version it repairs. R-028 part B's tombstones are per channel and stay process-lifetime.
7. **The upgrade.** On the first load with no index, every declared channel lists every stored template
   (newest version per id, import order) — no record moves; the only new file is `template-channels.json`
   (its name is not a record's, `B-116`). With nothing declared (first-run), nothing is collected and the
   copy runs at the first declaration. After the copy, a channel JOINING the set starts empty; a channel
   leaving keeps its list, dormant.
8. **Source defaults.** No template action writes them: `noteAssignmentsCarriedOver` only records the
   notice; the picker's removal writes nothing. A default for a plate that is gone is read by nothing
   (every reader asks for the declared plates).
9. **The console.** The picker lists `templates.list({ channel })` of its destination row, imports with
   that channel, removes with it, counts that channel's rows; the icon is `Remove <name> from CH n`, the
   confirm `Remove “<name>” from CH n?` / `Remove from CH n`. `useTemplateIndex` pulls one list per channel
   its rows name and answers `get(id, channel)` (a one-argument read no longer compiles); the Inspector,
   PVW (`templates.html(id, channel)`) and the operator names read the row's channel. `LibraryStore` keeps
   per-channel records beside the pre-change ones. A pre-change record answers for every channel, so a
   removal naming one channel does not delete it: it is hidden on that channel (`removedOn`, persisted)
   and still answers for every other — CH 1's offline list and CH 1's PVW page are as they were after a
   removal on CH 2. Once a channel has removed it, it is no longer re-delivered (a channel-less restore
   would put it back on that channel too); a removal naming no channel deletes it. The mock mirrors the
   per-channel lists and every picker call; it keeps no browser-local copy, so it has no pre-change
   record.

## What did not change

A take's wire and order (`CG ADD` URL included, for any template with one version), `LOOK-SWITCH-01`,
`FIELD-FIXES-01-A`; per-channel Source defaults and their grant (`R-072`, `R-073`); the removal's
refusal wording and remedies (`B-212`); the served page's contents.

## Open points for the owner

1. **Change channel… (a move).** Decision 5 says a channel added later starts empty. A station that MOVES
   (one bank replaced by another, `R-069`) therefore shows an empty picker on its new channel; the old
   channel's list is kept dormant and comes back if that channel is declared again. Source defaults carry
   over a move (`CHANNEL-SOURCES-01`). Should a move carry the template list too? Not built — the decision
   as written was followed.
2. **The audit row names no channel.** `import` / `template-remove` / `template-redeliver` rows carry the
   template id only; `AuditEntrySchema` has no channel field outside `slot`, and adding one is a persisted
   schema change this prompt did not ask for.
3. **Same-channel re-delivery is still local-wins.** A second browser holding an older copy for the SAME
   channel re-delivers it on reconnect and wins (`B-085`, unchanged; now per channel, so never across
   channels). Recorded, not changed.

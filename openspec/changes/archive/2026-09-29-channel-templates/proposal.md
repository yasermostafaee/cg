# channel-templates — each channel has its own template list (`R-074`)

Prompt: `CHANNEL-TEMPLATES-01` (v1), 2026-09-29. Order: after `PLATE-BAND-01` (`cef4fe1a`; archived at `88110506`).

## Why

`PLATE-BAND-01` reported, as found and not changed: "Delete from station" and re-importing a template rewrite
its Source defaults on every channel, so a station-admin who does not hold one of those channels is refused
that rewrite (`R-073`, "Found, not changed").

The owner's model (2026-09-28): each channel is its own programme, with its own operator who holds only that
channel; a template may be imported on several channels; and each channel's operator must be able to import,
re-import, delete and set defaults for templates on their own channel without holding any other channel.

Today the template library is station-wide — one entry per template id — so a removal and a re-import reach
every channel. That is what changes here. Per-channel Source defaults (`CHANNEL-SOURCES-01`, `R-072`) and the
channel grant on them (`PLATE-BAND-01`, `R-073`) stay exactly as they are.

## What changes

The owner's decisions (2026-09-28):

1. **Each channel has its own template list.** The picker shows the current channel's list only; Import (and a
   dropped `.vcg`) adds to the current channel only; the row's delete icon removes from the current channel
   only.
2. **Re-import updates the current channel only.** Other channels keep their version until they re-import. The
   current channel's Source defaults are kept for every plate that still exists; a default for a plate that is
   gone is ignored, never deleted.
3. **Storage is shared.** One stored file per template version, however many channels list it; importing the
   same `.vcg` on a second channel reuses it. A version's file is removed only when no channel lists it and no
   row holds it.
4. **Every action needs only the current channel in the grant.** Nothing on one channel ever needs another. The
   in-use gate applies per channel.
5. **Nothing disappears at the upgrade.** On first load every declared channel lists every template in today's
   station library. A channel added later starts with an empty list.

Built as:

- **The bridge's store** (`template-registry.ts`) — a per-channel list of `(template, version)` over a shared
  store of versions; a version is its content (a hash of the info and the HTML); a row HOLDS the version its
  page was served from (persisted), and a `CG ADD` in flight PINS it; a version is collected only when no list,
  hold or pin keeps it. The one-time copy runs on the first load that has a channel to copy to.
- **The serve path** — `GET /template/<key>`, where the key is the bare template id for a template with one
  version (every station on the day of the upgrade: the `CG ADD` line is exactly what it was) and
  `<id>~<version>` only for a second version alive beside the first. A version's key never changes. The route
  table (a security boundary) is unchanged.
- **The wire** — `templates.get` / `list` / `import` / `remove` carry an optional top-level `channel`. With it,
  the station fence, the channel grant and a channel-scoped lock judge an import or a removal on exactly that
  channel. A read is judged by no grant (a read-only channel still names its rows). Without a channel, the
  station-wide act it always was, judged on every channel it changes.
- **The console** — the picker lists, imports into and removes from the destination row's channel; the delete
  icon reads `Remove <name> from CH n` and its confirm names the channel; the rows, the Inspector and PVW read a
  row's template from its own channel's list; the reconnect re-delivery names each record's channel.
- **Source defaults** — a template action writes none: re-import keeps them, removal leaves them.

## What does NOT change

- A take's wire, the take order, `LOOK-SWITCH-01`, `FIELD-FIXES-01-A`. A page on air is never touched by a list
  change — not its file, not its serve path.
- Per-channel Source defaults and their grant check (`R-072`, `R-073`); the Source defaults dialog.
- The removal refusal's wording (`B-212`, `describeTemplateReferences`) and its remedies.
- R-028 part B's tombstones stay process-lifetime (now per channel).

## Impact

- `@cg/shared-ipc` `channels/templates.ts` — the four template requests gain an optional `channel`
  (IPC schema). `templates.changed`'s payload is unchanged (the station-wide reading).
- `tools/caspar-bridge` — `template-registry.ts` (rewritten: versions, lists, holds, pins, collection,
  migration; a new sibling file `template-channels.json` in the templates dir — a persisted key),
  `caspar-runtime.ts` (every template read resolves through the row's channel), `bridge.ts` (routes, the
  channel resolver, the lock's re-delivery check).
- `apps/runtime` — the bridge contract, `WebSocketRuntime`, `LibraryStore` (per-channel records), the offline
  mock, the picker, the template index and its readers, the import chain, the source store.

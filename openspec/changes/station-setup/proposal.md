# Station setup: one home for the station's settings, and the channel raster's first UI

## Why

The installation-wide settings of CG Control lived in five separate places, reached from
three surfaces, with no shared shape: the `Server connection` dialog (hosts, ports, the
template serve address, outputs), the `Live sources` dialog, the `Text file delimiters`
dialog, and the `Configure` dialog — which was two dialogs, an editor and an explainer. A
sixth setting, the channel raster (`R-030`), had a bridge channel with every guard and a
persisted file, and **no UI at all**: it could be read (the mismatch banner) and written only
by editing `channel-settings.json` by hand. A seventh — the reserved playout layers and the
live-layer ledger — had a CLI flag and a file and nothing on screen. `R-054` recorded the
scatter and proposed a tabbed shell.

Two things made this the moment to do it rather than later. `runtime-modal-contract` landed,
so the roles, the dismissal rule and the size criterion a settings home has to obey are
written down and enforced by a derived census. And the raster's first control would have
made a latent defect live: `B-116` — `channel-settings.json` is written into `templatesDir`
on the first raster change, and the template registry read every `*.json` there as a
template. The file had never existed on this host, which is the only reason nobody had seen
the bug; the first operator to use the new control would have created it.

## What changes

- **The `Server connection` dialog grows into `Station setup`** and gains sections: Servers
  (hosts + ports, the serve address, redundancy), Outputs (unchanged, read-only), Channel
  raster (new), Live sources (moved), Text file delimiters (moved), Candidate layers (moved,
  both of the old dialog's shapes), Station layers (new, read-only). One dialog, one pinned
  message region, every section rendered — **sections, not tabs**, because a tab hides the
  section a refusal came from.
- **Every old entry point becomes a deep link** into the one dialog: the status bar's SERVERS
  and SOURCES, the Layers panel's Configure (and its "What the bridge needs"), the Inspector's
  delimiter gear. None renders a second copy. The four old dialog modules are deleted.
- **The on-air guard does not widen.** `connections.set-config`'s refusal covers the Servers
  section alone; the footer's action is `APPLY SERVERS` and the refusal names its scope. The
  raster's refusal is the bridge's own, surfaced. Sources, delimiters and candidate layers
  commit from the body and say so in a legend beside their heading.
- **The channel raster gets its control**: per declared channel, width × height, what the
  server reports, the canonical verdict, and a per-channel Set button. No second writer, no
  second guard.
- **The reserved and live layers get a read-only section** naming what is declared and where
  it is declared, and admitting what the console cannot see.
- **`B-116` is closed first, by a rule**: the template registry admits only files it would
  have written (`<slug>-<12 hex>.json`), so a sibling store's config file is neither loaded
  nor reported as corrupt. Nothing moves on disk.
- **Six settings deliberately stay where they are** — the operator name, the lock PIN, panel
  layout, per-plate audio / per-row override / on-air position, plate→source assignments,
  the stack — each with its reason, and a test that each is still reachable and acquired no
  second control.
- **Zero persisted keys change**, proved by two census tests that derive every persisted key
  and file from the tree and compare them to the inventory at `576a72eb`.

## Impact

- `apps/runtime`: `features/stationSetup/*` (new), `features/sources/SourcesSection.tsx`,
  `features/inspector/DelimitersSection.tsx`, `features/fixedLayers/CandidateLayersSection.tsx`
  (moved bodies), `ui/channelSettingsReasonMessage.ts`; `App`, `StatusBar`, `LayersPanel`,
  `FromFileControl`, `OutputMissingBanner` re-pointed. Deleted: `ServerSettingsPanel.tsx`,
  `SourcesModal.tsx`, `DelimitersModal.tsx`, `FixedBankConfigModal.tsx`.
- `tools/caspar-bridge`: `template-registry.ts` (`isRegistryRecordName`).
- Tests: ten dom suites re-pointed, seven new; five Playwright specs re-pointed, one new.
- Operator-facing strings changed (golden rule 9 sweep done with `git grep`, case-insensitive,
  bare phrases, covering the e2e specs): `Server connection` → `Station setup`;
  `Open server settings` → `Open Station setup at Servers`; `Open live sources` →
  `Open Station setup at Live sources`; `Server connection ▸ Outputs` →
  `Station setup ▸ Outputs`; the sources dialog's `Done` is the shared `Cancel`.
- No `@cg/shared-ipc` change, no bridge route change, no persisted key or file change.
- `R-054` is partly discharged (one home, deep links, legible commit contract) and partly
  declined (tabs; the sources table; the shared `Select`) — see `design.md`.

## `STATION-CHROME-02` (2026-09-07) — the container changed, the contents did not

`STATION-CHROME-01` collected the sections into a tabbed container and kept their old
internals: the rail, the tabs and the footers were right, and almost nothing inside them was.
The instruction had no acceptance test, so nothing said it had not been carried out. This
amendment adds the test and the missing work.

- **One entry point** (§1). The status bar's `SOURCES` and the Layers bar's `Configure` are
  removed; `SETTINGS` is the one door. The DEEP-LINK MECHANISM stays, and the two surfaces
  that sit beside their subject keep it — the Inspector's delimiter gear, and the Layers
  empty state, whose copy now reads `SETTINGS ▸ Layers` instead of naming a removed button.
- **One frame** (§2). `Modal` gains `size="fixed"`: a declared width AND height from the
  token home, flush chrome, and only the pane scrolling. `station-setup-frame.spec.ts`
  asserts the dialog's box and the footer's top edge are identical on all five tabs — in a
  real engine, because jsdom has no layout and would pass against any shape.
- **One vocabulary** (§3). `.cg-rail*`, `.cg-table*`, `.cg-card*` and `.cg-btn--quiet` in
  `controls.css`, with six new role tokens. The destructive row actions stop being
  permanently red; the record lists become real tables; the blocks become cards; the Servers
  action becomes sentence case.
- **A defect the container hid** (§3). Every VISITED rail tab kept a white box, because the
  selected inline style merged a `borderColor` longhand over a `border` shorthand and React's
  removal of the longhand deleted the shorthand's colours too. Owner-reported and measured;
  the rail is a stylesheet now, so the failure mode does not exist.
- **A sentence that was untrue** (§5). Live sources' footer claimed nothing was waiting to be
  applied while its own `Apply band` sat above it.
- Operator-facing strings changed (rule-9 sweep, `git grep -n -i --untracked`, bare phrases):
  `APPLY SERVERS` → `Apply servers`; the Live-sources footer and legend; the Layers empty
  state's `Configure` → `SETTINGS ▸ Layers`; `Close`'s tooltip. The five card titles moved
  from hand-spelled uppercase to sentence case under one `text-transform`.
- No persisted key, file or schema change; no bridge change; no palette change.

# Design — Station setup

## 1. Grow the dialog, do not build a surface

`ServerSettingsPanel` was already most of a settings home: `wide`, a real form with
Cancel / Apply, the primitive's pinned refusal region, an on-air guard, and (since `B-223`)
the Outputs section. It was renamed and given sections rather than replaced. The prompt's
anchor of "~80 %" was about right: what it lacked was a way to host bodies that commit on
their own terms, and a way to be opened AT a section.

**Sections, not tabs — a decision against `R-054`'s original shape.** A tab bar hides every
section but one. A refusal raised by a hidden section (the raster refusing while something is
on air, the bank refusing to untick an occupied row) would reach the pinned region while the
section that raised it was out of sight. Every section stays rendered, a jump row scrolls,
and every message the region shows is prefixed with the section's name (`Live sources: Give
the source a name…`). `R-054`'s acceptance "Configure / Sources / Servers as tabs" is
therefore declined on its merits, and the item's own recon (correction 1) supports the shape
chosen: it found the footer split was deliberate and asked that each pane make its contract
legible — which sections with legends do, and tabs with one footer would not.

**Wide, by the contract's criterion.** The candidate-layer table (row · show · name ·
template) and the raster table (channel · width · height · server reading) both put several
values per row that the operator reads DOWN A COLUMN. `runtime-modal-contract` makes that the
criterion, so the dialog is `wide` twice over.

## 2. The commit contract, per section

`R-054`'s recon found two footer contracts and found the split deliberate: a dialog that
edits a DRAFT of connected state applies atomically; a dialog that edits a LIST of
independent records commits per record. One dialog now hosts both, so the contract is stated
per section, from one table (`sections.ts`), in a legend beside the heading:

| section              | commit                                  | on-air guard                        |
| -------------------- | --------------------------------------- | ----------------------------------- |
| Servers              | the footer's `APPLY SERVERS`            | inherits `set-config`'s refusal     |
| Outputs              | read-only                               | none                                |
| Channel raster       | per-channel `Set raster` in the section | the BRIDGE's own, surfaced          |
| Live sources         | saves as you go                         | none (bridge validates the catalog) |
| Text file delimiters | saves as you go                         | none                                |
| Candidate layers     | `Apply candidate layers` in the section | none — the bridge refuses per row   |
| Station layers       | read-only                               | none                                |

The footer has exactly two actions: `Cancel` (dismisses; drops the Servers draft; the
sections that save as they go are already saved, and its tooltip says so) and
`APPLY SERVERS` — `primary`, named for its scope. Sections that commit from the body grow no
footer action; `modalDismissRole.dom.test.ts` pins the count.

**The on-air guard did not widen, and that is stated rather than assumed.** The old
delimiters dialog's reason for being separate — _"a gate that is right for a host change and
wrong for choosing what a comma means"_ — is honoured by scoping the gate, not by keeping the
dialog: the refusal now reads `Apply is blocked for Servers: … Every other section stays
editable.`

## 3. Deep links, and who moves focus

A module store (`stationSetupStore.ts`) carries `{ open, section, requestId }`, so a control
deep in the Inspector can raise a request without a prop threaded through every layer. The
requested section carries `data-modal-autofocus`, so the modal's focus trap lands focus on it
at open — ONE thing moves focus (`B-230`). A request that arrives while the dialog is already
open cannot re-arm the trap, so the section frame's own effect, keyed on `requestId`, scrolls
and focuses in that case. `scrollIntoView` is guarded because jsdom does not implement it.

## 4. The channel raster — one writer, the bridge

`channelSettings.set` existed with every guard bridge-side (`on-air-block`,
`unknown-channel`) and a persisted file. The section sends what was typed and shows what came
back. Nothing is pre-disabled on the stack: the bridge's refusal is the one truth and names
its own count. Configured and OBSERVED sit side by side and the verdict is the canonical
`rasterVerdict`, never a local comparison. The refusal wording is keyed off the wire's own
reason union (`channelSettingsReasonMessage.ts`, the `fixedLayersReasonMessage` precedent) so
a new code cannot ship without a sentence.

## 5. `B-116` — a rule, not a filename, and no move

Two candidate fixes: move `delimiters.json` and `channel-settings.json` out of `templatesDir`,
or stop the registry treating arbitrary `*.json` there as templates. The first is a data
migration — an existing `delimiters.json` has to be moved or is silently abandoned — and this
change is not authorised to migrate data (§4 below). The second was chosen, **as a rule
derived from the writer**: `#fileFor` names every record `<slug>-<12 hex of sha256(id)>.json`,
and `loadPersisted` now admits a file iff `isRegistryRecordName` matches that shape. A
sibling config file is neither loaded nor warned about; a genuinely corrupt record, named as
the registry names them, still warns with the same message. Red-first: the test wrote both
files with the REAL stores and showed `skipped: 2` before the fix.

`source-catalog-store.ts`'s placement rule (a config file does not belong beside the
templates) still stands for NEW stores; the two existing files stay where they are.

## 6. The two shapes that look like one

The catalog (installation-wide, `sources.set-config`, `bridge-source-catalog.json`) and the
plate→source assignments (per template, `sources.set-assignments`,
`bridge-source-assignments.json`) share a name and are two things. Merging their SURFACES is
fine and did not happen here — the assignments stay in the Inspector; merging their SHAPE
would make an assignment installation-wide, the exact bug `LiveSourceSwapDialog`'s own intro
exists to prevent. `livePlates.dom.test.ts` edits the catalog through the section and asserts
the assignments channel is never written; `stationSetupScope.dom.test.ts` asserts the
dialog's source never names the assignments writer.

## 7. Zero persisted keys change — proved, not inherited

Two census tests derive every persisted name from the tree and compare it to the inventory
recorded at `576a72eb`:

- browser (`apps/runtime/tests/persistedKeyCensus.test.ts`): `localStorage`
  `cg.runtime.operatorName`, `cg.runtime.shell-layout.v1`; `sessionStorage`
  `cg.runtime.testMode`, `CG_RUNTIME_SESSION`; the mock's `localStorage`
  `cg-runtime:channel-settings`, `cg-runtime:delimiters`, `cg-runtime:source-assignments`,
  `cg-runtime:source-catalog`; IndexedDB `cg-runtime-from-file`; OPFS workspace `runtime`;
- bridge (`tools/caspar-bridge/tests/persisted-files-census.test.ts`): in `templatesDir`,
  `channel-settings.json` and `delimiters.json`; under `~/.cg-runtime/`, `bridge-audit.ndjson`,
  `bridge-connection.json`, `bridge-fixed-layers.json`, `bridge-live-layers.json`,
  `bridge-reserved-layers.json`, `bridge-source-assignments.json`,
  `bridge-source-catalog.json`, `bridge-templates`.

The two namespaces `cg.runtime.*` and `cg-runtime:*` never meet and are listed apart on
purpose. Both inventories are identical before and after; the settings home itself spells no
persisted key.

## 8. What `R-054` asked for that this change declines, and why

- **Tabs** — declined (§1).
- **Sources as a table, one row per source** — not done: the section keeps its entry cards.
  A table is a real improvement and a separate change; folding it in here would have put a
  layout rewrite inside a move whose whole claim is "UI-only, nothing else changed".
- **A shared `Select` and the focus-trap gap for raw `<select>`s** — not done, same reason;
  the raw selects the recon lists are unchanged in number.

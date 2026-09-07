# Phase 1 — the map, the deletion guard, and two questions for the owner

**Prompt ID:** `RUNTIME-REDESIGN-01`, Phase 1. Read against the tree at `869e2719` on branch `dev`
(working tree carrying only the untracked `docs/ui-reference/`, `docs/design/`, `.codex/`,
`AGENTS.md`). Nothing below is a proposal; every claim names the file that decides it.

## §0 — Method, and what contradicted the prompt

`04-playout-layers.html` was read as the source of truth per `PROMPT.md` §0; the other eight were
not diffed. The prototype is 287 KB in 1321 lines — 82 KB of CSS, 16 KB of static body markup, and
188 KB of script, of which one 54 KB line is the Station-setup shadow root written as a single
string literal. Surfaces were therefore enumerated from the body markup plus the script's render
functions, not by reading the file linearly.

Three things were found that the prompt states differently. None invalidates a phase.

1. 🔴 **The reference DOES draw a lock screen.** `PROMPT.md` §1.3 lists "the lock screen (`B-229`)"
   among the surfaces the reference does not draw. It draws one — a `sub-dialog` with the id
   `unlock-dialog` — headed **Console locked**, reading _"Playout continues. Enter your PIN to use
   the console."_, with a single full-width **Unlock console** submit and no dismiss control.
   It lives inside the Station-setup shadow root and is therefore **on** that prototype's dialog
   primitive — which is exactly the move §9 forbids (_"the reference must not be used as an
   argument to put it there"_). So §9 is right and §1.3's enumeration is loose: the lock stays a
   guard item, but for its CHROME and its no-exit contract, not for its absence.
2. **The reference's audit log has no actor column at all.** Its table columns are
   `Time · UTC | Action | Item | Result`, and the event-detail list is `Time | Channel | Action`
   plus Event/Item/Template ids. There is no WHO, and no caveat beside a WHO. That is the material
   fact behind §8's point 8, and it is escalated unanswered in §5 below.
3. **The reference's Station setup has exactly the five sections the app already has** — Channel,
   Servers, Live sources, Text delimiters, Layers — matching
   `apps/runtime/src/renderer/features/stationSetup/sections.ts`
   (`channel · servers · sources · delimiters · candidate-layers`) one for one. It does NOT have
   the app's `OutputsSection` (see guard item 26), and its Channel section is read-only metrics
   (`video-mode`, raster, fps), which is the app's contract too.

## §1 — THE MAP

Every surface the reference touches, the component that renders it today, and the bridge channel
that feeds it. Bridge names are the `window.cg` namespaces declared in
`apps/runtime/src/shared/runtime-bridge.ts`; call sites were resolved by grep, not inferred.

### 1.1 Shell and chrome

| Reference surface                                  | Today                                                                  | Bridge channel                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| App header, brand block                            | no equivalent — the app has no top header                              | —                                                           |
| Channel switcher `#channel-select`                 | `features/channels/ChannelScope.tsx` (a Tabs strip, one tab)           | `fixedLayers.config` → `FixedLayerBank.channel`             |
| `Settings` button                                  | `features/status/StatusBar.tsx` → `stationSetup/stationSetupStore.ts`  | — (opens a dialog)                                          |
| Monitor toggle / `#monitor-area`                   | `hooks/useShellLayout.ts` focus + `features/monitors/MonitorStrip.tsx` | — (browser-local, `cg.runtime.shell-layout.v1`)             |
| `PVW · N` badge `#preview-total`                   | `features/monitors/PreviewPanel.tsx` header                            | `rehearse.state` / `rehearse.onStateChanged`                |
| `Templates` / `Import` buttons                     | `features/fixedLayers/useTemplatePicker.tsx` (both, one door)          | `templates.list` / `templates.get` / `templates.import`     |
| `Audit log` button                                 | `StatusBar` → `features/audit/AuditPanel.tsx`                          | `audit.recent`, `audit.health`                              |
| Bottom bar pills (bridge, server, backup, channel) | `features/status/StatusBar.tsx` + `status/LinkIndicator.tsx`           | `link.status`, `connections.health`, `connections.failover` |
| Global toast `#toast`                              | `features/status/CommandToast.tsx` + `status/commandFeedback.ts`       | — (local event bus; see guard item 18)                      |

### 1.2 The layers card

| Reference surface                            | Today                                                              | Bridge channel                                                    |
| -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Tabs: Layers / Live plates / Station layers  | `features/layers/LayersPanel.tsx` `<Tabs>` (same three)            | —                                                                 |
| `CH 1` target chip                           | `ChannelScope` tab label                                           | `fixedLayers.config`                                              |
| `Stop all` / `Clear all` / `Remove all`      | `LayersPanel.tsx:781/817/844`                                      | `stack.stopAll` / `stack.clearAll` / `stack.removeAll`            |
| Search, `Hide empty`, counts, results hint   | `LayersPanel.tsx` sub-bar + `features/layers/layerTable.ts`        | `stack.snapshot` / `stack.onStateChanged`                         |
| The layer table and its rows                 | `features/layers/LayerRow.tsx` + `layers/LayerTableHeader.tsx`     | `fixedLayers.state`, `stack.onStateChanged`, `liveLayers.state`   |
| Row state mark / status badge                | `features/layers/rowState.ts` + `ui/StatusBadge.tsx` + `theme.ts`  | derived from `StackItemState`                                     |
| Row verbs `Item·Play·On PVW·Next·Stop·Clear` | `features/layers/layerRowActions.ts` + `ui/rowAction.ts`           | `stack.take` `stack.next` `stack.stop` `stack.out` `stack.remove` |
| `On PVW`                                     | `LayerRow.tsx:441` and `hooks/useRehearse.ts`                      | `rehearse.enter` / `rehearse.exit`                                |
| Look switch buttons                          | `features/layers/LookPicker.tsx` + `layers/lookSwitch.ts`          | `stack.setActiveLook`                                             |
| Row audio button                             | `features/layers/PlateAudioStrip.tsx` → `LivePlateAudioDialog.tsx` | `stack.setPlateVolume` / `stack.setPlateVolumes`                  |
| Graphics-beds divider row                    | `features/layers/liveLayerRows.ts` + `LayersPanel.tsx:1214`        | `fixedLayers.config` (low bank)                                   |
| Live plates pane                             | `features/layers/LiveSourcesPanel.tsx`                             | `liveLayers.state` / `onStateChanged` (seated layers)             |
| Station layers pane                          | `features/layers/StationLayersPanel.tsx`                           | `playoutLayers.state` / `playoutLayers.clear`                     |

🔴 **The two source surfaces `PROMPT.md` §6 warns about, named here so Phase 6 does not have to
re-find them.** LIVE PLATES are seated layers, read from `liveLayers.state` via
`hooks/useLiveLayers.ts`. The SOURCE CATALOGUE is installation-wide, read from `sources.config` via
`features/sources/sourceStore.ts` and edited in Station setup's `SourcesSection`. Different
channel, different lifetime, different surface.

### 1.3 The Inspector and the monitors

| Reference surface                       | Today                                                                    | Bridge channel                                        |
| --------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| Inspector header / body / pinned footer | `features/inspector/Inspector.tsx`                                       | `templates.get`, `templates.list`                     |
| Field drafts kept per row               | `features/inspector/draftStore.ts` (+ `ui/DraftChip.tsx`)                | — (in-memory per item)                                |
| `Update` at the panel foot              | `features/inspector/applyDraft.ts:140`                                   | `stack.update`                                        |
| Position X / Y                          | `features/inspector/PositionPicker.tsx:235`                              | `stack.setPosition`                                   |
| Subtitle items, grip reorder            | `features/inspector/ListFieldEditor.tsx` + `@cg/gesture`                 | — (staged into the draft)                             |
| Look → source mappings                  | `features/inspector/LooksBindingsSection.tsx`, `inspector/livePlates.ts` | `sources.assignments`, `stack.setActiveLook`          |
| PVW monitor, zoom, composite            | `features/monitors/PreviewPanel.tsx` + `monitors/RehearsalStage.tsx`     | `templates.html`, `rehearse.*`, `channelSettings.get` |
| PGM monitor                             | `features/monitors/MonitorPanel.tsx`                                     | — (no return feed; `C-016`)                           |

### 1.4 The dialogs

| Reference surface                         | Today                                                                      | Bridge channel                                             |
| ----------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `#template-dialog` picker + detail        | `features/fixedLayers/useTemplatePicker.tsx`                               | `templates.list`, `fixedLayers.config`, `fixedLayers.load` |
| `Manage` / library management             | same file (`templates.remove` path)                                        | `templates.remove`, `stack.remove`                         |
| `#import-dialog` steps and outcome        | `features/library/importVcgFile.ts` + `library/templateDelivery.ts:281`    | `templates.import` (after `@cg/vcg-format` verify)         |
| `#audit-dialog`                           | `features/audit/AuditPanel.tsx` + `audit/auditFormat.ts`                   | `audit.recent`, `audit.health`, `audit.operatorName`       |
| `#audio-dialog` (ON / OFF / SOLO)         | `features/layers/LivePlateAudioDialog.tsx` + `layers/plateAudio.ts`        | `stack.setPlateVolumes`, `stack.silenceAllLivePlates`      |
| `#confirm-dialog`                         | `ui/useDialog.tsx` (`useConfirm`) over `ui/Modal.tsx`                      | —                                                          |
| Station setup — Channel                   | `features/stationSetup/ChannelSection.tsx`                                 | `channelSettings.get` / `onChanged`, `connections.health`  |
| Station setup — Servers (+ backup editor) | `StationSetupDialog.tsx` + `stationSetup/BackupServerDialog.tsx`           | `connections.config` / `setConfig` / `templateServe`       |
| Station setup — Live sources (+ band)     | `features/sources/SourcesSection.tsx` + `sources/LiveSourceDialog.tsx`     | `sources.config` / `setConfig` / `setAssignments`          |
| Station setup — Text delimiters           | `features/inspector/DelimitersSection.tsx` + `inspector/delimiterStore.ts` | `delimiters.list` / `delimiters.set`                       |
| Station setup — Layers                    | `features/fixedLayers/CandidateLayersSection.tsx`                          | `fixedLayers.config` / `setConfig`, `stack.remove`         |
| Station setup — Lock console              | `features/lock/EngageLockDialog.tsx`, opened from `StatusBar`              | `lock.engage`                                              |
| `#unlock-dialog` (Console locked)         | `features/lock/LockOverlay.tsx` — NOT a dialog, see guard item 15          | `lock.state` / `onStateChanged` / `lock.release`           |

### 1.5 The token home

`PROMPT.md` §1.1 names it and Phase 2 rewrites it. It is `apps/runtime/src/renderer/theme.ts`:
`colors` at line 32, `cssVars` at line 164, 754 lines total. `renderer/ui/controls.css` declares no
`--r-*` value of its own. Three guards enforce that and all three must stay green through Phase 2:
`apps/runtime/tests/tokenHome.test.ts` (_"no renderer component spells a colour"_, with its own
positive control at _"POSITIVE CONTROL: the guard really does see a planted literal"_),
`apps/runtime/tests/themeVarsApplied.dom.test.ts` (_"writes every cssVars entry into a :root
block"_), and `apps/runtime/tests/e2e/theme-tokens.spec.ts`.

## §2 — Why the guard below is the deliverable that matters

The reference is a design for the console **working**. Every surface in §3 exists because something
went wrong — a server dropped what was on air, a layer is lit that nobody owns, the bridge is older
than the page, a declared output never started, a restore came back short. A prototype has no
reason to draw any of them, and a redesign that ships what is drawn deletes all of them silently.

The list below is built from the source tree, not taken from `PROMPT.md` §1.3. Seven of the
twenty-six are the ones §1.3 names; nineteen are not.

## §3 — THE DELETION GUARD

For each: where it lives now, what it looks like after the redesign, and the test that proves it
still appears. **A ✅ test already exists and asserts the surface renders under its condition. A 🔴
test does NOT exist and is owed by Phase 9** — five of the twenty-six, each verified by grep against
`apps/runtime/tests` rather than assumed.

### Alarms in the banner region (`App.tsx`, above the workspace)

**1. Emptied-air notice, with PUT BACK ON AIR** (`B-225` / `B-227`, confirmed on the plant)
Now: `features/layers/EmptiedAirNotice.tsx`, rendered at `App.tsx:315` inside the layers chrome —
deliberately not with the five top-of-page banners, because it names ROWS in the list below it.
Fed by `emptiedAir.notice` / `onNoticeChanged`; acts through `emptiedAir.restore` and
`emptiedAir.dismiss`.
After: the reference's `.notice` warn treatment, in the new tokens, in the same position above the
table. `restore` stays reachable only by a press — nothing may call it from an effect, timer,
reconnect handler or mount.
✅ `apps/runtime/tests/emptiedAirNotice.dom.test.ts` —
_"says the channel is alive and carrying nothing, and how many rows went"_ and
_"🔴 sends NOTHING until a person confirms, then restores exactly the listed rows"_.

**2. Orphan-layers banner, the WARNING strip** (`R-009`)
Now: `features/layers/OrphanLayersBanner.tsx`, `App.tsx:316`. Fed by `layers.orphans` /
`onOrphansChanged`; acts through `layers.clear`.
After: the reference's warn `.notice`, above the table, with its per-layer Clear.
✅ `apps/runtime/tests/orphanLayersBanner.dom.test.ts` —
_"names each orphan channel-layer with the not-on-your-stack message"_.

**3. Orphan-layers banner, the NEUTRAL strip** (`R-015`)
Now: same file, second strip. An occupied-but-not-ours VIDEO layer is a normal fact of the console:
surface tones only, no alert role, and **no Clear at all**.
After: the reference's plain `.notice` (no `warn` class). Listed separately from item 2 because a
redesign that keeps only the amber strip deletes this one, and the difference is a contract, not a
colour.
✅ `orphanLayersBanner.dom.test.ts` —
_"a video layer renders in the NEUTRAL strip: no alert role, no Clear control, kind named"_.

**4. Owned-slot occupancy warning** (`B-056`)
Now: same file, `ownedOccupancy` prop from `layers.ownedOccupancy` / `onOwnedOccupancyChanged`.
Names the owning ROW and offers Out/Remove — never a Clear.
After: warn `.notice`, no Clear control.
✅ `orphanLayersBanner.dom.test.ts` —
_"names the channel-layer AND the owning ROW, with the Out/Remove remedy and NO Clear control"_.

**5. Bridge-skew banner** (`B-153`)
Now: `features/status/BridgeSkewBanner.tsx`, `App.tsx:203`. Fed by `link.skew` / `onSkewChanged`.
Amber, not red: it reports, it never gates.
After: full-width amber strip in the new `--amber` pair. It must stay amber — red would put it
beside DISCONNECTED and an operator who discounts one will discount both.
🔴 **No test exists.** `apps/runtime/tests/bridgeSkew.test.ts` covers `shared/bridgeSkew.ts` — the
message shaping and the connect-time handshake — and never renders the banner.
Owed: `apps/runtime/tests/bridgeSkewBanner.dom.test.ts`.

**6. Output alarm** (`C-029` / `B-223`)
Now: `features/status/OutputMissingBanner.tsx`, `App.tsx:220`. Fed by `connections.health` /
`onHealthChanged` and `link.status`. Severity is by air-criticality: a channel missing only local
monitors renders nothing here.
After: red strip, one headline plus one line per channel. The engineering detail stays on the
technical surface (guard item 26) — it must not be pulled onto the banner while redressing it.
✅ `apps/runtime/tests/outputMissingBanner.dom.test.ts` —
_"names the channel, the declared consumer by device, and where the fix is"_ and, for the inverse,
_"🔴 a missing screen consumer renders NO banner — a preview window is not air"_.

**7. Raster-mismatch banner** (`R-030`)
Now: `features/status/RasterMismatchBanner.tsx`, `App.tsx:215`. Fed by `channelSettings.get` /
`onChanged` through `hooks/useChannelSettings.ts`. Renders only on a genuine `mismatch` verdict —
`unreadable` is a gap in the check, not an alarm.
After: red strip beside the others.
🔴 **No test exists — no test file in the tree references this component at all.**
Owed: `apps/runtime/tests/rasterMismatchBanner.dom.test.ts`, asserting `mismatch` renders and
`unreadable` / `unconfigured` / `match` render nothing.

**8. Connection banner — DISCONNECTED and TEST MODE** (`R-006`)
Now: `features/status/ConnectionBanner.tsx`, `App.tsx:201`. Fed by `link.status` /
`onStatusChanged` and `platform/testMode.ts`.
After: full-width red strip. ⚠ **The reference's footer pill `Bridge · simulated` is not a
substitute and must not be read as one.** A pill beside a healthy-looking server pill is precisely
the failure `R-006` records: the operator pressed PLAY, saw ON AIR, and nothing was up.
✅ `apps/runtime/tests/bannerCompact.dom.test.ts` —
_"NOT CONNECTED still says nothing can reach air, and refuses to queue"_ and
_"TEST MODE still says nothing is on air, and offers the way out"_; plus
`apps/runtime/tests/testModeHonesty.dom.test.ts`.

**9. Failover banner**
Now: `features/connections/FailoverBanner.tsx`, `App.tsx:209`, suppressed while
`link === 'offline-mock'` (in test mode there are no real servers to shout about).
After: a strip rather than the current fixed slab with hard-coded hex — `B-172` already records the
slab as the thing to move away from, so Phase 9 discharges that too.
🔴 **No test exists.** Owed: `apps/runtime/tests/failoverBanner.dom.test.ts`, including the
`offline-mock` suppression, which is the half most easily lost.

### Notices inside the layers panel

**10. Restore-skips strip** (`B-108`)
Now: `LayersPanel.tsx:987`, `data-restore-skips`, `role="alert"`. Fed by `stack.onRestoreSkips`.
After: warn `.notice` above the table, rows named through `ui/operatorNaming.ts`.
✅ `apps/runtime/tests/layersPanel.restoreSkips.dom.test.ts` —
_"B-108: lost rows are announced, by id and with what to do about each"_, with its inverse
_"THE NO-FALSE-ALARM CASE: nothing is announced when nothing was lost"_.

**11. Restore-migrations strip** (`single-clock-look-switch`)
Now: `LayersPanel.tsx:1030`, `data-restore-migrations`, `role="alert"`. Fed by
`stack.onRestoreMigrations`. A SEPARATE seam from item 10 on purpose: these rows DID come back, on
a different row.
🔴 **No test exists** — `data-restore-migrations` occurs in exactly one file in the tree, and it is
the component. Owed: `apps/runtime/tests/layersPanel.restoreMigrations.dom.test.ts`.

**12. Awaiting-rows strip**
Now: `LayersPanel.tsx:1067`, `data-layers-awaiting`, `role="status"` on an always-present wrapper
whose height is reserved permanently so the rows cannot move when it goes.
After: a hint line in the table's own chrome, height still reserved.
✅ `apps/runtime/tests/layersPanel.awaitingNotice.dom.test.ts` —
_"is present while a row is awaiting, and gone once the data lands"_ and
_"reserves its height permanently — the rows cannot move when it goes"_.

**13. "Loading the layer list…"**
Now: `LayersPanel.tsx:933`, `data-layers-loading`. An unready list may never render as an empty
list; it ends when the DATA arrives, never on a timer.
After: the same sentence in the reference's empty-row treatment.
✅ `apps/runtime/tests/layersPanel.loading.dom.test.ts` —
_"says LOADING for the WHOLE window, then the rows arrive"_.

**14. "No candidate layers are declared" + `What the bridge needs`**
Now: `LayersPanel.tsx:940`. The one surviving deep link from this panel into Station setup
(`openStationSetup('candidate-layers')`), kept because an operator with no declared bank is looking
at a list that cannot explain itself.
After: the reference's empty state, with the button preserved.
✅ `layersPanel.loading.dom.test.ts` —
_"a station that genuinely HAS no bank still says so — once we know"_; the deep link itself is
pinned by `apps/runtime/tests/stationSetupDeepLink.dom.test.ts`.

### The lock

**15. Lock overlay** (`B-229`)
Now: `features/lock/LockOverlay.tsx`, `App.tsx:447`. Fed by `lock.state` / `onStateChanged`; released
through `lock.release`. Its own scrim and card, its own focus trap (`ui/focusTrap.ts`), deliberately
NOT on `ui/Modal.tsx` — **a lock with a way out is not a lock.**
After: the reference's `unlock-dialog` LOOK — icon, `Console locked`, the PIN field, the full-width
submit — over the app's own chrome. 🔴 **It does not become a `<dialog>` and it does not gain a
dismiss path.** The reference draws its lock inside the Station-setup shadow root on that
prototype's dialog primitive; `PROMPT.md` §9 forbids reading that as an argument, and this is the
line where that will be attempted.
✅ `apps/runtime/tests/lockOverlay.focusTrap.dom.test.ts` —
_"🔴 THE BUG: Tab off the LAST control wraps back inside instead of leaving the overlay"_, with the
inverse _"🔴 THE INVERSE: released, it handles nothing — the app gets its keyboard back"_; e2e
`apps/runtime/tests/e2e/lock-keyboard-containment.spec.ts`.

**16. Engage-lock dialog**
Now: `features/lock/EngageLockDialog.tsx`, opened from `StatusBar.tsx:568`, sends `lock.engage`.
Confirms the PIN and refuses to lock unless the two entries match.
After: Station setup's `Lock console` editor, as the reference draws it.
✅ but thinly: `apps/runtime/tests/numericInput.dom.test.ts` —
_"a Persian-typed engage PIN is stored in Latin (StatusBar → lock.engage)"_ — asserts digit
normalisation through this dialog, not that it appears; e2e
`apps/runtime/tests/e2e/lock-prompt-enter.spec.ts` covers the prompt. Phase 9 should strengthen
this to a presence-and-confirmation assertion rather than leave it riding on a digit test.

### Status-bar vocabulary

**17. The status bar's fault states and the manual failover control**
Now: `features/status/StatusBar.tsx` + `status/LinkIndicator.tsx` + `ui/StatusBadge.tsx`. Four
distinct fault vocabularies the reference's three static footer pills have no equivalent for:
OSC-silent, stopped channel, single-server, not-connected — plus the `Manual failover` button
(`connections.failover`). ⚠ The bar's colour rule survives with them: nothing in it is coloured
unless it needs attention, and neither the on-air green nor the ready sky may appear there at any
weight.
✅ five files, each a state: `statusBar.noOsc.dom.test.ts`, `statusBar.deadChannel.dom.test.ts`,
`statusBar.singleServer.dom.test.ts`, `statusBar.notConnected.dom.test.ts`,
`statusBar.linkTransition.dom.test.ts`, plus `statusBadge.oscBlind.dom.test.ts`.

**18. Command toast**
Now: `features/status/CommandToast.tsx` + `status/commandFeedback.ts`, `App.tsx:435`.
⚠ The reference HAS a `#toast` element — but it is driven only by Station-setup saves and dialog
theatre. **It has no command-refusal path**, and a refused AMCP command reaching no surface is the
thing this component exists to prevent.
After: the reference's toast geometry, keeping both tones and the last-write-wins dismissal.
✅ `apps/runtime/tests/commandToast.dom.test.ts` —
_"shows an ERROR message as a red \"Command error\" alert"_.

### Shell chrome with no reference equivalent

**19. The resizable shell** (`R-028` part B)
Now: `ui/ShellDivider.tsx` (×2 — Inspector width, monitor-strip height), `hooks/useShellLayout.ts`,
`renderer/layout.ts`; persisted per browser as `cg.runtime.shell-layout.v1`. Either panel can be
taken fullscreen. The reference has a fixed `control-grid` and no divider.
After: preserved. The reference's geometry supplies the default sizes, not the constraint.
✅ `apps/runtime/tests/shellLayout.test.ts`, `apps/runtime/tests/layout.test.ts`; e2e
`divider-across-iframe.spec.ts`, `draft-survives-fullscreen.spec.ts`, `panel-scroll.spec.ts`.

**20. The narrow-width Inspector overlay and its scrim**
Now: `App.tsx:385-428`, `data-inspector-scrim`. Below the narrow breakpoint the Inspector stops
being a column; the scrim DESELECTS rather than merely hiding, so the list can never claim a
selection with no editor behind it.
After: preserved, in the new tokens.
✅ e2e `apps/runtime/tests/e2e/inspector-open-close.spec.ts`.

**21. The boot splash** (`R-035`)
Now: `apps/runtime/index.html` (`window.__CG_SPLASH__`) + `renderer/splashTiming.ts`; fed by
`main.tsx`'s boot phases. It cannot be a React component — it is on screen during the bundle parse
and the 1500 ms bridge probe. The reference has no equivalent.
After: preserved; its palette is re-tokened in Phase 2.
✅ `splash.dom.test.ts`, `splashCss.test.ts`, `splashTiming.test.ts`; e2e `splash.spec.ts`.

**22. The single delegated Tooltip**
Now: `ui/Tooltip.tsx`, mounted once at `App.tsx:439`; every control carrying a `title` inherits it.
The reference uses native `title` attributes throughout.
After: preserved — and load-bearing, because golden rule 11's relocated ids live in `title`.
🔴 **No test exists** — no file under `apps/runtime/tests` references `Tooltip`.
Owed: `apps/runtime/tests/tooltip.dom.test.ts`.

**23. App-wide native context-menu suppression, with editable fields exempt**
Now: `App.tsx:74-131` (`isEditable` + `suppressNativeMenu`). On a playout machine Reload and Back
leave the running show; text inputs stay exempt because the Inspector is where Persian copy is
typed and the browser's BiDi and spelling services are real editing affordances.
After: preserved. ⚠ The reference wires right-click for plate controls without suppressing anything;
Phase 6 must keep both — the app's own menus already call `preventDefault` themselves.
🔴 **No test exists.** Owed: `apps/runtime/tests/contextMenuSuppression.dom.test.ts`, asserting both
halves (suppressed on the surface, NOT suppressed in a text input).

### Capability the reference's panels do not draw

**24. From-file field sources** (`field-file-source-opt-in`)
Now: `features/inspector/FromFileControl.tsx` plus `fromFileContent.ts`, `fromFileOps.ts`,
`fromFilePersistence.ts`, `fromFileStore.ts`, `fileSourceGrants.ts`, `textFileSource.ts`; persisted
in IndexedDB `cg-runtime-from-file` and OPFS `runtime`. The string "from file" appears zero times
in the reference.
After: preserved inside the redesigned Inspector, applying through the same `stack.update` path.
✅ `fromFileGrant.dom.test.ts`, `fromFileReload.dom.test.ts`, `fromFileRestore.dom.test.ts`,
`fromFileContent.test.ts`.

**25. Live-source swap dialog** (`R-048`)
Now: `features/layers/LiveSourceSwapDialog.tsx`, reached from the row context menu
(`LayerRow.tsx:1049` → `stack.swapLiveSource`). Points ONE plate of ONE row at a different live
source while the template is on air, without writing back to the assignment or the catalog. The
string "swap" appears zero times in the reference.
After: preserved on the row's context menu, which the reference already uses for plate controls.
✅ `apps/runtime/tests/liveSourceSwap.dom.test.ts`.

**26. The outputs technical surface** (`C-029`)
Now: `features/connections/OutputsSection.tsx`, rendered inside `ChannelSection.tsx:181` — i.e. on
Station setup's Channel tab. It carries what `B-223` deliberately took OFF the operator banner:
addressing form, the rule CasparCG reads the number by, the startup-log recipe, the creation
outcome. The reference's Channel section is video-mode metrics only.
After: preserved on the Channel tab, below the metrics.
✅ `apps/runtime/tests/outputsSection.dom.test.ts`,
`apps/runtime/tests/decklinkKeyDeviceHonesty.dom.test.ts`.

### Recorded as NOT at risk

Checked and found DRAWN by the reference, so no guard entry is owed: the backup-server editor
(`renderBackup` / `editBackup`), the live-source band editor, the delimiter editor with its split
preview, the template-library management view, the audit event-detail pane with its copy control,
the confirm dialog, and the Station-setup section set itself.

## §4 — OPEN QUESTION FOR THE OWNER (A): where the bridge is single-channel today

`PROMPT.md` §7 requires the channel list to be shaped so it can be filled from an API, and requires
that where the bridge is single-channel we **say so and file the gap, inventing no multi-channel
contract.** Filed, measured, not designed:

**The app declares exactly one channel, and the authority is the fixed-layer bank.**
`features/channels/ChannelScope.tsx:30` reads `bank?.channel ?? 1` and builds a one-element tab
array; its own header states _"ONE CHANNEL FOR NOW. The bank declares exactly one, and no channel
discovery is invented here."_ `FixedLayerBankSchema.channel` is documented as _"one channel per
bank, v1"_. **There is no channel-discovery call on the bridge contract at all.**

What IS channel-keyed today, and what is not — read off the Zod schemas in
`packages/shared-ipc/src/channels/`:

| Namespace         | Channel-keyed?                                                                         |
| ----------------- | -------------------------------------------------------------------------------------- |
| `channelSettings` | ✅ fully — `settings` and `observed` are arrays keyed by `channel`; `set` takes one    |
| `layers`          | ✅ state and `clear` both carry `channel`                                              |
| `liveLayers`      | ✅ state carries `channel`                                                             |
| `playoutLayers`   | ✅ state and `clear` both carry `channel`                                              |
| `emptiedAir`      | ✅ each notice row carries `channel`                                                   |
| `rehearse`        | ✅ each rehearsal carries `channel`                                                    |
| `fixedLayers`     | ⚠ ONE bank, ONE channel — the bank is the channel authority and there is one bank      |
| `connections`     | ⚠ per-channel FACTS only (`ChannelTick`, `ChannelOutputCheck`); config is station-wide |
| `stack`           | 🔴 **NOT channel-keyed.** No request carries a channel                                 |
| `templates`       | 🔴 station-wide by design                                                              |
| `sources`         | 🔴 station-wide catalogue by design                                                    |
| `delimiters`      | 🔴 station-wide by design                                                              |
| `audit`           | 🔴 no channel in the request; records carry one                                        |
| `lock`            | 🔴 station-wide, and arguably correct — a locked console is locked                     |

🔴 **The one that decides the phase is `stack`.** `stack.load`, `take`, `update`, `stop`, `out`,
`remove`, `setPosition`, `setActiveLook`, `swapLiveSource`, `setPlateVolume(s)` are all addressed by
`itemId`, and the bulk verbs `clearAll` / `stopAll` / `removeAll` / `silenceAllLivePlates` take no
arguments at all. A `channel` field occurs nowhere in `stack.ts` except inside
`StackRestoreChannel`'s migration report, as a description of where a row came back. **So a second
channel's rows cannot be addressed today, and a bulk verb cannot be scoped to one channel.**

⚠ And a scoping question that is not merely additive: `stack.silenceAllLivePlates` is the PANIC
verb, and it takes no arguments **on purpose** — the scope is not the caller's to choose. Making it
channel-scoped would be a change to an emergency control's contract, not a widening. That is the
owner's call, and Phase 7 must not make it in passing.

**What Phase 7 can therefore do without inventing a contract:** shape the channel strip as a list
whose length is data; key browser-local per-channel UI state (selected tab, panel geometry) by
channel id; and leave every bridge call exactly as it is, on the one channel the bank declares. The
gap above is what a multi-channel bridge would have to close, and closing it is not this programme.

## §5 — OPEN QUESTION FOR THE OWNER (B): the audit actor after the picker

`PROMPT.md` §8 point 8 asks what identifies the actor once the manual console-name picker is gone,
and what happens to `B-143`'s _"self-declared and unverified"_ caveat. Measured, not decided:

**The picker is `#audit-operator`, and it is the only writer of the actor in the entire product.**
It lives at `AuditPanel.tsx:278-298`, labelled `This console`, placeholder `unattributed`. It calls
`window.cg.audit.setOperatorName`, which writes `localStorage['cg.runtime.operatorName']`
(`apps/runtime/src/platform/operatorName.ts:30`). Every control request carries that value as its
actor (`packages/shared-ipc/src/ws-frame.ts`, `normalizeActor`), and the bridge records it through
`tools/caspar-bridge/src/actor-context.ts`, defaulting to `UNATTRIBUTED_ACTOR` when absent. A
tree-wide grep finds **no second writer.**

**So the honest consequence, stated plainly: delete the picker and every audit record becomes
`unattributed`, permanently.** Not "less identifiable" — unidentifiable. The bridge would keep
writing an actor column faithfully, and the column would carry one constant forever, which is
exactly the `B-141` / `B-143` family of failure (the system knows something and does not say it)
with the sign flipped: the system would now say something it does not know.

**And the caveat has nowhere to go, because the reference has no actor column.** Its audit table is
`Time · UTC | Action | Item | Result`; its detail list is `Time | Channel | Action`. `B-143` put the
caveat _beside the column it qualifies_ on purpose. With no column there is no beside.

Three further facts the owner will want when deciding:

- The caveat is not decoration — it is asserted in three places, and those tests fail the moment the
  wording moves: `auditPanel.legibility.dom.test.ts:264-265`, e2e `audit-legibility.spec.ts:50`, and
  `stationSetupScope.dom.test.ts:113-126`, the last of which also asserts the field is in the AUDIT
  panel and **not** in Station setup.
- `cg.runtime.operatorName` is one of only two real `localStorage` keys in the product's persisted
  census (`persistedKeyCensus.test.ts:89`). Removing its writer is a census-visible change.
- `operatorName.ts:18-27` already records two rejected alternatives so they are not re-proposed: a
  PIN-backed sign-in reusing the lock's PIN (rejected — the lock's PIN is a safety mechanism, not an
  identity one, and a login in front of an emergency console is wrong), and a per-connection client
  id (rejected — it identifies a browser, and nobody disputes which browser did something).

🔴 **Not decided here.** Phase 8 needs the owner's answer to one of: (a) keep the picker, moving it
to Station setup — which contradicts `stationSetupScope.dom.test.ts` and separates the caveat from
the column; (b) drop the picker and accept a permanently `unattributed` log, said plainly on the
surface; (c) supply a different identity, which is new work and outside this programme.

# The map, the deletion guard, the owner's answers, and the palette

**Prompt ID:** `RUNTIME-REDESIGN-01`. §§0–5 are **Phase 1**, read against the tree at `869e2719` on
branch `dev`. §§5b–7 are **Phase 2**. Nothing below is a proposal; every claim names the file that
decides it.

- §0–§3 — Phase 1: method, the MAP, and the DELETION GUARD (twenty-seven items).
- §4, §5 — Phase 1's two open questions, **both now answered**: §4 carries the owner's correction
  in place, §5b is the answer to §5.
- §5b, §6 — the owner's answers, recorded in Phase 2.
- §7 — Phase 2's own record: the palette, what moved, what was held, and the contrast table.

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
twenty-seven are the ones §1.3 names; twenty are not.

## §3 — THE DELETION GUARD

For each: where it lives now, what it looks like after the redesign, and the test that proves it
still appears. **A ✅ test already exists and asserts the surface renders under its condition. A 🔴
test does NOT exist and is owed** — six of the twenty-seven, each verified by grep against
`apps/runtime/tests` rather than assumed. Five are owed by Phase 9; item 27 is owed by Phase 8,
which is the phase that builds the surface it guards.

⭐ **Item 27 was added in PHASE 2, by the owner's answer to §5.** It is the only entry that guards a
surface the reference does not draw _and that the owner has ruled must come back_ — everything
above it is a surface the redesign must not lose, while 27 is one the redesign must re-add.

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

### The audit log's WHO — added in Phase 2 by the owner's answer

**27. The actor column, the `B-143` caveat, and the console-name picker that writes it**
(`B-143`, `audit-actor-console-name`)
Now: three pieces of ONE surface, and the guard covers all three because deleting any one of them
silently empties the other two.
_The picker_ — `#audit-operator`, `AuditPanel.tsx:278-298`, labelled `This console`, placeholder
`unattributed`; the only writer of the actor in the product (`audit.setOperatorName` →
`platform/operatorName.ts` → `localStorage['cg.runtime.operatorName']`).
_The caveat_ — the sentence beside it: _"It is a LABEL you typed, not a verified sign-in — it says
which console, not which person, and it does not change when somebody else takes the chair."_
_The column_ — the `actor` header at `AuditPanel.tsx:331` and `entry.actor` in each row at
`AuditPanel.tsx:473`.
🔴 **The reference draws NONE of it.** Its audit table is `Time · UTC | Action | Item | Result` and
its detail list is `Time | Channel | Action`; there is no WHO anywhere in it. So this is the one
guard item where the redesign must ADD a surface back rather than merely preserve one.
After: **the picker stays**, made small and kept BESIDE the actor column in the audit panel; the
column comes back in the new tokens; the caveat stays where it is. It does NOT move to Station
setup — `stationSetupScope.dom.test.ts` asserts it is absent there, and moving it would separate
`B-143`'s caveat from the column it qualifies.
✅ **the caveat**, in three places, all green and none of which may be weakened:
`auditPanel.legibility.dom.test.ts:264-265`, e2e `audit-legibility.spec.ts:50`, and
`stationSetupScope.dom.test.ts:113-126` (which also asserts the field is in the AUDIT panel and
NOT in Station setup).
🔴 **the COLUMN has no test at all.** A tree-wide grep finds `actor` in `apps/runtime/tests` only
as FIXTURE data — no assertion anywhere that the table renders an actor header or that a row
displays `entry.actor`. Owed by **Phase 8**:
`apps/runtime/tests/auditPanel.actorColumn.dom.test.ts`, asserting the header, a row's value, and
the caveat beside them.

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

🔴 **The one that decides the phase is `stack`** — but NOT in the way this section first said, and
the correction is recorded here rather than edited away because Phase 7 would otherwise inherit a
finding that is too strong.

⚠ **SUPERSEDED, by the owner, 2026-09-07:** _"a second channel's rows cannot be addressed today"_ is
**wrong**. `itemId` identifies one STACK ITEM, which is one operator ROW, and
`StackItemStateSchema.slot` carries `{ channel, layer, server }` — **the channel lives INSIDE the
item, and the ids are globally unique.** So `stack.load`, `take`, `update`, `stop`, `out`, `remove`,
`setPosition`, `setActiveLook`, `swapLiveSource` and `setPlateVolume(s)` are **already
channel-agnostic**: a per-row verb reaches a row on any channel, because the row itself knows which
channel it is on. What is true is that no REQUEST carries a `channel` field, which is a different
and much smaller statement.

**THE REAL SINGLE-CHANNEL GAP IS EXACTLY THREE THINGS:**

1. **Five verbs take `z.void()`** — `removeAll`, `clearAll`, `stopAll`, `snapshot` and
   `silenceAllLivePlates` — and therefore mean _"everything the bridge knows about"_. That is the
   only place a channel cannot be named.
2. **There is no channel-discovery call on the contract at all.** Nothing asks the bridge what
   channels exist.
3. **`fixedLayers` declares ONE bank on ONE channel, and it is the app's only channel authority.**
   `features/channels/ChannelScope.tsx:30` reads `bank?.channel ?? 1` and builds a one-element tab
   array; `FixedLayerBankSchema.channel` is documented _"one channel per bank, v1"_.

⚠ And the trap that belongs beside that list: **`stack.silenceAllLivePlates` stays unscoped ON
PURPOSE.** It is the PANIC verb, and the scope of a panic is not the caller's to choose. Making it
channel-scoped would be a change to an emergency control's CONTRACT, not a widening of it. That is
the owner's call, and Phase 7 must not make it in passing.

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

## §5b — ANSWERED BY THE OWNER, 2026-09-07: THE PICKER STAYS

**The picker is KEPT. It is made SMALL, and it stays BESIDE the actor column in the audit panel.**
The objection recorded in `PROMPT.md` §8 point 8 was **visual clutter, not the capability** — so
the answer is a size and a placement, not a deletion.

**It is NOT relocated to Station setup**, and the two reasons are independent:
`stationSetupScope.dom.test.ts:113-126` asserts the caveat is not there, and moving the picker would
separate `B-143`'s _"self-declared and unverified"_ caveat from the column it qualifies — which is
the one thing `B-143` exists to prevent. **The caveat does not move. All three pinning tests stay
green and none of them is weakened.**

🔴 **The consequence for the build, and it is the reason this became guard item 27:** the
reference's audit table draws **no actor column at all**, so the redesign must **ADD IT BACK**,
dressed in the new tokens. That is a positive obligation, not a preservation, and it is filed as
§3's twenty-seventh guard item with the test it is owed — because a surface the reference does not
draw is exactly the kind that gets built out of existence.

**What the three options above resolved to:** (a) — with the correction that the picker stays in
the audit panel rather than moving to Station setup, which the option as originally written had it
doing. Options (b) and (c) are closed.

## §6 — THE EARLIER SETTINGS MOCKUPS: ABANDONED, NOT SUPERSEDED

`PROMPT.md` §7 says to mark `docs/design/station-setup-{mockup,redesigned}.html` superseded in one
line. **Owner, 2026-09-07: they are ABANDONED — not relevant, never committed, and not to be
committed.** They existed only in one machine's untracked working tree. §7's obligation is
discharged by this line; **Phase 7 must not chase them.**

## §7 — PHASE 2: WHAT THE PALETTE MOVE ACTUALLY DID

### 7.1 The rule that decided each role

`PROMPT.md` §2.1 names nineteen values and calls them ROLE tokens; it does not say which of the
app's ~120 roles takes which. That mapping is the phase's real work, so it was made mechanical and
written into `theme.ts` where the next phase will read it:

> **A role adopts a reference value IFF the reference declares a value for THAT role** — one of the
> nineteen in its `:root`, or a value its own CSS spells for that exact role (`.btn:hover`, the
> `input` border, `.btn.primary:hover`). Where the reference declares nothing for a role, the role
> KEEPS its value. The one extension is a value DERIVED from a role that moved — an alpha wash of
> the accent, a shared base constant — where the derivation is re-applied so a family stays one hue.

The rule matters because the alternative is taste, and taste is what produces a palette nobody can
audit against the drawing it came from.

### 7.2 What moved

The nineteen reference values live as module-private constants in `apps/runtime/src/renderer/theme.ts`,
transcribed from `04-playout-layers.html`'s `:root`. `@cg/ui` is **untouched** — it is shared with
the Designer and tokens-only by the design-system rule, so the Runtime's chrome moved OUT of
`chrome.*` and into its own token home rather than repainting the Designer from a Runtime reference.

| app role                                                                 | was                  | now                   | the reference role it took |
| ------------------------------------------------------------------------ | -------------------- | --------------------- | -------------------------- |
| `--r-surface-sunken` / `background`                                      | `#0F172A`            | `#0b1017`             | `--bg`                     |
| `--r-surface` / `panel`                                                  | `#111827`            | `#141b25`             | `--surface`                |
| `--r-surface-raised` / `panelMuted`                                      | `#1F2937`            | `#1b2532`             | `--raised`                 |
| `--r-field-bg`                                                           | `#0E1822`            | `#0e151e`             | `--inset`                  |
| `--r-border` / `border`                                                  | `#374151`            | `#2d3a49`             | `--line`                   |
| `--r-table-rule`                                                         | `rgba(55,65,81,.55)` | `#24303d`             | `--soft`                   |
| `--r-text` / `text`                                                      | `#E5E7EB`            | `#eef3f9`             | `--text`                   |
| `--r-text-muted` / `textMuted`                                           | `#9CA3AF`            | `#8e9eaf`             | `--muted`                  |
| `--r-accent`, `--r-btn-add`, `--r-ready`                                 | `#38BDF8`            | `#74cdf6`             | `--blue`                   |
| `--r-accent-fill`                                                        | `#153B56`            | `#173243`             | `--bluebg`                 |
| `--r-accent-lift`, `--r-toggle-on-hover`                                 | `#7DD3FC`/`#6DD3FB`  | `#a7e2fc`             | `.btn.primary:hover`       |
| `--r-accent-line`, `--r-rail-selected-line`                              | `#2F7BA8`            | `#31556a`             | `.badge.ready` border      |
| `--r-field-line`                                                         | `#2D4150`            | `#435367`             | `input` border             |
| `--r-control-hover-bg`                                                   | `#2C3A4E`            | `#304258`             | `.btn:hover`               |
| `--r-control-hover-line`                                                 | `#64748B`            | `#5e748b`             | `.btn:hover`               |
| `--r-success`, `--r-ok-text`                                             | `#10B981`/`#86EFAC`  | `#85e4b6`             | `--mint`                   |
| `--r-rehearsing` / `rehearsing`                                          | `#A78BFA`            | `#c3acff`             | `--purple`                 |
| `--r-caution-text`                                                       | `#FCD34D`            | `#f3cd88`             | `--amber`                  |
| `--r-danger-text`                                                        | `#FCA5A5`            | `#ffaaa7`             | `--red`                    |
| `--r-focus-halo`/`-menu-hover-fill`/`-divider-drag-fill`/`SELECTED_WASH` | `rgba(56,189,248,α)` | `rgba(116,205,246,α)` | derived from the accent    |

**Seven roles are NEW**, because the reference declares a value the app had no name for:
`--r-text-secondary` (`--secondary`), `--r-border-soft` (`--soft`), `--r-caution-bg`
(`--amberbg`), `--r-danger-bg` (`--redbg`), `--r-ok-bg` (`--mintbg`), `--r-rehearsing-bg`
(`--purplebg`), and `colors.textSecondary`. Nothing reads them yet; Phases 3–9 dress the surfaces
that want them.

⚠ One value outside the token home moved with them: **`apps/runtime/index.html`'s `--cg-ok`**, which
is a documented MIRROR of `--r-success` for the boot splash (the splash paints before the bundle and
cannot read a token). `splashCss.test.ts` asserts the two agree, so the lockstep is enforced rather
than remembered. **The rest of the splash family is HELD** — it is tuned for large tracked-out type on
a lifted ground and its own note forbids tying it to the chrome; the relationship that mattered (the
splash ground is LIGHTER than the console's) survives and is now wider than before.

### 7.3 What was HELD, and why

| held                                                                                                                                                         | why                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--r-onair` `rgb(44 255 122)`                                                                                                                                | 🔴 owner's exact value; the reference's mint is its ONE green for BOTH air and health — see 7.5                                                 |
| `colors.errorText` `rgb(255 28 28)`                                                                                                                          | 🔴 owner's exact value (`RUNTIME-FIX-0904`); it is the ink that failed AA — **superseded by PHASE 2A §8, which split it rather than moving it** |
| `--r-row-marked-fill` `rgb(145 93 5)`, `markedRowInk`                                                                                                        | the owner's measured pair; both unchanged, so **5.06:1 is unchanged**                                                                           |
| `--r-caution` / `pending` / `exit` `#F59E0B`                                                                                                                 | ONE token used as an INK and as a FILL; the reference splits those, and un-splitting it is a component edit                                     |
| `colors.error`, `--r-danger`, `--r-alarm-*`, `--r-toast-ok-*`, `--r-band-stripe-*`, `--r-notice-*`                                                           | the alarm/notice FILL families; the reference draws no dark fill, it draws ink-on-`*bg`. Phase 9 dresses them                                   |
| `--r-row-bg`, `--r-row-empty-bg`, `--r-table-head-bg`, `--r-row-selected-fill`                                                                               | the layer table's grounds — `PROMPT.md` §3 names its own hover `#1b2a3a` and selected `#192e40`, so Phase 3 takes them as one piece             |
| `--r-splash-*`                                                                                                                                               | its own family by its own documented rule; only the `--cg-ok` mirror moved                                                                      |
| `--r-accent-strong`, `--r-accent-fill-hover`, `--r-accent-line-hover`, `--r-accent-ink`, `--r-rehearsing-strong/mid/deep`, `--r-border-strong`, `--r-verb-*` | the reference declares no value for these weights; each keeps the relationship it had (a hover still LIFTS, a strong weight is still darker)    |

### 7.4 The geometry tokens (§2.2)

Declared, **read by nothing** — applying them is a LAYOUT change and Phase 2 changes no layout.
Phase 3 adopts the table against a measured property table in Playwright (jsdom has no layout,
golden rule 12c); declaring the numbers here is what makes that an adoption rather than a second
transcription.

`--r-row-pad: 16px 17px` · `--r-btn-h: 39px` · `--r-btn-h-small: 33px` · `--r-row-action-h: 34px` ·
`--r-icon-btn-box: 36px` · `--r-row-icon-btn-w: 32px` · `--r-row-icon-btn-h: 34px` ·
`--r-row-icon-btn-narrow-w: 30px`

⚠ **`--r-modal-foot-h` is unchanged at `59px` and is still a FLOOR.** None of the heights above may
be composed into it: a height that belongs to BEING a footer cannot be a function of what a section
puts in it (`B-240`, `station-setup-frame.spec.ts`).

### 7.5 🔴 THE CONTRAST TABLE — every semantic ink, re-measured against the new surfaces

WCAG 2.x relative luminance, the same arithmetic `emptiedAirRowContrast.dom.test.ts` uses. AA text
floor **4.5**; graphic/large-text floor **3.0**. Surfaces: `page` = `--r-surface-sunken`,
`panel` = `--r-surface`, `raised` = `--r-surface-raised`, `inset` = `--r-field-bg`,
`row` = `--r-row-bg` and `head` = `--r-table-head-bg` (both HELD for Phase 3).

| semantic ink                              | value             | page  | panel      | raised     | inset | row        | head       |
| ----------------------------------------- | ----------------- | ----- | ---------- | ---------- | ----- | ---------- | ---------- |
| text (primary)                            | `#eef3f9`         | 17.10 | 15.52      | 13.87      | 16.44 | 13.64      | 10.79      |
| secondary _(new, unused yet)_             | `#bbc8d7`         | 11.23 | 10.18      | 9.10       | 10.79 | 8.95       | 7.08       |
| muted                                     | `#8e9eaf`         | 6.96  | 6.31       | 5.64       | 6.69  | 5.55       | **4.39** ✗ |
| **ON AIR** _(sacred, held)_               | `rgb(44 255 122)` | 14.26 | 12.93      | 11.56      | 13.71 | 11.37      | 9.00       |
| ready / accent sky                        | `#74cdf6`         | 10.73 | 9.73       | 8.70       | 10.31 | 8.55       | 6.77       |
| caution amber _(ink, `--r-caution-text`)_ | `#f3cd88`         | 12.63 | 11.46      | 10.24      | 12.14 | 10.07      | 7.97       |
| caution amber _(fill role, held)_         | `#F59E0B`         | 8.88  | 8.06       | 7.20       | 8.54  | 7.08       | 5.61       |
| danger red as TEXT                        | `#ffaaa7`         | 10.50 | 9.53       | 8.52       | 10.10 | 8.38       | 6.63       |
| **errorText** _(owner's, held — see §8)_  | `rgb(255 28 28)`  | 4.94  | **4.48** ✗ | **4.00** ✗ | 4.75  | **3.94** ✗ | **3.12** ✗ |
| ok / success mint                         | `#85e4b6`         | 12.51 | 11.35      | 10.15      | 12.03 | 9.98       | 7.90       |
| rehearsing violet                         | `#c3acff`         | 9.69  | 8.79       | 7.86       | 9.32  | 7.73       | 6.12       |
| offline grey _(held)_                     | `#94A3B8`         | 7.44  | 6.75       | 6.03       | 7.15  | 5.93       | 4.70       |
| emptyRow _(owner's, held)_                | `rgb(91 93 96)`   | 2.89  | 2.62       | 2.34       | 2.78  | 2.30       | 1.82       |
| idle mark _(held)_                        | `#3F3F46`         | 1.83  | 1.66       | 1.48       | 1.76  | 1.46       | 1.15       |

⚠ **The last two rows are BELOW every floor and neither is a Phase 2 regression.** `emptyRow` is
the owner's exact value and its whole job is to RECEDE (an empty row must not compete with a row
that can do something); `idle` is a MARK, and `rowState.ts`'s rule pairs every state with its own
SHAPE and its own WORD so the hue is never the sole carrier. Both were below the floor before this
phase and both moved slightly UP. They are listed because "every semantic ink" means every one.

**Inks on their own companion ground, as the reference composes them** (all clear AA comfortably,
which is what the `*bg` pairs are for): blue on `--r-accent-fill` **7.50** · mint on `--r-ok-bg`
**8.48** · violet on `--r-rehearsing-bg` **7.16** · amber on `--r-caution-bg` **8.99** · red on
`--r-danger-bg` **7.89**.

**Fills with their inks, unchanged by Phase 2:** white on `colors.error` 8.31 · `--r-alarm-ink` on
`--r-alarm-bg` 9.16 · `--r-ink-on-band` on the skew band's amber 9.16 · `--r-toast-ok-ink` on
`--r-toast-ok-bg` 7.29 · white on `--r-danger` 4.83.

**The measured decisions of §2.3, restated exactly:**

| pair                                            | before  | after                                             |
| ----------------------------------------------- | ------- | ------------------------------------------------- |
| `markedRowInk` on `rgb(145 93 5)`               | 5.06:1  | **5.06:1 — UNCHANGED**                            |
| marked-row EDGE BARS on the same fill           | 3.86:1  | **3.68:1 — CHANGED**                              |
| _(positive control)_ `textMuted` on the fill    | 2.19:1  | 2.03:1 (still ≪ 3, so the remedy is still needed) |
| `text` on the fill                              | 4.498:1 | 4.99:1 (was a hair under AA, now clears it)       |
| `Notice` refusal detail on the amber fill       | 13.06:1 | 14.07:1                                           |
| `Notice` neutral detail on `--r-surface-raised` | 5.78:1  | 5.64:1                                            |
| `Notice` refusal ink on the amber fill          | 11.21:1 | 10.39:1                                           |
| `colors.error` as TEXT (the illegible one)      | 2.13:1  | 2.08:1                                            |

### 7.6 🔴 TWO THINGS FOR THE OWNER. Reported, and stopped at.

**(1) ✅ ANSWERED IN PHASE 2A — SEE §8. `errorText` fails AA on four of the surfaces it is used on.** `rgb(255 28 28)` is the
owner's exact value (2026-09-04, `RUNTIME-FIX-0904`) and Phase 2 did not touch it — the SURFACES
moved under it. It reads **4.48:1** on `--r-surface` (was 4.59:1, i.e. it was already marginal),
**4.00:1** on `--r-surface-raised` (was 3.80:1 — it was already FAILING there and Phase 2 improved
it) and **3.94:1** on the layer row and **3.12:1** on the table header. It is the row's ERROR mark, the header's in-error count, the
status bar's hard failure, the link indicator, the lock overlay's refusal, the Inspector's file error
and the audit log's `failed` outcome. ⚠ **Every one of those pairs a WORD and a SHAPE with the hue**
(`rowState.ts`'s rule), so nothing is unreadable — but the ink itself is below the floor and the
value is not this programme's to move. Two ways out, both the owner's: lift the ink, or darken the
surfaces those particular components sit on (a Phase 9 question about the status bar and the row).

**(1b) And one ink Phase 2 DID move now fails on ONE surface: `--r-text-muted` on the layer
table's HEADER.** `#8e9eaf` on `--r-table-head-bg` (`rgb(45 55 69)`) reads **4.39:1**, where
`#9CA3AF` read 4.74:1. It is the column-header labels. ⭐ **This one closes itself in Phase 3**: the
header ground is HELD only because `PROMPT.md` §3 takes the table's grounds as one piece, and the
reference's own row/header separator is `--soft` `#24303d`, on which the same ink reads **4.89:1**
and clears AA. It is named here rather than silently deferred, because a fail that is expected to
close is still a fail until the phase that closes it has run.

**(2) The reference has ONE green where this palette has two, and it is on the sacred colour.**
The reference spends `--mint` on `.badge.live` AND `.badge.success` AND the footer's `healthy` —
the same colour for "this is on air" and for "this connection is fine". This palette forbids that:
`--r-onair` is the owner's `rgb(44 255 122)` and `--r-success` is deliberately a different, softer
green so an ack flash on a button cannot be misread as an air claim. **Phase 2 gave `REF_MINT` to
the OK/healthy role — where it means what the reference means by it — and left `--r-onair` alone.**
So the console does not match the drawing on its single most safety-critical colour, on purpose, and
the owner is the one to settle which of the two rules wins. Nothing later in the programme should
resolve it in passing.

⭐ **And the severity split the guarded alarms depend on is INTACT and was checked, not assumed:**
the bridge-skew banner still fills with `colors.pending` (amber, `#F59E0B` held) and is still
incapable of reading red; the output alarm and the raster-mismatch banner still fill with
`colors.error` (red). No role token collapsed the distinction, because the alarm FILL family was
held as a whole.

### 7.7 What Phase 2 did NOT do

- **No layout, no behaviour, no refusal, no component structure changed.** The geometry tokens are
  declared and read by nothing.
- **`@cg/ui` is untouched.** ⚠ One residue, named so it is not read as an oversight: `@cg/ui`'s
  `theme.css` still paints `body` and the SCROLLBARS from its own `--cg-*` values. The app shell is
  `100vh` and paints `colors.background`, so no old ground is visible; the scrollbar thumb is still
  `--cg-border` `#374151`. Moving it is a `@cg/ui` change and is not this phase's to make.
- **The layer table's grounds and the alarm/notice fills are untouched** — Phases 3 and 9 own them,
  and each is listed in 7.3 with the reason.

## §8 — PHASE 2A: ONE ERROR RED BECAME TWO, BECAUSE IT WAS DOING TWO JOBS

**An owner-ordered addendum to Phase 2, 2026-09-08. Not one of the ten phases.** §7.6 (1) is
answered here and is superseded by it.

### 8.1 The owner's reading, which is the part worth carrying forward

Phase 2 reported `colors.errorText` (`rgb(255 28 28)`) below the **4.5 AA TEXT floor** on four of
the six grounds this palette puts it on. Against the **3.0 GRAPHIC floor** the very same ink passes
on all six, worst case 3.12. **So ONE TOKEN WAS DOING TWO JOBS WITH TWO DIFFERENT FLOORS, and the
answer is a SPLIT, not a re-tune.** The ink was never wrong; it was being asked two questions.

Neither half is a new colour. `--r-error-mark` keeps the owner's value byte for byte — not lifted,
not darkened, not derived. `--r-error-text` takes `REF_RED` `#ffaaa7`, the reference's own red,
already in the palette and already measured in §7.5.

⭐ **The generalisation, for whoever meets this shape again:** when a role fails one floor and
passes another, ask which floors its SITES actually answer to before touching the value. A token
worn by both a 25 px glyph and a 12 px sentence has no single correct contrast, and re-tuning it
can only trade one site's legibility for another's.

### 8.2 🔴 THE RE-MEASURED TWO-ROLE TABLE

| role                       | judged at | page  | panel | raised | inset | row  | head |
| -------------------------- | --------- | ----- | ----- | ------ | ----- | ---- | ---- |
| `--r-error-mark` (graphic) | **3.0**   | 4.94  | 4.48  | 4.00   | 4.75  | 3.94 | 3.12 |
| `--r-error-text` (text)    | **4.5**   | 10.50 | 9.53  | 8.52   | 10.10 | 8.38 | 6.63 |

🔴 **NO SITE IS LEFT BELOW ITS OWN FLOOR — and the claim is stronger than a site-by-site check.**
The MARK's worst reading across **all six** grounds is **3.12** (floor 3.0) and the TEXT's worst is
**6.63** (floor 4.5). Both clear on _every_ ground, so no site can fail regardless of which surface
it turns out to sit on — which is what makes this survivable when Phase 3 moves the table's grounds.

### 8.3 Every site, classified from what it RENDERS

Nine style declarations read the old token. ⚠ **Phase 2's own note named SEVEN of them and it was
wrong** — `OutputsSection.air` and `ChannelSection.verdict.mismatch` were missing. Both are WORD.
Each row below was resolved by reading the JSX, never the identifier:

| site                                                           | renders                                          | class    |
| -------------------------------------------------------------- | ------------------------------------------------ | -------- |
| `airStateVisual('error')` → `rowState` → `LayerRow` state cell | a 25 px `✕` **and** the word `ERROR`             | **BOTH** |
| `LayerTableHeader.errorCount`                                  | an 11 px `TriangleAlert` **and** the number      | **BOTH** |
| `StatusBar.failedHard`                                         | the ●/○ health LED **and** the word `OFFLINE`    | **BOTH** |
| `LinkIndicator` `disconnected`                                 | the ● dot **and** `DISCONNECTED — reconnecting…` | **BOTH** |
| `LockOverlay.error`                                            | the refusal sentence                             | WORD     |
| `FromFileControl.error`                                        | the file-error sentence                          | WORD     |
| `AuditPanel.outcomeFailed`                                     | `entry.outcome`                                  | WORD     |
| `ChannelSection.verdict.mismatch`                              | `MISMATCH — every graphic … is mis-placed`       | WORD     |
| `OutputsSection.air`                                           | `AIR — … Nothing on this channel reaches air.`   | WORD     |

**The four BOTH sites take both tokens**, each at the seam that already existed rather than at a new
one: `airStateVisual` gained an optional `labelColor` (present only where the mark and the word
must differ, absent everywhere else so no other state's word stops inheriting its mark);
`healthDotStyle` gained one branch; `LinkIndicator` states its `dotColor` explicitly instead of
falling through; the header tally passes a style to its `Icon`.

⚠ **THE ONE GENUINELY AMBIGUOUS CALL, declared rather than guessed silently.** The status bar's
`⚠ NO SERVER — SIMULATED` carries a warning GLYPH **inside the string**, at text size, in the same
text run as the words. **Classified WORD.** Two reasons: a character in a text run is judged as
text, not as a graphical object; and giving it its own colour would mean splitting a sentence into
two elements, which is a structure change this phase forbids. If the owner wants that glyph loud,
it is a deliberate edit, not a classification.

### 8.4 What is asserted, and why it is asserted that way

- `theme.test.ts` — **the two error roles are DISTINCT**, the ERROR state hands the mark to the
  icon and the text to the label, and **every other state leaves `labelColor` absent** so the split
  cannot leak into states whose mark and word may legitimately agree.
- `statusBar.linkTransition.dom.test.ts` — the down-server LED takes the mark **and** the word
  takes the text. Both halves, positively: a split whose word half is unasserted is a split that
  can silently collapse back onto the mark.
- ⭐ **One literal IS pinned, and only one:** `colors.errorMark === 'rgb(255 28 28)'`. It is the
  value the owner fixed by name, so if it ever moves it must be because he moved it. Everything
  else is asserted as a property (`PROMPT.md` §11).

## §9 — THREE MORE OWNER ANSWERS, 2026-09-08

**A4 · 🔴 TWO GREENS IS A RULE, NOT AN OVERSIGHT.** §7.6 (2) is answered: the reference spends one
mint on `.badge.live`, `.badge.success` and the footer's `healthy`; the console keeps `--r-onair`
distinct at `rgb(44 255 122)`. **Vivid saturated = ON AIR, pastel mint = healthy.** An operator must
never read _"the bridge is fine"_ as _"this row is on air"_, and the standing decision that alarm
severity follows AIR-CRITICALITY cannot survive one hue carrying both meanings — if healthy and
on-air are the same green, _"is anything on air?"_ stops being answerable by looking.
**Here the drawing is wrong and the console is right.** Not an open question; not for a later phase
to resolve in passing.
✅ **Pinned by assertion**, in `theme.test.ts`: `--r-onair` is NOT `--r-success` and NOT
`--r-ok-text`, with a positive control proving the comparison can fail. It asserts that they
DIFFER, never what either is — a test pinning `rgb(44 255 122)` would go red at the next palette
tune while saying nothing about the property (the §11 rule, and the one `splashCss` was rewritten
for in Phase 2).

**A5 · The marked-row edge bars at 3.68:1 are CORRECT and STAY.** `controls.css`'s own rule says
they follow the notice's ink, and holding 3.86:1 would have kept a MEASUREMENT while discarding the
DESIGN it measured. Above the 3:1 graphic floor. **Closed, not owed** — §7.5's row stands as the
record of the change, not as an outstanding item.

**A6 · `--r-text-muted` at 4.39:1 on the table header is an ACCEPTED FAIL that Phase 3 closes.**
It stays on the owed list **until Phase 3 has actually run** — not before. The reference's own
row/header separator is `--soft`, on which the same ink reads 4.89:1; that is the expectation, and
an expectation is not a discharge.

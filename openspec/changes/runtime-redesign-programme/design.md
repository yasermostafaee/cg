# The map, the deletion guard, the owner's answers, and the palette

**Prompt ID:** `RUNTIME-REDESIGN-01`. §§0–5 are **Phase 1**, read against the tree at `869e2719` on
branch `dev`. §§5b–7 are **Phase 2**. Nothing below is a proposal; every claim names the file that
decides it.

- §0–§3 — Phase 1: method, the MAP, and the DELETION GUARD (twenty-seven items).
- §4, §5 — Phase 1's two open questions, **both now answered**: §4 carries the owner's correction
  in place, §5b is the answer to §5.
- §5b, §6 — the owner's answers, recorded in Phase 2.
- §7 — Phase 2's own record: the palette, what moved, what was held, and the contrast table.
- §8, §9 — Phase 2A (the error red split) and three more owner answers.
- §10 — **Phase 3**: the layers table measured in Chromium, the prompt's dead-CSS numbers, the
  corrected geometry tokens, A6 closed at 4.89:1, the red-first Update proof, guard item 11.

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

🔴 **TWO ROWS OF THIS TABLE WERE WRONG, AND `AUDIT-CLOSE-01` C1 CORRECTS THEM IN PLACE.** They are
corrected rather than quietly updated because the ERROR is the finding, not the fix:

- **`App header, brand block` — recorded as "no equivalent — the app has no top header", and then
  never revisited by any property table in ten phases.** An absence was written down and became a
  fact nobody re-opened; worse, §12.3 went on to USE it as an argument, placing the monitors toggle
  in the Layers bar because _"the app has no app-head"_. An unmeasured absence justified a
  placement, and the justification was the absence itself. The header is built (`AppHeader`), the
  argument in §12.3 is struck at its own row, and the general rule is now `AUDIT-CLOSE-01` D: `the
app has no X` where X was never measured is not a reason.
- **`Search, Hide empty, counts, results hint` — recorded as ALREADY BUILT, citing a
  `LayersPanel.tsx` sub-bar and `features/layers/layerTable.ts`. Neither existed.** `LayersPanel.tsx`
  contained no text input at all and `layerTable.ts` is density arithmetic (`densitySpec`,
  `gridTemplateColumns`, `resolveDensity`). Because the map said the app already had it, the
  reference's sub-bar never entered §10.2's property table and was never argued either way — it was
  not adopted and it was not refused; it was invisible. It is built (`layerFilter.ts` + the
  sub-bar), with an override the reference has no equivalent for.

⭐ **Both are the same failure and it is worth naming once: a MAP is not evidence.** This table was
written by reading the tree, and two of its rows were wrong in the two directions that both hide a
delta — one claimed an absence that was never tested against the drawing, the other claimed a
presence that was not there. Every later phase read the map instead of the surface.

| Reference surface                                  | Today                                                                  | Bridge channel                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| App header, brand block                            | 🔴 **BUILT** — `features/shell/AppHeader.tsx` (was: "no equivalent")   | — (it carries doors and the channel strip)                  |
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
| Search, `Hide empty`, counts, results hint   | 🔴 **BUILT** — `LayersPanel.tsx` sub-bar + `layers/layerFilter.ts` | `stack.snapshot` / `stack.onStateChanged`                         |
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
test does NOT exist and is owed** — six of the twenty-seven at Phase 1, each verified by grep
against `apps/runtime/tests` rather than assumed. Phase 3 discharged item 11, so **four are owed by
Phase 9**; item 27 is owed by Phase 8, which is the phase that builds the surface it guards.

🔴 **PHASE 9 PLANT-TESTED EVERY ENTRY (§16.1), because a ✅ above was a claim about a test's
EXISTENCE, not about what it guards.** Each item's render was deleted (or its condition made
unreachable) and the whole suite run: twenty-one of the twenty-two unit-guarded entries reddened
as their ✅ promised, two entries (19, 20) are Playwright-only by design and reddened there, the
four 🔴 entries stayed green exactly as the ledger said and now have the tests that redden, item 16
was found riding on a digit test alone and has its own, and item 28 has nothing to plant. The
per-entry result, with the plant and the reddening file, is the table in §16.1.

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
🔴 **No test existed.** `apps/runtime/tests/bridgeSkew.test.ts` covers `shared/bridgeSkew.ts` — the
message shaping and the connect-time handshake — and never renders the banner.
✅ **DISCHARGED BY PHASE 9 (§16.1, §16.6).** The plant that made the render unreachable left all
1318 tests green; `apps/runtime/tests/bridgeSkewBanner.dom.test.ts` (5) now reddens under it —
presence on a reported skew, silence on `null` and `[]`, the bridge's push followed, the names
relocated to `title` (`B-152`), and AMBER-NEVER-RED by token identity against the three alarm
fills. Dressed in the reference's warn pair (`--r-caution-text` on `--r-caution-bg`).

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
🔴 **No test existed — no test file in the tree referenced this component at all.**
✅ **DISCHARGED BY PHASE 9 (§16.1, §16.6).** The plant left 1318 green;
`apps/runtime/tests/rasterMismatchBanner.dom.test.ts` (7) now reddens under it — `mismatch`
renders naming both rasters and the air remedy (`B-236`); `unreadable` (a null raster AND an
unanswered channel), `unconfigured` and `match` render nothing; adoption clearing the mismatch
takes it down; it fills with the error role and never the caution ground (A4 / 2A).

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
🔴 **No test existed.**
✅ **DISCHARGED BY PHASE 9 (§16.1, §16.2, §16.6) — and `B-172` CLOSED.** The plant left 1318
green; `apps/runtime/tests/failoverBanner.dom.test.ts` (9) now reddens under it. The banner is an
in-flow STRIP whose tone is the situation's by token identity (a manual success → the neutral
notice pair, `status`; an automatic failover → the caution pair, `alert`; an unhealthy primary
→ `colors.error`, `alert`, no Dismiss); the `offline-mock` suppression moved from `App.tsx` INTO
the component and is asserted with its positive control; dismissal keyed by the event's
timestamp; the `--r-alarm-*` family deleted.

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
✅ **DISCHARGED IN PHASE 3** — `apps/runtime/tests/layersPanel.restoreMigrations.dom.test.ts`, six
cases: _"a row that came back on a DIFFERENT row is announced — by its row name, with where it came
from and where it landed"_, _"a DEMOTED row says it came back NOT on air, and what to do before
taking it"_, the no-false-alarm case, its own seam beside the skips strip, and content-keyed
dismissal. Written BEFORE Phase 3 restructured the file it lives in (§10.6). Until then
`data-restore-migrations` occurred in exactly one file in the tree, the component.

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
✅ **PHASE 9 (§16.5):** the plant reddened the trap suite (4) and two digit cases; the LOOK was
taken (`Console locked`, the icon box, the mono PIN field, `Unlock console` full width) over the
app's own scrim and card, and the CONTRACT is now pinned in its own right by
`apps/runtime/tests/lockOverlay.contract.dom.test.ts` (6): not a `<dialog>`, no dismiss control,
every control is the release path, Escape and the scrim do nothing, a wrong PIN leaves it up, and
only `engaged: false` takes it down.

**16. Engage-lock dialog**
Now: `features/lock/EngageLockDialog.tsx`, opened from `StatusBar.tsx:568`, sends `lock.engage`.
Confirms the PIN and refuses to lock unless the two entries match.
After: Station setup's `Lock console` editor, as the reference draws it.
✅ but thinly: `apps/runtime/tests/numericInput.dom.test.ts` —
_"a Persian-typed engage PIN is stored in Latin (StatusBar → lock.engage)"_ — asserts digit
normalisation through this dialog, not that it appears; e2e
`apps/runtime/tests/e2e/lock-prompt-enter.spec.ts` covers the prompt. Phase 9 should strengthen
this to a presence-and-confirmation assertion rather than leave it riding on a digit test.
✅ **STRENGTHENED BY PHASE 9 (§16.1, §16.6):** both plants (the mismatch refusal removed; the
bar's door wired shut) reddened ONLY through `numericInput.dom.test.ts`;
`apps/runtime/tests/engageLockDialog.dom.test.ts` (5) now asserts the dialog in its own right —
two fields and the advisory, the short-PIN and mismatch refusals with their sentences and no
engage, the match engaging once, Cancel as a way out of ENGAGING and not of the lock.

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
🔴 **No test existed** — no file under `apps/runtime/tests` referenced `Tooltip`.
✅ **DISCHARGED BY PHASE 9 (§16.1, §16.6).** The plant that unmounted it from `App` left 1318
green; `apps/runtime/tests/tooltip.dom.test.ts` (4) now reddens under it — the delegation
contract: a control opts in by its `title` alone, the bubble appears after the dwell with the
title's text, the native title is blanked while it is up and restored exactly on leave, Escape
dismisses, and a control with no title shows nothing. Placement is not asserted in jsdom (12c).

**23. App-wide native context-menu suppression, with editable fields exempt**
Now: `App.tsx:74-131` (`isEditable` + `suppressNativeMenu`). On a playout machine Reload and Back
leave the running show; text inputs stay exempt because the Inspector is where Persian copy is
typed and the browser's BiDi and spelling services are real editing affordances.
After: preserved, UNCHANGED, and both wired right-click doors Phase 6 added (the row's menu and
the plate's dialog) call `preventDefault` themselves only when they opened something.
✅ **DISCHARGED BY PHASE 6, before that phase touched right-click:**
`apps/runtime/tests/contextMenuSuppression.dom.test.ts` on the whole `App` — (1) a right-click on
chrome with no menu of its own is cancelled, (2) the same right-click in an Inspector text field
is NOT, (3) the row's own menu still opens with the native one cancelled. Each half was taken RED
against its own plant in `App.tsx` (§13.6) and (3) stayed green under both.

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
✅ **DISCHARGED BY PHASE 8 (2026-09-08; `§15.6`).** The column is BUILT BACK in the new tokens —
`Actor`, second, between `Time` and `Action`; a row's cell carries `entry.actor` verbatim in its
own `<bdi>` — the console field is SMALL (132 px, the select's height) in ONE strip with the
caveat, and that strip sits above the table over its first columns. Five tests in
`auditPanel.actorColumn.dom.test.ts` (the header and its order, the cell and its isolate, the
strip's co-location and position, the field as the one writer with the wire limit, the actor
FILTER); the geometry in `e2e/library-audit-geometry.spec.ts`. **RED FIRST by a plant that
removed the header and the cell: the three column tests went red and the caveat's three older
tests STAYED GREEN — which is precisely the hole this item named.** The three caveat tests are
unchanged. What is still owed after this: **Phase 9** re-dresses items 1–26 and writes the four
owed tests (`9.3`); **Phase 10** re-runs the guard end to end. Nothing of item 27 remains owed.

### Closed by evidence — added in Phase 7 by owner question A15

**28. The audio dialog's MUTE button** (`LivePlateAudioDialog.tsx` at `c5d07d9a~1`, lines
227–241) — **CLOSED, a DELIBERATE removal, decided at the wire (`§14.0`).** Phase 6 removed it to
the reference's MUTE-less verb row and called it "OFF's twin" without evidence beside the claim;
A15 asked for the evidence. It is: MUTE's handler was `commit({ [plate.sourceId]: 0 })` and OFF's
is `commit({ [plate.sourceId]: 0 })` — the same map through the same channel
(`stack.setPlateVolumes`) to the same bridge method (`setLivePlateVolume(item, plate, 0)`) to the
same and only audio verb the builder has (`mixerVolume` → `MIXER c-l VOLUME 0`); the same intent
record (`#plateVolumes`), published as `StackItemState.plateVolumes`, adopted at boot and
re-asserted at every seat; no mute flag anywhere in the schema, the ledger, retention or the
persisted-key census. Not lost by accident: OFF reaches every state MUTE reached and one more (a
silent plate can be told OFF, which re-sends the same `VOLUME 0`). Its tests were re-pointed to
OFF in Phase 6 (`livePlateAudio.dom.test.ts`). Nothing to add back.

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

✅ **FILED by Phase 7 (2026-09-08) as `R-062`** — the three gaps as one PRD item, with the trap
written into its acceptance: `silenceAllLivePlates` is not re-scoped by that item either; its scope
is the owner's decision, recorded there as a question and not as a task. Phase 7 built what this
paragraph allows (`§14.2`) and nothing on the bridge: `git diff --stat` over `tools/caspar-bridge`
is empty and over `packages/shared-ipc` is one pure token helper (`videoModeScan`).

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

⚠ _Historical values._ Phase 3 found these transcribed from the stylesheet's dead first wave and
corrected the `--r-row-*` family to the rendered numbers (§10.3); **`--r-row-icon-btn-narrow-w` was
DELETED in Phase 4 under owner answer A9** (§11.1) — it does not exist in the token home any more.

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

## §10 — PHASE 3: THE LAYERS TABLE, MEASURED — AND WHAT THE PROMPT GOT FROM DEAD CSS

**Phase 3, 2026-09-08.** Read against the tree at `41a01ed7`. Method first, because the finding
depends on it: the reference was not read as a stylesheet, it was **rendered in Chromium and
measured** (`getComputedStyle` + `getBoundingClientRect` on the real elements, at 1280 × 800, with
the pointer moved onto a row and a verb for the hover readings and a row clicked for the selected
one), and the app was measured the same way against its built `dist/` booted as the e2e harness
boots it. Golden rule 12(c): a geometry claim is measured in a real engine or it is not measured.

### 10.1 🔴 What contradicted the prompt — §3's numbers come from rules the prototype does not draw

`PROMPT.md` §3 names `16px 17px` cells, `55px · 135px · 33%` columns, hover `#1b2a3a`, selected
`#192e40` with `inset 3px 0 0`, a `.row-title` empty-row treatment, `min-height 34px` text verbs,
`32 × 34` icon verbs and a destructive group split off by a left border with 30 px buttons. **Every
one of those is in the reference's stylesheet, and none of them is what the reference paints.**

The prototype's single `<style>` (lines 7–307) was appended to in **four waves**, each restating
`.layer-table` at equal or higher specificity, so the LAST wave wins in a browser:

| property               | wave 1 (what §3 quotes)                                                          | wave 4 (what a browser paints)                                    |
| ---------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| cell                   | `td{padding:16px 17px}`                                                          | `…>td{height:67px;padding:15px 12px}`                             |
| columns `#`/State/Name | `55px · 135px · 33%`                                                             | `46px · 162px · auto · 30% · 372px`, `table-layout:fixed`         |
| `min-width`            | `835px`                                                                          | `980px`                                                           |
| hover                  | `tr:hover{#1b2a3a}`                                                              | `tr[data-select-row]:hover{#1F2937}`, empty rows do not react     |
| selected               | `#192e40` + `inset 3px 0 0 var(--blue)`                                          | `rgba(56,189,248,.1)` + a **2 px inset frame on all four sides**  |
| row verbs              | `.row-actions .btn 34px`, `.icon-btn 32×34`, `.destructive-group .icon-btn 30px` | `.row-verb{width:48px;height:36px}` ×6 in `repeat(6,48px)` gap 12 |
| empty-row title        | `.empty-row .row-title{#8899ac;400}`                                             | `.empty-row .row-name{rgb(91 93 96);500}`, template italic        |
| header                 | `th{padding:11px 17px;#101a26}`                                                  | `th{padding:5.6px 12px 4.8px;#2d3745;#9CA3AF;.62rem 700 .06em}`   |

And the second half, which settles it: **`.row-title`, `.destructive-group`, `.row-actions .btn`
and `.row-actions .icon-btn` match NO element the prototype emits.** Its row renderer (line 460)
writes six `<button class="row-verb" data-verb-tone=…>` in one `.row-actions` grid under a
`.verb-labels` row reading `Item · Play · On PVW · Next · Stop · Clear`, a `<bdi class="row-name">`,
a `.template-cell`, and a `.bed-divider` row. There is no text verb, no destructive group and no
`.row-title` anywhere in the markup or the script. The dead selectors are an earlier iteration
left in the file.

**The rendered table is this console's own table.** Wave 4 is the app's layer table transcribed
into the prototype in the app's pre-Phase-2 hexes — `#111827`, `#1F2937`, `#38BDF8`, `#9CA3AF`,
`#4B5563`, `rgb(91 93 96)` and `rgb(44 255 122)` (the owner's exact empty-row and on-air values),
67 px rows, `15px 12px` cells, `48 × 36` verbs, the 2 px selection frame that `controls.css` says
_replaces a 4px left bar, which the mock-up supersedes_. Phase 2's geometry tokens were transcribed
from wave 1, so they too described the dead iteration.

**What this phase did about it, and did not.** `PROMPT.md` §0 says the approved thing is the
LOOK, and the look is what the file renders. So the table was NOT moved to the dead numbers:
shrinking the verbs from 48 × 36 to 32 × 34 and 30 would have cut a hit target the column model
documents as a floor never traded away, on the one surface pressed under time pressure, to match a
drawing nobody can see. Instead the geometry tokens were **corrected to the rendered values and
wired** (10.3), every delta against the RENDERED reference was measured and fixed or argued (10.2),
and the dead-rule token (`--r-row-icon-btn-narrow-w`) was kept, documented as dead, read by
nothing, for the owner's decision. ⚠ **If the owner in fact wants the wave-1 iteration — the
smaller verbs, the left-bar selection, the 16/17 cells — that is a token flip in one file and a
decision the report asks for, not something to infer from a stylesheet's first draft.**

🔴 **CORRECTED BY `AUDIT-CLOSE-01` C2, 2026-09-09 — "in the app's pre-Phase-2 hexes" WAS TRUE AND
WAS NOT THE WHOLE FACT, and the missing half is what turned "palette" into an escape hatch.**

Measured again in Chromium on `04-playout-layers.html`, this time reading the prototype's OWN
variable block beside the elements it paints:

| the prototype DECLARES | the prototype's layer table PAINTS                                  |
| ---------------------- | ------------------------------------------------------------------- |
| `--line: #2d3a49`      | `th` and `td` border-bottom `1px solid rgb(55, 65, 81)` = `#374151` |
| `--soft: #24303d`      | `th` background `rgb(45, 55, 69)` = `#2d3745`                       |
| `--muted: #8e9eaf`     | `th` color `rgb(156, 163, 175)` = `#9ca3af`                         |

The three declared values are, exactly, what Phase 2 took for `--r-border`, `--r-border-soft` and
`--r-text-muted`. **So the prototype declares this console's palette and then paints its table with
literals that override it** — which means "ARGUED: palette" (the same ROLE at two values, one of
them the app's old hex) was never a like-for-like mapping on this surface. There is no role to map:
the reference is not using its own role here, and `PROMPT.md` §0 says the approved thing is what it
RENDERS.

Two of the six colours §10.2 disposed of with that one word are the ones an operator sees at a
glance, and the `AUDIT-CLOSE-01` audit measured what they cost: the table read FLAT where the drawing
has a lid over the rows. Both are now adopted at the reference's own rendered values, with the ink
that comes with the ground (§10.2's three amended rows, and `--r-layer-head-bg` in the token home).
The other four — the verb at rest, the ON PVW hover, the loaded-row hover and the selection — are
NOT touched here and are a later item; this note is what stops them being read as settled.

⚠ **A6 IS NOT REVERSED, and the distinction matters.** A6 forbade re-tuning `--r-text-muted`, and it
has not moved: the layer table's header was given its own ink role at the reference's own literal, so
the change is scoped to one surface. Phase 3's reasoning — take the ground, not the ink — was right
about the tools it had; what it did not have was the reading that the reference clears AA here with a
PAIR. Every ink on the new ground was re-measured (labels 4.74:1, on-air tally 9.00:1, refused number
6.63:1, refused mark 3.12:1 against its 3.0 graphic floor), and the 6.63 and 3.12 are the same two
numbers §8.2 recorded in its `head` column — that table was measured on THIS ground, before Phase 3
moved it.

✅ **ANSWERED (2026-09-08, before Phase 4 — owner answers A8 and A9, §11.1).** Wave 1 is
REJECTED: nobody ever saw it rendered, and `32×34` with a 30 px destructive group shrinks the STOP
and CLEAR targets on an on-air console; `48 × 36` stays and no later phase reopens it. And the
dead-rule token was DELETED, not kept: a token read by nothing with a comment saying it is dead is
a trap. `PROMPT.md` §0 now carries the rendered-not-authored rule and §3 is marked superseded in
place (commit `0572102e`).

### 10.2 🔴 THE MEASURED PROPERTY TABLE — rendered reference vs app, every delta FIXED or ARGUED

Both columns are Chromium readings. "Palette" means the same ROLE, whose value Phase 2 moved by
the owner's mapping rule; the prototype's table keeps the app's OLD hex for that role as a literal.

| property                   | reference (rendered)                                                               | app (after this phase)                                                                                                                          | verdict                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| row height                 | 67 px                                                                              | **67 px** = 15 + 36 + 15 + 1                                                                                                                    | identical                                                                                                                                          |
| cell padding               | `15px 12px`                                                                        | `15px 12px` — `--r-row-pad`, now READ                                                                                                           | identical; **FIXED** (token wired)                                                                                                                 |
| verb box ×6                | 48 × 36, radius 4                                                                  | 48 × 36, radius 4 — `--r-row-icon-btn-w/-h`                                                                                                     | identical; **FIXED** (token wired)                                                                                                                 |
| verb grid                  | `repeat(6,48px)`, gap 12                                                           | `repeat(6,48px)`, gap 12 — `--r-row-verb-gap`                                                                                                   | identical                                                                                                                                          |
| verb glyph                 | 20 px                                                                              | **20 px** (was 17) — `--r-row-verb-glyph`                                                                                                       | **FIXED**                                                                                                                                          |
| verb at rest               | `#1F2937` / `#4B5563` / `#E5E7EB`                                                  | `--r-surface-raised` / `--r-border-strong` / `--r-text`                                                                                         | ARGUED: palette                                                                                                                                    |
| verb disabled              | transparent, `#9CA3AF`, opacity .6                                                 | transparent, `--r-text-muted`, opacity .6                                                                                                       | identical up to palette                                                                                                                            |
| verb hover, per tone       | `#ff0000 #22dd7a #2ebea1 #b38d18 #de5105`, ink `#10151f`                           | the same six `--r-verb-*`, ink `--r-ink-on-verb`                                                                                                | identical (pinned by `rehearse-layout.spec.ts`)                                                                                                    |
| ON PVW hover               | `#2c3a4e`, ink `#f4ecff`                                                           | `--r-control-hover-bg` `#304258` / `#5e748b`                                                                                                    | ARGUED: both are the reference's; Phase 2 mapped the control-hover role to its `.btn:hover`                                                        |
| header ground              | `#2d3745`                                                                          | `#2d3745` — `--r-layer-head-bg`. Phase 3 took `--soft` `#24303d`; see the supersession note                                                     | **FIXED** — A6 at Phase 3, the reference's own pair at `AUDIT-CLOSE-01` C2                                                                         |
| header ink                 | `#9CA3AF` (a literal, 4.74:1)                                                      | `#9ca3af` — `--r-layer-head-ink`, **4.74:1**. Phase 3 kept `--r-text-muted` `#8e9eaf` at 4.89:1                                                 | **FIXED at `AUDIT-CLOSE-01` C2** — a NEW role, so `--r-text-muted` still does not move (A6)                                                        |
| header type                | 9.92 px 700 .06em uppercase, `5.6px 12px 4.8px`                                    | 9.92 px 700 .06em uppercase, `5.6px 12px 4.8px`                                                                                                 | identical                                                                                                                                          |
| header height              | 25.8 px                                                                            | 28.3 px                                                                                                                                         | ARGUED: `B-224`'s State tally wraps inside the head; the reference has no tally                                                                    |
| verb labels                | `Item · Play · On PVW · Next · Stop · Clear`, 9.28 px 700 .02em, uppercased by CSS | the same six words, 9.28 px 700 .02em, uppercase                                                                                                | identical (the DOM text is upper-case; the paint is the same)                                                                                      |
| `#` / name / template type | 13.6 px 700 muted / 16.8 px 600 / 13.6 px 400 centred                              | the same three                                                                                                                                  | identical                                                                                                                                          |
| state mark and word        | 25 px svg; 11.52 px 700 .05em                                                      | 25 px svg; 11.52 px 700 .05em                                                                                                                   | identical                                                                                                                                          |
| columns                    | 46 / 162 / auto / 30% / 372, `table-layout:fixed`                                  | 34 / 150 / [150–220] / [160+, 2fr] / 348 + 12 gap                                                                                               | ARGUED: `B-224`'s measured columns (the longest real Persian name, the tally) are the owner's later decision; contents start at the same x (58 px) |
| table `min-width`          | 980 px, then a horizontal scrollbar                                                | none — the density model narrows text, never a verb                                                                                             | ARGUED: `R-033` / `layerTable.ts`: a control is never clipped and the list never scrolls sideways                                                  |
| loaded row at rest         | `rgb(30 38 51)`                                                                    | `--r-row-bg` `rgb(30 38 51)`                                                                                                                    | identical                                                                                                                                          |
| loaded row hover           | `#1F2937`                                                                          | `--r-surface-raised` `#1b2532`                                                                                                                  | ARGUED: palette (the reference's literal IS the old raised surface)                                                                                |
| empty row, and its hover   | `#10141E`, unchanged under the pointer                                             | `--r-row-empty-bg` `#10141E`, unchanged                                                                                                         | identical                                                                                                                                          |
| empty row text             | `rgb(91 93 96)`; name 500; template italic                                         | `colors.emptyRow` `rgb(91 93 96)`; 500; italic                                                                                                  | identical                                                                                                                                          |
| selected                   | `rgba(56,189,248,.1)` + 2 px `#38BDF8` frame                                       | `--r-row-selected-fill` + 2 px `--r-accent` frame                                                                                               | ARGUED: palette (same design; the accent moved in Phase 2)                                                                                         |
| row rule                   | `1px #374151`                                                                      | `1px --r-row-rule #374151` (was `--r-border` `#2d3a49`)                                                                                         | **FIXED at `AUDIT-CLOSE-01` C2** — 1.48:1 against a loaded row, from 1.31:1                                                                        |
| Graphics-beds band         | 25 px, `4px 12px`, `#111827`, top rule `#4b5563`, 10 px 700 untracked              | **25 px, `4px 12px`, `--r-surface`, top rule `--r-border-strong`** (was 27.9 px, `8px 9.6px 4px`, transparent, `--r-border`); 9.92 px 700 .06em | **FIXED** (band); ARGUED (type keeps the sticky header's voice)                                                                                    |
| band text                  | GRAPHICS BEDS — BELOW LIVE PLATES                                                  | GRAPHICS BEDS — BELOW THE LIVE PLATES                                                                                                           | ARGUED: wording is not this phase's (§0: nothing translated, nothing reworded)                                                                     |
| Stop all / Clear all hover | `#b38d18` / `#de5105`, ink `#10151f`                                               | `--r-verb-stop` / `--r-verb-clear`, ink `--r-ink-on-verb`                                                                                       | identical (now pinned in Playwright)                                                                                                               |
| Remove all, withheld       | disabled: `#1d2733`, no hover                                                      | disabled: transparent, no hover (`R-017`)                                                                                                       | identical in kind                                                                                                                                  |
| top-bar button box         | 32 px, `5px 8px`, quiet (transparent, `--line`, `--secondary`)                     | 28 px, `0 12px`, neutral (raised)                                                                                                               | ARGUED: `--r-panel-bar-h` — a panel bar decides its controls' height, and the bulk verbs are neutral by item 10's rule                             |
| Look buttons               | 38 px tall, min-width 100                                                          | 36 px tall                                                                                                                                      | ARGUED: unchanged by this phase; the target is kept large (above the verb floor)                                                                   |

**What the owner will see change on screen:** the sticky column header is a shade darker (the
`--soft` ground); the Graphics-beds band is a tighter 25 px rule instead of a 28 px label; the six
verb glyphs are a size larger inside unchanged boxes. Nothing else moved — the rest of the table was
already the rendered reference, up to the palette Phase 2 applied.

### 10.3 The geometry tokens — corrected and, for the first time, read

`theme.ts` now carries `LAYER_ROW_PX` (`padY 15 · padX 12 · verbW 48 · verbH 36 · verbGap 12 ·
verbGlyph 20 · bedDividerH 25`), each cited to the RENDERED rule, and derives `--r-row-pad`,
`--r-row-action-h`, `--r-row-icon-btn-w/-h`, `--r-row-verb-gap`, `--r-row-verb-glyph` and
`--r-bed-divider-h` from it. `layerTable.ts` does its arithmetic on the same object instead of
spelling `36`, `48`, `12` and `15` a second time; `.cg-btn--verb`, `.cg-btn--neutral`, the row, the
header and the band read the tokens. `--r-btn-h`, `--r-btn-h-small` and `--r-icon-btn-box` are
untouched — `.btn`, `.btn.small` and `.icon-btn` are live rules for surfaces later phases dress.

### 10.4 🔴 A6 — closed, with the number

`#8e9eaf` on the header ground: **4.39:1** on `rgb(45 55 69)` (the accepted fail) → **4.89:1** on
`--soft` `#24303d`. Above the 4.5 AA text floor. Measured twice: by the WCAG arithmetic in this
record, and in Chromium by `layer-table-geometry.spec.ts`, which computes the ratio from the colours
the browser actually resolved on the header and asserts ≥ 4.5. The ink was not re-tuned.

⚠ Two facts the next reader needs. First, the rendered reference's header clears AA (4.74:1) only
because its ink is the app's OLD muted `#9CA3AF` as a literal on the OLD ground; taking that pair
would be re-tuning the ink, which A6 forbids. Second, the lid relationship the owner chose the old
ground for survives, narrowed: `--soft` is 1.13:1 over a loaded row and 1.29:1 over the panel, and
the header keeps its rule beneath it. Restoring the stronger lid means choosing a ground that is
both lighter than the rows and ≥ 4.5 under this ink, and that choice is the owner's.

### 10.5 The red-first proof — `Update` does not take

`tools/caspar-bridge/tests/update-does-not-take.integration.test.ts`, five cases on the mock's real
AMCP trace (never a UI): a loaded, never-taken row under a field-only update; the same row binding a
NEW input; **the operator-verb route the owner walked on the plant — TAKE, then OUT, then UPDATE
with a swapped input, and the next TAKE seats the swap**; TAKE, then STOP, settled off air, then
UPDATE; and a POSITIVE CONTROL in which the same update on the same row while it IS on air must put
a `PLAY` on the wire. The two operator-verb routes were UNCOVERED before this phase: every existing
`B-161` / `B-216` case reached "owns nothing" through never-taking, rehearsing or a server restart.

**Red, then green, source stashed** (§11): with `#ownsLiveSeats`'s gate neutralised in
`caspar-runtime.ts` the three "owns nothing" cases went RED — four `PLAY 1-…` each — while the
field-only case and the positive control stayed green; with the gate restored, **5 / 5 green**.
That the field-only case cannot go red even without the gate is recorded rather than hidden: a
field-only update never enters the binding transaction, so it pins the contract without exercising
the predicate. The three that exercise it are the ones that went red.

### 10.6 The deletion guard — item 11 discharged, and the guard tests are green

`apps/runtime/tests/layersPanel.restoreMigrations.dom.test.ts` (six cases) was written BEFORE the
table was touched: a migration is announced by ROW NAME through `operatorRowName` in its own `<bdi>`,
with where it came from and where it landed; a DEMOTED row says it came back NOT on air and what to
do; nothing is announced when nothing migrated; it is its own seam beside the skips strip and the
two can stand together; and dismissing one report does not silence the next. Item 11 in §3 moves
from 🔴 to ✅. The other four `LayersPanel` guard items — restore-skips, awaiting-rows, loading and
no-candidate-layers — were re-run and are green (18 tests across four files), before and after the
restructure. Phase 9.3's owed list is one shorter.

### 10.7 The command contract — unchanged, and asserted unchanged

No verb's meaning, gate or refusal was touched. `REMOVE_ON_AIR_REASON` and its consumers
(`removeOnAir.agreement.dom.test.ts`, `removeRowRefusal.dom.test.ts`,
`remove-on-air-refusal.integration.test.ts`), the bulk gates (`layersPanel.clearAll.dom.test.ts`,
`layersPanel.removeAll.dom.test.ts`) and the published `removeExempt` (`removeGate.ts` and its
tests) are all as they were, and the full `pnpm gate` runs them. Nothing re-derives an answer the
bridge publishes.

### 10.8 What Phase 3 did NOT do

- It did not convert the grid of rows into an HTML `<table>`. The reference's `<table>` is its
  markup, not its look; the app's grid is what makes `B-224`'s measured columns and the density
  model possible, and every e2e handle (`[data-layer]`, `[data-row-body]`, `getByRole('row')` for
  the header) lives on it.
- It did not adopt the wave-1 geometry, for the reason in 10.1; it did not reword the band, rename
  the header words in the DOM, or touch the Look buttons, the top bar's height or the column widths
  (each argued in 10.2).
- It did not close the A6 lid question — the number is closed, the trade is reported.

## 11 — Phase 4: Looks

**Phase 4, 2026-09-08.** Read against the tree at `0572102e` (the amended `PROMPT.md`). Method as
Phase 3's, now the rule (`PROMPT.md` §0, rendered-not-authored): the reference was **rendered in
Chromium at 1280 × 800 and measured** on its three look-bearing rows (`getComputedStyle` +
`getBoundingClientRect`, the pointer moved onto an idle segment for the hover, a row clicked for
the selected readings), and the app was measured the same way against its built `dist/` booted as
the e2e harness boots it, on row 89.

### 11.1 The owner's answers, and the authority file amended first

- **A8 — wave 1 is REJECTED.** Nobody ever saw it rendered, and `32×34` verbs with a 30 px
  destructive group shrink the STOP and CLEAR hit targets on an on-air console. **`48 × 36` stays
  and no later phase reopens it.** Recorded in `PROMPT.md` §3's supersession note and in §10.1.
- **A9 — `--r-row-icon-btn-narrow-w` is DELETED**, not kept documented-dead: a token read by
  nothing with a comment saying it is dead is a trap. Gone from `theme.ts` (a note stands where it
  was so it is not re-added); `tokenHome.test.ts` and `theme-tokens.spec.ts` green; §7.4's list is
  annotated as historical.
- **A10 / A11 — `PROMPT.md` amended, by path, in its own commit (`0572102e`) before any phase
  work.** §0 gains THE REFERENCE IS JUDGED AS RENDERED, NOT AS AUTHORED; §3's quoted numbers are
  marked SUPERSEDED in place by §10.2 with one line saying why, the section kept so the error stays
  visible. **§§4–10 were checked and quote NO number or selector from the stylesheet** — §4's
  `authoredLooks(t) = t.layouts` is the prototype's SCRIPT, already flagged as its invention.

### 11.2 What contradicted the prompt — and what did not

- **§4's premise was already true in the code, so the phase's code is SURFACE plus PROOF, not a
  re-plumbing.** "The number and arrangement of Looks are read from the template's own definition,
  through the real schema's equivalent of `authoredLooks(t) = t.layouts`" — that equivalent is
  `TemplateLiveSources.looks`: the Designer authors a `LookGroup` (`@cg/shared-schema` `looks.ts`),
  `collectLookCarrier` (`@cg/vcg-format`) reduces it at export to one `TemplateLook` per authored
  look with the rects it places, and `lookOptionsOf` (`LookPicker.tsx`) reads exactly that. A
  tree-wide read found **nothing** deriving a look from a frame count: no consumer counts
  `sources[]` to make looks, the renderer never reads `arrangements` (the A′ carrier, a different
  schema), and `activeLookOf` resolves by id → authored default → first, never by position. What
  the surface did NOT show was the ARRANGEMENT — a segment was a text chip — and nothing PROVED the
  three-things rule against an irregular set. Both are this phase's.
- **The reference's look strip is restated five times in its stylesheet and only the last paints**
  (the same shape as §10.1, one component over): `.look-switch button` is declared at 21 px, then
  24 px, then 38 px with `min-width:78px`, then `min-width:100px`. Measured, it is 38 × ≥100 —
  11.3 quotes the browser, not the file.
- **The reference's thumbnail is its own invention.** `makeLook(id,name,plateIds,columns)` draws a
  `--cols` grid per look; the real carrier has each look's actual rects over the scene, so the app
  draws THOSE (a `solo` look that fills the raster shows one full box; `pair` shows two cells at
  their real places). The schema wins (`PROMPT.md` §0), and the thumbnail is more truthful than the
  drawing it comes from.
- **The reference's context label reads `ON AIR LOOK` / `Cut · now` on an on-air row, `PVW LOOK` /
  `Preview · now` rehearsing, `LOOK` / `Apply · now` otherwise. NOT adopted.** The picker says
  which LOOK is selected and the state cell alone says whether the row is on air — the "never a
  second, unbacked air claim on the same row" rule the segments' colour is built on and
  `lookPicker.dom.test.ts` pins (_"never 'on air'"_). The second line is `B-168`'s immediacy
  qualifier, which the console already spells `· NOW`; nothing is reworded (§0). ARGUED, not
  fixed — the owner can overrule it in one word.
- **The reference draws the strip as a second `<tr class="look-detail">` under a 51 px main row;
  the app keeps its ONE grid row** (Phase 3's decision, §10.8). The vertical rhythm comes out the
  same anyway — see the first two rows of 11.3.

### 11.3 🔴 THE MEASURED PROPERTY TABLE — rendered reference vs app, every delta FIXED or ARGUED

Both columns are Chromium readings. "Palette" means the same ROLE, whose value Phase 2 moved by the
owner's mapping rule; the prototype keeps a pre-Phase-2 literal for that role.

| property                    | reference (rendered)                                                                | app (after this phase)                                                                                  | verdict                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| look-bearing row, total     | 51 + 65.89 = **116.89 px** (main row + `.look-detail` row)                          | **117.39 px** = 15 + 36 + 6.4 + 3 + 38 + 3 + 15 + 1 (one grid row)                                      | identical within 0.5 px; ARGUED: one row, not two (§10.8)                                                              |
| verb line → look button     | 6.4 (detail pad) + 3 (strip pad) = 9.4 px                                           | 6.4 (`rowGap`) + 3 (strip pad) = 9.4 px                                                                 | identical                                                                                                              |
| line gap (label → strip)    | `.look-switch{gap:10px}`                                                            | 10 px — `--r-look-ctx-gap`                                                                              | identical; **FIXED** (was 6.4)                                                                                         |
| context label               | 11 px 600, `#bac7d8`, `min-width:79px`, two lines                                   | 11 px 600, `--r-text-secondary` `#bbc8d7`, `min-width` 79 — `--r-look-ctx-*`                            | **FIXED** (size, weight, ink rank, column); ARGUED: palette                                                            |
| context label words         | `ON AIR LOOK` / `Cut · now` · `PVW LOOK` / `Preview · now` · `LOOK` / `Apply · now` | `LOOK · NOW` · `PVW LOOK · NOW`                                                                         | ARGUED: no second air claim on the row; `B-168`'s word; nothing reworded (§0)                                          |
| strip gap, padding          | `gap:8px;padding:3px`                                                               | 8 px — `--r-look-strip-gap`; 3 px                                                                       | identical; **FIXED** (gap was 4)                                                                                       |
| button box                  | **38 px** tall, `min-width:100px`, `padding:5px 12px`, radius 5                     | **38 px**, 100 px floor, `5px 12px`, radius 5 — `--r-look-btn-*`                                        | identical; **FIXED** (was a 2.4ch chip, `0.15rem 0.5rem`, radius 3, ~24 px tall)                                       |
| button text                 | 13 px 400, `gap:8px` to the thumbnail                                               | 13 px, `--r-weight-medium` 500, gap 8 — `--r-look-btn-text/-gap`                                        | **FIXED** (size, gap); ARGUED: weight — one step under the button family's semibold; no 400 token exists to invent one |
| button at rest              | `#151e2c` / `#56667d` / `#dbe4f0`                                                   | `--r-surface-sunken` `#0b1017` / `--r-border-strong` `#4b5563` / `--r-text`                             | ARGUED: palette                                                                                                        |
| button hover                | `#30465c` / `#8dbad7`                                                               | `--r-control-hover-bg` `#304258` / `#5e748b`                                                            | identical up to palette (the same pair as §10.2's ON PVW hover)                                                        |
| button selected             | `#285273` / `#91d7ff` / `#fff`, `inset 0 0 0 1px #91d7ff`                           | `--r-accent-fill` `rgb(23 50 67)` / `--r-accent-line` / `--r-accent-ink`, `inset 0 0 0 2px --r-surface` | ARGUED: palette — the anchor-cell selection rule (`controls.css`), kept                                                |
| thumbnail box               | `27 × 19`, opacity .85                                                              | `27 × 19`, opacity .85 — `--r-look-thumb-w/-h`                                                          | identical; **FIXED** (there was none)                                                                                  |
| thumbnail cell              | 1 px `currentColor`, radius 1, one cell per frame in a `--cols` grid                | 1 px `currentColor`, radius 1, one cell per frame **at the look's own rect** (`rects`/`resolution`)     | **FIXED** — the schema's arrangement, not the prototype's grid                                                         |
| segment tooltip             | `<name> · N frames · cuts on air immediately`                                       | `N frame(s) · <id>`                                                                                     | ARGUED: the immediacy clause is on the label's tooltip already; the id relocates here (golden rule 11)                 |
| segment count, order, label | one per `layouts[]`, authored order, authored name                                  | one per `looks[]`, authored order, authored name                                                        | identical in kind — and now PROVED against an irregular set (11.4)                                                     |
| Look button click target    | 38 × ≥100                                                                           | 38 × ≥100                                                                                               | identical — "keeps its large click target" (§3) holds; larger than the 48 × 36 verb                                    |

**What the owner will see change on screen:** every look segment is a 38 px button with a 100 px
floor instead of a small chip, and each one now carries a little **frame map** — the frames THAT
look places, where it places them — beside its name; the `LOOK · NOW` label is a shade brighter and
the strip sits 10 px from it. Nothing about which looks appear, their names or their order changed;
that was already the template's own declaration, and is now proved to be.

### 11.4 The fixture — six frames, five looks, word ids

`MockRuntime.seedLooksTemplate()` now also seeds `e2e-looks-six` into the **e2e-armed LIBRARY**
(no row carries it; a spec loads it): six frames in a 3 × 2 grid and FIVE looks — `solo` (frame 1,
full raster), `pair` (frames 2 and 5), `trio` (1, 3, 5 — the authored default), `quad` (1, 2, 4, 6) and `panel` (all six). **There is deliberately no five-frame look**, so a picker inventing a look
per frame count would show a sixth segment; the ids are words, so nothing can read a count out of
one; `pair`'s membership is irregular, so a count cannot stand in for it. `lookPicker.dom.test.ts`
pins the shape (five options, `[1,2,3,4,6]` frames, `pair` = `['l-2','l-5']`, one cell per frame in
the rendered strip, the tooltip words) and `look-set-and-switch.spec.ts` drives it on the built
app — five segments, `data-look-frames` `1 2 3 4 6`, no `[data-look-frames="5"]`, `trio` marked.

### 11.5 🔴 The red-first proofs — switch away and back, the same source on the same frame

Two instruments, one defect shape: **a switch that forgets the ROW's composition and re-derives
its frames from the TEMPLATE.** Each round trip carries a per-look binding (level 3) precisely so
that defect cannot pass for the right answer — every frame on the template default would come
back the same under a re-derivation too.

- **At the wire** — `tools/caspar-bridge/tests/look-switch-preserves-bindings.integration.test.ts`
  on the mock server's real AMCP state: take on `left`, bind `live-1 → src-preset` for `left`
  only, read every LEFT frame's `{producer, layer, rendered rect}`, switch to the disjoint `right`
  (positive control: frame 1 renders nothing, frame 3 renders), switch back, and assert the
  readings identical; a second case pins that the way back sends `MIXER FILL`s and no `PLAY`.
  **RED with `setActiveLook` neutralised to `#lookSourceBindings.delete(itemId)`** — frame 1 came
  back on `"route://2"` (the template's `src-1`) instead of `"route://9"` — **GREEN with the line
  removed, 2 / 2.** The neutralisation diff is not in the tree; it was a one-line stash.
- **On the surface** — the third test of `look-set-and-switch.spec.ts`, on PVW where the console
  draws the join (`R-049`): load the six, ON PVW, select, bind `trio:l-3 → Studio 3` through the
  Inspector's Look inputs and UPDATE, read every placeholder's name and box, switch to `solo`
  (positive control: frames 3 and 5 gone, frame 1 a different box), switch back, assert the
  placeholders identical. **RED with the mock's `setActiveLook` neutralised the same way** —
  `l-3` read `Studio 1` after the round trip — **GREEN with it restored, 3 / 3.** ⚠ The first red
  attempt stopped at the positive control, not the property: the fixture's `solo` reused frame 1's
  grid cell, so its box never moved. The fixture was corrected (a solo look fills the raster) and
  the red was taken again on the property itself. Recorded because a red that lands on the wrong
  line proves nothing about the right one.

Spec deltas: `specs/runtime-live-source-routing/spec.md` (the wire property) and
`specs/runtime-ui/spec.md` (the set, the geometry, the surface round trip).

### 11.6 The deletion guard — untouched, and still green

No guarded surface was touched: the phase edits `LookPicker.tsx`, `controls.css`'s look rules,
the token home and the mock's e2e seed. `pnpm gate` re-ran every guard test in §3 (the
`LayersPanel` strips, the banners, the toast, the lock). Twenty-seven items; four owed by Phase 9
and one by Phase 8, unchanged.

### 11.7 What Phase 4 did NOT do

- It did not adopt `ON AIR LOOK` / `Cut · now` / `Apply · now` (11.2), reword the tooltip's
  immediacy clause, or move the picker into a second table row.
- It did not touch the Inspector's LOOK INPUTS section, the bridge's look switch, `setActiveLook`'s
  contract, any schema or persisted key, or the unarmed mock library (`templateName.test.ts` pins
  its count; the six-frame template is e2e-armed only).
- It did not measure the app's strip in jsdom — all geometry is in `look-set-and-switch.spec.ts`
  (golden rule 12c); the dom test pins the SET and the cell COUNT, which need no layout.
- It did not invent a regular-weight text token to match the reference's 400; the segment is one
  step under the button family and the delta is argued in 11.3.

## 12 — Phase 5: Preview, program and the Inspector

The record for `PROMPT.md` §5. The three independent things and how each pair was proved red
first; the reference measured in a browser and counted by its waves; every Inspector and monitor
delta fixed or argued; the position draft that was being lost; the deletion guard re-run; and the
one rule recorded for later phases (A12).

### 12.1 What contradicted the prompt — and what did not

- **The reference's Inspector and monitors are restated like its table and its look strip, and
  worse.** Counted in Chromium from the page's own CSSOM (one sheet, every rule whose selector
  names the token): `.inspector` **33** rules (26 unconditional, 7 under `@media`),
  `.inspector-foot` 8, `.inspector-body` 6, `.position-controls` 10, `.anchor-grid` 8,
  `.headline-item` 17; `.monitor-head` 10, `.monitor-stage` 8, `.monitor-controls` 7, `.monitors`
  3, `.control-grid` 13. Only the last unconditional wave paints at 1280 × 800, and the monitors'
  painting rules are not even under `.monitors` — they are the `#monitor-area .pvw-revision` /
  `.pvw-compact` block appended after the `@media` blocks. Every number in 12.3 is what the
  browser read, never what a rule says (`PROMPT.md` §0).
- **"Whether the monitors are SHOWN" was not a thing the app had.** The reference keeps
  `monitorsVisible` as a third variable with a `Show monitors` / `Hide monitors` toggle
  (`aria-expanded`, `aria-controls="monitor-area"`). The app's only way to fold the strip away was
  the Layers panel's FULLSCREEN — which also takes the Inspector column away: "monitors hidden"
  coupled to "editor hidden", the very coupling §5 warns about, sitting in the shell as a feature.
  The toggle is built (12.2); fullscreen stays as a separate axis.
- **One kind of draft WAS being lost on the round trip §5 forbids.** Field, plate and per-look
  drafts already survive a selection switch through `draftStore`; the on-air POSITION draft did
  not — `PositionPicker` held anchor and offsets in `useState`, keyed by item, so the remount on
  every selection change threw them away. Fixed, red first (12.5).
- **§5's first line ("the preview is multi-layer, as 06 shows") was already true**: `R-022`
  composites every rehearsing row and `rehearse-composite.spec.ts` pins it. The reference draws
  the same thing (two `.pvw-composite-layer`s stacked by layer in one scaled 1920 × 1080 box,
  read at 12.3). What was not true was the independence of that set from the selection and from
  the strip's visibility, which is this phase's subject.
- **The reference titles the Inspector with the ROW's name and puts the template on the meta
  line; the app titles it with the TEMPLATE's name.** Golden rule 11 (name things in the
  operator's words) sits on the reference's side. NOT changed here — it is a wording and
  structure change with its own tests and it is not in §5 — and filed as `R-061` for the owner.
- **The reference's monitor captions make air claims the app must not copy**: `3 rows on air ·
demo` under PROGRAM and `ON AIR LOOK` / `Cut · now` on a row. Both are second claims about air
  on a surface that already says what is on air; recorded as A12 (12.8) rather than argued
  per site.

### 12.2 What was built

| piece                                  | where                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the monitors toggle                    | `useShellLayout.monitorsShown` / `setMonitorsShown` (session state); the Layers header button; `App` gates the strip on `focus !== 'layers' && (monitorsShown \|\| monitorFocused)`; `reset()` restores it; `customized` counts it                                      |
| the position draft                     | `draftStore.positionDrafts` (`stagePosition` / `positionDraftOf`, swept by `pruneDrafts`, left by `clearDraft`); `PositionPicker` reads and writes it                                                                                                                   |
| the reference's defaults               | `DEFAULT_INSPECTOR_PX` 320 → **396**, `DEFAULT_MONITOR_PX` 180 → **230** (guard item 19's own rule: the reference supplies the defaults, never the constraint); `layout.ts`'s server-rendered default follows                                                           |
| the Inspector's rendered geometry      | `INSPECTOR_PX` in the token home → `--r-insp-*`; read by `.cg-inspector-body .cg-field`, `.cg-inspector-section > h2`, `.cg-position-row`, `.cg-inspector-actions`, `PositionPicker`                                                                                    |
| the foot                               | Discard · Update order, the `9px 12px` pad, the stronger top rule, the upward shadow, the 104 px button floor, and the reference's hint sentence under them                                                                                                             |
| `cg-inspector-body` on the real branch | the class was only on the EMPTY branch, so `controls.css`'s `@container inspector` rule matched no field an operator could see                                                                                                                                          |
| proofs                                 | `workspaceIndependence.dom.test.ts` (the whole `App` in jsdom on the mock bridge), `workspace-independence.spec.ts`, `inspector-geometry.spec.ts`, `shellLayout.monitorsShown.dom.test.ts`, the position cases in `draftStore.test.ts` and `positionPicker.dom.test.ts` |

### 12.3 🔴 THE MEASURED PROPERTY TABLES — rendered reference vs app, every delta FIXED or ARGUED

Both columns are Chromium readings at 1280 × 800: the reference from `05-row-inspector.html` /
`06-preview-program.html` opened as files, the app from the built SPA on the e2e harness with a
list-field template loaded and selected. "Palette" means the same ROLE, whose value Phase 2 moved
by the owner's mapping rule.

**The Inspector**

| property           | reference (rendered)                                                                                  | app (after this phase)                                                                                                               | verdict                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| column             | **396 px**, `minmax(0,1fr) 396px`, gap 8                                                              | **396 px** default (was 320), resizable, 6 px divider + 0.35rem                                                                      | **FIXED** (default); ARGUED: the divider and clamps are guard item 19                                                                                                    |
| panel box          | 1 px `--line`, radius 6, `--surface`                                                                  | 1 px `--r-border`, radius 4, `--r-surface`                                                                                           | ARGUED: radius is the panel primitive's, shared by all four panels                                                                                                       |
| head               | 66 px, two rows: eyebrow `Inspector` 9 px + ROW name 14 px 600; meta: status badge · template · `PVW` | 53 px bar (`--r-panel-bar-h`): `INSPECTOR`; then in the body the TEMPLATE name 15 px 600 + chips (status · layer · channel · server) | ARGUED: one bar for four panels; the row-name title is `R-061` (golden rule 11 favours the reference)                                                                    |
| head close control | 26 × 26 icon-btn                                                                                      | 28 × 28 `icon`                                                                                                                       | ARGUED: the primitive's box; +2 px on a hit target                                                                                                                       |
| body padding       | `12px 12px 14px`                                                                                      | `12px 12px 0` (the foot owns the bottom)                                                                                             | **FIXED** (was `24px 16px 0`)                                                                                                                                            |
| section heading    | 12 px 600, `.03em`, `rgb(182 200 218)`, no rule under it                                              | 12 px 600, `.03em`, `--r-text-secondary` `#bbc8d7`, rule under it                                                                    | **FIXED** (size, weight, tracking, ink rank; was 11 px 700 `.12em` muted); ARGUED: the rule is the same separation one edge over                                         |
| section spacing    | `+` 15 px margin, 12 px pad, rule above                                                               | 32 px margin, rule under the heading                                                                                                 | ARGUED: the app's spacing GRADIENT (`controls.css`) is a design of its own, one scale, kept                                                                              |
| field label        | 12 px 500 `rgb(187 200 215)`                                                                          | NAME 13 px 500 `--r-text` + key 11 px muted                                                                                          | ARGUED: 13 px is an owner decision ("a notch under the body scale"), the primary ink a written one                                                                       |
| text input         | 31 px, `5px 8px`, 13 px, radius 4, `#0e151e`                                                          | **31 px, `5px 8px`, 13 px**, radius 4, `--r-field-bg`                                                                                | **FIXED** (was 33.2 px, `4.8px 8px`, 14.4 px); scoped to the Inspector so Station setup's inputs are untouched                                                           |
| input focus        | border `--blue` + `inset 0 0 0 1px --blue`, outline none — ONE ring                                   | border `--r-accent` + `0 0 0 2px --r-accent`, outline none — ONE ring                                                                | identical in kind; ARGUED: inset vs outset. Pinned in Playwright with no ancestor ring                                                                                   |
| anchor grid        | 66 × 64, 20 × 20 cells, radius 3                                                                      | 96 × 96, **30 × 30** cells, radius 3                                                                                                 | ARGUED: a 20 px cell is under the 24 px hit-target floor — the `A8` shape (wave 1's 32 × 34 verbs), and not reopened                                                     |
| position row       | `66px minmax(48px,1fr) minmax(48px,1fr) auto`, gap 8, `align-items:end`                               | grid · `1 1 48px` · `1 1 48px` · auto, gap 12, `flex-end`                                                                            | **FIXED** — X and Y fill and stay equal (116.9 px each at 396; were fixed 74); gap ARGUED (the scale's step)                                                             |
| position inputs    | 32 px, 90.3 px each, labels `X px` / `Y px` 12 px 500 on an 18 px line                                | **32 px**, 116.9 px each, labels `dx` / `dy` **12 px 500 secondary, 18 px line**                                                     | **FIXED** (height, label rank); ARGUED: the words — nothing reworded (§0), `dx`/`dy` are the app's                                                                       |
| Apply position     | 32 px, 12 px 550, quiet                                                                               | 32 px, 12.8 px 600, `accent`                                                                                                         | ARGUED: palette and the accented-actions rule (owner)                                                                                                                    |
| list item          | textarea 282 + handle 24 × 32 (`cursor: grab`) + remove 24 × 28                                       | textarea 284 + handle 24 × 28 + index + remove 26 × 28                                                                               | identical in kind; ARGUED: the cluster rule (`inspect-list-field.spec.ts`)                                                                                               |
| grip handle        | a focusable button, `aria-label` "Move headline 1. Drag, or use Up and Down arrow keys.", ↑/↓         | a focusable button, `aria-label` "Reorder … item 1", ↑/↓; pointer drag pinned in Playwright                                          | identical in contract; ARGUED: wording (§0)                                                                                                                              |
| Add item           | 29 px, 12 px 550, quiet                                                                               | 28 px, 12.8 px 600, `accent`                                                                                                         | ARGUED: the field-foot height rule + the accented-actions rule                                                                                                           |
| foot box           | `9px 12px`, `#1e2938`, top rule `#52627a`, shadow `0 -5px 12px #0002`, 98.8 px tall                   | **`9px 12px`**, `--r-surface-raised`, top rule **`--r-border-strong`**, **shadow**, 77.5 px tall                                     | **FIXED** (pad, rule weight, shadow; was `12px 16px`, `--r-border`, none); ARGUED: palette; the status line (`Fields saved`) is not adopted — the chip is the app's word |
| foot buttons       | `Discard` · `Update`, each **104 × 32**, 13 px, gap 10                                                | **`Discard` · `Update`, each 104 × 32, 13 px, gap 10**                                                                               | **FIXED** (order, floor, text, gap; were 71 / 69 wide at 12.8 px, Update first, gap 12)                                                                                  |
| Update colour      | `#22dd7a` fill, dark ink                                                                              | `--r-onair` fill, dark ink (`variant="commit"`, PLAY's own token)                                                                    | identical up to palette — the owner's "same as PLAY" call, already made                                                                                                  |
| foot hint          | `Saves this row’s configuration. No Take is sent.` 11 px muted                                        | **the same sentence**, 11 px muted                                                                                                   | **FIXED** (adopted; it is golden rule 10 on the surface)                                                                                                                 |
| foot pinned        | foot bottom = panel bottom − 1 at 800 / 600 / 480                                                     | foot bottom = panel bottom − 1 at 800 / 600 / 480, short and long content                                                            | identical; pinned in Playwright at three heights                                                                                                                         |

**The monitors**

| property               | reference (rendered)                                                                                          | app (after this phase)                                                                                                   | verdict                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| the strip              | `#monitor-area`, **230 px**, two `1fr` monitors gapped 8, hidden unless `monitorsVisible`                     | **230 px** default (was 180), two `flex:1` panels gapped 12, resizable, hidden unless `monitorsShown`                    | **FIXED** (height, the toggle); ARGUED: the divider (item 19)                                                                                          |
| the toggle             | top-bar `btn.quiet.monitor-toggle` 32 px, `Show monitors` / `Hide monitors`, `aria-expanded`, `aria-controls` | **App-header** control, the same two names, `aria-expanded`, `aria-controls="monitor-strip"`                             | **FIXED** (built in Phase 5, PLACED in the header by `AUDIT-CLOSE-01` B1 — the placement argument below is STRUCK)                                     |
| monitor box            | radius 5, `#101722`, 1 px `--line`                                                                            | radius 4, `--r-surface`, 1 px `--r-border`                                                                               | ARGUED: palette + the panel primitive                                                                                                                  |
| monitor head           | **32 px**, `3px 9px`, `#202b3a`; `PREVIEW` 11 px 650 purple / `PROGRAM` mint + `CH 1`                         | **53 px** `--r-panel-bar-h`; `PREVIEW (PVW)` / `PROGRAM (PGM)` 11 px 700 muted                                           | ARGUED: one bar height for all four panels (`--r-panel-bar-h`'s own rule); the purple/mint heads are A4's territory — a hue per monitor is not adopted |
| PVW count              | head: `2 layers on PVW`                                                                                       | lifecycle bar: `Rehearsing 2 rows` (`rehearsalCaption`)                                                                  | ARGUED: the same count, one line lower, ONE place — not duplicated into the head                                                                       |
| PVW controls row       | 31 px: `PLAY NEXT STOP` 25 px 11 px 550 · `ALL LAYERS` 9 px · zoom select 23 px · guides                      | 39 px: `PLAY NEXT STOP` 28.8 px 12.8 px 600 · caption · caveats toggle                                                   | ARGUED: the app's verbs keep the button family's box (a 25 px button is under the floor); zoom and guides are not built here                           |
| PVW stage              | 165 px, `#030507`, composite 1920 × 1080 scaled 0.153 on flat `#26303e`                                       | **135.6 px** (was 85.6), `--r-video-ground`, frames 1920 × 1080 scaled 0.126 on the CHECKER                              | **FIXED** (+58 % stage); ARGUED: palette; the checker is the owner's own decision (alpha visible)                                                      |
| PVW layers             | `.pvw-composite-layer` × N, `z-index` 1…N, `position:absolute; inset:0`                                       | `iframe[data-rehearsal-frame]` × N, `z-index` by real layer                                                              | identical in kind — multi-layer, as 06 shows                                                                                                           |
| PGM head               | `PROGRAM CH 1` · `Server return`                                                                              | `PROGRAM (PGM)`                                                                                                          | ARGUED: nothing reworded (§0)                                                                                                                          |
| PGM body               | `No return signal · 3 rows on air · demo`; `Program return unavailable` / `Playout may still be active.`      | `No program return` / `This will show what is on air, returned from the playout server. No return feed is arriving yet.` | ARGUED: the app's words are `C-016`'s; `3 rows on air` is a second air claim (A12); nothing invented (§5's own note)                                   |
| what a black box means | a flat `#030507` box with words in it                                                                         | a black box with words in it                                                                                             | identical in kind — the words are what keep a black picture from reading as a dead feed (`MonitorPanel`)                                               |

**What the owner will see change on screen:** the Inspector opens 76 px wider; its fields are a
notch smaller and tighter (31 px boxes at 13 px, 12 px pad); X and Y stretch to fill the row and
match; the section headings are a shade brighter and lighter; the foot carries `Discard · Update`
at equal widths with a sentence under them and a faint shadow above; the monitor strip is 50 px
taller with a visibly larger PVW stage; and there is a control that folds the monitor strip away
and brings it back (it was a monitor icon in the Layers bar; `AUDIT-CLOSE-01` B1 moved it to the
app header — see the strike below).

🔴 **STRUCK BY `AUDIT-CLOSE-01` C1, 2026-09-09 — the toggle's PLACEMENT argument was invalid, and
it is worth reading twice because it is not a wrong number, it is a wrong KIND of reason.**

The row above read _"ARGUED: placement — the app has no app-head; this bar carries the shell's
other layout control"_. The first clause is the whole argument, and it cites §1.1's very first map
row, which says the app has no top header. **That row recorded an ABSENCE and no property table in
ten phases ever measured it against the reference, which draws a top bar carrying exactly this
control.** So an unmeasured absence was used as its own justification: the reason the control could
not go where the drawing puts it was that the place the drawing puts it did not exist, and the
place did not exist because nobody had ever decided whether it should.

That is a circle, and it is the shape the audit's rule now forbids: **"the app has no X" is not a
reason when X was never measured** (`AUDIT-CLOSE-01` D). The toggle is in the header now, with the
same flag, the same two names and the same `aria-expanded` / `aria-controls` — only the placement
moved, and it moved to the place the reference draws it. §1.1's two wrong rows are corrected in
place at the top of this document.

⭐ The SECOND clause ("this bar carries the shell's other layout control") survives as a fact and
was never sufficient on its own: the reset control is still in the Layers bar, because it is about
the PANELS' geometry rather than about the shell's, and the reference draws no equivalent of it.

### 12.4 The waves, counted — how the reference was read

The count in 12.1 was taken by walking `document.styleSheets` in the loaded page and matching
each rule's `selectorText` against the token, recording the `@media` condition it sits under —
so it counts what the browser HOLDS, including the block the page's script appends, not what a
text grep of the file finds. A rule under `(max-width: 1270px)` or `(max-width: 850px)` does not
paint at 1280 × 800 and is listed as conditional. The unconditional restatements are the waves:
26 for `.inspector`, and the one that paints is the last — `position: static; max-height: none;
min-height: 0` with the `flex: column; overflow: hidden` block after it, which is the shape 12.3
measured against.

### 12.5 🔴 The red-first proofs

**The three pairs, both directions, on the whole `App`.** Six couplings were PLANTED in
`App.tsx`, three at a time, and both proofs run against each round:

| round | planted couplings                                                  | jsdom (`workspaceIndependence.dom.test.ts`)                                                                                         | browser (`workspace-independence.spec.ts`) |
| ----- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| A     | select → enter PVW · select → show monitors · PVW → show monitors  | RED: 1 (S→P), 3 (S→M), 5 (P→M); and 2 (P→S) via its precondition — the row it selects is now in PVW. GREEN: 4, 6, 7                 | the same four red, the same three green    |
| B     | PVW → select · hide monitors → deselect · hide monitors → exit PVW | RED: 2 (P→S), 4 (M→S), 6 (M→P); and 3 (S→M) via its precondition — hiding deselects, so its deselect step reselects. GREEN: 1, 5, 7 | the same four red, the same three green    |
| —     | none (the code as committed)                                       | 7 / 7 green                                                                                                                         | 7 / 7 green                                |

Each of the six direction tests went red under its own coupling and green under the three of the
other round, so no test can be passing on a coupling that runs the other way — which is the
failure mode §5 names. The two precondition reds are recorded because they are what a coupling
does: it reaches into the other test's setup, and the honest table shows that rather than a clean
3 + 3. The plants are not in the tree; they were two edits to `App.tsx`, reversed by hand and
checked absent (`git grep PLANTED` finds nothing).

**The position draft.** `positionPicker.dom.test.ts` — _a position DRAFT survives a deselect →
reselect — the anchor AND the offsets as typed_: mount, press `top-center`, type `-` into Y,
unmount, mount the same item again. **RED against the `useState` picker** (`aria-pressed`
`'false'` on `top-center` after the remount), **GREEN with the draft in the store**, 11 / 11 in
the file and 24 / 24 in `draftStore.test.ts`.

### 12.6 The deletion guard — items 19 and 20 re-run, and the rest green

Both surfaces this phase touches have tests, and they were re-run on the built app after the
change: **item 19, the resizable shell** — `divider-across-iframe.spec.ts` (3),
`draft-survives-fullscreen.spec.ts` (2), `panel-scroll.spec.ts` (3), plus `shellLayout.test.ts`
and `layout.test.ts` in the gate — and **item 20, the narrow Inspector overlay and its
deselecting scrim** — `inspector-open-close.spec.ts` (6). All green; neither was absorbed into
the new layout. The strip keeps its divider and both monitors keep fullscreen (`Panel`); the
overlay keeps its scrim, and the scrim still deselects. The other twenty-five items are untouched
by this phase — the diff is the Inspector, the picker, the draft store, the shell hook, the Layers
header and the token home — and their tests ran in `pnpm gate`. Four are still owed by Phase 9,
one by Phase 8, unchanged.

### 12.7 What Phase 5 did NOT do — and the numbers filed

- It did not persist `monitorsShown`. It is session state by the phase's own constraint (no
  persisted key or shape change); whether it should join `cg.runtime.shell-layout.v1` is filed as
  **`R-060`** — the owner's call, because a strip that stays folded across a reload is either a
  remembered preference or a lost safety surface, and the two are indistinguishable from here.
- It did not retitle the Inspector with the ROW name (the reference's `Layer 3` over the template
  line) nor add the reference's `Reset` for the position draft. Both are filed as **`R-061`**:
  the title is golden rule 11's territory and a wording change with its own sweep; the reset is
  the one lifecycle gap the position draft still has (it clears by convergence, or by prune).
- It did not adopt the monitors' 32 px heads, purple/mint head inks, the `CH 1` chip, the zoom
  select or the safe-area guides toggle, the `Fields saved` status line, the reference's field
  label size, or its 20 px anchor cells — each argued in 12.3.
- It did not touch `RehearsalStage`, `PreviewPanel`, `MonitorPanel`, the bridge, any schema, any
  persisted key, any refusal, or any wording that already existed. Nothing was translated.
- It did not measure any geometry in jsdom: every box, edge, ring and pinned-foot claim is in
  `inspector-geometry.spec.ts` and `workspace-independence.spec.ts` (golden rule 12c).

### 12.8 A12 — recorded for the phases that will trip over it

**A surface must never make a SECOND claim about air on a row that already says what is on
air.** Two claims can disagree during a transition and the operator then has to choose which to
believe. The row's state cell is the one claim; `· NOW` is `B-168`'s immediacy qualifier and not
a second claim. This is why Phase 4 did not adopt `ON AIR LOOK` / `Cut · now` (11.2) and why this
phase does not adopt `3 rows on air` under PROGRAM (12.3). It is now a requirement in the
`runtime-ui` spec delta and an owner answer in `tasks.md`, where Phase 6 (the audio modal's
labels), Phase 8 (the audit log's row lines) and Phase 9 (the guard surfaces re-dressed) will
read it before drawing a badge.

## 13 — Phase 6: Live plates and audio

The record for `PROMPT.md` §6 and the two owner answers that preceded it (A13, A14). What
contradicted the prompt; the two seams, named by channel and file; the reference measured in a
browser and counted by its waves; every plates-pane and dialog delta fixed or argued; the
red-first matrix (the wire, the guard, the surfaces); guard item 23 discharged; and the numbers
filed.

### 13.1 What contradicted the prompt — and what did not

- **The audio dialog was making a SECOND CLAIM ABOUT AIR, and on a READY row a false one.** It
  derived `audible = value > 0` locally and printed _"audible on air"_ under any raised plate —
  a local copy of the one audibility predicate (golden rule 6), blind to `held`, and on a row
  that owned no seat a claim about air that nothing on the channel backed. A12's rule, met on
  the very surface A12 said to read it before. Closed: the dialog now takes the LEDGER's word
  through `plateAudioPill` — AUDIBLE, SILENT, HIDDEN BY THIS LOOK, ARMED · HIDDEN BY THIS
  LOOK — and a plate with no seat reads NOT SEATED (`UNSEATED_PILL`, `plateAudio.ts`). The
  reference's own `On air` badge in its context line is NOT adopted for the same reason.
- **The row's AUDIO verb was reachable only by pointer.** `useContextMenu.open` took a
  `MouseEvent`; the row's `onKeyDown` handled Enter and Space. The reference wires the
  `ContextMenu` key and `Shift+F10`; the app wired neither. Built (13.2).
- **The plates tab had no door to the dialog at all.** The reference's `[data-plate-coordinate]`
  rows open the owner's audio on right-click; the app's LIVE SOURCES rows offered the strip and
  OPEN ROW. Built (13.2).
- **The mock's loaded items carry no `slot`** (`MockRuntime.load` writes `itemId`, `templateId`,
  `fields`, `status`); the bridge's do. A heading that read `item.slot` alone named the row on one
  backend and the template on the other. The Inspector now resolves WHICH ROW from the bank's
  own BINDING (`useFixedSlots`, `binding.itemId === item.itemId`) with `item.slot` as the first
  answer — the same fact from the surface that already renders the row.
- **`PROMPT.md` §6's first line was already true and stays so.** The plates tab read the ledger
  and nothing else before this phase; 13.2 names the seams so the report can say where each is
  read from.
- **What did NOT contradict the prompt:** the SOLO map was already scoped to the row's seated
  set on the strip (`seatedPlatesOf`) and to the template's declared set in the dialog — the
  latter now widened to the union of declared and seated, so a stranded or adopted seat with no
  declaration (the bridge's own second way of accounting for a plate) is in scope too.

### 13.2 What was built, and where each of the two source surfaces is read from

🔴 **LIVE PLATES are read from the bridge's LEDGER**: channel `liveLayers.state` /
`liveLayers.onStateChanged` → `hooks/useLiveLayers.ts` → `liveLayerRows()` in
`features/layers/liveLayerRows.ts` → `LiveSourcesPanel`. One row per layer the bridge itself
seated, whatever any status says. `git grep useLiveLayers` finds exactly one consumer,
`LayersPanel.tsx`, which resolves the rows once and hands the same array to the tab, the tab
dot and every row's audio summary.
🔴 **The SOURCE CATALOGUE is installation-wide**: channel `sources.config` / `onConfigChanged`
/ `setConfig` (and `assignments` / `setAssignments`) → `features/sources/sourceStore.ts` →
Station setup's `SourcesSection` and the Inspector's `LivePlatesSection`. `LiveSourcesPanel`
imports nothing from `features/sources/`. Different channel, different lifetime, different
surface — and the pane now says so in its toolbar's scope note.

| piece                         | where                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the keyboard's door           | `ui/useContextMenu.ts` — `isContextMenuKey` (the ONE predicate for `ContextMenu` / `Shift+F10`) and `openAt(e, anchor, target)`; `LayerRow`'s `onKeyDown` opens the row's menu from anywhere inside the row                                                                                                                  |
| the plate's door              | `LiveSourcesPanel` rows are focusable (`tabIndex=0`), `onContextMenu` / `onKeyDown` → `onOpenAudio(itemId, plate)` for an OWNED row only; `LayersPanel` hosts the dialog (`plateAudioFor`), names the row through `operatorRowName`, hands it `rowPlateAudioOf(liveRows, itemId)` and `focusPlateId`                         |
| the dialog                    | `LivePlateAudioDialog` — `name: OperatorRowName` (subtitle, ids on `title`), `seatedPlates` (+ `coordinate` on `RowPlateAudio`), `focusPlateId` → `data-modal-autofocus`; plates = declared ∪ seated; the per-plate word from `plateAudioPill` / `UNSEATED_PILL`; the reference's head, rows, verbs and footer; MUTE removed |
| the plates pane               | `LiveSourcesPanel` — the toolbar (count, shown · held, scope note, PANIC) over a seven-column grid; `PlateAudioStrip` as a SUBGRID of its row (pill · gain · verbs); `LiveLayerRowView.plain` decides which rows keep their sentence visible                                                                                 |
| the Inspector heading (A14 a) | `Inspector.tsx` — `useOperatorNames` + `useFixedSlots`; `<h3 data-inspector-heading title={ids}><bdi>row</bdi></h3>`, the template on `[data-inspector-template]` beneath, the stub wherever the template's name is                                                                                                          |
| the tokens                    | `PLATES_PX` → `--r-plate-*` (34), `AUDIO_DIALOG_PX` → `--r-audio-*` (24), read by `controls.css`'s `.cg-plate-*` and `.cg-audio-*` rules; no colour literal                                                                                                                                                                  |
| proofs                        | `audio-does-not-take.integration.test.ts` (wire), `contextMenuSuppression.dom.test.ts` (guard 23), `plateAudioAccess.dom.test.ts` and `inspectorHeading.dom.test.ts` (the whole `App`), `liveSourcesPanel.dom.test.ts` (+4), `livePlateAudio.dom.test.ts` (re-pointed), `e2e/live-plate-audio-access.spec.ts` (Chromium)     |

### 13.3 🔴 THE MEASURED PROPERTY TABLES — rendered reference vs app, every delta FIXED or ARGUED

Both columns are Chromium readings at 1280 × 800: the reference from `07-live-plates.html` and
`08-live-audio.html` opened as files (the scratch script walked `getComputedStyle` and
`getBoundingClientRect` on the real elements, hovering and focusing each control), the app from
the built SPA on the e2e harness. "Palette" means the same ROLE, whose value Phase 2 moved.

**The live plates pane (`07`)**

| property           | reference (rendered)                                                                         | app (after this phase)                                                                             | verdict                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the shape          | a toolbar over a seven-column table                                                          | a toolbar over a seven-column grid, `role="table"`                                                 | **FIXED** (was an intro paragraph over a stacked list)                                                                                                                                       |
| toolbar            | 40 px, `4px 12px`, 12 px, gap 10, rule below                                                 | **40 px, `4px 12px`, 12 px, gap 10**, rule below (`--r-plate-toolbar-*`)                           | **FIXED**                                                                                                                                                                                    |
| toolbar words      | `3 occupied layers` 600 · `2 shown · 1 held` muted                                           | **the same two, the same ranks**                                                                   | **FIXED**                                                                                                                                                                                    |
| owner filter       | a 112 × 28 select, `All rows` / per owner                                                    | not built                                                                                          | ARGUED: a filter over a list of two to six rows; OPEN ROW and the Inspector already scope by owner; filed as nothing — it is a convenience the app's list does not need at this size         |
| help glyph         | 27 × 28 info icon carrying the scope sentence                                                | 28 × 28 `Info` icon carrying the app's scope sentence (`title`, delegated Tooltip)                 | **FIXED**; the sentence is the app's own ("not the installation's source catalogue, which lives in Station setup")                                                                           |
| panic              | `Silence all plates` 30 px, amber, 12 px 650                                                 | `SILENCE ALL BOXES`, `caution-strong`, 30 px floor                                                 | ARGUED: the app's verb name (pinned by its tests) and the button family's treatment; the floor height is the reference's                                                                     |
| head               | 30 px, 11 px 550, muted ink on `#1c2735`, rule `--line`                                      | **30 px, 11 px** 500, muted on `--r-surface-raised`, rule `--r-border`; sticky                     | **FIXED** (height, size, ground, rule); ARGUED: 550 → 500 (the weight scale is 500 / 600 / 700)                                                                                              |
| head words         | `Layer · Plate / source · Owner · Picture · Audio · Gain · ON = 100% · Audio controls`       | **the same seven**                                                                                 | **FIXED**                                                                                                                                                                                    |
| columns            | 65 · 508 (fills) · 95 · 90 · 140 · 207 · 157                                                 | `65px · minmax(0,1fr) · minmax(95px,auto) · minmax(90px,auto) · 140px · 207px · 157px`             | **FIXED**; owner and picture grow because the app's words are longer                                                                                                                         |
| row                | 42 px, cells `4px 10px` 13 px, rule `--soft`                                                 | **min 42 px, `4px 10px`, 13 px**, rule `--r-border-soft`; hover `--r-table-row-hover`              | **FIXED** for the ordinary row; ARGUED: a stranded, blind, adopted or held row adds its sentence on a second line — those sentences are the alarm or the caveat the deletion guard keeps     |
| coordinate         | 12 px, nowrap, 65 px cell                                                                    | **12 px, nowrap, 65 px**                                                                           | **FIXED**                                                                                                                                                                                    |
| plate / source     | handle 11 px muted + producer in a `<bdi>`, 13 px, gap 8                                     | **the same**                                                                                       | **FIXED**                                                                                                                                                                                    |
| owner              | a 30 px link `Bed 1 ›`, 12 px accent                                                         | `Seated for <bdi>owner</bdi>` + `OPEN ROW` (ghost, 30 px, 12 px)                                   | ARGUED: the verb word stays — five tests pin it and `B-145` chose it; the owner is named beside it in its own isolate                                                                        |
| picture            | `On screen` 12 px secondary / `Held` muted                                                   | the app's headline, 12 px, in the row's tone                                                       | **FIXED** (size, column); ARGUED: the words (`Held — not in the current look`, `Adopted — not confirmed`, `Stranded — no row owns this`) are `B-145` / `B-086` claims, nothing reworded (§0) |
| audio word         | 5 px dot + 12 px `Audible` (sky) / `Silent` (muted), gap 6                                   | **5 px dot + 12 px** AUDIBLE / SILENT / HIDDEN BY THIS LOOK, gap 6                                 | **FIXED** (dot, size, gap); ARGUED: the upper-case vocabulary is the app's one (`plateAudio.ts`), shared with the row chip                                                                   |
| gain               | range 140 × 26, radius 7; output 34 px, 11 px, right, secondary; gap 9                       | **range 140 × 26; output 34 px, 11 px, right, secondary; gap 9**                                   | **FIXED**; ARGUED: the range's radius is `.cg-field`'s                                                                                                                                       |
| verbs              | `ON` / `OFF` 40 × 32, `SOLO` 46 × 32, 11 px 650, gap 5; hover ON sky, OFF purple, SOLO amber | **40 × 32 / 46 × 32, 11 px, gap 5**; `secondary` × 2, `caution`, the primitive's hovers            | **FIXED** (boxes); ARGUED: per-verb hover hues — the Button primitive owns its variants' states; SOLO wears the app's caution amber as the reference's does                                  |
| row hover / focus  | `#182838`; focus `2px solid --blue`, offset 3                                                | `--r-table-row-hover`; `2px solid --r-accent`, offset −2 (inside)                                  | **FIXED** (hover, ring); ARGUED: an outside offset clips in a scrolling list                                                                                                                 |
| right-click / keys | a row opens the owner's audio on that plate; `aria-label="… · right-click for audio"`        | **the same, on an OWNED row**; a stranded or blind row opens nothing and says nothing about a menu | **FIXED** (built, both doors, keyboard parity)                                                                                                                                               |

**The audio dialog (`08`)**

| property         | reference (rendered)                                                                                          | app (after this phase)                                                                                                                         | verdict                                                                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| title            | `Live audio` 20 px 650 + a 42 px volume glyph                                                                 | `Live plate audio`, the modal primitive's title                                                                                                | ARGUED: the primitive's one treatment; the name is pinned by the row's tests                                                                                                                                                                                                       |
| subtitle         | `Channel 1 · Bed 1 · 3ghab` 13 px muted, margin-top 3                                                         | **`<row> · <template> · 1-70` 13 px muted**, ids on `title`, each name in its own `<bdi>`                                                      | **FIXED** (built — golden rule 11; `R-028` keeps the coordinate in the sentence); ARGUED: `Channel 1` — the coordinate carries the channel                                                                                                                                         |
| context line     | `On air` badge · `3 frames · 2 frames` · `Changes apply on release`; `11px 20px`, 13 px / 12 px               | **`N frames · <look label>` · `Changes apply on release`**, `11px 0`, 13 px / 12 px                                                            | **FIXED** (the line, the counts, the hint); the `On air` badge NOT adopted (A12); ARGUED: the look's LABEL rather than its frame count — the strip already counts frames                                                                                                           |
| head             | `Frame / source · Requested gain · Audio controls`, 12 px, `1fr 269 190` gap 18, `10px 0`, rule               | **the same three, 12 px, `minmax(0,1fr) 269px 190px` gap 18, `10px 0`**, rule `--r-border-strong`                                              | **FIXED**                                                                                                                                                                                                                                                                          |
| mixer row        | 85 px (`12px 0`, min 83), rule below                                                                          | **`12px 0`, min 83**, rule `--r-border-soft`                                                                                                   | **FIXED**                                                                                                                                                                                                                                                                          |
| index chip       | 29 × 29, radius 4, 13 px, raised ground                                                                       | **29 × 29, radius 4, 13 px**, `--r-surface-raised`                                                                                             | **FIXED**                                                                                                                                                                                                                                                                          |
| name / seat line | the PRODUCER's name 14 px 600; `Frame 1 · Layer 1-10` 12 px                                                   | the PLATE id 14 px 600 in a `<bdi>`; **`Frame 1 · on 1-10`** 12 px (or `· not seated`)                                                         | **FIXED** (ranks, seat line); ARGUED: the plate id, not the producer — it is the handle the strip, the row chip and the bridge all use, and the producer is one column over on the plates tab; `Layer N` is a ROW's name (`cg/bank-shape`), so the coordinate is said as `on 1-10` |
| fader            | 28 px; output 43 px 13 px right; state word 12 px (`Audible · requested` mint / `Muted` / `… hidden by look`) | **28 px; 43 px 13 px right; 12 px state word** from the ledger — AUDIBLE / SILENT / HIDDEN BY THIS LOOK / ARMED · HIDDEN … / NOT SEATED        | **FIXED** (boxes, a per-plate word); ARGUED: the vocabulary is the app's one; `Audible · requested` in MINT is refused — mint is the reference's healthy hue and A4 keeps it off anything that reads like air                                                                      |
| verbs            | 58 × 36, gap 8, 12 px, quiet; hover ON mint, OFF amber, SOLO sky                                              | **58 × 36, gap 8, 12 px**; `secondary` × 2, `caution`                                                                                          | **FIXED** (boxes); ARGUED: hover hues — ON's mint hover is the reference's live hue (A4)                                                                                                                                                                                           |
| MUTE             | none                                                                                                          | **removed** — OFF was its twin, two names for one write                                                                                        | **FIXED**; its tests re-pointed to OFF, which stays pressable on a silent plate (idempotent, never a toggle to read first)                                                                                                                                                         |
| footer           | `ON = 100% · OFF = 0%` / `SOLO silences all other frames of this row, including hidden frames.` 12 px; `Done` | **the same two sentences**, 12 px muted, plus the no-un-solo clause and "ON is full volume, not a return to the previous fader level"; `Close` | **FIXED** (sentences, on the surface); ARGUED: `Done` → `Close`, the primitive's cancel word                                                                                                                                                                                       |
| box              | 860 wide, radius 14, `#141b25`, a 30 px shadow                                                                | the modal primitive's `wide`                                                                                                                   | ARGUED: the primitive                                                                                                                                                                                                                                                              |
| focus            | the fader of the plate pointed at                                                                             | **the same** (`data-modal-autofocus`), else the first fader                                                                                    | **FIXED**                                                                                                                                                                                                                                                                          |

**What the owner will see change on screen:** the LIVE SOURCES tab is a table now — a
counting toolbar with the panic button at its right, seven headed columns, one 42 px line per
seated plate with its fader and `ON OFF SOLO` at the right; a right-click (or `Shift+F10`) on
any of those lines opens the owner's audio dialog on that plate. The dialog itself names its row
under the title, lists frames as numbered rows with a coordinate under each name, says NOT
SEATED where nothing is on a layer, has no MUTE, and carries `ON = 100% · OFF = 0%` in its
footer. The Inspector is headed by the row's name with the template beneath it.

### 13.4 The waves, counted — how the reference was read

Counted in Chromium from the page's own CSSOM, as Phase 5 did (12.4): `.plate-table` **20**
rules (19 unconditional, 1 under `@media`), `.plate-toolbar` 11 (6 + 5), `.plate-verb` 5,
`.plate-audio` 5, `.plate-panic` 5 (4 + 1), `.plate-gain` 3, `.plate-picture` 3, `.plate-solo`
2, `.plates-panel` 1; for the dialog `.audio-modal` **10** (8 + 2), `.modal-foot` 11 (6 + 5),
`.audio-verbs` 8 (6 + 2), `.audio-slider` 6, `.audio-context` 6 (3 + 3), `.audio-mixer-row` 5
(3 + 2), `.audio-source` 5 (4 + 1), `.audio-head` 3, `.foot-info` 3. Only the last
unconditional wave paints at 1280 × 800; every number in 13.3 is what the browser read.

### 13.5 🔴 The red-first proofs

| proof                                   | file                                                                               | RED against                                                                                                                                                                                                                                                                                                          | GREEN                     |
| --------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| changing audio does not take (the wire) | `tools/caspar-bridge/tests/audio-does-not-take.integration.test.ts`                | a planted seat-on-raise in `setLivePlateVolume` (`#planLiveSeating` + `#applyLivePlates` ahead of the gate for a row with no record): the three ready-row cases red with three `PLAY`s and seats each; the SOLO-scope case red too — the plant seated `item-2` PAST the one-carrier gate; the positive control green | restored, 5 / 5           |
| SOLO scope names the owning row (wire)  | same file, §2                                                                      | the same plant (above)                                                                                                                                                                                                                                                                                               | 5 / 5                     |
| guard item 23 (1) the surface           | `apps/runtime/tests/contextMenuSuppression.dom.test.ts`                            | `preventDefault` removed in `App.tsx`: exactly (1) red                                                                                                                                                                                                                                                               | 3 / 3                     |
| guard item 23 (2) the text field        | same file                                                                          | the `isEditable` early return removed: exactly (2) red; (3) green under both plants                                                                                                                                                                                                                                  | 3 / 3                     |
| keyboard parity, both doors             | `plateAudioAccess.dom.test.ts` §1–2, `liveSourcesPanel.dom.test.ts` (+4), Chromium | written before the keys were wired: `Shift+F10` and `ContextMenu` opened nothing (the row handled Enter and Space only; the panel had no handler)                                                                                                                                                                    | 5 / 5, 66 / 66, 4 / 4 e2e |
| SOLO scope names the owning row (App)   | `plateAudioAccess.dom.test.ts` §3                                                  | asserts `item-looks`'s intents unchanged beside `item-irib-news`'s hidden `guest-2` at 0 — a SOLO that silenced everything, or one scoped to the visible look, fails it                                                                                                                                              | green                     |
| the Inspector heading (A14 a)           | `inspectorHeading.dom.test.ts`, Chromium                                           | red against the shipped Inspector (heading = the template's display name; `h3[data-inspector-heading]` absent); a second red — the mock's items carry no `slot` — surfaced the binding fallback (13.1)                                                                                                               | 3 / 3, e2e                |

The plants are not in the tree; each was reversed by hand and checked absent (`git grep
PLANTED` finds nothing).

### 13.6 The deletion guard — item 23 discharged, item 25 kept, the rest green

**Item 23** — written FIRST, both halves red against their own plants (13.5), then the phase
rewired right-click around it: the app-wide suppressor in `App.tsx` is byte-for-byte unchanged,
and the two doors this phase added call `preventDefault` only when they opened something (a
stranded plate's right-click is left to the suppressor, asserted). **Item 25** — the live-source
swap on the row's context menu — is untouched: the menu keeps SOURCE beside AUDIO
(`livePlateAudio.dom.test.ts` still pins the adjacency). **Item 5's sibling, the LIVE SOURCES
tab's stranded and blind sentences**, keep their place on the surface through
`LiveLayerRowView.plain` (13.3, the row's second line). Phase 9.3 now owes FOUR tests — the
three banners and the tooltip.

### 13.7 What Phase 6 did NOT do — and the numbers filed

- It did not build the reference's owner filter, its per-verb hover hues, its `On air` context
  badge (A12), its producer-named mixer rows, or its `Done` — each argued in 13.3.
- It did not build `R-061` (b), the position-draft Reset — parked by the owner (A14).
- It did not touch the bridge's audio path, the mixer's batch / `COMMIT` contract (COMMIT stays
  channel-wide, the staging area stays shared, "commit the partial, then repair" stands), the
  one-shot `#reassertDeclaredVolumes`, or R-022's boot re-assert — the wire test WAITS for that
  traffic and baselines after it. The bridge's only diff is the removal of a plant that was
  never committed.
- It did not add a persisted key, file or schema; `persistedKeyCensus.test.ts` is unchanged.
  `RowPlateAudio.coordinate` and `LiveLayerRowView.plain` are renderer view fields.
- It did not translate anything, and reworded one sentence of the app's own (`audio is on the
strip below` → `audio is on this row`, the strip having moved beside the row); the dialog's
  _"audible on air"_ was REPLACED by the ledger's word, not reworded.
- It did not measure any geometry in jsdom: every box is in `live-plate-audio-access.spec.ts`.
- Numbers taken: none new. `R-060` closed (A13), `R-061` split (A14 — (a) done, (b) parked).

## 14 — Phase 7: Settings and channels

The record for `PROMPT.md` §7 and for owner question A15, which was answered BEFORE the phase
work: A15 at the wire; what contradicted the prompt; what was built and where each per-channel
and station-wide fact is read from; the reference measured in a browser and counted by its
waves, every delta fixed or argued; the red-first matrix; the guard (item 28 closed); the three
gaps filed; and what was not done.

### 14.0 🔴 A15 — MUTE's removal, decided by what reaches the wire

Phase 6 removed MUTE from the audio dialog and reported it as a "Fixed" row. §6's own
`ON = 100 % · OFF = 0 %` sanctions a two-state model, but MUTE was a control the app HAD and the
reference does NOT draw — the exact deletion-by-omission class the guard exists to catch — and it
was not named as a removal. Established from the tree at `c5d07d9a~1` (the commit before Phase 6)
and at `HEAD`, not decided by preference:

**1. What MUTE sent, and what OFF sends now — the same command.**

| control     | handler at `c5d07d9a~1` (`LivePlateAudioDialog.tsx`)     | reaches                                                            |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| MUTE (:234) | `commit({ [plate.sourceId]: 0 })`, `disabled={!audible}` | `onApplyVolumes` → `stack.setPlateVolumes` → `setLivePlateVolumes` |
| OFF (:283)  | `commit({ [plate.sourceId]: 0 })`                        | the same three                                                     |

Both maps arrive at `CasparRuntime.setLivePlateVolumes(itemId, volumes)`, which calls
`setLivePlateVolume(itemId, plateId, 0)` per plate (`caspar-runtime.ts:7699-7710`), and that method
sends exactly one thing when a seat exists and is not held: `this.#builder.mixerVolume(record.slot,
0)` (`:7489-7493`), which is **`MIXER {channel}-{layer} VOLUME 0`** (`command-builder.ts:231-233`).
That is the bridge's ONLY audio verb: `git grep -n "MUTE" -- packages/caspar-client/src
tools/caspar-bridge/src packages/amcp-mock/src` finds `CREATED_MUTED_VOLUME = 0` (a VOLUME value),
`ADD_MUTE_FAILED` (the error code for a `MIXER VOLUME 0` that did not land before a `CG ADD`), and
prose — no flag, no second command. **A mixer mute flag and a `VOLUME 0` are indeed different
things, and the tree has never emitted the former.** The `silencing` gate (`:7481`) treats both
buttons' `0` identically: a silence is never gated on `#ownsLiveSeats`, so MUTE and OFF reached the
wire under the same condition.

**2. Nothing reads, persists, restores or re-asserts a mute FLAG — every path reads the VALUE.**

- The intent record is `#plateVolumes: Map<itemId, LivePlateVolumes>` (`:1049`), written by
  `setLivePlateVolume` for MUTE and OFF alike (`:7510`, `{ ...prev, [plateId]: volume }`).
- The ledger's as-sent copy is `record.intendedVolume` (`:7500-7507`), written only after the
  `VOLUME` landed.
- Retention and restore: the item publishes `plateVolumes` on `StackItemState` (`:1953`), and the
  bridge adopts it back at boot from the same field (`:2521-2522`). The mock's persisted keys are
  the census's four `cg-runtime:*` names; none is a mute.
- Re-assert: `#applyLivePlates` reads `intent[plateId] ?? CREATED_MUTED_VOLUME` at every seat
  (`:6318`, `:6441`); a held seat is parked at `CREATED_MUTED_VOLUME` whatever the intent says
  (`:6497`). `#reassertDeclaredVolumes` (`:3604-3612`) blankets the BANK's rows with
  `INTENDED_VOLUME` and never addresses a plate layer (they lie below the band, by the
  `low-bank-not-below-band` rule its own header cites). R-022's `#rehearsing … muted: boolean`
  (`:1215`) records whether ENTRY's `MIXER VOLUME 0` landed on a TEMPLATE layer — a different
  subject and a different layer.
- The schemas: `StackItemStateSchema` carries `plateVolumes` (a record of numbers); `LiveLayerState`
  carries `intendedVolume` and `held`; no field named mute exists in `packages/shared-ipc/src`.
  So a reconnect, a boot adoption or a look switch restores `plateVolumes[plate] = 0` identically
  whichever button wrote it: **the two cannot part on a re-assert, because there is one record.**

**3. Was any operator state expressible under MUTE that is not under OFF? No — the reverse.**
MUTE's reachable transition was `value > 0 → 0` (its `disabled={!audible}`); OFF's is
`any → 0`. OFF's set contains MUTE's. The one observable delta runs the other way: OFF on an
already-silent SEATED plate re-sends one `MIXER … VOLUME 0` (idempotent; MUTE was disabled there
and sent nothing). Wording: `aria-label="Mute X"` became `Silence X`, nothing translated.

**Verdict: OFF is exactly equivalent at the wire and in every store.** MUTE's removal is recorded
as DELIBERATE — guard item **28, CLOSED** (§3) — so no later reader thinks it was lost by
accident. The dialog's own header already argued the removal ("two names for one write");
this section is the evidence that was missing beside it. Nothing was restored.

### 14.1 What contradicted the prompt — and what did not

- **"Station setup … lacks only OutputsSection" is not what the tree says.** The app has had
  `OutputsSection` since `B-223` (17 dom cases, two e2e), on the Channel tab since
  `STATION-CHROME-01` §4. What it lacked was the reference's SHAPE — a `Slot · Configured output ·
Runtime status` table with a `N of M running` count — over a prose line. So "OutputsSection in"
  meant RE-SHAPE, keeping every B-223 row beneath the table (14.3). The section set matched
  one-for-one, as the prompt said.
- **The reference's Station setup is a SEPARATE prototype**, not a pane of the console one:
  `createStationSetup(host, adapter)` renders into a shadow root with its own 402-rule stylesheet
  and its OWN PALETTE (`--surface #15191f`, a mint `--accent #8ce6d1`, its own ambers and reds)
  that is not the console's approved palette. §0's rule was applied as written — measured in the
  browser, only geometry transcribed, every colour a role token; the mint stays on healthy (A4).
  The OUTER document carries four `.channel-modal` and three `.channel-settings-grid` rules for an
  element the page never emits — the same dead-wave class Phase 3 met; nothing was read from them.
- **The prototype's channel list IS a catalogue** (`channelCatalog = [{id:1,name:'News',…},
{id:2,'Sports'},{id:3,'Clean feed'}]`, a `#channel-select` in the console head, one
  `stationSetupInstances` entry per channel, `stationShared` for the servers, sources and
  delimiters). That is the shape §7 asks for and 14.2 builds — with no NAME, because the bridge
  publishes none and none is invented (A3).
- **The Channel pane carries `Default sources · this channel`** — `t.defaultSources`, the
  prototype's own template shape, ruled out by §0. NOT built; argued in 14.3.
- **The app's fixed frame came from the ABANDONED mockups** (A2): `min(1000px, 100%)` ×
  `min(680px, 100vh − 48px)` and a 59 px footer floor were `STATION-CHROME-02`'s transcription of
  `docs/design/station-setup-redesigned.html`. The reference as rendered is `min(1140px, 100vw −
64px)` × `min(810px, 100vh − 64px)` with a 74 px footer. FIXED, through the same tokens; the
  two-edge property (`station-setup-frame.spec.ts`) is about ONE box on every tab and holds at
  either size. The mockups themselves are not chased (`§6`, A2 — one line, as §7 asks).
- **What did NOT contradict:** §4's corrected finding (A3) — `itemId` is one row, `slot` carries
  `{channel, layer, server}`, the per-row verbs are channel-agnostic; the three real gaps are
  exactly as listed; and `silenceAllLivePlates` stays `z.void()` — untouched, by diff.

### 14.2 What was built, and where each fact is read from

🔴 **PER-CHANNEL, keyed by channel id:** the channel strip (`ChannelScope`) is
`channelIds(bank, settings)` — the union of `fixedLayers.config.channel` and every
`channelSettings.settings[].channel`, the two channel sources the bridge already publishes —
and its selection is a channel ID in `channelStore` (session-only; not persisted, no key).
Station setup's Channel tab reads the SAME resolution (`useSelectedChannel`) and reports that one
channel: its raster and verdict (`channelSettings`), and its outputs (`connections.health`,
filtered to the channel per server). The dialog's subtitle names it — `Channel N · Primary A`.
🔴 **STATION-WIDE, and never reading the selection:** Servers (`connections.config`), Live sources
(`sources.*`), Text file delimiters (`delimiters.*`), Layers (`fixedLayers.*` — ONE bank, gap 3),
templates and the lock. Proved as IDENTICAL DOM text under channel 1 and channel 2
(`stationSetupChannelKeyed.dom.test.ts`, with a positive control on the text's length).

| piece             | where                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the channel list  | `features/channels/channelList.ts` — `channelIds` (union, de-duplicated, sorted; `[1]` when nothing is declared; `observed` deliberately not a source) and `resolveSelectedChannel` (choice → bank → first)                                                                                                                                        |
| the choice        | `features/channels/channelStore.ts` — a channel id or `null`, `useSyncExternalStore`, test seam                                                                                                                                                                                                                                                    |
| the one read      | `features/channels/useSelectedChannel.ts` — `{ channels, selected }`, used by the strip AND the dialog                                                                                                                                                                                                                                             |
| the strip         | `ChannelScope.tsx` — one `CHANNEL N` tab per channel, `idPrefix="channel"`, `level="outer"`; with one channel it renders what it did                                                                                                                                                                                                               |
| the dialog        | `StationSetupDialog.tsx` — `subtitle` (`Channel N · Primary A`), rail icons (`SECTION_ICONS`, lucide), the pane class, the footer text token                                                                                                                                                                                                       |
| the Channel tab   | `ChannelSection.tsx` — the video-format card for the selected channel (`data-raster-channel`, `CH 01`, mode word + scan, `Resolution · Frame rate · Server mode`, then `Declared by · Check`), the "why read only" details, `OutputsSection` with `channel`                                                                                        |
| the mode words    | `stationSetup/videoModeWords.ts` over `@cg/shared-ipc`'s `videoModeRaster` / `videoModeScan` (new, beside `videoModeFramePeriodMs` — one token grammar) / `videoModeFramePeriodMs`; an unreadable token prints its gap in every column                                                                                                             |
| the outputs table | `connections/OutputsSection.tsx` — per server, per (selected) channel: the check line with a `N of M running` tag, a `Slot · Configured output · Runtime status` table (one row per DECLARED consumer, verdict counted PER KIND as `MissingConsumer` is, `data-output-row`, severity attribute), then every B-223 row unchanged in a detail column |
| the section head  | `SetupSection.tsx` — `h2` title, the legend as description, the contract as a tag (`contractTag` in `sections.ts`: `Read only` · `Apply together` · `Auto-save`)                                                                                                                                                                                   |
| the primitives    | `Modal.tsx` — `subtitle` prop (`[data-modal-subtitle]`), the fixed head's floor and padding, the fixed foot's padding, gap and surface; `Tabs.tsx` — `TabSpec.icon` (a bare `<svg>`, so a tab's first span stays its label), the rail width from the token home                                                                                    |
| the tokens        | `STATION_SETUP_PX` → `--r-setup-*` (43), `--r-video-*` (19), `--r-output-*` (22), `--r-modal-*-fixed` / `--r-modal-subtitle-*` (7), `--r-font-mono`; the frame and `--r-modal-foot-h` re-pointed; read by `controls.css`'s Phase 7 block and the components; no colour literal                                                                     |
| proofs            | `channelList.test.ts` (6), `channelScope.dom.test.ts` (4), `stationSetupChannelKeyed.dom.test.ts` (5), `outputsSection.dom.test.ts` (+6 = 22), e2e `station-setup-geometry.spec.ts` (2, Chromium), `pgm-output-missing.spec.ts` (+3 lines), `station-setup.spec.ts` re-pointed to the `Video format` region                                        |

### 14.3 🔴 THE MEASURED PROPERTY TABLES — rendered reference vs app, every delta FIXED or ARGUED

The reference column is Chromium at 1280 × 800 on `09-channel-settings.html` opened as a file,
its `data-start="channels"` opening the dialog, a scratch script reading `getComputedStyle` and
`getBoundingClientRect` through the shadow root (hovering where a hover is quoted). The app column
is the token the surface reads, asserted against the page by `station-setup-geometry.spec.ts`
(Chromium, 1280 × 800) — never jsdom. "Palette" means the reference's OWN palette, which is not
the console's; the role token stands.

**The frame and its chrome**

| property       | reference (rendered)                                                                                                                                   | app (after this phase)                                                                                                                                      | verdict                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frame          | 1140 × 736 (`min(1140px, 100vw − 64px)` × `min(810px, 100dvh − 64px)`), radius 16, a 100 px shadow                                                     | **1140 × 736** (`--r-modal-w-fixed` / `--r-modal-h-fixed`)                                                                                                  | **FIXED** (was 1000 × 680, the abandoned mockup's); ARGUED: radius and shadow are the modal primitive's, shared by every dialog                                                                     |
| head           | 90 px floor, `21px 28px`, gap 14, rule below; a 44 px emblem; title 19 px / 650; `Preview` tag                                                         | **90 floor, `21px 28px`, gap 14**, rule below; the primitive's title                                                                                        | **FIXED** (floor, padding, gap); ARGUED: the emblem and the `Preview` tag are the prototype's furniture; the title rank is the primitive's one treatment                                            |
| subtitle       | `Channel 1 · News · Primary A`, 13 px muted, 3 px under the title                                                                                      | **`Channel 1 · Primary A`, 13 px muted, 3 px under** (`[data-modal-subtitle]`)                                                                              | **FIXED** (built — the `Modal` gained a `subtitle`); ARGUED: no channel NAME — the bridge publishes none and none is invented (A3)                                                                  |
| head status    | `● 3 on air` in mint                                                                                                                                   | not adopted                                                                                                                                                 | ARGUED (A12): a second claim about air, in the healthy hue; the Servers refusal already carries the count where it matters                                                                          |
| close          | 38 × 38 icon button                                                                                                                                    | the primitive's 30 × 30 `✕`                                                                                                                                 | ARGUED: the primitive's close, shared by every dialog                                                                                                                                               |
| body           | `226px minmax(0,1fr)`                                                                                                                                  | rail **226** (`--r-setup-rail-w`) + pane                                                                                                                    | **FIXED** (was 13rem = 208)                                                                                                                                                                         |
| rail           | `24px 14px 18px`, sunken ground, rule right, gap 4                                                                                                     | **`24px 14px 18px`**, `--r-surface-sunken`, rule right, **gap 4**                                                                                           | **FIXED**                                                                                                                                                                                           |
| group word     | 11 px / 600 / .11em uppercase muted; `0 13px 7px` first, `18px 13px 7px` after; `Playout · Content · Workspace`                                        | **11 px / 600 / .11em** uppercase muted, **the same paddings** + the app's hairline rule above later groups; `Playout · Content · Layers`                   | **FIXED** (size, tracking, paddings); ARGUED: the rule above a group is the owner's own (2026-09-07) and stays; `Layers` is the app's group word                                                    |
| tab            | 44 min-height, `11px 12px`, gap 11, radius 8, 14 px; secondary ink at rest; hover `#1c222b` + full ink; selected `#20322f` / `#314b45` / `#c8f9ed` 550 | **44, `11px 12px`, gap 11, radius 8, 14 px**; full ink at rest (owner); hover `--r-rail-hover-fill`; selected `--r-rail-selected-*`, medium                 | **FIXED** (box, padding, gap, radius, size); ARGUED: rest ink is the owner's decision; selected and hover fills are the console's tokens (palette)                                                  |
| tab glyph      | 18 px, muted, the accent when selected                                                                                                                 | **18 px** (`Icon`, lucide `Monitor · Server · Radio · Type · Layers`), muted, `--r-accent` when selected                                                    | **FIXED** (built)                                                                                                                                                                                   |
| tab words      | `Channel · Servers · Live sources · Text delimiters · Layers`                                                                                          | `Channel · Servers · Live sources · Text file delimiters · Layers`                                                                                          | ARGUED: `Text file delimiters` is the app's name (pinned by five tests) and says what the list is for; nothing reworded                                                                             |
| tab marks      | a mint count chip (unapplied), an amber lock glyph (blocked) + sr text                                                                                 | the sky dot (edited), the amber dot (blocked) + sr text (`data-tab-badge`)                                                                                  | ARGUED: `STATION-CHROME-01` §2's two dots express the same two states and are pinned by `stationSetupTabs`                                                                                          |
| sidebar foot   | a station card (`A · Primary server · 192.168.21.114`) and a preview note                                                                              | not adopted                                                                                                                                                 | ARGUED: the primary and its host are on the status bar; the rail must stay short enough to stand still (`station-setup-frame` asserts it does not scroll); the primary goes in the subtitle instead |
| pane           | `29px 32px 32px`                                                                                                                                       | **`29px 32px 32px`** (`--r-setup-pane-pad`)                                                                                                                 | **FIXED** (was `1rem 1.1rem 1.25rem`)                                                                                                                                                               |
| section head   | `h2` 24 px / 650 / −.035em; description 14 px muted, 7 under, `max-width 61ch`; a tag; 23 px below                                                     | **`h2` 24 px / 600 / −.035em; description 14 px muted, 7 under, 61ch; the contract tag; 23 below**                                                          | **FIXED** (was a 0.95rem `h3` and a 0.72rem legend); ARGUED: 650 → 600 (the weight scale)                                                                                                           |
| contract tag   | `.tag` 12 px / 550, `5px 8px`, radius 6, raised chip: `Read only` · `Apply together` · `Auto-save`                                                     | **12 px / 500, `5px 8px`, radius 6**, `--r-surface-raised`, the same three words from `contractTag`                                                         | **FIXED** (built); ARGUED: 550 → 500                                                                                                                                                                |
| footer         | 74 floor, `15px 32px`, gap 14, rule above, the dialog's own surface; message 13 px muted with a glyph; `Close` / `Revert` + `Apply …`                  | **74 floor (`--r-modal-foot-h`), `15px 32px`, gap 14**, rule above, `--r-surface`; contract 13 px; the app's footer rule (`Revert` + `Apply …`, or nothing) | **FIXED** (floor, padding, gap, surface, size); ARGUED: the glyph (the `B-239` label must recede); the per-section `Close` was retired by `B-240`                                                   |
| footer buttons | 40 px, `9px 15px`, radius 8, 14 px / 550                                                                                                               | the modal action family (36 px floor)                                                                                                                       | ARGUED: one button family across every dialog; a taller floor is a token flip on `--r-btn-*`, not this dialog's                                                                                     |

**The Channel pane**

| property        | reference (rendered)                                                                                                                                                                   | app (after this phase)                                                                                                                                                                                         | verdict                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| description     | `Video format and outputs reported by the server.` · tag `Read only`                                                                                                                   | the section legend (`Read-only — reported by the server, not set here.`) · tag `Read only`                                                                                                                     | **FIXED** (shape); ARGUED: the app's sentence, nothing reworded                                                                         |
| video card      | radius 12, a green-tinted gradient, `.video-heading{padding:19px 22px 0}`                                                                                                              | **radius 12** (`--r-setup-card-radius`), `--r-surface-sunken`, **`19px 22px 0`**                                                                                                                               | **FIXED** (radius, paddings); ARGUED: the tint is the prototype's palette                                                               |
| eyebrow · token | `VIDEO FORMAT` 11 px / 600 / .11em; `CH 01` 12 px mono `5px 8px` radius 6                                                                                                              | **the same** (`--r-video-eyebrow-text`, `--r-video-token-*`, `--r-font-mono`)                                                                                                                                  | **FIXED** (built)                                                                                                                       |
| mode word       | `1080i` 46 px / 550 / −.055em + `Interlaced` 13 px; `5px 22px 21px`, gap 12                                                                                                            | **`1080i` 46 px / 500 / −.055em + `Interlaced` 13 px; `5px 22px 21px`, gap 12**                                                                                                                                | **FIXED** (built, from `videoModeScan`); ARGUED: 550 → 500                                                                              |
| metrics         | `Resolution · Frame rate · Server mode`; `1.1fr .75fr 1fr`, `0 22px`, `17px 0 20px`, rule above; `dt` 12 px muted (5 under), `dd` 15 px / 500, mono 13 px; each inset 22 behind a rule | **the same three, the same grid, paddings, ranks and rules** — then `Declared by · Check` in a second row                                                                                                      | **FIXED** (built); the second row is the app's own (`B-236`), kept by the guard — the reference draws neither                           |
| frame rate      | `25 fps · 50 fields/s` for an interlaced mode, `50 fps` for progressive                                                                                                                | **the same words**, from `videoModeFramePeriodMs`                                                                                                                                                              | **FIXED**; displayed, never modelled (`channelSettings.ts` keeps rate out of the schema on purpose)                                     |
| why read-only   | a `<details>` — `Why is the video format read only?` — 13 px, 17 above                                                                                                                 | **a `<details>` with the same summary**, the app's own paragraph inside, 13 px, 17 above                                                                                                                       | **FIXED** (shape; the sentence is the app's, unchanged)                                                                                 |
| default sources | `Default sources · this channel` — a template select and one field per frame, `Save defaults`                                                                                          | not built                                                                                                                                                                                                      | ARGUED (§0): `t.defaultSources` is the prototype's template shape; the real per-look inputs live on the row and in the Inspector        |
| outputs head    | `Outputs` 16 px / 600 · tag `2 of 3 running`; 26 above, 13 below                                                                                                                       | **`Outputs` 16 px / 600 · `N of M running` per check (`data-output-count`); 26 above, 13 below**                                                                                                               | **FIXED** (built)                                                                                                                       |
| outputs table   | in a radius-12 card; `th` 12 px / 450 `12px 18px` on the sunken ground, rule; `td` 14 px `15px 18px`, soft rule; slot column 80; hover `#1d242d`                                       | **in a card; `th` 12 px / 500 `12px 18px` sunken, rule; `td` 14 px `15px 18px`, `--r-table-rule`; slot 80; hover `--r-table-row-hover`**                                                                       | **FIXED** (built); ARGUED: 450 → 500                                                                                                    |
| table words     | `Slot · Configured output · Runtime status`; `01` · `DeckLink 1` · `DeckLink 1 running` / `Not running`                                                                                | **the same head**; `01` · `decklink (device 23487013)` · `Running` / `Not running`                                                                                                                             | **FIXED** (head, rows); ARGUED: the configured output is named as `missingWords` names it — the kind and device the banner already says |
| slot chip       | 29 × 28 mono 12 px radius 6 raised                                                                                                                                                     | **29 × 28 mono 12 px radius 6**, `--r-surface-raised`                                                                                                                                                          | **FIXED**                                                                                                                               |
| kind glyph      | 17 px muted (`card · monitor · radio`)                                                                                                                                                 | **17 px muted** (`CreditCard · Monitor · Radio · Film · Volume2 · Lightbulb · Cable`)                                                                                                                          | **FIXED**                                                                                                                               |
| status word     | 13 px, gap 7, a 15 px glyph; mint when running; AMBER `Not running` (on an NDI — an AIR kind)                                                                                          | **13 px, gap 7, 15 px glyph**; `--r-ok-text` running; **`--r-error-text` for a missing PROGRAM output**, `--r-caution-text` for a local monitor                                                                | **FIXED** (box); ARGUED (A4, 2A): alarm severity by air-criticality — the reference's amber on an air loss is the drawing being wrong   |
| missing row     | an amber wash (`#28241d40`)                                                                                                                                                            | `--r-caution-bg`                                                                                                                                                                                               | **FIXED** (palette)                                                                                                                     |
| output note     | `NDI is configured but inactive.` (amber, 500) `Review output slot 3 on the server.` 13 px, 12 above                                                                                   | the B-223 AIR row (`AIR — decklink (device …) declared and not running. Nothing on this channel reaches air.`) + the addressing line, the restart paragraph, the recipe, the creation outcome; 13 px, 12 above | **FIXED** (place, size); ARGUED: the words are `B-223`'s, every one pinned; the guard keeps them                                        |
| how identified  | a `<details>` — `How are outputs identified?`                                                                                                                                          | **a `<details>` with the same summary**, carrying the app's own `INFO CONFIG` / `INFO <channel>` sentence and the severity sentence                                                                            | **FIXED** (shape)                                                                                                                       |
| channel line    | none (one instance per channel)                                                                                                                                                        | `Channel 1 on server A — checked hh:mm:ss` per check                                                                                                                                                           | ARGUED: `R-028` keeps the coordinate in the sentence; two servers can check one channel                                                 |

**Cards on every tab** (the shared `.cg-card` rhythm, so Servers, Live sources, Delimiters and
Layers moved with it): radius 12 (was 6) — **FIXED**; head `17px 20px`, gap 12, its title 16 px /
600 sentence case (was a 0.72rem uppercase run) — **FIXED**; body 20 px (was 12) — **FIXED**;
the note as a HELP band (`14px 20px`, 13 px, rule above, sunken ground) — **FIXED**; 20 px between
cards — **FIXED**. Those tabs' own bodies (fields, lists, the band editor, the layer table) were
NOT re-measured in this phase: §7 is the dialog and the Channel pane, and each of those bodies is
a section `STATION-CHROME-02` built to the (now abandoned) mockups with its own tests. Stated as
not done in 14.8.

**What the owner will see change on screen:** SETTINGS opens a larger frame (1140 wide) whose
title carries `Channel 1 · Primary A` beneath it; the rail is wider, its five tabs taller with a
glyph each; every section is headed by a big title with its legend under it and a `Read only` /
`Apply together` / `Auto-save` tag at the right; the cards have rounder corners, a sentence-case
head and more room; the footer is taller. The Channel tab is a video-format card — `CH 01`, a large
`1080i · Interlaced`, `Resolution · Frame rate · Server mode`, then `Declared by · Check` — a
collapsed "Why is the video format read only?", and an Outputs block that, on the plant, draws a
`Slot · Configured output · Runtime status` table with a `2 of 3 running` tag and a marked row
for the missing DeckLink, the B-223 detail beneath it. Above the workspace, `CHANNEL 1` is the
same one tab it was.

### 14.4 The waves, counted — how the reference was read

The dialog's stylesheet is the shadow root's ONE sheet, 402 rules. Counted from its CSSOM:
`.settings` **17** (7 unconditional, 10 under `@media`), `.tab` **12** (8 + 4), `.card` 12 (9 + 3),
`.metric` 13 (5 + 8), `.output-table` 9 (1 + 8), `.notice` 9, `.btn` 12 (11 + 1), `.video-mode` 6
(3 + 3), `.foot-message` 6 (4 + 2), `.panel-foot` 5 (1 + 4), `.sidebar` 5 (2 + 3), `.section-head`
5 (2 + 3), `.data-table` 5, `.tag` 5, `.output-state` 5 (3 + 2), `.panel-scroll` 4 (1 + 3),
`.nav-group` 3 (2 + 1), `.settings-head` 3 (1 + 2), `.helper-details` 3, `.card-heading` 3,
`.video-card` 1, `.slot` 1. Only the unconditional waves paint at 1280 × 800 (the `@media` ones are
≤ 1000, ≤ 720, ≤ 390 and ≥ 1500 px). The OUTER document adds `.channel-modal` 4 and
`.channel-settings-grid` 3 for an element it never emits — read nothing from them. Precedent:
`.inspector` 33, `.plate-table` 20.

### 14.5 🔴 The red-first proofs

| proof                                            | file                                                      | RED against                                                                                                                                                                                                                                                                                 | GREEN              |
| ------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| the strip is a list, keyed by id                 | `apps/runtime/tests/channelScope.dom.test.ts`             | the shipped `ChannelScope` (`bank?.channel ?? 1`, `useState`): `['CHANNEL 1']` against two declared channels; the choice unreadable; the fallback case stranded on `channel-1` — 3 of 4 red (the one-channel control green both times)                                                      | 4 / 4              |
| the Channel tab is keyed to the selected channel | `apps/runtime/tests/stationSetupChannelKeyed.dom.test.ts` | the shipped `ChannelSection` (every settings entry mapped, the whole health passed): `[data-raster-channel="1"]` present with channel 2 selected, and the mirror; the unconfigured channel absent — 4 of 5 red; the station-wide control green both times, which is what makes it a control | 5 / 5              |
| the outputs table                                | `apps/runtime/tests/outputsSection.dom.test.ts` (+6)      | the shipped prose section: no `[data-output-table]`, no rows, no count — 5 of 6 red (the unreadable-declaration case green both times); every one of the 17 B-223 cases green throughout                                                                                                    | 22 / 22            |
| the list and the resolution                      | `apps/runtime/tests/channelList.test.ts`                  | module-not-found on the first run (the weak form, noted); re-taken with the modules present before either component changed                                                                                                                                                                 | 6 / 6              |
| the geometry                                     | `apps/runtime/tests/e2e/station-setup-geometry.spec.ts`   | written to the tokens; its positive control (`frame.w > 1000`) fails against the abandoned mockup's frame                                                                                                                                                                                   | Chromium, see 14.9 |

The first run of the three new suites reddened on "module not found"; the two pure modules
(`channelList.ts`, `channelStore.ts`) were added and the suites re-run BEFORE `ChannelScope` or
`ChannelSection` changed, so the red on record is on the PROPERTY (`design.md` §11's warning about
an assertion against a constant that does not exist yet). No plant is in the tree.

### 14.6 The deletion guard — item 28 closed, every Station setup decision re-asserted

**Item 28 (A15)** closed by evidence in 14.0. **Every decision already made about this dialog
survives and is still asserted:** one Settings entry point (`station-setup.spec.ts` §1, the status
bar's one door); the fixed frame measured on TWO edges (`station-setup-frame.spec.ts`, unchanged
in what it asserts — the numbers it stood on moved with the tokens, its comments updated);
per-section footers and refusals (`stationSetupTabs`, `stationSetupServers`,
`setupFooterVocabulary`, `modalDismissRole`); the footer rule (`Revert` + `Apply …` on a section
with a commit, nothing on one without — `B-240`, `setupFooterVocabulary`); `B-237`'s confirmation
naming the templates and plates it would drop (`sourcesSection` / `livePlates` suites); `B-238`'s
refusal shown (`removeRowRefusal`, 11 green). `--r-modal-foot-h` is still a floor: its value moved
to the measured 74, its role did not (14.3, the token's own note). Re-run green after the change:
the sixteen Station setup, token-home and rail suites (128 cases) plus the four new ones.

### 14.7 The three gaps — filed, not closed; the trap not stepped on

Filed as **`R-062`** (`docs/prd/runtime.md`), exactly as §4 lists them: (1) `removeAll`, `clearAll`,
`stopAll`, `snapshot` and `silenceAllLivePlates` take `z.void()`; (2) no channel-discovery call
on the contract; (3) `fixedLayers` declares one bank on one channel and is the app's only channel
authority. Nothing was invented to close them: the strip and the dialog read channels the bridge
already publishes, and `channelIds` is the one place a discovery call would feed.
🔴 **`silenceAllLivePlates` is untouched** — by diff (`tools/caspar-bridge` and
`packages/shared-ipc/src/channels/stack.ts` unchanged) and on purpose: PANIC's scope is not the
caller's to choose, and `R-062` records the question for the owner rather than a task.

### 14.8 What Phase 7 did NOT do — and the numbers filed

- It did not build the reference's `Default sources · this channel` card (§0), its head status
  (A12), its emblem, `Preview` tag and station card, its per-tab count chips and lock glyph, or its
  40 px footer buttons — each argued in 14.3.
- It did not re-measure the bodies of the Servers, Live sources, Delimiters and Layers tabs
  (their fields, lists and editors); they took the shared card rhythm and nothing else.
- It did not add a persisted key, file or schema: `persistedKeyCensus.test.ts` is byte-for-byte
  unchanged (`git diff` empty) and green — the inventory it derives from the tree is identical, and
  the new `features/channels/` modules spell no storage (`git grep -n "localStorage\|sessionStorage\|indexedDB\|openOpfsWorkspace" -- apps/runtime/src/renderer/features/channels` finds nothing).
  `channelStore` is session-only by design. The one `@cg/shared-ipc` change is a pure helper.
- It did not touch the bridge, the bulk verbs, `silenceAllLivePlates`, the bank fencing, the
  refusal and preflight paths, `reconcileOnReconnect` or the `LockPolicy` table (§11's hard stops).
- It did not translate anything; three surfaces gained the reference's OWN words (`Video format`
  as the card's region name — was `Raster`, one e2e re-pointed; `Why is the video format read
only?`; `How are outputs identified?`; the three contract tags) and no sentence of the app's was
  reworded. Swept with `git grep`: the old region name and the removed lede survive only as
  history in the PRD and a superseded spec.
- It did not measure any geometry in jsdom: every box is in `station-setup-geometry.spec.ts`.
- Numbers filed: **`R-062`** (the three gaps). Numbers closed: guard item **28** (A15).

### 14.9 The runs

- `pnpm --filter @cg/runtime test:e2e`, Windows, against a fresh `vite build`: the first run
  **139 passed, 2 failed** — both geometry, both the kind a real engine finds and jsdom cannot:
  the rail tab painted **45 px** against its 44 px floor (the console's inherited line-height
  1.55 overflowing it; the reference's `.tab` is 1.35 — added), and `station-setup-frame`'s
  short-section slack read **12 px** because Playwright's default 720-tall page gives the
  `min(810px, 100vh − 64px)` frame 656 px (the reading is now taken at the programme's 1280 × 800,
  where the reference was measured; the assertion is unchanged). Re-run: the three Station setup
  specs **9 / 9**, then the whole suite green (the count is in `tasks.md` 7.5). ⚠
  NON-AUTHORITATIVE (golden rule 12a).
- `pnpm gate`: recorded in `tasks.md` 7.5 with its `0 cached` line.
- The Linux `e2e` on the code head `f9fd0d03`:
  <https://github.com/yasermostafaee/cg/actions/runs/34225793746> — `conclusion: success`,
  11 m 03 s; the `E2E (Playwright)` job RAN 10 m 42 s (12:23:37Z → 12:34:19Z), its `E2E` step
  12:24:40Z → 12:34:10Z. Recorded beside `tasks.md` 7.5, as every phase before it.

## 15 — Phase 8: Template library, import, and the audit log

The record for `PROMPT.md` §8 and for owner answers A1 (applied) and A16 (recorded): the import
path's evidence FIRST, what contradicted the prompt, what was built and where each fact is read
from, the three surfaces measured in a browser with every delta fixed or argued, the wave counts
and the shadow-root check, the red-first matrix, guard item 27 discharged, and what was not done.

### 15.0 🔴 The import path — preserved exactly, and proved by the tests that were already there

The prototype's import is theatre by its own words — its review step is headed `Simulated checks`
and ends _"These are example outcomes, not verification of a real .vcg file."_ The product's is
`importVcgFile` → `importTemplateFromBytes` → `produceTemplateDelivery`: `verify` (refuses with
`failed verification: …`), `unpack` (`could not be unpacked: …`), the `B-196` runtime-contract
guard BEFORE the render, the render (`could not be rendered: …`), and only then
`templates.import`; a refusal registers nothing (`R-001`). **None of it was touched:**
`git diff --stat` over `features/library/importVcgFile.ts`, `features/library/templateDelivery.ts`
and `features/fixedLayers/fixedSlotLoad.ts` is empty, and `packages/vcg-format` is untouched. The
proof is the existing suites, byte for byte as they were, green:

| suite (unchanged)                                    | cases  | what it refuses or proves                                                                      |
| ---------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `template-delivery.test.ts`                          | 16     | throws on bytes that fail verification; `B-196` refuses a newer build BEFORE the render; UTF-8 |
| `import-starter-vcg.test.ts`                         | 4      | every D-119 starter crosses `verify → unpack → render`                                         |
| `import-path-morph-vcg.test.ts`                      | 2      | a Designer path-morph package survives the boundary verbatim                                   |
| `templateImportAssignments.test.ts`                  | 7      | a re-import keeps its bindings and drops a plate the new version lost                          |
| `single-file-export-import.test.ts`                  | 1      | the produced HTML is self-contained                                                            |
| `local-library.offline.test.ts`                      | 5      | the library registers what import delivered                                                    |
| `templatePicker.dom.test.ts` / `templateRemoval.dom` | 6 / 10 | LOAD opens the picker with `Import a .vcg…` inside it; `Delete from station` and its refusals  |
| e2e `import-vcg-template.spec.ts`                    | 2      | a verified package is registered and bound; **a broken one errors and registers nothing**      |
| e2e `fixed-layers.spec.ts` / `live-source-carrier`   | 8 / 1  | import+load onto the exact slot; the carrier state on the picker's row                         |

The only NEW import-facing behaviour is `02`'s drop zone, and it is proved to be the same path by
the sentence the path's own `verify` produces: bytes that are not a package, dropped on the picker
opened from a row, reach the row's error channel as `“garbage.vcg” failed verification…`
(`templatePicker.library.dom.test.ts`, the last case). No test was rewritten to fit the surface.

### 15.1 What contradicted the prompt — and what did not

- **§8's open question was already answered.** A1 (2026-09-07, §5b) settles it: the picker
  STAYS, made small, beside the actor column; the caveat does not move. Not re-derived here. The
  positive obligation it creates — the reference draws NO actor column — is guard item 27, built
  and discharged in this phase (15.6).
- **The three dialogs are in the OUTER document, not a shadow root.** Checked in Chromium at each
  `data-start`: `#template-dialog`, `#import-dialog` and `#audit-dialog` all answer
  `getRootNode() === document`, and the page holds ZERO shadow hosts at those starts — the
  Station-setup prototype only attaches its root when its own dialog opens. So the console's one
  stylesheet (1067 rules) is what paints them, in the console's palette, unlike Phase 7's case.
- **The reference's picker is SELECT-THEN-LOAD; the product's is ONE PRESS.** The reference's row
  is `aria-pressed`, a detail aside describes the selection, and a footer `Load into Layer 5`
  commits. The product's row control IS the load (`Load <name> onto this layer`), and that contract
  is what `app.loadTemplate` drives through twenty specs. ARGUED, not adopted (15.3): every reason
  the aside would show is already said on the row, and re-pointing the contract is the owner's
  call — filed as a question in 15.8, not made in passing.
- **The reference's import footer sentence is FALSE of this product.** _"Importing does not load a
  row or take it on air."_ — here the picker's import is the row's own LOAD, and the package is
  bound to the row (list-only, off air) in the same gesture. NOT adopted. The picker's own footer
  sentence — _"Loading prepares the row. Use Play when you're ready to go on air."_ — is TRUE
  (`fixedSlotLoad.ts`: a fixed-row LOAD sends no `CG ADD`; PLAY is the first wire contact), so it
  is adopted verbatim.
- **The reference's audit table names no channel or layer as a coordinate in the row's words** —
  its small line carries `CH 1 · <template>`. Golden rule 11 ⭐ says a row named IN A LOG ENTRY
  keeps its real layer number; the product's row did NOT (`OperatorNames` with `layer: null`).
  FIXED beyond the reference: `on 1-98` on the item cell, from `entry.slot`.
- **Phase 1's guard text cited `AuditPanel.tsx:278-298` / `:331` / `:473`.** Those lines moved
  with the rewrite; the guard cites data attributes now (`[data-audit-console]`,
  `[data-audit-actor-head]`, `[data-audit-actor]`), which a rewrite cannot silently re-number.
- **What did NOT contradict:** §0's item 2 (no actor column, no caveat — confirmed at the
  markup: `Time · UTC | Action | Item | Result`); §1.4's map for all three dialogs (the
  components and channels are exactly as listed); A12 (no second air claim — the audit row's
  outcome tag says `ok`/`failed`/`timeout` about a COMMAND, never about air, and the reference's
  `Succeeded/Blocked/Failed` words were not adopted because the record's words are the schema's).

### 15.2 What was built, and where each fact is read from

| piece                       | where                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the picker's look           | `fixedLayers/useTemplatePicker.tsx` — a `wide` modal with the reference's subtitle; a search (`Search templates`, by the display name and type); three kind chips (`All templates · Graphics · Graphics beds`, `aria-pressed`, `requiredBankFor` = the bridge's predicate); rows as `.cg-tpl-row`; the footer sentence; `02`'s drop zone                                                                      |
| a picker row                | the LOAD is one press on the whole left (`Load <name> onto this layer`, id on `title`): a 56 × 49 thumbnail (`LayoutTemplate` / `Rows3` for a bed), the name in a `<bdi>`, a meta line from the CARRIER (`type · N fields · N looks · N plates`) with the reason chips (`Requires a bed row`, `Re-import required`, `Needs a source: …`); `Delete from station` at the right; the wrong-bank sentence beneath |
| the drop                    | `onDragOver`/`onDrop` on `[data-template-body]` → `settle({ importFile })`; `LayerRow.load` runs `importAndLoadOntoFixedSlot(coord, () => Promise.resolve(file))` — the SAME function the OS chooser feeds, the picker checking nothing                                                                                                                                                                       |
| the audit log's look        | `audit/AuditPanel.tsx` — a `ledger` modal (`--r-modal-w-ledger`) with the reference's subtitle; tools: search, `Action` (first select, `All actions` + the schema's fifteen), `Result` (`All results` + the schema's three, applied client-side), `Actor` filter (server-side, unchanged), `Refresh`; the console strip; the table; the footer count with `Reset filters`                                     |
| the ACTOR column (guard 27) | `[data-audit-actor-head]` `Actor`, second; `[data-audit-actor]` per row, `<bdi>`; the strip `[data-audit-console]` = `#audit-operator` (132 px, `MAX_ACTOR_LENGTH`) + `[data-audit-caveat]` (the `B-143` sentence, unchanged), rendered before the table                                                                                                                                                      |
| an audit row                | `Time` (local, UTC on `title`) · actor · action · item cell (names in isolates, **`on c-l`** from `entry.slot`, ids shortened + copyable, the refused line) · outcome as a `.cg-tag` (`ok` mint / `failed` the 2A error text / `timeout` caution) with the error code beneath it                                                                                                                              |
| the search's subject        | what the row SHOWS — `placeName`, `templateName`, actor, action, outcome, ids, code, command — so a hit is always visible                                                                                                                                                                                                                                                                                     |
| the panic label (A16)       | `layers/LiveSourcesPanel.tsx` — `SILENCE ALL BOXES · EVERY CHANNEL`; `aria-label` `Silence all boxes on every channel — …`; the tooltip names every channel this bridge drives and not only the selected one. `stack.silenceAllLivePlates` untouched by diff                                                                                                                                                  |
| the primitives              | `Modal.tsx` — `size="ledger"` (a width, not a frame); `controls.css` — `.cg-tag*`, `.cg-tpl-*`, `.cg-audit-*`; no colour literal, no scale value re-spelled (`tokenHome.test.ts` 8 / 8)                                                                                                                                                                                                                       |
| the tokens                  | `LIBRARY_PX` → `--r-tpl-*` (38), `AUDIT_LOG_PX` → `--r-audit-*` (36), `--r-modal-w-ledger`, `--r-ok-line` (the reference's `.badge.success` edge — the one edge with no home)                                                                                                                                                                                                                                 |
| proofs                      | `auditPanel.actorColumn.dom.test.ts` (5), `auditPanel.filters.dom.test.ts` (5), `templatePicker.library.dom.test.ts` (6), `liveSourcesPanel.dom.test.ts` (+1 A16), e2e `library-audit-geometry.spec.ts` (2, Chromium)                                                                                                                                                                                         |

### 15.3 🔴 THE MEASURED PROPERTY TABLES — rendered reference vs app, every delta FIXED or ARGUED

The reference column is Chromium at 1280 × 800 on each file opened as a file, its own
`data-start` opening the dialog, a scratch script reading `getComputedStyle` and
`getBoundingClientRect` on the real elements (the import's later steps driven through the
prototype's own `Use sample` and `Import sample` controls). The app column is the token the surface
reads, asserted against the page by `library-audit-geometry.spec.ts` (Chromium, 1280 × 800) —
never jsdom. "Palette" means the same ROLE, whose value Phase 2 moved.

**The template picker (`01`)**

| property         | reference (rendered)                                                                                                                                       | app (after this phase)                                                                                                      | verdict                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frame            | 1118 wide (`min(1120px, 100vw − 56px)`), `776px 342px` — a main column and a detail aside                                                                  | the primitive's `wide`, 720                                                                                                 | ARGUED: without the aside the reference's main column is 776; `wide` is the primitive's width for a list read down (720), the same family every dialog uses                                             |
| head             | 98 px, `22px 26px`, a 42 px emblem, title 22 px / 650, subtitle 13 px muted                                                                                | the primitive's head; **the subtitle** (`[data-modal-subtitle]`, 13 px muted)                                               | **FIXED** (subtitle, built on Phase 7's prop); ARGUED: the emblem and the title rank are the primitive's one treatment (as Phase 7 argued)                                                              |
| subtitle words   | `Choose a template from this station's library.`                                                                                                           | `Choose a template already on this station, or import a .vcg package.`                                                      | ARGUED: "library" names a panel `R-028` deleted, and `templatePicker.dom` pins its absence                                                                                                              |
| `Into` select    | a 145 × 35 destination select in the head                                                                                                                  | not built — the title names the row (`Load onto Bed 1`)                                                                     | ARGUED: the picker's door is the row, so the destination is fixed; a select here would be a second door with its own refusals                                                                           |
| search           | 646 × 40 (`min-height 39`), `9px 11px 9px 35px`, radius 7, 14 px, a 16 px glyph at 12                                                                      | **39 floor, `9px 11px 9px 35px`, radius 7, 14 px, 16 px glyph at 12** (`--r-tpl-search-*`)                                  | **FIXED** (built)                                                                                                                                                                                       |
| `Manage`         | a 70 × 33 quiet button opening a management list                                                                                                           | not built                                                                                                                   | ARGUED: `Delete from station` on every row IS the management, and `R-005`'s list is this one                                                                                                            |
| kind chips       | three, 32 tall, `6px 10px`, radius 6, 12 px, gap 6; `padding-bottom 17` + a rule                                                                           | **three, 32, `6px 10px`, radius 6, 12 px, gap 6, 17 below + rule** (`neutral` + `active`, `aria-pressed`)                   | **FIXED** (built); ARGUED: the pressed fill is the console's `.is-on`, the reference's is its palette                                                                                                   |
| list             | `padding 12`, rows 5 apart                                                                                                                                 | **12 above, 5 between**                                                                                                     | **FIXED**                                                                                                                                                                                               |
| row              | 81 px, `15px 13px`, gap 14, radius 9, `56px minmax(0,1fr) 24px`; selected `#203649` + `#547d9a`; incompatible ink secondary                                | **`15px 13px`, gap 14, radius 9**, `minmax(0,1fr) auto`; hover `--r-table-row-hover`; incompatible ink `--r-text-secondary` | **FIXED** (padding, gap, radius, the dimmed ink); ARGUED: no selected state (one press loads); the third column is `Delete from station`, not a check circle                                            |
| thumbnail        | 56 × 49, radius 7, raised ground, a glyph per kind                                                                                                         | **56 × 49, radius 7**, `--r-surface-raised`, `LayoutTemplate` / `Rows3`                                                     | **FIXED** (built)                                                                                                                                                                                       |
| name             | 15 px / 550 in a `<bdi>`                                                                                                                                   | **15 px** / 500 in a `<bdi>`                                                                                                | **FIXED**; ARGUED: 550 → 500 (the weight scale)                                                                                                                                                         |
| meta             | 12 px muted, gap 8: `Logo · 1 look`                                                                                                                        | **12 px muted, gap 8**: `lower-third · 3 fields · 2 looks · 1 plate` from the carrier                                       | **FIXED** (rank, gap); ARGUED: the words are the schema's (`templateType`, `fields`, `looks`, `sources`), never the prototype's `t.category` / `t.looks`                                                |
| warn badge       | 11 px / 500, `2px 6px`, radius 5, amber: `Requires a bed row`                                                                                              | **11 px / 500, `2px 6px`, radius 5**, `--r-caution-*`: `Requires a bed row` / `Requires an operator row`                    | **FIXED** (built); the app's own sentence with the remedy stays beneath it (`[data-wrong-bank]`) — a chip cannot carry "load it onto one of the bed rows at the bottom"                                 |
| carrier / plates | not drawn                                                                                                                                                  | `Re-import required` and `Needs a source: …` as the same warn chip, their `title`s kept                                     | kept (the deletion guard's "capability the panels do not draw"); dressed as the reference's chip                                                                                                        |
| detail aside     | 342 px: destination card, `SELECTED TEMPLATE` eyebrow, a preview, `h2`, a hint, a `Type · Looks · Text fields · Availability` list, a compatibility notice | not built                                                                                                                   | ARGUED: it exists to describe a SELECTION the product's one-press row does not have; its facts are on the row (meta, chips, the sentence) or are the prototype's (`description`, `Availability · demo`) |
| empty            | `40px 20px` centred muted, `h3` + `p`; `No templates found`                                                                                                | **`40px 20px` centred**, `h3` + `p`: `Nothing to load yet` / the pinned sentence; a search's `No templates found`           | **FIXED** (shape, the search words); ARGUED: the pinned sentence names the control, not a panel                                                                                                         |
| footer           | 72 px, `16px 26px`; `.foot-info` 13 px muted; `Import .vcg` quiet 39 px + `Load into Layer 5` primary                                                      | the primitive's footer; **the sentence, 13 px muted**; `Cancel` + `Import a .vcg…` primary                                  | **FIXED** (the sentence, its rank); ARGUED: the primitive's bar and buttons; `Import a .vcg…` stays primary because with the row's press being the load it is the one primary left (§6's own reason)    |

**The import surface (`02`)**

| property            | reference (rendered)                                                                                                                      | app (after this phase)                                                                                                                                  | verdict                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a dialog of its own | 748 wide (`min(750px, 100vw − 48px)`), three steps `Choose package · Review · Complete`                                                   | none — the OS chooser opens from the picker's `Import a .vcg…`, exactly as before                                                                       | ARGUED: `import-vcg-template.spec.ts` and the fixture drive `Import a .vcg…` → `filechooser`; a dialog between them re-points the driver of every importing spec, and its steps are the prototype's |
| drop zone           | `32px 20px`, dashed 1 px, radius 11, sunken ground; a 51 px glyph box radius 13; `h2` 18 px / 600; `p` 13 px muted; `Choose file` primary | **`32px 20px`, dashed, radius 11, `--r-surface-sunken`; 51 box radius 13; 18 px / 600; 13 px muted** at the foot of the picker's list; lit on drag-over | **FIXED** (built — the one honest interaction `02` has); ARGUED: no `Choose file` inside it — `Import a .vcg…` is that button, one control                                                          |
| `Review` step       | a `selected-file` card, a `Simulated checks` list, `Import blocked` / `Import sample`, _"These are example outcomes…"_                    | not built                                                                                                                                               | ARGUED: theatre by its own disclaimer; the product's checks are `verify → unpack → B-196 → render`, and their verdict is the toast the operator already gets (15.0)                                 |
| `Complete` step     | a mint check, `Added to the demo library`, `Nothing has been loaded or taken on air.`, `Choose a destination row`                         | not built                                                                                                                                               | ARGUED: FALSE here — the package IS bound to the row that opened the picker (list-only); the success toast says `Imported “X”.` and the row reads READY                                             |
| footer sentence     | `Importing does not load a row or take it on air.`                                                                                        | not adopted                                                                                                                                             | ARGUED: false of this product (above); the picker's own sentence is the true one                                                                                                                    |

**The audit log (`03`)**

| property      | reference (rendered)                                                                                                                            | app (after this phase)                                                                                                                                                   | verdict                                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frame         | 1222 wide (`min(1250px, 100vw − 56px)`), `height min(815px, 100dvh − 56px)`                                                                     | **`min(1250px, 100vw − 56px)`** (`--r-modal-w-ledger`, 1224 at 1280), intrinsic height, the table scrolls                                                                | **FIXED** (width, built as the primitive's fourth size); ARGUED: the declared height is `fixed`'s criterion (content SWITCHED), and this content scrolls                                           |
| head          | 98 px, an emblem, title 22 px / 650, subtitle 13 px muted; a `Sample records · UTC` badge                                                       | the primitive's head; **the subtitle** `Station actions and their recorded outcomes.`                                                                                    | **FIXED** (subtitle, the reference's own words); ARGUED: the badge is sample data, and `B-210` reads the control-room clock, not UTC                                                               |
| tools         | `18px 25px`, gap 12: search 627 × 40; fields 132 wide with a 12 px / 500 label 5 above a 39 px select (`9px 11px`, radius 7, 13 px); Refresh 39 | **gap 12; search 39 floor, `9px 11px 9px 35px`, radius 7, 14 px; fields 132 wide, label 12 px / 500, 5 above, select 39, `9px 11px`, radius 7, 13 px; Refresh 39**       | **FIXED** (built); the primitive's body padding stands in for `18px 25px`                                                                                                                          |
| filters       | search · `Action` · `Result` · `Date` · Refresh                                                                                                 | search · `Action` · `Result` · **`Actor`** · Refresh                                                                                                                     | **FIXED** (search and `Result` built, client-side over the 200-row tail); ARGUED: no `Date` — the band already prints it and the tail is one screen; the `Actor` filter is the app's own and stays |
| filter words  | `All actions` / `Take · Stop · …`; `All results` / `Succeeded · Blocked · Failed`                                                               | `All actions` / the schema's fifteen; `All results` / `ok · failed · timeout`                                                                                            | **FIXED** (the `All …` heads); ARGUED: the options are derived from the schema (`B-141`), never a hand-kept list                                                                                   |
| console strip | none                                                                                                                                            | `This console` · a 132 × 39 field · the `B-143` caveat at 12 px, one strip above the table                                                                               | **ADDED BACK** (guard item 27, A1); the field was 140 wide in a `0.85rem` row with a `0.75rem` caveat — now the select's box, "small"                                                              |
| table head    | `th` 43 px, `12px 16px`, 12 px / 500 muted on `#1d2b3b`, rule `#40546b`; `Time · UTC                                                            | Action                                                                                                                                                                   | Item                                                                                                                                                                                               | Result` | **`12px 16px`, 12 px / 500 muted** on `--r-table-head-bg`, rule `--r-border-strong`; **`Time · Actor · Action · Item / detail · Outcome`**, sticky | **FIXED** (padding, rank, rule); **ADDED**: `Actor`; ARGUED: `Time` not `Time · UTC` (`B-210`); the app's column words stay; sticky because 200 rows scroll |
| columns       | 125 · 100 · 762 · 206                                                                                                                           | **125** · 130 · 100 · `1fr` · 200                                                                                                                                        | **FIXED** (time, action); the actor column is the app's (130 for `MAX_ACTOR_LENGTH`)                                                                                                               |
| row / cells   | 98 px (three lines), `td` `15px 16px` 13 px, secondary ink, item cell full ink; hover `#1b2b3d`; selected `#1e3549`                             | **`15px 16px` 13 px**, secondary ink, the item cell full ink; hover `--r-table-row-hover`                                                                                | **FIXED** (padding, rank, inks, hover); ARGUED: no selected row (no aside)                                                                                                                         |
| time cell     | `12:34:03` + `small` date 11 px muted under it                                                                                                  | local `HH:MM:SS`, UTC on `title`; the date as a BAND once per day                                                                                                        | ARGUED: `B-210`'s band, pinned by two suites; the per-row date is redundant under it                                                                                                               |
| item cell     | `strong` 13 px / 550 (`Layer 3`) · `small` 12 px muted (`CH 1 · <template>`) · `View event` 12 px link                                          | **`strong`** the names in isolates · **`small` 12 px** `on 1-98` · ids shortened + copy · the refused line                                                               | **FIXED** (ranks, the coordinate line — golden rule 11); ARGUED: no `View event` — `B-211` put the ids and the line ON the row                                                                     |
| result cell   | a `.badge` 12 px / 500 `4px 8px` radius 5 (`Succeeded` mint / `Blocked` amber / `Failed` red) + `small` reason 11 px muted                      | **`.cg-tag` 12 px / 500 `4px 8px` radius 5** (`ok` `--r-ok-*` / `timeout` `--r-caution-*` / `failed` `--r-error-text` on `--r-danger-bg`) + the error code 11 px beneath | **FIXED** (built); ARGUED: the words are the record's (`AuditEntrySchema.outcome`), and `failed` takes the 2A alarm word's ink, not the reference's pastel                                         |
| detail aside  | 325 px `Event details` with `Time · Channel · Action` and `Event ID · Item ID · Template ID` + `Copy event details`                             | not built                                                                                                                                                                | ARGUED: every one of those is on the row already (`B-211`), the copy per id included                                                                                                               |
| footer        | 72 px `16px 26px`: `12 of 12 events` 12 px muted · `Follow new events` · `Reset filters` 13 px link · `Close` 39 quiet                          | the primitive's footer: **`N of M events` 12 px muted · `Reset filters` 13 px (while narrowing)** · `Close`                                                              | **FIXED** (count, reset); ARGUED: `Follow new events` — no live tail by design (`Refresh` is the door); `Close` is the cancel role                                                                 |
| empty         | `55px 20px` centred `No events match these filters` + `Reset filters`                                                                           | `B-141`'s four sentences, unchanged; `Reset filters` in the footer                                                                                                       | ARGUED: the four empty states are a guard the reference cannot draw; a filter that empties the list still says "match this filter"                                                                 |

**What the owner will see change on screen:** LOAD opens a wider picker with a search box and
three kind chips over a list of rows, each a thumbnail, a name and a small meta line with amber
chips where a reason applies, `Delete from station` at the right, a dashed "Drop a .vcg package
here" zone under the list, and the sentence _Loading prepares the row. Use Play when you're ready
to go on air._ beside `Cancel` and `Import a .vcg…`. The audit log fills the screen: a search,
`Action` / `Result` / `Actor` selects and `Refresh` on one line; under them a small `This console`
field with the caveat beside it; then a five-column table — `Time · Actor · Action · Item / detail
· Outcome` — whose rows carry the row's name in bold, `on 1-9` under it, the ids with copy buttons,
and a coloured `ok` / `failed` tag at the right; `N of M events` sits in the footer. On LIVE
SOURCES the panic button reads `SILENCE ALL BOXES · EVERY CHANNEL`.

### 15.4 The waves, counted — and the shadow-root check

Counted in Chromium from the page's CSSOM, as the earlier phases did. **One stylesheet, 1067
rules; no shadow root at any of the three starts** (`shadowRootsOnPage: []`; each dialog's
`getRootNode()` is the document). `.btn` **16** (0 under `@media`), `.modal-head` **10** (7),
`.template-detail` **9** (6), `.badge` 7, `.template-row` 6 (2), `.modal-foot` 6 (4),
`.template-filter` 5 (2), `.icon-btn` 5, `.empty` 4, `.template-layout` 4 (3), `.search` 3,
`.modal` 3 (1); `.import-step` **9** (2), `.review-row` 7, `.drop-zone` 6 (2), `.notice` 5,
`.import-success` 4, `.import-steps` 2 (1), `.import-modal` 2 (1); `.audit-tools` **12** (7),
`.audit-table` **10** (0), `.audit-surface` 5 (3), `.audit-detail` 5 (1), `.audit-time` 2,
`.audit-item` 2, `.audit-result` 2, `.field` 2, `.audit-modal` 1. Only the unconditional waves
paint at 1280 × 800; the `@media` ones are the ≤ 1000 / ≤ 720 / ≤ 390 px re-statements. Precedent:
`.inspector` 33, `.plate-table` 20, `.settings` 17.

### 15.5 🔴 The red-first proofs

| proof                                           | file                                                    | RED against                                                                                                                                                                                                 | GREEN          |
| ----------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| guard item 27 — the actor column                | `apps/runtime/tests/auditPanel.actorColumn.dom.test.ts` | a PLANT removing the header cell and the row cell (the reference's table, with no WHO): the three column cases red; the two strip cases and the caveat's three older suites GREEN — the hole the item named | 5 / 5          |
| the search reads the list                       | `apps/runtime/tests/templatePicker.library.dom.test.ts` | a PLANT making the query match everything: the search case red, the other five green                                                                                                                        | 6 / 6          |
| A16 — the panic label names its scope           | `apps/runtime/tests/liveSourcesPanel.dom.test.ts`       | the label reverted to the bare verb: the A16 case red, the one-press-one-call case green                                                                                                                    | 68 / 68        |
| the dropped file meets the chain's own `verify` | `templatePicker.library.dom.test.ts` (last case)        | not a plant — the proof is the SENTENCE `verify` produces (`“garbage.vcg” failed verification…`) reaching the row's error channel; a picker checking the bytes itself could not print it                    | green          |
| the geometry                                    | `apps/runtime/tests/e2e/library-audit-geometry.spec.ts` | written to the tokens; its positive controls (the picker wider than the old `prose` 460, the log wider than the old `wide` 720) fail against the previous frames                                            | Chromium, 15.9 |

No plant is in the tree.

### 15.6 The deletion guard — item 27 discharged, and the rest green

**Item 27 (A1)** discharged, as recorded in §3: the column, the strip and the field, five dom cases
plus the Chromium measurement; the caveat's three pinning tests — `auditPanel.legibility.dom`
(_"does NOT change the console caveat"_), e2e `audit-legibility.spec.ts:50`,
`stationSetupScope.dom.test.ts` (_"still in the Audit panel, beside its caveat — and nowhere in
Station setup"_) — unchanged and green. No other guarded surface was touched: the phase edits the
picker, the audit panel, the plates toolbar's one label, `LayerRow.load`'s one branch, the modal's
size table, the token home and the stylesheet. The whole runtime suite: **142 files, 1318 tests,
green** after the change.

### 15.7 What Phase 8 did NOT do — and the numbers filed

- It did not build the reference's select-then-load picker, its detail aside, its `Into` select or
  its `Manage` view; its import wizard's steps, review, completion or footer sentence; the audit's
  `Time · UTC` per-row date, `Date` filter, `View event` aside, `Follow new events`, or its result
  words — each argued in 15.3.
- It did not re-point any existing test: every import, picker, removal, audit and Station-setup
  suite is byte for byte what it was, except `liveSourcesPanel.dom.test.ts`'s finder for the panic
  button (which now matches the verb and pins the scope — the one label the phase changed on
  purpose, A16). Swept with `git grep`: the old label survives only as a quoted title in
  `tools/caspar-bridge/tests/live-plate-panic.integration.test.ts`'s comment and in this
  programme's own history; the e2e regex `/^Silence all boxes/` still matches.
- It did not touch `importVcgFile.ts`, `templateDelivery.ts`, `fixedSlotLoad.ts`,
  `packages/vcg-format`, the bridge, `silenceAllLivePlates`, the bank fencing, the refusal and
  preflight paths, `reconcileOnReconnect` or the `LockPolicy` table (§11's hard stops).
- It did not add a persisted key, file or schema: `persistedKeyCensus.test.ts` unchanged and green;
  the picker's search and kind, the audit's search and result filter, and the drag state are
  component state that resets when the dialog opens.
- It did not translate anything; three surfaces gained the reference's OWN words (the picker's and
  the audit's subtitles, `Loading prepares the row…`, `No templates found`, `All actions` / `All
results`, `Reset filters`, `N of M events`) and the audit's head words moved to sentence case
  (`Time · Actor · Action · Item / detail · Outcome`) — swept with `git grep`, no test or spec
  quoted the lower-case heads.
- It did not measure any geometry in jsdom: every box is in `library-audit-geometry.spec.ts`.
- 🔴 **Filed for the owner, not decided:** whether the picker should become the reference's
  SELECT-THEN-`Load into` flow. It is a CONTRACT change to the one-press row (the fixture's
  `loadTemplate`, twenty specs) and the detail aside comes with it; this phase kept the contract
  and argued the look. If the owner wants the reference's flow it is a decision for the record,
  not a phase's re-dress.
- Numbers taken: **A16** recorded on `R-062` (`docs/prd/runtime.md`). Numbers closed: guard item
  **27**.

### 15.8 The runs

- `pnpm --filter @cg/runtime test:e2e`, Windows, against a fresh build: the first run **141
  passed, 2 failed** — both the new geometry spec, both the kind a real engine finds and jsdom
  cannot: the search box painted **41** and the selects **42** under the console's inherited
  1.55 line-height where the reference paints 40 and 39 (Phase 7's rail-tab lesson, one dialog
  over). Declared as HEIGHTS with the reference's line-height (`LIBRARY_PX.searchH` = 40 as
  painted, the selects 39); re-run **143 passed (1.9 m)** against the gate's build. ⚠
  NON-AUTHORITATIVE (golden rule 12a).
- `pnpm gate`: `93 successful, 93 total · 0 cached, 93 total`, foreground; ran again, uncached
  and green, as the pre-push gate.
- The Linux `e2e` on the code head `5f4793b4`:
  <https://github.com/yasermostafaee/cg/actions/runs/34235812109> — `conclusion: success`,
  11 m 39 s; the `E2E (Playwright)` job RAN 11 m 14 s (14:03:37Z → 14:14:51Z), its `E2E` step
  14:04:57Z → 14:14:39Z. Recorded beside `tasks.md` 8.4, as every phase before it.

## 16 — Phase 9: the surfaces the reference does not draw

The record of `RUNTIME-REDESIGN-01` Phase 9 (2026-09-08): what contradicted the prompt (§16.0),
the plant pass that redefined the phase and its result per guard item (§16.1), what was built
(§16.2), the measured comparison for the three surfaces that borrow geometry the reference does
draw (§16.3), the caution split (§16.4), the lock (§16.5), the red-first proofs (§16.6), what the
phase did NOT do (§16.7) and the runs (§16.8).

### 16.0 What contradicted the prompt

- **`PROMPT.md` §9 asks for _"one test per guarded surface"_; the guard's own history says a test
  is not a guard.** Phase 8's item 27 went red under a plant that removed the actor column WHILE
  the three caveat tests stayed green — the column could be deleted and nothing failed. So this
  phase did not write four tests and stop. It planted the removal of EVERY item in §3 — the render
  deleted, or its raising condition made unreachable — ran the whole runtime unit suite against
  each plant, and recorded what reddened. The honest measure of Phase 1's guard is the count in
  §16.1, not the number of ✅ marks in §3. **And the phase met the lesson itself:** the first
  `tooltip.dom.test.ts` mounted the component and passed, and the plant that unmounts it from
  `App` STAYED GREEN under it — a suite that mounts the thing cannot notice the app no longer
  does. The App-level case is what reddens.
- **The reference draws a lock, and draws it on its dialog primitive** (§0 recorded this in Phase
  1). Measured this phase: the prototype's `#unlock-dialog` is a `<dialog>` inside the
  Station-setup shadow root, in THAT root's palette (`--surface:#15191f`, a teal `--accent:#8ce6d1`
  the console does not have) — and the prototype's own lock refuses its `cancel` event
  (`stillOpen: true` after a dispatched `cancel`), so even the drawing does not offer Escape as a
  way out. §9 is right and §1.3's enumeration was loose: the LOOK was taken, the primitive was not
  (§16.5).
- **`PROMPT.md` §9's "dressed in the new tokens" was already true for most of the twenty-eight
  items before this phase touched them.** Phase 2 moved the palette under every surface, and the
  strips inside the layers panel (items 10–14), the status bar (17), the shell chrome (19–21), the
  suppression (23) and the Inspector-side capabilities (24–26) read tokens and nothing else
  (`tokenHome.test.ts`, green throughout). What this phase re-dressed is the set the reference
  gives a SHAPE to — the notice pairs, the toast, the lock — and the one band that was still
  carrying a token doing two jobs (§16.4).
- **`B-172` said "get the constraints from the owner before designing"; the owner's prompt for this
  phase said the failover banner _"should stop being B-172's hard-coded slab"_.** That is the
  instruction. The slab and the one-colour rule are gone (§16.2); the owner's other cited
  constraint, one banner at a time, is NOT built and stays recorded on `B-172` as the owner's.

### 16.1 🔴 The plant pass — every guard item, its plant, and whether a test reddened

Method: for each item, one edit that deletes the render or makes its raising condition
unreachable (the substitution is in the table); the whole runtime unit suite (`vitest run`, 142
files, 1318 tests, ~45 s) run to a JSON report; the failing tests recorded; the original bytes
written back and verified. Twenty-eight items, thirty-three unit plants (items 14, 16 and 17 were
planted per sub-surface) plus two Playwright plants for the two items that are e2e-only by design
(a fresh `vite build` and only that item's specs, against the built app). Item 28 is a DELIBERATE
removal (A15) and has nothing to plant. ⚠ Item 8's first run overlapped a token-home edit in the
working tree and reported seven unrelated suite failures; it was re-run clean and the table
carries the re-run.

| item | surface                                 | the plant (one substitution, reverted)                | before this phase's tests                  | what reddened (file, cases)                                                                                  | with this phase's tests                                                                   |
| ---- | --------------------------------------- | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1    | emptied-air notice + PUT BACK ON AIR    | `if (notice === null) return null` → always null      | **REDDENED**                               | `emptiedAirNotice.dom` (15)                                                                                  | —                                                                                         |
| 2    | orphan-layers WARNING strip             | `htmlOrphans` filtered to `[]`                        | **REDDENED**                               | `orphanLayersBanner.dom` (9)                                                                                 | —                                                                                         |
| 3    | orphan-layers NEUTRAL strip             | `foreignLayers` filtered to `[]`                      | **REDDENED**                               | `orphanLayersBanner.dom` (3, the R-015 cases)                                                                | —                                                                                         |
| 4    | owned-slot occupancy warning            | `ownedOccupancy.length > 0` → `< 0`                   | **REDDENED**                               | `orphanLayersBanner.dom` (2), `operatorNaming.strips.dom` (3)                                                | —                                                                                         |
| 5    | bridge-skew banner                      | `missing.length === 0` → `>= 0` (always null)         | 🔴 **STAYED GREEN** (0 of 1318)            | nothing — the ledger's 🔴 was right                                                                          | **REDDENED**: `bridgeSkewBanner.dom` (4 of 5; the silence case green by design)           |
| 6    | output alarm                            | `losing.length === 0` → `>= 0`                        | **REDDENED**                               | `outputMissingBanner.dom` (8)                                                                                | —                                                                                         |
| 7    | raster-mismatch banner                  | `mismatched.length === 0` → `>= 0`                    | 🔴 **STAYED GREEN** (0 of 1318)            | nothing — the ledger's 🔴 was right                                                                          | **REDDENED**: `rasterMismatchBanner.dom` (3 of 7; the four silence cases green by design) |
| 8    | connection banner (DISCONNECTED / TEST) | `if (link === 'live') return null` → always null      | **REDDENED** (re-run)                      | `bannerCompact.dom` (4), `testModeHonesty.dom` (2)                                                           | —                                                                                         |
| 9    | failover banner                         | `if (!showRecent && !primaryUnhealthy)` → always null | 🔴 **STAYED GREEN** (0 of 1318)            | nothing — the ledger's 🔴 was right                                                                          | **REDDENED**: `failoverBanner.dom` (6 of 9; the three silence cases green by design)      |
| 10   | restore-skips strip                     | `showSkips &&` → `showSkips && false &&`              | **REDDENED**                               | `layersPanel.restoreSkips.dom` (3), `operatorNaming.strips.dom` (3), `layersPanel.restoreMigrations.dom` (1) | —                                                                                         |
| 11   | restore-migrations strip                | `showMigrations &&` → `&& false &&`                   | **REDDENED**                               | `layersPanel.restoreMigrations.dom` (5)                                                                      | —                                                                                         |
| 12   | awaiting-rows strip                     | `awaitingRows > 0` → `< 0`                            | **REDDENED**                               | `layersPanel.awaitingNotice.dom` (3)                                                                         | —                                                                                         |
| 13   | "Loading the layer list…"               | `!listReady ?` → `!listReady && false ?`              | **REDDENED**                               | `layersPanel.loading.dom` (2)                                                                                | —                                                                                         |
| 14a  | "No candidate layers" empty state       | `bank === null ?` → `&& false ?`                      | **REDDENED**                               | `layersPanel.loading.dom` (1)                                                                                | —                                                                                         |
| 14b  | `What the bridge needs` deep link       | `openStationSetup('candidate-layers')` → `undefined`  | **REDDENED**                               | `stationSetupDeepLink.dom` (1)                                                                               | —                                                                                         |
| 15   | lock overlay                            | `if (!engaged) return null` → always null             | **REDDENED**                               | `lockOverlay.focusTrap.dom` (4), `numericInput.dom` (2)                                                      | + `lockOverlay.contract.dom` (5 of 6)                                                     |
| 16a  | engage-lock: the mismatch refusal       | `if (first !== second)` → `&& false`                  | **REDDENED**, by ONE digit case            | `numericInput.dom` (1)                                                                                       | + `engageLockDialog.dom` (1)                                                              |
| 16b  | engage-lock: the door on the bar        | `setEngaging(true)` → `setEngaging(false)`            | **REDDENED**, by the digit suite ALONE     | `numericInput.dom` (3)                                                                                       | + `engageLockDialog.dom` (1, the door)                                                    |
| 17a  | status bar: OSC-silent word             | the `⚠ NO OSC FROM` word emptied                      | **REDDENED**                               | `statusBar.noOsc.dom` (1)                                                                                    | —                                                                                         |
| 17b  | status bar: stopped channel             | the `NOT PRODUCING · CH` word emptied                 | **REDDENED**                               | `statusBar.deadChannel.dom` (1)                                                                              | —                                                                                         |
| 17c  | status bar: single-server               | `○ NO BACKUP` emptied                                 | **REDDENED**                               | `statusBar.singleServer.dom` (1)                                                                             | —                                                                                         |
| 17d  | status bar: not-connected honesty       | `stale = link === 'disconnected'` → `false`           | **REDDENED**                               | `statusBar.linkTransition.dom` (2) — ⚠ not `statusBar.notConnected.dom`, which stayed green                  | —                                                                                         |
| 17e  | status bar: manual failover control     | the control made permanently `disabled`               | **REDDENED**                               | `statusBar.singleServer.dom` (1)                                                                             | —                                                                                         |
| 18   | command toast                           | `if (feedback === null) return null` → always null    | **REDDENED**                               | `commandToast.dom` (3)                                                                                       | —                                                                                         |
| 19   | the resizable shell (divider)           | `ShellDivider` returns null                           | unit **STAYED GREEN** — e2e-only by design | **e2e REDDENED**: `divider-across-iframe.spec` 3 failed (3 passed across it and `panel-scroll.spec`)         | —                                                                                         |
| 20   | narrow-width Inspector overlay + scrim  | `layout.narrow && inspectorOpen &&` → `&& false &&`   | unit **STAYED GREEN** — e2e-only by design | **e2e REDDENED**: `inspector-open-close.spec` 3 failed of 6                                                  | —                                                                                         |
| 21   | boot splash                             | `window.__CG_SPLASH__` not installed                  | **REDDENED**                               | `splash.dom` (10)                                                                                            | —                                                                                         |
| 22   | the delegated Tooltip                   | `<Tooltip />` unmounted from `App`                    | 🔴 **STAYED GREEN** (0 of 1318)            | nothing — the ledger's 🔴 was right; ⚠ and STILL GREEN under the component-only suite (0 of 1354)            | **REDDENED**: `tooltip.dom` (1 — the App-level MOUNT case)                                |
| 23   | native context-menu suppression         | the `contextmenu` listener never registered           | **REDDENED**                               | `contextMenuSuppression.dom` (1)                                                                             | —                                                                                         |
| 24   | from-file field sources                 | `FromFileControl` returns null                        | **REDDENED**                               | `fromFileGrant.dom` (4)                                                                                      | —                                                                                         |
| 25   | live-source swap dialog                 | `LiveSourceSwapDialog` returns null                   | **REDDENED**                               | `liveSourceSwap.dom` (6)                                                                                     | —                                                                                         |
| 26   | the outputs technical surface           | `OutputsSection` returns null                         | **REDDENED**                               | `outputsSection.dom` (22), `stationSetupChannelKeyed.dom` (2), `stationSetupServers.dom` (1)                 | —                                                                                         |
| 27   | the audit actor column                  | the `Actor` head and the row's `<bdi>` emptied        | **REDDENED**                               | `auditPanel.actorColumn.dom` (3) — the caveat's three older tests green, as Phase 8 found                    | —                                                                                         |
| 28   | the audio dialog's MUTE                 | nothing to plant — a DELIBERATE removal (A15)         | n/a                                        | n/a                                                                                                          | n/a                                                                                       |

**The count.** Twenty-three entries carried a ✅ (twenty-one unit, two Playwright) and **all
twenty-three reddened** under their plants; the four 🔴 entries (5, 7, 9, 22) **stayed green**,
exactly as the ledger said. So Phase 1's guard was worth what it claimed — with two qualifications
the pass surfaced and this phase closed: item 16's ✅ was one digit-normalisation suite reaching
the dialog on its way to `lock.engage` (the door plant reddened nothing else), and item 22's first
NEW suite was itself a test that was not a guard. Nothing in the ledger "only looked guarded";
what the pass measured is that a ✅ written from a grep is right about existence and silent about
depth, which is why every entry now names the file AND the cases that go red.

### 16.2 What was built

- **Four tests that did not exist** — `bridgeSkewBanner.dom.test.ts` (5),
  `rasterMismatchBanner.dom.test.ts` (7, every member of `RasterVerdict`),
  `failoverBanner.dom.test.ts` (9, the three tones by token identity and the suppression with its
  positive control) and `tooltip.dom.test.ts` (5: the delegation contract on the component, and
  the MOUNT on the whole `App`) — each proved to redden by re-planting the same removal (§16.6).
- **Two contracts pinned in their own right** — `lockOverlay.contract.dom.test.ts` (6: not a
  `<dialog>`, no dismiss control, every control is the release path, Escape and the scrim do
  nothing, a wrong PIN leaves it up, only `engaged: false` takes it down) and
  `engageLockDialog.dom.test.ts` (6: two fields and the advisory, the short-PIN and mismatch
  refusals, the match engages once, Cancel, and the status bar's DOOR) — item 16's guard no longer
  rides on the digit-normalisation suite alone.
- **The failover banner as a STRIP whose tone is the situation's** (`B-172` CLOSED): in the banner
  region, `data-tone` notice / caution / alarm from the reference's notice pairs and
  `colors.error`, `status` for a completed manual failover and `alert` for the rest, no Dismiss on
  a broken primary; the `offline-mock` suppression moved from `App.tsx` INTO the component so it
  can be tested; the `--r-alarm-*` family deleted (A9 — read by nothing).
- **The bridge-skew banner in the reference's warn pair** — `--r-caution-text` on `--r-caution-bg`,
  ruled by `--r-notice-line`, with the notice's icon and box — `data-tone="caution"`, still
  `alert`, still amber and never red (asserted by token identity against the three alarm fills).
- **The notice pairs as the reference renders them** — `--r-notice-fill` / `--r-notice-line`
  MOVED to the warn pair (`#352d1e` / `#655334`; 8.99:1 under `--r-caution-text`), the PLAIN pair
  added (`--r-notice-neutral-*`; 10.10:1), and the box (`13px 15px`, radius 8, 13 px / 1.6, an
  18 px icon gapped 10) as `NOTICE_PX` → `--r-notice-*`; read by the emptied-air notice, the three
  orphan / occupancy strips, `Notice` (both roles), the skew banner and the failover strip.
- **The toast at the reference's place and palette** — `TOAST_PX` → `--r-toast-*`: 42 px off the
  foot, `12px 17px`, radius 9, 14 px, the OK pair `#d6f3e3` on `#1d3b30` ruled `#4b7f68`
  (10.34:1); the error toast keeps `colors.error` because the reference draws no error toast.
- **The lock in the reference's LOOK over the app's own chrome** — `LOCK_PX` → `--r-lock-*`; the
  icon box in the console's accent pair (7.50:1), `Console locked`, the reference's copy sentence,
  a mono PIN field tracked `.3em`, `Unlock console` full width in a ruled foot; the scrim, the
  focus trap, the reason and elapsed chips and the refusal line kept (§16.5).
- **The caution split** (§16.4) — `--r-caution-fill` for the CLEAR verb; `--r-caution` /
  `colors.pending` are now INK alone.
- **`PROMPT.md` §11's hard stops respected:** no AMCP, nothing deleted on the owner's machine, the
  bank fencing, the refusal and preflight paths, `reconcileOnReconnect` and `LockPolicy`
  untouched; no persisted key, file or schema (`persistedKeyCensus.test.ts` unchanged); nothing
  translated (the lock's two sentences are the reference's own English, swept with `git grep`);
  no colour literal outside the token home (`tokenHome.test.ts` green); staged by path.

### 16.3 🔴 The measured comparison — rendered reference vs app, every delta FIXED or ARGUED

Measured in Chromium at 1280 × 800 on `04-playout-layers.html` with `data-start` switched
(`PROMPT.md` §0), computed styles read off the element, never a rule quoted. The reference's
`.notice` is a **single wave** — the only single-wave rule this programme has met (the nested
`.small .notice`, `.audit-detail .notice` and `.template-detail .notice` restatements add margins
only); `.global-toast` is restated **three** times and the last (`bottom:42px`) paints; the
`unlock-dialog` lives inside the Station-setup **shadow root** and is drawn in THAT palette
(`:host{--surface:#15191f;--accent:#8ce6d1…}`), which is not the console's.

**The notice (guard items 1–4, 5, 9, `Notice`)**

| property                                  | reference, as rendered                    | app, after Phase 9                                                                    | verdict                                                                                                                        |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| box                                       | `13px 15px`, radius 8, 1 px rule          | `--r-notice-pad` / `--r-notice-radius` (`NOTICE_PX`)                                  | **FIXED** on every strip and on `Notice`                                                                                       |
| type                                      | 13 px / 400 on a 20.8 px line (1.6)       | `--r-notice-fs` / `--r-notice-lh`                                                     | **FIXED**; the strips' second lines keep their smaller size — the hierarchy is by size, as `Notice` records                    |
| icon                                      | 18 px, 2 px down, gapped 10               | `--r-notice-icon` / `--r-notice-gap`; the skew banner and the failover strip draw one | **FIXED** where a strip has an icon; the emptied-air and orphan strips keep their `⚠` glyph (a rule-9 sweep protects its copy) |
| WARN pair                                 | `#f3cd88` on `#352d1e`, ruled `#655334`   | `--r-caution-text` on `--r-notice-fill` (= `--r-caution-bg`), `--r-notice-line`       | **FIXED** (palette): the two amber tokens MOVED to the reference's pair; 8.99:1                                                |
| PLAIN pair                                | `#bed6e5` on `#172736`, ruled `#2b4c62`   | `--r-notice-neutral-text/-bg/-line`, new                                              | **FIXED** (new roles): the video-layer strip, a manual failover, `Notice`'s `notice`; 10.10:1, muted detail 5.55:1             |
| ERROR pair                                | `#ffaaa7` on `#3a242a`, ruled `#68414c`   | NOT taken by the air alarms — `colors.error` with `--r-ink-on-fill` (8.31:1)          | **ARGUED** (A4 / 2A): the reference spends its pastel error card on an import failure; an air alarm keeps the alarm fill       |
| a strip's corners at the top of the shell | the reference draws no top-of-shell strip | the skew banner and the failover strip are full-width bands, radius 0, ruled below    | **ARGUED**: a card's corner belongs inside a panel; a band across the shell has no panel to sit in                             |

**The toast (guard item 18)**

| property | reference, as rendered                                         | app, after Phase 9                                        | verdict                                                                                                      |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| place    | fixed, centred, 42 px off the foot                             | `--r-toast-bottom`                                        | **FIXED** (was 3 rem)                                                                                        |
| box      | `12px 17px`, radius 9, 1 px rule, `0 8px 40px` shadow, 47 tall | `--r-toast-pad` / `--r-toast-radius` / `--r-toast-shadow` | **FIXED**                                                                                                    |
| type     | 14 px / 400 on 21                                              | `--r-toast-fs`; weight stays 700                          | **FIXED** (size); ARGUED (weight): a refusal at 400 reads as a caption                                       |
| OK pair  | `#d6f3e3` on `#1d3b30`, ruled `#4b7f68`, a 17 px mint tick     | `--r-toast-ok-ink/-bg/-line` moved; the tick not drawn    | **FIXED** (palette, 10.34:1); the tick ARGUED — the error toast has no glyph and the two must weigh the same |
| ERROR    | the reference has no error toast (no refusal path)             | `colors.error` with `--r-ink-on-fill`, unchanged          | n/a — the surface the reference does not draw, kept                                                          |

**The lock (guard item 15)**

| property   | reference, as rendered (shadow palette)                                  | app, after Phase 9                                                                   | verdict                                                                                                                               |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| primitive  | a `<dialog>` inside Station setup, `::backdrop` `rgba(3,6,9,.62)` + blur | the app's own scrim (`--r-lock-scrim`) and card, `useFocusTrap`, no `<dialog>`       | **ARGUED** — §9: the primitive is not taken; the reference's own lock refuses its `cancel` event too (measured: `stillOpen: true`)    |
| card       | 480 wide, `32px 24px 23px` body, radius 16, ruled `#3a424e`              | `--r-lock-card-w` / `--r-lock-card-pad`, `--r-radius-lg`, `colors.border`            | **FIXED** (box); the ground is the console's panel, not the shadow palette's                                                          |
| icon box   | 56 × 56, radius 14, accent-dark ground, accent ink, 20 px glyph          | `--r-lock-icon-*`, `--r-accent-fill` under `--r-accent` (7.50:1), `Lock` from lucide | **FIXED** (box); the PAIR is the console's accent — the reference's teal is the shadow root's accent, not a colour this palette has   |
| title      | `Console locked`, 24 px / 650, centred, tracked −.035em                  | the reference's words, `--r-lock-title-fs`, 650, centred                             | **FIXED**; `RUNTIME LOCKED` swept (two e2e specs re-pointed)                                                                          |
| copy       | `Playout continues. Enter your PIN to use the console.`, 14 px muted     | the reference's sentence, `--r-lock-copy-fs`, `colors.textMuted` (6.31:1)            | **FIXED**; true here as there — the bridge refuses console verbs, air is untouched                                                    |
| PIN field  | mono, 16 px, tracked `.3em`, 44 tall, inset ground, accent focus ring    | `--r-font-mono`, `--r-lock-pin-fs`, `.3em`, `--r-lock-pin-h`, `.cg-field`            | **FIXED** (was 1.2 rem tracked `.5em`)                                                                                                |
| submit     | `Unlock console`, full width, 40 tall, primary                           | `Button primary`, full width, `--r-lock-submit-h`                                    | **FIXED**; `UNLOCK` swept                                                                                                             |
| meta chips | none — the reference shows no reason and no elapsed time                 | kept: the reason chip and the `Locked for` clock                                     | **ARGUED** — an auto-idle lock and one an operator set are different facts, and a clock says how long the console has been unattended |
| error line | `unlock-error` under the field                                           | kept under the submit, `--r-error-text`                                              | **FIXED** (palette, 9.53:1)                                                                                                           |

### 16.4 The caution token, split — the one item Phase 2 held

`colors.pending` / `--r-caution` (`#F59E0B`) was ONE token doing two jobs: an INK on a dark
surface (the row's TAKING / UNCONFIRMED word, the status bar's OSC-silent word, the unassigned
plate's dashed outline, the outlined verbs' edges) and a FILL with dark ink on top (the
bridge-skew band, and the CLEAR verb). The reference splits those — `--amber` is only ever
`color:`, `--amberbg` the ground under it — so no single value could serve both, and Phase 2 held
it because un-splitting is a component edit. This is the phase that dressed the band, so:

- the skew band takes the reference's PAIR — `--r-caution-text` on `--r-caution-bg`, ruled by
  `--r-notice-line` — and stops reading `colors.pending` as a ground;
- the CLEAR verb, the one remaining saturated amber fill, reads a role of its own,
  `--r-caution-fill` (`.cg-btn--caution-strong`), the same value today and a different NAME, so the
  verb's fill and the badge's word can be retuned apart;
- `--r-caution` / `colors.pending` are read only as `color:` / `border-color:` (a `git grep` of
  every reader: `rowState.ts`, `LinkIndicator`, `StatusBar`, `LivePlatesSection`,
  `LooksBindingsSection`, `LiveSourceSwapDialog`, `liveLayerRows`, `LivePlateOverlay`,
  `LayersPanel`'s skip strip, `Button`'s `VARIANT_ACCENT`, the `.cg-btn--caution` outline and the
  four `.cg-badge--*` words — every one an ink or a line).

Not re-tuned: the ink's value is untouched (7.20:1 on the raised ground), the verb's fill is
untouched, and `--r-ink-on-caution` still sits on it. The split is a NAME, which is what a split
was always going to be until somebody wants one half to move.

### 16.5 The lock — the reference's look, not its primitive

`PROMPT.md` §9 and the owner's prompt for this phase both name the attempt in advance: the
reference draws its lock on the prototype's dialog primitive, and that is not permission. What was
measured (§16.3) makes the point for them — the drawing's own `<dialog>` refuses its `cancel`
event, so the prototype's lock has no Escape either. What changed is the LOOK: the reference's
icon box, `Console locked`, `Playout continues. Enter your PIN to use the console.`, the mono PIN
field and the full-width `Unlock console`, at the reference's measured geometry (`LOCK_PX`), over
the app's own scrim and card. What did not change is everything `B-229` and `Modal.tsx`'s note
protect: no `<dialog>`, no ✕, no Escape, no backdrop click, the SAME `useFocusTrap` the modal
composes with its exits and the lock composes alone, and the bridge's `LOCK_ENGAGED_REFUSAL`
behind it. The contract is asserted as PROPERTIES in `lockOverlay.contract.dom.test.ts` so the look
can change and the contract cannot; the trap keeps its own suite and its real-engine e2e. The two
old strings (`RUNTIME LOCKED`, `UNLOCK`) were swept with `git grep`: two e2e specs quoted them and
were re-pointed; no doc or spec did.

### 16.6 🔴 The red-first proofs

| proof                                          | file                                            | RED against                                                                                                                     | GREEN |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----- |
| guard item 5 — the skew banner                 | `tests/bridgeSkewBanner.dom.test.ts`            | the render plant (§16.1): 4 of 5 red, the silence case green by design; 1318 green without the file                             | 5 / 5 |
| guard item 7 — the raster banner               | `tests/rasterMismatchBanner.dom.test.ts`        | the render plant: 3 of 7 red, the four silence cases green by design                                                            | 7 / 7 |
| guard item 9 — the failover strip              | `tests/failoverBanner.dom.test.ts`              | the render plant: 6 of 9 red (every tone, the strip, dismissal, the suppression's positive control); the suppression green      | 9 / 9 |
| guard item 22 — the tooltip                    | `tests/tooltip.dom.test.ts`                     | the unmount plant: 0 red under the component-only suite (the file's own lesson), 1 red once the App-level case existed          | 5 / 5 |
| guard item 15 — the lock's contract            | `tests/lockOverlay.contract.dom.test.ts`        | the render plant: 5 of 6 red (the not-engaged case green by design)                                                             | 6 / 6 |
| guard item 16 — the engage dialog and its door | `tests/engageLockDialog.dom.test.ts`            | the mismatch plant: its refusal case red; the door plant: its door case red — each beside the digit suite that used to be alone | 6 / 6 |
| items 19 and 20 — Playwright-only by design    | `divider-across-iframe`, `inspector-open-close` | the two e2e plants against a fresh build: 3 and 3 red                                                                           | green |

No plant is in the tree: every plant was reverted by writing its original bytes back and
re-reading them, and `git status` after the passes lists only this phase's own edits.

### 16.7 What Phase 9 did NOT do — and the numbers filed

- It did not take the reference's pastel ERROR notice for the air alarms (connection, raster,
  output): those keep the saturated `colors.error` fill with light ink (A4 / 2A). The reference
  spends its error card on an import failure, which is not an alarm about air.
- It did not give the top-of-shell strips a card's corners or margins; a band across the shell has
  no panel to sit in. It did not change the layers panel's own strips (10–14) beyond the palette
  Phase 2 already moved under them — they are table chrome, not notices, and their geometry is
  Phase 3's.
- It did not build "one banner at a time": the banner region still stacks its strips with no
  arbitration. Recorded on `B-172` as the owner's call.
- It did not draw the toast's tick or take the reference's 400 weight on it — the error toast has
  no glyph and the two must weigh the same.
- It did not put a reason chip or a clock on the reference's lock because the reference has none;
  it KEPT the console's, because an auto-idle lock and one an operator set are different facts.
- It did not re-point any existing test except the two lock e2e specs that quoted the old title and
  button word (rule 9); `numericInput.dom.test.ts` is byte for byte what it was.
- It did not touch the bridge, the bank fencing, the refusal and preflight paths,
  `reconcileOnReconnect`, `LockPolicy`, any persisted key, file or schema, or any string in Persian.
- It did not measure any geometry in jsdom. The notice, toast and lock boxes are measured in
  Chromium in `tests/e2e/guard-surfaces-geometry.spec.ts` against the token home.
- Numbers closed: **`B-172`**. Numbers taken: none. Filed for the owner: nothing new — the two
  decisions this phase made in the owner's place (the failover tones; the lock's kept chips) are
  argued in §16.3 and §16.5 and are the kind a re-dress may make, but each is one line to reverse.

### 16.8 The runs

- The plant passes: 33 unit plants at ~45 s each (1318 tests before this phase's suites, 1354–1356
  with them), two Playwright plants against a fresh `vite build`, two re-plant passes for the
  suites this phase wrote (§16.1, §16.6). Every plant reverted by its original bytes;
  `git status` after each pass lists only the phase's own edits.
- `pnpm gate`: **`93 successful, 93 total · 0 cached, 93 total`**, foreground, 3 m 26 s; runtime
  148 files / 1356 tests; prettier clean; OpenSpec `78 passed, 0 failed`. Its first run was red on
  ONE lint error in the new e2e spec (an inline `import()` type annotation) — fixed, re-run green.
  ⚠ The Stop hook's gate at the end of the phase's first turn was red on two things that were
  mid-flight, not defects: the plant loop had item 23's plant applied at that moment, and the
  token home was ahead of the two components that read the deleted `--r-alarm-*` family.
- `pnpm --filter @cg/runtime test:e2e`, Windows, against the gate's build: **145 passed (3.8 m)**
  on the third run. The first two lost 1 and then 4 specs to `page.goto` load timeouts — the
  `B-098` class — with two STALE `vite preview` servers from earlier sessions (one from 11:11 that
  morning) still listening on this host beside the owner's two dev servers and the live bridge;
  with the two strays stopped, the four specs re-ran 20 / 20 and the full suite ran clean. ⚠
  NON-AUTHORITATIVE (golden rule 12a).
- The new geometry spec `guard-surfaces-geometry.spec.ts` (2) ran green in Chromium beside the
  lock, orphan and lock-prompt specs (5 / 5, 11 s) and in the full suite.
- The Linux `e2e` on the code head `be883e3c`:
  <https://github.com/yasermostafaee/cg/actions/runs/34251084406> — `conclusion: success`,
  12 m 38 s; the `E2E (Playwright)` job RAN 11 m 56 s (16:26:55Z → 16:38:51Z), its `E2E` step
  16:28:12Z → 16:37:50Z, and `Lint • Typecheck • Test • Build` green in 3 m 51 s. Recorded beside
  `tasks.md` 9.4, as every phase before it.

## §17 — PHASE 10: VERIFICATION, AND THE PROGRAMME'S CLOSING POSITION

### 17.0 What contradicted the prompt

**Three things, all of them factual and none of them fatal.**

1. 🔴 **There is no owner answer A7, A17 or A18.** The Phase 10 brief asks for _"every owner answer
   A1–A18"_. The record holds **sixteen**, numbered **A1–A6 and A8–A16**; `git grep` over the whole
   tree returns nothing for `A7`, `A17` or `A18`, in this change or anywhere else. A7 is a
   numbering gap left when Phase 2's escalations closed at A6 and Phase 3's opened at A8; A17 and
   A18 were never issued. The sixteen that exist are enumerated in §17.6 with where each is
   recorded. **Nothing was invented to fill the range.**
2. ⚠ **`B-242` is DOUBLE-BOOKED, and the brief uses the second meaning.** In
   `docs/prd/b-number-registry.md` (line 2724) `B-242` is _"in use (station-setup tasks.md)"_ —
   `openspec/changes/station-setup/tasks.md` 11.7, a removed delimiter's attached field falling
   back to its raw characters. Independently, four runtime e2e specs cite `B-242` for golden rule
   12c's jsdom-has-no-layout hazard (`inspector-geometry`, `layer-table-geometry`,
   `library-audit-geometry`, `station-setup-geometry`). The brief means the second. Neither entry
   has a `##` heading in `docs/prd/bugs-runtime.md`, which is how two sessions came to take the
   same free number for different things. **Filed for the owner in §17.6; not renumbered here,
   because renumbering a `B-` in flight is exactly what the registry exists to stop.**
3. ⚠ **`CLAUDE.md`'s green-gate section says `test` inputs do not hash `bin/**`. They do.**
`turbo.json`'s `test`task reads`["src/**", "tests/**", "bin/**", "scripts/**", …]`. The
"⚠ STILL OPEN" note is stale — the notch was closed and the sentence was not. Flagged rather
than edited: `CLAUDE.md` is shared config the next session picks up, and a correction there is
   the owner's to take. **A different, LIVE instance of the same class was found and closed in
   this phase — see §17.4.**

### 17.1 The six air-sensitive scenarios, end to end, at the wire

**What was built:** `tools/caspar-bridge/tests/air-sensitive-endtoend.integration.test.ts` — ONE
`it`, ONE bridge, ONE mock, ONE AMCP trace, driven through all six scenarios in the order an
operator performs them, with the state each verb leaves carried into the next.

⚠ **It is not a copy of the six suites that already own these properties.** Each of
`update-does-not-take`, `remove-on-air-refusal`, `stop-verb`, `audio-does-not-take`,
`look-switch-preserves-bindings` and `emptied-air-notice` boots a clean runtime and exercises one
verb. What none of them can show — and what this file exists for — is that the properties survive
COMPOSITION: a row that has been updated, taken, refused a REMOVE, had its looks switched, been
stopped, resumed, cleared, re-taken and then had its air taken away by a server restart.

**Every reading is the mock's AMCP trace, the mock's own layer state, or the bridge's ledger.**
Never a UI, never a status field standing in for a command.

| #   | Scenario                             | What the wire had to show                                                                                                                                                                                                |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | UPDATE on a row owning no live layer | Fields AND a per-look input swap in one press ⇒ **no `PLAY`, no `CG ADD`, no `MIXER … VOLUME`, no `MIXER … FILL`/`CLIP`**, no seats, the layer still `empty`                                                             |
| —   | _positive control_                   | The same bridge, one TAKE ⇒ ADDs and PLAYs on the wire, and the take seats the UPDATE's input (`route://9`) — so scenario 1's silence is a reading, not a dead trace                                                     |
| 2   | REMOVE on air                        | `accepted: false`, `errorCode === REMOVE_ON_AIR_CODE`, the message names STOP **and** CLEAR, **nothing on the wire**, the producer alive, **every live plate still seated**, the row still on the stack                  |
| 3   | An audio change                      | A raise and a SOLO map on a never-taken row ⇒ nothing on the wire, no seats, not on air — **and the intent IS recorded** (`livePlateVolumes`), which is what makes it a configuration change rather than a no-op         |
| 4   | A look switch                        | The row's LEVEL-3 per-look binding survives a switch away and back: same producer, same layer, same rendered rect; coming back is `MIXER FILL` and **no `PLAY`**                                                         |
| —   | _positive control_                   | On the disjoint look, frame 1 is off screen and frame 3 is on — the picture really moved before it was moved back                                                                                                        |
| 5   | STOP and CLEAR                       | STOP ⇒ `CG 1-1 STOP`, **no `CLEAR`, no re-ADD**, producer resident, row at `loaded`; the resume ⇒ bare `CG PLAY`, **no ADD**; CLEAR ⇒ producer destroyed and the row's plates released                                   |
| 6   | The restart notice, and the PRESS    | A real mock restart ⇒ the notice names the row; **in a 400 ms window between the restart and the press, nothing reaches the wire**; then `restoreEmptiedAir(['row-a'])` ⇒ ADD + PLAY, the row on air, the notice retired |

🔴 **Scenario 6 exercises the PRESS, not only the notice** — `B-225`/`B-227`'s contract is DETECT
AND SAY, ONE PRESS, and automatic restore was REFUSED. A test that asserted only the notice would
be green on a build that restored by itself, which is the one outcome the owner ruled out.

**One honest bound on scenario 2, stated in the file's own header.** `PROMPT.md` §10 asks for the
_canonical sentence_. `REMOVE_ON_AIR_REASON` is a RENDERER constant and the bridge is Node — golden
rule 1's seam. What crosses it is `REMOVE_ON_AIR_CODE`, in `@cg/shared-ipc`, imported by both
sides. So the wire proves the refusal, the code and the named way out; `removeRowRefusal.dom.test.ts`
(`errorCodeMessage(REMOVE_ON_AIR_CODE) === REMOVE_ON_AIR_REASON`, plus the row tooltip and the
toast) proves the code becomes that sentence. **Together they are the sentence; neither alone is**,
and the file says so rather than asserting a string it cannot see.

**What the fixture had to discover rather than assume.** The first run was refused `wrong-bank`: a
plate-bearing package is classified `low` by `requiredBankFor`, so it can only be loaded onto a LOW
bank row — a plate-bearing package on a high row composites its background OVER its own plates.
The rows moved to layers 1 and 2. Taken from the refusal, not from reading the code.

#### 17.1.1 🔴 The plant pass — five plants, five reddenings, each on the assertion that names it

Green on a first run is not evidence. Every plant was applied alone to
`tools/caspar-bridge/src/caspar-runtime.ts`, the suite run, and the file **reverted by its original
bytes** (verified `Buffer.equals`, not by git).

| Plant | What it broke                                      | Result       | The assertion that fired                                                       |
| ----- | -------------------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| P1    | `#ownsLiveSeats` always `true`                     | **REDDENED** | _"UPDATE on a row that owns nothing"_ — four `PLAY`s on the wire               |
| P2    | `#removeRefusal` never refuses                     | **REDDENED** | _"the BRIDGE refuses, not merely the control"_                                 |
| P3    | `setActiveLook` neutralised                        | **REDDENED** | _"frame 1 is off screen in RIGHT"_ — the positive control caught it            |
| P4    | the notice restores automatically, immediately     | **REDDENED** | timed out waiting for the notice (it was cleared before it was read)           |
| P4b   | the notice restores automatically **120 ms later** | **REDDENED** | _"the notice is a sentence, not an action"_ — five `PLAY`s in the quiet window |
| P5    | `stopItem` escalates to `out` (a CLEAR)            | **REDDENED** | _"STOP sends CG STOP"_                                                         |

⭐ **P4 was refined into P4b on purpose.** P4's redness was real but landed on the notice WAIT, not
on the assertion that guards the contract — an auto-restore fast enough to beat the read would have
been detected for the wrong reason. P4b delays the plant past the notice, and then the exact
assertion fires. A plant that reddens the wrong line is a weaker proof than one that reddens the
right one, and the difference is worth the second run.

With every plant reverted the suite is **GREEN** and the source is byte-identical.

### 17.2 Channel independence — proved at the level it can be, and bounded

🔴 **This is the section the phase exists to get right, and the honest answer is that channel
independence is NOT provable at the wire in this repo today.** `PROMPT.md` §10 asks that _"an
action on one channel does not disturb another's state"_. The bridge is single-channel in exactly
three places (`R-062`, filed by Phase 7 under owner answer A3): five verbs take `z.void()`, there is
no channel-discovery call, and `fixedLayers` declares ONE bank on ONE channel. **There is no second
channel to disturb**, so a wire test asserting the property would pass because the configuration
cannot exist — not because the property holds. The app's own mock cannot express it either:
`MockRuntime.load()` writes no `item.slot` at all.

**What was built:** `apps/runtime/tests/channelIndependence.dom.test.ts` — 8 tests, four sections,
each naming its own level.

- **§1 — THE CONTRACT (proved).** The ADDRESS of a per-row verb is the ITEM; the CHANNEL is a fact
  carried inside it (`StackItemStateSchema.slot.channel`, asserted non-empty first, then identity).
  `StackTakeChannel` / `StackStopChannel` / `StackOutChannel` accept `{ itemId }`, **reject
  `{ channel }`** and reject `undefined`. This is the contract half of owner answer A3, and it is
  what makes the per-row verbs channel-**agnostic** rather than channel-**blind**.
- **§2 — THE UI (proved).** Two rows in ONE React tree on ONE bridge stub, **on the same layer
  number, on different channels** — the discriminating case, because a console keyed by layer alone
  would collide there and pass everywhere else. Pressing STOP on channel 1's row dispatches
  `{ itemId: 'item-ch1' }` exactly once; `take`, `out` and `remove` are untouched; channel 2's row
  is `outerHTML`-identical before and after. The payload is then re-parsed through
  `StackStopChannel.request` — so the row is not merely passing a unique id, it is using the only
  address the contract offers. Positive control: the same press on channel 2's row names channel 2's.
- **§3 — THE BOUND, PINNED SO IT CANNOT ROT (proved as a limit).** The five bulk verbs
  (`removeAll`, `clearAll`, `stopAll`, `snapshot`, `silenceAllLivePlates`) are asserted to take
  `z.void()` and to REJECT a channel. **For these, §10's sentence is FALSE by design, not by
  defect** — and for `silenceAllLivePlates` that is owner answer A16, decided rather than deferred.
  Pinning it means the day one of them gains a channel this test goes red and `R-062` must be read
  before the change lands. Positive control: `StackTakeChannel.request` rejects `undefined`, so the
  `safeParse(undefined).success === true` above is not satisfied by a schema that accepts anything.
- **§4 — THE SELECTION (proved).** The console's only channel-scoped ACTION today is choosing which
  channel the per-channel surfaces report on: every per-channel surface is read-only
  (`ChannelSection` displays the raster and does not type it — Phase 7's §14.0 evidence;
  `OutputsSection` reports). So the strongest true statement is that a selection is a pure scope
  change: `channelStore` holds a CHOICE and no channel state, and a round trip through channel 2
  returns the same answer for channel 1, with both channels' settings untouched. Positive control
  inside the round trip: the resolution really moves to 2 first.

#### 17.2.1 The plant pass for §2 and §3

| Plant | What it broke                                                          | Result       | Note                                                      |
| ----- | ---------------------------------------------------------------------- | ------------ | --------------------------------------------------------- |
| C1    | `LayerRow` dispatches STOP by its LAYER coordinate instead of its item | **REDDENED** | `{ itemId: 'layer-70' }` — both rows collide, as designed |
| C2    | `StackClearAllChannel` gains an optional `{ channel }`                 | **REDDENED** | _only after rebuilding `@cg/shared-ipc`_ — see below      |

⚠ **C2 STAYED GREEN on the first attempt, and that is worth recording rather than hiding.**
`apps/runtime` resolves `@cg/shared-ipc` from its BUILT `dist/`, so editing the package source
changes nothing until `tsc -b` runs. The plant was re-run with a rebuild and reddened on the exact
line (_"stack.clear-all cannot be scoped to a channel"_). The lesson generalises: **a plant against
a workspace dependency is not a plant until it is built**, and a plant that "stays green" may be
measuring the build, not the code.

**What is NOT claimed by any of the four sections:** that two channels have been driven on a real
bridge and left each other alone. That claim is not available today and this file does not make it.

### 17.3 `B-242` — the jsdom-geometry sweep, in full

**Scope:** every non-e2e test file under `apps/runtime/tests` — **154 files as the tree stood at
the sweep** (`git ls-files`, `tests/e2e/**` excluded; `apps/runtime/src` holds no test files).
Swept in two passes, both `git grep` (never `grep -r`, never ripgrep — golden rule 9's
NUL-blindness clause).

⚠ **The count is 155 in the commit, and the difference is this phase's own new spec.**
`channelIndependence.dom.test.ts` was untracked while the sweep ran, and `git grep` does not see
untracked files — so it is named here rather than folded into the number. Pass 1 was re-run after
staging with the file present and returns the same single comment hit; the spec makes no geometry
assertion of any kind. Nothing else was untracked at sweep time (`git status` carried only
`.codex/`, `AGENTS.md` and `docs/design/`, none of them test files).

**Pass 1 — the mechanical layout reads.** `getBoundingClientRect`, `getClientRects`,
`offsetWidth/Height/Top/Left`, `clientWidth/Height/Top/Left`, `scrollWidth/Height/Top/Left`,
`elementFromPoint`, `IntersectionObserver`. **ONE hit, and it is a comment** —
`modalPrimitive.dom.test.ts:209`, explaining why a `getBoundingClientRect` would be meaningless
there. **Zero assertions.**

**Pass 2 — the wide net.** Every `expect(` line in those 154 files whose text mentions a geometry
word (`width`, `height`, `overflow`, `rect`, `bounding`, `edge`, `clip`, `px`, `top`, `left`,
`right`, `bottom`, `gap`, `padding`, `margin`, `inset`, `scroll`). **45 lines**, every one read and
classified — not sampled:

| Bucket                                                                                                                                                                                                                                                                                                                                                     | Count | Verdict                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The word matched incidentally (a look id `left`/`right`, `focus left the overlay`, `ENOSPC … left on device`, `pos=bottom-right`, layer variables `top`/`bottom`, `clip-path` inside emitted SVG)                                                                                                                                                          | 15    | Not geometry at all                                                                                                                                                                                                                                 |
| A PURE FUNCTION's arithmetic (`livePlateGeometry` plate rects ×7, `frameBox` ×2)                                                                                                                                                                                                                                                                           | 9     | Real — no DOM is read; `livePlateGeometry:331` even carries a differ-control                                                                                                                                                                        |
| A DECLARED value: the vanilla-extract style OBJECT (`layout.test.ts` ×5), the emitted CSS/SVG TEXT (`splashCss` ×4, `railWhiteBox`), manifest data (`frameEnvironment` ×2, `template-delivery`)                                                                                                                                                            | 13    | Real — these are cascade/source facts, which jsdom resolves faithfully (golden rule 12's own carve-out)                                                                                                                                             |
| An INLINE style the component itself writes, asserted with a positive control beside it (`lookPicker:461` `overflowX` with `gridColumn`/`minWidth`; `previewPanel:185` `zIndex` ordering; `frameEnvironment:166–167` unchanged under a transform; `awaitingNotice:294/305`; `bannerCompact:56–57` and `outputMissingBanner:143` with `flexShrink === '0'`) | 7     | Real — reads the whole cascade for these elements (`features/shell` uses no `className`), and reddens under its own regression                                                                                                                      |
| `layerTableHeader:140` — `air.parentElement.style.overflow` is `not 'hidden'`                                                                                                                                                                                                                                                                              | 1     | **Investigated as the one candidate, and CLEARED**: `styles.stateHead` is a genuine inline style object, its sibling `styles.cell` DOES set `overflow: 'hidden'`, and re-pointing one at the other is the realistic regression — which this reddens |

⇒ **ZERO instances of `B-242`'s class in the runtime's dom tests. Nothing to move to Playwright,
nothing to delete, and NO REMAINDER.** The same two passes over `packages/*/tests` and
`tools/*/tests` return zero as well.

🔴 **THE POSITIVE CONTROL, because a negative observation is void without one.** A temporary probe
spec was planted at `apps/runtime/tests/zzz-b242-probe.dom.test.ts`, rendering a REAL `LayerRow`
(contractually 67 px tall with `48 × 36` verbs — Phase 3, measured in Chromium) and asserting
`rect.width === 0`, `rect.height === 0`, `offsetWidth === 0`, `offsetHeight === 0`,
`scrollHeight === 0`, the verb block's width `=== 0` **and** `!== 48`, and that nothing ever
overflows. **It PASSED.** Two things follow, and the second is the one that matters:

1. the hazard is LIVE in this tree today — a box claim and its own contradiction are both green;
2. **the sweep's instrument is live too** — with the probe present pass 1 returned **8** hits;
   with it deleted, **1** (the comment). A grep that could not see the planted defect would have
   made the clean result meaningless.

The probe was deleted; it is not in the commit.

### 17.4 `P-025` — the commit-message BOM guard, and a live turbo-inputs hole it exposed

**The hook.** `.husky/commit-msg` → `tools/gate-hook/src/commit-msg-cli.mjs` →
`commit-msg-decision.mjs`, the repo's existing decision/CLI split (`never-stage-*`,
`pre-push-*`), with `types/commit-msg-decision.d.ts` and 8 unit tests.

- It refuses a message whose **first bytes** are a BOM — `EF BB BF`, and the two UTF-16 marks, each
  named in the refusal. A BOM later in the message is a paste or a quoted file and passes.
- Every test case is written in **BYTES, never a string literal**: a `'﻿…'` literal would be
  testing the test file's own encoding, and this defect is precisely one a text round trip makes
  invisible.
- **FAIL-OPEN** on a missing argument, an unreadable file or a short read. A guard that blocks
  every commit when its own input is unreadable is worse than the defect.
- The refusal names the remedy in one line: write the message file without a BOM and
  `git commit -F <file>` — because `Out-File` / `Set-Content -Encoding utf8` / `>` all prepend one
  on Windows PowerShell 5.1.

⭐ **The first draft of these three files CONTAINED four literal `U+FEFF` characters** — in the
comments that describe the mark, and in the mid-message test case. `eslint`'s
`no-irregular-whitespace` caught all four on the gate's first run. Golden rule 9's NUL clause
generalises one character over: **a file that talks about an invisible byte must not contain
one.** The comments now spell it `<U+FEFF>` and the test builds it with
`String.fromCharCode(0xfeff)`, which is also the honest thing for a test whose whole point is
that a text round trip makes this defect vanish. Recorded rather than quietly fixed, because
the trap caught the person writing the guard against it.

🔴 **Proved BOTH WAYS against a real `git commit`**, in a throwaway repository outside the tree
(`os.tmpdir()`, removed afterwards; nothing on the owner's machine touched):

1. **the positive control FIRST** — a clean message _"feat(probe): a clean subject — with an
   em-dash and سلام"_ **COMMITTED**, and `git cat-file commit HEAD` shows no BOM. Without this, "it
   refused" would be satisfied by a hook that refuses everything;
2. a message identical but for three leading bytes **REFUSED**, printing the one-line remedy;
3. `git rev-list --count HEAD` = **1** — the refused commit really did not land.

⚠ **`be883e3c` and `e800fd4e` STAND.** The owner's answer: nothing parses commit subjects, and
rewriting shared history costs more than the byte. No force-push, no rewrite. The hook exists so
there is no fourth.

🔴 **AND THE HOLE THE NEW FILE EXPOSED — `turbo.json` did not hash `types/**`.** Adding
`types/commit-msg-decision.d.ts`widened what`typecheck`READS;`tools/gate-hook/tsconfig.json`includes`types/**/\*`and its eslint config lints`types/**/\*.ts`, but neither task's turbo
`inputs` listed it. **Measured, not asserted** (`CLAUDE.md`: this class fails silently and ONLY
under a cache HIT, so neither `pnpm gate`'s forced run nor a cold CI runner can catch it):

| Step                                                       | Before the fix                              | After                                |
| ---------------------------------------------------------- | ------------------------------------------- | ------------------------------------ |
| warm the cache                                             | `cache miss, executing` — exit 0            | `cache miss, executing` — exit 0     |
| plant a real type error in `types/**`, change nothing else | **`cache hit, replaying logs` — exit 0** 🔴 | `cache miss, executing` — **exit 2** |
| revert                                                     | `cache hit` — exit 0                        | `cache hit` — exit 0                 |

`types/**` was added to BOTH `typecheck` and `lint` inputs **in this same commit**, per the rule.
`tools/gate-hook` is the only workspace with a `types/` directory today (`git ls-files`), so the
fix is complete rather than partial.

### 17.5 What Phase 10 did NOT do, and why

- It did **not** change one line of product behaviour. Phase 10 verifies; every red-first proof for
  these properties belongs to the phase that built it (§10.3, §11.5, §13.5, §16.6). The only source
  files touched outside tests are `turbo.json` (the inputs fix above) and the new hook.
- It did **not** write a wire test for channel independence. §17.2 says why, at length, rather than
  writing one that would pass for the wrong reason.
- It did **not** move or delete any dom assertion for `B-242`: there were none of that class. It
  also did not "tidy" the seven narrow inline-style assertions into something jsdom can answer
  better — weakening an assertion to suit the engine is the same defect with a fresh coat.
- It did **not** renumber `B-242`, and did **not** edit `CLAUDE.md`'s stale `bin/**` sentence. Both
  are filed for the owner in §17.6.
- It did **not** force-push, amend or rewrite `be883e3c` / `e800fd4e`.
- It did **not** touch the bridge's refusal or preflight paths, the bank fencing,
  `reconcileOnReconnect`, `LockPolicy`, any persisted key, file or schema, any colour literal, or
  any string in Persian.

### 17.6 🔴 THE PROGRAMME'S CLOSING POSITION

**The ten phases are COMPLETE.** Phase 2 carries addendum 2A (an addendum, not an eleventh phase).
Every phase from 2 onward has a completed, green Linux `e2e` run URL beside its ticked item, with
the `E2E (Playwright)` job confirmed to have RUN.

**The deletion guard: 28 items, ALL DISCHARGED.**

- 26 items (1–26) preserved through the redesign and re-dressed in the new tokens (Phase 9.1).
- Item **27** — the audit log's ACTOR column with its `B-143` caveat and the picker — is the one
  item the redesign had to ADD BACK rather than preserve; built and discharged in Phase 8 under
  owner answer A1.
- Item **28** — the audio dialog's MUTE — is **CLOSED as a DELIBERATE REMOVAL**, decided at the
  wire under owner answer A15, not lost.
- 🔴 Every item was **PLANT-TESTED** in Phase 9.0 (§16.1): 33 unit plants plus two Playwright
  plants, each item's render deleted or its condition made unreachable. All 23 ✅ entries reddened;
  the four 🔴 entries (5, 7, 9, 22) stayed green exactly as the ledger predicted and now have the
  tests that redden. Phase 10 re-ran the guard end to end: **149 runtime files / 1364 tests green**,
  and items 19 / 20 / the lock geometry in Playwright.

**The sixteen owner answers, and where each is recorded** _(there is no A7, A17 or A18 — §17.0)_:

| #   | Answer                                                                    | Recorded in                                                             |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A1  | The audit-name picker STAYS, beside the actor column                      | `tasks.md` header · `design.md` §5b, §15.6 · guard 27                   |
| A2  | The `docs/design/` settings mockups are ABANDONED                         | `tasks.md` header · `design.md` §6                                      |
| A3  | The §4 single-channel finding was too strong; three gaps                  | `tasks.md` header · `design.md` §4 · `R-062`                            |
| A4  | TWO GREENS is a rule — on-air green ≠ healthy mint                        | `tasks.md` header · `design.md` §9 · `theme.test.ts`                    |
| A5  | The marked-row edge bars at 3.68:1 are correct and stay                   | `tasks.md` header · `design.md` §9                                      |
| A6  | `--r-text-muted` 4.39:1 was an accepted fail; Phase 3 closed it at 4.89:1 | `tasks.md` header · `design.md` §9, §10.4                               |
| A8  | 🔴 WAVE 1 IS REJECTED — `48 × 36` stays                                   | `tasks.md` header · `design.md` §11.1 · `PROMPT.md` §3                  |
| A9  | `--r-row-icon-btn-narrow-w` is DELETED, not documented-dead               | `tasks.md` header · `design.md` §11.1                                   |
| A10 | `PROMPT.md` §0 gains RENDERED-NOT-AUTHORED                                | `PROMPT.md` §0 (commit `0572102e`) · `design.md` §11.1                  |
| A11 | `PROMPT.md` §3's numbers marked SUPERSEDED in place                       | `PROMPT.md` §3 (commit `0572102e`) · `design.md` §11.1                  |
| A12 | 🔴 No SECOND claim about air on a row that already says                   | `tasks.md` header · `design.md` §12.8 · `runtime-ui` spec               |
| A13 | `R-060` closed: `monitorsShown` does NOT persist                          | `tasks.md` header · `R-060` · `runtime-ui` spec                         |
| A14 | `R-061` SPLIT — (a) done in Phase 6, (b) PARKED                           | `tasks.md` header · `design.md` §13 · `R-061`                           |
| A15 | 🔴 MUTE's removal was DELIBERATE, decided at the wire                     | `tasks.md` header · `design.md` §14.0 · guard 28                        |
| A16 | 🔴 `silenceAllLivePlates` stays UNSCOPED; its label says so               | `tasks.md` header · `R-062` · `liveSourcesPanel.dom.test.ts` · §17.2 §3 |

**What remains OPEN, and who owns it:**

| Open item                                   | State                                                                                                                                                                                                                                                                                    | Owner                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `R-061(b)` — a Reset for the position draft | **PARKED**, not built. Discard already undoes edits (owner answer A14).                                                                                                                                                                                                                  | owner, when he wants it         |
| `R-062` — the three single-channel gaps     | **OPEN.** (1) five `z.void()` bulk verbs — now PINNED by test (§17.2 §3); (2) no channel-discovery call — `channelIds` is the function one would feed; (3) `fixedLayers` = one bank, one channel. Each is a CONTRACT change, which `PROMPT.md` §7/§11 forbids a UI phase from inventing. | a bridge change, not a redesign |
| The mock's missing `slot`                   | **OPEN, filed.** `MockRuntime.load()` writes no `item.slot`, so the app's mock cannot express two channels — which is half of why §17.2 is bounded as it is.                                                                                                                             | small, unowned                  |
| `P2.DEL`                                    | **OWNER-GATED, gate MET, and NOT part of this programme.** `multibox-layout-switch` §1b; `D-160` records that the plant record meets its gate and the "no transitions" decision turns its two PARKED rows into DELETE rows. Nothing in `RUNTIME-REDESIGN-01` touches it.                 | owner                           |
| `B-242` double-booked                       | **FILED HERE** (§17.0 item 2). Two meanings, one number, neither with a `##` heading in `bugs-runtime.md`.                                                                                                                                                                               | owner / next `B-` audit         |
| `CLAUDE.md`'s stale `bin/**` note           | **FILED HERE** (§17.0 item 3). The notch it calls open is closed; the sentence was not updated.                                                                                                                                                                                          | owner (shared config)           |

**Did any phase leave a remainder?** **No.** Every phase's `tasks.md` items are ticked, each with
its Linux `e2e` URL; Phase 9 discharged the last four owed guard tests; Phase 10's `B-242` sweep
was completed in full over all 154 files with no remainder. The four items above are OPEN WORK
FILED WITH OWNERS, not unfinished phase work.

### 17.7 The runs

- The two plant passes: 5 + 1 plants on the bridge (§17.1.1) and 2 on the renderer / contract
  (§17.2.1), each applied alone, each reverted **by its original bytes** with `Buffer.equals`
  confirming byte-identity, and the suite green again after every revert.
- The `B-242` probe and the turbo-inputs probe, both in the scratchpad, both reverted; the probe
  spec deleted (`git status` carries none of them).
- The BOM hook proved end to end in a throwaway git repository, removed afterwards.
- `pnpm --filter @cg/runtime exec vitest run` — **149 files / 1364 tests passed** (37.7 s).
- `pnpm --filter @cg/caspar-bridge exec vitest run` — **103 files / 836 tests passed** (32.3 s).
- `pnpm gate` — **`93 successful, 93 total · 0 cached, 93 total`**, foreground, 3 m 17 s; prettier
  clean; OpenSpec `78 passed, 0 failed`. ⚠ Its FIRST run was red on **two real lint errors this
  phase introduced**, both worth naming rather than burying: four literal `U+FEFF` characters in
  the BOM guard's own comments and test (`no-irregular-whitespace` — §17.4), and a hand-built
  `Layer ${n}` alias in the channel-independence fixture, caught by `cg/bank-shape`, the rule
  `B-203` exists to enforce. **A test fixture is exactly where a second spelling of a name starts**,
  so the rule firing there is the rule working.
- `pnpm --filter @cg/runtime test:e2e` — **145 passed (1.7 m)**, Windows, ⚠ NON-AUTHORITATIVE
  (golden rule 12a). Its first attempt was REFUSED by the `P-036` staleness guard, correctly: the
  `C2` plant had rebuilt `@cg/shared-ipc` under the app's `dist`, and two runs of a stale bundle
  agree perfectly while proving nothing. `pnpm build --force` re-stamped it.
- ✅ **The Linux `e2e` on the code head `86e67dc1`:**
  <https://github.com/yasermostafaee/cg/actions/runs/34259488065> — `conclusion: success`,
  10 m 47 s; the `E2E (Playwright)` job **RAN** 10 m 31 s (17:50:33Z → 18:01:04Z) with its `E2E`
  step executing 9 m 37 s (17:51:16Z → 18:00:53Z), and `Lint • Typecheck • Test • Build` green in
  5 m 53 s. Recorded beside `tasks.md` 10.5, as every phase before it.
- ⭐ **That the `e2e` job would RUN was predicted before the push, not hoped for.**
  `classifyChangedSet` over this commit's eleven paths returns `{ kind: 'code', needsE2e: true }`
  — three of them classify as render-affecting. `P-029`'s skip is the one thing that would have
  made a green run worthless here, and it was checked in advance rather than discovered after.
- ⚠ **The `e2e` owed on `b9325b25` is DECLARED SUPERSEDED**, on the owner's instruction: it is many
  heads back and covered by seven later green runs whose `E2E (Playwright)` job was confirmed to
  have RUN, and those jobs are whole-tree (the reasoning `P-030` sets out). Not chased.

## §18 — `AUDIT-CLOSE-01`: THE FIRST DELTAS CLOSED, AND THE RULE THAT CLOSES THE REST

**2026-09-09, after the programme's ten phases were complete.** The owner set the finished console
beside its approved reference, read the gap as large, and an audit totalled the ARGUED column for
the first time: **142 not-adopted deltas, of which only 27 were the safety/contract case the phase
sign-offs were implicitly about.** 64 were pure look and 12 were surfaces never compared at all.
The audit itself is evidence-only; this section is the first session that CLOSES anything.

### 18.0 🔴 THE RULE, which binds this session and every one after it

_"Every delta FIXED or ARGUED"_ was an escape hatch with no budget, and the ARGUED column came out
LARGER than the FIXED one. From here:

- An ARGUED delta MUST name a **bucket-A** reason (safety / contract / refusal) or a **bucket-B**
  one (operator naming, or the reference is factually wrong here).
- **"Palette", "we liked ours better", and "the app has no X" where X was never measured are NOT
  reasons.** Each of the three has a worked instance in this document now: §10.1's correction shows
  what "palette" was hiding, and §1.1 + §12.3 show the third one being used as its own justification.
- Every session reports its running **FIXED vs ARGUED** totals. If ARGUED exceeds a quarter of the
  deltas touched, it stops and says so rather than justifying the rest.

### 18.1 What this session closed

| #   | delta                                                                                            | where                                                                                         |
| --- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| A   | Station setup's refusal band spanned the RAIL as well as its pane and met the footer flush       | `Modal.tsx` `messageFixed` + `--r-modal-message-*-fixed`; `modal-message-containment.spec.ts` |
| C2  | the layer table's row rule, header ground and header ink, at the reference's own rendered values | `--r-row-rule` / `--r-layer-head-bg` / `--r-layer-head-ink`; §10.1's correction               |
| B1  | the APP HEADER — brand, channel strip, monitors toggle, `PVW · N`, SETTINGS, LOG                 | `features/shell/AppHeader.tsx`, `ChannelStrip.tsx`                                            |
| B2  | the LAYERS SUB-BAR — search, `Hide empty`, `N loaded · N on air · N of M rows`                   | `layers/layerFilter.ts` + `LayersPanel`; `layerFilter.test.ts`, `shell-chrome.spec.ts`        |
| B3  | the layer tabs moved INTO the panel bar — one line, not two                                      | `Tabs.tsx` split into `TabStrip` + `TabPanel`; `Panel.tsx` gained `heading`                   |
| B   | the awaiting live region folded into the sub-bar, reclaiming the line it reserved                | `LayersPanel` `awaitingInBar`                                                                 |
| C1  | §1.1's two wrong map rows and §12.3's circular app-head argument, corrected in place             | §1.1's note, §12.3's struck row                                                               |

### 18.2 🔴 THE ACCEPTANCE NUMBER, measured

At 1280 × 800, chrome above the first data row, monitors folded away (the reference's own state).
The app figures EXCLUDE the mock's TEST-MODE band, which `shell-chrome.spec.ts` measures and
subtracts rather than assuming — it is the gap between the header's bottom edge and the top of the
channel tabpanel, so a band that changed height cannot quietly shift the number.

|                                                    | reference    | app BEFORE | app AFTER    |
| -------------------------------------------------- | ------------ | ---------- | ------------ |
| chrome above the first data row                    | **166.3 px** | 187.4 px   | **181.5 px** |
| …with the monitors shown (the app's own default)   | —            | 434.6 px   | **428.7 px** |
| rows visible above the status bar, monitors folded | **10**       | 7          | **7**        |

**The chrome came down 5.9 px and the row count did not move, and both halves of that are worth
saying plainly.** Adopting the reference's STRUCTURE costs height before it saves any: the app
gained a 48 px header where the channel strip it absorbed was 30, and gained the 40 px sub-bar it
never had — 58 px of new chrome — against the 40 px tab strip and the 26.4 px awaiting line it
gave back. The console now has the drawing's shape; what it does not yet have is the drawing's
row count, and 5.9 px is not a row.

Every remaining pixel against the reference is itemised, and each is either outside this session's
scope by the owner's own instruction or bucket-A:

| px   | what                                                               | why it stands                                                                                            |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| +9.5 | the panel bar is `--r-panel-bar-h` 53 against the reference's 43.5 | a height that belongs to BEING a panel and is shared by four of them; explicitly NOT this session's item |
| +2.5 | the column head is 28.3 against 25.8                               | **B** — `B-224`'s State tally wraps inside it; the reference has no tally                                |
| +3.2 | the shell's own padding and the panel's border                     | the shell's geometry, not the card's                                                                     |

That is 15.2, and 166.3 + 15.2 = 181.5. The arithmetic closes exactly, which is the point of
itemising it: there is no unaccounted chrome left above that row.

⭐ **THE ONE LEVER LEFT IS THE OWNER'S, and it is worth more than everything above put together:**
the app DEFAULTS to monitors SHOWN and the reference defaults to hidden. That default is **247.2 px
and three rows** — 428.7 against 181.5, four rows against seven. It is not changed here because the
default visibility of two MONITORING surfaces on a playout console is a safety decision rather than
a look (**A**), and `R-060` / owner answer A13 already settled the neighbouring question about
whether it persists.

⭐ **PULLED, 2026-09-09 — `MONITORS-01`, §19.** The refusal above was right to wait and its
premise turned out to be false: neither pane is a monitoring surface. PGM is a fixed empty
placeholder for the unbuilt `C-016` and PVW is a local browser render of the rehearsing rows
(`R-022`), so the default was hidden and the boot figure is now **181.5 px and seven rows**.
A13's non-persistence rule is untouched — §19.2 separates the two questions.

### 18.3 The ARGUED column for this session

Seven, each with its bucket, against seventeen fixed.

| delta                                                          | bucket | reason                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Templates` and `Import` buttons in the header                 | **A**  | the picker's door is the ROW; a header button is a second door with its own refusals about which row it lands on                                                                                        |
| the `PROTOTYPE` tag                                            | **B**  | the drawing labelling itself as a drawing                                                                                                                                                               |
| the manual FAILOVER stays on the status bar                    | **A**  | deletion-guard item 17 — it is the remedy for the fault pill beside it                                                                                                                                  |
| the LOCK stays on the status bar                               | **B**  | the reference draws no lock at all, so there is no reference decision to follow; its PIN is ephemeral and belongs with the engage                                                                       |
| the column head is 28.3 px, not 25.8                           | **B**  | `B-224`'s tally; the reference has no tally                                                                                                                                                             |
| ~~the monitors are shown by default~~ **SUPERSEDED — see §19** | **A**  | ~~the default visibility of two monitoring surfaces is a safety decision~~ — the refusal was right and the premise was not: neither pane is a monitoring surface (§19.1), and the default is now HIDDEN |
| the filter never hides a row the bridge reports something on   | **A**  | the reference filters plainly; this console may not, for the reason `isLayerVisible` may not                                                                                                            |

🔴 **7 of 24 is 29 %, which is OVER the quarter the rule sets, so this session STOPS here rather
than arguing the rest.** The signal is worth reading: six of the seven cluster on the app header
and the shell's two bars — the surfaces that had never been measured — which is what a bucket-D
surface looks like the first time somebody actually decides it. The owner should look there first.

### 18.4 Recorded, not built

- 🔴 **The picker's red `Delete from station` MOVES OFF THE ROW.** The owner has decided it; WHERE
  it goes is bound to the `Manage` view (audit row 101), which is a later item. **Nothing was built
  and nothing was moved.** Recorded here so the decision is not re-derived, and so the next session
  does not read the button's survival as approval.
  ⭐ **BUILT, 2026-09-09 — `RUNTIME-REPAIR-04`, §21.** `Manage` exists and the control is behind
  it; no picker row carries a deletion. What the deletion decides is unchanged (§21.4).
- Not touched, by the owner's own scope: the 24 cheap token values, the 19 medium items, and the
  remaining structural ones — `--r-panel-bar-h`, the Inspector's spacing gradient, the picker's
  width and its detail aside, the modal width table and the button family.

### 18.5 The runs

- `pnpm gate`, foreground, twice: **93 successful, 93 total · 0 cached, 93 total** (3 m 30 s and
  3 m 22 s). Runtime 150 files / 1377 tests; OpenSpec 78 passed, 0 failed. Both logs carry their
  `---- gate ended … exit 0` footer (`P-045`).
- `pnpm --filter @cg/runtime exec playwright test`, Windows, against a fresh `vite build`:
  **150 passed**. ⚠ NON-AUTHORITATIVE (golden rule 12a).
- The red-first runs, each taken before its fix and reverted by its ORIGINAL BYTES:
  - `modal-message-containment.spec.ts` — 2 failed on `Expected: >= 297 / Received: 87`, both
    sections; green after.
  - `layerFilter.test.ts` — the override's early return removed: **4 of 13 red**, the three
    override cases and the tally that depends on them; reverted with `Buffer.equals` confirming
    byte-identity and `PLANTED` absent; 13 / 13 green.
- The P-025 commit-message BOM hook, proved BOTH ways in this session: a planted `EF BB BF`
  message was REFUSED (exit 1, with the guidance it prints), and all four of this session's real
  subjects begin `0x66`.
- 🔴 **The Linux `e2e`, on the code head that carries B, C1 and C2:**
  <https://github.com/yasermostafaee/cg/actions/runs/34312162059> — `9cbcbbcd`,
  `conclusion: success`, and the **`E2E (Playwright)` job RAN** 04:45:00Z → 04:55:47Z (10 m 47 s),
  beside `Lint · Typecheck · Test · Build` 04:45:00Z → 04:48:49Z. Not skipped (`P-029`), not
  cancelled — the two ways a green run proves nothing.

## §19 — `MONITORS-01`: WHAT THE TWO PANES ACTUALLY RENDER, AND THE DEFAULT THAT FOLLOWS

**2026-09-09, immediately after `AUDIT-CLOSE-01`.** §18.2 closed with one lever left — the app
defaults to monitors SHOWN, the reference defaults to HIDDEN, and that is **247.2 px and three
rows** of the operator's primary working surface. `AUDIT-CLOSE-01` correctly refused to move it,
because the default visibility of two MONITORING surfaces on a playout console is a safety
decision. This section answers the question that refusal was waiting on.

### 19.1 🔴 THE FACT: NEITHER PANE IS A PICTURE OF THE CHANNEL

Traced in the code, not inferred from the components' names.

| pane    | what it renders                                                                                                                                                                                                                                                   | files                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **PGM** | **Nothing. A fixed empty box.** `MonitorStrip` renders `<MonitorPanel id="pgm" …>` with a hard-coded `emptyLabel`/`detail`; the component has no data input of any kind and no bridge call. There is no program return anywhere in this app.                      | `features/monitors/MonitorStrip.tsx`, `MonitorPanel.tsx`                              |
| **PVW** | **A LOCAL BROWSER RENDER of the rehearsing rows.** `PreviewPanel` reads the bridge's REHEARSE SET (`useRehearse`) plus the operator's _staged_ Inspector drafts, and `RehearsalStage` composites one `srcdoc` iframe per row with `@cg/template-runtime` inlined. | `PreviewPanel.tsx`, `RehearsalStage.tsx`, `RehearsalFrame.tsx`, `frameEnvironment.ts` |

Both halves are stated in the modules themselves, and neither is ambiguous:

- `RehearsalStage.tsx`, in its own header — _"rendered LOCALLY IN THIS BROWSER and COMPOSITED
  in the channel's own stacking order. **Nothing is sent to CasparCG.**"_ That is `R-022`'s
  wording, and the frame is `srcdoc` so it is not even fetching a page from the bridge.
- `MonitorPanel.tsx`, on PGM — _"genuinely awaiting a FEED … the program-channel return from
  the playout server, **which does not exist yet** — owned by `C-016`."_
- `RehearsalStage.tsx` again, on what PVW deliberately does NOT show: _"On-air rows are
  deliberately absent … PGM is the surface for what is on air."_ **So the pane that shows
  something shows only what is NOT on air, and the pane that would show air shows nothing.**

**The answer to the question as posed is (i): what the console BELIEVES.** And PVW is narrower
even than that — it is what the console believes about rows the operator has put into REHEARSE,
with edits that have not been applied.

**What `C-016` would add, and it is NOT built.** `docs/prd/caspar.md` `C-016` is `[ ]`: the
bridge would periodically capture the programme channel with a CasparCG grab command, serve the
latest frame over its existing HTTP server, and the Runtime would show it refreshing at ~1 s
with a visible age and a legible stale/error state. Nothing is implemented — what exists is the
RECON KIT (`tools/caspar-amcp-probe/bin/confidence-probe.mjs`) and an empty measurement runbook;
no mechanism is chosen and no `design.md` was written. That item is the first thing in this
product that would make PGM a confidence surface.

⭐ **`C-016`'s OWN fourth acceptance bullet answers this section's question independently:**
_"WHEN the panel is hidden or off THEN its polling stops; **the panel is OFF by default** and
toggleable."_ Even the real confidence view is specified to boot folded away. A placeholder for
it cannot have earned a stronger default than the thing it stands in for.

### 19.2 THE DECISION, AND THE `A13` DISTINCTION THAT MUST NOT BE READ AS AN OVERTURN

🔴 **The default is now HIDDEN** — `DEFAULT_MONITORS_SHOWN = false` in `useShellLayout.ts`, one
home read by the hook's initial state, its `reset()`, and `shellLayoutContext`'s stand-in.

The argument the flag carried until today was: _"PVW is the operator's last look before air, and
a console that booted with it folded away would have deleted a safety surface by default."_ That
sentence assumed the strip is confidence monitoring. §19.1 shows it is not, so the trade it
described was never the trade being made: what the strip actually costs is 247.2 px and three
rows of the LAYER LIST — the only surface in this console that says what is genuinely on air —
spent on a rehearsal preview and an empty box. The approved reference defaults it hidden, and
`C-016` specifies the same for its successor.

#### ⚠ A13 IS NOT OVERTURNED. THE RULE AND THE DEFAULT ARE DIFFERENT QUESTIONS.

**Written at length because the two look like one question and are not, and because a later
reader who finds a hidden-by-default monitor strip beside A13's sentence will otherwise conclude
that one of them must go.**

- **A13's RULE — _"a control that HIDES a safety surface does not persist its hidden state"_ —
  STANDS, UNCHANGED, and is still enforced.** `monitorsShown` is written by nothing and read
  from nothing: `write()` still carries exactly `{inspectorPx, monitorPx, focus}`, and
  `shellLayout.monitorsShown.dom.test.ts` still asserts that a toggle writes nothing and that a
  reload discards it. That test now asserts it in the direction the operator can actually take
  from the boot state — he can only SHOW — which is the same rule read from the other end.
- **A13 never answered the DEFAULT.** It closed `R-060`, whose whole subject is _"should
  'monitors hidden' survive a reload?"_ — a question about PERSISTENCE. `R-060`'s own text
  frames it as "join `{inspectorPx, monitorPx, focus}` under the same key, or not". The shipped
  boot state was not on the table; it was Phase 5's, set in passing with the sentence quoted
  above, and never argued against a measurement.
- **⚠ WHAT DOES CHANGE IS A13'S REASON, AND THIS IS THE HONEST PART.** A13 justified
  non-persistence with _"this product prefers a known safe state after a restart over a
  remembered one"_, and it meant SHOWN by "safe". With the default hidden, the safe boot state
  is "no monitors" — so that clause, read literally, now points the other way. **The rule
  survives the reversal of its own example**, because the half of A13 that is load-bearing is
  _"a KNOWN state over a REMEMBERED one"_: the console boots the way its designers decided, not
  the way the last shift left it. That half is untouched and is arguably better served now,
  since the shipped decision is the one being restored. The half that named which state is safe
  was about a surface nobody had traced.

**So: the rule is A13's and stays A13's; the default is `MONITORS-01`'s. Do not "reconcile" them
by re-persisting the flag, and do not read a hidden default as licence to persist a hidden
state.** Recorded on `R-060` in `docs/prd/runtime.md`, in `tasks.md`'s A13 bullet, and in the
`runtime-ui` spec's requirement, so all four copies say the same thing.

### 19.3 THE OPERATOR MUST ALWAYS BE ABLE TO TELL THE MONITORS EXIST

A default that hides a surface is only defensible while the surface announces itself, and the
failure to guard against is not "the strip is hidden" — that is the decision — but a console on
which an operator who has never seen the strip has no way to learn it is there.

The toggle is UNCONDITIONAL in the app header: no `rehearsals.length` gate like the `PVW · N`
badge beside it, no narrow-mode drop, and it carries the WORD `SHOW MONITORS` as well as a
glyph. In the boot state nothing else on the whole surface mentions PVW or PGM, so that string
is the entire announcement.

Proved on both sides of golden rule 12(c):

- **`shell-chrome.spec.ts` §B4** (Playwright): at boot the strip is absent; the toggle is
  VISIBLE, sits inside `[data-app-header]` by containment, contains `SHOW MONITORS`, has a real
  box (> 60 px wide), and one press produces the strip with both `PREVIEW (PVW)` and
  `PROGRAM (PGM)` regions in it.
- **`monitorsDefault.dom.test.ts`** (jsdom, whole `App`): exactly ONE such control page-wide,
  in the header by containment, with `aria-expanded` / `aria-controls` correct and the word
  present; one press produces the strip and renames the control; a POSITIVE CONTROL states
  separately that this harness does render a strip when the flag is on, so "no strip" can never
  mean "this harness never draws one".

**Red-first, measured:** with `DEFAULT_MONITORS_SHOWN` planted back to `true`, **5 assertions
across the two files went red** (the boot flag, the strip's absence, the word, the press, and
the positive control); reverted by writing the ORIGINAL BYTES back, confirmed byte-identical
with `SequenceEqual` and `PLANTED` absent.

### 19.4 🔴 THE ACCEPTANCE NUMBERS, MEASURED

At 1280 × 800 in Chromium against a fresh `vite build`, chrome above the first data row, with
the mock's `TEST MODE` band measured (46.2 px) and subtracted — so these are real-bridge figures
directly comparable to the reference's 166.3.

|                                              | reference    | app BEFORE `AUDIT-CLOSE-01` | app after it | **app now**  |
| -------------------------------------------- | ------------ | --------------------------- | ------------ | ------------ |
| chrome above the first data row, **at boot** | **166.3 px** | 434.6 px                    | 428.7 px     | **181.5 px** |
| rows visible above the status bar, at boot   | **10**       | 4                           | 4            | **7**        |
| chrome with the monitors brought up          | —            | 434.6 px                    | 428.7 px     | **428.6 px** |
| rows with the monitors brought up            | —            | 4                           | 4            | **3**        |

**The default is the whole of it: 428.7 → 181.5 px and 4 → 7 rows, at no cost in chrome.** The
folded figure is unchanged from `AUDIT-CLOSE-01`'s to the tenth of a pixel, which is the point —
nothing above the first row moved, the console simply now boots in the state that already
measured well. §18.2's itemisation of the remaining 15.2 px over the reference stands untouched
(+9.5 the panel bar, +2.5 the column head, +3.2 the shell's padding and border).

⚠ **The "3 rows" with the strip up is not a regression and is not comparable to §18.2's "4".**
Measured row by row: with a row SELECTED the first row is 117.4 px rather than 67, because it
carries the look strip. §18.2 counted from an unselected first row. The chrome figure — the
number that is actually about this session's work — is unchanged at 428.6.

### 19.5 THE CHEAP TWENTY-FOUR: WHAT WAS ADOPTED, AND THE ONE ARGUMENT THAT COVERS THE REST

`AUDIT.md`'s cheap bucket is rows 3, 4, 9, 10, 11, 12, 15, 19, 20, 21, 23, 30, 32, 33, 38, 54,
58, 71, 74, 77, 84, 85, 90, 92. Row 11 (the layer table's row rule) was closed by
`AUDIT-CLOSE-01`; the rest are disposed of here.

#### FIXED — thirteen, each measured in Chromium at 1280 × 800 before it was applied

| row    | what                                            | reference (rendered)  | was                     |
| ------ | ----------------------------------------------- | --------------------- | ----------------------- |
| **12** | the Graphics-beds band's type                   | 10 px / 700 / normal  | 9.92 px / 700 / `.06em` |
| **19** | the look segment's weight, at rest AND selected | 400                   | 500 / **700**           |
| **23** | the panel's corner (`Panel` primitive)          | 6 px (`.inspector`)   | 4 px                    |
| **30** | the Inspector's position row gap                | 8 px                  | 12 px                   |
| **54** | the live-plates table head's weight             | 550                   | 500                     |
| **58** | the gain range's corner                         | 7 px                  | 4 px (`.cg-field`'s)    |
| **71** | Station setup's frame corner and lift           | 16 px, `0 32px 100px` | 6 px, `0 4px 16px`      |
| **74** | …its title                                      | 19 px / 650           | 16 px / 700             |
| **77** | …its close box                                  | 38 × 38, radius 8     | 30 × 30                 |
| **84** | the pane section head's weight                  | 650                   | 600                     |
| **85** | the contract tag's weight                       | 550                   | 500                     |
| **90** | the video mode word's weight                    | 550                   | 500                     |
| **92** | the outputs `th` weight                         | 450                   | 500                     |

Three carry a caveat that is reported rather than tuned away:

1. 🔴 **THE HALF-STEPS DO NOT RENDER AS HALF STEPS, IN EITHER TREE, AND BOTH HALVES ARE
   MEASURED.** This app ships Exo 2 as five STATIC faces (400/500/600/700/800) with no variable
   axis, so CSS font matching snaps: measured at 40 px by rendered width with the real faces
   inlined, **450 → 500, 550 → 600, 650 → 700**. And the reference does not render them either —
   its stack is `Inter, "Segoe UI", …` with `document.fonts` EMPTY, grouping {400, 450} /
   {500, 550, 600} / {650, 700}. **The drawing declares a scale finer than anything that draws
   it.** The tokens are declared anyway (`--r-weight-450/550/650`) so the rules CITE the drawing
   instead of coinciding with it; the consequence is that **row 92 is a visual no-op** (450
   resolves to the same face as the 500 it replaced) and rows 54/84/85/90 each land ONE STEP
   HEAVIER, which is the reference's own direction.
2. **Rows 23 and 38 are ONE change, because this app has ONE panel primitive.** The reference
   draws `.inspector` at 6 px and `.monitor` at 5 — one pixel apart and not a system. The
   Inspector's is taken and the monitor's rides it; a second token would spend a name copying an
   inconsistency, against this programme's own "one bar for four panels" rule (§12.3).
3. **Rows 71, 74 and 77 land on the `fixed` scope, not on the primitive.** The reference gives
   its dialogs radius 16 and 14 (rows 71, 70) and titles of 19, 20 and 22 px (rows 74, 62, 98).
   A primitive-wide value would have to pick one of those and apply it to surfaces the drawing
   gives different values for; `-fixed` is the scope this file already uses for every other
   Station-setup measurement.

#### 🔴 ARGUED — seven, and they are ONE argument, falsifiable in one line

Rows **3, 4, 9, 10, 20, 21** and row **38's ground**.

**Every value in these rows is absent from the reference's own declared palette.** Measured in
Chromium, `04-playout-layers.html`'s `:root` declares nineteen colours — `--bg #0b1017`,
`--surface #141b25`, `--raised #1b2532`, `--line #2d3a49`, `--soft #24303d`, `--text #eef3f9`,
`--muted #8e9eaf`, `--blue #74cdf6`, and eleven more. Its own body text renders `#eef3f9` and
its own primary button renders `#74cdf6`, so the drawing uses that palette. **But its layer
table paints `#1F2937` / `#E5E7EB` / `#4B5563` / `rgba(56,189,248,.1)` / `#38BDF8`, and not one
of those is among the nineteen.** They are this console's OWN PRE-PHASE-2 HEXES — §10.1 already
records that wave 4 was written _"in the app's pre-Phase-2 hexes — `#111827`, `#1F2937`,
`#38BDF8`, `#9CA3AF`"_ — transcribed back into the drawing by whoever drew it. Phase 2 adopted
the reference's DECLARED palette role for role (§7's table), so **on these six values the app is
already closer to the reference than the reference's own layer table is**, and adopting them
would revert an owner-approved palette move one value at a time.

⚠ **This is not "palette", which the §18.0 rule forbids, and the difference is the point.**
"Palette" means _we liked ours better_. This is a checkable claim with a one-line test — _is the
value among the reference's own `:root` declarations?_ — and a second, independent test the
audit itself asked for. Every pair was re-measured, and **the app equals or beats the reference
on all of them**:

| pair                                   | reference   | app         |
| -------------------------------------- | ----------- | ----------- |
| row 3 — verb ink on its own ground     | 11.86:1     | **13.87:1** |
| row 3 — verb border on its own ground  | 1.94:1      | **2.05:1**  |
| row 4 — PVW hover ground vs the row    | 1.32:1      | **1.48:1**  |
| row 4 — PVW hover ink on that ground   | **10.04:1** | 9.20:1      |
| row 9 — row HOVER vs the row at rest   | 1.04:1      | 1.02:1      |
| row 10 — selection FRAME vs the row    | 7.10:1      | **8.55:1**  |
| row 10 — selection WASH vs the row     | 1.21:1      | **1.25:1**  |
| row 20 — segment ink on its own ground | 13.05:1     | **15.52:1** |

⚠ **REPORTED, NOT RE-TUNED — one of these is a real defect and it belongs to the OWNER.** The
row HOVER is **1.02:1** in this app and **1.04:1** in the reference: neither is a hover anyone
can see. Adopting the reference's value would move it from 1.02 to 1.04, which is not a fix, so
nothing was changed. **A visible row hover needs a new value that neither tree has**, and
choosing it is the owner's.

The same one-line test disposes of row 38's `#101722` monitor ground: it is a fourth near-black,
between `--bg` and `--surface`, declared nowhere. The radius half of that row WAS taken.

#### Neither — three rows the session did not move, each with a reason from outside itself

- **Rows 32 and 33** (`Apply position` and `Add item`: 12.8 px / 600 / accent against the
  reference's 12 px / 550 / quiet). Two halves, two reasons, neither this session's:
  **the VARIANT is a recorded owner request**, quoted verbatim in `controls.css`
  («فقط از ایده تفاوت رنگ بین دکمه هاش استفاده کن. رنگ apply/update/add item متفاوته.») and
  naming exactly these controls; **the TYPE is the button family's**, which the owner put out
  of scope for this session. The audit filed them as bucket C without either fact.
- **Row 15** (look buttons 38 → 36 px) is a **STALE AUDIT ROW**. Measured today, the app's look
  button is `--r-look-btn-h: 38px` and renders 38 — Phase 4 had already adopted it. Recorded so
  the next reader does not go looking for a delta that is closed.

#### 🔴 THE BUDGET — 7 of 23, which is 30 %, so this session STOPS

Deltas touched: 23. **FIXED 13 · ARGUED 7 · owner-decided or out of scope 2 · already closed 1.**

**7 / 23 = 30 %, over the quarter the §18.0 rule sets, so this session stops here rather than
arguing the rest** — as `AUDIT-CLOSE-01` did at 29 %. Scored against only the twenty rows this
session could actually decide, it is 7 / 20 = 35 %; both numbers are given so the owner can read
it either way and neither denominator flatters it.

The signal is a different one from §18.3's, and worth reading. Six of the seven are a SINGLE
finding — the prototype's layer-table wave is painted in this console's own retired palette —
and it says something about the AUDIT rather than about the console: Part 3 of `AUDIT.md`
identified that wave correctly and then its RECOMMENDATION section sorted the same six rows into
"cheap, should have been adopted". **The two halves of that document disagree, and Part 3 is the
one that measured.** The owner should decide whether the remaining bucket-C colour rows inherit
this disposition before anyone spends a session on them one at a time.

## §20 — `REPAIR-03`: THE MODAL FAMILY, AND THREE CORRECTIONS TO `REPAIR-02`

**2026-09-09, after `MONITORS-01`.** This closes the audit's remaining MODAL items — the four
dialog emblems from the medium bucket, the modal width table and button family from the
structural one, and the two dialogs that had never been compared to anything at all.

### 20.0 THE ENUMERATION, FROM THE TREE

Written from the tree rather than from memory, because the audit's two bucket-D dialogs were
missed exactly once already by an enumeration that was not.

| #   | surface                  | app                                       | reference                                              | family     |
| --- | ------------------------ | ----------------------------------------- | ------------------------------------------------------ | ---------- |
| 1   | Audit log                | `AuditPanel` `ledger`                     | `#audit-dialog` (`data-start=audit`)                   | `.modal`   |
| 2   | Station setup            | `StationSetupDialog` `fixed`              | `.settings` (`data-start=channels`)                    | **shadow** |
| 3   | Live plate audio         | `LivePlateAudioDialog` `wide`             | `#audio-dialog` (`data-start=audio`)                   | `.modal`   |
| 4   | Live source for this row | `LiveSourceSwapDialog` `wide`             | **none**                                               | —          |
| 5   | Template picker          | `useTemplatePicker` `wide`                | `#template-dialog` (`data-start=templates`)            | `.modal`   |
| 6   | **Confirm ×15**          | `useConfirm` `prose`                      | **`#confirm-dialog`** (`.modal.small`) — audit row 139 | `.modal`   |
| 7   | Prompt                   | `usePrompt` `prose`                       | none (no production call site)                         | —          |
| 8   | Add delimiter            | `RecordDialog` `prose`/`sub`              | `#editor` `.sub-dialog`                                | **shadow** |
| 9   | **Engage lock**          | `EngageLockDialog` `prose`/`base`         | `#editor` `.sub-dialog` — audit row 140                | **shadow** |
| 10  | Add backup server        | `RecordDialog` `prose`/`sub`              | `#editor` `.sub-dialog`                                | **shadow** |
| 11  | Add / edit live source   | `LiveSourceDialog` `prose`/`sub`          | `#editor` `.sub-dialog`                                | **shadow** |
| 12  | Import wizard            | **not built** — a drop zone in the picker | `#import-dialog`                                       | `.modal`   |
| 13  | Console locked           | `LockOverlay` — **off the primitive**     | `#unlock-dialog` `.sub-dialog`                         | **shadow** |

**No reference equivalent:** #4 (the live-source swap) and #7 (prompt). **Built differently on
purpose:** #12 (audit row 107) and #13 (`B-229`, hard stop C1).

### 20.1 🔴 SHADOW ROOTS AND WAVES — CHECKED FIRST, AND BOTH ANSWERS SURPRISED

- **The shadow root exists on ONE surface and is created on demand.** `04-playout-layers.html`
  has **no shadow root at all**; `attachShadow` appears once and `createStationSetup` twice, so
  the root only exists once the settings dialog is opened (`data-start=channels`). An
  enumeration that probed `04` for it — the obvious thing to do — would have concluded there
  was none.
- ⚠ **`document.styleSheets` IS UNREADABLE over `file://`.** Chromium blocks CSSOM there, so a
  `cssRules` probe reports **zero rules** for a file with 1,067 of them — and a wave count
  built on it reads "0 waves" for everything, which looks like an answer. Waves are counted
  from the FILE TEXT (they are a property of what was authored); every VALUE is still
  `getComputedStyle` in the browser.

| stylesheet                    | bytes  | rules | `.modal`/`.settings` | head | foot | `.btn` | `.btn.primary` |
| ----------------------------- | ------ | ----- | -------------------- | ---- | ---- | ------ | -------------- |
| outer (1 `<style>`)           | 82,256 | 1,067 | **2**                | 3    | 3    | 1      | 1              |
| shadow (`createStationSetup`) | 29,098 | 402   | **4**                | 3    | 4    | 2      | 1              |

⭐ **A REFINEMENT TO "ONLY THE LAST WAVE PAINTS", and it matters here.** `.modal`'s second
restatement is `width:100vw;height:100dvh;border-radius:0` — which is NOT what paints at
1280 × 800, because it sits inside a narrow `@media`. The rule is about restatements at equal
specificity in the same conditional context; a media query is a different context. Every width
below was therefore taken by OPENING the dialog and reading the box, not by walking the file.

### 20.2 🔴 THE REFERENCE HAS THREE DIALOG FAMILIES, NOT ONE

This is the finding that shapes everything else, and "adopt the modals pixel for pixel" cannot
be executed without it: there is no single value for a modal's corner, head, footer or button.

|         | `.modal` (outer)                                | `.settings` (shadow)                     | `.sub-dialog` (shadow)        |
| ------- | ----------------------------------------------- | ---------------------------------------- | ----------------------------- |
| frame   | radius **14**, `0 30px 100px rgba(0,0,0,.667)`  | radius **16**, `0 32px 100px` + hairline | **480 px**, radius 16         |
| head    | `22px 26px`, gap 14, on `#172230`, 42 px emblem | `21px 28px`, min-h 90, transparent       | `21px 24px 17px`, h2 18/650   |
| body    | `22px` (confirm) / `0 20px` (audio)             | rail + pane, no padding                  | `23px 24px`                   |
| foot    | `16px 26px`, gap 12, on `#14202d`, **72 px**    | `15px 32px`, gap 14, **74 px**           | `16px 24px`, gap 9, **73 px** |
| button  | 39 px, radius 7, `9px 14px`, 14/550             | **40 px, radius 8, `9px 15px`**          | 40 px, radius 8               |
| primary | `--blue` **`#74cdf6`**                          | mint **`#8ce6d1`**                       | mint `#8ce6d1`                |

The app has ONE primitive with four sizes, so the mapping is by family: `prose`/`wide`/`ledger`
take the outer family, `fixed` keeps `.settings` (Phase 7 + `MONITORS-01`), and the `layer='sub'`
dialogs ride `prose` — 20 px and 2 px off `.sub-dialog`, a gap the drawing does not reconcile
between its own two families either.

⭐ **AND THE REFERENCE'S OWN PRIMARY IS NOT ONE COLOUR.** Its outer `.btn.primary` is
`#74cdf6` — which IS this app's `--r-accent`, so the outer dialogs already agreed. Only the
SHADOW family is mint. The owner's green rule therefore bites on exactly four controls, and
§20.5 records that all four already wore an app variant.

### 20.3 THE WIDTH TABLE, ADOPTED

| app size | reference                            | was              | now             |
| -------- | ------------------------------------ | ---------------- | --------------- |
| `prose`  | `.modal.small` `min(500, 100vw−32)`  | `min(460, 92vw)` | **500**         |
| `wide`   | `.audio-modal` `860`                 | `min(720, 94vw)` | **860**         |
| `ledger` | `.audit-modal` `min(1250, 100vw−56)` | same             | 1224 ✅ already |
| `fixed`  | `.settings` `min(1140, 100vw−64)`    | same             | 1140 ✅ already |

⚠ `wide` is also worn by the picker and the live-source swap. The picker moves 720 → 860,
**toward** its own reference width of 1120 rather than away; its width and its 342 px detail
aside stay audit rows 97 and 104, which the owner placed outside this session.

### 20.4 🔴 C3 — WHICH FOOTER FLOOR APPLIES TO WHICH DIALOG

Two numbers, each belonging to one family, and neither composed from what a section puts in it:

- **`--r-modal-foot-h` = 74 px — the `fixed` frame's**, from `.panel-foot{min-height:74px}`.
  Unchanged, still what `station-setup-frame.spec.ts` measures on all five tabs.
- **`--r-modal-foot-h-base` = 72 px — every other dialog's**, from `.modal-foot`, new here.
- **59 px was neither.** It was the abandoned mockup's arithmetic (36 + padding) and is gone.

`B-240`'s rule is intact in both: a height that belongs to BEING a footer cannot be a function
of its contents, so both are `minHeight` and neither is derived from a button row.

### 20.5 🔴 THE GREEN RULE — AND IT COST NOTHING, WHICH IS THE POINT

The reference paints its add / apply / primary buttons in its mint `#8ce6d1`. **Not adopted.**
This console spends green on AIR and HEALTH, and the standing two-greens rule keeps `--r-onair`
distinct from the healthy mint precisely because an operator must never read one as the other.
A green PRIMARY ACTION spends the same hue on something that is not a state at all, and every
extra green makes the on-air green cheaper. **In CG Control green means air or health; it does
not mean "this is the main button".**

⭐ **The screenshot was a SAMPLE and was not eyedropped.** The role it shows already exists:
`R-055`'s variant family carries `add` (`--r-btn-add` on `--r-btn-add-bg` — a dark fill, a sky
border, a sky label) for "every add-a-thing-to-this-list control", and `primary`
(`--r-accent-strong`) for the rest. Checked at the call sites, **`Add delimiter` and
`Add source` already pass `variant="add"` and every dialog confirm already passes `primary`** —
so the exception required NO code change at all. Nothing was invented and no role fell through
to `default`. Ratios: primary ink **6.82:1**, add ink **8.70:1**.

### 20.6 THE DELTAS

**FIXED — 17.**

| #    | what                           | reference                           | was                    |
| ---- | ------------------------------ | ----------------------------------- | ---------------------- |
| 62   | audio dialog emblem            | 42 px, radius 10                    | absent                 |
| 72   | Station setup emblem           | same box                            | absent                 |
| 98   | picker emblem                  | same box                            | absent                 |
| 113  | audit log emblem               | same box                            | absent                 |
| 70a  | `wide` width                   | 860                                 | 720                    |
| 70b  | frame radius                   | 14                                  | 6                      |
| 70c  | frame shadow                   | `0 30px 100px`                      | `0 4px 16px`           |
| 87a  | footer button height           | 39 px                               | 36 px                  |
| 87b  | footer button radius           | 7                                   | 4                      |
| 87c  | footer button type             | 14 px                               | 12.8 px                |
| 106a | footer inset                   | `16px 26px`                         | none                   |
| 106b | footer floor                   | 72 px                               | none (36 px intrinsic) |
| 106c | footer ground + rule           | `#14202d` + rule                    | none                   |
| 139a | confirm width                  | 500                                 | 460                    |
| 139b | head band + inset              | `22px 26px` on `#172230`            | no band                |
| 139c | body inset                     | 22 px                               | none                   |
| 140  | the engage-lock editor's frame | rides `prose`, now the outer family | 460 / radius 6         |

Plus the three A-corrections: **A1** adopted 9 values across rows 3, 4, 20, 21 and 38; **A2**
replaced the row hover; **A3** deleted three tokens that could not render.

**🔴 ARGUED — 5, and each names its bucket.**

| #   | delta                                       | bucket | reason                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | the reference's mint primary                | **A**  | the owner's own rule, made before this session and counted here rather than re-argued: green means air or health                                                                                                                                                                  |
| 3   | verb at rest `#1F2937` / `#E5E7EB`          | **B**  | stale by the narrow test AND it lowers the ink 13.87 → 11.86                                                                                                                                                                                                                      |
| 4a  | ON PVW hover fill `#2c3a4e`                 | **B**  | stale by the narrow test AND it lowers the lift 1.48 → 1.32                                                                                                                                                                                                                       |
| 4b  | ON PVW hover ink `#f4ecff`                  | **A**  | NOT stale — argued on `R-055` instead: a per-verb hover ink puts the REHEARSE hue on a control that is not rehearsing, the exact claim `R-055` scoped out after it shipped once                                                                                                   |
| 10  | selection `rgba(56,189,248,.1)` + `#38BDF8` | **B**  | stale by the narrow test AND it lowers the frame 8.55 → 7.10                                                                                                                                                                                                                      |
| 87d | the footer button's PADDING                 | **A**  | the app's shaping-capable Persian-first font sits high in its box, so the reference's symmetric `9px 14px` puts every dialog label low — a property of the font we ship, not of the drawing. The dead `--r-modal-btn-pad` written for it was deleted rather than left to lie (A9) |

**5 of 22 = 23 %, under the quarter.** (Counting the owner's green rule as instructed. Without
it, 4 of 21 = 19 %.) The session does **not** stop.

### 20.7 REPORTED, NOT RE-TUNED

Every TEXT ratio clears AA — the full table is in the session report. Three adopted values sit
below the 3.0 graphic floor, all of them the drawing's own, and all decorative rather than
identifying (WCAG 1.4.11 covers boundaries **essential to identify a control**; none of these
is): the look segment's rest border **2.86:1** (the segment is identified by its fill and its
label), the modal frame's edge **1.96:1** (identified by the scrim and a 100 px shadow) and the
emblem's edge **1.60:1** (pure decoration). Reported for the owner; not changed.

### 20.8 WHAT REMAINS

- **Medium bucket:** 43, 44, 45 (PVW zoom, guides, `ALL LAYERS`), 34, 51, 52, 115, 119, 101,
  111, 80, 82, 83, 126, 127. The four emblems (62, 72, 98, 113) are **closed**.
- **Structural bucket:** 24 + 39 (panel head shape), 26 (Inspector spacing), 97 + 104 (picker
  width and aside), 112 (audit log height). The width table and button family (70, 87, 106) are
  **closed**; 131 + 132 + the toolbar split were closed by `AUDIT-CLOSE-01`.
- **Bucket D:** 139 and 140 are **closed** — both measured, both now on the outer family. The
  four Station-setup tab bodies (134–137), the status bar (133), `Station layers` (138), the
  Inspector's look/plate sections (141) and the PVW stage content (142) remain unmeasured.

## §21 — `RUNTIME-REPAIR-04`: THE PICKER FAMILY, AND THE CONTROL THAT CAME OFF THE ROW

**2026-09-09, after `REPAIR-03`.** The last coherent surface in the audit's list: the picker's
width and its detail aside (rows 97 and 104), its `Manage` view (row 101), and with `Manage` the
owner's decided-but-unbuilt item from §18.4 — the red `Delete from station` moves OFF THE ROW.

### 21.0 THE MEASUREMENT, AND WHAT IT FALSIFIED

Measured by opening `#template-dialog` in Chromium at 1280 × 800 (`01-template-picker.html`,
`data-start="templates"`), driving the prototype's own `[data-action="manage-library"]`.

- **The picker is the OUTER `.modal` family** — radius 14, `0 30px 100px rgba(0,0,0,.667)`, head
  `22px 26px` on `#172230` with a 42 px emblem, foot 72 px `16px 26px`, button 39 / radius 7,
  primary `#74cdf6`. Not `.settings`, not `.sub-dialog` (§20.2's three families).
- **It wears that family's BASE width**, `min(1120px, 100vw − 56px)` = 1120 here. That is why
  `wide` was never going to reach it: `wide` IS the `.audio-modal`'s 860, and two other dialogs
  wear it. A fifth size (`library`) rather than a wider `wide`.
- 🔴 **THE ASIDE IS NOT WHAT IT WAS EXPECTED TO BE, AND THE REASON IS THE FINDING.** It was
  predicted to be a fixed column of categories or filters. It is neither: measured, it holds
  **zero controls** (`querySelectorAll('button,select,input,a')` → `[]`) and is a READ-OUT OF THE
  SELECTED TEMPLATE — a `Destination` card, a `Selected template` eyebrow, a rendered preview
  with an `ILLUSTRATIVE LAYOUT` watermark, an `h2`, a hint, a `Type · Looks · Text fields ·
Availability` list and a `Compatible with this row` notice. The kind chips the prediction was
  reaching for are `.template-filter`, in the MAIN column, and the app already has them.
- ⚠ **This is NOT the `§1.1 line 72` failure class.** That was a map row asserting a control the
  app does not have; here the aside is real, 342 px, measured, and present. What is wrong is the
  guess about its CONTENTS, and the correction changes what can be adopted rather than whether
  anything can.

### 21.1 🔴 WHY THE ASIDE CANNOT BE TAKEN WHOLE, AND WHAT IT CARRIES INSTEAD

The aside exists to describe a SELECTION. This picker has none: one press on a row IS the load,
and twenty specs drive that contract through `app.loadTemplate`. Adopting the column whole means
adopting select-then-`Load into`, which is a CONTRACT change — the one §15.1 filed to the owner
and did not answer, not a look this session may decide in passing.

So the column is built at the reference's own geometry and carries what this product genuinely
knows while the list is open:

| block            | where it comes from                                                              |
| ---------------- | -------------------------------------------------------------------------------- |
| destination card | the reference's OWN first block, and the only one that does not need a selection |
| the drop zone    | **moved here** — the audit found it below the fold at the foot of the list       |

⭐ **The destination card pays for itself twice.** `Destination · <row>` over
`Operator row · on 1-85` puts the row's operator-facing name and its REAL COORDINATE on the
surface (golden rule 11, and `R-028` — the number is how a layer gets cleared by hand), where
before they were only in the dialog's title. It is also, exactly, what the reference's `Into`
destination select exists to tell the operator — so the select stays argued away (§15.3) while
the fact it carried is now said.

### 21.2 THE `Manage` GATE — COUNTED, AND OPEN

The owner's gate: **≤ 6 new controls AND no data the console does not already hold.**

| control in the reference's `Manage` body | equivalent in the app                                  |
| ---------------------------------------- | ------------------------------------------------------ |
| the `Manage` door                        | **none — NEW (1)**                                     |
| per-row `Delete`                         | exists: `Delete from station`, on the picker row today |
| footer `Back to selection`               | **none — NEW (2)**                                     |

**2 new controls.** Everything else in the body is a thumbnail, a name, a usage line and a
notice — none is a control.

**And no new data.** The reference's `Used by N rows` is
`allChannelRows().filter(r => r.template === t.id).length`. Here the equivalent is the stack
snapshot the layer table already reads: `StackItemState` carries `templateId`, and
`window.cg.stack.snapshot()` is the same call `useStack` makes. Nothing is fetched that the
console did not already have, no schema moves, and nothing is persisted.

⚠ The count is PULLED when the view opens, not subscribed. This hook is mounted by every
`LayerRow`; a subscription here would be thirty of them for a number read while one short-lived
list is on screen — the same reason the template list and the bank are pulled (§15.2).

### 21.3 🔴 THE ONE PLACE THIS DELIBERATELY DOES NOT FOLLOW THE DRAWING

**The reference DISABLES its `Delete` for a template in use.** Measured: all six it ships are
`disabled`, each with `title="Unload this template from all rows before deleting"`, and its
footer says _"Templates in use are protected in this demo."_

**Not adopted, and it is a bucket-A refusal.** A count read from a stack snapshot may not gate a
destructive control's AVAILABILITY: inside the `B-092` bootstrap window that snapshot can
legitimately be `[]`, and a disabled-on-count `Delete` would then refuse a lawful deletion with
nothing the operator could act on. The BRIDGE is the authority — it refuses `in-use`, names the
places, and `B-212` turns each into a remedy with the way there beside it. The count is a line of
information under a name; the refusal is a sentence the operator can do something about.

### 21.4 WHAT THE MOVE CHANGED, AND WHAT IT MAY NOT

`design.md` §18.4, built: a red station-wide deletion repeated down every row of a picker is one
mis-aimed press from deleting a template while something is on air. The reference has no
destructive control on a row at all.

**The route changed. Nothing the deletion decides changed.** Proved by the ten cases of
`templateRemoval.dom.test.ts`, whose diff in this session is ONE ADDED PRESS per case and two
selectors re-pointed at the list that is now on screen — no assertion, no wording, no expectation
about what a deletion does:

| still true after the move                       | where                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| CONFIRMS FIRST, before the bridge is asked      | `templatePicker.manage.dom` §3.3, `removeCalls` empty at the confirm |
| the confirm names the SCOPE and the CASCADE     | `every browser`, `cannot be undone`, `N plate bindings`              |
| the cascade runs only AFTER the bridge said yes | `forgetTemplateAssignments` after `res.ok`                           |
| a refused deletion clears no bindings           | `does NOT delete the assignments when the removal was refused`       |
| the refusal lands IN the dialog, not the toast  | `[data-modal-message]` (A9)                                          |
| `B-212`'s places and their remedies             | `[data-in-use-references]`, moved into the view with the control     |

⚠ `R-013`'s right-click row menu is the LAYER TABLE's, not the picker's, and its `REMOVE` takes a
template off THAT ROW — a different verb, untouched here. The picker's rows never had a menu, so
no menu route to a station-wide deletion was removed, and none is added: `Manage` is the one door.

### 21.5 THE MEASURED COMPARISON

| property             | reference (rendered) | app (after)               | verdict                                                    |
| -------------------- | -------------------- | ------------------------- | ---------------------------------------------------------- |
| frame width          | **1120**             | **1120**                  | **FIXED** (was 860; `prose` 460 → `wide` 720 → 860 → here) |
| layout split         | `776px 342px`        | `776px 342px`             | **FIXED**                                                  |
| aside width          | 342                  | **342**                   | **FIXED**                                                  |
| aside ground         | `#111c28`            | `--r-tpl-aside-bg`        | **FIXED** — adopted under the narrow test (below)          |
| aside inset / rule   | 22, 1 px `--line`    | **22, 1 px `--r-border`** | **FIXED**                                                  |
| aside CONTENTS       | a selection read-out | destination + drop        | **ARGUED (A)** — §21.1, the contract                       |
| `Manage` control     | 69.9 × 33, r7, 13 px | **68.9 × 33, r7, 13 px**  | **FIXED** (the 1 px is the label, not the box)             |
| manage row           | 84, `17px`, gap 12   | **84, `17px`, gap 12**    | **FIXED**                                                  |
| manage row rule      | 1 px `--line`        | **1 px `--r-border`**     | **FIXED**                                                  |
| manage delete BOX    | 33, r7, 13 px        | **33, r7, 13 px**         | **FIXED**                                                  |
| manage delete COLOUR | `quiet`, disabled    | `danger`, pressable       | **ARGUED (A)** — §21.3                                     |
| manage foot primary  | `Back to selection`  | **`Back to selection`**   | **FIXED**                                                  |
| manage foot quiet    | `Import .vcg`        | not offered               | **ARGUED (B)** — below                                     |
| manage replaces list | yes, same frame      | **yes, same frame**       | **FIXED**                                                  |
| `Delete` on a row    | none                 | **none**                  | **FIXED** (§18.4)                                          |

**`Import .vcg` in the management footer — ARGUED, bucket B (the reference is wrong here).** In
the drawing, importing adds to a library and loads nothing — its own footer says
_"Importing does not load a row or take it on air."_, which §15.1 already recorded as FALSE of
this product. Here `Import a .vcg…` RESOLVES THE PICK and loads the package onto the row that
opened the picker. Offering it from a maintenance view would make that view perform a load.

**The narrow stale-hex test, on the one colour this session took.** `#111c28`: **(a)** absent
from the reference's nineteen declared `:root` colours — yes; **(b)** equal to a hex this app
retired in Phase 2 (§7's "was" column) — **no**. It fails (b), so it is ADOPTED, on the same
reading and for the same reason as row 38's `#101722`.

### 21.6 RATIOS — PUBLISHED, AND THE THREE BELOW A FLOOR ARE REPORTED

Measured in Chromium against a fresh build, at 1280 × 800.

| ink / edge                         | on              | ratio     | floor         |
| ---------------------------------- | --------------- | --------- | ------------- |
| destination NAME                   | its card        | **15.52** | AA 4.5 ✅     |
| destination META (row kind, coord) | its card        | **6.31**  | AA 4.5 ✅     |
| drop-zone title                    | the zone        | **17.10** | AA 4.5 ✅     |
| drop-zone sentence                 | the zone        | **6.96**  | AA 4.5 ✅     |
| `Manage` label                     | its fill        | **13.87** | AA 4.5 ✅     |
| the aside's GROUND                 | the dialog's    | 1.01      | — (below 3.0) |
| the aside's RULE                   | the main column | 1.49      | — (below 3.0) |
| the destination card's EDGE        | the aside       | 1.49      | — (below 3.0) |

⚠ **The three low ones are reported, not tuned, and the reference measures the same.** Its
`.template-detail` `#111c28` against `.modal` `#141b25` is 1.01 too — in BOTH trees the column is
separated by its RULE and not by its ground. None of the three identifies a control (WCAG 1.4.11
is about boundaries essential to identifying one); the controls inside the column carry their own
edges. Raising the aside's ground to clear 3.0 against the dialog would make it a second panel
rather than a side of this one, which is a look decision the owner has not asked for.

### 21.7 THE BUDGET

Deltas decided: **19. FIXED 15 · ARGUED 4 = 21 %**, under the quarter. The session does not stop.

| ARGUED                                          | bucket | reason                                                                                                                                                              |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the aside's selection read-out                  | **A**  | it describes a selection the one-press contract does not have; adopting it re-points the contract (§15.1's open question), which is the owner's call and not a look |
| the manage `Delete` stays `danger`, pressable   | **A**  | severity by token; and a count from a snapshot that can be empty (`B-092`) may not gate a destructive control — the bridge decides (§21.3)                          |
| `Import .vcg` in the management footer          | **B**  | the reference's import loads nothing; this one resolves the pick and loads the row — §15.1 already recorded that sentence as false here                             |
| the aside's ground stays 1.01 from the dialog's | **B**  | the reference measures 1.01 too — in both trees the rule separates the column, not the ground                                                                       |

### 21.8 WHAT §0 AND §1 FALSIFIED ABOUT THE PROMPT

Recorded because a prompt that cannot be disproved produces a session that cannot disagree with it.

1. **The aside is not categories or filters** — §21.0. The prediction was wrong and the reason is
   the whole shape of §21.1.
2. **§4's "cheap ~24" is already closed.** The prompt offers it as the session's tail and notes
   only that "the row rule and the header ground are already done". In fact the whole list —
   rows 3, 4, 9, 10, 11, 12, 15, 19, 20, 21, 23, 30, 32, 33, 38, 54, 58, 71, 74, 77, 84, 85, 90,
   92 — was disposed of by `MONITORS-01` §19.5 (13 FIXED, the rest argued, row 11 by
   `AUDIT-CLOSE-01`), and rows 3/4/9/10/20/21/38 were re-decided under the narrow test by
   `REPAIR-03` A1. Nothing of it remained to do, so the budget went to §3.
3. **`git bash` is usable on this host today.** The prompt states it is not. Every command in this
   session ran through it without an msys fault; the standing hazard is real but did not fire, and
   the working rule that survives is the one that actually bit here — see 4.
4. **A `python` patch script that writes with `open(P,'w')` truncates BEFORE it can fail.** One did:
   an emoji written as a surrogate pair raised `UnicodeEncodeError` at encode time and left
   `useTemplatePicker.tsx` at ZERO BYTES. Restored from `HEAD` and re-applied; every patch script
   in this session now encodes first and writes through a temp file. Its sibling: **a quoted bash
   heredoc strips backslashes**, so the two attempts to fix that escape from a heredoc silently
   matched nothing and reported success.

### 21.9 RECORDED, NOT BUILT

- 🔴 **THE ROW HOVER HAS ONLY ONE CHANNEL.** `REPAIR-03` A2 landed it at `#283443`, **1.20:1**,
  capped there by the AA floor on the row's own muted ink (4.61:1), and hover-vs-selected is
  1.04:1 in fill with the 2 px frame (8.55:1) carrying selection. The owner accepts both. The gap
  worth closing is that the hover moves ONE property: **lift the row's own ink one step on hover
  (muted → secondary)**. That channel moves AWAY from the AA floor rather than into it, so the
  constraint that capped the ground does not bind it; and it cannot be confused with the selection
  because the mechanism differs — selection is a frame, this is ink. **Not built here.**
- **The import wizard is not built in the app at all** (audit row 107). It is a FEATURE, not a
  delta: a 748 px dialog with a three-step rail, whose `Review` step is simulated by its own
  disclaimer and whose `Complete` step is false of this product (§15.3). Filed, nothing built.
- Not touched, by the owner's own scope: the 53 px panel bar, the Inspector's spacing gradient,
  the PVW zoom / guides / `ALL LAYERS`, the audit `Date` filter, and the Station-setup rail fills.

## ADDED Requirements

### Requirement: The station's installation-wide settings have ONE home, behind ONE door

The Runtime SHALL present the station's installation-wide settings in one dialog, `Station setup`, opened from exactly one control on the status bar, and SHALL offer no second button that opens the same dialog at a different section.

The deep-link mechanism SHALL remain: a surface that sits beside the thing it configures — the Inspector's delimiter gear, and the Layers panel's empty state — SHALL open Station setup at the matching section, never a second dialog.

A refusal or outcome raised by a section SHALL be shown in the dialog's pinned message region, above that section's own footer.

> ⭐ **`STATION-CHROME-02` §1 (2026-09-07) — ONE DOOR.** There were three: the status bar's
> SETTINGS, the status bar's SOURCES, and the Layers panel's `Configure`. The argument for
> keeping SOURCES was recorded and overruled by the owner — it is the section an operator
> opens most, and three doors into one room is confusion rather than a shortcut. What went is
> the two BUTTONS; the mechanism they used is untouched, which is why the two entry points
> that are genuinely beside their subject still carry it.

> ⚠ **`AUDIT-CLOSE-01` B1 (2026-09-09) — THE DOOR MOVED, THE COUNT DID NOT.** `SETTINGS` and
> `LOG` now stand in the app header, which is where the approved reference draws them and which
> the app did not have until that session. The requirement below is about there being exactly
> ONE door, not about which bar it stands on, so only the surface it names is corrected.

#### Scenario: One settings door, in the app header

- **WHEN** the console renders **THEN** exactly one control in the whole console opens Station setup, it stands in the app header, and there is no `SOURCES` button beside it
- **WHEN** the Layers panel renders with a declared bank **THEN** its bar carries no `Configure` control

#### Scenario: The surviving deep links land on their own tab

- **WHEN** the operator presses the delimiter gear beside a from-file field **THEN** Station setup opens at Text file delimiters
- **WHEN** the Layers list has no declared bank and the operator presses its empty state's control **THEN** Station setup opens at Layers, and that screen's copy names `SETTINGS ▸ Layers` rather than a control that no longer exists

#### Scenario: A request while the dialog is open moves to the new section

- **WHEN** Station setup is open at one section and another entry point is pressed **THEN** the dialog stays the one dialog and the newly requested section is marked and focused

#### Scenario: Any section's refusal reaches the pinned region, named

- **WHEN** a section's action is refused — the bank refusing to untick an occupied row, the catalog refusing an empty name, the raster refused while something is on air **THEN** the refusal is rendered by the shared notice in the pinned region, outside the scrolling body, prefixed with that section's name

### Requirement: Each section states its commit contract, and the footer commits Servers only

Every section of Station setup SHALL carry a legend beside its heading stating how its edits reach the bridge — applied by the footer, applied by a control in the section, saved as you go, or read-only — and each tab's footer SHALL carry that section's commit action and no other's, in sentence case.

A section's stated commit contract SHALL be TRUE OF EVERY CONTROL IN IT: a section holding a control that is applied SHALL NOT say that nothing is waiting to be applied.

The on-air refusal that pre-disables `Apply servers` SHALL name its scope, and no other section SHALL inherit it: the catalog, the delimiters and the candidate layers are not gated on air.

#### Scenario: The on-air block is scoped to Servers

- **WHEN** anything is on air or unsettled **THEN** `Apply servers` is disabled and the pinned region reads that Apply is blocked for Servers and every other section stays editable

#### Scenario: Each tab's footer carries its own commit, in sentence case

- **WHEN** the Servers tab is shown **THEN** its footer holds a `primary`-role `Apply servers`, and no other tab's action
- **WHEN** the Layers tab is shown **THEN** its footer holds `Apply layers`, and no other tab's action
- **WHEN** a read-only or save-as-you-go tab is shown **THEN** its footer holds its commit contract and a single `Close` (amended by `SETTINGS-MATCH-02`, 2026-09-11 — see **One job, one control, one name in the dialog's footer** below)

#### Scenario: The Live sources footer tells the truth about the layer band

- **WHEN** the Live sources tab is shown **THEN** its footer reads that the catalogue saves as you go and that the layer band is applied by the button in its own section, and does NOT read that there is nothing waiting to be applied
- **WHEN** the Text file delimiters tab is shown **THEN** its footer does read that there is nothing waiting to be applied, because that is true of every control in it

> ⚠ **SUPERSEDED by `STATION-CHROME-01` §2/§4 (2026-09-07):** each TAB owns its own
> footer, so the bank commits from its own (`Apply layers`) and the raster is read-only.
> 🔴 **AMENDED AGAIN by `STATION-CHROME-02` §3/§5 (2026-09-07):** the Servers action is
> `Apply servers`, not `APPLY SERVERS` — the modal contract already made a dialog's title
> sentence case and its buttons had never been brought to the same rule, while `Apply layers`
> one tab along was already right. And the Live-sources footer's flat "saved as you go" was
> UNTRUE: the layer band in that same tab is applied by a button, so the footer said what it
> did not mean.
>
> 🔴 **AMENDED A THIRD TIME by `B-240` (2026-09-07), and the three scenarios above were
> left contradicting it until `SETTINGS-DIALOG-01` swept them.** `Cancel` and the per-section
> `Close` were GONE: dismissal was dialog-level (the close affordance, Escape, the backdrop),
> discard is section-level and is called `Revert` on every section that has one, and a
> read-only or save-as-you-go section carried NO footer buttons at all.
>
> 🔴 **AND A FOURTH TIME by `SETTINGS-MATCH-02` (2026-09-11): the `Close` is back, on the
> panes with nothing to commit.** The owner looked at the reference, which draws it on exactly
> those three, and asked for it. `B-240`'s substance is untouched — one name for discard
> (`Revert`), one for commit (`Apply <section>`), never a `Close` beside an `Apply`, and the
> `Close` is the dialog's own dismissal on the dialog's own path. The full rule is stated by
> **One job, one control, one name in the dialog's footer** below, which is the text to read;
> the scenarios above are corrected to agree with it rather than deleted, so the per-tab
> reading stays where a reader looks for it.
>
> ⚠ **Two other copies of the superseded rule were found in the same sweep and corrected:**
> `docs/ui-reference/runtime-redesign/PROMPT.md` §7, whose “everything already decided
> survives” list restated the pre-`B-240` footer rule 6½ hours AFTER the commit that
> replaced it (`95181658`, 2026-09-07 12:53 → `6bb3446b`, 19:32) — a later clock reading, and
> still a stale copy, because that list claims to RESTATE a decision rather than make one.
> Phase 7 read it and implemented `B-240` anyway (`tasks.md` 7.4, `design.md` 14.3's footer
> row), so the build was never in doubt; only the record was.

### Requirement: Station setup's frame does not move as the operator switches section

Station setup SHALL render in a FIXED frame — a declared width and a declared height, clamped to the viewport — so that its edges, and the top edge of its footer, are identical on every tab. Only the section pane SHALL scroll, and a section shorter than the frame SHALL sit at the top of it rather than stretching to fill it.

#### Scenario: The box is the same on every tab

- **WHEN** the operator selects each of the five tabs in turn **THEN** the dialog's bounding box is identical on all five, and the footer's top edge does not move
- **WHEN** the tallest section is shown **THEN** the pane scrolls inside the frame and the rail does not scroll with it
- **WHEN** the shortest section is shown **THEN** its content sits at the top of the pane with empty space below it

### Requirement: One control vocabulary across the settings dialog

The sections of Station setup SHALL be built from shared, tokenised primitives rather than per-section styles: a record list SHALL be a table with column headers, one row height, one cell padding and one hover; a block SHALL be a card with a head, a body and its explanatory sentence as a note under the body; a destructive row action SHALL be a quiet icon control that takes its danger colour on hover only.

A rail item SHALL carry no box at rest, and its selected and hover states SHALL come from the stylesheet rather than from an inline style object.

#### Scenario: A destructive row action is quiet at rest

- **WHEN** the delimiter list, the live-source catalogue or the candidate-layer rows render **THEN** each row's remove control is quiet at rest and reddens only under the pointer, and no row carries a permanently red control

#### Scenario: A visited rail item keeps no box

- **WHEN** the operator selects a rail item and then selects another **THEN** the first item carries no border of its own, in any state
- **WHEN** the rail renders **THEN** its group headings are visibly distinct from the items under them — a different ink, a smaller tracked-out uppercase, and a rule above the group

#### Scenario: Cancel dismisses and commits nothing

- **WHEN** the operator edits the Servers draft and presses Cancel **THEN** nothing is sent to any bridge channel and the dialog closes by the same path as the close affordance and Escape

### Requirement: A destructive act in Station setup asks before it acts, and a refused one says so

Every control in Station setup that destroys or redefines something SHALL either ASK first, naming the fallout in the operator's words, or — where the act is refused — SHALL be unavailable with the reason on it. A refusal that arrives from the bridge SHALL be rendered in the dialog's pinned message region, in the refusal treatment, naming the row and the template.

An act that is refused because something is on air SHALL NOT be offered as a confirmation: the operator is not asked to authorise it. Both the pre-emptive refusal and the message that answers the bridge SHALL read the one exported reason, and the renderer SHALL consult the bridge's published answer rather than re-deriving the rule.

Deleting a bound source SHALL NOT be refused — an installation must be able to retire a live — but SHALL be confirmed, and the confirmation SHALL name every template and plate that would be unassigned, with the count and, for a multi-box template, how many boxes bind it. Editing a bound source SHALL ask the same question, because it redefines what those plates show while removing nothing.

#### Scenario: A row that is on air refuses its remove, and says why

- **WHEN** a candidate-layer row's item is on air **THEN** its remove control is unavailable and carries the canonical on-air reason, and no confirmation is offered
- **WHEN** the bridge refuses a remove that was nevertheless attempted **THEN** the dialog's pinned region shows that same reason in the refusal treatment, naming the row and the template, and never in a transient surface outside the dialog
- **WHEN** an item's air state cannot be verified **THEN** the act is confirmed rather than refused, and the confirmation says the item may be on air

#### Scenario: Deleting a source names what goes with it

- **WHEN** the operator presses the bin on a source bound to three plates of a four-box template and one plate of another **THEN** a confirmation names both templates, says how many boxes the multi-box one binds, and states that anything already on air stays up and the next take is refused until a source is assigned
- **WHEN** the operator presses the bin on a source bound to nothing **THEN** a plain confirmation is still shown
- **WHEN** the operator declines **THEN** nothing is sent to the sources channel

#### Scenario: Editing a bound source asks, and editing an unbound one does not

- **WHEN** the operator saves an edit to a source that plates are bound to **THEN** a confirmation names those templates and plates before anything is sent
- **WHEN** the source is bound to nothing, or the operator is ADDING a source **THEN** no question is asked

#### Scenario: A dropped binding is visible, not blank

- **WHEN** a source is deleted and a template's plate was bound to it **THEN** that plate reads as needing a source in the Inspector, and a take of that template is refused with the existing live-source-unassigned reason

### Requirement: One job, one control, one name in the dialog's footer

A section's footer SHALL carry that section's own actions and no others. Discard SHALL be section-level, SHALL be called `Revert` on every section that has one, and SHALL be offered only when that section holds unapplied changes, read from the same condition the rail's marker reads. Commit SHALL be `Apply <section>` in sentence case. A section with nothing to commit SHALL carry a single `Close`, which dismisses the dialog and commits nothing; a section WITH a commit SHALL NOT carry one.

> 🔴 **AMENDED by `SETTINGS-MATCH-02` (2026-09-11).** This requirement read _"Dismissal SHALL be
> dialog-level … and SHALL NOT appear in any section's footer. A read-only or save-as-you-go
> section SHALL carry no footer buttons at all."_ The owner has looked at the reference — which
> draws `Close` on Channel, Live sources and Text delimiters — and asked for it back.
>
> **What `B-240` was protecting is unchanged, and that is why the amendment is safe rather than a
> reversal.** Its defect was THREE answers for one job and TWO names for one act. The `Close` that
> returns is neither: it routes through the dialog's own dismissal, so it asks the same question
> before dropping a draft in another tab; it never sits beside an `Apply`, which was the
> configuration that made "which of these am I pressing?" a real question; and discard is still
> `Revert` and only `Revert`. `sections.ts`'s `commits` column is where the rule is written down.

Dismissing the dialog while any section holds unapplied changes SHALL ask first, naming those sections.

The footer's standing sentence SHALL state that section's commit contract and SHALL be presented as a LABEL, distinguishable by treatment from an event message, which appears in the pinned region and is absent at rest.

#### Scenario: The footer offers one name per job

- **WHEN** any tab is shown **THEN** its footer carries no control named `Cancel`
- **WHEN** a read-only or save-as-you-go tab is shown **THEN** its footer carries a single `Close` beside its contract, and no commit
- **WHEN** a tab WITH a commit is shown **THEN** its footer carries no `Close`
- **WHEN** the operator presses that `Close` while another section holds unapplied changes **THEN** the same question is asked as for the close affordance
- **WHEN** a section holds unapplied changes **THEN** its footer offers `Revert`, and the rail marks the same section

#### Scenario: Leaving with unapplied changes asks

- **WHEN** the operator dismisses the dialog while a section holds unapplied changes **THEN** a confirmation names that section and the dialog stays open until it is answered
- **WHEN** nothing is unapplied **THEN** the dialog closes without a question

#### Scenario: The contract stands and the event appears

- **WHEN** nothing has happened **THEN** every tab shows its commit contract and the pinned message region is absent
- **WHEN** a refusal arrives **THEN** the contract is unchanged and the refusal appears beside it, outside the footer, in the refusal treatment

### Requirement: The channel raster is set from Station setup, through the bridge alone

Station setup SHALL offer, for each channel the install declares, its configured raster as editable width and height, what the server reports for that channel, the canonical raster verdict, and a per-channel control that sends `channelSettings.set` with the typed raster. The section SHALL add no second writer and no second guard: an accepted change is reported as a notice and a refusal is shown with the rule for the bridge's reason and the bridge's own message.

> 🔴 **SUPERSEDED by `STATION-CHROME-01` §4 (2026-09-07): the raster is REPORTED, not set.**
> The configured value reaches AIR (the bridge appends it to the served URL as `?cw=&ch=`),
> the served page can already derive it from CEF's own viewport, and the console can already
> derive it from `INFO <channel>`. No case was found where a typed raster is more correct than
> what the channel reports about itself, so the control went and `channelSettings.set` has no
> renderer call site again. See `ChannelSection.tsx`.
>
> ✅ **AND THE GAP THAT LEFT IS CLOSED — `B-236` (2026-09-07).** Removing the last writer left
> the stored raster defaulting to 1920×1080 with nothing able to change it, so an install whose
> channel is not 1080 carried a standing mismatch with no in-console remedy: a claim with no
> author. The bridge is the writer now — `ChannelSettingsStore.adoptObserved` replaces the
> stored raster with `observed` on a `mismatch` whose mode was READABLE, persists it, and sends
> NOTHING to CasparCG. `unreadable` never adopts, and adoption is declined while anything is on
> air. The section stays read-only; what changed is who corrects the value, not who displays it.
>
> ⚠ The note sits BELOW the requirement sentence on purpose: `openspec validate --strict`
> reads only a requirement's FIRST line looking for `SHALL`, so a block quote above it fails
> the change.

#### Scenario: A raster is set and is durable

- **WHEN** the operator types 1280 × 720 for channel 1 and presses its Set control **THEN** `channelSettings.set` is sent with `{ channel: 1, raster: { width: 1280, height: 720 } }`, the region reads that channel 1's raster was set, and reopening the dialog shows 1280 × 720

#### Scenario: A mismatch is said from the canonical verdict

- **WHEN** the configured raster and the server's reported mode disagree **THEN** the section reads MISMATCH for that channel, and when they agree it reads that they agree; an unreadable mode reads as a check that cannot be made, never as agreement

#### Scenario: The bridge's on-air refusal reaches the operator

- **WHEN** anything is on air and the operator presses Set **THEN** the bridge refuses with `on-air-block` and the region shows the rule that the raster cannot change while anything is on air together with the bridge's own count, and the dialog stays open with the draft intact

#### Scenario: A malformed raster never reaches the wire

- **WHEN** a width or height is not a whole number between 1 and the schema's maximum **THEN** the section refuses locally and `channelSettings.set` is not sent

### Requirement: The reserved and live layers are shown read-only, with their source named

Station setup SHALL show the reserved playout layers per channel as ranges and the live-layer ledger's seated coordinates, name the CLI flag and the file each is declared or persisted by, state that they are changed at bridge start and not here, and say what the console cannot see. The section SHALL render no input and no button.

#### Scenario: Reserved layers are listed as ranges, read-only

- **WHEN** the bridge declares layers 60–69 and 105 on channel 1 **THEN** the section reads `Channel 1: 60–69, 105`, names `--reserved-layers` and `bridge-reserved-layers.json`, and offers no control

#### Scenario: The ledger is listed by coordinate and admits what is unknown

- **WHEN** the bridge has seated layers 1-12 and 1-13 **THEN** the section lists them by coordinate, names `bridge-live-layers.json`, `--live-layers-path` and `--no-live-layers`, states that the console cannot see which is in force, and names no row

### Requirement: Six settings stay where the operator reaches them today

Station setup SHALL NOT host the operator name, the lock PIN, the panel layout or Inspector overlay, per-plate audio, the per-row source override, the on-air position, the plate→source assignments, or the stack. Each SHALL remain reachable from its current surface, and Station setup SHALL render no second control for any of them.

#### Scenario: Each of the six is still where it was, and not in Station setup

- **WHEN** the Audit panel opens **THEN** the operator-name field is there beside its self-declared caveat, and Station setup has no such field
- **WHEN** the status bar renders unlocked **THEN** the lock control is one press away, and Station setup has none
- **WHEN** the shell renders **THEN** its resize dividers and layout reset are there, and Station setup has none
- **WHEN** a row renders **THEN** its audio and source-override dialogs and the Inspector's position control are reachable from it, and Station setup has none
- **WHEN** the Inspector shows a plate-bearing template **THEN** its plate pickers are there, and Station setup has none and never writes the assignments channel
- **WHEN** Station setup renders **THEN** it contains no layer row

### Requirement: A settings move changes no persisted key or file

The set of persisted keys and files the Runtime and the bridge spell — browser storage keys, the IndexedDB database, the OPFS workspace, and every file under the bridge's config directory and templates directory — SHALL be derivable from the tree and SHALL be identical before and after Station setup.

#### Scenario: The two inventories are identical

- **WHEN** the persisted-key census runs over `apps/runtime/src` and the persisted-file census over `tools/caspar-bridge/src` and `bin` **THEN** each equals the inventory recorded at the head this change was built on, and Station setup's own source spells no persisted key

### Requirement: The template registry admits only its own records

The bridge's template registry SHALL load, from its persist directory, only files whose name matches the shape the registry itself writes, and SHALL neither load nor warn about any other file there. A record that matches the shape and is unusable SHALL still be warned about with the existing re-import message.

#### Scenario: Sibling config files beside the templates are not templates

- **WHEN** `delimiters.json` and `channel-settings.json` are written into the templates directory by their own stores **THEN** a registry boot loads zero templates, skips zero, and prints no template warning

#### Scenario: A genuinely corrupt record still warns

- **WHEN** a file named as the registry names its records holds an unusable body **THEN** the boot skips it and prints the re-import warning

## ADDED Requirements

### Requirement: The station's installation-wide settings have ONE home, opened at a section

The Runtime SHALL present the station's installation-wide settings in one dialog, `Station setup`, whose sections all render at once — the CasparCG servers, the program outputs, the channel raster, the live-source catalog, the text-file delimiters, the candidate-layer bank, and the reserved and live layers — and every surface that used to open one of those settings SHALL open this dialog at the matching section, never a second dialog.

A refusal or outcome raised by any section SHALL be shown in the dialog's pinned message region, prefixed with the section's name, so it is visible without hunting for the section that raised it.

#### Scenario: SERVERS and SOURCES open the same dialog at different sections

- **WHEN** the operator presses SERVERS on the status bar **THEN** Station setup opens with the Servers section marked as requested and focused
- **WHEN** the operator presses SOURCES on the status bar **THEN** the same dialog opens with the Live sources section marked as requested, focused and in view, and no second dialog exists

#### Scenario: Configure and the delimiter gear deep-link

- **WHEN** the operator presses Configure in the Layers panel **THEN** Station setup opens at Candidate layers
- **WHEN** the operator presses the delimiter gear beside a from-file field **THEN** Station setup opens at Text file delimiters

#### Scenario: A request while the dialog is open moves to the new section

- **WHEN** Station setup is open at one section and another entry point is pressed **THEN** the dialog stays the one dialog and the newly requested section is marked and focused

#### Scenario: Any section's refusal reaches the pinned region, named

- **WHEN** a section's action is refused — the bank refusing to untick an occupied row, the catalog refusing an empty name, the raster refused while something is on air **THEN** the refusal is rendered by the shared notice in the pinned region, outside the scrolling body, prefixed with that section's name

### Requirement: Each section states its commit contract, and the footer commits Servers only

Every section of Station setup SHALL carry a legend beside its heading stating how its edits reach the bridge — applied by the footer, applied by a control in the section, saved as you go, or read-only — and the dialog's footer SHALL carry exactly two actions: a `cancel`-role dismissal and a `primary`-role `APPLY SERVERS` that commits the Servers section alone.

The on-air refusal that pre-disables `APPLY SERVERS` SHALL name its scope, and no other section SHALL inherit it: the raster's refusal is the bridge's own, surfaced; the catalog, the delimiters and the candidate layers are not gated on air.

#### Scenario: The on-air block is scoped to Servers

- **WHEN** anything is on air or unsettled **THEN** `APPLY SERVERS` is disabled and the pinned region reads that Apply is blocked for Servers and every other section stays editable

#### Scenario: Sections that commit from the body grow no footer action

- **WHEN** Station setup renders **THEN** the footer holds `Cancel` and `APPLY SERVERS` only, the candidate-layer section carries its own `Apply candidate layers`, the raster section carries its own per-channel `Set raster`, and the Live sources and Text file delimiters sections read `Saves as you go`

#### Scenario: Cancel dismisses and commits nothing

- **WHEN** the operator edits the Servers draft and presses Cancel **THEN** nothing is sent to any bridge channel and the dialog closes by the same path as the close affordance and Escape

### Requirement: The channel raster is set from Station setup, through the bridge alone

Station setup SHALL offer, for each channel the install declares, its configured raster as editable width and height, what the server reports for that channel, the canonical raster verdict, and a per-channel control that sends `channelSettings.set` with the typed raster. The section SHALL add no second writer and no second guard: an accepted change is reported as a notice and a refusal is shown with the rule for the bridge's reason and the bridge's own message.

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

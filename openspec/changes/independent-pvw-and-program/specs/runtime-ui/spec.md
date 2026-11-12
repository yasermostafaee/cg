## ADDED Requirements

### Requirement: A layer can be on PVW and on air at the same time

On a capable Bridge, CG Control SHALL make the ON PVW and Play controls independent. A row's pending Inspector values SHALL render in its browser PVW without modifying programme output. Play SHALL take the last applied values. Update on air SHALL commit the staged values to the active output, and off-air Update SHALL save them for a later Take without putting the row on air.

#### Scenario: Preview a row that is on air

- **WHEN** a bound row is on air and the operator clicks ON PVW
- **THEN** its preview opens, Play remains active, and programme continues unchanged

#### Scenario: Stage an edit and apply only on request

- **WHEN** the operator edits an Inspector value with the row on PVW
- **THEN** the preview renders the draft immediately
- **AND** the programme keeps its applied value until Update on air

#### Scenario: Take a row with a draft in PVW

- **WHEN** the operator presses Play while the row is on PVW and its Inspector has unapplied edits
- **THEN** Take uses the applied fields and the draft stays visible in PVW

#### Scenario: Move an eligible layer in Preview and Program

- **WHEN** Bridge confirms that the resident page supports live Position **THEN** its anchor and offsets are editable while on air
- **WHEN** the operator edits Position **THEN** PVW follows the draft and programme keeps the applied position until Update on air
- **WHEN** Bridge has no confirmed in-place position capability **THEN** Position remains locked while the layer is on air

#### Scenario: Reset Position to the template's authored placement

- **WHEN** the operator presses Reset to default in the editable Position section
- **THEN** the authored anchor and both offsets are staged and PVW follows immediately
- **AND** Update or Update on air applies the reset, and Discard returns to the applied placement
- **WHEN** Position is locked **THEN** Reset to default is unavailable

### Requirement: Every retained template on PVW has a local placement outline

CG Control SHALL show a labelled outline for each ON PVW template with a renderable retained page.
It SHALL use the page's laid-out visual element boxes and fall back to the authored stage footprint
when no such boxes are available. The outline SHALL follow the page's position in the channel raster.
It SHALL remain visible when Preview transport is stopped. The same labels SHALL identify rows
whose outlines coincide.

#### Scenario: Outline a stopped Preview

- **WHEN** two templates are put ON PVW before Preview Play
- **THEN** each template has an outline at its own page placement
- **AND** the Preview page remains pending until Play
- **WHEN** Preview stops **THEN** the outlines remain while those rows stay ON PVW
- **WHEN** a row leaves PVW **THEN** its outline is removed

#### Scenario: Drag a template to draft its Position

- **GIVEN** the **Move template** tool starts off and the template outlines are visible
- **WHEN** the operator drags with **Move template** off **THEN** Position stays unchanged
- **WHEN** the operator enables **Move template** and drags an editable template or its label in PVW
- **THEN** its row is selected and the drag is staged in the existing Inspector Position draft
- **AND** the template outline and preview follow the move, scaled to the channel raster
- **AND** the applied position and playout commands stay unchanged until Update or Update on air
- **WHEN** the operator switches **Move template** off or switches to **Crop input** or **Edit frames** **THEN** the outlines and completed Position drafts remain and further template dragging is unavailable
- **WHEN** a row's Position is locked **THEN** its outline remains visible and its position gesture is unavailable

### Requirement: The Layers toolbar offers Stop All and Clear All

The Layers table SHALL put ON PVW before Play in the heading and row controls. It SHALL offer Stop All and Clear All in the toolbar and Remove on each eligible row. It SHALL have no Remove All control.

#### Scenario: Find the preview and programme actions

- **WHEN** the operator opens Layers **THEN** ON PVW precedes Play and both actions align to their headings
- **AND** the toolbar offers Stop All and Clear All and an eligible row retains its Remove action

## MODIFIED Requirements

### Requirement: Server settings panel and Remove-All

The Runtime UI SHALL provide a server settings panel (opened from the status
bar) that edits the CasparCG connection: primary host / AMCP port / OSC port,
an optional backup section (add/remove backup), the redundancy strategy, and
the auto-failover toggle. The panel SHALL load the current values from the
bridge, refresh when any client applies a new config, validate its inputs
(non-empty host, integer ports in range) before submitting, and apply via
`connections.set-config`.

Apply SHALL be pre-disabled with a visible reason while the stack indicates
anything on air or unsettled (mirroring the bridge's authoritative gate), and
the panel SHALL surface the bridge's refusal reason when a race slips
through. WHEN any entered host is non-loopback the panel SHALL show a warning
that template serving and OSC listening will use a LAN address while control
stays on `127.0.0.1`, and SHALL confirm the actual exposure from the apply
response.

The Layers toolbar SHALL provide Clear All to cut the selected channel without removing its bound rows.

#### Scenario: Apply is gated on air with the reason shown

- **WHEN** any stack item is on air or unsettled **THEN** the panel's Apply
  is disabled and shows why (clear first)
- **WHEN** the stack is clear **THEN** Apply is enabled and submits the
  edited config

#### Scenario: Remote host shows the exposure warning

- **WHEN** the operator enters a non-loopback primary or backup host **THEN**
  the panel warns about LAN exposure of template serve + OSC (control stays
  loopback) before Apply, and reports the confirmed exposure after

#### Scenario: Clear All keeps the rows bound

- **WHEN** the operator confirms Clear All **THEN** the selected channel is cleared and its rows stay bound.

### Requirement: Selecting a channel switches the whole console to it

The console SHALL, on a station that declares two or more channels, show and send everything that belongs to a channel for the channel selected on the strip: the layers table's rows and their names, the Inspector's selection, both monitors, the live plates, the playout rows, the bulk verbs' scope — CLEAR ALL and STOP ALL each act on that channel's items and are sent carrying it — and PANIC. A gate about the whole station SHALL keep reading every channel: the Servers Apply stays blocked while anything is on air or unsettled on any channel, because a server change reaches all of them. The selection SHALL be a channel id held for the session only and written nowhere; the console SHALL open, and a reload SHALL reopen, on the lowest declared channel. With one declared channel every verb SHALL be sent exactly as before — bare — and nothing SHALL be filtered.

#### Scenario: A switch moves the table and both monitors

- **GIVEN** two declared channels, and row 84 named on channel 2 only
- **WHEN** the operator selects channel 2 **THEN** the table's rows are channel 2's, row 84 carries channel 2's name, both monitors read `CH 2`, and the bulk scope reads `CH 2` **AND WHEN** channel 1 is selected again **THEN** all of them are channel 1's

#### Scenario: The Inspector is the channel's too

- **WHEN** a channel-1 row is selected and the operator switches to channel 2 **THEN** the Inspector does not edit the channel-1 row under channel 2's tab

#### Scenario: A bulk verb names the channel on screen

- **WHEN** CLEAR ALL is confirmed on channel 2's view **THEN** exactly one `stack.clear-all` carrying channel 2 is sent, and channel 1's row stays on air **AND** the same press on channel 1's view names channel 1

#### Scenario: A reload opens on the first declared channel

- **WHEN** the operator has chosen channel 2 and the console reloads **THEN** it opens on the lowest declared channel, and the choice was written to no storage
- **WHEN** the station declares channels 2 and 3 **THEN** the console opens on channel 2

#### Scenario: One declared channel is exactly as before

- **WHEN** one channel is declared and CLEAR ALL is confirmed **THEN** `stack.clear-all` is sent with no argument

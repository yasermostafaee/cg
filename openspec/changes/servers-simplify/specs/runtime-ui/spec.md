## MODIFIED Requirements

### Requirement: Station setup shows the Playout and its connection check

Station setup SHALL show, on its Connection tab, the APASAI Playout Engine address as a fact (`host : port`)
with a CHECK that runs the connection check, and where this console reaches CG Bridge as a fact with where it is — `On the Playout
machine` or `Separate server`. Each address SHALL have a CHANGE that exists only inside CG Control and only for a
station admin. An address SHALL be edited as a `Host` and a `Port` whose defaults are their placeholders — the
Playout's port `8080`, CG Bridge's host the Playout's and its port `5280` — an empty field SHALL mean the default,
and a whole address pasted into a `Host` SHALL fill both of its fields. `Connect` SHALL be offered as soon as a field
says something other than the station as it is, beside the fact `Not connected yet`; it SHALL run the check where
the fields resolve and SHALL save only where CG Bridge answers there. The open edit SHALL survive a tab switch, SHALL
mark the tab in the rail, and SHALL be discarded by closing the dialog or by `Revert`.

#### Scenario: Outside CG Control

- **WHEN** the console runs in a browser **THEN** there is no CHANGE control at all

#### Scenario: The addresses as facts

- **WHEN** a station admin opens the Connection tab **THEN** the card reads the Playout as `192.168.21.32 : 8080`
  and CG Bridge as `192.168.21.32 : 5280`, `On the Playout machine`

#### Scenario: A typed address survives a tab switch

- **WHEN** a CG Bridge address is typed and the tab is changed and changed back **THEN** the field still holds it,
  `Not connected yet` shows and the rail marks the tab **AND** closing the dialog discards it

#### Scenario: Connect saves only where CG Bridge answers

- **WHEN** `Connect` is pressed and nothing answers where the fields resolve **THEN** nothing is saved and the
  check's CG Bridge line names where **AND** where CG Bridge answers, the fields are saved as they are

### Requirement: A Station setup pane shows values to a principal who cannot apply them

Every Station setup pane whose apply route is `station-admin` — Connection, Channel, Live sources, Text file delimiters and Layers — SHALL show a principal who is not a station-admin the values in force as values: no field, no switch, no Add, Edit, Remove or Reset, no Apply and no Revert, and no standing notice about when Apply is available. Such a pane's legend and footer SHALL say it is read-only for this sign-in; the Channel pane, whose one control is a station-admin's, keeps its own read-only legend. A station-admin SHALL see the inputs and Apply exactly as before. A row's own Remove in the Layers table is an operator verb and SHALL follow the operator's permission, not this rule.

#### Scenario: An operator sees values, and a station-admin sees inputs

- **WHEN** an operator opens Connection, Live sources, Text file delimiters or Layers **THEN** each shows its values with no input, no Apply and no Revert **AND** a station-admin opening the same pane sees its inputs and its Apply

#### Scenario: Layers, the owner's case

- **WHEN** an operator opens Layers **THEN** each row reads Shown or Hidden and its name as text, and there is no switch, no name field, no `Apply layers` and no `Revert`

## ADDED Requirements

### Requirement: A Station setup draft SHALL never cross to another CG Bridge

When the link comes back while Station setup is open, the console SHALL read the connection configuration and the
serve state again. On another CG Bridge every field SHALL read what that CG Bridge holds, and no draft typed
against the first SHALL remain. On the same CG Bridge a draft being typed SHALL stand unless what is stored there
changed meanwhile.

#### Scenario: Re-pointed with the dialog open

- **WHEN** the dialog is open on CG Bridge X with a draft and the console is re-pointed at Y **THEN** every field
  reads Y, the rail is quiet, and `Apply servers` sends nothing of X

#### Scenario: A blink of the link

- **WHEN** the link drops and comes back to the same CG Bridge **THEN** the draft being typed stands

### Requirement: Station setup SHALL name each engine for its station mode

In a Playout station whose CG Bridge advertises `auth: playout`, the engine cards SHALL be named
`APASAI Playout Engine A` and `APASAI Playout Engine B · backup`. First-run engine fields, the rail's foot,
connection checks and operator diagnostics that name the engine SHALL use `APASAI Playout Engine`. An existing
standalone station SHALL name its engine `CasparCG`. The redundancy role (`Primary A`) SHALL stay in the status
bar and the dialog's subtitle. In a Playout station, A's placement, stored host, ports and state SHALL appear as
read-only facts. B SHALL stay addable and editable by a station admin. Every port's default SHALL be its field's
placeholder, including in the Add backup dialog. AMCP defaults to `5250`, OSC to `6251` for A and `6252` for B.
An empty port field SHALL apply its default.

#### Scenario: A Playout station

- **WHEN** a station admin opens the Connection tab of a Playout station **THEN** `APASAI Playout Engine A`
  reads `On the Playout machine`, `127.0.0.1`, `5250`, `6251` and its state as facts **AND** `Add backup` is offered

#### Scenario: Defaults as placeholders

- **WHEN** a station has no Playout and its server A is on the default ports **THEN** both port fields are empty
  with `5250` and `6251` as placeholders **AND** applying sends `5250` and `6251`

### Requirement: The graphics address SHALL sit behind Advanced, named for what it is

Station setup SHALL show the graphics address under `Advanced`, collapsed in a Playout station and open
otherwise. Its title SHALL be `Where APASAI Playout Engine fetches graphics` in a Playout station and
`Where CasparCG fetches graphics` in a standalone station. The address SHALL show a `Host` and a `Port` with
the placeholders `Detect automatically` and `Assign automatically`. The candidate addresses SHALL be labelled
as CG Bridge's machine's, none marked as the answer, and no sentence on the tab SHALL call CG Bridge's machine
"this machine".
When CG Bridge reports that the graphics host in force names another machine, the connection check SHALL carry a
failed line naming that host, and for a station admin SHALL offer `Detect automatically`, which clears the field
and opens `Advanced`; `Apply servers` commits it, as every edit on the tab.

#### Scenario: The owner's `.32` serving from `.93`

- **WHEN** CG Bridge reports the graphics host `192.168.21.93` as another machine on a Playout station **THEN**
  the failed check names the APASAI Playout Engine and the other machine's address **AND**
  `Detect automatically` empties the field and opens `Advanced`

#### Scenario: Collapsed in a Playout station

- **WHEN** the Connection tab of a Playout station opens **THEN** `Advanced` is collapsed **AND** with no Playout it
  is open

### Requirement: Station setup SHALL report whether engine A joins the Playout's, and offer the derived host

Station setup's check of the station's own Playout SHALL send the configured server A host as `casparHost`, once
the configuration is read. When CG Bridge answers whether server A joins the Playout's, the check SHALL carry an
`After sign-in` line: a pass naming the host, or a failure naming both hosts and the cost (`meters, sources and
grants are dropped.`). While it fails, the `APASAI Playout Engine A` card SHALL offer a station admin
`Use the Playout's`, which writes the host CG Bridge derived through `connections.set-config` and asks the check again; it SHALL be unavailable
while anything is on air, as `Apply servers` is. An engine card whose fields differ from what is in force SHALL
read `Not applied`.

#### Scenario: The owner's state

- **WHEN** server A is `192.168.21.93` and the Playout names `127.0.0.1` on a CG Bridge on the Playout's machine
  **THEN** the failed check names APASAI Playout Engine A, both hosts and the loss of meters, sources and grants
  **AND** `Use the Playout's` sets server A to `127.0.0.1` **AND** the meter returns

#### Scenario: A separate server

- **WHEN** CG Bridge sits on a separate server whose Playout is `192.168.21.32` and server A is `127.0.0.1` **THEN**
  the line fails naming `192.168.21.32` **AND** `Use the Playout's` sets server A to `192.168.21.32`

#### Scenario: On air

- **WHEN** anything is on air **THEN** `Use the Playout's` is unavailable **AND** a backup added in the draft reads
  `Not applied` **AND** nothing is sent

### Requirement: CG Control enrolls Playout stations and maintains saved standalone stations

Fresh installed CG Control setup SHALL present only the APASAI Playout Engine address and its CG Bridge connection
fields. A saved standalone station record SHALL continue to open using its loopback Bridge address, verify the
Bridge's standalone capability and connect without Playout sign-in or a Playout token. Reading
that record SHALL preserve its stored mode and address. Connection SHALL label the existing standalone
connection `CG Bridge` and retain local Bridge address editing and the editable CasparCG A host, AMCP port and OSC
port. It SHALL save a local Bridge address edit after the Bridge confirms standalone capability and answers the
dedicated check. The check SHALL report the configured CasparCG endpoint's AMCP status independently.

#### Scenario: First setup with no saved station

- **WHEN** CG Control opens with no saved station record
- **THEN** the address gate offers the APASAI Playout Engine connection as its only enrollment flow

#### Scenario: Reopen a saved standalone station

- **WHEN** a saved standalone station's local Bridge positively confirms its standalone mode
- **THEN** CG Control opens the saved station without Playout sign-in or credentials
- **AND** Connection shows `CG Bridge` with the local connection and the CasparCG endpoint available for maintenance

#### Scenario: A standalone address edit fails validation

- **WHEN** a standalone station's address edit names a remote Bridge, or the local Bridge lacks the required
  capability or cannot answer the dedicated check
- **THEN** the saved mode and address remain in force

#### Scenario: CasparCG reports fewer channels than the standalone station configured

- **WHEN** the standalone Bridge reports its verified running CasparCG channels
- **THEN** the workspace switcher offers the configured channels that are running
- **AND** if no configured channel is running, a configured channel remains visible as unavailable for diagnosis and repair

#### Scenario: Explicitly set up again

- **WHEN** an operator connected to a saved standalone station chooses `Set up again` in Connection
- **THEN** the console returns to ordinary APASAI Playout Engine enrollment

#### Scenario: Reopen an existing Playout station

- **WHEN** an existing station record has a Playout address and no mode
- **THEN** CG Control uses its saved Playout and Bridge settings with the existing sign-in and permission flow

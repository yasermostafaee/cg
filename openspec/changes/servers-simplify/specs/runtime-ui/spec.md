## MODIFIED Requirements

### Requirement: Station setup shows the Playout and its connection check

Station setup SHALL show, on its Connection tab, the Playout's address as a fact (`host : port`) with a CHECK that
runs the connection check, and where this console reaches CG Bridge as a fact with where it is — `On the Playout
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

### Requirement: Station setup SHALL name the CasparCG engines, and in a Playout station SHALL show CasparCG A as a fact

Station setup's server cards SHALL be named `CasparCG A` and `CasparCG B · backup`, and the rail's foot SHALL name
`CasparCG`; the redundancy role (`Primary A`) SHALL stay in the status bar and the dialog's subtitle. In a Playout
station — one whose CG Bridge advertises `auth: playout` — CasparCG A SHALL NOT be typed by anyone: its card SHALL
read `On the Playout machine`, its host as stored, its ports and its state, as facts. CasparCG B SHALL stay addable
and editable by a station admin. Every port's default SHALL be its field's placeholder — AMCP `5250`, OSC `6251` for
A and `6252` for B, in the Add backup dialog too — and an empty port field SHALL be applied as its default.

#### Scenario: A Playout station

- **WHEN** a station admin opens the Connection tab of a Playout station **THEN** `CasparCG A` reads `On the
Playout machine`, `127.0.0.1`, `5250`, `6251` and its state, with nothing to type **AND** `Add backup` is offered

#### Scenario: Defaults as placeholders

- **WHEN** a station has no Playout and its server A is on the default ports **THEN** both port fields are empty
  with `5250` and `6251` as placeholders **AND** applying sends `5250` and `6251`

### Requirement: The graphics address SHALL sit behind Advanced, named for what it is

Station setup SHALL show the address CasparCG fetches graphics from under `Advanced` — collapsed in a Playout
station, open otherwise — titled `Where CasparCG fetches graphics`, as a `Host` and a `Port` with the placeholders
`Detect automatically` and `Assign automatically`. The candidate addresses SHALL be labelled as CG Bridge's
machine's, none marked as the answer, and no sentence on the tab SHALL call CG Bridge's machine "this machine".
When CG Bridge reports that the graphics host in force names another machine, the connection check SHALL carry a
failed line naming that host, and for a station admin SHALL offer `Detect automatically`, which clears the field
and opens `Advanced`; `Apply servers` commits it, as every edit on the tab.

#### Scenario: The owner's `.32` serving from `.93`

- **WHEN** CG Bridge reports the graphics host `192.168.21.93` as another machine **THEN** the check reads `CasparCG
would fetch graphics from 192.168.21.93, another machine than CG Bridge's.` as a failure **AND** `Detect
automatically` empties the field and opens `Advanced`

#### Scenario: Collapsed in a Playout station

- **WHEN** the Connection tab of a Playout station opens **THEN** `Advanced` is collapsed **AND** with no Playout it
  is open

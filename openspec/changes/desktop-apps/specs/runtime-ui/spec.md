## ADDED Requirements

### Requirement: An installed station walks through first-run on one screen

The console SHALL show first-run, in place of the sign-in gate, while the bridge advertises a
first-run phase: the Playout's address and the connection check; a sign-in; the Playout's channels
in that account's grant, grouped by host when there is more than one; and the detected serve
address — and SHALL then write the CasparCG host and the channel through the existing doors. If the
Playout's list never arrives it SHALL offer the CasparCG host, prefilled with the Playout's host,
and the channel. It SHALL carry no explanatory prose and no way out.

#### Scenario: First-run end to end

- **WHEN** the address is checked and connected **THEN** only the address is written
- **WHEN** an operator signs in before adoption **THEN** the bridge's "not set up yet" sentence shows
- **WHEN** a station-admin signs in and picks a channel **THEN** the station's connection and bank
  are written **AND** first-run ends

### Requirement: Station setup shows the Playout and its connection check

Station setup SHALL show, under Servers, the Playout's address as a fact with a CHECK that runs the
connection check, and a CHANGE that exists only inside CG Control and only for a station admin.

#### Scenario: Outside CG Control

- **WHEN** the console runs in a browser **THEN** there is no CHANGE control at all

### Requirement: The console renders Persian from its own fonts

The console SHALL load its UI fonts from its own origin and SHALL make no font or stylesheet request
to any other host.

#### Scenario: A LAN-only machine

- **WHEN** every other host is unreachable **THEN** no font request leaves the machine **AND** the
  Arabic-range Vazirmatn face is loaded

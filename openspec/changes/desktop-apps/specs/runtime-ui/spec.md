## ADDED Requirements

### Requirement: An installed station walks through first-run on one screen

The console SHALL show first-run, in place of the sign-in gate, while the bridge advertises a
first-run phase: the Playout's address and the connection check, whose AMCP line waits; a sign-in;
the connection check again, now judging AMCP (`DESKTOP-APPS-01-B`); the Playout's channels in that
account's grant, grouped by host when there is more than one; and the detected serve address — and
SHALL then write the CasparCG host and the channel through the existing doors. If the Playout's list
never arrives it SHALL offer the CasparCG host, prefilled with the Playout's host, and the channel.
It SHALL carry no explanatory prose and no way out.

#### Scenario: First-run end to end

- **WHEN** the address is checked **THEN** the AMCP line says "waiting for sign-in", neutral
- **WHEN** the address is connected **THEN** only the address is written
- **WHEN** an operator signs in before adoption **THEN** the bridge's "not set up yet" sentence shows
  **AND** AMCP still waits
- **WHEN** a station-admin signs in **THEN** the AMCP line turns OK **AND** only then do the channels
  appear
- **WHEN** the station-admin picks a channel **THEN** the station's connection and bank are written
  **AND** first-run ends

### Requirement: A link waiting for a station admin is said, not alarmed

The console SHALL show a primary link that is down while the bridge's health carries
`amcpAwaitsSignIn` as one sentence in the notice tone — "Waiting for a station admin to sign in." —
and not as the link alarm; without that fact the same link SHALL alarm as before.

#### Scenario: Before and after the fact

- **WHEN** the primary is disconnected and the health says AMCP awaits a sign-in **THEN** the banner
  is a notice with that sentence and no dismiss
- **WHEN** the same primary is disconnected without that fact **THEN** the banner is the alarm

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

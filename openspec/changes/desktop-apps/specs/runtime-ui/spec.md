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

- **WHEN** an address is typed with no scheme or no port and checked **THEN** the field shows the
  address actually checked — `http://`, and `:8080` when no port was typed (`DESKTOP-APPS-01-C` C3)
- **WHEN** the address is checked **THEN** the AMCP line says "waiting for sign-in", neutral
- **WHEN** the address is connected **THEN** only the address is written
- **WHEN** an operator signs in before adoption **THEN** the bridge's "not set up yet" sentence shows
  **AND** AMCP still waits
- **WHEN** a station-admin signs in **THEN** the check runs again, and again while the AMCP line
  still waits, until the AMCP line turns OK or names the approval **AND** only then do the channels
  appear
- **WHEN** the station-admin picks a channel **THEN** the station's connection and bank are written
  **AND** first-run ends

### Requirement: A bridge that does not answer is said in the operator's words

The console SHALL say that the bridge did not answer in time — never an internal request name —
whenever a request to the bridge goes unanswered, and SHALL wait for `setup.check` longer than the
check's slowest line, the wait derived from the same constant as the line bound
(`DESKTOP-APPS-01-C` C2).

#### Scenario: A silent bridge

- **WHEN** a request is not answered **THEN** the error reads "The bridge did not answer in time."
  and names no channel
- **WHEN** `setup.check` is not answered within the old 8 s **THEN** the console is still waiting,
  and it gives up only after the derived wait

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

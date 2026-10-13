## ADDED Requirements

### Requirement: The console SHALL use one CG Bridge address for its check, Connect, the banner and the reconnect

The console SHALL resolve ONE CG Bridge address from the Set up fields — the CG Bridge field if a person typed
it, else the Playout's host on port 5280 — and the check SHALL run on the CG Bridge at that address, on a socket
of its own when it is not the one the console is connected to (`B-317`). The check's CG Bridge line, `Connect`,
the NOT CONNECTED banner and the reconnect SHALL all name and dial that same address. A CG Bridge address this
console remembers from an earlier session SHALL NOT be used unless a person chooses it: when it differs from the
resolved one, Set up SHALL offer it as a choice — `Use <host> (last used)` — and never as a check result. When the
CG Bridge host differs from the Playout's host, the CG Bridge line SHALL say so in one line:
`CG Bridge on a separate server: <host>:<port>.`

#### Scenario: A stale remembered address

- **WHEN** this console's station names `192.168.21.111` and the typed Playout is `http://127.0.0.1:8080` **THEN**
  the check runs on `127.0.0.1:5280`, never on `192.168.21.111` **AND** `Connect` dials `127.0.0.1:5280`
  **AND** `Use 192.168.21.111 (last used)` is offered as a choice, not shown as a line of the check

#### Scenario: CG Bridge on a separate server

- **WHEN** the CG Bridge field holds a host other than the Playout's **THEN** the CG Bridge line reads
  `CG Bridge on a separate server: <host>:5280.`

### Requirement: Set up SHALL never leave the operator without a way forward

`Connect` SHALL be offered only when CG Bridge answered at the resolved address. When it does not answer, Set up
SHALL say `CG Bridge is not answering at <host>:<port>.` — never the console's refusal of a command,
`Bridge disconnected — command rejected. Not sent to CasparCG.` — and SHALL keep `Check`, the address fields and
`Sign in` usable (`B-317`). Signing in to the Playout SHALL NOT wait on CG Bridge: the form SHALL be locked only by
a check line that says a sign-in cannot work. A loopback host in the sign-in or refresh address CG Bridge
advertises SHALL be read as CG Bridge's own machine and rebased onto CG Bridge's host whenever the console reaches
CG Bridge at a host that is not loopback. When the typed Playout's host is the CG Bridge host the check dials and
CG Bridge names its own Playout by loopback on the same port, the console SHALL ask the check by the address CG
Bridge knows its Playout by — the same Playout — so CG Bridge's before-sign-in narrowing, unchanged, still holds.

#### Scenario: CG Bridge absent, then present, then gone

- **WHEN** no CG Bridge answers and Check is pressed **THEN** the CG Bridge line says
  `CG Bridge is not answering at <host>:5280.` **AND** Check, the fields and Sign in stay usable **AND** no line
  reads `Bridge disconnected`
- **WHEN** CG Bridge then answers and Check is pressed **THEN** its lines show and `Connect` is offered
- **WHEN** it then stops answering and Check is pressed **THEN** the not-answering line is back and `Connect` is
  not offered

#### Scenario: A CG Bridge set up on the Playout's machine

- **WHEN** CG Bridge at `192.168.21.111` advertises `http://127.0.0.1:8080/api/cg/auth/token` **THEN** the console
  signs in at `http://192.168.21.111:8080/api/cg/auth/token`
- **WHEN** the typed Playout is `http://192.168.21.111:8080` and that CG Bridge names its Playout
  `http://127.0.0.1:8080` **THEN** an unsigned console's check runs there, asked for `http://127.0.0.1:8080`

### Requirement: The check SHALL say nothing about the machine the console runs on

The check SHALL carry no line about the console machine's ports or about where the Playout and CasparCG run
(`R-090`); a `ports` or `topology` line from an older CG Bridge SHALL be dropped. When CG Bridge names a port
it cannot open — in its `/health`, and in its answer to the check, which is where a console reads it (CG Control's
page does not reach CG Bridge's loopback HTTP) — the check SHALL show it as a failure naming CG Bridge's host:
`CG Bridge on <host> cannot open UDP 6251 (OSC from CasparCG): held by <process> (PID n).`

#### Scenario: An older CG Bridge's leftovers

- **WHEN** CG Bridge answers with a `ports` and a `topology` line **THEN** neither is shown

#### Scenario: A port CG Bridge cannot open

- **WHEN** CG Bridge answers the check with `port-refused` for UDP 6251 held by `casparcg.exe` (PID 4321) **THEN** the check shows
  `CG Bridge on <host> cannot open UDP 6251 (OSC from CasparCG): held by casparcg.exe (PID 4321).` as a failure

### Requirement: CG Control SHALL offer to start CG Bridge on its own machine

When the resolved CG Bridge address is this machine and nothing answers there, CG Control SHALL read this
machine's Windows and say, in words, one of: `CG Bridge is installed here but not running.` with
`Start CG Bridge`, which asks Windows for administrator rights as its own step and starts the `CGBridge` service;
`TCP 5280 here is held by <process> (PID n).`, offering `Free the port` only when that holder is ours — an older
CG Bridge, or a CG Control `0.9.x` sidecar `cg-bridge.exe` — and never stopping any other process; or
`CG Bridge is not installed here.` (`R-091`). No PowerShell line SHALL appear in the app or the guide for this.

#### Scenario: Installed and stopped

- **WHEN** the CG Bridge service is installed and stopped and nothing holds TCP 5280 **THEN** Set up says
  `CG Bridge is installed here but not running.` with `Start CG Bridge`

#### Scenario: A holder of ours, and a foreign one

- **WHEN** TCP 5280 is held by `cg-bridge.exe` in CG Control's folder **THEN** `Free the port` is offered
- **WHEN** TCP 5280 is held by `casparcg.exe` **THEN** it is named and `Free the port` is not offered

### Requirement: The check SHALL show what needs attention and fold its passes

Each group of the check SHALL show its failures, warnings, waits and running lines in full and fold its passes
into one line, `<group> · <n> OK`; a group with only passes SHALL be that one line. One `Show all` control SHALL
open every line, and `Show less` fold them again; the choice SHALL be remembered for this viewer (`R-092`).

#### Scenario: A mixed group, a clean group, and the toggle

- **WHEN** Reachable has one failure and four passes, and Versions two passes **THEN** Reachable shows the failure
  and `Reachable · 4 OK`, and Versions shows only `Versions · 2 OK`
- **WHEN** `Show all` is pressed **THEN** every line shows **AND** a reload keeps it so

### Requirement: The NOT CONNECTED banner and the layer list's wait SHALL carry no explanation

The NOT CONNECTED banner SHALL carry its state, the CG Bridge address and the one fact an operator acts on,
`Takes are refused until it is back.`, and SHALL carry no explanation of why — no "nothing is listening on port",
"switched off, a wrong address, or a firewall", "something there answers, but not as CG Bridge", or "reissue
them once the connection is back" (`R-093`). `Loading the layer list…` SHALL carry its title only — no "Waiting
for the bridge to send the declared rows" and no "This is not an empty list".

#### Scenario: The banner, absent the prose

- **WHEN** CG Bridge is unreachable at `192.0.2.50:5280` **THEN** the banner reads
  `CG Bridge not reachable at 192.0.2.50:5280. Takes are refused until it is back.` **AND** none of the removed
  phrases appears

#### Scenario: The layer list's wait, absent the prose

- **WHEN** the declared rows have not arrived **THEN** the panel reads `Loading the layer list…` and nothing more

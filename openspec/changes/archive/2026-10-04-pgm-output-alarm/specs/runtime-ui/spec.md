# runtime-ui — delta (a declared output that is not running is a full-width alarm, C-029; severity by air-criticality, B-223)

## ADDED Requirements

### Requirement: A missing program output is a one-line full-width alarm that does not go quiet when its source dies

The Runtime SHALL render a full-width, persistent, `role="alert"` banner, in the same strip
language and banner region as the connection and raster-mismatch banners, whenever the
primary server's output verdict is `missing` AND at least one missing consumer kind is a
PROGRAM output — a kind whose output leaves the playout machine (`decklink`, `bluefish`, `ndi`,
`ffmpeg`, `artnet`, and any kind the console does not recognise). The banner SHALL say that
nothing on the channel reaches air, and SHALL carry, per channel, exactly ONE line the operator
can act on: the declared consumer kind and the device its declaration names, that CasparCG is
not running it, that the fix is on the playout machine, and where the detail is (the Server
connection dialog's Outputs section). The banner SHALL NOT carry the engineering detail — the
addressing form of the declared number, how CasparCG reads it, the startup-log recipe, the
restart paragraph, the creation outcome.

When the bridge cannot reach CasparCG after such a verdict, the banner SHALL stay, re-labelled
as UNVERIFIED, saying when the output was last seen missing and that it cannot be re-checked
until CasparCG is reachable. The banner SHALL render nothing on an `ok` or `unknown` verdict, and
nothing while the browser→bridge link is not live (the connection banner owns that state). The
verdict SHALL come from the one predicate `outputVerdictOf` and the severity from the one
predicate `outputSeverityOf` / `checksLosingAir`; the banner SHALL NOT re-derive either.

#### Scenario: The fixture raises the alarm, in words an operator can act on

- **WHEN** the primary is reachable and its check for channel 1 says the declared
  `decklink` (device `23487013`) is not running while `system-audio` and `screen` are
- **THEN** a `role="alert"` banner named "Program output missing" reads PROGRAM OUTPUT MISSING,
  names channel 1 and `decklink (device 23487013)`, says CasparCG is not running it and that the
  fix is on the playout machine, points at Server connection ▸ Outputs, and says nothing about
  persistent IDs, slot indexes, the server log or restarting

#### Scenario: Nothing lights when every declared consumer is running

- **WHEN** the verdict is `ok`, or no check has completed, or the declaration was unreadable
- **THEN** no output banner is rendered

#### Scenario: The alarm clears when the declared consumer is seen running

- **WHEN** a later check reports the `decklink` consumer running
- **THEN** the banner disappears on its own

#### Scenario: The bridge loses CasparCG after a missing verdict

- **WHEN** the primary becomes unreachable while its kept verdict is `missing` for a program output
- **THEN** a banner named "Program output unverified" stays on screen, names the server as
  unreachable and the kind last seen missing, and says it cannot re-check

#### Scenario: An unknown consumer kind is treated as a program output

- **WHEN** a check reports a declared kind the console does not recognise as missing
- **THEN** the banner alarms for it exactly as for a DeckLink

#### Scenario: The browser→bridge link is down

- **WHEN** the link is `disconnected` or in test mode
- **THEN** the output banner renders nothing; the connection banner is the alarm there

### Requirement: A missing local monitor raises no operator alarm, and the technical surface carries every check in full

The Runtime SHALL classify a consumer kind that renders on the playout machine itself — `screen`
(a preview window) and `system-audio` (the machine's own sound device) — as `local`. A channel
whose missing set contains only local kinds SHALL raise NO operator banner, whatever the verdict,
and SHALL disable no control, refuse no action and trigger no failover. The Server connection dialog
SHALL carry a read-only Outputs section that shows, per server and per checked channel, what
`casparcg.config` declares, what runs, when it was checked, one row per missing kind labelled by
severity — an AIR row with the full remedy (the addressing reading and the rule CasparCG reads
the number by, the startup-log recipe, the restart paragraph, the creation outcome when there is
one) and a preview / local-monitor row saying it has no effect on air — and, for an unreachable
server, its last verdict dated and marked as not re-checkable. The bridge's own log line SHALL
follow the same severity: a 🔴 OUTPUT MISSING line for a program output, a plain note for a
local monitor.

#### Scenario: A missing screen consumer raises nothing for the operator

- **WHEN** the primary is reachable and its check for channel 1 says the declared `screen` is not
  running while the `decklink` is
- **THEN** no output banner is rendered, no control is disabled, and the bridge's log carries a
  plain note rather than the OUTPUT MISSING line

#### Scenario: The technical surface carries the check in full

- **WHEN** the Server connection dialog is open with a `missing` verdict for `decklink` (device
  `23487013`)
- **THEN** its Outputs section shows the declared and running sets, an AIR row naming
  `decklink (device 23487013)`, the words "hardware persistent ID 23487013", how CasparCG reads
  the number, the startup-log recipe, the restart paragraph and the creation outcome when one was
  recorded

#### Scenario: A missing screen is noted on the technical surface only

- **WHEN** the Server connection dialog is open with a verdict missing only `screen`
- **THEN** its Outputs section shows a preview row saying the screen consumer is declared and not
  running, is a preview window on the playout machine, and has no effect on air — with no remedy
  paragraph

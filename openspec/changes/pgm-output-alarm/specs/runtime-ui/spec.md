# runtime-ui — delta (a declared output that is not running is a full-width alarm, C-029)

## ADDED Requirements

### Requirement: A declared output that is not running is a full-width alarm that does not go quiet when its source dies

The Runtime SHALL render a full-width, persistent, `role="alert"` banner, in the same strip
language and banner region as the connection and raster-mismatch banners, whenever the
primary server's output verdict is `missing`. The banner SHALL name the channel, the declared
consumer kind and the device its declaration names, what IS running on the channel, and the
next action (read the CasparCG log on the playout machine for the reason, correct the consumer
in `casparcg.config` there, restart CasparCG), and SHALL say the server is up and answering so
that nobody power-cycles a working playout box over it. When the missing kind is a program
output (`decklink` and the other kinds that leave the machine) the banner SHALL say that nothing
on the channel reaches air; when only a monitor (`screen`, `system-audio`) is missing it SHALL
say so in a softer voice and SHALL NOT claim nothing reaches air.

When the bridge cannot reach CasparCG after a `missing` verdict, the banner SHALL stay, re-labelled
as UNVERIFIED, saying when the output was last seen missing and that it cannot be re-checked
until CasparCG is reachable. The banner SHALL render nothing on an `ok` or `unknown` verdict, and
nothing while the browser→bridge link is not live (the connection banner owns that state). The
verdict SHALL come from the one predicate `outputVerdictOf`; the banner SHALL NOT re-derive it.

When a creation attempt has been recorded, the banner SHALL read it back in the operator's words:
the exact command sent, and whether CasparCG accepted or refused it (with the code).

#### Scenario: The fixture raises the alarm, in words an operator can act on

- **WHEN** the primary is reachable and its check for channel 1 says the declared
  `decklink` (device `23487013`) is not running while `system-audio` and `screen` are
- **THEN** a `role="alert"` banner named "Program output missing" reads PROGRAM OUTPUT MISSING,
  names channel 1, `decklink (device 23487013)`, `Running: system-audio, screen`, and tells the
  operator to correct the config on the playout machine and restart CasparCG

#### Scenario: Nothing lights when every declared consumer is running

- **WHEN** the verdict is `ok`, or no check has completed, or the declaration was unreadable
- **THEN** no output banner is rendered

#### Scenario: The alarm clears when the declared consumer is seen running

- **WHEN** a later check reports the `decklink` consumer running
- **THEN** the banner disappears on its own

#### Scenario: The bridge loses CasparCG after a missing verdict

- **WHEN** the primary becomes unreachable while its kept verdict is `missing`
- **THEN** a banner named "Program output unverified" stays on screen, names the server as
  unreachable and the declared consumer as last seen missing, and says it cannot re-check

#### Scenario: A missing monitor is said in a softer voice

- **WHEN** only a `screen` consumer is missing
- **THEN** the banner reads DECLARED OUTPUT NOT RUNNING and does not claim nothing reaches air

#### Scenario: The browser→bridge link is down

- **WHEN** the link is `disconnected` or in test mode
- **THEN** the output banner renders nothing; the connection banner is the alarm there

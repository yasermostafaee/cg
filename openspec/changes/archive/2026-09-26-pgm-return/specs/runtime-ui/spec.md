# runtime-ui — delta (the PROGRAM monitor shows the programme return, C-016)

## ADDED Requirements

### Requirement: The PROGRAM monitor shows the programme return, and says so when it cannot

The PROGRAM pane SHALL show the programme return of the channel on screen, served by the bridge
same-origin, and SHALL show the picture ONLY while the bridge reports that channel `live` over a
live bridge link. Otherwise the pane SHALL hide the picture and say, in the signal strip and on
the screen, **"No return signal"** (connecting, unreachable or unavailable) or **"Return feed
stalled"** (the feed stopped delivering frames) — never a frozen frame as if it were live. The
pane SHALL carry no explanatory prose; the strip keeps the rows-on-air count beside the signal, so
"no return signal" is never read as "nothing on air".

#### Scenario: The live picture appears

- **WHEN** the monitors are shown and the bridge relays frames for the channel on screen
- **THEN** the PROGRAM pane shows the picture, and its strip no longer reads "No return signal"

#### Scenario: A stalled feed hides the picture and says so

- **WHEN** the feed stops delivering frames
- **THEN** the picture is hidden and the pane reads "Return feed stalled"; and when frames resume
  the picture returns and the notice clears

#### Scenario: No feed reads "No return signal"

- **WHEN** the bridge cannot reach the feed, or the console runs without a relay (test mode)
- **THEN** no picture is shown and the pane reads "No return signal"

### Requirement: The PROGRAM return is requested only while the PROGRAM pane is shown

The console SHALL request the programme return only while the PROGRAM pane is rendered, and SHALL
release it when the pane is hidden or its channel changes, so a console with the monitors hidden —
the boot state — pulls nothing.

#### Scenario: Hiding the monitors releases the return

- **WHEN** the console boots with the monitors hidden
- **THEN** the feed sees no connection; showing the monitors connects it (the positive control),
  and hiding them again closes it within 2 s

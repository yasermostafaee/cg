## ADDED Requirements

### Requirement: An AMCP refusal SHALL be said in the operator's words, from one mapping

The console SHALL turn a server reply (`amcp-NNN`) into the operator's words in ONE place, tailored
by what the refused command was for: a `DECKLINK` play refused with 403 or 404 SHALL read _"The
server has no DeckLink input n, or it is in use."_; a 404 on a media or stream play SHALL read _"The
server cannot find the file …"_; every other reply SHALL read its code's generic line (a channel
the server does not have, a setting it refused, what it cannot find, a failure while running it).
No operator surface SHALL show "AMCP" or the reply's number; the code and the command go to the log.

#### Scenario: A DeckLink play refused with 403 or 404

- **WHEN** the refused command is `PLAY 2-60 DECKLINK DEVICE 1` and the reply is 403, or 404
- **THEN** the words are _"The server has no DeckLink input 1, or it is in use."_

#### Scenario: A file that is not there

- **WHEN** the refused command is a media play and the reply is 404
- **THEN** the words are _"The server cannot find the file <name>."_, not the DeckLink line

#### Scenario: No surface shows the number

- **WHEN** any reply code from 400 to 503 is worded, with or without its command
- **THEN** neither the sentence nor the clause contains "AMCP" or the code

### Requirement: A refused take SHALL be said on its row and in its Inspector, in one line

A take the bridge refused and carries on the row SHALL be said in ONE line naming the row, the
refused source and the input it named, then what the refusal means (the one mapping): _"Bed 59 ·
studio1 (DeckLink 1): the server has no such input, or it is in use."_ The line SHALL appear on the
row and in its Inspector, in that channel's view only; another channel's view SHALL show only the
mark on that channel's strip tab. No banner SHALL repeat it. It SHALL go when the row is next taken
successfully, or cleared.

#### Scenario: The refused row says it, and nothing else does

- **WHEN** the take of the TICKER row is refused on its DeckLink plate
- **THEN** the row reads ERROR with the line, and its Inspector shows the same line
- **AND** no banner appears, and "AMCP" appears nowhere on the page

#### Scenario: Another channel's view shows only the mark

- **WHEN** the operator views the other channel
- **THEN** neither the line nor a banner is shown, and the refused row's channel tab carries a mark

#### Scenario: A take that lands clears it

- **WHEN** the row is taken again and the take lands
- **THEN** the line leaves the row and the Inspector, and the mark leaves the strip

### Requirement: A row's PLAY SHALL be unavailable while the bridge would refuse its take

A row's PLAY SHALL be disabled while the bridge would refuse its take — the row is on air or
unsettled, or the published live-layers ledger holds a seat for it; the same `ownsLiveSeats` the
bridge refuses with — naming the row: _"<row> is already on air — take it out first."_ A take
the bridge refuses with `already-on-air` (a race, or another console's take) SHALL be reported in the
same sentence, in the row's own name. PLAY SHALL be available again once the row has left air or its
take has resolved as refused.

#### Scenario: An unconfirmed row does not offer PLAY

- **WHEN** a take's reply is overdue and the row reads `unconfirmed`
- **THEN** PLAY is disabled, is not lit in the air colour, and its title is the row's sentence

#### Scenario: A row whose plates are seated does not offer PLAY

- **WHEN** the ledger holds a seat for a row whose status reads loaded (adopted at a bridge restart)
- **THEN** PLAY is disabled with the row's sentence
- **AND** once CLEAR has taken the row out, PLAY is available

#### Scenario: A refused take can be tried again

- **WHEN** the row's take was refused and it reads ERROR
- **THEN** PLAY is available

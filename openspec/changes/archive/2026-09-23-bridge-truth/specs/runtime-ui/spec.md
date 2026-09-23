## ADDED Requirements

### Requirement: A console the lock does not reach does not present itself as locked

The console SHALL derive how much of it an engaged lock covers from the lock's `channels` and the principal's `permittedChannels`: the lock screen and the status bar's `LOCKED` SHALL appear only when the lock covers every channel the console holds, or carries no `channels`. A console holding none of the covered channels SHALL show neither, and SHALL NOT offer the Lock control while any lock is engaged. With partial overlap, each covered channel's tab SHALL read `CHANNEL n · LOCKED` and the others SHALL not.

#### Scenario: The engager's console is locked and the other channel's is not

- **GIVEN** two consoles signed in as the channel-1 and the channel-2 operator
- **WHEN** the channel-1 operator engages the lock
- **THEN** the channel-1 console shows the lock screen and `LOCKED`
- **AND** the channel-2 console shows neither, and no Lock control

#### Scenario: Partial overlap names the covered channels

- **WHEN** a lock covers some but not all of a console's channels
- **THEN** only the covered channels' tabs read `LOCKED`, and no lock screen is shown

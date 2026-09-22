## ADDED Requirements

### Requirement: The lock covers the engager's channels

The bridge SHALL scope an engaged lock to the channels the engaging principal holds on this station, captured at the moment of engage and carried on `lock.state` as `channels`, and SHALL refuse with the lock sentence only an intent that touches a covered channel the requesting principal holds. With auth OFF, or an engager holding `'*'`, `channels` SHALL be absent and the lock SHALL refuse every operator intent exactly as before. A principal holding none of the covered channels SHALL NOT be refused by the lock; the permission gate decides their intents. An intent that resolves to no channel SHALL be refused for a principal the lock reaches. PANIC SHALL be judged by the channels its ledger holds seats on, and SHALL remain unscoped in what it silences. The bridge SHALL hold one lock at a time, and SHALL refuse an engage that would cover no channel. Release SHALL be unchanged.

#### Scenario: Another operator's channel stays operable

- **GIVEN** the channel-1 operator has engaged the lock
- **WHEN** the channel-2 operator sends CLEAR on channel 2, and PANIC
- **THEN** neither is refused for the lock, and both reach the wire

#### Scenario: B-229 stands inside the scope

- **GIVEN** the channel-1 operator has engaged the lock
- **WHEN** a second principal holding channel 1 sends CLEAR or PANIC on channel 1
- **THEN** each is refused with the lock sentence

#### Scenario: A principal without the channel meets the permission gate, not the lock

- **GIVEN** the channel-1 operator has engaged the lock
- **WHEN** the channel-2 operator sends CLEAR on channel 1, or CLEAR ALL over a channel-1 stack
- **THEN** each is refused by permission, naming channel 1, and not with the lock sentence

#### Scenario: The every-channel lock is unchanged

- **WHEN** the lock is engaged with auth OFF, or by a principal holding `'*'`
- **THEN** `lock.state` carries no `channels` and every operator intent from every socket is refused

#### Scenario: One lock at a time, and none that covers nothing

- **WHEN** a principal the lock does not reach engages, or a principal holding no channel here engages
- **THEN** the engage answers `ok: false`, and a `lock-engage` row records the refusal

### Requirement: A locked console does not change hands by token

The bridge SHALL refuse, with the lock sentence, an `auth` frame presenting a principal whose `sub` differs from the socket's current principal while the lock reaches that current principal. A frame presenting the same `sub` SHALL pass, and so SHALL a first sign-in on a socket with no principal.

#### Scenario: A swap is refused, the refresh is not

- **GIVEN** the lock reaches a console signed in as one operator
- **WHEN** that socket presents another principal's token
- **THEN** it is refused with the lock sentence and the principal is unchanged
- **AND WHEN** it presents a refreshed token for the same `sub` **THEN** it is accepted

#### Scenario: A reloaded console can still sign in

- **WHEN** a new socket with no principal signs in while the lock is engaged
- **THEN** the sign-in is accepted

### Requirement: Every template mutation is recorded, and a lock refuses an overwrite

The bridge SHALL write an audit row for every change to its template catalogue: `template-redeliver` when a re-delivery registers a missing id or replaces a held one, and `template-remove` for every removal outcome. A re-delivery that changes nothing SHALL write no row. While the lock reaches the requesting console, a re-delivery that would replace a held template SHALL be refused with the lock sentence and SHALL leave the held copy unchanged; a re-delivery that registers a missing id, or changes nothing, SHALL pass.

#### Scenario: A changing re-delivery is recorded; an identical one is not

- **WHEN** a re-delivery registers a template, an identical one follows, and a third replaces it
- **THEN** exactly two `template-redeliver` rows are written

#### Scenario: A locked console cannot overwrite a template

- **GIVEN** the lock is engaged
- **WHEN** a re-delivery would replace a held template's HTML
- **THEN** it is refused with the lock sentence and the held HTML is unchanged
- **AND** an identical re-delivery, and one restoring a missing template, still pass

### Requirement: Reconnect machinery is refused but not recorded as a press

The permission gate SHALL refuse a `stack.restore`, or a `templates.import` marked `redelivery`, from a principal without the class, and SHALL NOT write a `refused` audit row for it. A refused press that is not reconnect machinery SHALL still write its `refused` row.

#### Scenario: A viewer's reconnect leaves no refused row

- **WHEN** a signed-in viewer's console restores its stack and re-delivers a template, then presses TAKE
- **THEN** all three are refused, and the only `refused` row is the TAKE's

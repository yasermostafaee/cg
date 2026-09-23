## ADDED Requirements

### Requirement: The station fence refuses a channel this station does not declare

The bridge SHALL refuse, before anything reaches CasparCG, every request that names a channel the station does not declare, with the one sentence that names the channel and says nothing was sent. The declaration SHALL be `#declaredChannels()` — the fixed bank's channel, or channel 1 with no bank — and nothing else: a principal's grant and a catalogue row SHALL NOT make a channel one this station writes to. The fence SHALL apply with auth OFF as well as ON. It SHALL sit after the authentication gate and before the permission gate. It SHALL read only a channel the request names at its top level; a channel resolved from an `itemId`, a bulk verb's union and PANIC SHALL NOT be read by it. `stack.restore` SHALL keep skipping a foreign retained row per item as `not-declared` rather than refusing the whole request. The routes whose channel declares or configures rather than addresses — `fixedLayers.set-config` and `channelSettings.set` — SHALL be exempt by name, and every other route naming a channel SHALL be fenced by default.

#### Scenario: An undeclared channel reaches nothing, with auth OFF

- **GIVEN** a bank declaring channel 2, auth OFF, and another system's html graphic on layer 20 and on reserved layer 60 of channels 1 and 2
- **WHEN** `layers.clear`, `playoutLayers.clear`, `fixedLayers.clear-layer` or `fixedLayers.load` (followed by a take) names channel 1
- **THEN** it is refused with the station sentence naming channel 1, and nothing addressing channel 1 reaches CasparCG

#### Scenario: A grant for the channel does not open it

- **GIVEN** the same station with auth ON, and a principal granted channels 1 and 2 of this host
- **WHEN** the same four doors name channel 1
- **THEN** each is refused with the station sentence, and nothing addressing channel 1 reaches CasparCG

#### Scenario: The declared channel is the positive control

- **WHEN** the same four doors name channel 2 on the same bridge
- **THEN** none is refused by the fence, and each one's command lands on channel 2

#### Scenario: After sign-in, before permission

- **WHEN** a socket that has not signed in names channel 1
- **THEN** it is told to sign in, and learns nothing about the station's channels
- **WHEN** a principal granted channel 2 only names channel 1
- **THEN** it is refused with the station sentence, not the grant sentence

#### Scenario: A request naming no channel is not read by the fence

- **WHEN** an item-scoped verb, a bulk verb, PANIC, or a restore carrying a foreign slot is judged
- **THEN** the station fence does not refuse it

#### Scenario: Every route naming a channel is classified

- **WHEN** the route table's request schemas are walked for a key named `channel`
- **THEN** exactly eight routes carry one, six at the top level; exactly `fixedLayers.set-config` and `channelSettings.set` are exempt; and every other top-level channel route is refused an undeclared channel and passes the declared one

### Requirement: The console's reads that feed a CLEAR name only declared channels

The orphan sweep SHALL take its candidates only from channels this station declares, and the playout-layer state SHALL report its rows on the declared channel. A layer on a channel this station does not operate SHALL NOT be offered to the operator as clearable.

#### Scenario: Another channel's graphic is not an orphan

- **GIVEN** a bank declaring channel 2 and another system's html graphic on layer 20 of channels 1 and 2
- **WHEN** the orphan list is read
- **THEN** it lists `2-20` and nothing on channel 1

#### Scenario: The playout tab reports the declared channel

- **GIVEN** a bank declaring channel 2, reserved layer 60, and an html graphic on `1-60` and `2-60`
- **WHEN** the playout-layer state is read
- **THEN** its one row is channel 2, layer 60, reading the producer

### Requirement: A dynamic load places on the declared channel

The allocator SHALL place a dynamic row on the station's declared channel, never on a constant.

#### Scenario: A declared policy on a channel-2 station

- **GIVEN** a bank declaring channel 2 and a deployment-declared dynamic policy
- **WHEN** a template is loaded dynamically and taken
- **THEN** its producer is seated on channel 2, and nothing addresses channel 1

### Requirement: One predicate answers whether this station operates a channel

The bridge SHALL answer "does this station operate channel N" in one place, `#isDeclaredChannel`, and the request gate, the restore fence, the orphan sweep, the playout-layer state and the channel-settings store SHALL all ask it at the time they decide. None SHALL hold a copy of the declared list taken earlier.

#### Scenario: A bank-less runtime restores what every other door accepts

- **GIVEN** a runtime with no declared bank
- **WHEN** a retained row on channel 2 is restored
- **THEN** it is skipped as `not-declared`, as the gate would refuse channel 2, because channel 1 is the declared default

## MODIFIED Requirements

### Requirement: The lock covers the engager's channels

The bridge SHALL scope an engaged lock to the channels the engaging principal holds on this station, captured at the moment of engage and carried on `lock.state` as `channels`, and SHALL refuse with the lock sentence only an intent that touches a covered channel the requesting principal holds. With auth OFF, or an engager holding `'*'`, `channels` SHALL be absent and the lock SHALL refuse every operator intent exactly as before. A principal holding none of the covered channels SHALL NOT be refused by the lock; the station fence and the permission gate decide their intents. An intent that resolves to no channel SHALL be refused for a principal the lock reaches. PANIC SHALL be judged by the channels its ledger holds seats on, and SHALL remain unscoped in what it silences. The bridge SHALL hold one lock at a time, and SHALL refuse an engage that would cover no channel. Release SHALL be unchanged.

#### Scenario: Another operator's channel stays operable

- **GIVEN** the channel-1 operator has engaged the lock on a station declaring channel 1
- **WHEN** the channel-2 operator sends PANIC, and CLEAR on channel 2
- **THEN** neither is refused for the lock; PANIC reaches the wire; and CLEAR on channel 2 is refused by the station fence — channel 2 is not this station's — and reaches nothing

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

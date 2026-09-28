## ADDED Requirements

### Requirement: A Source defaults write SHALL be judged by the channel grant on the channels it changes

A `sources.set-assignments` SHALL be refused, before anything is applied, when the signed-in principal's grant
(`cg_channels`) does not hold a channel whose Source defaults it changes — with the permission gate's existing
channel sentence for that channel. `"*"` SHALL hold every channel. A channel is changed when the defaults it reads
through the one reader differ between the set in force and the set sent; a channel whose defaults are sent back as
they were SHALL NOT be judged, because a console sends the whole set on every save. The role check SHALL come first,
as for every route, and with auth off nothing SHALL be refused by it. A channel-scoped lock SHALL judge the same
channels, as it judges a bank change's.

#### Scenario: A station-admin holding channel 2 only

- **WHEN** a station-admin granted channel 2 alone saves Source defaults that change channel 1's **THEN** the save
  is refused with `This sign-in does not cover channel 1, …`, and no channel's defaults change
- **WHEN** the same principal saves defaults that change channel 2's alone **THEN** they change, and channel 1's
  stay as they were (the control)

#### Scenario: A principal holding every channel

- **WHEN** a station-admin whose grant is `"*"` changes channel 1's defaults and then channel 2's **THEN** both are
  accepted

#### Scenario: The role still comes first, and auth off refuses nothing

- **WHEN** an operator-role principal saves Source defaults **THEN** it is refused for its role, as before
- **WHEN** the bridge runs with auth off **THEN** a save that changes channel 1's defaults is accepted

#### Scenario: A lock covering channel 1

- **WHEN** a lock covers channel 1 and a principal holding channels 1 and 2 saves defaults that change channel 1's
  **THEN** the lock refuses it
- **WHEN** the same principal's save changes channel 2's alone **THEN** it passes the lock and is applied

#### Scenario: The console says so

- **WHEN** the Source defaults dialog's save is refused by the grant **THEN** the dialog shows the gate's sentence,
  keeps the operator's edit, and adopts nothing

## ADDED Requirements

### Requirement: The bridge SHALL seat a reserve Playlist only from that reserve's qualified D10

The bridge SHALL resolve the reserve's clean Playlist from its own authenticated input list,
canonical core epoch, explicit local `playlistOf` channel, qualified route layer, declared
compatibility and video mode. It SHALL use the reserve's independently mapped source and
destination channels. It SHALL NOT copy a primary holder route to the reserve.

The reserve LOADBG/PLAY pair SHALL target a pinned reserve session and queue, SHALL recheck
its proof at dispatch, and SHALL never enter the replay journal. Source-list warming SHALL
occur outside playout verbs. Current acknowledged route seats MAY join the existing paired
geometry and preset transition path, under the same resident page and source proofs.

#### Scenario: Different local source and destination numbers

- **WHEN** A publishes route 1-5 and B independently publishes route 2-7 for the mapped destination
- **THEN** A receives only its own route and B receives its own route on its mapped plate layer
- **AND** retained plate native preset phases agree after translating the destination channel

#### Scenario: The reserve epoch changes while a route waits in the background

- **WHEN** the independently confirmed B epoch or connection changes before PLAY can dispatch
- **THEN** no stale B PLAY is sent and no route is journaled for replay

#### Scenario: A delayed read completes after reconnect invalidation

- **WHEN** an old D10 response arrives after invalidation and a newer D10 answer
- **THEN** the old response cannot qualify a new seat or replace the newer cached epoch

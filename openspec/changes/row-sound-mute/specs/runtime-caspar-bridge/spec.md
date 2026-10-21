## ADDED Requirements

### Requirement: A row's template-sound mute is a configuration verb carried to the page

`stack.set-sound-muted` SHALL be a configuration verb gated by `#ownsLiveSeats`: for a row that owns no live seats it
SHALL record the choice and send NOTHING to CasparCG; for a row that does it SHALL send one `CG UPDATE` whose control
is only `__cg.sound: { muted }`, and record the choice only when it is accepted. Every take SHALL carry a recorded
choice to the page on both routes into air — the `CG ADD` payload and the resident page's tell before `CG PLAY` — and a
row that never set it SHALL carry no `sound` member. The choice SHALL be published on the row, retained across a
bridge restart, forgotten with the row, and audited (`set-sound-muted`). The page SHALL apply the member to its host
mute (every sound it makes, one already playing included) through `update` and through `play` before its entrance
sounds start; a payload without it SHALL leave the mute as it is.

#### Scenario: Off air

- **WHEN** a loaded row is muted
- **THEN** nothing reaches the wire, the row publishes `soundMuted: true`, and its next take — resident tell or ADD —
  carries `__cg.sound: { muted: true }`

#### Scenario: On air

- **WHEN** an on-air row is muted, then unmuted
- **THEN** each sends one `CG UPDATE` whose control is exactly `{ sound: { muted } }`, and no `PLAY` or `ADD`

#### Scenario: Never muted

- **WHEN** a row nobody muted is taken
- **THEN** its `CG ADD` carries no `sound` member

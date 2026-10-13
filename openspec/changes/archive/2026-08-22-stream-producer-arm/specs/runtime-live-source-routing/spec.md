# runtime-live-source-routing — delta (C-025, the `stream` producer arm)

## ADDED Requirements

### Requirement: A live source can be an internet STREAM, and a bad URL is refused at the config boundary

The producer union SHALL carry a fifth arm, `stream`, holding a URL — its own arm and NOT an
extension of `media`, because `media` is the one producer that needs no signal and a stream is its
opposite: it needs a signal and can drop. The bridge SHALL play it as
`PLAY <channel>-<layer> "<url>"` — the command the owner proved by hand on the plant — built at the
single AMCP construction seam with the URL quoted exactly once.

The URL's scheme SHALL be one of exactly nine — `http`, `https`, `rtmp`, `rtmps`, `rtsp`, `srt`,
`udp`, `rtp`, `mms` — a list that states WHAT THE CLIENT REQUIRES THE PRODUCT TO ACCEPT, never what
CasparCG or its linked ffmpeg supports (no source of truth for that is available); widening it is a
product decision, not a discovery. The rule SHALL be expressed ONCE, in the shared catalog
validator, so the bridge — at LOAD and at every CHANGE — and the offline mock refuse identically,
with a named refusal code whose operator sentence derives from the same wire constant.

The v1 scope is "type a URL and it plays": reconnect, stall detection and stream health are OUT of
scope, and nothing in the bridge models an alive-but-stalled stream — every arm either works or the
link to CasparCG is down. A stream SHALL require no aspect statement: with no `format`, the fit
falls through to the explicit `aspect` and then to `null`, the same branch `AUTO` lands on.

#### Scenario: An operator defines a stream and it reads as a feed, not a clip

- **WHEN** the operator picks the `stream` kind for a source **THEN** the modal offers it as a
  fifth, stream-labelled option beside the four existing kinds, and choosing it renders a URL field
- **WHEN** the source is listed **THEN** its summary reads as a stream, so a second operator reading
  the config can tell a feed from a clip

#### Scenario: A scheme outside the nine is refused at the boundary, never at take

- **WHEN** a catalog is set containing a `stream` URL whose scheme is outside the nine **THEN**
  `sources.set-config` refuses it with the named refusal code and a message naming the offending
  scheme, and nothing is persisted or reaches the wire
- **WHEN** a catalog file containing such a URL is hand-written and LOADED **THEN** the same
  validator refuses it with the same code — one spelling of the rule
- **WHEN** the refusal reaches the operator **THEN** it is a sentence derived from the shared reason
  union, never a wire identifier and never a bare code

#### Scenario: All nine accepted schemes play

- **WHEN** a `stream` URL uses any of the nine schemes, in any letter case **THEN** the catalog
  accepts it, and a take of a plate assigned to it emits `PLAY <channel>-<layer> "<url>"` with the
  URL byte-exact — `quote()`'s escape set contains no character a URL carries

#### Scenario: The ledger records what was sent

- **WHEN** a stream producer is seated **THEN** the ledger's `producer` field records the concrete
  URL argument as sent, through the same function the `PLAY` was built from

#### Scenario: A stream states no aspect unless told

- **WHEN** a `stream` source states no `format` **THEN** the fit falls through to the explicit
  `aspect` and then to `null` — the same branch `AUTO` lands on — and no new required field exists

#### Scenario: The media arm is not narrowed

- **WHEN** a URL is typed into a `media` producer's file field (the pre-C-025 workaround) **THEN**
  it still parses and still passes validation — closing the expression gap does not break configs
  that used the workaround

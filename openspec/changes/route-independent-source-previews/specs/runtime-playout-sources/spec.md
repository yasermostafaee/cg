## ADDED Requirements

### Requirement: Source previews SHALL use independently resolved engine identities

Source snapshot, PVW, source-audio and live listening reads SHALL select their
preferred engine from verified monitor topology. When that engine explicitly lacks
a source and its peer has a verified matching source, reads SHALL use the peer.
Native media and poster reads SHALL try only independently resolved eligible targets.
B reads SHALL use B's own authentication and channel identity, D10 logical mapping
or mapped Playlist pair, and fingerprint-matched media ID. Preview fallback SHALL
not change programme authority, bindings or programme output.

#### Scenario: A source is missing while B has it

- **GIVEN** A reports an input missing and B advertises its verified logical mapping
- **WHEN** an operator requests its picker, PVW, audio or listening preview
- **THEN** the Bridge reads B using B's own input ID, mapped channel and bearer
- **AND** no programme command or source-binding update is sent

#### Scenario: B is active while both source copies exist

- **GIVEN** verified monitor topology identifies B as active
- **WHEN** a local source preview is requested
- **THEN** its picture and audio resolve against B's independent source identity
- **AND** another source that only exists on A can be read independently from A

#### Scenario: Reserve media survives A becoming unavailable

- **GIVEN** the Bridge knows a media fingerprint and B has a matching local D11 row
- **WHEN** A's row is missing or its catalogue is unavailable
- **THEN** the media and poster preview can use the verified B-local ID and session
- **AND** an A-local ID is never sent to B as a substitute

#### Scenario: A newer preview intent supersedes slow route preparation

- **GIVEN** an earlier PVW view or live-input check is waiting for source resolution
- **WHEN** the operator opens a newer view, chooses a newer input, or cancels that handle
- **THEN** the obsolete preparation cannot replace the newer view or create a late lease
- **AND** obsolete selector caches are not published after cancellation
- **AND** independent passive thumbnail or meter polling does not cancel the current PVW intent

#### Scenario: A successful snapshot batch omits an input

- **GIVEN** an otherwise verified passive snapshot batch omits a requested input
- **WHEN** the independently authorized alternate engine has the exact matching input and supplies a picture
- **THEN** the picker can show that picture without opening a live-input check
- **AND** the picture remains scoped to its current selection, channel and authorization
- **AND** a throttled, refused or malformed batch does not authorize this fallback

#### Scenario: A viewer reads an existing poster

- **GIVEN** a viewer can read a media catalogue item
- **WHEN** an older client requests its poster without a channel
- **THEN** the existing response shape is preserved
- **AND WHEN** a channel-granted viewer requests a channel-aware A or B poster
- **THEN** the read succeeds without operator privilege and identifies the serving engine
- **AND** a viewer without that channel grant remains refused

#### Scenario: Media PVW lacks a passive picture while its independent poster exists

- **GIVEN** the normal media PVW and shared snapshot reads supply no JPEG
- **WHEN** its current channel-authorized official file poster is available
- **THEN** PVW can display it with its real JPEG dimensions and serving engine
- **AND** a passive producer's absent observation does not discard an independent file picture
- **AND** a valid moving picture or current snapshot takes precedence over the poster
- **AND** owner, Bridge, channel, source demand or file-identity changes discard late poster replies
- **AND** the bounded once-per-identity read starts no player, proxy or programme command
- **AND** a static poster does not grant interactive crop authority

### Requirement: Source badges SHALL distinguish availability from decoded preview provenance

Existing A/B badge colors SHALL continue to represent source availability. The
existing badge border SHALL emphasize the engine of the picture decoded on that
surface, with a tooltip naming the preview server. The intended read target alone
SHALL NOT relabel a retained picture or a poster from another server.

#### Scenario: A retained frame remains while B opens

- **GIVEN** a surface displays a decoded frame from A
- **WHEN** a B preview is requested but has not decoded
- **THEN** its existing A badge remains emphasized
- **AND WHEN** the surface accepts a decoded B frame
- **THEN** emphasis moves to its existing B badge
- **AND** placeholder and decode-error states do not claim a serving engine

## ADDED Requirements

### Requirement: CG Bridge SHALL relay a mapped backup programme return without exposing the physical mapping as authority

Every programme picture or sound request SHALL carry an engine A/B and a logical station channel N. CG Bridge SHALL first apply the existing station and principal channel gates to N. For A it SHALL read server A's physical channel N. For B it SHALL require the current valid backup mapping N → M, read server B's core at programme port `9250 + M − 1`, and never accept M from the console, ticket or URL as an authorization input. A missing/held mapping SHALL issue no B ticket and open no B upstream. Neither engine SHALL ever use the 935x preview range.

#### Scenario: A mapped backup picture

- **WHEN** an authorized console requests B for logical CH 1 and the mapping is CH 1 → backup CH 3
- **THEN** CG Bridge opens one well-behaved picture upstream to server B port 9252 and the ticketed URL reveals only engine B and logical CH 1

#### Scenario: An arbitrary backup channel is not reachable

- **WHEN** the console holds logical CH 1 but B's physical CH 4 is not its mapped mirror
- **THEN** no request or ticket can select CH 4, and a fabricated B URL/ticket combination is refused before any upstream opens

#### Scenario: A missing mapping opens nothing

- **WHEN** B is requested for a logical channel whose mapping is absent or held
- **THEN** the ticket request is refused and server B sees no programme picture or sound connection

### Requirement: Programme tickets and return status SHALL identify the physical engine and logical channel

A picture or sound ticket SHALL be bound to engine, logical channel and stream kind, and SHALL open only the corresponding route. Return status SHALL publish engine A/B plus logical channel N, even though B's relay reads physical M, so two watched physical feeds can never collide and per-console channel scope remains on N. A mapping or server-B host change SHALL close affected B viewers, clear their status, and force a fresh mapping/ticket before reconnection.

#### Scenario: Two statuses for one logical channel

- **WHEN** A/N and mapped B/M are watched at the same time
- **THEN** status contains distinct A/N and B/N entries, and each changes independently as its own frames arrive or stall

#### Scenario: A picture ticket cannot open sound or another engine

- **WHEN** a picture ticket is issued for B/N
- **THEN** it opens only B/N's picture route and is refused for B/N sound, A/N picture, and every other logical channel

#### Scenario: Mapping changes while watched

- **WHEN** N's valid mirror changes from M1 to M2 while B/N is watched
- **THEN** the M1 upstream and viewers close, its status disappears, and a later fresh ticket may open only M2

## MODIFIED Requirements

### Requirement: CG Bridge SHALL relay one selected programme sound and each engine's Playout meters, and SHALL never put a token in a URL

CG Bridge SHALL serve each engine/logical-channel sound route on its control port behind a short-lived ticket issued for that engine, logical channel and SOUND. A picture ticket SHALL NOT open it, nor a sound ticket the picture or another engine. The answer SHALL be readable cross-origin as `application/octet-stream` and carry no `.wav` in its path. A uses server A/N; B uses server B's mapped M. Each SHALL read the core's `GET /audio.wav` on that physical programme port by the well-behaved-client rule (one request, then nothing; one upstream per engine/physical channel shared by every listener; closed after the last listener; a silent stream closed and redialled; increasing backoff), and every listener SHALL receive the core's 44-byte WAV header once and then whole 4-byte frames, a slow listener skipping chunks rather than queueing them.

CG Bridge SHALL read `GET /api/cg/meters` at most ONCE per engine while any console needs that engine's meter. A's stream SHALL use only the primary engine's own session; B's stream SHALL use only the backup engine's own session. Each request SHALL carry its bearer in `Authorization`, never in a URL. A events SHALL join physical N to logical N; B events SHALL join physical M back through the valid backup map to logical N. Every relayed reading SHALL identify engine and logical N and be sent only to consoles whose sign-in holds N. A missing token, old Playout, stale reading or unavailable engine SHALL make only that engine's meter unknown/floor and SHALL NOT substitute the other engine.

#### Scenario: One protected meter stream per engine

- **WHEN** consoles watch meters from A and B for authorized logical channels
- **THEN** each Playout engine sees at most one meters stream carrying only that engine's own bearer in `Authorization`, and no token appears in a URL

#### Scenario: Backup readings map M back to N

- **WHEN** B's meter stream reports physical CH 3 and the valid mapping is logical CH 1 → B CH 3
- **THEN** authorized consoles receive an `engine: B, channel: 1` reading; a B reading for an unmapped physical channel is dropped

#### Scenario: The sound relay stays singular per selected source

- **WHEN** two consoles listen to B for the same mapped logical channel
- **THEN** server B sees one `GET /audio.wav` on M's programme port and each listener begins with one WAV header followed by whole frames

#### Scenario: Engine-local meter failure

- **WHEN** the backup engine has no usable session or does not serve meters
- **THEN** B's meter remains unknown/floor while A's picture, sound and meter remain independent and usable

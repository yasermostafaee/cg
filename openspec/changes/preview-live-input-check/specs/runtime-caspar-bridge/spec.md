## ADDED Requirements

### Requirement: CG Bridge SHALL exclusively own a live-input preview lease and SHALL never mutate programme output

Only CG Bridge SHALL call the Playout's official channel-scoped live-preview API. A console renderer SHALL NOT call
that API or open the Playout's raw preview feed. Bridge SHALL authorize the requesting socket for the station and
channel, resolve the selected input from its own current catalogue, and use only its server-side Playout session.

Starting, replacing, stopping or failing a preview SHALL send no AMCP command, address no programme layer, and change
no row, look, source binding, Source default, PGM relay or programme meter. If the accepted Playout contract cannot
guarantee that its live-preview operation is preview-only, Bridge SHALL expose the capability as blocked.

#### Scenario: A successful input check

- **WHEN** an authorized console checks a healthy input for channel 1
- **THEN** the wire contains only the contracted preview-only Playout request and preview-feed reads
- **AND** contains no AMCP line or programme API write and every on-air ledger is byte-identical

#### Scenario: An unauthorized channel

- **WHEN** a console not granted channel 2 asks to check one of its inputs
- **THEN** Bridge refuses before contacting Playout or a preview feed

### Requirement: Preview replacement and cleanup SHALL be owner- and generation-safe

Bridge SHALL hold at most one current live-input preview per Playout programme channel. Each accepted start SHALL
have an opaque owner, preview id, generation and expiry. Operations SHALL be serialized per channel. A new accepted
start SHALL atomically replace the prior generation and notify its owner; a stop, close, disconnect or timeout SHALL
stop upstream only when its owner and generation still match.

Bridge SHALL use a Playout-enforced lease/owner token and conditional delete, or an equivalently precise contracted
mechanism. A stale operation SHALL be an idempotent no-op and SHALL NOT stop a newer preview, including one started by
another console or the Playout client. Bridge SHALL NOT issue an unconditional recovery DELETE after restart.

#### Scenario: A stale dialog closes after replacement

- **WHEN** console A starts generation 7, console B replaces it with generation 8, and A then closes
- **THEN** A is told `replaced`, its close is a no-op, and generation 8's control, picture, sound and meter remain live

#### Scenario: The owner disconnects

- **WHEN** the socket owning the current generation disconnects and no newer owner exists
- **THEN** Bridge conditionally stops that lease, releases every relay and reports it ended

#### Scenario: Bridge restarts

- **WHEN** Bridge restarts without authoritative ownership of an upstream preview
- **THEN** it marks local preview state expired and sends no blind DELETE

### Requirement: Bridge SHALL relay preview picture and optional sound through distinct ticketed resources

Bridge SHALL, after the control API accepts a lease for programme channel `n`, allow the preview subsystem to read
picture from `previewPort(n) = 9350 + n - 1` and sound from `GET /audio.wav` on that same port, subject to the
accepted Playout contract. `previewPort` SHALL be separate from `pgmPort`; the PGM subsystem SHALL continue never to
address `935x`.

Bridge SHALL be a bounded, well-behaved feed client and SHALL hold at most one upstream of each requested resource
for the current generation. It SHALL relay them only behind short-lived tickets scoped to station, channel,
generation and resource. Picture and sound tickets SHALL not substitute for one another, and no Playout bearer,
source id or source URL SHALL appear in a media URL. Sound SHALL have no upstream listener until the current owner
explicitly requests it, unless the accepted meter contract explicitly requires and documents a different path.

#### Scenario: Picture only by default

- **WHEN** a preview becomes live and the operator has not requested sound
- **THEN** Bridge may hold the one picture upstream and holds no sound upstream
- **AND** a picture ticket cannot open sound and a sound ticket cannot open picture

#### Scenario: The PGM port rule survives

- **WHEN** live-input preview reads channel 2 on port 9351
- **THEN** only the preview subsystem made that read
- **AND** `pgmPort(2)` is still 9251 and the PGM relay never addressed 9351

### Requirement: Bridge SHALL keep INPUT preview levels separate from programme levels

Bridge SHALL accept INPUT levels only from the Playout's contracted preview-channel meter surface and SHALL
correlate them to the current preview lease/generation before forwarding them to its owner. Stale, prior-generation,
other-channel and programme-channel events SHALL be discarded. When the stream is stale or the lease ends, Bridge
SHALL publish floor/reset for INPUT without changing its existing PGM meter stream.

#### Scenario: A late preview-meter event

- **WHEN** generation 7 is replaced by generation 8 and a level for generation 7 arrives late
- **THEN** it is discarded and cannot move generation 8's INPUT bars
- **AND** the same channel's PGM levels continue through the unchanged PGM route

### Requirement: Every terminal preview path SHALL clean up and report its real outcome

Bridge SHALL release all resources belonging to a preview generation when the check closes, another input is
selected, the station/channel changes, the user signs out, the owner socket is lost, the lease expires, shutdown is
clean, the feed stalls or Playout revokes it for air priority. A frozen JPEG or last non-floor INPUT level SHALL not
survive. A `409` or contracted revocation SHALL be reported as conflict/replaced without an automatic retry loop.
Unknown response shapes SHALL fail closed.

Start, replace and stop SHALL be audited at their actual outcomes with actor, console, channel and source label, but
without tokens, ids or URLs. Bridge SHALL scrub those values from routine logs as well.

#### Scenario: Air takes priority

- **WHEN** Playout revokes preview because the exclusive input is needed on air
- **THEN** Bridge closes picture and sound, resets INPUT levels and reports the contracted conflict reason
- **AND** sends no retry, AMCP command or PGM mutation

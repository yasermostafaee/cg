## ADDED Requirements

### Requirement: Media preview resources SHALL be verified and scoped to their socket owner

The Bridge SHALL open a preview for a known source on a declared, authorized channel.
It SHALL verify the Engine's media ID, fingerprint revision and exact file, proxy,
preparation and poster paths before relaying those resources. It SHALL give the
console resource-scoped tickets and retain the Engine bearer on the server.

The Bridge SHALL stream GET and HEAD responses with byte-range semantics, response
status and media metadata. Stream backpressure and cancellation SHALL reach the
upstream request.

#### Scenario: Seek through an authorized resource

- **WHEN** the console requests a file range with its preview's file ticket
- **THEN** the Bridge forwards Range and If-Range and streams the Engine's response
- **AND** HEAD and unsatisfiable ranges retain their upstream status and headers
- **AND** a ticket for another preview or resource is refused

#### Scenario: Reject an invalid manifest

- **WHEN** the manifest identifies different media, a mismatched fingerprint or an unexpected resource URL
- **THEN** the Bridge refuses that preview before serving media bytes

### Requirement: Media preview leases SHALL follow current authorization and lifecycle

Media preview tickets SHALL be renewable while their socket owner remains
authorized. The Bridge SHALL recheck the current target and authorization during a
stream. Close, expiry, logout, disconnect, lock or scope loss SHALL revoke the
preview and abort its upstream work. A late open response SHALL respect a newer
selection or a dropped session.

#### Scenario: Close during an outstanding open or stream

- **WHEN** the owner closes or disconnects while preview work is pending
- **THEN** the old work cannot recreate an active preview
- **AND** an established stream is cancelled

#### Scenario: Authorization changes during playback

- **WHEN** the owner loses the required channel, permission or unlocked state
- **THEN** subsequent resource reads are refused and the active stream is aborted

### Requirement: Read-only media previews SHALL resolve the serving Engine independently

Verified Playout topology SHALL select the configured A or B preview target.
Resolving B SHALL use B's own authentication, mapped channel and local media ID
matched by verified fingerprint. Cached source identity MAY resolve that B copy
while the primary catalogue is unavailable.

#### Scenario: Read the matching B copy while A is unavailable

- **WHEN** verified topology selects B and A's API or catalogue becomes unavailable
- **THEN** the Bridge resolves the cached fingerprint in B's local library
- **AND** the preview uses B's own token, local media ID and mapped channel
- **AND** the read-only file stream can continue independently of programme commands

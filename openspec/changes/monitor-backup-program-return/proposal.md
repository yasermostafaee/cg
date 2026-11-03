## Why

An operator can currently see only server A's programme return, so a configured backup Playout cannot be checked beside the active output before or during failover. The client asked for both programme pictures to be optionally visible at once, with sound and meter ownership kept unambiguous.

## What Changes

- Keep PROGRAM monitor modes for server A, server B, and A + B visible even before a backup is configured; an unavailable B remains a black, labelled no-signal tile and opens no stream until the selected logical channel has a valid backup mapping.
- Label each picture by physical server and channel and report each return's signal independently, including stalled or unavailable backup feeds without retaining a stale frame.
- Keep one local monitor-audio path: the operator chooses A or B, the selected source owns the speaker, loudness badge, and VU meter, and the two outputs are never mixed. This changes only CG Control monitoring and never the on-air mix.
- Extend the programme-return ticket, status, sound, and meter contracts with an engine identity. Server B requests stay scoped to the console's logical channel and are translated by CG Bridge to the mapped physical backup channel.
- Read server B's protected meter stream with the backup engine's own session; no Playout setting is changed and no new Playout endpoint is required.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-ui`: PROGRAM can render one or both engine returns and exposes one explicit local audio/meter source.
- `runtime-caspar-bridge`: CG Bridge securely relays mapped programme picture, sound, state, and meter readings from both engines.

## Impact

This changes `@cg/shared-ipc`, CG Bridge's ticketed HTTP relays and meter readers, the Runtime bridge contract and WebSocket implementation, and CG Control's PROGRAM monitor UI. It depends on the existing server-B channel map and backup-engine session; backup meters require the already-supported Playout meters endpoint on that engine.

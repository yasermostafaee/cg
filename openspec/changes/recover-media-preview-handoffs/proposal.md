# Recover a verified media-preview engine handoff

## Why

Changing the Playout's active Engine revokes the old local media-preview stream. The
player currently treats that stream failure as a codec error and requires another Play.
Programme playback is unaffected; this change concerns the source picker's local preview.

## What Changes

- Add an optional `recovery: target-changed` reply for an unavailable held preview.
- Issue the hint only after independently verifying an authenticated A/B target change
  with the same known media fingerprint, scoped to the original owner and source.
- Probe a failed held stream and permit one fresh lease acquisition only on that hint.
- Preserve local position, Play/Pause and listening intent through preparation and playback.
- Discard delayed recovery after Stop, selection, covering, logout or supersession.

## Impact

Shared IPC, Bridge media-preview lease management and Runtime local media preview change.
No programme transport or persisted settings change. Older replies without the optional
hint retain the existing manual retry behavior.

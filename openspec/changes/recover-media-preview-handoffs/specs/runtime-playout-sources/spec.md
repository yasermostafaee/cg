## ADDED Requirements

### Requirement: Local media previews SHALL recover only a verified engine handoff

The Bridge SHALL return `recovery: target-changed` only with an unavailable response for
a held preview after reauthorizing the same owner, channel and source and verifying an
A/B target change with matching known fingerprints. Explicit close, logout, expiry and
owner disposal SHALL invalidate any retained handoff proof.

On this hint, the local player SHALL permit one fresh lease acquisition and retain
position, playing or manually paused intent, and listening state. A failed stream SHALL
first probe its held ID. An unchanged lease, authorization failure, fingerprint failure
or browser codec error without verified handoff proof SHALL NOT cause automatic fresh acquisition.

#### Scenario: The playing preview moves from A to B

- **WHEN** the old A preview is revoked and its authorized held-ID probe reports a verified B handoff
- **THEN** the player acquires one fresh B lease and resumes at the retained position
- **AND** proxy preparation preserves playing and listening intent
- **AND** no programme transport command is sent

#### Scenario: The manually paused preview moves back to A

- **WHEN** renewal reports a verified B-to-A handoff for a manually paused preview
- **THEN** the replacement retains its position and remains paused

#### Scenario: A handoff is cancelled while its reply is delayed

- **WHEN** Stop, selection change, covering or owner cleanup supersedes a pending recovery
- **THEN** its delayed lease is closed without adoption or automatic playback
- **AND** a later explicit Play requests its own fresh lease

#### Scenario: The failed stream is not a verified handoff

- **WHEN** a held-ID probe has no verified handoff hint or the browser reports a known decode failure
- **THEN** the player preserves the terminal failure and requires explicit Play to retry

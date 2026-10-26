# Tasks — preview-live-input-check (C-023)

## 0. Contract gate — BLOCKED / WAITING FOR PLAYOUT

- [x] 0.1 Replace C-023's obsolete periodic-thumbnail proposal with the owner's current request: one live input,
      moving picture plus optional sound, started from PVW or Source defaults
- [x] 0.2 Record the read-only Playout `2.12.0` findings and the `/openapi/v1.json` `PROPFIND` generator failure;
      perform no POST or DELETE during recon
- [x] 0.3 Send
      `docs/integration/playout/CG-CONTROL-REQUEST-LIVE-INPUT-PREVIEW-2026-10-26.md` for exact DTOs, responses,
      authorization, preview-meter and lease/owner/TTL/conditional-delete semantics
- [ ] 0.4 Receive a versioned response with copy-paste request/response/error examples and a repaired/exported OpenAPI
      operation; adopt it in the integration record without inference
- [ ] 0.5 Decide from that response whether the official Playout endpoint fully supersedes the unimplemented
      Playout-input MON/PFL mechanism in `add-multibox-audio`; record the decision in both changes

> **Hard gate:** tasks 1–6 SHALL NOT start until 0.4 answers the wire, authorization and ownership questions. In
> particular, do not prototype with an invented POST body or unconditional DELETE.

## 1. Red-first shared contract

- [ ] 1.1 Add versioned IPC schemas for start/stop/status, opaque preview id/generation, source label, expiry and stable
      error codes; carry no source URL or Playout credential
- [ ] 1.2 Add separate ticket requests for INPUT picture and sound; prove resource/channel/session scoping, expiry and
      that neither ticket opens a PGM resource
- [ ] 1.3 Add preview-meter events keyed by station, channel and preview generation; prove a PGM meter event can never
      satisfy an INPUT subscription and vice versa
- [ ] 1.4 Add compatibility tests for an older Bridge: the console shows the feature as unavailable rather than
      interpreting a missing method as an empty source

## 2. Red-first Bridge lifecycle and race tests

- [ ] 2.1 Contract-fixture tests for the accepted saved-input POST, success body, conditional DELETE, auth headers and
      every documented `4xx/5xx` response
- [ ] 2.2 Prove one upstream preview per Playout channel; start B replaces A atomically and tells A `replaced`
- [ ] 2.3 Prove a late close/delete/disconnect for generation A cannot stop B, including a Playout client competing
      with CG Bridge under the accepted owner-token contract
- [ ] 2.4 Prove cleanup on card close, source replacement, station/channel change, sign-out, owner-socket loss, TTL,
      clean shutdown and Bridge restart; prove no blind recovery DELETE
- [ ] 2.5 Prove air priority: upstream `409`/revocation closes relays and reports conflict without retrying, changing
      PGM or sending AMCP
- [ ] 2.6 Prove stalled MJPEG/WAV/meter paths close, drop their last frame/level and reconnect only where the accepted
      contract permits; no tight loop
- [ ] 2.7 Assert zero programme/API/AMCP writes for every success, refusal, race and cleanup branch except the exact
      contracted preview-only POST/conditional DELETE

## 3. Bridge implementation

- [ ] 3.1 Add the authenticated Playout live-preview client from the adopted schema, using Bridge's server-side
      session and existing refresh/retry doctrine only where the contract permits
- [ ] 3.2 Add the per-channel serialized lease manager with socket owner, generation, TTL and conditional stop
- [ ] 3.3 Add `previewPort` and the bounded, well-behaved MJPEG and optional WAV readers for `9350 + n - 1`; leave
      `pgmPort` and every `/pgm` rule unchanged
- [ ] 3.4 Add ticketed INPUT picture/sound relays, socket-scoped status/meter delivery, audit outcomes and scrubbed logs
- [ ] 3.5 Reuse catalogue/channel availability predicates; refuse absent, unusable, unavailable or incompatible inputs
      without changing their bindability elsewhere

## 4. Red-first Runtime UI

- [ ] 4.1 DOM tests: `Check input` is reachable by pointer and keyboard from PVW and an Inputs row in Source defaults;
      the latter leaves the dialog, draft selection, dirty state and saved defaults unchanged
- [ ] 4.2 DOM/e2e tests: both entry points target one PVW card carrying source/channel label and honest
      connecting/live/stalled/unavailable/conflict/replaced/expired states; a stale picture is removed
- [ ] 4.3 Prove every new check starts sound off even when PGM sound is remembered on; only an explicit gesture starts
      it, and every cleanup path stops and resets it
- [ ] 4.4 Prove `PVW INPUT` meter accepts only the active generation and falls to floor on stale/stop; the existing PGM
      picture, speaker preference, `PGM` label and meter data remain unchanged
- [ ] 4.5 Accessibility and directionality: focus/return, screen-reader labels, live state announcement, Persian source
      isolation, compact-window layout and reduced motion

## 5. Runtime implementation

- [ ] 5.1 Add the one PVW live-input check card and two entry actions without touching the rehearsal iframe or live
      placeholder compositor
- [ ] 5.2 Add picture/status lifecycle, opt-in session-local sound and the separately labelled INPUT meter
- [ ] 5.3 Keep Source defaults open and unsaved while launching a check; close only the picker layer if its existing
      interaction contract requires it, then restore focus correctly
- [ ] 5.4 Handle older/blocked Bridge, permission denial and Playout conflicts with operator-facing source/reason text

## 6. System verification and closeout

- [ ] 6.1 Run focused shared, Bridge and Runtime tests, workspace typechecks/lint and the repository full gate
- [ ] 6.2 On a safe Playout channel, verify saved SDI, NDI and network inputs; picture, optional sound and INPUT meter;
      replacement and every cleanup path
- [ ] 6.3 Observe PGM independently while starting, replacing, failing and stopping preview; prove picture, sound,
      on-air look, programme layers and PGM VU are unchanged
- [ ] 6.4 Exercise two consoles and the Playout UI concurrently, including stale close and air-priority revocation;
      capture owner/lease evidence
- [ ] 6.5 Record CPU/network cost and firewall reachability; confirm the renderer never contacts Playout or `935x`
      directly
- [ ] 6.6 Re-read C-023, the accepted Playout response and all three deltas against the implementation before archive

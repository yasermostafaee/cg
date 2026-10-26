# preview-live-input-check — check one live input in PVW before it is put on air

PRD: `C-023` (`docs/prd/caspar.md`). Playout contract request:
`docs/integration/playout/CG-CONTROL-REQUEST-LIVE-INPUT-PREVIEW-2026-10-26.md`.

## Status

**BLOCKED / WAITING FOR PLAYOUT CONTRACT.** Read-only recon on Playout `2.12.0` proves that
`POST` and `DELETE /api/v1/channels/{code}/live-preview` exist and that the corresponding preview picture and
sound are served on the `935x` feed. It does not prove the write DTOs, success/error response shapes,
authorization policy or ownership semantics. `/openapi/v1.json` currently returns `500` because its generator
encounters an unsupported `PROPFIND` action. No production implementation may begin by guessing those facts.

## Why

An availability tag says whether Playout can currently route an input; it does not tell an operator whether the
picture is the intended camera, whether it is black or colour bars, or whether sound is present. The operator needs
to check one selected live input before assigning or taking it, from the normal PVW workflow and while editing Source
defaults.

The existing PGM monitor cannot answer this question. It shows the programme output and its programme meter. In a
multi-box look the playlist output may not even be one of the visible boxes, yet the PGM meter still correctly
describes the final programme mix. Re-labelling that meter as an input meter would be false.

## What Changes

- Add an explicit `Check input` action for one Playout live source in the PVW workflow and in the Source defaults
  dialog. Starting it from Source defaults opens the same PVW check surface and does not save or alter defaults.
- Show the selected input's live picture, current state and a distinct `PVW INPUT` level meter. Optional monitoring
  sound is off at the start of every check and begins only after an operator gesture.
- Keep the existing PGM picture, speaker preference and VU meter unchanged and visibly separate. The input check is
  never composited into the rehearsal page or described as programme output.
- Make CG Bridge the only lifecycle owner. It starts/replaces/stops the Playout preview, relays picture, optional
  sound and meter data behind the console's existing authorization fence, and cleans up on close, replacement,
  disconnect, timeout and restart.
- Require generation/owner-safe stop semantics so a stale dialog or socket cannot delete a newer client's preview.
  The Playout programme channel, programme layers and PGM relay are never mutated by this feature.
- Surface `connecting`, `live`, `stalled`, `unavailable`, `conflict`, `replaced` and `expired` honestly; never leave a
  frozen frame looking live.

## Capabilities

### Modified Capabilities

- `runtime-ui`: add the two entry points, one PVW check surface, opt-in sound and a separate input meter while leaving
  the PGM monitor contract unchanged.
- `runtime-caspar-bridge`: own the authenticated Playout preview lease and ticketed relays, serialize replacement and
  cleanup, and guarantee that no programme or AMCP mutation is possible.
- `runtime-playout-sources`: identify the checked source from the bridge-owned catalogue without changing bindings,
  defaults or source availability rules.

## Impact

- Expected production areas after the contract is unblocked: Runtime PVW and SourcePicker/Source-defaults UI,
  shared IPC schemas, bridge Playout client, preview relay and lifecycle manager.
- The official Playout `live-preview` API and preview feed are the intended plant path; no new CasparCG monitor
  channel, frame-grab loop or direct renderer-to-Playout connection is introduced.
- `add-multibox-audio` remains the source of the shipped/on-air plate-audio controls. Its unimplemented proposal for
  a CG-owned MON/PFL channel array is not implemented in parallel for Playout inputs if this official endpoint can
  satisfy the contract; that relationship is decided only after the requested response.
- No persisted template, row, look, source-default or PGM-audio schema changes are required.

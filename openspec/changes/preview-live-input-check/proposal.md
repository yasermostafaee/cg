# preview-live-input-check — check one live input in PVW before it is put on air

PRD: `C-023` (`docs/prd/caspar.md`). Playout contract request:
`docs/integration/playout/CG-CONTROL-REQUEST-LIVE-INPUT-PREVIEW-2026-10-26.md`.

## Status

Playout's 2.18.12 handoff supplies the request, authorization, ownership and feed contracts.
The Bridge requires lease capability v1 before opening a check. See the
[accepted response](../../../docs/integration/playout/PLAYOUT-CG-RESPONSE-LIVE-PREVIEW-v1.md)
for the native test evidence and the read-only 2.18.14 and 2.18.15 station checks.

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
- Reserve a thumbnail slot on each input row and give Station setup a larger 16:9 slot. Show `No signal` in the slot until the independent feed is
  available, and open the existing one-input check when the operator activates an eligible slot.
- Use Playout's existing static library poster for Media items in the source pickers.
- With a compatible read-only Playout capability, show each visible eligible input's live thumbnail in that slot
  as soon as the source list opens.
- Place independent silent snapshots into the assigned PVW plates on a compatible 2.18.17 station.
  Keep the explicit check, its input meter and optional sound separate.

## Capabilities

### Modified Capabilities

- `runtime-ui`: add the two entry points, one PVW check surface, opt-in sound and a separate input meter while leaving
  the PGM monitor contract unchanged.
- `runtime-caspar-bridge`: own the authenticated Playout preview lease and ticketed relays, serialize replacement and
  cleanup, and guarantee that no programme or AMCP mutation is possible.
- `runtime-playout-sources`: identify the checked source from the bridge-owned catalogue without changing bindings,
  defaults or source availability rules.

## Impact

- Production areas include Runtime PVW and SourcePicker/Source-defaults UI,
  shared IPC schemas, bridge Playout client, preview relay and lifecycle manager.
- The official Playout `live-preview` API and preview feed are the intended plant path; no new CasparCG monitor
  channel, frame-grab loop or direct renderer-to-Playout connection is introduced.
- `add-multibox-audio` remains the source of the on-air plate-audio controls. This lease satisfies its separate
  one-input Playout MON/PFL check. Multi-input monitoring and programme audio control remain outside this change.
- No persisted template, row, look, source-default or PGM-audio schema changes are required.

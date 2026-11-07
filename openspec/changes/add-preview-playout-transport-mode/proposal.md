# Change: Add Preview playout transport mode

## Why

Designer Preview currently mixes timeline authoring controls with lifecycle rehearsal. Authors need
to inspect the exported Play / Next / Stop behaviour without changing the familiar linear timeline
preview or mistaking step-forward for the broadcast Next command.

## What Changes

- Add an explicit Rehearse toggle beside the ordinary Preview loop controls.
- Keep normal Preview Play as a linear frame-zero-to-end timeline pass.
- In Rehearse mode, replace loop, ping-pong and frame-step controls with Play / Next / Stop.
- Drive those commands through the existing preview runtime lifecycle without mutating project data.
- Keep Stop cursor timing deterministic: display a real authored Outro, otherwise settle at the end;
  give the folder-backed Quran starter a smooth authored close instead of an immediate clear.

## Impact

- Affected PRD: D-199.
- Affected capability: `designer-playout-lifecycle`.
- Affected app: `@cg/designer`.

# Media timing authoring has one clear Follow composition path

## Why

The Video and Lottie inspectors currently offer two ways to create timing for a clip that has no
usable authored phases: **Add phase marks** and **Follow composition**. The first path seeds guessed
manual values, while the second expresses the operator's actual intent and remains synchronized with
the composition. Showing both makes a routine choice look technical. Per-media Hold and Freeze-frame
controls also duplicate the composition Playback policy and can disagree with its cursor. A normal,
accepted hold-to-outro seam is styled like an error.

## What changes

- A marker-less/phase-less Video or Lottie offers **Follow composition** as its only phase-authoring
  action. The Inspector no longer creates guessed manual phase marks.
- Existing manual and marker-sourced phases remain schema/runtime compatible and editable. They can
  still be attached to Follow or detached back to manual; no stored project is migrated or rewritten.
- Under Follow, media timing remains read-only. The composition Playback section is the only place
  that authors Freeze or Loop middle and its repeat participants.
- Composition Freeze holds every element at the composition Out point; a Follow media Inspector may
  show the derived clip time/frame but cannot override it.
- The accepted hold-to-outro seam note uses neutral information styling. Red styling is reserved for
  timing states that are invalid or require corrective action.

## Impact

- `apps/designer/src/renderer/features/inspector/StyleSection.tsx`
- Designer inspector tests for Video/Lottie phase authoring and follow hints
- No stored manual-phase migration
- Runtime/schema removal of the superseded Video override is tracked by D-186/D-187
- PRD D-176

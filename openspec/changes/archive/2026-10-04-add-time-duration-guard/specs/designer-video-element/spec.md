# designer-video-element — delta (add-time-duration-guard / D-151, 2026-08-13)

The add-time duration guard covers ALL THREE content kinds the D-151 item names — video, Lottie,
and composition-into-composition insert — but is specified ONCE, here, beside the video
capability whose import/place flow (D-128) is the primary door: three near-identical requirements
across three specs would be the rule-copy failure mode this codebase catalogues. The Lottie and
composition scenarios below are normative for those kinds.

## ADDED Requirements

### Requirement: Adding content longer than its host raises the duration guard at ONE chokepoint

The Designer SHALL raise a confirm dialog BEFORE anything is inserted WHEN content is ADDED to a
scene or composition and its intrinsic duration exceeds the host's duration, naming BOTH
durations concretely (e.g. "this clip is 5.0 s; the composition is 2.0 s"). The comparison SHALL
use one derivation per kind, from stored facts: a video's `durationMs` (captured at conversion);
a Lottie's clip length `(op − ip) / fr` at the CREATION default speed 1× (the element does not
exist yet, so an authored speed cannot apply); a nested composition's own active-range length at
the project frame rate. The host's duration SHALL be its active-range length (`activeRangeOf` —
the existing authority, reused, never re-derived).

The guard SHALL sit at ONE chokepoint that EVERY add door passes through — the assets-panel place
actions, the canvas drag-drop, and the composition insert alike — never one guard per door.
Duplicating or pasting an element already in the scene is NOT an add in this sense and SHALL NOT
raise the dialog: the item's trigger is adding content, not copying content already accepted.

The trigger is ADD-TO-SCENE, explicitly NOT asset-import time: importing an asset into the
library fires nothing, regardless of its duration.

#### Scenario: A longer clip raises the dialog naming both durations

- **WHEN** a 5 s video (or Lottie) is added to a 2 s composition by any add door
- **THEN** the dialog appears before anything is inserted, naming the content's and the host's
  durations concretely

#### Scenario: A fitting add is silent

- **WHEN** a 1 s video is added to a 2 s composition
- **THEN** no dialog appears and the element is added exactly as today

#### Scenario: Import to the library never fires the guard

- **WHEN** an asset of any duration is imported into the library
- **THEN** no dialog appears — the guard's moment is add-to-scene, where a host exists to be
  measured against

#### Scenario: Every add door passes through the guard

- **WHEN** the same oversized asset is added via the assets panel place action and via canvas
  drag-drop (and, for a composition, via the compositions panel insert)
- **THEN** every door raises the same dialog through the same chokepoint — a door that bypasses
  the guard is the on-air-discovered bug this item exists to prevent

### Requirement: The dialog offers the owner's settled choice split — three for media, two for a composition

For VIDEO and LOTTIE content the dialog SHALL offer exactly three choices:

1. **Extend the composition** — the host's duration grows to EXACTLY fit the content (ceil to
   whole frames at the composition's frame rate), THEN the element is added. The extension SHALL
   go through the SAME store action the timeline's duration field uses (so the timeline and undo
   agree), and extend + add SHALL be ONE undo step.
2. **Add as backdrop — follow the composition** — the element is added with
   `phases.source: 'composition'` (the `media-phases-follow-composition` mode, claim-least
   slots), the host's duration untouched. `holdAt` is NOT asked for in the dialog — the operator
   tunes it in the Inspector, which seeds it from the shared midpoint helper. One dialog, three
   buttons, no nested configuration.
3. **Cancel** — the element is NOT added; the scene is left EXACTLY as it was (byte-identical).

For a COMPOSITION-INTO-COMPOSITION insert the dialog SHALL offer TWO choices — Extend / Cancel —
because an instance has no `phases` and cannot follow: the owner's settled answer (sharpened
Candidate A) covers media; comp-insert keeps the item's firm decline-means-not-added form.

The backdrop choice SHALL be offered even when the host has no lifecycle/out-point — a control
that appears and disappears by host state is harder to learn than one that explains itself; the
added follower behaves marker-less until an out-point exists and the Inspector's existing
explanation says why. The dialog SHALL follow the shared `Modal` pattern (role `dialog`,
`aria-modal`, focus trap — the semantics are part of this requirement, not the styling).

#### Scenario: Extend grows the host to exactly fit, as one undo step

- **WHEN** the operator chooses Extend for a 5 s clip in a 2 s composition at 25 fps
- **THEN** the host's duration becomes exactly 125 frames (ceil to whole frames), the element is
  added, and ONE undo restores both the duration and the absence of the element together

#### Scenario: Backdrop adds a follower and touches nothing else

- **WHEN** the operator chooses "Add as backdrop — follow the composition"
- **THEN** the element is added with `phases.source: 'composition'`, the host's duration is
  untouched, and the Inspector shows the follow state already on

#### Scenario: Cancel leaves the scene byte-identical

- **WHEN** the operator cancels the dialog
- **THEN** the element is not added and the stored scene is byte-identical to before the add

#### Scenario: Lottie parity

- **WHEN** an oversized Lottie is added by any door
- **THEN** the same three-choice dialog and the same three outcomes apply, with the intrinsic
  duration derived at 1× speed

#### Scenario: A composition insert offers the two-choice form

- **WHEN** a composition longer than its would-be host is inserted into another composition
- **THEN** the dialog offers Extend and Cancel only — no backdrop button — and both behave as
  specified above

#### Scenario: The backdrop choice survives a host with no out-point

- **WHEN** the host composition has no lifecycle when an oversized clip is added
- **THEN** the backdrop choice is still offered, the added follower behaves marker-less until an
  out-point exists, and the Inspector's existing no-anchors explanation says why

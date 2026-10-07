## MODIFIED Requirements

### Requirement: The dialog offers the owner's settled choice split — three for media, two for a composition

For VIDEO and LOTTIE content the dialog SHALL offer exactly three choices:

1. **Extend the composition** — the host's duration grows to EXACTLY fit the content (ceil to
   whole frames at the composition's frame rate), THEN the element is added. The extension SHALL
   go through the SAME store action the timeline's duration field uses (so the timeline and undo
   agree), and extend + add SHALL be ONE undo step.
2. **Add as backdrop** — its long form, _Add as backdrop — follow the composition_, is the button's
   `title` (`B-319`: the long label was what pushed `Cancel` out of the dialog). The element is
   added with `phases.source: 'composition'` (the `media-phases-follow-composition` mode,
   claim-least slots), the host's duration untouched. `holdAt` is NOT asked for in the dialog — the
   operator tunes it in the Inspector, which seeds it from the shared midpoint helper. One dialog,
   three buttons, no nested configuration.
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

- **WHEN** the operator chooses "Add as backdrop" (titled "Add as backdrop — follow the composition")
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

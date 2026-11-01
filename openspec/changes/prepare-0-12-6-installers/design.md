# Design — 0.12.6 installer candidate

## One matching set

The authoritative version sources, installer filenames, Installed apps, application surfaces and
CG Bridge health all derive from `0.12.6`; packaging refuses drift.

`B-357` changes CG Bridge's Windows folder permissions and adds the station-admin Shared files path
to CG Control. Designer changes only its release identity and splash presentation. The station still
receives one matching three-installer set.

The installed identity is visible before application startup completes: both app splashes show the
real package version in a high-contrast badge. Setup remains one product family but no longer three
near-identical dark windows: Control stays neutral, Bridge is teal with its own connection icon, and
Designer is blue. The Persian guide uses relaxed line and paragraph spacing.

The Designer multi-selection Inspector treats any selection containing an aspect-locked Live Source
as one guarded editing state: `Scale X` and `Scale Y` stay visible for discoverability but are
disabled because independent scale axes cannot satisfy that plate's aspect lock. This also applies to
mixed selections such as a Live Source plus a rectangle. Unlocking every selected plate restores the
shared controls.

A Live Source is also guarded at the canvas boundary: its single-selection Gizmo retains move and
resize but does not render the outside-corner rotation zones. The rotation gesture independently
refuses a Live Source so a future caller cannot bypass the axis-aligned playout contract.

The same homogeneous Live Source multi-selection exposes `Auto layout`. Its pure layout function
splits the selection into near-square rows, with an explicit top/bottom remainder choice for odd
layouts. The author sets horizontal and vertical gaps independently; a two-plate selection can be
horizontal or vertical, and a seat-order action reverses spatial order without changing layer/z
order. Gap edits update the current arrangement live, while changing the two-plate direction is an
immediate one-shot rearrangement; neither requires a second `Arrange` click. Every row shares one
computed frame height; each plate width follows its own declared
aspect. This keeps the requested gaps exact even for mixed aspects and centres every row and the
complete group. Applying all position, size, scale and rotation values is one history entry and uses
the normal keyframe-aware transform commit path.

## Evidence sequence

1. Set the shared version and Persian guide to `0.12.6`.
2. Run the full local gate and E2E lane.
3. Push one installer-marked candidate to `dev`; require Linux workspace/E2E and every applicable
   Windows job, including Bridge install/upgrade ACL smoke.
4. Download and checksum the exact artifacts into `installers-ci-0.12.6/` and `dist/`.

No tag, draft release or published release is created.

## Recorded evidence

Pending verification and delivery.

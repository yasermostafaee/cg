# Design

## Canvas-width ownership

The decision uses the already measured Canvas viewport width, not `window.innerWidth`: the fixed left
rail and Inspector determine the space actually available to the header. Below `650px`, Select and
Hand remain direct because they are the two navigation tools; every placement tool and the
multi-frame action moves into one keyboard-labelled menu. The Look picker and zoom controls keep
their positions and never overflow the header.

## Look visibility ownership

A registered Look instance is a managed one-of-N root. `setActiveLook` resolves that instance's
visibility more specifically than authored `element.visible`, so an ordinary eye cannot truthfully
control it. The timeline identifies managed instance ids through the scene's Look group and omits
only that eye. Elements inside a Look are not managed root instances and retain their ordinary eye.

## Look visual identity

Registration, not a `look-*` naming convention, determines whether a composition is a Look. The
Compositions panel resolves each registered Look instance to its referenced composition, then uses a
multi-panel glyph and a slim row accent from the semantic Look colour token. Names and section
headings remain neutral so violet does not flood the hierarchy. The corresponding root instance uses
the same glyph and a violet lifespan bar while its name stays neutral. Blue remains selection/open
state and red remains lock/error state, so Look violet communicates type only. No default badge or
Set-default action is exposed: the operator chooses the active Look before Take. The schema's first
Look fallback remains internal for compatibility and malformed/legacy-document safety.

## One lifecycle surface

The Compositions panel partitions by registered identity at render time: ordinary compositions keep
their project order in the upper list and registered Look compositions keep their project order in a
lower Looks section. This derived partition means adding an ordinary composition after any Look can
never place it below Looks, without rewriting persisted composition order. The Looks header owns an
accessible icon-only **Add Look** action and group removal; context actions own Show, rename and
delete. There is no user-facing default designation; an empty group and ordinary compositions
therefore cannot be mislabeled through `undefined === undefined`. The
Inspector retains used-source readouts and actionable refusals, but renders no permanent empty/help
copy.

A Look's registration, home-document instance and backing composition are one lifecycle object.
Deletion resolves the immutable instance-to-composition relation and removes all three atomically;
names are never used as identity. Group removal applies the same transform to every Look, removes the
group marker and commits once so Undo restores the whole group. Empty groups remove directly. A
non-empty group opens the shared destructive-confirm modal and names the number of Looks whose
compositions will be deleted.

## Preview Look switching

Preview owns a session-only Look id seeded from the authoring canvas when that id belongs to the
previewed group, otherwise from the schema's tolerant fallback. A wrapping button group with its own
heading appears below Preview's
fixed transport controls only when there is a real choice. Changing it sends the existing runtime
`look` command directly to the dedicated Preview iframe; it does not write the project, the canvas
selection or the internal fallback. The choice is re-sent when the iframe boots and the runtime
keeps it across timing-driven scene rebuilds.

Variables keeps the full nested payload contract but removes presentation-only noise: a composition
or Look namespace whose entire descendant aggregate has no editable fields is not rendered. A
non-empty nested namespace keeps its heading because that heading still disambiguates the payload
scope.

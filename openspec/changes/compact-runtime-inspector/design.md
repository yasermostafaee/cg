## Layout

Use independent disclosure buttons for Layer details, Position and Timing. They start expanded. Keep
the selected row, template and state in the details summary. The Position summary reads the same
effective position as its expanded controls and shows the existing draft marker when applicable.
Use the existing field controls and layout tokens. Simple values share a row with their labels
where the panel has room. Complex editors use the available field area and keep their labels,
groups and item controls.

Timing is above Position. Shared grids align labels above the Position, Preset effect and
Input effect controls and respond to the width of the Inspector. Preset buttons retain
space for a second status line. The body is the only scrollport and the commit footer
sits in its own row.
The Position, Preset effect and Input effect groups share the approved fill (`#182330`)
and outline (`#283747`) from the Runtime theme.

## Interaction

The disclosures use native buttons and expose the expanded state and controlled region. The
workspace retains section visibility when the operator switches layers, including after dismissing
the narrow Inspector overlay to select the next row. Position, Timing and field drafts stay with their
respective layers in the existing draft store and use the Update and Discard actions in the footer.

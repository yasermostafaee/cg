# Keep Sequence glyphs inside the authored viewport

A full-resolution project can still lose glyphs inside a short Sequence box when a custom font's
ink crosses its declared line box. Correct the resting vertical position of a fitting one-line
text item while preserving the Sequence clip and authored transitions.

## Capabilities

- `designer-sequence-element`: prevent font overhang from cropping settled Sequence text.

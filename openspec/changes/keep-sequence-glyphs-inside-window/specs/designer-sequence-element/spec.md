## ADDED Requirements

### Requirement: A fitting Sequence text item SHALL retain its visible glyphs

The shared renderer SHALL keep the visible vertical ink of a one-line Sequence text item
inside the authored Sequence window when the ink fits and would otherwise cross its edge.
The authored window SHALL keep clipping items in motion. Image and composition items
SHALL keep using the same authored clip.

#### Scenario: Persian glyphs extend below a fitting line box

- **GIVEN** a one-line text item uses a font whose ink extends outside its line box
- **WHEN** the visible ink fits within the height of the authored Sequence window
- **THEN** the settled text keeps its full visible ink in Preview and on the output page
- **AND** the authored Sequence viewport and its transition clip retain their original size

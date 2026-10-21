## ADDED Requirements

### Requirement: A video whose file is missing shows the missing picture as its still frame

A video element SHALL show the "missing image" picture as its still frame when its asset resolves
to no URL — missing, or not yet primed — on the canvas and in Preview (one preview document): the
same picture an unresolved image shows, as the video's `poster`, with the `data-cg-missing` marker
(`B-138`, the owner's decision 2026-10-14, Q3 (a)). It SHALL NOT paint nothing. When the file later
resolves, the missing picture SHALL be dropped and the video SHALL load as usual.

#### Scenario: A missing video shows the picture

- **WHEN** the canvas holds a video element whose asset resolves to no URL
- **THEN** the element carries `data-cg-missing`, its poster is the missing picture, and the pixels
  Chromium paints in its box are that picture's fill — not the page behind it

#### Scenario: The picture goes when the file resolves

- **WHEN** a video that was missing gets its file's URL
- **THEN** the missing picture is removed and the marker cleared

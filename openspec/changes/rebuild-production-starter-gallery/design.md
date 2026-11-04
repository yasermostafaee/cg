# Design: Production starter gallery

## Gallery shape

The existing five D-119 starters remain stable examples and are revalidated rather than silently
discarded. Six new Persian starters cover the missing workflows. Each starter is a normal `Scene`,
loads as an editable project, seeds Vazirmatn, has a real playout lifecycle and appears with a poster
captured from the same scene.

The new set is:

1. `azadegan-table` — a one-page standings board with Persian team names and Persian-facing copy;
2. `iran-weather-pages` — province-capital cards split across Sequence pages, each page containing a
   Repeater of weather rows;
3. `iran-weather-forecast` — today plus upcoming days in one full-frame composition;
4. `image-folder-sequence` — an image Sequence whose authoring metadata demonstrates folder-backed
   replacement;
5. `countdown-steps` — target-time countdown with remaining-time Steps changing the treatment;
6. `multibox` — a polished multi-source layout with a designed background and labelled plates.

## Data and operator editing

League rows and weather rows are ordinary list fields. The weather-page starter keeps the existing
division of responsibility: Repeater owns rows and Sequence owns pages. The forecast starter uses a
single Repeater without requiring Sequence. Defaults are complete enough to render immediately, and
field labels/data keys are useful in Preview and CG Control.

All displayed Persian numerals are presentation choices; canonical numeric field values remain
numbers. No starter introduces a special parser or hard-coded weather vocabulary into runtime code.

## Visual verification

Each new scene is rendered at a representative frame and compared at landing-card size and at the
scene's authored raster. Tests guard schema validity, lifecycle ownership, required feature elements,
complete defaults and catalog order. Poster files are generated from the actual scenes rather than
drawn as unrelated marketing thumbnails.

## Non-goals

- Customer branding or customer packs.
- Live sports/weather feeds.
- An English Premier League example.
- New runtime schema solely for a starter.

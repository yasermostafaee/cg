# Design: Production starter gallery

## Gallery shape

The existing five D-119 starters remain stable examples and are revalidated rather than silently
discarded. Six new Persian starters cover the missing workflows. Each starter is a normal `Scene`,
loads as an editable project, seeds Vazirmatn, has a real playout lifecycle and appears with a poster
captured from the same scene.

Each card also owns a tiny VP9 WebM generated from sampled real Preview frames. The 26-frame clip
plays at 12 fps (about 2.2 seconds), deliberately compressing a longer entrance/content sample into
a quick visual summary rather than mirroring broadcast timing. Videos are silent, loop only while
the card is hovered or focused, use `preload="none"`, return to frame zero on leave and do not play
under `prefers-reduced-motion: reduce`.

The new set is:

1. `iran-premier-league-table` — a one-page standings board with Persian team names/digits and no
   update-date decoration;
2. `iran-weather-pages` — province-capital cards split across Sequence pages, each page containing a
   Repeater of weather rows; all 31 cities follow Persian alphabetical order without artificial
   north/south/region grouping;
3. `iran-weather-forecast` — today plus upcoming days in one full-frame composition;
4. `image-folder-sequence` — a manually advanced image Sequence seeded with several high-quality,
   full-frame Quran page images whose authoring metadata demonstrates folder-backed replacement;
5. `countdown-steps` — target-time countdown with remaining-time Steps changing the treatment;
6. `multibox` — a polished multi-source layout built on real Looks: four switchable presets holding
   one through four equal plates, with captions placed outside the live-picture rectangles.

## Data and operator editing

League rows and weather rows are ordinary list fields. The weather-page starter keeps the existing
division of responsibility: Repeater owns rows and Sequence owns pages. The forecast starter uses a
single Repeater without requiring Sequence. Defaults are complete enough to render immediately, and
field labels/data keys are useful in Preview and CG Control.

All displayed Persian numerals are presentation choices; canonical numeric field values remain
numbers. No starter introduces a special parser or hard-coded weather vocabulary into runtime code.

Weather icons use ordinary image fields plus ordered value rules. The operator chooses the authored
weather type from a combo; the graphic swaps the matching member of one consistent animated icon
family. The starter never asks the operator to browse for an icon.

Ticker and lifecycle audits are acceptance work, not visual polish: a nested crawl must preserve one
measured line, and loop/hold markers must describe an actual authored Hold start rather than a
dotted implication with no corresponding lifecycle value.

Full-screen examples use their main composition directly. A second on-air wrapper is retained only
for small overlays (for example a logo or ticker) whose authored composition needs a separate final
placement. League, weather, Quran-page and multibox starters do not get redundant wrappers.

Network marks are ordinary image elements backed by the official APASAI SVG. Transform/opacity
animation belongs to the image element, not to vector paths embedded in the starter, so replacing
the asset automatically preserves the motion design. The same official mark anchors the Designer
landing/About surfaces and the compact CG Control header link.

## Visual verification

Each new scene is rendered at a representative frame and compared at landing-card size and at the
scene's authored raster. Tests guard schema validity, lifecycle ownership, required feature elements,
complete defaults and catalog order. Poster files are generated from the actual scenes rather than
drawn as unrelated marketing thumbnails. Full-screen examples use cohesive broadcast-grade image
backdrops, restrained glass panels, consistent spacing and legible hierarchy; visual polish remains
editable scene content rather than a hard-coded runtime theme.

## Non-goals

- Customer branding or customer packs.
- Live sports/weather feeds.
- An English Premier League example.
- New runtime schema solely for a starter.

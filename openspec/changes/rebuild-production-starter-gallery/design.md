# Design: Production starter gallery

## Gallery shape

The existing five D-119 starters remain stable examples and are revalidated rather than silently
discarded. Six new Persian starters cover the missing workflows. Each starter is a normal `Scene`,
loads as an editable project, seeds Vazirmatn, has a real playout lifecycle and appears with a poster
captured from the same scene.
Gallery display titles, scene names and root composition names are Persian-only. The five original
catalog cards no longer append English translations; their technical IDs and filenames stay stable.
On-air text is broadcast content only: no authoring tips or training footers. The city-weather
alphabetical-pagination instruction is removed along with its animation; no binding referenced it.
Capability explanations remain in gallery descriptions and documentation, not the rendered graphic.

Each card also owns a small VP9 WebM excerpt generated from Chromium's real Preview screencast frames.
Actual capture timestamps retain animation cadence; the final 30 fps encode uses a modest 1.15× rate
over an approximately six-second source sample. This supersedes sparse screenshot capture at 12 fps:
duplicating those frames at a higher output rate would not repair the visible stutter. Videos are silent, loop only while
the card is hovered or focused, use `preload="none"`, return to frame zero on leave and do not play
under `prefers-reduced-motion: reduce`.
The encoded asset budget is 180 KB per card (superseding the former 100 KB ceiling): dense
motion and readable small text take priority over artificially repeating sparse frames or excessive
compression. The current complete eleven-card set totals less than one megabyte and remains lazy.
JPEG screencast sources are explicitly converted from full range to limited BT.709 and encoded as
8-bit yuv420p VP9 Profile 0. Inheriting bt470bg/full-range metadata passed ffmpeg decoding but caused
Chromium `PIPELINE_ERROR_DECODE`; therefore validation includes actual browser playback progress,
the media-error state and decoded/dropped-frame statistics, not only container metadata.

The new set is:

1. `iran-premier-league-table` — a one-page standings board with Persian team names/digits and no
   update-date decoration;
2. `iran-weather-pages` — province-capital cards split across Sequence pages, each page containing a
   Repeater of weather rows; all 31 cities follow Persian alphabetical order without artificial
   north/south/region grouping;
3. `iran-weather-forecast` — today plus upcoming days in one full-frame composition;
4. `image-folder-sequence` — a manually advanced image Sequence seeded with several high-quality,
   wide full-frame Quran title/verse slides whose authoring metadata demonstrates folder-backed replacement;
5. `countdown-steps` — a compact Azan lower third whose absolute target countdown becomes a
   persistent Maghrib announcement at zero;
6. `multibox` — four real Looks: one full-screen plate, two large plates, three equal plates arranged
   two-above-one, and four equal plates. No separate per-input title or background can become stale
   after Arrange or an input change.

## Data and operator editing

League rows and weather rows are ordinary list fields. The weather-page starter keeps the existing
division of responsibility: Repeater owns rows and Sequence owns pages. The forecast starter uses a
single Repeater without requiring Sequence. Defaults are complete enough to render immediately, and
field labels/data keys are useful in Preview and CG Control.

All displayed Persian numerals are presentation choices; canonical numeric field values remain
numbers. No starter introduces a special parser or hard-coded weather vocabulary into runtime code.

Weather condition text owns an ordinary `select` Data key. Its options are visible and editable in
Dynamic / Data through the same shared controls as numeric choices, and its default renders as
the condition label. The icon is one ordinary image element whose Value rules compare that key and
swap the appropriate Meteocons Fill SVG. The five packaged SVGs loop independently of a frozen hold;
their license/provenance is packaged beside the assets. No rule-only orphan field or hidden shape
switches are used, and the forecast contains no unexplained percentage.

The owner's weather references inform the calmer translucent forecast card, without solid colored
temperature tiles. Daily maximum and minimum use the same readable 52 px font, weight and alignment;
warm-white/cool-cyan colors and separate Persian labels identify their roles, not unequal type sizes.
Each value has an equally sized ordinary degree-sign element. This supersedes the earlier 64/42 px
hierarchy. Five-day RTL order, numeric inputs and the coherent continuous icon family stay unchanged.
Each number and its Persian label share the same centered 96 px column; the small degree mark stays
at a consistent separate right edge. One- and two-digit values no longer shift toward that edge
while their labels remain centered elsewhere.

League ranking uses the generic Text `rowNumber` setting, never a data field. The Repeater derives
the one-based rank from visible row order and applies its explicit alternating-row fill setting.
Club crests are ordinary image row fields, remapped into project assets with every list default and
authored row. Image Value-rule references are remapped on starter import too.

The league uses restrained navy/slate/ivory, a centered full-width title strip, uniform
rank/points treatment and subtle zebra rows. All eighteen rows fit inside the panel with bottom
clearance. Entrance follows row order from top to bottom; the explicit Repeater exit order is
reverse. The owner's saved project sets a 200 ms entrance, 50 ms exit and 30 ms stagger (35.5 and
28 frames respectively for eighteen rows at 50 fps). The authored out-point is frame 110 and the
end is 200, leaving sufficient sampling room on both sides. Ordinary opacity
tracks fade every background layer after the runtime's content-first row exit; there is no template-
specific closing behavior.

The owner-supplied `جدول-لیگ-برتر-ایران.cgproj` is the layout/timing reference for this final league
revision. Its separate competition badge is removed, the title strip is 1660×56 at (130, 102), and
the centered 27 px heading is 550.5×56 at (664.75, 104). Its explicit frame-84 keys are preserved:
scrim opacity zero, and title/title-strip Y 104. Imported asset UUIDs are mapped by their bundled
filenames to existing gallery asset keys; no personal file paths are published. Identical duplicated
bindings in the saved document become one canonical title binding and one teams binding. The
original project is not modified. SHA-256 comparison confirms all twenty bundled assets (font,
stadium and eighteen crests) are byte-identical to their gallery counterparts.

The guest-title starter extends its existing animated blue name plate across its full 1000 px
footprint, including beneath the transparent APASAI image with 12 px right padding. It does not
introduce a separate logo tile or change the replaceable image's animation.

City weather has no visible page counter or page-title field. Four pages contain all thirty-one
alphabetically ordered cities, with a 6500 ms dwell per page. Sequence repeat is one, advance is
automatic and it drives hold; the main composition uses content-driven auto-out. The last page
receives its full dwell and finishes its row/page exit before the overall opacity-keyframed outro
from frame 100 to 160. These settings remain visible and editable in the normal authoring controls.

The countdown starter is a 1400×164 navy/ivory lower third at (260, 820), transparent elsewhere.
Its compact on-air composition remains nested in the full-frame main composition. A normally bound
absolute date/time field owns the target; its initial seven-minute-ahead demonstration deadline is
not an official or calculated prayer time. Five-minute and one-minute Steps subtly change the timer
treatment. At zero, another ordinary Step hides the digits and preceding label and reveals the
editable announcement «اذان مغرب به افق تهران». Both compositions are manual/timed and the clock does
not drive hold, so the announcement remains until Stop. Ordinary element and wrapper keyframes close
the overlay. This supersedes the generic full-screen countdown and its automatic close at zero.

Quran slides follow the owner's latest wide cream/gold examples, superseding two-page spreads.
The reproducible HTML/vector renderer lays out source-verified Arabic Unicode with Amiri Quran
and the owner's Persian translation wording with Vazirmatn; no generative text or screenshot chrome.
Each exported Sequence item owns one 1920×1080 title or verse/translation image and the Sequence
fills the whole scene. No extra title/panel covers the text, and advance remains manual.

Ticker and lifecycle audits are acceptance work, not visual polish: a nested crawl must preserve one
measured line, and loop/hold markers must describe an actual authored Hold start rather than a
dotted implication with no corresponding lifecycle value.

Full-screen examples use their main composition directly. A second on-air wrapper is retained only
for small overlays (for example a logo or ticker) whose authored composition needs a separate final
placement. League, weather, Quran-page and multibox starters do not get redundant wrappers.

Network marks are ordinary image elements backed by the official APASAI SVG. Transform/opacity
animation belongs to the image element, not to vector paths embedded in the starter, so replacing
the asset automatically preserves the motion design. The same official mark anchors the Designer
landing/About surfaces and the compact CG Control header link. Starter logo artwork is transparent;
the app icon's white tile and the former separate logo discs/brand squares are not part of it.

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

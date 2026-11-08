# Design: Production starter gallery

## Gallery shape

The existing five D-119 starters remain stable examples and are revalidated rather than silently
discarded. Six production starters cover the missing workflows, and one additional city-weather
variant expands that eleven-entry catalog to twelve without replacing either original weather
starter. The owner removed only the newly added television-style forecast variant.
Each starter is a normal `Scene`,
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
compression. The original eleven-card capture measured less than one megabyte and remains lazy;
the new city variant retains the same per-card budget. Measure the twelve-card total after its new
clip and affected degree-placement recaptures are generated, rather than extending the earlier size
claim without evidence.
JPEG screencast sources are explicitly converted from full range to limited BT.709 and encoded as
8-bit yuv420p VP9 Profile 0. Inheriting bt470bg/full-range metadata passed ffmpeg decoding but caused
Chromium `PIPELINE_ERROR_DECODE`; therefore validation includes actual browser playback progress,
the media-error state and decoded/dropped-frame statistics, not only container metadata.

The new set is:

1. `iran-premier-league-table` — a one-page standings board with Persian team names/digits and no
   update-date decoration;
2. `iran-weather-pages` — province-capital cards split across Sequence pages, each page containing a
   Repeater of up to eight rows; four pages cover all 31 cities in Persian alphabetical order
   without artificial north/south/region grouping, retaining its current design;
3. `iran-weather-forecast` — today plus upcoming days in one full-frame composition, retaining its
   current five-column design and equal 52 px temperatures;
4. `image-folder-sequence` — a manually advanced image Sequence seeded with several high-quality,
   wide full-frame Quran title/verse slides whose authoring metadata demonstrates folder-backed replacement;
5. `countdown-steps` — a compact Azan lower third whose absolute target countdown becomes a
   persistent Maghrib announcement at zero;
6. `multibox` — four real Looks: one full-screen plate, two large plates, three equal plates arranged
   two-above-one, and four equal plates. No separate per-input title or background can become stale
   after Arrange or an input change;
7. `iran-weather-cards` — «آب‌وهوای شهرها — کارت‌های تصویری», a separate image-forward city variant
   with four large cards per page and eight pages for all 31 alphabetically ordered capitals.

The Azan lower third uses a cool translucent glass body, a separate soft highlight, a crisp white
edge and a controlled blue depth shadow. These are ordinary editable shape fills/strokes/shadows,
not a browser-only backdrop-filter effect, so Canvas, Preview and exported CEF render the same
design. The timer plate keeps opaque high-contrast Step colors and the outer frame remains clear.

The attempted `iran-weather-outlook` / «پیش‌بینی پنج‌روزه — نمای تلویزیونی» entry is removed by the
latest owner decision. Its earlier source/capture records are historical, not a required catalog item.

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

The owner's latest decision preserves both original weather starters. The original forecast keeps
its equal 52 px temperatures and centered 96 px label columns; those tests remain relevant
except for the superseded distant degree placement. The original city-weather starter retains its
four-page eight-row design and existing assets. No new style or pagination is applied to either
original; the targeted degree-adjacency repair is shared by all three weather templates.

The additional city variant uses the photo/video references as inspiration for large broadcast
cards, a bright blue/white palette and prominent coherent animated weather imagery. Yellow and
turquoise are not dominant surfaces. The retained original forecast keeps five-day RTL order and
equal high/low typography. Numeric inputs, visible choices/rules and the continuous coherent icon
family remain normal authorable content in all three weather templates.

Every temperature uses ordinary editable Text elements: the numeric element has LTR direction
and `align: end`; its separate degree element has LTR direction and `align: start`, positioned 2–3 px
after the numeric box. This keeps the degree close without introducing an invisible affix feature
or storing a degree character in numeric data. Forecast numeric boxes move 24 px left to balance
the compact pair, while the original centered label columns and equal 52 px high/low type remain
unchanged. Exact glyph-pair centering for arbitrary text widths is not claimed.

Verify one- and two-digit values, including negatives and Persian digits, inside existing field
ranges: forecast −50…60 and both city templates −40…60. Do not widen those ranges or require
three-digit temperatures. The corresponding media and browser adjacency acceptance must be
refreshed; old centered-number/fixed-degree coordinates alone do not prove the repair.

This addition is Full lane because it introduces sample content and pagination. Reference files
remain untouched; visual inspiration does not authorize copied broadcast branding or hidden
template-specific behavior. Both originals remain independently tested; the new city ID and shared
degree repair need their own source/browser tests and media, not a relabeling of earlier evidence.

The new `weather-broadcast-sky` asset is registered to
`apps/designer/public/starters/assets/weather-sky-broadcast.png`. It was generated with the built-in
image-generation tool on 2026-11-04: natural daylight, blue/white cloud sky, without UI or text.
It is separate from all existing weather artwork. Project-relative provenance is recorded in
`apps/designer/public/starters/assets/SOURCES.md`; no private generation/output path is published.

League ranking uses the generic Text `rowNumber` setting, never a data field. The Repeater derives
the one-based rank from visible row order and applies its explicit alternating-row fill setting.
Club crests are ordinary image row fields, remapped into project assets with every list default and
authored row. Image Value-rule references are remapped on starter import too.

The league uses restrained navy/slate/ivory, a centered full-width title strip, uniform
rank/points treatment and subtle zebra rows. All eighteen rows fit inside the panel with bottom
clearance. Entrance follows row order from top to bottom; the explicit Repeater exit order is
reverse. The owner's saved project sets a 200 ms entrance, 50 ms exit and 30 ms stagger (35.5 and
28 frames respectively for eighteen rows at 50 fps). The authored out-point is frame 110 and the
end is 200, leaving sufficient sampling room on both sides. Ordinary opacity tracks fade the
still-visible stadium, panel and column-header backgrounds after the runtime's content-first row
exit; there is no template-specific closing behavior. The owner's scrim already reaches zero at
Hold and remains zero during Stop, rather than reappearing to participate in that fade.

The owner-supplied `جدول-لیگ-برتر-ایران.cgproj` is the layout/timing reference for this final league
revision, including the owner's second saved revision under the same filename. Its separate
competition badge is removed, the title strip is 1660×56 at (130, 102), and the centered 27 px heading
is 550.5×56 at (664.75, 104). The title and title-strip retain their explicit linear frame-84 position
keys at Y 104. The scrim has no frame-84 key: its complete opacity track is frame 0 → 0 (ease-out),
20 → 0.64 (ease-out), 110 → 0 (linear), and 200 → 0 (ease-out). The panel's first gradient stop is
`#111B2C37`; its second remains `#172337E3`. These are the only two semantic changes in the second
saved revision: the scrim track and first panel stop. Heading geometry, row data and 200/50/30 ms
timings remain unchanged.

Imported asset UUIDs are mapped by their bundled filenames to existing gallery asset keys; no
personal file paths are published. Identical duplicated bindings in the saved document become one
canonical title binding and one teams binding. The original project is not modified. Semantic
comparison by stable element identity and independent SHA-256 comparison of all twenty bundled
assets (font, stadium and eighteen crests) confirms that the second revision uses byte-identical
gallery assets. Source/unit verification for this adoption is recorded in tasks; refreshed poster,
motion and browser evidence are tracked separately and prior first-revision captures do not count.

The guest-title starter extends its existing animated blue name plate across its full 1000 px
footprint, including beneath the transparent APASAI image with 12 px right padding. It does not
introduce a separate logo tile or change the replaceable image's animation.

Both city-weather variants have no visible page counter or page-title field. The original keeps
four pages of 8/8/8/7 cities; the new `iran-weather-cards` has eight pages of 4/4/4/4/4/4/4/3 cities.
Both contain all thirty-one capitals alphabetically and retain the authored 6500 ms dwell per page.
Sequence repeat is one, advance is
automatic and it drives hold; the main composition uses content-driven auto-out. The last page
receives its full dwell and finishes its row/page exit before the overall opacity-keyframed outro
from frame 100 to 160. These settings remain visible and editable in the normal authoring controls.

The countdown starter is a 1400×164 bright, high-contrast lower third at (260, 820), transparent elsewhere.
Its compact on-air composition remains nested in the full-frame main composition. A normally bound
absolute date/time field owns the target; its initial seven-minute-ahead demonstration deadline is
not an official or calculated prayer time. Explicit 60-, 30-, 10-, 5- and 1-minute Steps use vivid,
distinct, readable color treatments rather than subtle dark-on-dark changes. An ordinary editable
Azan icon replaces the right-side «مغرب» badge. The plate is cream/pale sage with deep-teal type;
the five timer-plate colors are teal, blue, indigo, amber and rose, retaining white timer digits.
The original authored mosque/crescent SVG is a replaceable project image, with the ordinary
«اوقات شرعی» caption. At zero, another ordinary Step hides the digits and preceding label and reveals the
editable announcement «اذان مغرب به افق تهران». Both compositions are manual/timed and the clock does
not drive hold, so the announcement remains until Stop. Ordinary element and wrapper keyframes close
the overlay. This supersedes the generic full-screen countdown and its automatic close at zero.
The brighter stage treatment and icon supersede the earlier navy/ivory two-threshold styling;
prior captures remain historical until the revised Azan poster and motion are verified again.

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

### Owner-supplied network-logo refinement

The saved `ارم-شبکه.cgproj` supplies the next authored baseline for the logo starter. The read-only
comparison removes `lb-sep`, `lb-tag`/`sub-tag` and its unused tag field/binding. It retains two
children, the replaceable image and wordmark; the wordmark moves from Y 24 to Y 50 and gains a
linear position-X key at frame 44/value 28, retaining the other frame 32/54/74/92 keys. The supplied
image and font are byte-identical to bundled assets, so portable asset references can reuse them.
The source project SHA-256 is `cdb88449e292afdfc985136c89a1faa9496d7e3f58e31afc82cc14d2127b352a`.
Do not overwrite the original or publish private paths. This is a Full-lane authored-animation
change with no runtime lifecycle change. Source preservation tests and a newly rendered poster and
30 fps / 1.15× excerpt are required; the previous logo captures are historical evidence only.

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

## Deferred hover-video overlay investigation

Only after the city-weather addition, degree repair and remaining template work are complete, investigate the reported
IDM “Download this video” overlay on Landing hover media. It is reported as extension-injected UI;
first distinguish what the application renders from what the extension adds. Assess only scoped
mitigations that preserve normal downloads, silent lazy hover/focus playback, reduced-motion behavior
and browser compatibility. Do not disable normal downloads globally or change extension settings
without authorization. Application control over an extension is not guaranteed; report verified
limits and tradeoffs before claiming a fix. This section records pending investigation, not shipped
behavior or permission to expand the current weather implementation.

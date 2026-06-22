# designer-canvas-viewport (delta)

## MODIFIED Requirements

### Requirement: An off-frame pasteboard for parking/editing shapes

The canvas SHALL present an off-frame PASTEBOARD — a dark area around the frame — whose extent GROWS
to contain off-frame content so a parked shape always stays visible and selectable. The extent is the
fixed 2× extent (the frame plus a margin, a fraction of the frame, on ALL FOUR sides) for content that
stays WITHIN that 2× boundary — BYTE-IDENTICAL to before, so everyday off-frame drags within the
margin do NOT resize the dark area — and it GROWS, giving a FULL margin of headroom past content, only
once content crosses a 2× boundary. The extent SHALL shrink back toward the 2× extent as far content
returns inward but SHALL NEVER shrink below it, and SHALL be clamped at a sane maximum
(`MAX_EXTENT_RATIO` × the frame per axis) so a stray far coordinate (bad import / fat-finger drag)
cannot blow the iframe up. The bounds come from the CURRENT-FRAME transforms of every top-level
element (the same boxes the overlay hit-tests / the runtime renders); a nested composition INSTANCE
contributes only its OWN box (instances render `overflow: hidden`, so nested children that overflow
the instance box are already clipped — bounding the instance box is exact). When the extent grows on
the LEFT/TOP the frame origin shifts; the canvas SHALL scroll-compensate (`Δoffset × zoom`) so the
visible content stays STATIONARY (no jump), on growth AND on inward shrink. The frame SHALL be clearly
OUTLINED so the author distinguishes the frame (what exports) from the pasteboard (what does not). In
authoring the editor SHALL lift the stage clip (the canvas iframe renders with
`.cg-stage { overflow: visible }`) so a fully off-frame shape PAINTS into the pasteboard on ANY side
(left/top as well as right/bottom) instead of being clipped, and such a shape SHALL remain selectable
and draggable on the canvas (the pointer/hit-test layer covers the whole pasteboard). The frame inset
SHALL update LIVE as the extent grows (driven by a CSS variable the runtime never recreates, carried
on the live preview messages — both scene-replace and scrub, since the offset is current-frame
derived) so a growing offset re-insets the frame with no iframe reload or flash. The canvas SHALL be TWO-TONE by region: the SURROUND (everything beyond the frame — the
scroll container and the iframe body) is the lighter `#161927`, and a FRAME-SIZED page backdrop is the
darker `#080a10` drawn as the frame's `background-color` (BEHIND the checkerboard and the shapes), so
every shape — on-frame over the page or off-frame over the surround — paints ON TOP and stays visible
(the `#080a10` is a backdrop, never an overlay that occludes a shape). On-frame editing SHALL be
UNCHANGED — scene (0,0) is the frame's top-left (inset into the pasteboard), and every consumer
(iframe, overlay, rulers) measures from that offset, so click→scene placement and on-frame hit-testing
are identical to before. The pasteboard is an AUTHORING affordance only, driven by an `authoring` flag
on the preview document that is INDEPENDENT of the broadcast flag: the broadcast preview modal and the
exports SHALL keep the native clip (off-frame content stays invisible, frame offset `{0,0}`) and the
modal SHALL still open blank-until-play. Save SHALL persist off-frame shapes in the project
(`.cg.json`), while the broadcast preview + export SHALL still EXCLUDE fully-off-frame static shapes
(the Phase-A export filter, unchanged, applied to the modal/export scene). The grow-to-fit extent
SHALL NOT regress the canvas layout: the fit action and project-open SHALL fit the zoom from the FRAME
bounds (NOT the grown extent) and CENTER the frame in the viewport; the canvas SHALL show NO default
scrollbars (the overflowing pasteboard is pannable, but the scrollbars are hidden); a Ctrl+wheel zoom
SHALL zoom toward the CURSOR (and the zoom buttons toward the viewport centre) and stay anchored even
under a shifted origin; the rulers SHALL place scene (0,0) at the frame top-left and track scroll +
zoom + the shifting origin; and the alignment / snap guides SHALL span the FULL visible canvas (the
scroll viewport), not the frame dimensions.

#### Scenario: A shape parked far off-frame on any side grows the extent and stays editable

- **WHEN** the author moves a shape FAR outside the frame on any side (past the 2× boundary, including
  off the LEFT or TOP, i.e. large negative scene coordinates)
- **THEN** the pasteboard extent GROWS to contain it (giving a full margin of headroom past the
  content) so it paints into the pasteboard and remains selectable and draggable on the canvas — never
  clipped out of the iframe

#### Scenario: An off-frame shape within the 2× boundary does NOT resize the dark area

- **WHEN** the author drags a shape off-frame but it stays within the existing 2× boundary (within the
  margin)
- **THEN** the pasteboard (dark area) extent and the frame offset are BYTE-IDENTICAL to before — no
  growth, no origin shift (only zooming changes the dark area's on-screen size)

#### Scenario: The extent shrinks back to the 2× floor as far content returns, never below it

- **WHEN** a shape that grew the extent is dragged back inside the 2× boundary
- **THEN** the extent shrinks back to EXACTLY the fixed 2× extent (never smaller), and the visible
  content stays put (scroll-compensated)

#### Scenario: An absurd far coordinate is clamped

- **WHEN** content sits at an absurd coordinate (e.g. a bad import or fat-finger drag to millions of
  px)
- **THEN** the extent is CLAMPED at `MAX_EXTENT_RATIO` × the frame per axis (the iframe does not blow
  up); content beyond the clamp may clip

#### Scenario: Left/top growth is scroll-compensated so the frame does not jump

- **WHEN** the extent grows on the LEFT or TOP (the frame origin shifts right/down)
- **THEN** the canvas scrolls by `Δoffset × zoom` so the visible content (the frame) stays STATIONARY
  on screen — no jump — and the inset updates live with no iframe reload

#### Scenario: The canvas is two-tone and a shape over the page is not occluded

- **WHEN** the author places a shape on the frame (over the darker `#080a10` page)
- **THEN** the surround reads `#161927` and the frame-sized page backdrop reads `#080a10`, and the
  shape paints ON TOP of the page (visible + selectable, not occluded by the `#080a10` backdrop)

#### Scenario: On-frame editing is unchanged

- **WHEN** the author places, selects, or drags a shape inside the frame
- **THEN** it behaves exactly as before the pasteboard (scene (0,0) is the frame's top-left)

#### Scenario: The broadcast preview + export exclude the off-frame shape; the modal still blanks

- **WHEN** a composition with a fully-off-frame static shape is previewed (broadcast) or exported
- **THEN** that shape is absent from the output (the Phase-A filter, through the authoring flag, with
  frame offset `{0,0}`), and the broadcast modal still opens blank-until-play (D-087 intact)

#### Scenario: Save keeps the off-frame shape

- **WHEN** the project is saved
- **THEN** the off-frame staging shape is persisted in the `.cg.json` (the exclusion is export-only)

#### Scenario: On open / fit, the frame is fit and centered with no default scrollbars

- **WHEN** a project is opened, or the fit action is invoked, even with far-parked content present
- **THEN** the zoom is fit from the FRAME bounds (NOT the grown extent), the frame is centered in the
  canvas viewport (no off-center scroll), and NO scrollbars are shown by default (the overflowing
  pasteboard is pannable but its scrollbars are hidden)

#### Scenario: Ctrl+wheel zooms toward the cursor, smoothly, under a shifted origin

- **WHEN** the author Ctrl+wheels over the canvas to zoom, including when the origin has shifted from
  grown off-frame content
- **THEN** the scene point under the cursor stays under the cursor — the zoom is anchored on the
  pointer (not the stage's top-left corner) and does NOT jump/recenter (the scroll correction is
  applied before paint)

#### Scenario: The rulers track scroll, zoom, and the shifting origin from the frame origin

- **WHEN** the canvas is scrolled or zoomed, or the origin shifts because off-frame content grew the
  extent
- **THEN** the rulers read scene 0 at the frame top-left and scene (W/2, H/2) at the frame center, for
  the current scroll + zoom + offset

#### Scenario: The rulers and guides stay pinned to the visible viewport on scroll

- **WHEN** the canvas is zoomed in so it overflows and is then scrolled
- **THEN** the rulers and the alignment/guide lines stay pinned to the visible viewport (they do not
  scroll out of view with the content) while their tick/guide positions follow the scrolling stage

#### Scenario: Alignment guides span the full visible canvas

- **WHEN** a drag raises an alignment / snap guide
- **THEN** the guide spans the full visible canvas (the scroll viewport), not just the frame
  dimensions

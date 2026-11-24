## Context

The Designer authors and exports reusable `.vcg` compositions. CG Control prepares PVW in the browser,
and explicit takes use the Bridge. The Playout system owns programme order, programme timing and the
original programme audio. A library of playable clips alone cannot determine which programme is next.

Viz Mosart distinguishes full-screen primary story elements from secondary overlays, and primary
Autotake can advance the rundown at an item boundary. Viz Channel Branding maps playlist event metadata
to text, image and video fields. Imagine Gallium shows the complementary option of rendering a promo to
a regular video deliverable for transmission. [Viz Mosart rundown](https://docs.vizrt.com/viz-mosart-users-guide/5.11/Rundown_View.html) · [Viz Mosart template timing](https://docs.vizrt.com/viz-mosart-admin-guide/5.5/Template_Properties.html) · [Viz Channel Branding metadata](https://docs.vizrt.com/viz-channelbranding-guide/5.6/Dynamic_Content_from_Playlist_Metadata.html) · [Imagine Gallium](https://imaginecommunications.com/content/uploads/2025/11/ImagineComms-Gallium-Brochure-112025.pdf#page=5)

## 1. Authoring and programme data

- Use a distinct schema element and Inspector. Keep scene placement, typography, style and layout in
  the composition and use the same renderer for Canvas, Preview and exported template runtime.
- Single displays the first item of the selected feed. Side by side displays several equally weighted
  cards. Sequential displays one card per page. Carousel displays several cards with a single focus
  that moves around the selected list. Keep the authored number of visible slots independent of the
  number of programme occurrences selected for a particular take.
- Show airtime is an authored display setting. Sequential and Carousel have automatic or manual
  advance. Automatic dwell belongs to the graphic's progression and the scheduled event duration
  belongs to Playout. Changing pages operates inside the running scene.
- Store one card design per Upcoming Programs element. Its width and height can each be automatic
  within the layout slot or fixed in pixels. Background, border width, border color and radius apply
  to every card. Carousel focus uses its own background and border color. The title and airtime each
  have their own typography and alignment. Their geometry and the optional media frame use physical
  top-left coordinates relative to the card. Author Contain or Cover for the media frame. Designer
  can render a rehearsal placeholder in that region while the export preserves the authored frame
  for actual media supplied through the later prepared-asset path.
- Store the aperture's border color, width, radius and background separately from the card's border
  and background. Keep the aperture's outer position and size anchored to its authored rectangle.
  The interior clips at the authored corners and preserves Contain or Cover. The background fills
  the aperture including the letterboxed area when the image or video uses Contain.
- For Side by side and Carousel, resolve an authored Fixed gap in scene pixels or use responsive
  Auto spacing. Side by side and Fixed Carousel with overlap disabled measure adjacent rendered
  card edges. Across cards and overlap-enabled Carousel measure the gap between stationary layout
  slots. Keep explicit zero. If space is constrained, fit the slots and cap the effective gap to
  the available bounds while preserving the saved choice.
- Resolve Vertical alignment for each Side by side or Carousel row using Top, Center or Bottom.
  Align the outer card boxes after applying their authored or focused scales, and keep that
  vertical anchor during focus moves. When fixed-height Side by side leaves vertical space,
  align the whole group of rows in that space, including for explicit Center. Persist Center
  for newly inserted elements. A legacy fixed-height Side by side element with no alignment
  keeps its Top placement and the Inspector reflects Top. Other absent values resolve to Center.
- Resolve focused title and airtime settings with a field-by-field fallback to their ordinary
  regions. Use card and region geometry for placement and use text direction for glyph ordering. An
  Auto text direction can resolve differently for a Persian phrase and a numeric-only value without
  moving either region or changing its alignment anchor. Allow explicit RTL and LTR separately for
  each title and airtime in each card state.
- Store the digit choice independently for title, airtime and their focused overrides. Shape digits
  at display time through the shared digit shaping logic. Keyboard keeps the source text as typed
  and covers absent ordinary settings in saved projects. Inherit follows the corresponding ordinary
  role. Preserve the authored value in the project and in a Prepared export's data rows.
- Carousel uses logical slot order. In Fixed, the focus keeps its authored Start, Center or End
  slot. Wrap displayed neighbours to fill the available slots with unique items while retaining
  programme order and the finite-pass boundary. Fixed remains the creation and stored fallback.
- Across cards partitions the list into groups up to the visible capacity. The cards in each group
  keep their slots while Next, Previous or Automatic advance moves focus across them in programme
  order. Apply authored scale and opacity over Focus move duration within the group. Use the Next
  effect for the change to a different group. A short final group keeps the remaining occurrences
  in order and preserves the author's Repeat policy. Motion and authorised sound move immediately
  with the active focus.
- Allow overlap is an independent Carousel setting and defaults off. When off, reserve enough room
  to keep card bounds disjoint, including during in-group focus animation. When on, calculate
  stable slots independently of the focused scale and layer the focused card above neighbouring
  cards. Scaling may cross their edges while their positions stay fixed.
- Apply the refreshed broadcast card design only when inserting a new element. Preserve the
  established 1271 × 324 scene-pixel box at the author's drop position, three-card Carousel,
  four-second Automatic dwell and single pass. Keep stored appearance, editable rows and legacy
  fallbacks on reopen and import, including an intentionally empty list.
- Reuse the shared SequenceDriver and existing Sequence effects for the authored Next effect.
  The new-carousel preset slides in from the left and out to the right simultaneously. Authored
  entry and exit directions, sequencing and duration apply when the page changes. Legacy elements
  with absent transition settings still use Cut. Page effect duration, focus move duration, dwell
  and the playlist occurrence duration each retain independent ownership.
- Store the Upcoming Programs group's Entrance and Exit effects as optional settings with separate
  durations. Animate the visible card group once at the beginning of its run and once when its
  active run exits via normal Out or finite completion. Page transitions and focus changes keep
  their own animation scope. The supplied Push right page preset has no group effects by default,
  and absent settings keep existing graphics' behavior. Designer Rehearse exposes Out separately
  from quick Stop. On finite completion, finish the group Exit before reporting that driver's
  completion. The coordinator still waits on other drivers and the authored Exit delay before
  the timeline Outro. Out shares the same in-flight Exit for the group. Quick Stop bypasses the
  group effect and keeps the existing timeline Outro behavior.
- Repeat is a Designer-authored content timing default for Sequential and Carousel. The driver can
  wrap through the full selected list indefinitely or run a positive number of complete passes.
  New elements author one pass. Existing elements with missing repeat keep their infinite fallback.
  The finite path ends paging after the last page. A composition-owned Outro retains that page for
  its authored animation. Otherwise the driver can use the shared sequence exit. The graphic's repeat
  policy fits within the separate host or full-screen playlist slot.
- The element can join the composition's Content-driven Hold through a saved opt-in. Missing opt-in
  preserves existing projects. Integrate with the shared completion coordinator and its effective
  driver checks. A populated Single or Side by side uses one authored Dwell. A populated Sequential
  or Carousel uses its finite or infinite pass policy, including a finite run with one rendered card.
  Finishing waits for the other enabled drivers and honors the composition Exit delay before the
  published Outro. Reuse the normal Out action, hold reset and stale-completion protection.
  An empty or hidden element provides no completion driver. Compositions with no effective driver
  keep the ordinary Timed fallback.
- Seed a new element with seven editable English titles and airtime labels. Authors can change the
  count and order. Each row retains its identity while the author edits its title and airtime or
  chooses a Project image or video. Designer Canvas and Rehearse explicitly enable test data.
  Rehearse plays the active or focused local video in the authored frame.
- Supply generated paintings and photos for the built-in English examples in Designer Rehearsal
  when author media is absent. Prepared hides this artwork even inside Designer. Real assigned
  Project media takes precedence, and the built-in images stay outside the output asset closure.
- Apply one focus policy to rehearsal and all approved sources. The visible card in Single or
  Sequential, or the focused card in Carousel, owns motion. Surrounding Carousel cards and all
  Side by side cards use the prepared poster or image. For legacy videos and missing posters, use
  a decoded fixed frame or a text fallback. A change of focus pauses the previous clip and silences
  it immediately, even while its page is still visible in a simultaneous transition. The focused
  video and its approved sound share the same playback owner.
- Open the existing-style Test media modal to pick a Project Assets image or video. Use the normal
  Project Assets workflow to import or trim source media. The empty modal points to that workflow.
  Confirming a selection assigns the existing asset to the initiating row. Cancelling preserves
  the row and its media selection.
- On selection of an existing video, generate a reusable poster from the selected conformed clip
  through the existing poster decode path. Store the still with stable derivative metadata linking
  it to the source video. Project asset browsers and Test media hide generated poster entries while
  using the poster as the source video's thumbnail and selection preview. Recognize previously linked
  posters and keep them available as standalone images if the project also references them as
  independent assets. This presentation rule preserves all stored bytes and references.
  Prepared export keeps the linked poster and clip. Rehearsal-only export omits their sole-use assets.
  Use a decoded fixed frame or text when a legacy clip lacks the generated asset.
- Designer's Project video conversion strips its audio track. For local audition, attach a Project
  Sound as Test sound to an entry and explicitly enable Audition focused video, which defaults to
  off. The running, focused video in Single, Sequential or Carousel can audition its assigned sound.
  Side by side stays silent. Release the active sound on pause, focus change or Out. This audio is
  owned by Designer's local browser preview. The production media worker and Playout mixer policy
  retain their own phase and contracts.
- Rows and attachments remain rehearsal-only by default. The seven standard creation examples start
  private. The Designer `dataSource` value is rehearsal when absent. Choosing Prepared explicitly
  publishes the current curated list and its selected assets, using the same title, airtime, image,
  video and sound data. That approval is independent of the styling preset, transport and audition.
- Both `.vcg` and single-file HTML omit private rows and exclude test-only assets before computing
  the package asset closure. The typed Prepared payload contributes the approved list and
  the assets those rows reference. Production assets separately used elsewhere remain available.
- Keep a common graphics payload for Prepared, Manual and Playout so all three sources use the
  same layout and lifecycle. Prepared starts from the Designer package. Manual consists of CG Control
  edits or a replacement list for the current show. Playout starts from the live automation source
  and resolves per-occurrence presentation overrides. CG Control and the Bridge validate the source
  and prepared media revision before any on-air use.
- For production, keep normalized records of channel, playlist and event occurrence identity, schedule
  order, programme grouping and type, title, optional expected start, media reference, and snapshot
  freshness. Anchor lookahead on the host occurrence for a secondary and on the full-screen event's
  own occurrence for a primary. Skip advertisements, junctions, repeat segments of the same show,
  cancelled/skipped events and other graphics in that lookahead. Distinct scheduled occurrences of
  the same title or asset each retain their own identity. Keep local event overrides separate from the
  feed and resolve explicit display values before schedule metadata.
- Confirm the authenticated Engine/automation contract and exact supported operations at integration
  time. A scheduled file is a read-only integration option with explicit channel and anchor information.
  Treat air-state or freshness information absent from a file according to its stated capabilities.
  The owner has confirmed that the target API or file delivery path is currently undecided. The
  Playout adapter awaits that contract.

### Designer rehearsal stills

The built-in ImageGen tool created the contact sheets used for the seven 640 × 360 WebP
stills in `apps/designer/src/platform/upcoming-programs-artwork/`. The stills illustrate the
editable starter rows in Designer rehearsal. Prepared output uses assigned Project Assets.

<details>
<summary>ImageGen prompts</summary>

Use case: photorealistic-natural. Generate a single precision-aligned contact sheet for three test stills in a premium English-language television network's schedule carousel. Canvas aspect approximately 3:1, three equal landscape images, edge-to-edge, exact borders at 1/3 and 2/3, no margins, dividers or text. Left: Morning Edition, sunlit Mediterranean waterfront city at golden dawn, warm pale sky and layered limestone architecture. Middle: The Night Report, sophisticated dark television news studio with silhouetted camera, diffuse teal light, city skyline visible behind glass, clean architectural composition. Right: Cities After Dark, elevated view of densely built city in deep blue twilight, electric gold streams of traffic and illuminated windows, editorial architectural photography. Realistic optical texture, natural colors, calm deliberate composition and legibility at small thumbnail size, no visible logos, graphics, signs, type, or watermark. The three panels are separate photos with clean hard cuts; do not blend the scenes.

Use case: photorealistic-natural. Create a precision-aligned 2 by 2 contact sheet of four distinct high-end editorial television programme stills, equal quadrants with exact horizontal and vertical center cuts, no margin or overlap, canvas 3:2. Upper left: Into the Wild, a misty evergreen forest river and cool mountains shot on location at dawn. Upper right: The Long View, a distant astronomical observatory silhouette and a wide luminous indigo night sky with a natural Milky Way. Lower left: Studio Sessions, a warm and intimate recording studio, piano and vintage microphone with soft gold lights and subtle lens grain. Lower right: Coastline Stories, a drone's panorama of Atlantic breakers, green cliffs and a small lighthouse in cool afternoon sun. Photorealistic cinematography with distinct premium palettes, clear subjects legible at thumbnail size. Imagery all the way to each quadrant's edges. No text, type, logos, overlay or watermark.

</details>

## 2. Prepare snapshots, media and sound

- Refresh the preparation against the latest complete schedule before a take. Preview shows the
  prepared revision and any changes to order, timing or readiness. Taking publishes one coherent
  selection with its overrides and resolved media. Freeze that selection through its display. Further
  automatic refreshes apply to the next prepared take and retain matching occurrence overrides. A
  deliberate authorised operator update can apply a new ready revision to the active graphic without
  taking or restarting it. Edits to an inactive graphic are staged for its next Take.
- The operator can use a supplied poster or approved promo asset, choose an image, or mark an
  in/out excerpt on an available source. A Playout-side media worker cuts the chosen range with
  FFmpeg and produces a playable clip with its audio and a poster. Identify each prepared asset by
  the source version, in/out range and channel profile. Store validated media locally on the main
  and reserve engines using authorized asset references.
- Templates may use text-only cards, small media frames or large media frames at the author's
  position and size. Prepare the visible media and adjacent page destinations ahead of Take or the
  page turn. Confirm a decoded opening frame on the intended engine before marking the focused
  clip ready to play. For other cards, resolve the provider's image or the poster for the selected
  conformed clip before Take. A decoded fixed frame or text covers missing poster generation.
  In PVW, offer a ready poster or text version when a clip is still pending or cannot be used.
  File creation, transfer and initial decoding happen before Take.
- Preview starts muted and listening is local. In an overlay, keep the programme sound by default.
  The station's approved mix may add promo sound. On either air path, a Carousel passes promo
  audio only from the focused clip when enabled. Bring the outgoing clip to silence before raising
  the incoming clip, even during rapid manual steps. The full-screen row uses its configured
  silence or focused clip audio. Restore the next programme's expected audio at the boundary and
  verify the transition on PGM.

## 3. Playlist execution and fallback

- A secondary event references its host occurrence and its trigger or offset. It consumes a graphics
  layer, with its end bounded by the host window. Updating its draft, auditioning or paging in PVW has
  no PGM effect. An on-air page change affects only the current CG-owned graphic. The scheduled
  secondary may be armed by the operator or triggered by an authorized host-event action.
- A full-screen primary references the authored graphic with an opaque background or approved complete
  visual output. It has a normal playlist start and duration, independently of whether its content is
  Single, an automatic sequence, or manually paged. Preload/arm the revision before start. During the
  live slot, the next playlist item remains owned by the Playout scheduler. End the graphic in time
  for that boundary, including any required outro or transition, even if a manual page was left unshown.
  If Content-driven Outro completes earlier, Playout follows its approved policy for the remainder
  of the slot.
- If Playout supports only ordinary media primaries, prepare a video in the correct channel format
  and duration from the same reviewed snapshot. Operator confirms its identity and age before the file
  is scheduled. Re-render or reject a changed snapshot before airing the file. A rendered clip follows
  its encoded page progression for the scheduled slot.
- With no usable next programme or with stale/unknown readiness, keep an overlay off or complete its
  current safe presentation. A failed primary follows Playout's preconfigured safe filler or skip policy.
  The failure path cleans up only the graphic's own resources and observes the same scheduling boundary.
  Confirm the real primary A/B programme handoff, plus independent PVW/PGM and audio on the target plant.

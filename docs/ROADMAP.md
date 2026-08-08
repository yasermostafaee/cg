# Roadmap (agreed order)

The agreed **sequence** of upcoming work, so the plan survives across sessions.
The PRD files under [`docs/prd/`](./prd/README.md) hold the items
(What / Why / Acceptance); this file records the **order**. Keep it updated as
the order changes. Strategic / non-engineering notes live in
[`docs/prd/roadmap.md`](./prd/roadmap.md).

## Done (recent)

- After Effects → bodymovin (Lottie) furniture as a lifecycle-aware element
  ([D-125](./prd/designer.md)) — merged across nine PRs (#335 + canvas fixes
  #337/#338/#339, #341, #345, #348, #352, #354, #357, #358; pre-archive
  reconciliation #364) & archived (2026-07-19,
  `2026-07-19-lottie-lifecycle-element`): an AE/bodymovin export imports through
  an allowlist validator and places as an OPAQUE element — no internal keyframe
  is ever converted to a native one — that participates fully in the
  composition's IN / HOLD / OUT. Its phases come from bodymovin markers (else
  manual marking) and map onto the composition BY PHASE, never by rescaling the
  animation: a `LottieDriver` drives the player frame-by-frame off the injected
  `RuntimeClock`, so pause/resume is in lockstep with every other driver and the
  whole lifecycle is deterministic under a fake clock. The crux is the
  ELEMENT-OUTRO SEAM: `out()`/`stop()` — and, since Phase 3b-2, every
  self-triggered exit (auto-out expiry, content completion, loop-cycle boundary)
  — play the element's authored outro to completion BEFORE the background
  closes, exactly once per exit episode via a one-shot ledger, with the
  B-030..B-034 defenses (no strand, supersede-safe, re-armed per cycle) intact.
  A native ticker on top still drives the content-driven hold; the Lottie opts in
  (`drivesHold`, the inverse default). Phase 3a made the furniture's intro DERIVE
  the composition's entrance settle — the reverse of the rejected "slave the
  animation to a marker" option, so nothing is resampled — which is what lets
  overlay content start on its own with no manual trim, and the Inspector shows
  that number in both frame spaces. Field overrides route through the existing
  bindings model (text + fill/stroke on named layers; image deferred). Exports
  ship the player as a separate MINIFIED bundle (~168 KB) only when a scene
  contains a Lottie, so Lottie-less exports pay nothing, and the whole thing runs
  under CasparCG's CEF from `file://` with zero external requests — owner-verified
  on real 2.3.x hardware before archiving.

- Friendly validation presets for dynamic text fields
  ([D-059](./prd/designer.md)) — merged (#308) & archived (2026-07-18,
  `2026-07-18-add-field-validation-presets`): the Inspector's Dynamic / Data
  section now authors a text/multiline field's `pattern` through a named-preset
  select — None, Email, Phone, Digits only, Letters only, Uppercase code, Time
  (HH:MM), URL, Custom (advanced) — instead of a raw regex box, which was
  developer-facing and so unusable by the broadcast designers the Inspector is
  for. Each preset writes its vetted regex source to the EXISTING `pattern`
  through the existing field-meta update path, so this is a UI-only layer: no
  field model, schema, runtime, or export change, and the preview data form
  enforces a preset exactly as it enforced a hand-written regex. Every preset
  regex is ANCHORED (`^…$`) and flagless because the consumers test with
  `new RegExp(source).test(value)`, a SUBSTRING match — unanchored sources would
  have accepted any value merely containing the shape. The digit and letter
  shapes accept Persian and Arabic-Indic forms alongside Latin. Custom is a
  DISPLAY state rather than a stored value: the select shows the preset a stored
  pattern spells, None when there is no pattern, and Custom otherwise, so a
  hand-written pattern authored before this change loads as Custom with its regex
  intact and remains fully editable. Follows the established
  preset-with-custom-escape idiom (EasingEditor / sequence-presets).
- Rename the open project ([D-127](./prd/designer.md)) — merged (#311) & archived
  (2026-07-14, `2026-07-14-rename-open-project`): the centered TopToolbar project
  name is now editable in place — double-click swaps it for a focused text input
  (current name selected), and File → "Rename Project…" activates the SAME inline
  edit, so the two entry points share one `renaming` flag rather than growing a
  second affordance (a modal). Enter or blur commits, Escape cancels with no store
  write. The commit goes through a new `renameProject(name)` document-slice action
  that writes the scene-ROOT `name` — deliberately NOT `updateScene({ name })`,
  whose `docKeys` route `name` to the ACTIVE COMPOSITION, which would have renamed
  the composition instead of the project whenever one was open. The draft lives in
  local component state and reaches the store once, so a rename is exactly ONE undo
  entry (a per-keystroke write would have pushed several through `set()`'s 300 ms
  coalescing window). Empty/whitespace-only input is rejected. Display-name only:
  the D-088 file handle is untouched, so the on-disk file is NOT renamed (Save As
  remains the way to change the filename); the tab title follows for free off
  `scene?.name` and the document goes dirty because `hashScene()` covers the root
  `name`. UI-only — no schema, exporter, or Runtime change.
- Runtime Library UX — display names + template removal
  ([R-004](./prd/runtime.md), [R-005](./prd/runtime.md)) — merged (#306). R-004
  archived (2026-07-14, `2026-07-14-runtime-library-display-name`): the Library
  showed the raw `templateId` — a UUID for any Designer-authored `.vcg`. The name
  was never missing from the data (`ManifestSchema.name` and `SceneSchema.name` are
  both required and the exporter writes them); it was dropped at the two hops that
  build a `TemplateInfo`. `TemplateInfo.name` is additive + optional, so a template
  registered without one still renders exactly as before, and a blank name (the
  manifest schema has no `.min(1)`, so `""` is packageable) falls through to the id
  rather than rendering an empty row. R-005 shipped its per-row **Remove** control
  with a **refuse-while-referenced** policy: deleting a template a stack item uses
  does not take the graphic off air (CEF already holds the HTML) but silently
  poisons the row — its next out→take can never resolve the template again — so any
  reference blocks, not just an on-air one, and the bridge is authoritative for the
  refusal (mirroring R-010's on-air block). A confirmed removal also prunes the
  reconnect-reconciliation retention, or the template walks back in on the next
  bridge blip. No AMCP verb added; ADR-0006 untouched — removal sends nothing to the
  wire. **R-005 is NOT closed**: its context-menu affordance is still an owner call
  (the Runtime has no context-menu primitive), so the item stays `[~]` and
  `runtime-library-remove-template` stays active.
- Bundle fonts in `.vcg` export ([D-121](./prd/designer.md)) — merged (#298) &
  archived (2026-07-13, `2026-07-13-bundle-fonts-in-vcg-export`): the Exporter now
  resolves each `scene.fonts` entry's bytes into `pack()`'s existing `fonts` seam
  (`fonts/` dir + a `kind: 'font'` assetIndex entry) and bakes a package-relative
  `@font-face` per bundled face into the package's own `index.html` — so an
  unzipped `.vcg` renders the correct face under CasparCG's CEF with no external or
  `file://` request, and a content-driven ticker measures real glyph widths instead
  of fallback ones (the crawl-derived hold duration finally matches the authoring
  machine — the same "playout-critical input lost in export" class as B-032's
  `holdMs`). A face with no shippable bytes (a `system`/licensed family) is skipped
  and the `vcg-ticker-fonts-not-bundled` preflight warning is re-scoped to fire only
  for that font, rather than merely because a scene contains a ticker. Single-file
  HTML export is unchanged (it already inlines fonts); no `@cg/vcg-format`, Runtime,
  or bridge change. New living spec: `designer-font-export`.
- Rebuild starter templates ([D-119](./prd/designer.md)) — merged (#290) &
  archived (2026-07-13, `2026-07-13-rebuild-starter-templates`): the 8 legacy
  starters are replaced by five Persian broadcast demos — `logo-bug`, `ticker`,
  `sequence`, `title`, `irib-news` — each a two-comp structure (a small on-air
  footprint comp, `onair:<compId>`-tagged with its own lifecycle/playout, nested
  in a full 1920×1080 entry comp), every bound field carrying a real Persian
  DEFAULT plus its data-key binding (base text IS the default and the binding
  carries no placeholder — the Designer shows broadcast copy, an operator value
  substitutes at playout, no value falls back to the default). The on-air gate —
  [B-066](./prd/bugs-runtime.md), CEF-incompatible `replaceAll` aborting every
  Persian template at boot — was fixed on the Runtime track (#289); D-119 rebased
  onto it and the owner verified the real CasparCG import. Left open:
  [B-067](./prd/bugs-runtime.md) (Runtime inspector sees flat root fields only, so
  two-comp templates' nested fields are invisible) and
  [B-068](./prd/bugs-designer.md) (`ensureCompositions` drops root
  lifecycle/playout). Owner-verified 2026-07-13.
- Path point-edit mode + size==visualBBox model
  ([D-124](./prd/designer.md) + [B-058](./prd/bugs-designer.md) menu chrome,
  [B-059](./prd/bugs-designer.md) curve-aware bounds,
  [B-060](./prd/bugs-designer.md) right-click draw-cancel,
  [B-061](./prd/bugs-designer.md) rotated overlay + drift,
  [B-062](./prd/bugs-designer.md) resize bake,
  [B-063](./prd/bugs-designer.md) curved add affordance) — merged (#280) &
  archived (2026-07-11, `2026-07-10-fix-pen-edit-mode-and-bbox`): single click =
  box only, double-click = point edit (gizmo hidden; Esc/empty-click exits
  keeping selection), Ctrl/Cmd-gated insertion + segment right-click Add point /
  Add curve point on the real cubics; owner model — points fill their visual
  bbox with `transform.size` == its extents, static resize bakes into the
  points, ONE in-memory migration covers Designer load + runtime `.vcg`
  ingestion (packages never rewritten), and the per-edit re-normalize is
  render-neutral under rotation/scale (no drift). Owner-verified 2026-07-11.
- Anchor context menu ([D-123](./prd/designer.md)) — merged (#275) & archived
  (2026-07-11, `2026-07-10-add-anchor-context-menu`): right-click an anchor →
  accessible Delete-point menu (keyboard-delete semantics, capture-owned Esc);
  chrome converged onto the shared `ui/ContextMenu.css.ts` in B-058 and the
  menu now opens inside D-124's point-edit mode. Owner-verified.
- Pen curve trilogy ([B-057](./prd/bugs-designer.md) smooth-drag sticks,
  [B-056](./prd/bugs-designer.md) no smooth insert,
  [B-055](./prd/bugs-designer.md) curved shapes select only near center;
  B-057/B-056 renumbered from B-053/B-054 — the runtime track's #271/#273
  filings hold those numbers) —
  merged (#272) & archived (2026-07-10, `2026-07-10-fix-pen-curve-and-hit-test`):
  corner-vs-smooth decided at pointer-up against a screen-px guard (previous
  smooth anchor's handles untouched, Illustrator semantics), segment click-drag
  inserts a smooth anchor with mirrored handles, and path hit-testing follows
  the flattened rendered cubics (bulges hit, concavities miss). Owner-verified
  2026-07-10. With #270's B-051 (Path Style commits on paths) + B-052 (pen
  layer icon), the D-109 pen is now fully healthy for D-119's templates.
- Pen tool multi-shape fix ([B-037](./prd/bugs-designer.md), owner decision
  2026-07-07: KEEP + fix) — merged (#267) & archived (2026-07-10,
  `2026-07-10-fix-pen-multi-shape`): explicit draft lifecycle (any pen exit
  finishes a ≥2-anchor draft open / cancels a smaller one), pen stays armed
  after a finish (N draws → N independent elements), Esc cancels the draft,
  the gizmo no longer hijacks pen clicks (mount gated off while the pen is
  armed), rubber-band + first-anchor close affordance, stale-draft guard
  (Delete/undo mid-draw), collision-safe element ids. Owner-verified drawing
  feel (2026-07-10). Unblocks D-119.
- Pixel-snap drag + arrow-nudge at grid zoom ([D-122](./prd/designer.md)) —
  merged (#264) & archived (2026-07-08, `2026-07-08-add-pixel-snap-drag`): full
  pixel snap on drag and first-nudge-to-integer at pixel-grid zoom (direction-
  aware), Alt bypass, the Snapping preference as the master switch; Inspector
  values free and below-threshold unchanged. The pixel-perfect-editing companion
  to B-042 (a dragged shape now lands ON the lines). Owner-verified.
- Pixel-grid ↔ content alignment at high zoom ([B-042](./prd/bugs-designer.md)) —
  merged (#251) & archived (2026-07-08,
  `2026-07-07-fix-pixel-grid-content-alignment`); containing-pixel stroke snap +
  device-raster-aligned grid layer, ruler-mark lockstep, gizmo layout-lattice
  fidelity (1-device-px frame stroke), plus the [B-045](./prd/bugs-designer.md)
  stale-raster mitigation (authoring position pin; B-045 stays open for the
  D-096 root fix + the upstream Chromium report). Owner-verified on the
  affected machine.
- Fixed pasteboard extent — no grow-to-fit ([B-027](./prd/bugs-designer.md)) —
  merged (#234) & archived (2026-07-07, `2026-07-07-fixed-pasteboard-extent`);
  drag/nudge clamped to the extent, jitter-free by construction.
- High zoom (6400%) + pixel grid ([D-120](./prd/designer.md)) — merged (#240) &
  archived (2026-07-07, `2026-07-07-high-zoom-pixel-grid`);
  device-pixel-snapped grid, crisp at fractional zoom.
- Deterministic fit + center on project/template open and composition switch
  ([B-035](./prd/bugs-designer.md)) — focused fix, merged (#229).
- Inspector input icons vertically centered ([B-036](./prd/bugs-designer.md)) —
  CSS-only focused fix, merged (#226).
- Auto-size text + sizing=auto guard ([D-060](./prd/designer.md) +
  [D-046](./prd/designer.md)) — merged & archived (2026-06-29, design #218 + impl
  #223). A `text` element with `fitMode: 'autosize'` now hugs its content in BOTH
  dimensions via CSS intrinsic sizing (`max-content` + `white-space: pre`; `\n`
  honored, no auto-wrap; min box; RTL pins the right edge) — synchronous +
  CEF/`file://`-safe, identical in preview / `.vcg` / single-file HTML. The selection
  gizmo traces the measured rendered box with inert resize handles; vertical-align is
  disabled in Auto (horizontal kept). D-046 guard: switching to Auto with size
  keyframes warns+confirms then deletes them as one undo; Auto→Fixed commits the
  measured size once. Living specs: `designer-text-autosize` (net-new),
  `designer-shapes` (gizmo MODIFIED). Archive:
  `2026-06-29-consume-fitmode-auto-size-text`. (Squeeze-off / `shrink-to-fit` remain
  out of scope; starter-template visual repair folds into [D-119](./prd/designer.md).)
- Guide readout + nudge, split exit, explicit field Update ([D-072](./prd/designer.md) /
  [D-073](./prd/designer.md) / [D-105](./prd/designer.md) / [D-106](./prd/designer.md)) — merged &
  archived (2026-06-29, PRs #160 · #194 · #198). D-072 guide coordinate badge on hover/drag, D-073
  arrow-key nudge (Shift = 10px, keyframe-aware, one undo step per key-press run), D-105 split exit
  (animated "Out" = content-first/background-last vs a quick "Stop"/"Clear" hard removal), D-106
  preview field form with an explicit global + per-INPUT Update and a pending/unapplied indicator
  (+ optional textarea). Archives: `2026-06-29-guide-coordinate-readout`, `2026-06-29-arrow-key-nudge`,
  `2026-06-29-preview-split-exit`, `2026-06-29-preview-field-update`.
- Selective content-driven hold ([D-107](./prd/designer.md)) — merged & archived (2026-06-28,
  PR #201). An optional `drivesHold` (absent ⇒ participates; non-breaking, no version bump) on
  ticker / sequence / clock lets the designer pick WHICH content closes the graphic: `ownContentWait`
  filters to `drivesHold !== false` (start/stop still cover ALL content; D-104's `contentTreeWait`
  aggregation flows through, so nested selection works for free; all-excluded / none ⇒ zero-length
  hold). The PlayoutSection shows a pre-checked checklist of the active composition's own content
  (wall/countup clocks never listed); a recursive `setElementDrivesHold` reaches grouped content.
  Living spec: `designer-playout-lifecycle`. Archive: `2026-06-27-selective-content-hold`. Follow-up
  [D-108](./prd/designer.md) surfaces nested-composition hold-driving content (read-only) in the
  checklist.
- Nested-composition content lifecycle ([D-104](./prd/designer.md)) — merged & archived (2026-06-27,
  PR #191). Finite content (ticker / sequence / countdown) inside a NESTED composition now participates
  in the parent's content-driven hold: `hasContentElement` recurses into composition instances (so the
  hold control is OFFERED), and a content-driven "coordinator" scope starts + awaits its OWN content PLUS
  its non-coordinator nested descendants' at its hold entry — the parent holds until the nested content
  completes (infinite → until `stop()`) and the nested content starts AFTER the parent's intro, not on
  the play cascade. Content-driven nested comps stay independent (skipped); repeater rows / sequence
  comp-items unaffected; the root `contentHold` override is preserved. NON-BREAKING (no schema change).
  Living spec: `designer-playout-lifecycle`. Archive: `2026-06-27-nested-content-lifecycle`. Follow-up
  [B-030](./prd/bugs-designer.md) filed (the timed-auto-out nested-holder strand edge).
- Sequence typed items — Phase 1 ([D-083](./prd/designer.md)) — merged & archived (2026-06-27, PRs
  #182 / #183 / #185 / #186 / #188). A sequence item is now TEXT or a COMPOSITION reference
  (clock+text / logo+text layouts cycled under the same transitions / dwell; live content runs inside,
  the comp's own intro/outro held); NON-BREAKING (`kind` defaults to `'text'`, no migration). The #188
  follow-up made TEXT items bind EXPLICITLY (operator opt-in) instead of auto-exposing every item as a
  field. Living spec: `designer-sequence-element`. Archive: `2026-06-27-sequence-typed-items`. Phase 2
  (per-item field injection into composition items) remains later.
- Start-trimmed content no longer dropped from play/export ([B-029](./prd/bugs-designer.md)) — focused fix,
  merged (2026-06-27, PR #187, 9737ab9). A clock / ticker / sequence trimmed at its start
  (`lifespan.in > 0`) was hidden for the whole playout because the lifespan gate ran only in the
  scrubber's `tick`, not the PlayoutController's per-frame `applyFrame`; the root controller now
  evaluates the same `applyLifespanGatesAtFrame` during play, so the element appears at its in-point.
  No change dir (focused fix); regression tests in `runtime.test.ts` + `trimmed-content-start.spec.ts`.
- Per-element preview timing — Phase 1 ([D-102](./prd/designer.md)) — merged & archived
  (2026-06-26, PR #180). Ticker timing in the preview moved from per-scope to PER-ELEMENT (keyed by
  element id), so two tickers in one composition are tuned independently — each ticker's own
  repeat / cycle-seam applies to its OWN driver; the timing panel shows one row per ticker
  (duplicate names disambiguated) and scrolls; session-only (the stored template is untouched).
  Archive: `openspec/changes/archive/2026-06-26-per-element-preview-timing/`.
- Per-element preview timing — Phase 2 ([D-102](./prd/designer.md)) — merged & archived
  (2026-07-14, PR #320, `6c55b70`). The same session-only mechanism now covers SEQUENCES (own passes
  - per-item dwell) and COUNTDOWN clocks (a preview duration — the only way to rehearse a `datetime`
    deadline; wall/countup stay unlisted), and the timing tree finally DESCENDS a repeater into its
    child composition, so a ticker that exists only as repeater-stamped rows is visible and tunable —
    one control governs every stamped row (they all carry the same authored element id). Session-only:
    no schema / runtime / export / on-air change. Archive:
    `openspec/changes/archive/2026-07-14-extend-preview-timing-sequence-countdown/`. Follow-up
    [B-080](./prd/bugs-designer.md) (#322, `1002fdb`) put those new duration controls in SECONDS to
    match the element properties (internal model still ms).
- Sequence/clock wave ([D-084](./prd/designer.md), [D-039](./prd/designer.md) ext,
  [D-103](./prd/designer.md)) — merged & archived (2026-06-26, PR #177). D-084 clock selectable
  IANA time zone (wall mode via `Intl`, Persian digits preserved; invalid zone degrades to local),
  D-039 ext ticker image/logo separator (project OR shared library, between-items only, follows
  `verticalAlign`, inlined + preflighted on export), D-103 clock blinking colon (opacity pulse at an
  adjustable rate, no reflow). All NON-BREAKING additive schema widenings — no version bump or
  migration. Archives under `openspec/changes/archive/2026-06-26-clock-timezone/`,
  `…-ticker-image-separator/`, `…-clock-blink-colon/`. PRD → [x]. (The wave's D-081/D-082 shipped
  earlier in Group A.)
- Group A quick-wins ([D-081](./prd/designer.md), [D-082](./prd/designer.md),
  [D-097](./prd/designer.md), [D-098](./prd/designer.md), [D-099](./prd/designer.md),
  [D-100](./prd/designer.md), [D-101](./prd/designer.md) + [B-024](./prd/bugs-designer.md)) — merged
  (2026-06-26, PR #175; filed in #174). D-081 no-trailing ticker separator, D-082 English
  ticker/sequence defaults (+ LTR direction & white default text), D-097 distinct shared-image
  timeline icon/color, D-098 bound-layer key icon, D-099 minimum-window-size gate, D-100 menubar
  hover-to-switch, D-101 red unbind control matching the row remove, B-024 non-negative
  width/height/scale. All FOCUSED FIXES (no living-spec change to archive); the batch also added
  Ctrl+O / Ctrl+S / Ctrl+Shift+S file shortcuts + right-aligned menu shortcut hints. PRD → [x].
- Timeline/layers wave ([D-074](./prd/designer.md)–[D-079](./prd/designer.md)) — merged &
  archived (2026-06-26, PRs #167–#171). D-074 (zoom-slider border removed), D-075 (new default
  per-type layer colors), D-076 (multi-select layer context menu), D-077 (copy/cut/paste
  shortcuts — physical-key / Persian-safe), D-078 (pinned scene row), D-079 (inline color hex
  input widen + shorthand normalize). D-076/D-077 and D-078 carry living-spec deltas
  (`designer-multi-select`, `designer-animation-timeline`); D-074/D-075/D-079 were focused fixes
  (no change dir). Archives: `2026-06-26-multi-select-clipboard`, `2026-06-26-pin-scene-row`.
  D-080 was reserved but unused. (Follow-up `fix/playhead-above-scene-row` — keep the index line
  above the pinned scene row — PR open.)
- Icon pack — shared vector `Icon` (lucide-react) replacing the ad-hoc Unicode-glyph
  icons across the Designer ([D-092](./prd/designer.md)) — merged & archived
  (2026-06-25, PR #163). App-local `Icon` (`currentColor` / `aria-hidden` / one
  `size` / opt-in `flipRtl`) across tools, alignment, transform, chevrons, transport,
  callouts, the timeline layer-type icons, and the panel grid/list + zoom + add +
  radius controls; the Select dropdown chevron is a real lucide element; tool palette
  reordered drawing-first → dynamic. `lucide-react` (ISC) imported per-icon +
  recorded in `THIRD_PARTY_LICENSES.md`. Living spec: `designer-controls`. Archive:
  `2026-06-25-replace-glyph-icons`. (Standalone fixes rode the same branch: canvas
  checkerboard contrast, Compositions panel border, a vcg-format lint fix.)
- Pasteboard editing epic ([D-071](./prd/designer.md) Phase A off-frame export
  filter + Phase B editor + [B-026](./prd/bugs-designer.md) grow-to-fit extent) — merged &
  archived (2026-06-21 / 2026-06-22, PRs #153 / #154 · #155 / #156 · #157). An
  off-frame staging area outside the frame, excluded from export / `.vcg` /
  single-file HTML, with the pasteboard extent growing to contain content parked
  far off-frame. [B-027](./prd/bugs-designer.md) (during-drag drift) filed **DEFERRED**.
  Archives: `2026-06-21-off-frame-export-filter`, `2026-06-22-pasteboard-editing`,
  `2026-06-22-pasteboard-extent-fits-content`. Living spec: `designer-canvas-viewport`.
- Per-composition export + top-chrome relocation ([D-086](./prd/designer.md),
  **absorbs [D-095](./prd/designer.md)**) — merged & archived (2026-06-21, PRs
  #144 / #145 / #147). Phase A scopes `.vcg` / HTML export to the open
  composition plus its nested closure; Phase B relocated the global chrome (slim
  top bar, centered project name adjacent to Save) and added the per-composition
  Preview / Export / HTML bar. Also fixed [B-023](./prd/bugs-designer.md)
  (repeater-mediated nesting cycle slipping past the author-time guard). Archive:
  `2026-06-21-per-composition-export-and-chrome`. Living specs:
  `designer-composition-export` (net-new), `designer-shell`, `designer-repeater-element`.
- Stop/close = CLEARED terminal state ([D-085](./prd/designer.md)) — merged &
  archived (2026-06-21, PRs #150 / #151). Stop and close now resolve to a CLEARED
  terminal state. Archive: `2026-06-21-stop-clears-composition`.
- Preview blank-until-play ([D-087](./prd/designer.md)) — merged & archived
  (2026-06-21, PRs #148 / #149). The preview opens blank until Play. Archive:
  `2026-06-21-preview-blank-until-play`.
- Global button restyle ([D-094](./prd/designer.md)) — merged & archived
  (2026-06-20, PRs #142 / #143). No default border + refined accent colors at the
  shared button recipe; the [B-025](./prd/bugs-designer.md) gizmo-frame render fix
  (selection box renders again) rode alongside (#146). Archive:
  `2026-06-20-restyle-buttons`.
- Selection-overlay scale + rotate fix ([B-022](./prd/bugs-designer.md)) — merged &
  archived (2026-06-20, PRs #141 / #143). The selection overlay now tracks the
  shape under scale + rotation. Archive: `2026-06-20-fix-selection-overlay-scale-rotate`.
- Desktop-style Save epic ([D-088](./prd/designer.md) + folded [D-089](./prd/designer.md)
  Save-button unsaved visual + [D-093](./prd/designer.md) non-destructive Remove-from-Recent) —
  merged & archived (2026-06-20, PR #139). Native `FileSystemFileHandle` persisted in IndexedDB
  (survives reload, permission re-acquired in the click gesture), content-hash dirty +
  tab-title / `beforeunload` guards, Home-closes-project, handle-keyed Recent + tiered
  OPFS/download fallback. Absorbs D-002 / D-003. Living spec: `designer-project-persistence`.
- Asset-import polish ([D-067](./prd/designer.md) loading indicator + the headerless D-069/D-070
  multi-select + prepend sub-labels + the [B-019](./prd/bugs-designer.md) / [B-020](./prd/bugs-designer.md) /
  [B-021](./prd/bugs-designer.md) fixes, and [D-068](./prd/designer.md) Shared Library search + grid/list
  view toggle) — merged & archived (2026-06-20, PRs #138 / #137 / #134 / #130). Living specs:
  `designer-project-assets` (net-new), `designer-shared-image-library`.
- Shared image library epic ([D-040](./prd/designer.md) + [D-062](./prd/designer.md)) — archived
  (2026-06-17). [D-062](./prd/designer.md) (merged) wired the per-project image byte→`src`
  render/inline path (runtime `assetUrls` seam + `.vcg` packaged paths + single-file HTML base64
  inline + missing-asset report) and left the source-aware seam; [D-040](./prd/designer.md) added the
  device-level shared image library + logo element (the `source: 'shared'` image, two-source resolver
  across preview / `.vcg` / HTML, library panel + canvas logo tool + inspector combo). Living specs:
  `designer-image-export`, `designer-shared-image-library`. Follow-ups filed:
  [D-064](./prd/designer.md) (re-wire repeater-stamped image `src` at playout). ([D-063](./prd/designer.md),
  drag a library image → canvas, was **DROPPED** 2026-07-13 as redundant given
  [D-066](./prd/designer.md) — the device-level library panel is moving out of the per-project UI, so a
  drag-from-panel-onto-canvas gesture has no stable home; ID retired, not reused.)
- Owner UX-feature wave ([D-042](./prd/designer.md) → [D-048](./prd/designer.md) + [D-052](./prd/designer.md)) —
  complete. The final batch ([D-043](./prd/designer.md) box-shadow spread+inset, [D-044](./prd/designer.md)
  font-weight, [D-045](./prd/designer.md) unified alignment + vertical align, [D-047](./prd/designer.md)
  layer-reorder drag, [D-048](./prd/designer.md) inspector visual polish, + the [B-018](./prd/bugs-designer.md)
  spread static-write fix) merged & archived (2026-06-17); D-042 and D-052 landed earlier. The wave
  is now fully closed: [D-046](./prd/designer.md) (sizing=auto guard) — for a long time the wave's one
  parked item, blocked on [D-060](./prd/designer.md) (auto-size rendering) — is **done**: D-060 shipped
  and archived (`2026-06-29-consume-fitmode-auto-size-text`, which covers D-046), and D-046 is `[x]` and
  archived. (This line previously still called D-046 "NOT done — PARKED"; corrected by the 2026-07-13
  `[~]` audit.)
- Multi-select chain ([D-041](./prd/designer.md) + follow-ups D-049 / D-050 /
  D-051 / D-053 / D-054 + [B-014](./prd/bugs-designer.md)) — merged & archived
  (2026-06-14); multi-select editing now reaches single-selection parity "fanned
  out": keyframe-aware group move + field edits (reusing `commitAnimatable`),
  aggregate keyframe diamonds (empty / at-frame / partial), realtime single-undo
  number fields, and the central keyframe-ability + inspector-field registry
  (D-051). Living specs: `designer-multi-select`, `designer-inspector-registry`.
- Ticker/crawler ([D-028](./prd/designer.md)) — merged; two-loop model (ticker
  repeat/cycleBoundary + holdSource axis), hard-stop pinned
- Clock element ([D-027](./prd/designer.md)) — merged; wall/countup/countdown
  on the ticker's self-wire pattern, countdown = content source
- Sequence / now-next ([D-029](./prd/designer.md)) — merged; decomposed
  in/out/timing transitions with presets, per-item dwell, real `next()`
  dispatch (the D-031 seam), finite sequence = third content source
- Repeater / data-driven layout ([D-030](./prd/designer.md)) — merged; one
  child-composition instance per data-list row, reuses the D-028 extensible
  list field

## Next — agreed order

The agreed sequence, top to bottom. It is ONE list: the Designer/Runtime split that used
to head this section is gone with the two-worktree model — there is one session on one
branch, so work is sequenced, not parallelised.

1. **Repo model + gate base** — retire the worktree / feature-branch / PR model in
   `CLAUDE.md` and the docs, and repoint the Stop hook's diff base from `origin/main` to
   `origin/dev` ([P-026](./prd/platform.md)). _(This entry; done when it lands.)_
2. **`live-source-multibox` — [D-137](./prd/designer.md) + [C-015](./prd/caspar.md)**, the
   owner's chosen next feature. Phases 1–6, with the audio cluster
   ([R-029](./prd/runtime.md), [R-042](./prd/runtime.md),
   [B-121](./prd/bugs-runtime.md)) folded in as **phase 6.5**. Change dir:
   `openspec/changes/live-source-multibox/`.
3. **The on-air honesty bug cluster** — [B-109](./prd/bugs-runtime.md),
   [B-107](./prd/bugs-runtime.md), [B-126](./prd/bugs-runtime.md),
   [B-122](./prd/bugs-runtime.md), [B-125](./prd/bugs-runtime.md),
   [B-115](./prd/bugs-runtime.md), [B-120](./prd/bugs-runtime.md),
   [R-017](./prd/runtime.md). All one theme: what the operator sees must be what is
   actually on air.
4. **The Designer output-parity bugs** — [B-129](./prd/bugs-designer.md),
   [B-104](./prd/bugs-designer.md), [B-102](./prd/bugs-designer.md): preview and `.vcg`
   output must agree with what CasparCG actually renders.
5. **Close the near-complete changes, whenever convenient.** Each is a task or two from
   done; none blocks anything above it (the exact remaining tasks are in each change's
   `tasks.md`):
   - `runtime-persian-digit-input` — 11/11, every task checked
   - `runtime-field-from-file` — 20/21 (owes one Linux `gate:e2e`)
   - `runtime-from-file-persistence` — 19/21 (owes an E2E + an owner check)
   - `platform-gate-test-bound` — 17/18 (owes an owner confirmation over real runs)
   - `runtime-splash-screen` — 21/25 (owes a Linux `gate:e2e` + three recorded follow-ups)
6. **`runtime-unified-layer-rows` / [R-028](./prd/runtime.md) part B**, then
   [R-031](./prd/runtime.md) / [R-032](./prd/runtime.md) / [R-033](./prd/runtime.md) —
   the operator surface.
7. **`add-azan-countdown` — [D-141](./prd/designer.md)**, currently 42/63.
8. **[C-020](./prd/caspar.md) → [C-018](./prd/caspar.md) (CasparCG 2.5.0)** — owner +
   hardware, not code. C-020 (2.5.0 removed the iVGA consumer, which is this plant's whole
   air path) gates C-018.

**Still open, not sequenced above** — carried forward so they are not lost:
[B-056](./prd/bugs-runtime.md)'s live smoke (owned-slot occupancy under a downed primary —
needs a mirror pair), [R-009](./prd/runtime.md), and [R-010](./prd/runtime.md) (needs a
second machine + JWT auth). Everything else previously listed here is either archived (see
Done) or queued in the PRD without a slot in this order — the PRD files remain the backlog
of record.

## Then — hardening wave (after features)

No PRD items filed yet — file them when this wave is scheduled.

1. Visual regression (Playwright screenshots; CI-only baseline)
2. Exported-artifact test (load the single-file HTML headless; update→play→
   update→stop; no console errors / external requests)
3. Runtime a11y (axe in E2E on main surfaces)
4. Light perf guardrails (frame-drop budget on a heavy preview scene)

## Then — infra/quality

- Extract domain SKILLS from scattered docs ([P-007](./prd/platform.md))

## Parked / strategic

- License decision · user-docs site ([P-006](./prd/platform.md)) · MOS ·
  target-hardware validation · on-air reference · soft-stop
  ([C-008](./prd/caspar.md), rundown layer)

# Auto-size text rendering — consume `fitMode` (D-060) + sizing=auto guard (D-046)

This change covers **both** D-060 (consume `fitMode`) and **D-046** (the
sizing=auto guard), folded together per the PRD because the guard is what makes
D-060's "size is content-driven in Auto" safe and non-silent.

## Why

The text element's **Sizing** toggle (Auto / Fixed) has no visible effect. The
schema field `fitMode` and the UI control both exist, but the runtime never reads
`fitMode` — `buildText` always sizes the box from `transform.size`
(`scene-builder.ts:233-234`, via `applyBaseStyles`). So "Auto" is a dead toggle:
auto-sizing is half-built (schema + UI scaffold present, rendering absent). This
change makes Auto actually hug the text content, in a way that renders identically
in the Designer preview, the exported single-file HTML, and CasparCG CEF.

## What Changes

The locked scope (decided with the owner — not expanded here):

1. **Auto = BOTH dimensions.** When `fitMode` is auto, the text box shrink-wraps
   its content in **width AND height**. There is no auto-width-only or
   auto-height-only mode. The toggle maps: **Auto → both-hug**, **Fixed →
   `transform.size`** (today's behavior, unchanged).
2. **Text element ONLY.** Applies solely to the plain `text` element. Ticker,
   sequence, clock, and repeater keep their current sizing — none share the
   text-sizing path that changes here (confirmed in design.md §A).
3. **No auto-wrap.** A full hug does NOT wrap text to a fixed width. Explicit
   newlines (`\n`) in the content ARE honored (multi-line → width = widest line,
   height = sum of line heights). Width-constraint line-wrapping is out of scope.
4. **Size handles disabled in Auto.** The selection gizmo's resize handles
   (4 corners + 4 edges) are inert for an auto text box; body-move and rotate
   stay active. Dragging a resize handle does nothing — it never silently flips
   to Fixed.
5. **Anchor = the element's position corner.** As the text grows/shrinks the
   anchored corner stays put — top-LEFT for LTR (box grows right/down), top-RIGHT
   for RTL/Persian (box grows left/down). Growth never repositions the element.

Plus the interactions this forces (resolved in design.md):

- **Vertical-align disabled in Auto** (no vertical slack when the height hugs);
  **horizontal-align stays enabled** because it still aligns shorter lines within
  a multi-line box's widest-line width. Toggling back to Fixed restores both with
  their stored values intact.
- **Render mechanism = CSS intrinsic sizing** (`width/height: max-content` +
  `white-space: pre`), chosen for frame-determinism and CEF/`file://` safety — no
  JS measurement race (design.md §B).
- **Export parity falls out** of the shared runtime; the exporters snapshot no
  per-element size (design.md §G).
- **Back-compat:** `fitMode` is honored as authored. Existing scenes/starter
  templates that already carry `fitMode: 'autosize'` will now hug — the shipped
  starter templates are audited/repaired as part of this change (design.md §F).

### D-046 — sizing=auto guard (warn + confirm)

Because Auto makes the box content-driven, any **size keyframes** (`size.w` /
`size.h`) on a text element become meaningless in Auto (D-060 ignores them at
render). To make that non-silent, switching a text element's Sizing toggle **to
Auto** is guarded (owner-decided behavior A):

- **No size keyframes** → switch to Auto immediately (no modal).
- **Has size keyframes** → a small **confirm modal** explains that Auto is
  content-driven and its existing size keyframes will be removed; **Confirm**
  switches to Auto AND deletes the `size.w` / `size.h` tracks as **one undoable
  step**; **Cancel** stays Fixed with the keyframes untouched (no silent switch).
- **Auto → Fixed** needs no modal (nothing is destroyed); the box falls back to
  `transform.size` (the value preserved from before Auto — consistent with the
  D-060 design's "`transform.size` stays Fixed's source of truth, no write-back";
  see design.md §D-046-E).

Out of scope (stated to bound the work): `fitMode: 'shrink-to-fit'` and
`autoSqueeze` (font-shrink-to-fit) remain unimplemented as today; auto line-wrap.

## Capabilities

- **`designer-text-autosize`** (ADDED — net-new capability): the auto-size
  rendering contract — Auto hugs both dimensions; `\n` honored with no auto-wrap;
  the anchor/growth-direction model incl. RTL; vertical-align disabled (horizontal
  retained) while Auto; size handles inert while Auto; export parity; the
  honor-as-authored back-compat rule with a minimum box for empty text; **and the
  D-046 sizing=auto guard** — switching to Auto with size keyframes prompts a
  confirm modal that (on confirm) switches + deletes the size tracks in one
  undoable step, while a clean switch (no size keyframes) and Auto→Fixed apply
  immediately.
- **`designer-shapes`** (MODIFIED): the "Move and resize shapes" selection-gizmo
  requirement is amended so the gizmo traces an auto text box's **rendered**
  geometry (not `transform.size`) and its resize handles are inert in Auto, while
  preserving the B-022 scale·rotate-about-anchor tracking for every other case.

## Impact

- **Schema** (`@cg/shared-schema`): no NEW field — `fitMode` already exists
  (`elements.ts:91`). No version bump. (A docstring may be updated to record that
  the runtime now consumes it.)
- **Runtime render** (`@cg/template-runtime` `scene-builder.ts` `buildText`):
  branch on `fitMode` — Auto omits the `transform.size` width/height and applies
  intrinsic sizing + `white-space: pre` + RTL edge-pinning + a minimum box; skips
  the vertical-align flex wrapper (no vertical slack). `applyBaseStyles` gains a
  way to skip writing width/height for the auto box. `animation-applier.ts`
  size-track writes are ignored for an auto text box.
- **Gizmo / overlay** (`apps/designer/.../canvas/Gizmo.tsx`, `geometry.ts`):
  read the selected auto-text element's rendered box (measured from the preview
  iframe, scene-space) instead of `transform.size`; disable the resize handles;
  keep move + rotate; re-measure on text/font/size change and on
  `document.fonts.ready`.
- **Inspector UI** (`apps/designer/.../inspector/`): disable the vertical-align
  control (keep horizontal) for a text element while `fitMode` is Auto, without
  clearing the stored `align`/`verticalAlign`. `AlignButtonGroup` gains a
  `disabled` prop (default false → other kinds unaffected).
- **Inspector — D-046 guard** (`TextStyleSection.tsx:88-92` Sizing toggle): rewire
  the to-Auto handler to detect size keyframes (`el.animation.tracks['size.w'|'size.h']`,
  mirroring `off-frame.ts` `hasGeometryAnimation`) and, when present, open a confirm
  modal instead of switching directly; on confirm, run the `fitMode='autosize'`
  write + `clearKeyframeTrack(id,'size.w')` + `clearKeyframeTrack(id,'size.h')`
  (`timeline.ts:229`) inside `runAsSingleHistoryEntry` (one undo). New small
  `SizingAutoConfirmModal` built on the shared `Modal`/`ModalButton`
  (`features/shell/Modal.tsx`) — no new modal primitive.
- **Exporters**: none required — `.vcg` and single-file HTML reuse the shared
  runtime and snapshot no per-element size (`ExporterSingleFile.ts` sizes only
  the stage). Verified, not changed.
- **Starter templates** (`@cg/starter-templates`): audit every
  `fitMode: 'autosize'` text and confirm/repair its appearance under real
  auto-size (this is the roadmap "template cleanup" tail, pulled in here).
- **Docs**: engine doc-sync — `packages/template-runtime/README.md` (text sizing)
  and the canvas feature README (gizmo on a content-sized box).
- **Tests**: runtime unit (hug both dims, `\n`, no-wrap, RTL edge-pin, empty-box
  min, size-track ignored), and Designer E2E (toggle Auto hugs; handles inert;
  V-align disabled / H-align enabled; toggle back to Fixed restores). **D-046**:
  store/unit (to-Auto with no size keyframes switches immediately; with size
  keyframes the switch + track deletion is one undo step; Cancel leaves both
  untouched; Auto→Fixed no-ops the guard) + E2E (the confirm modal appears only
  when size keyframes exist, Confirm/Cancel outcomes, single undo).

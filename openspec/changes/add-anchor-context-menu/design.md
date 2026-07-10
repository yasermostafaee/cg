# Design — add-anchor-context-menu (D-123)

## Recon / design notes (per the prompt's resolve-in-design list)

- **Trigger surface — anchor squares only.** The `onContextMenu` handler sits on the anchor
  `<rect data-cg-anchor>` elements exclusively; the bézier handle dots and the segment `<line>`s
  get no handler, so right-clicking them behaves as today. Right-clicking an anchor also
  `setActive`s it (visual confirmation of the target); `dragAnchor` now ignores non-primary
  buttons (it previously started a move on right-press too — a latent wart the wiring exposed).
- **Native menu suppression.** App.tsx (D-076 era) already suppresses the native context menu
  APP-WIDE (`window.addEventListener('contextmenu', preventDefault)`), so "suppress only over
  anchors" is already satisfied globally and right-click elsewhere keeps today's behavior exactly.
  The anchor handler still calls `preventDefault` + `stopPropagation` itself (defense in depth,
  and it keeps the component correct if the global listener ever changes), as does the menu
  backdrop — the same belt-and-braces the timeline menu uses.
- **Pen interaction — no conflict by construction.** The menu lives in `PathEditor`, which since
  B-037 mounts ONLY with the cursor tool (`tool === 'cursor'`) — the pen can't be armed while an
  anchor is right-clickable, and `isPenDrawing()` implies the pen tool, so no draft can exist
  either. Right-click with the pen armed is explicitly out of scope (today's behavior: the
  app-wide suppression eats the native menu; nothing else happens — `penPointerDown` is only
  wired to the overlay's left-button path).
- **Rotation / coordinates.** The menu anchors at the POINTER's viewport coordinates
  (`e.clientX/Y`), not at a computed anchor position — so the existing `screen()` mapping (and
  its known no-rotation v1 limitation) is irrelevant to menu placement: wherever the anchor rect
  actually rendered and was right-clicked is where the menu opens. Placement is clamped into the
  viewport like the timeline menu. The menu renders `position: fixed` from a sibling of the
  overlay SVG (a fragment, since HTML can't render inside `<svg>`); no ancestor of the overlay
  applies a CSS transform (the stage scales via width/height math; only the preview iframe is
  transform-scaled, and the overlay is its sibling), so fixed positioning is viewport-true — same
  assumption the timeline menu makes. The E2E asserts the menu opens and operates where clicked.
- **Menu primitive — none shared; minimal new one, pattern-matched.** The only in-app menus
  (timeline `LayerContextMenu`, panel menus) are bespoke per-feature components: a fixed
  full-viewport backdrop (outside-click close, contextmenu suppressed) + a clamped
  `role="menu"` box with `role="menuitem"` rows and a window-Escape listener. There is no shared
  reusable primitive to import, so `AnchorContextMenu` is a MINIMAL new component in the canvas
  feature following that exact pattern — with the accessibility the spec demands and the timeline
  menu lacks: items are real `Control` buttons (shared primitive, native focus/Enter/Space), focus
  moves to the first item on open, ArrowDown/Up cycle with wrap, and Esc closes via a
  CAPTURE-phase window listener that `preventDefault`s + `stopImmediatePropagation`s.
- **Esc ownership.** The capture-phase stop is the same mechanism `PathEditor`'s Delete handler
  uses to pre-empt the global delete shortcut: the canvas Esc handler (deselect / pen exits,
  B-037) listens on window in the BUBBLE phase, so the menu's capture-phase listener runs first
  and stops the event — closing the menu never deselects the path or changes the tool.
  Scroll/wheel dismissal via a window `wheel` listener (the canvas scroll container scrolls on
  wheel; a menu floating over a scrolled-away anchor would mislead).
- **Extensibility.** The menu takes an `items: { label, onSelect }[]` array — a future "Convert
  to corner/smooth" is one array entry in `PathEditor`. Only Delete point ships (no disabled
  placeholders, per the owner decision).

## Out of scope (unchanged behavior, noted)

- Right-click on segments/handles, on the canvas at large, on other element kinds.
- Multi-anchor selection semantics (the menu acts on the right-clicked anchor only).
- The overlay's no-rotation v1 limitation (D-109) — untouched.

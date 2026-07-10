# designer-path-element (D-123 delta)

## MODIFIED Requirements

### Requirement: A selected path is fully editable

When a path is selected with the select tool, its anchors and handles SHALL be shown. Dragging an
anchor SHALL move it; dragging a handle SHALL reshape the adjacent segment(s); a smooth anchor SHALL
keep its two handles mirrored while a corner anchor moves each independently; a modifier (Alt) SHALL
break a mirrored pair into an independent corner. Clicking a segment SHALL insert a CORNER anchor
there; click-DRAGGING a segment SHALL insert a SMOOTH anchor whose mirrored handles follow the drag
(the pen's drag-to-smooth gesture, applied on insertion; corner vs smooth decided at pointer-up by
the same screen-px guard, the whole insertion one undo entry). Removing an anchor SHALL re-stitch
the path across the gap; removing below 2 anchors SHALL delete the whole element. Right-clicking an
anchor square SHALL open a small context menu at the pointer (the browser's native menu suppressed)
whose first item, **Delete point**, removes THAT anchor with the SAME semantics as the keyboard
delete — re-stitching across the gap, deleting the whole element below 2 anchors, one undo entry.
The menu SHALL be an accessible menu (menu/menuitem roles, focus moves into it, Arrow/Enter/Esc
work) and SHALL dismiss on outside click, Esc, scroll, or item selection — an Esc that closes the
menu SHALL NOT also fall through to the canvas Esc handling (deselect/tool exit). Each edit gesture
SHALL be one undo entry. Edit affordances are SELECT-TOOL-ONLY: while the pen tool is armed,
neither the anchor/handle overlay nor the transform gizmo SHALL be mounted or interactive over the
canvas — a pen click near an existing (even selected) path starts or extends the draft and SHALL
NOT insert an anchor into, resize, or otherwise edit that path.

#### Scenario: Drag anchors and handles

- **WHEN** the operator drags an anchor or a handle on a selected path
- **THEN** the anchor moves / the adjacent segments reshape; a smooth anchor's handles stay mirrored,
  a corner anchor's move independently, and Alt breaks a mirrored pair into a corner

#### Scenario: Insert and remove anchors

- **WHEN** the operator clicks a segment (insert) or removes an anchor (Delete)
- **THEN** a new anchor is inserted preserving the path / the path re-stitches across the gap, and
  removing below 2 anchors deletes the whole element

#### Scenario: A segment click-drag inserts a smooth anchor

- **WHEN** the operator presses on a selected path's segment and drags before releasing
- **THEN** the inserted anchor is SMOOTH with mirrored handles following the drag — the path curves
  through it — while a plain segment click still inserts a corner

#### Scenario: Right-click an anchor opens the context menu; Delete point removes it

- **WHEN** the operator right-clicks an anchor square on a selected path and chooses Delete point
- **THEN** no native browser menu appears, an accessible menu opens at the pointer, and THAT anchor
  is removed with the keyboard-delete semantics (re-stitch; below 2 anchors deletes the element;
  one undo restores the pre-delete path)

#### Scenario: The anchor menu dismisses cleanly

- **WHEN** the menu is open and the operator clicks elsewhere, scrolls, or presses Esc
- **THEN** the menu closes without acting, and an Esc close does NOT also deselect the path or
  change the tool

#### Scenario: Pen clicks are never hijacked by edit affordances

- **WHEN** a path element is selected, the pen tool is armed, and the operator clicks near that
  path's outline or bounding box
- **THEN** the click goes to the pen (starting or extending a draft) — no anchor is inserted into
  the selected path and no resize/rotate gesture starts

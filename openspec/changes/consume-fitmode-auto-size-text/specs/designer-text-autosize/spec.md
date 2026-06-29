# designer-text-autosize (D-060 delta)

## ADDED Requirements

### Requirement: Auto sizing hugs the text box to its content in both dimensions

When a text element's `fitMode` is `autosize`, the runtime SHALL size its box to
shrink-wrap the rendered text in BOTH width and height (intrinsic content sizing),
ignoring `transform.size`; when `fitMode` is `fixed` the box SHALL use
`transform.size` exactly as before. The auto box SHALL be produced by CSS
intrinsic sizing (no JavaScript measurement), so the on-air size is a pure,
synchronous function of the content + font + style and does not depend on
measurement timing. This applies to the plain `text` element ONLY — ticker,
sequence, clock, and repeater sizing are unchanged.

#### Scenario: Auto hugs the content in width and height

- **WHEN** a text element with `fitMode: 'autosize'` is rendered
- **THEN** its box width equals the rendered text's intrinsic width and its box
  height equals the rendered text's intrinsic height (it does not use
  `transform.size`)

#### Scenario: Fixed is unchanged

- **WHEN** a text element with `fitMode: 'fixed'` is rendered
- **THEN** its box uses `transform.size` width and height exactly as before this
  change

#### Scenario: Only the text element is affected

- **WHEN** a ticker, sequence, clock, or repeater is rendered
- **THEN** its sizing is unchanged by this feature (auto sizing applies to the
  plain text element only)

### Requirement: Auto sizing honors explicit newlines and does not auto-wrap

An auto-sized text box SHALL honor explicit newlines (`\n`) in the content —
rendering one line per newline-delimited segment, with the box width equal to the
widest line and the height equal to the sum of the line heights — and SHALL NOT
wrap text to fit a width constraint.

#### Scenario: Multi-line content sets width to the widest line

- **WHEN** an auto-sized text element's content contains explicit `\n` newlines
- **THEN** the box renders one line per segment, its width equals the widest
  line, and its height equals the sum of the line heights

#### Scenario: Long text does not wrap

- **WHEN** an auto-sized text element holds a long single line with no `\n`
- **THEN** the line is not wrapped to a width; the box grows to the line's full
  width (it may extend beyond the frame)

### Requirement: An empty auto-sized text box keeps a minimum selectable size

An auto-sized text element with empty or whitespace-only content SHALL retain a
minimum box size (at least one line at the current font / line-height) so it stays
visible, selectable, and editable rather than collapsing to zero.

#### Scenario: Empty auto text stays grabbable

- **WHEN** an auto-sized text element has empty or whitespace-only content
- **THEN** its box keeps a minimum width and height (at least one line) so it can
  still be selected and double-clicked to edit

### Requirement: An auto-sized text box grows from its reading-start anchor

An auto-sized text box SHALL keep its reading-start corner fixed as the content
grows or shrinks, so the element never repositions: for `ltr` (and `auto`)
direction the top-LEFT corner stays put and the box grows rightward and downward;
for `rtl` direction the top-RIGHT corner stays put and the box grows leftward and
downward.

#### Scenario: LTR growth keeps the top-left anchored

- **WHEN** an auto-sized `ltr` text element's content lengthens or shortens
- **THEN** its top-left corner stays at the same position and the box grows or
  shrinks toward the right and bottom (the element does not jump)

#### Scenario: RTL growth keeps the top-right anchored

- **WHEN** an auto-sized `rtl` (e.g. Persian) text element's content lengthens or
  shortens
- **THEN** its top-right corner stays at the same position and the box grows or
  shrinks toward the left and bottom (the element does not jump)

### Requirement: Alignment controls reflect auto sizing

While a text element's `fitMode` is `autosize`, the inspector SHALL disable the
vertical-align control (no vertical slack to distribute) while KEEPING the
horizontal-align control enabled (it still positions shorter lines within a
multi-line box's width); the stored `align` and `verticalAlign` values SHALL be
preserved unchanged, so switching back to `fixed` restores both controls with
their prior values.

#### Scenario: Vertical-align is disabled, horizontal-align stays enabled in Auto

- **WHEN** a text element has `fitMode: 'autosize'`
- **THEN** its vertical-align control is shown but disabled, and its
  horizontal-align control remains enabled and functional

#### Scenario: Toggling back to Fixed restores alignment

- **WHEN** the operator switches a text element from `autosize` back to `fixed`
- **THEN** the vertical-align control is re-enabled and both `align` and
  `verticalAlign` show their previously-stored values (nothing was cleared)

### Requirement: Auto sizing renders identically in preview and exports

An auto-sized text box SHALL render identically in the Designer preview, the
exported `.vcg`-served runtime, and the exported single-file HTML, because all
three use the shared runtime renderer and the exporters snapshot no per-element
size.

#### Scenario: Preview equals export for an auto box

- **WHEN** the same scene with an auto-sized text element is previewed and then
  exported to single-file HTML and `.vcg`
- **THEN** the text box hugs its content identically in all three (the export
  bakes no fixed width/height that would diverge from the auto box)

### Requirement: Existing fitMode values are honored as authored

The runtime SHALL honor each text element's stored `fitMode` as authored — an
existing scene or starter template carrying `fitMode: 'autosize'` now renders
auto-sized — and the default `fitMode` for a newly created text element SHALL
remain `fixed`, so new elements are unaffected.

#### Scenario: A pre-existing autosize element now hugs

- **WHEN** a scene authored before this change has a text element with
  `fitMode: 'autosize'`
- **THEN** on load it renders auto-sized (hugging its content), honoring the
  stored value

#### Scenario: New text elements default to fixed

- **WHEN** the operator adds a new text element
- **THEN** its `fitMode` defaults to `fixed` (its box uses `transform.size`)

### Requirement: Switching a text element to Auto guards its size keyframes (D-046)

Switching a text element's Sizing toggle to Auto SHALL NOT silently destroy data:
when the element has keyframes on its size track (`size.w` and/or `size.h`), the
Designer SHALL show a confirmation modal explaining that Auto sizing is
content-driven and the element's existing size keyframes will be removed, offering
**Confirm** (switch to Auto AND delete the size keyframes) and **Cancel** (stay
Fixed, keep the keyframes); when the element has NO size keyframes the switch to
Auto SHALL apply immediately with no modal; switching Auto → Fixed SHALL apply
immediately with no modal (nothing is destroyed) and the box SHALL fall back to
`transform.size`. A confirmed switch SHALL be a single undoable step (one undo
restores both `fixed` and the deleted size keyframes).

#### Scenario: Switching to Auto with no size keyframes applies immediately

- **WHEN** the operator toggles Sizing to Auto on a text element that has no
  `size.w` / `size.h` keyframes
- **THEN** `fitMode` becomes `autosize` immediately with no confirmation modal

#### Scenario: Switching to Auto with size keyframes prompts a confirm modal

- **WHEN** the operator toggles Sizing to Auto on a text element that has `size.w`
  and/or `size.h` keyframes
- **THEN** a confirmation modal appears explaining the size keyframes will be
  removed, and `fitMode` is NOT changed yet

#### Scenario: Confirming switches to Auto and removes the size keyframes in one undo step

- **WHEN** the operator confirms that modal
- **THEN** `fitMode` becomes `autosize` AND the element's `size.w` / `size.h`
  keyframe tracks are removed, together as a single undoable step (one undo
  restores both the `fixed` sizing and the deleted size keyframes)

#### Scenario: Cancelling leaves the element Fixed with its keyframes intact

- **WHEN** the operator cancels that modal
- **THEN** `fitMode` stays `fixed` and the element's size keyframes are untouched

#### Scenario: Switching Auto back to Fixed needs no modal and falls back to transform.size

- **WHEN** the operator toggles Sizing from Auto to Fixed
- **THEN** the switch applies immediately with no modal and the box renders at
  `transform.size` (the value preserved from before Auto)

#### Scenario: Multi-selection aggregates the guard

- **WHEN** the Sizing toggle is set to Auto for a multi-text selection in which at
  least one element has size keyframes
- **THEN** the confirmation modal appears (naming how many elements will lose
  keyframes); on Confirm every selected text element switches to Auto and the size
  keyframes are removed from those that had them as one undoable step, and on
  Cancel none of them switch

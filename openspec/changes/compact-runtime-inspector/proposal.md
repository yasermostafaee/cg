## Why

Operators need more of the Inspector's editable fields visible at once while keeping the selected
layer and its programme state in view.

## What Changes

- Give each Inspector section an independent disclosure and add a header toggle for all sections.
  Retain disclosure state across layer selection and Inspector layouts.
- Keep the layer name, template and state visible, and show the current placement and draft marker
  when Position is collapsed.
- Align simple Fields in compact rows and give larger editors the width they need.
- Place Timing before Position. Group Preset effect and Input effect in the independent Effects section.
- Match the approved fill and outline for those three control groups.
- Keep space in the preset buttons for Programme and Preview status, and keep the Update and Discard footer outside the scrollport.

## Capabilities

- Modify `runtime-ui` under R-008.

## Impact

CG Control Inspector layout and section visibility.

# designer-image-element Specification

## ADDED Requirements

### Requirement: An image can be fitted to ONE axis, with the overflow clipped

The image element's `fit` SHALL offer `fit-width` and `fit-height` beside the
existing `contain` / `cover` / `fill` / `none`. `fit-width` scales the asset so its
WIDTH matches the element's box, letting the height overflow or fall short;
`fit-height` is the mirror. The overflowing axis SHALL be CLIPPED to the element's
authored rect, and the asset SHALL be centred on that axis.

Both values SHALL round-trip through the scene schema, the `.vcg` package and the
single-file HTML export unchanged.

#### Scenario: Fit width scales the width and clips the overflow

- **WHEN** an image element's fit is set to `fit-width`
- **THEN** the rendered image's width matches the element's box width, the height
  is free to overflow, the overflow is clipped to the authored rect, and the image
  is centred on the vertical axis

#### Scenario: Fit height is the mirror

- **WHEN** an image element's fit is set to `fit-height`
- **THEN** the rendered image's height matches the element's box height, the width
  overflows and is clipped, and the image is centred on the horizontal axis

#### Scenario: Both new modes survive both export paths

- **WHEN** a scene using `fit-width` or `fit-height` is exported to `.vcg` or to
  single-file HTML
- **THEN** the exported scene carries that exact value, and the exported page
  renders the same geometry as the Designer preview

### Requirement: A pre-existing fit mode renders EXACTLY as it did before

Adding the two new modes SHALL NOT change the rendered output of any document that
does not use them. The extra DOM node the new modes require SHALL be emitted ONLY
for those modes; `contain`, `cover`, `fill` and `none` SHALL continue to render as
a bare `<img>` carrying the element id, with no wrapper and no additional CSS.

This SHALL be verified by comparing the built DOM for every pre-existing mode
against output captured BEFORE the change, not by inspection.

#### Scenario: A pre-existing mode's DOM is byte-identical to the pre-change output

- **WHEN** a scene using `contain`, `cover`, `fill` or `none` is rendered
- **THEN** the built element's markup is byte-for-byte identical to the markup the
  renderer produced before the new modes existed, including the tinted, hidden and
  filtered variants

#### Scenario: Switching away from a new mode removes the extra node

- **WHEN** an image element's fit is changed from `fit-width` back to `contain`
- **THEN** the element renders as a bare `<img>` again, with no wrapper left behind

### Requirement: `none` is labelled "original" and its stored value is unchanged

The Designer SHALL display the `none` fit option under the label **"original"**.
The value stored in the scene SHALL remain `none`. No migration SHALL be
introduced, and a document saved before this change SHALL load showing "original".

#### Scenario: The label is "original" and the stored value is `none`

- **WHEN** the author selects "original" in the Inspector's fit control
- **THEN** the element's stored `fit` is `none`, and the control continues to
  display "original"

#### Scenario: A document saved before this change still loads

- **WHEN** a scene saved before this change — carrying `fit: 'none'` — is opened
- **THEN** it parses without migration and the Inspector shows "original"

### Requirement: The Designer preview and both exports agree on the geometry

The mechanism that produces the fit geometry SHALL be applied at scene-build time,
so the Designer canvas, the Preview modal and both export paths derive it from the
same code. A host-side or load-time computation that only one of those paths
performs SHALL NOT be used.

#### Scenario: Preview and export produce the same geometry

- **WHEN** the same scene using `fit-width` is rendered in the Designer preview and
  in the exported page
- **THEN** both produce the same clipping box and the same image scale

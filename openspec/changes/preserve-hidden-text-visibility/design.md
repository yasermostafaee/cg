# Design: Preserve hidden text visibility

## Decision

The scene builder keeps `applyBaseStyles` as the first visibility authority. Any later builder that
must choose a natural layout display SHALL select that natural display only when the element is
authored visible; otherwise it SHALL retain `none`.

For plain text this applies at both current flex-enabling sites:

- fixed text with an authored `verticalAlign`;
- text whose gradient glyph wrapper needs a flex host.

No schema, project migration or exported package change is required. The same shared renderer serves
Designer Canvas, Preview, rebuilt imported templates and on-air HTML, so one fix covers every surface.

## Regression boundary

The test must prove the inner gradient glyph node is still built while the outer host stays hidden.
That distinguishes a visibility fix from accidentally skipping gradient rendering altogether.

## Why

The Designer can align text at the top, middle or bottom. Authors need smaller corrections inside the
same box for different fonts and prepared lower thirds. Ticker's separator already provides this input.

## What Changes

- Add a signed **Text vertical offset** input to Text, Ticker, Clock and Sequence text styling.
- Render the correction in the authoring Canvas, rehearsals and exported templates.
- Preserve the box, its clipping and independent separator corrections.

## Impact

Designer Inspector and inline editor, shared scene schema, template runtime and the VCG minimum
renderer contract for files that use the new offset.

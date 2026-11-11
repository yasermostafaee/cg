## Why

Designer identifies frames whose size differs from the rest of an Image Sequence. The current import repeats a matching frame in their place. Authors need a way to retain those pictures in a single video.

## What Changes

- Count and identify the different-size frames before import.
- Offer **Keep matching frames** or **Resize all readable frames**.
- Initialize the output width and height from the first readable frame in sequence order.
- Fit each source picture inside the chosen output size with transparent padding.
- Check the planned output against the browser's conversion budget before opening the converter.

## Capabilities

- `designer-video-element`

## Impact

Designer Image Sequence import, conversion and asset provenance.

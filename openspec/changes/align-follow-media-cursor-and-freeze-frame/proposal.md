# Align composition Freeze cursor and media hold

## Why

Freeze acquired two competing anchors: native elements park at the composition Out point, while a
Follow Video can park on an element-authored source frame and report Content start. The picture,
root cursor and exit can therefore describe different phases. Freeze is a composition lifecycle
choice and needs one anchor for every element.

## What changes

- Use the composition Out point (shown as **Outro start**) as the one Freeze anchor for native,
  Lottie and Video elements, including Follow media.
- Keep the root cursor parked at that same Out point throughout Hold.
- Remove the authored Follow-Video Freeze-frame override; a stored legacy value is inert and does
  not alter the composition-derived picture.
- When Hold ends, continue forward from Out point through Outro without wrapping to Content start
  or jumping to an element-specific frame.
- Keep Loop middle and ordinary timeline scrubbing unchanged: Loop middle advances and wraps from
  Content start to Out point, while a manual scrub remains a continuous one-pass authoring view.

## Impact

- Template-runtime Freeze/Outro ownership and root telemetry
- Video Follow schema/runtime/Inspector cleanup and focused tests
- PRD D-176, D-186, D-187 and B-377/B-378/B-379

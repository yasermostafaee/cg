# Drag Shared Library images directly onto the Canvas (D-204)

## Why

Project Assets already support drag-to-place, but Shared Library images require the author to create
or select an Image and then use its source picker. The inconsistent interaction slows reuse of the
station's shared logos and artwork.

## What Changes

- Make Shared Library image tiles draggable in both grid and list layouts.
- Carry explicit `project`/`shared` identity in one common asset drag payload.
- Create a shared-source Image at the Canvas drop position while preserving legacy project drags.
- Keep shared font tiles non-draggable as Canvas images.

## Capabilities

### Modified Capabilities

- `designer-shared-image-library`

## Impact

Designer asset drag payloads, Shared Library image tiles and Canvas drop handling. No persistence,
Bridge or runtime contract changes.

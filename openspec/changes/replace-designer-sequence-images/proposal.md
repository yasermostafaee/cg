## Why

D-207: Designer can add picture files and folders to a Sequence but has no matching action to replace its picture pages.

## What Changes

- Offer Replace with pictures and Replace with folder in the Inspector and Pages manager.
- Keep text and composition items when replacing pictures.
- Make replacement one undoable edit.

## Capabilities

- `designer-sequence-element`: replace the images in a Sequence without replacing the Sequence itself.

## Impact

Designer Sequence authoring, asset import and browser regression coverage.

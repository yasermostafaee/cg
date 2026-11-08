# Change: Preserve hidden text visibility

## Why

A fixed text element can be authored hidden, yet appear on Canvas, in Preview and on air when its
layout needs flex for vertical alignment or gradient glyph positioning. The layout pass currently
overwrites the visibility decision made by the shared base-style pass.

## What Changes

- Keep authored `visible: false` authoritative after every plain-text layout pass.
- Retain the existing flex layout for visible vertically-aligned and gradient text.
- Add focused renderer coverage for both paths.

## Impact

- Affected PRD: B-412.
- Added capability: `template-element-visibility`.
- Affected package: `@cg/template-runtime`.

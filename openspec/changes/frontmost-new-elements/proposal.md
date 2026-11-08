# Change: Keep newly added elements front-most

## Why

After any Timeline reorder gives siblings explicit `zIndex` values, a new element can appear as the
top Timeline row while rendering behind an older sibling because its factory value remains zero.

## What Changes

- Assign a normally added element one `zIndex` above the current sibling maximum.
- Keep Timeline order, document order and renderer paint order aligned immediately after insertion.
- Add a focused regression for an insertion after a prior reorder.

## Impact

- Affected PRD: B-415.
- Modified capability: `designer-animation-timeline`.
- Affected package: `@cg/designer`.

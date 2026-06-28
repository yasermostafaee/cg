# Resolve a content-less content-driven hold to timed (B-032, second half)

## Why

B-032's first half (`persist-timed-hold`, #206) made the timed `holdMs` an authorable, exported
default. But a real scene still doesn't hold: the composition is stored `holdSource: 'content-driven'`
with ZERO content (one shape, no ticker / sequence / countdown). Content-driven + no drivers is a
zero-length hold, so the `holdMs` is ignored — and the timed/content-driven selector is hidden for a
content-less comp, so the operator can't switch to timed (trapped). The mismatch is exact: the
inspector already shows the hold as timed (`timedHold = !hasContent`), yet the runtime and export
treat it as content-driven. A content-driven hold with nothing to wait on is meaningless; honoring
the timed `holdMs` is the only sensible duration.

How a content-less comp ends up content-driven: `holdSource: 'content-driven'` is only ever written
by the Hold-source select, which is gated on having content — so the comp got content-driven while it
HAD content (a ticker), then the content was deleted, leaving the stored value with no way to revert.
Fixing it at the resolution boundary repairs existing scenes without re-authoring (no delete-time
mutation needed), and keeps export + on-air in agreement.

## What Changes

- **`@cg/shared-schema`** — add `hasEffectiveHoldDrivers(root, compositions)`: any `ticker` /
  `sequence` / countdown `clock` with `drivesHold !== false` in the comp's own layers OR a nested
  instance (recursing containers; cycle-guarded).
- **`@cg/template-runtime`** — `effectivePlayoutFor` resolves `holdSource: 'content-driven'` to
  `'timed'` when the scope has no effective drivers (`scopeHasEffectiveHoldDrivers`, the FieldScope
  mirror of the schema helper). NOT done deep in the coordinator — at the per-scope resolution.
- **`@cg/vcg-format`** — `buildPlayoutMetadata` applies the same resolution, so the baked metadata
  matches on-air (the inlined runtime reads `scene.playout`, resolved the same way).
- **`@cg/designer`** — `PlayoutSection`'s `holdSourceEff` uses `hasEffectiveHoldDrivers` (drivesHold-
  aware), so the holdMs control shows for a content-less / fully-excluded content-driven comp.

## Capabilities

- `designer-playout-lifecycle` (MODIFIED: the "no drivers ⇒ zero-length hold" clause becomes "⇒
  resolve to timed, honoring holdMs"; ADDED: the inspector shows a content-less hold as timed).

## Impact

- `packages/shared-schema/src/scene.ts` · `packages/template-runtime/src/runtime.ts` ·
  `packages/vcg-format/src/playout-metadata.ts` ·
  `apps/designer/src/renderer/features/inspector/PlayoutSection.tsx`.
- Tests: runtime (content-driven content-less auto-out + loop-cycle hold ≈ holdMs; nested-only stays
  content-driven via existing D-104 tests; already-timed regression via existing tests), exporter
  (content-less content-driven → timed + holdMs baked), designer E2E (trapped scene → holdMs control
  appears). No schema-version bump. Forward note: once D-112 lands, the driver test also applies the
  per-instance `holdOverrides`.

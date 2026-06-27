# Design — selective content-driven hold (D-107)

## Decision: `drivesHold` is `z.boolean().optional()`, not `.default(true)`

The PRD reads "OPTIONAL `drivesHold` boolean (DEFAULT true)". We model the
default-true BEHAVIOUR with `.optional()` + a runtime `!== false` test (absent ≡
participates), NOT a Zod `.default(true)`, because:

- **Round-trip identity / non-breaking.** The existing element tests assert
  `Schema.parse(x).toEqual(x)`. `.default(true)` would MATERIALIZE `drivesHold:
true` onto every legacy ticker/clock/sequence at parse time, breaking those
  assertions and silently rewriting every stored element on the next save.
  `.optional()` leaves an absent field absent — legacy scenes parse and re-serialize
  byte-identical. This is the same precedent as the recent additive clock flags
  (`blinkColon`/`blinkPeriodMs` D-103, `timezone` D-084), all `.optional()`.
- **No constructor churn.** With `.optional()` the OUTPUT type is `drivesHold?:
boolean`, so the designer's default element builders need no change. `.default(true)`
  would make it a required output field and force edits to every literal constructor.

The runtime and UI both read `drivesHold !== false`, so absent and `true` behave
identically (participate); only an explicit `false` excludes.

## Decision: filter at `ownContentWait`, start/stop stay whole

The hold is the only thing that changes. `startOwnContent` and `stopScopeContent`
keep iterating the FULL `scopeTickers` / `scopeClocks` / `scopeSequences` (every
content element still starts, renders, and stops). We collect a parallel
hold-driving subset as each driver is built — `holdTickers` (ticker with
`drivesHold !== false`), `holdCountdowns` (clock `mode === 'countdown'` AND
`drivesHold !== false`), `holdSequences` (sequence with `drivesHold !== false`) —
and `ownContentWait` builds its `Promise.all` from those. The wall/countup
exclusion is unchanged (still a kind filter); D-107 just adds the `drivesHold`
predicate.

## Decision: D-104 aggregation needs no extra work

The D-104 coordinator aggregates its own content PLUS non-coordinator nested
descendants via `contentTreeWait(node)`, which simply calls each node's
`ownContentWait()`. Filtering inside `ownContentWait` therefore propagates to the
nested aggregation for free — a nested ticker marked `drivesHold: false` drops out
of the parent's wait without touching `contentTreeWait`. No coordinator-rule
change.

## Decision: zero-length when all excluded

`ownContentWait` returns `null` when no hold-driving sources remain (empty
`hold*` arrays) — exactly the existing no-content path. A coordinator whose every
content source is excluded therefore gets the same deferred zero-length hold as a
coordinator with no content (the "0ms timer" that still lets children receive the
play cascade). The excluded content keeps running; it just no longer holds.

## Decision: checklist scope = active composition, recursing groups (not nested comps)

The Playout checklist lists the OPEN composition's own content (tickers,
sequences, countdown clocks), recursing `container` children. It does NOT recurse
nested `composition` instances: a nested instance is a SHARED child definition, so
its content participation is chosen by drilling into THAT composition's own
Playout section — toggling it from a parent would be a shared edit affecting every
instance, and the shallow store path can't reach `scene.compositions` anyway. When
a composition's only content lives in nested instances (the D-104 case), the
checklist shows a hint pointing the operator to drill in. The control is still
OFFERED in that case (unchanged `hasContentElement`, which DOES recurse nested
comps).

## Decision: a focused recursive store action

`updateElement`/`locate` only reach a layer's DIRECT children, but the runtime
collects content nested in groups too, so a grouped ticker must be togglable.
`setElementDrivesHold(elementId, drivesHold)` maps the active layers recursively
(`patchDrivesHold`, descending containers) and patches the matching ticker /
sequence / clock — leaving any non-content type untouched even on an id match.
This is additive (a new action), so existing `updateElement` callers are unchanged.

## UI

A native `<input type="checkbox">` per row (the established `CheckRow` pattern from
`DynamicDataSection`; the lint rule restricts only `<button>`/`<select>`, not
`<input>`). Rows are labelled by the element name, with duplicates disambiguated
"(1)/(2)" like the D-102 timing panel, and a muted type tag (ticker / sequence /
countdown). The checkbox's accessible name is `"<name> drives the hold"` for
stable a11y/E2E querying. The checklist renders only when `hasContent`,
`mode !== 'manual'`, and `holdSource === 'content-driven'`.

## Tests

- **Runtime** (`selective-content-hold.test.ts`, fake clock): a finite SELECTED
  ticker + an infinite EXCLUDED ticker → the hold COMPLETES when the finite one
  finishes (the excluded infinite one does not block); the SAME infinite ticker
  INCLUDED (default) → holds until `stop()` (regression); default-no-flag → finite
  drives (all-content preserved); all-excluded → zero-length hold; a mixed finite
  countdown SELECTED + infinite ticker EXCLUDED.
- **Schema**: each of ticker/clock/sequence — absent ⇒ `undefined` (non-breaking),
  explicit `false`/`true` preserved + round-trip through the Element union.
- **E2E**: the checklist lists content, toggling persists, and wall clocks never
  appear while a countdown does.

## Out of scope

- Start-marker selectivity (which content STARTS / when) — deferred.
- Toggling nested-composition content from a parent (shared-edit semantics) — done
  by drilling into the child composition.

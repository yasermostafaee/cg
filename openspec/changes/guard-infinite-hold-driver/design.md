# Design — guard against an infinite-repeat hold driver (D-111)

## Decision: warn-only (reuse the existing exclude checkbox), no new one-click action

The D-107 checklist already offers per-element exclusion (the `drivesHold` checkbox), and the
D-108 nested rows already drill into the owning composition. So the fix is WARN-ONLY: flag the
offending rows and (when all drivers are infinite) escalate prominently; the operator clears it
with the controls that already exist — uncheck to exclude, or open the comp and set a finite
`repeat` / uncheck there. A separate one-click "exclude" affordance would duplicate the checkbox
for no benefit and enlarge the diff. Warn-only is the smaller, lower-risk change and satisfies
every acceptance bullet.

## Decision: the `infinite` signal, threaded through the EXISTING walks

`infinite` is `el.repeat === 'infinite'` for a ticker / sequence; a countdown clock is always
finite (`false`). No new traversal: `contentHoldElementsOf` gains `infinite` per own item, and
`nestedHoldGroupsOf`'s `countIn` returns `{ count, infiniteCount }` so each nested group reports
how many infinite drivers it reaches (recursively, cycle-guarded — unchanged).

## Decision: per-row vs prominent

A content-driven hold is `Promise.all` over its drivers, so ANY infinite driver already forces an
infinite hold — hence the per-row flag on EACH infinite driver. The PROMINENT alert escalates
only when EVERY driver (own + nested) is infinite (`infiniteDrivers > 0 && infiniteDrivers ===
totalDrivers`), i.e. nothing can end the hold on content — the worst "this will never close" case,
surfaced at the checklist level rather than buried per-row.

## Decision: visuals (reuse the design system, no new palette)

The prominent alert is the shared `Callout variant="danger"` (rose tint + `TriangleAlert` glyph +
`role="alert"`). The per-row flag is an inline `TriangleAlert` + "loops forever" in `colors.danger`
— the same rose, no new token. A warning is a strong caution here (the graphic won't auto-close),
so reusing `danger` is appropriate.

## Out of scope

- Any runtime / schema change — the hold behaviour (infinite content ⇒ hold until stop) is correct.
- A one-click exclude button — the existing checkbox already excludes.
- Blocking / disabling — the operator may legitimately WANT a hold-until-stop graphic; D-111
  informs, it does not forbid.

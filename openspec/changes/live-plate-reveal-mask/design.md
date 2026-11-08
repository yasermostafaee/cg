# Design — live-plate reveal mask (D-202)

## Explicit relation, narrow exception

`revealMask = { targetSourceId, rect }` lives on the upper plate. `rect` is normalized inside that
plate and must stay inside `0..1`. The target is the lower plate's symbolic source id, never a device
address. Self-links, missing targets and direct cycles are invalid.

The existing overlap rule stays intact. Preflight exempts only the explicitly linked pair and only
when the authored reveal window intersects the lower plate in that document/look. Every third-party
collision is still reported against both elements.

## Output composition

The Bridge orders the lower producer below the upper producer, then seats one additional copy of the
lower producer above both. That copy keeps the lower plate's `FILL`, intersects its `CLIP` with the
reveal window and is permanently muted. This produces the same rectangular result as cutting a hole
in the upper producer while using only the measured `FILL`, `CLIP`, `VOLUME` and layer primitives.

The duplicate has a synthetic seat identity while retaining the actual producer argument. This lets
the ledger reconcile and release the copy independently without pretending two identical producers
are one seat. Removing a reveal clears only the synthetic seat. A reveal consumes one real layer;
normal atomic band-capacity refusal therefore covers it before any `PLAY` or graphic reaches air.

## Compatibility and authoring

All fields are optional. Old scenes, packages and ledgers parse unchanged. Designer output carries
only a non-output cyan guide; runtime/output HTML remains transparent where live producers paint.
The Inspector offers target selection and numeric percentages, with a Canvas drag tool for direct
rectangle authoring.

# Design — live-plate reveal mask (D-202)

## Explicit relation, narrow exception

`revealMask = { targetSourceId, rect, additionalRects? }` lives on the upper plate. Each rectangle is
normalized inside that plate and must stay inside `0..1`. `rect` remains the first window for
existing projects. The optional array adds up to seven windows that reveal the same lower input.
The target is the lower plate's symbolic source id, never a device
address. Self-links, missing targets and direct cycles are invalid.

The existing overlap rule stays intact. Preflight exempts only the explicitly linked pair and only
when every authored reveal window intersects the lower plate in that document/look. Every third-party
collision is still reported against both elements.

## Output composition

The Bridge orders the lower producer below the upper producer, then seats a copy of the lower
producer above both for each visible window. Each copy keeps the lower plate's `FILL`, intersects its
`CLIP` with its window and is permanently muted. The output shows the union of the visible windows
using the existing `FILL`, `CLIP`, `VOLUME` and layer primitives.

The duplicate has a synthetic seat identity while retaining the actual producer argument. This lets
the ledger reconcile and release the copy independently without pretending two identical producers
are one seat. Removing a reveal clears only the synthetic seat. A reveal consumes one real layer;
normal atomic band-capacity refusal therefore covers it before any `PLAY` or graphic reaches air.

## Compatibility and authoring

All fields are optional. Old scenes, packages and ledgers parse unchanged. Designer output carries
only a non-output cyan guide; runtime/output HTML remains transparent where live producers paint.
The Inspector offers target and mask selection, numeric percentages and per-mask removal. A Canvas
drag adds a new rectangle or replaces the selected one. Removing the final mask clears the relation.
Mask names use a screen-sized label while Canvas zoom changes. The Inspector groups add, redraw and
remove as icon actions beside the mask controls.

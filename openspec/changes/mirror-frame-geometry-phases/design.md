## Decision

Eligible paired frame-placement effects run through `runPresetFrameTransaction` with the same source and destination look. This reuses the exact resident page and seat checks, asynchronous peer phase queue, staged mixer quarantine and interruption repair already used by preset transitions. Final operator geometry is recorded before the transaction releases the settled pages.

The normal geometry path remains available for pages without the required preset transition capability. A reserve producer that was not successfully seated by this runtime does not become eligible merely because its producer type matches.

## Validation

Paired AMCP fixtures use different physical destination channels. Tests check native easing and artwork phases reach B before the active effect finishes, final transforms match, a refused same-kind reserve producer remains untouched, and active phase refusal restores both sides before a successful retry.

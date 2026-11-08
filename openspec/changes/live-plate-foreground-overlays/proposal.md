# Paint authored graphics above live inputs (D-201)

## Why

CasparCG composites an external live producer above the template page that owns the plate. A title
can therefore be above a plate in Designer's scene graph and still disappear behind that input on
air. Operators also need a frame and its title to travel together between multi-box looks without
retyping fields in CG Control.

## What Changes

- Let an author mark a text or other visual element as foreground content for live inputs.
- Render marked content through a synchronized transparent HTML pass above the live-source band.
- Keep ordinary scene furniture on the existing page below live producers.
- Allocate the extra foreground page atomically and above every input seat.
- Synchronize data, lifecycle, look and timing updates without duplicating completion signals.

## Capabilities

### Modified Capabilities

- `designer-live-source`
- `runtime-live-source-routing`

## Impact

Shared element and template-carrier schemas, Designer Inspector, packaged runtime boot, and Caspar
Bridge live-layer planning/lifecycle. Existing templates without a marked foreground element keep
the single-page path and existing layer demand.

# Design

The inline scripts own pre-bundle startup and mirror the shared timing contract. Reporting a phase
updates the percentage and rail from completed steps. The CSS sweep is independent of that
measurement. Boot completion releases input and begins a 180 ms fade in the same callback.
The 20-second backstop handles a stuck bootstrap. Reduced-motion styling disables the sweep, scene
motion and fades. The installed apps consume the same built HTML entry points.

# Design — composition Freeze cursor and media hold

## 1. Freeze has one composition-owned anchor

The composition Out point, shown to the author as **Outro start**, is the Freeze boundary. Intro
plays forward through that frame; then every native, Lottie and Video element keeps the picture it
has at that composition frame. The root cursor stays on the same Out point for the duration of Hold.

Content start, shown as **Hold start**, is not a second Freeze anchor. It remains the beginning of
the authored Middle range used only by Loop middle. A non-degenerate Loop middle still advances and
wraps through `[Content start -> Out point]`; Freeze never opens that loop and never moves telemetry
back to Content start.

This one-anchor rule removes the prior visible-Follow exception. Painting and telemetry no longer
need different Freeze policies: the frame reported by Canvas/Preview is the frame that owns every
composition-derived held picture.

## 2. Follow Video has no authored Freeze-frame override

Follow composition already maps a composition frame to the corresponding media position. Freeze
uses that existing mapping at the composition Out point. The Inspector may show the effective clip
time/frame as read-only state, but it does not expose a Video-specific Freeze-frame input.

The superseded `freezeAtMs` relationship value is not consulted by runtime or offered by the
Inspector. Older serialized values may remain schema-tolerated while a document is read, but they
are inert; no migration UI and no second source of Freeze truth are introduced. D-187's composition
Playback setting remains the only authoring surface.

## 3. Exit continues forward from the held boundary

When automatic/timed/content-driven Hold completes, the composition leaves the parked Out-point
picture and advances through `[Out point -> active out]`. A Follow media element-outro gate may keep
that forward Outro alive, but it does not rewind to Content start, revisit an arbitrary media frame
or jump directly to the final frame. The root observer reports the active Outro range once.

Operator Stop retains its transport authority to begin Outro immediately; it still starts from the
same Out-point boundary. Pause/Resume preserves the parked frame and later continues the same exit.

## 4. Manual timeline scrub is not a lifecycle Hold

Ordinary forward Play now runs the real composition lifecycle (D-175), but dragging the timeline
index is a static authoring view. Manual scrub walks the media window forward once through Intro and
Middle, then uses the derived Outro mapping after Out point. It neither parks on the lifecycle
Freeze boundary nor wraps the Middle. This keeps the whole source inspectable without changing what
Preview, export or on-air playback freezes on.

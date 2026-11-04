# Preview parity follow-up, 2026-11-04

Accelerated rehearsal time belongs to one Play, not to the Preview iframe's lifetime. The
Preview host retains the injected clock and rebases its epoch to `Date.now()` immediately before
a fresh Play. Resume does not rebase. No runtime target is rewritten, no export/runtime wall clock
is changed, and an actually past deadline stays past. Duration overrides restart through the
existing ClockDriver reset; they do not need a separate replay route. The rate selector's tooltip
states this contract. The generated-host regression first failed with zero seconds on the second
Play despite a target still fourteen real seconds ahead, then passed with the host-only rebase.

`countdownTargetFieldsOf` moves from CG Control's import helper to `@cg/shared-schema` and its old
module re-exports it. It derives metadata from bindings, not user-authored markers, and recursively
uses each nested composition's own field document. Designer Preview and page data forms use it
before rendering the existing shared-behavior/app-local `DateTimeInput`.

The starter used `\\d` while standard field presets use `[0-9]`; switching the target therefore
mistook the old standard pattern for an author-custom pattern. Only that equivalent spelling is
normalized when deciding whether the pattern follows a changed target. Custom restrictions remain.

The countdown runtime already awaits the regular composition outro at zero. The direct full-screen
starter had left its backdrop and large furniture static after removing the outer wrapper, so those
parts cut only when the stage cleared. Each now has ordinary inspectable keyframes, without a new
runtime effect or hidden template-specific behavior.

Browser verification also exposed the initial `clock-target` field application replacing Preview's
duration override. Drivers with a session duration are now recorded in a weak set; binding updates
skip those drivers for that rehearsal only. Without the override, existing initial/live retargeting
is unchanged. This is per driver, so independently overridden instances cannot affect siblings.

Final poster review found the reveal helper authored absolute Y=0 keys, collapsing independently
animated countdown components at the top. Reveal now takes the element's resting Y explicitly;
direct-composition placement translates both the base transform and position keyframes. The
countdown regression samples real runtime frames 0, 20, 80, 100, 116, 130 and 138 against fixed
title/clock/status/background coordinates, including the distinct exit paths.

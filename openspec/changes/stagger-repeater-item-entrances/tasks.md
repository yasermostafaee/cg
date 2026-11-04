# Tasks — stagger Repeater item entrances (D-197)

## 1. Contract

- [x] 1.1 Register D-197 and define compatibility, ordering and lifecycle ownership.
- [x] 1.2 Add the strict `designer-repeater-element` spec delta.

## 2. Schema and authoring

- [x] 2.1 Add backward-compatible entrance, effect-time and item-delay fields to Repeater schema/defaults.
- [x] 2.2 Add compact Repeater Inspector controls using the existing motion vocabulary.

## 3. Runtime

- [x] 3.1 Add clipped row motion wrappers only when an entrance is enabled.
- [x] 3.2 Implement ordered, pause-safe entrance playback and symmetric stop/destroy cleanup.
- [x] 3.3 Preserve live values, shrink/regrowth and nested row lifecycle behavior.

## 4. Verification

- [x] 4.1 Add schema/default/Inspector and deterministic runtime tests.
- [x] 4.2 Run focused package typecheck, lint, tests and builds.
- [x] 4.3 Run strict OpenSpec validation and the full repository gate before push.

## 5. Owner follow-up: exits, canvas and derived row presentation

- [x] 5.1 Add backward-compatible exit settings and await row exits through the existing outro seam,
      including held Sequence composition pages without changing their normal page turns.
- [x] 5.2 Show the motion during canvas playback and scrub using the same sampler.
- [x] 5.3 Expose automatic row numbers and alternating row fill through normal Inspector controls.
- [ ] 5.4 Cover pause/resume/replay/removal, row-number safety, browser rendering and full gate.
- [x] 5.5 Owner correction: expose last-to-first exit ordering independently of movement direction;
      verify first-to-last entrance and reverse exit in runtime samples and a real league Preview.
- [x] 5.6 A finite Sequence naturally awaits its final page's row exit exactly once; parent auto-out
      must not re-show that completed page.
- [x] 5.7 Separate entrance/exit effect durations, retaining shared-duration compatibility, and
      skip hidden-row delay slots when the live list shrinks or Stop interrupts the entrance.
- [x] 5.8 Extend the outro watchdog for a finite authored row exit instead of truncating at thirty
      seconds; propagate a held Sequence page's bound, freeze the guard during pause, and cancel it
      on replay/removal. Seven dedicated regressions cover direct/nested 34.4-second exits,
      a 100-second pause, a deliberately broken owner promise, invalid budget fallback and timer
      overflow protection. Twenty-two focused tests, package typecheck and lint pass.

Focused evidence: 50 Repeater runtime tests include both exit orders, independent durations,
hidden-row shrink/regrowth, fully clipped immediate Stop, nested Sequence exits, cancellation, interrupted
entrance continuity, pause/resume/replay/removal, scrub, generated Persian ranks and alternate fill.
The browser workspace tests cover a shared horizontal row scroll and real Canvas motion/pause.
The owner-refined league browser case verifies independent 200/50 ms defaults and changes each
duration without changing the other. Its eighteen rows enter in order and exit in reverse before
the authored background fade. The natural 33.1-second weather browser run preserves the final
page's full dwell, then closes once without re-showing a completed page.
The owner-refined league's fresh 9.2-second browser run verifies independent entrance/exit controls
(200/50 ms with a 30 ms shared delay), both exit-order choices without changing movement direction,
top-to-bottom entrance, all eighteen rows inside the panel, reverse exit and background fade only
after the rows are gone. Edited durations are restored before observing the authored playback.

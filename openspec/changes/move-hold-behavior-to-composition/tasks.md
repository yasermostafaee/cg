# Tasks — move-hold-behavior-to-composition

## 1. Contract

- [x] 1.1 Register D-187 and define mixed Hold playback before implementation.
- [x] 1.2 Compare the model with Cinegy's global scene loop and independent Plate Free Run.
- [x] 1.3 Define the global Freeze anchor, cursor, selected-loop, unchecked-tail, exit and pause
      semantics.

## 2. Schema and authoring

- [x] 2.1 Store composition Hold behaviour and explicit repeat-participant ids.
- [x] 2.2 Add the Playback checklist and remove media-level On hold controls.
- [ ] 2.3 Remove the Follow Video Freeze-frame override and derive every Freeze picture from
      composition Out point.
- [x] 2.4 Rebuild the generated Preview runtime before Designer development starts.

## 3. Runtime

- [x] 3.1 Split checked Middle-loop painting from unchecked once-only native tail painting.
- [x] 3.2 Add once-to-end Hold behaviour to Video and Lottie local clocks.
- [x] 3.3 Prevent selected Outro painting from rewinding or replaying unchecked tails.
- [x] 3.4 Coordinate Pause/Resume/Stop/reset across both clocks and every Hold source.
- [x] 3.5 Drain the active Middle pass before automatic content-driven Outro, while keeping
      operator Stop immediate.
- [ ] 3.6 Keep Freeze parked at Out point and continue its automatic/timed/content-driven exit
      forward from that same boundary.

## 4. Verification

- [ ] 4.1 Update deterministic controller, runtime, Video and Lottie tests for mixed Hold playback
      and one Out-point Freeze anchor.
- [ ] 4.2 Update Designer DOM and browser coverage for composition ownership, no Video override and
      the Loop checklist.
- [ ] 4.3 Add deterministic Runtime and Preview coverage for forward Freeze and graceful Middle
      exit.
- [ ] 4.4 Validate OpenSpec, run focused checks, full gate and browser E2E.

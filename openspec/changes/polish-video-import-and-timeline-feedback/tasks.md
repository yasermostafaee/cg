# Tasks — polish-video-import-and-timeline-feedback

## 1. Contract

- [x] 1.1 Register D-185, B-375 and B-376 in PRD/OpenSpec.
- [x] 1.2 Define paused-lifecycle scrub release and visible root hold-loop reporting.

## 2. Implementation

- [x] 2.1 Keep Crop visible and move alpha repairs into closed Advanced corrections with Info help.
- [x] 2.2 Release paused lifecycle ownership when a ruler scrub begins.
- [x] 2.3 Forward root hold-loop frames through the existing observer without touching content drivers.

## 3. Verification

- [x] 3.1 Add focused DOM/runtime tests for collapsed import options, post-Pause scrub and loop reporting.
- [x] 3.2 Add browser coverage for Video playhead scrubbing and Middle-loop index movement.
- [x] 3.3 Run relevant typechecks/lints/tests and strict OpenSpec validation.
- [ ] 3.4 Full repository gate passes.

# Tasks — add-time-duration-guard

## 1. Recon (design.md records the door map)

- [x] 1.1 Every add door mapped (video, Lottie, composition insert), with the chokepoint each
      passes through; duplicate/paste located and recorded OUT of scope with reasoning.
- [x] 1.2 The store action the timeline's duration input uses (extend must go through it);
      `activeRangeOf` confirmed as the host-length authority; the one-undo-step mechanism named.

## 2. The guard + intrinsic durations

- [x] 2.1 One chokepoint (`requestAddElement`) all doors call; raw `addElement` untouched for
      paste/duplicate. Pending state OUTSIDE the undoable store state.
- [x] 2.2 Intrinsic durations, one derivation each: video `durationMs`; Lottie `(op − ip) / fr`
      at 1× (creation default — the element does not exist yet, authored speed cannot apply);
      nested comp active-range length at the project frame rate. Host via `activeRangeOf`.
- [x] 2.3 Fires ONLY when content > host; a fitting add is byte-identical to today.

## 3. The dialog

- [x] 3.1 Shared `Modal`/`ModalButton` pattern (SizingAutoConfirmModal precedent), role="dialog" + aria-modal from the shell `Modal`; both durations named concretely in the copy.
- [x] 3.2 Media: three choices (Extend / Add as backdrop / Cancel). Composition insert: two
      (Extend / Cancel) — an instance has no `phases`, recorded in design + PRD item.
- [x] 3.3 Extend: host duration → exactly ceil-to-frame of the content, via the SAME store action
      the timeline's duration field uses, extend + add as ONE undo step.
- [x] 3.4 Backdrop: element added with `phases.source: 'composition'` (claim-least slots, the
      session-S seeds); host untouched; `holdAt` NOT asked (Inspector tunes it).
- [x] 3.5 Cancel: nothing added, scene byte-identical.
- [x] 3.6 No-lifecycle host: the backdrop choice is STILL offered (a control that appears and
      disappears by host state is harder to learn than one that explains itself — the added
      follower behaves marker-less until an out-point exists; the Inspector explains).

## 4. Tests — failing first where behaviour is new

- [x] 4.1 5 s video into 2 s comp ⇒ dialog naming both durations.
- [x] 4.2 Extend ⇒ host exactly ceil-to-frame, element added, undo restores BOTH together.
- [x] 4.3 Backdrop ⇒ `phases.source: 'composition'`, host untouched.
- [x] 4.4 Cancel ⇒ scene byte-identical.
- [x] 4.5 1 s video into 2 s comp ⇒ silent, added as today.
- [x] 4.6 The same four behaviours for a Lottie.
- [x] 4.7 Comp-into-comp longer than host ⇒ TWO-choice dialog; extend/cancel as above; no
      backdrop button.
- [x] 4.8 Import to library ⇒ no dialog, regardless of duration.
- [x] 4.9 Every recon door goes through the guard (one test per door, drag-drop included).
- [x] 4.10 E2E: the dialog's three buttons, each route's outcome visible.

## 5. Docs + verification

- [x] 5.1 D-151 marked `[~]` with this change dir; comp-insert two-choice scoping recorded in
      the item.
- [ ] 5.2 `pnpm openspec validate add-time-duration-guard --strict` green.
- [ ] 5.3 Full green gate (uncached).
- [ ] 5.4 Commit + push to `dev`; remote head verified.
- [ ] 5.5 **E2E**: discharged by a COMPLETED, GREEN `e2e` job that RAN for the pushed commit —
      URL recorded HERE, superseding session S's.
- [ ] 5.6 Handoff `docs/handoff/2026-08-13-session-t.md`.

### Door-test mapping (4.9, recorded so the ticks are checkable)

- V1/V2 — ONE function (`placeVideoElement`, the import modal's `onDone` tail for BOTH "Place
  element" and "Use existing"; convergence recon-verified) — driven directly, oversized ⇒ dialog.
- V3 — `insertVideoFromAsset` (the canvas-drop handler's whole body), probe mocked long AND
  short — dialog vs silent insert through the same door.
- L1 — `insertLottieFromAsset` with a real 5 s bodymovin through the real `importLottie`.
- C1/C2 — both UI doors are one-line calls into `guardedAddCompositionInstance` (C2's wiring
  also keeps the cycle notice exact); the guard function is driven directly for the two-choice
  dialog, extend+undo, cancel, fitting-silent, and cycle-refusal cases. The E2E exercises door
  L1 end to end (drag-drop through the real UI).

# Design — the add-time duration guard (D-151)

## 1. The door map (recon at `cb5413e0`, six parallel sweeps; file:line cited as read)

**Fresh-add doors — IN scope.** Every path that CONSTRUCTS a video/Lottie/composition element and
inserts it:

| #   | Door                                                                                                                            | Where                                                 | Tail                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| V1  | Import modal → "Place element"                                                                                                  | `VideoImportModal.tsx:673` → `ProjectAssetsPanel.tsx` | `placeVideoElement` → `fitVideoElement` → `addElement`                                  |
| V2  | Import modal → "Use existing" (duplicate found)                                                                                 | `VideoImportModal.tsx:685` → same `onDone`            | same `placeVideoElement` tail as V1                                                     |
| V3  | Canvas drag-drop of a video asset                                                                                               | `CanvasOverlay.tsx` `onDrop` → `insertVideoFromAsset` | `probeStoredVideo` → `fitVideoElement` → `addElement`                                   |
| L1  | Canvas drag-drop of a Lottie asset (the ONLY Lottie door — import never auto-places, there is no place button, no drawing tool) | `CanvasOverlay.tsx` `insertLottieFromAsset`           | `importLottie` (parsed `ip`/`op`/`fr` IN SCOPE) → `defaultLottie` → `addElement`        |
| C1  | Compositions panel menu "Add to composition"                                                                                    | `CompositionsPanel.tsx:154`                           | `addCompositionInstance` (composition.ts:227 — child comp in scope, cycle guard inside) |
| C2  | Drag a composition row onto the canvas                                                                                          | `CanvasOverlay.tsx:662`                               | same `addCompositionInstance`                                                           |

**Clone/restore paths — OUT of scope, with the reasoning the brief asked for.** Paste (Ctrl+V and
the timeline context menu), Duplicate, the latent `duplicateElement`/`pasteElement` store APIs,
`duplicateComposition`, undo/redo snapshots, and whole-scene load all insert `structuredClone`s or
restore whole scenes — they copy content ALREADY ACCEPTED into the document. The item's trigger is
"adding content", the one moment the mismatch is newly knowable; a paste of an accepted element is
not that moment, and guarding it would also fire on every undo-adjacent restore. (Recon also
surfaced that the paste path skips the composition CYCLE guard — a real pre-existing hole, noted
for the owner, not touched here: it is a correctness bug of a different item's shape.)

## 2. The chokepoint — one guard, thin unit-edge adapters

The doors have no existing single shared function (`fitVideoElement` covers only V1–V3;
`addCompositionInstance` only C1–C2; `addElement` is shared with the out-of-scope clone paths and
every other element kind). So the guard IS the chokepoint: ONE decision function,
`requestGuardedAdd` (`features/addGuard/duration-guard.ts`), holding the pending state and the
fits/overflows decision, with three kind adapters that derive the intrinsic facts at the unit
edge and hand a commit closure — the same shape as session S's `followWindowMs` + adapters:

- `guardedAddVideo(element)` — `element.durationMs` (schema fact, captured at conversion).
- `guardedAddLottie(element, meta)` — `(op − ip) / fr × 1000` at speed 1×: the element DOES NOT
  EXIST yet, so an authored speed cannot apply — 1× is the creation default, stated here because
  the number would otherwise look arbitrary. The door hands the `LottieClipMeta` it already
  parsed (`insertLottieFromAsset` runs `importLottie` at drop time; `lottieAssetCache` is primed
  only POST-insert, so the cache is not a reliable source at this moment).
- `guardedAddCompositionInstance(childId, at?)` — the child's `activeRangeOf` length at the
  project frame rate; commit delegates to the store's `addCompositionInstance`, so the D-086
  cycle guard keeps running INSIDE the store action, unchanged.

Host duration: `activeRangeOf(activeDocOf(scene))` — the verified single authority for the
playable window (`scene.ts:415`, "the single place renderer and runtime resolve the window"),
reused, never re-derived. Comparison is strict `contentMs > hostMs` — an exact fit is silent.

Pending state lives at MODULE level (subscribe + `useSyncExternalStore`), never in the store:
dialog state must not enter undo history or the persisted scene. `DurationGuardDialog` mounts
ONCE in `App.tsx` — several doors raise it, so it cannot live in any one panel.

**Door enforcement**: each door now calls its guard adapter instead of `addElement` /
`addCompositionInstance`; the trailing `setSelection` calls the doors carried are dropped
(`addElement` already selects, and under the guard the add may be deferred or cancelled — a
synchronous select of a not-yet-added id is exactly the kind of half-taken action Cancel must not
leave behind). Door tests drive the exported door functions (`placeVideoElement`,
`insertVideoFromAsset`, `insertLottieFromAsset` — exported for tests; V2 shares V1's function and
is covered by it) plus the comp adapter; the E2E exercises a real door end to end.

## 3. Extend — through the timeline's own actions, as one undo step

The duration field (`InspectorPanel` `DurationRow`, aria-label "Scene duration in frames") calls
`setSceneDurationFrames` — verified as THE action, writing `frameRange` through `withActiveDoc`
(so it lands on the drilled composition). But the HOST length the guard compares is the ACTIVE
range, and a composition may carry an `activeRange` narrower than its total — extending only the
total would leave the content still truncated by the play window. So Extend computes
`neededFrames = ceil(contentMs × fps / 1000)` and:

1. `setSceneDurationFrames(max(frameRange.out, activeIn + neededFrames) − frameRange.in)` — grow
   the TOTAL only as far as needed to contain the new active out (growing never clamps).
2. `setSceneActiveOut(activeIn + neededFrames)` — only when an explicit `activeRange` exists
   (absent ⇒ active tracks `frameRange` and step 1 already sized it exactly).

Both are the timeline's own actions; the pair + the add run inside `runAsSingleHistoryEntry`
(`store-core.ts:435` — leading/trailing boundaries around a synchronous burst), so ONE undo
restores the duration and removes the element together. The active length after Extend is EXACTLY
`neededFrames` — "grows to exactly fit", ceil to whole frames.

## 4. Backdrop — the settled third choice, and the seed extraction

"Add as backdrop — follow the composition" adds the element with
`phases.source: 'composition'`. `holdAt` is NOT asked for — one dialog, three buttons, no nested
configuration; the Inspector tunes it (session S seeds it from the shared midpoint helper). The
claim-least slot seeds are the SAME values session S's Inspector attach writes — so they are now
EXTRACTED to `state/follow-attach.ts` (`videoFollowAttachPhases` / `lottieFollowAttachPhases`)
and both callers (StyleSection's attach buttons, the guard's backdrop commit) share them: a
second copy of the seed rule is how the two writers drift (the session-P rule). A Lottie that
arrived WITH bodymovin markers keeps its marker values in the slots and just takes
`source: 'composition'` — exactly session S's attach-from-markers semantics.

For a COMPOSITION insert the third choice does not exist — an instance has no `phases` and cannot
follow — so that dialog is the firm two-choice form (Extend / Cancel). Recorded in the D-151 PRD
item as scoping on the settled answer: it covers media; comp-insert keeps decline-means-not-added.

**No-lifecycle host**: the backdrop choice is STILL offered. A control that appears and
disappears by host state is harder to learn than one that explains itself; the added follower
behaves marker-less until an out-point exists, and the Inspector's existing no-anchors
explanation (session S, the §9.1 rule) says why.

## 5. The dialog

Thin wrapper over the shared `shell/Modal` — `role="dialog"`, `aria-modal`, focus trap, Escape +
backdrop close all come from the shell (the codebase's ONLY `aria-modal` site; consumers pass
`title`/`ariaLabel`, the convention is `aria-label`, never `aria-labelledby`). The semantics are
part of the spec, not the styling — the won't-auto-close banner's role lesson. Escape/backdrop
route to **Cancel**: decline-means-not-added is the safe default for every dismissal gesture.
Copy names both durations concretely ("This clip is 5.0 s; the composition is 2.0 s."); Extend is
the primary + autoFocus button (the item's headline offer, the `SizingAutoConfirmModal`
precedent of focusing the primary action).

## 6. Interaction cases settled (not silently)

- **Import to library fires nothing** — verified: `importKind` stores bytes only
  (`window.cg.assets.store`), no scene write anywhere in the flow; a video conversion stores
  DURING the modal and an element appears only via the explicit "Place element"/"Use existing"
  confirm — which is door V1/V2, where the guard sits.
- **Cancel is byte-identical** — the guard's pending state is outside the store; Cancel clears it
  and touches nothing, pinned by scene-object IDENTITY in the test (stronger than byte equality).
- **`durationMs ≤ 0` cannot reach the guard** on fresh paths — both probe consumers hard-reject
  non-positive durations before constructing an element (verified V1–V3).
- **The playhead** — `setSceneDurationFrames` also clamps `currentFrame`; growing never clamps,
  and undo deliberately does not restore `currentFrame` (pre-existing store behaviour, unchanged).

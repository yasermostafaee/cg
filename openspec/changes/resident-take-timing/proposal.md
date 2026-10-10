# resident-take-timing

## Why

The owner's logo graphic (`loop-cycle`), CG Control and CG Bridge `0.11.4`, 2026-10-10 (`LOGO-LOOP-01`). On air
he set a count of one more and pressed `Update`: it played one more pass and closed. Stopped, he set `Until stop`,
pressed `Update`, then `Play`: **it played one pass and closed.** The console said `Passes next take: Until stop`,
the bridge's record said `infinite`, and the page looped once. A change made while stopped never took.

Two causes, each confirmed by running, not by reading:

- **`B-322` — CG Bridge's resident take told the page no timing.** Off air, `setPassTiming` records and sends
  nothing (golden rule 10), on the promise that "the next take carries it". That is true of one route into air
  only. After `out` or a clear the take re-ADDs and `#sendAdd` attaches `timing`. After `stop` the producer stays
  resident, so the take sends `#tellPageTake`'s `CG UPDATE` and then `CG PLAY`, and that `CG UPDATE` carried the
  take token and the look and **no timing**. The same hole `B-191` closed for the look and `SELF-STOP-24` for the
  token.
- **`B-323` — the page threw away a timing told to a settled loop.** After a stop or a self-end, the page's loop
  controller is settled, and `PlayoutController.setRemainingPasses` / `setDelayMs` returned at their `settled`
  guard. So even a `CG UPDATE` that carried `timing` was dropped, and `play()` seated the last count the page had
  been told (`DELTA B0` keeps it in `pendingPasses`). Fixing the bridge alone would not have fixed the owner's
  sequence: measured, the page's own test went red with the tell carrying `passes: 'infinite'`.

## What changes

- **`B-322` (CG Bridge).** The resident take's `CG UPDATE` carries the row's recorded `timing` (`passes` and
  `delayMs`) in the same control object as the token and the look: one command, no extra send. The control is
  built by ONE helper that both `#sendAdd` and `#tellPageTake` call, from `#wireTiming` and gated by
  `#admitsPassTiming`, so the two routes cannot drift apart again. A row with no override, or whose template does
  not admit pass timing, sends exactly today's bytes. An off-air `Update` still sends zero AMCP.
- **`B-323` (`@cg/template-runtime`, shipped in CG Control).** A settled loop controller remembers a count or a
  gap for its next `play()` and changes nothing else: no `cyclesLeft`, no `phase`, no frame. It never re-arms a
  finished graphic.

## Decisions

- **Not a golden-rule-10 violation.** The tell happens inside a take, which is a playout verb, and sends no `PLAY`
  of its own. What changes is the content of a command the take already sent.
- **The page fix rides CG Control, not the `.vcg`.** A page is baked at import from the console's own bundled
  runtime (`produceTemplateDelivery`; the `cg.js` inside a `.vcg` is never served). So the logo must be
  re-imported after CG Control is upgraded. That manual step is `C-034`'s, still open.
- **`updateTake` keeps its key order** (`take`, then `look`, then `timing`), so a row without an override is
  byte-for-byte today's wire. `#sendAdd` keeps its own order (`look`, `timing`, `take`). The helper owns the
  members; each builder owns its serialization.

## Out of scope

- The Inspector's wording and layout.
- What an off-air `Update` sends (it stays zero AMCP).
- Other settings recorded off air (position, plates, per-look bindings, fields). Each is reported in
  `LOGO-LOOP-01`'s report and filed separately where it has the same hole.

## Impact

- `packages/template-runtime/src/playout-controller.ts`, `packages/template-runtime/README.md`.
- `tools/caspar-bridge/src/caspar-runtime.ts`, `tools/caspar-bridge/src/command-builder.ts`.
- Tests: `packages/template-runtime/tests/live-pass-timing.test.ts`, `take-tell-is-inert.test.ts`;
  `tools/caspar-bridge/tests/resident-take-timing.integration.test.ts` (new),
  `template-completion-stop.integration.test.ts`, `command-builder.test.ts`.
- Releases: CG Bridge (`B-322`) and CG Control (`B-323`). The Playout contract does not change.

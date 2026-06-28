# Select which content drives the content-driven hold (D-107)

## Why

A content-driven hold is **all-or-nothing per scope** today: `contentWait` /
`ownContentWait` (`runtime.ts`) waits for ALL the scope's tickers, sequences, and
countdown clocks (`Promise.all`). An infinite/looping element's `whenComplete()`
never resolves, so **any** permanent content holds the graphic on air forever
(until `stop()`). That makes "close when the subtitle finishes" impossible
whenever a permanent/looping/decorative element (a pulsing logo crawl, an endless
bug) coexists with the finite content that should actually end the graphic — and
it gives no control at all over the multiple-finite-content case (which one
governs?).

## What Changes

- **Schema** — add an OPTIONAL `drivesHold` boolean to the ticker, sequence, and
  clock element schemas. Absent ⇒ participates (drives the hold) — the pre-D-107
  all-content behaviour — so the field is purely additive and **NON-BREAKING**
  (no schema-version bump, no migration; existing `parse(x).toEqual(x)`
  round-trips are unchanged because the field materializes nothing when absent).
- **Runtime** — `ownContentWait` filters the scope's tickers / countdown clocks /
  sequences to `drivesHold !== false` before the `Promise.all`. `startOwnContent`
  / `stopScopeContent` still start/stop EVERY content element (this is the HOLD,
  not visibility). Because the D-104 coordinator aggregation (`contentTreeWait`)
  recurses through each node's `ownContentWait`, nested-content selection flows
  through automatically. All content excluded (or none present) ⇒ a zero-length
  hold, consistent with today's no-content case.
- **Designer** — when the hold is content-driven, the Playout section shows a
  checklist of the composition's own content elements ("which content closes the
  graphic?"), pre-checked, each toggling that element's `drivesHold`. Only
  tickers, sequences, and COUNTDOWN clocks are listed (wall/countup never complete
  — they can never drive a hold). A focused recursive store action
  (`setElementDrivesHold`) reaches content nested in groups/containers, which the
  shallow `updateElement`/`locate` cannot.

Start-marker selectivity is explicitly **OUT of scope** (deferred): `drivesHold`
governs only the HOLD.

## Capabilities

- `designer-playout-lifecycle` (MODIFIED): the content-completion requirement now
  coordinates only the content sources whose `drivesHold !== false` (an excluded
  infinite element no longer gates the hold; all-excluded/none ⇒ zero-length).
  ADDED: the designer selects which content drives the hold via the Playout
  checklist; wall/countup clocks are never offered.

## Impact

- `packages/shared-schema/src/elements.ts` (`drivesHold` on
  `TickerElementSchema` / `ClockElementSchema` / `SequenceElementSchema`) +
  `tests/elements.test.ts` (additive parse / round-trip coverage).
- `packages/template-runtime/src/runtime.ts` (`wireScope`: `holdTickers` /
  `holdCountdowns` / `holdSequences` collection; `ownContentWait` filter) +
  new `tests/selective-content-hold.test.ts`.
- `apps/designer/src/renderer/features/inspector/PlayoutSection.tsx` (the
  checklist) + `apps/designer/src/renderer/state/slices/elements.ts`
  (`setElementDrivesHold`) + a designer E2E.
- No schema-version bump, no migration (purely additive + behavioral).

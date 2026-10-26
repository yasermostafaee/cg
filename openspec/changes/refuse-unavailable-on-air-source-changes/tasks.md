# Tasks — refuse-unavailable-on-air-source-changes (B-355)

## 0. Contract and diagnosis

- [x] 0.1 File `B-355`, reserve its number and create this change with the two distinct reproductions: on-air Update
      and a look switch whose destination reuses a punched `plateId` with another unavailable source
- [x] 0.2 Establish the existing predicates and transaction boundaries: `sourceBindable` versus `sourceSeatable`,
      prospective/in-force frame comparison, destination planning, pre-seat and page tell

## 1. Red-first bridge regressions

- [x] 1.1 On-air Update: introduce a new unavailable binding and prove `source-unavailable`, the Plate/source/reason
      sentence, zero AMCP, unchanged fields/bindings and a byte-identical live-layer ledger
- [x] 1.2 Shared plate switch: take look 1 with `l1` on a healthy source, bind destination look 2's same `l1` to an
      unavailable source, and prove the switch is refused before page/mixer/producer wire with old look, picture,
      geometry and ledger intact
- [x] 1.3 Controls: the same Update/switch lands when the source becomes available; a held/new unavailable plate keeps
      its existing refusal; a two-box target cannot land one plate or geometry without the other
- [x] 1.4 Doctrine controls: an unchanged binding that later becomes unavailable does not block a text-only or
      neighbour repair Update; a new unavailable binding is accepted while off air, then refused by take/switch
- [x] 1.5 Keep emergency live repair narrow: an unrelated unchanged invalid plate does not block a healthy swap, but
      a newly requested unavailable target is refused before its override or any other state changes

## 2. Bridge implementation

- [x] 2.1 Extend `#refuseBindingChange` for a new/changed unseatable frame only when `#ownsLiveSeats` is true, reusing
      `sourceSeatable`, the live-plate error codes and the canonical Plate/source/reason wording
- [x] 2.2 Plan `switch` with the destination-strict `entering-look` refusal scope while keeping its pinned level-two
      assignments and union pre-seat set; keep `live` on `already-live`
- [x] 2.3 Update the planner comments that currently group switch with live repair; add no second validator and no new
      rollback or AMCP command

## 3. Runtime feedback and parity

- [x] 3.1 Give `MockRuntime` the smallest catalogue-plan parity needed for these pre-wire refusals without inventing
      CasparCG wire behavior
- [x] 3.2 Runtime e2e: refused Update retains every staged edit/dirty state and shows the canonical reason; refused
      switch keeps the old look selected and shows the row refusal without a duplicate banner

## 4. Verification and closeout

- [ ] 4.1 Run focused shared/bridge/runtime unit and integration suites, typecheck and lint for affected workspaces
- [ ] 4.2 Run Runtime Playwright for the operator-visible contract, then the repository full gate
- [ ] 4.3 Re-read the PRD and both deltas against the implementation; record required Linux CI evidence beside this
      task before archiving the change

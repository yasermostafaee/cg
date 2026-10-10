# Tasks — one address to give; CasparCG derived; a wrong CasparCG host never fails in silence (`SERVERS-SIMPLIFY-01`)

## A. One address to give (`R-095`, `B-324`, `B-325`; T1, T5)

Lane: **FULL** — the writer of a persisted key (`cg.runtime.station.v1`, through `Connect`) and the predicate that
decides when `Connect` commits.

- [x] A.0 Reproduced first, by running, against the unchanged code (`7d68fc8b`):
      `tests/stationSetupConnection.dom.test.ts`. `B-324`: Change, a CG Bridge address typed, Channel and back —
      the field was gone (`expected undefined to be '192.0.2.93'`), with no mark on the rail. `B-325`: open on a CG
      Bridge whose server A and serve host are `192.168.21.93`, re-pointed at one whose A is `127.0.0.1` —
      `Apply servers` sent `192.168.21.93` (`nothing of X reaches Y: expected '192.168.21.93' to be '127.0.0.1'`).
- [x] A.1 `stationFields.ts`: the one reading of the address fields — a host and a port each, an empty port the
      default, a paste of a whole address splitting into both, the facts (`host : port`), and the one comparison
      (`stationFieldsChanged`). `StationAddressFields.tsx`: the one set of fields, rendered by Set up and by the card.
- [x] A.2 `PlayoutConnection`: the addresses as facts with CG Bridge's place, `On the Playout machine` or
      `Separate server`, each with its own `Change`; `Connect` offered once a field changed, beside
      `Not connected yet`, and saving only where CG Bridge answered at the fields' address (it runs the check
      itself); the open edit held by whoever outlives the card (`draft` / `onDraft`).
- [x] A.3 Station setup: the tab is `Connection` (id `servers`); the card's edit is held here, marks the rail
      (one count per waiting commit), and is discarded on close and by `Revert`. A reconnect while open reads the
      configuration and the serve state again; on another CG Bridge the draft goes with its baseline (`B-325`).
- [x] A.4 Set up (`PlayoutAddressGate`) asks with the same fields; the gate's one rule is unchanged (save only
      where CG Bridge answers).
- [x] A.5 jsdom: `stationFields.test.ts` (split, paste, empty = default, the comparison);
      `stationSetupConnection.dom.test.ts` (the two reproductions, a closing that discards, a blink that keeps, the
      facts and the tag); `playoutAddressGate.dom.test.ts` (four fields under two names, the placeholders, a paste,
      a port alone); `setUpNeverStranded.dom.test.ts` (`B-317`'s rule asserted at the save).
- [x] A.6 Chromium: `tests/e2e/connection-card.spec.ts` on CG Control's own page with real CG Bridges (the facts,
      the fields measured on one row inside the card, the edit across a tab switch, a close that discards; and
      `B-325` between two CG Bridges); `playout-address-gate.spec.ts` (the host and its port measured on one row);
      the staging shared with `sign-in-gate-escape.spec.ts` (`fixtures/cg-control.ts`). Green locally (Windows;
      not a discharge).
- [x] A.7 Swept by STRING and by COMPONENT (golden rule 9): the tab's name in every spec that opens it, the fact in
      every spec that reads it, the Set up fields' names in the e2e and the desktop acceptance, and the pending
      deltas that named `Servers` (amended in place, dated).
- [x] A.8 The release guide on `dev` (`docs/release/0.11.4/install-guide.fa.md`) and its pins
      (`tools/release/tests/guide.test.ts`) follow the labels.
- [ ] A.9 A Linux `e2e` run that RAN, on the commit carrying Part A — URL here.
- [ ] A.10 The Desktop run's `installer-smoke` and `acceptance-fresh` green on the commit carrying Part A — URL here.

## B. CasparCG, derived (`R-096`, `B-326`; T2, T3)

- [ ] B.1 Not started.

## C. A wrong CasparCG host never fails in silence (`B-327`; T6)

- [ ] C.1 Not started.

## D. A station with no Playout (`R-098`; T4)

- [ ] D.1 Not started.

## E. Report

- [ ] E.1 `Claude outputs/REPORT-SERVERS-SIMPLIFY-01-v1-<date>.md`, with before/after pictures and the owner's one
      check (H1).

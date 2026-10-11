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
- [x] A.9 Discharged on `11c3df68`. The Linux `e2e` job RAN (from its log: runtime 339 passed, 2 skipped; designer
      303 passed; `connection-card.spec.ts` and `playout-address-gate.spec.ts` passed) —
      https://github.com/yasermostafaee/cg/actions/runs/38092929277/job/114332915528
- [x] A.10 The whole Desktop run green on `11c3df68`: `installer-smoke` read the split fields back
      (`…the address typed, and CONNECT pressed — http://127.0.0.1:59999`) —
      https://github.com/yasermostafaee/cg/actions/runs/38092929297/job/114335011797 — and `acceptance-fresh`'s
      `stuck-station` was 22/22, its card reading `10.1.0.100 : 8080` —
      https://github.com/yasermostafaee/cg/actions/runs/38092929297/job/114335011735

## B. CasparCG, derived (`R-096`, `B-326`; T2, T3)

Lane: **FULL** — CG Bridge's one predicate of who cannot fetch graphics (`hostsUnableToFetchTemplates`), an IPC
schema field (`TemplateServeInfo.elsewhere`), and a surface that decides what a station admin may type. A CG Bridge
release matter: the boot line, the apply answer and the serve state change. No refusal condition changes —
`unreachable` reports and never refuses.

- [x] B.0 Reproduced first: the owner's `.32` advertising `.93`. For the servers `127.0.0.1` and `192.168.21.50`,
      bound on `0.0.0.0` and advertising `192.168.21.93`, `hostsUnableToFetchTemplates` answered `[]` (routable,
      so "reachable"). Ablation on the fix (the new judgement removed) reds exactly that case: it answered `[]`
      where both servers are named.
- [x] B.1 CG Bridge: `servesFromAnotherMachine` (an IPv4 host neither loopback nor one of this machine's addresses;
      a name is not judged) inside the ONE predicate, whose third input is this machine's addresses
      (`detectServeHostCandidates`, the chips' list) at every call site; `elsewhere` in the serve state and the apply
      answer; the boot/apply line in its own words. `@cg/shared-ipc`: `TemplateServeInfo.elsewhere` (optional),
      `graphics` among the console's lines, in the After sign-in group.
- [x] B.2 The cards are `CasparCG A` / `CasparCG B · backup`, the rail's foot `CasparCG`; in a Playout station A is
      a fact row (`On the Playout machine`, host, ports, the status bar's word for its state).
- [x] B.3 T5 for the CasparCG ports: empty is the default, the default the placeholder (A `5250`/`6251`, B
      `5250`/`6252`, the Add backup dialog too).
- [x] B.4 `Advanced` (collapsed in a Playout station): `Where CasparCG fetches graphics`, `Host` / `Port`, the chips
      labelled as CG Bridge's machine's addresses; the lede, the port hint and every "this machine" gone; the
      remote-host note and the apply sentences reworded. The unused `.cg-setup-lede` and its two tokens removed.
- [x] B.5 The `graphics` line in the check when CG Bridge says `elsewhere`, with `Detect automatically`.
- [x] B.6 Tests: bridge `template-http-server.test.ts` (B-326 ×3); jsdom `stationSetupCaspar.dom.test.ts` (10);
      the specs that pinned the old names, port values or wording, amended; Chromium `connection-card.spec.ts`
      (`CasparCG A` a fact, `Advanced` collapsed, the owner's `.93` applied → the failed line →
      `Detect automatically` → applied → gone, through a real CG Bridge), `server-settings.spec.ts`,
      `station-setup-geometry.spec.ts` (the lede's absence pinned). Green locally (Windows; not a discharge).
- [x] B.7 Swept by STRING and by COMPONENT; the 0.11.4 guide on `dev` and its pin name `CasparCG B · backup`.
- [ ] B.8 A Linux `e2e` run that RAN, on the commit carrying Part B — URL here.

## C. A wrong CasparCG host never fails in silence (`B-327`; T6)

- [ ] C.1 Not started.

## D. A station with no Playout (`R-098`; T4)

- [ ] D.1 Not started.

## E. Report

- [ ] E.1 `Claude outputs/REPORT-SERVERS-SIMPLIFY-01-v1-<date>.md`, with before/after pictures and the owner's one
      check (H1).

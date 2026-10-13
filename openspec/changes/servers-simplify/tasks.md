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
- [x] B.8 Discharged on `1263b057`. The Linux `e2e` job RAN (from its log: runtime 340 passed, 2 skipped; designer
      303 passed; `connection-card.spec.ts` ×3 and `station-setup-geometry.spec.ts` passed) —
      https://github.com/yasermostafaee/cg/actions/runs/38114128077/job/114395545576 — and the Desktop run on the
      same commit is green: https://github.com/yasermostafaee/cg/actions/runs/38114128108

## C. A wrong CasparCG host never fails in silence (`B-327`; T6)

Lane: **FULL** — CG Bridge's `setup.check` route (which lines a named CasparCG host keeps), an IPC schema field
(`ConnectionCheckResult.casparJoin`), the console's check request, and a write through `connections.set-config`. A CG
Bridge release matter. No refusal condition changes: the narrowing before a sign-in is byte for byte as before, and
`Use the Playout's` is refused on air by the same door as `Apply servers`. The Playout contract's join is reported,
never relaxed.

- [x] C.0 The owner's state staged: a real CG Bridge driving server A at `127.0.0.9` against the fake Playout's
      meters on `127.0.0.1` — the badge reads `— LUFS` while the Playout's stream is open. That the check read green
      in this state is the owner's picture (`After sign-in · 1 OK`), not a run of the unchanged code here; the red
      halves are the ablations in C.5.
- [x] C.1 CG Bridge: the ONE "is this host ours?" is built once (`hostIsOursFor`) and read by the meters, the sources
      and the join (`casparJoinOf`: the first row on a declared channel, its derived host, and whether A joins). The
      check's answer carries it as `casparJoin`, to a signed-in asker only — a FACT beside the lines, because an
      older console parses line ids strictly. `@cg/shared-ipc`: `ConnectionCheckResult.casparJoin` (optional),
      `caspar-join` among the console's lines, in the After sign-in group.
- [x] C.2 The route asks two questions: is this the station's own Playout (its lines and the join), and may an
      unsigned caller ask this (the narrowing, unchanged). A signed-in console naming the CasparCG host keeps its
      station's lines.
- [x] C.3 The console sends server A as `casparHost` with a check of the station's own Playout, once the
      configuration is read (the check on open waits for it); and asks by the name CG Bridge advertises, signed in
      or not — on the owner's station the record's address and CG Bridge's Playout differ, and `After sign-in`
      carried no line of CG Bridge's own.
- [x] C.4 Station setup: the `caspar-join` line (pass: `CasparCG A is the Playout's: <host>.`; fail: both hosts and
      `meters, sources and grants are dropped.`); `Use the Playout's` on CasparCG A while it fails, writing CG
      Bridge's derived host through `connections.set-config`, disabled on air, and the check asked again after it;
      `Not applied` on a CasparCG card whose fields differ from what is in force.
- [x] C.5 Tests: bridge `caspar-join.test.ts` (both placements, the one predicate read at call time) and
      `caspar-join.integration.test.ts` (the fake Playout's meters through a real CG Bridge: silent in the owner's
      state and back after the write, in both placements; the join told to a signed-in asker only; a named host keeps
      the station's lines). Red-first by ablation: the join withheld reds all three; the route's old single question
      reds them too. jsdom `stationSetupCaspar.dom.test.ts` (+5: the owner's state, placement 2, the passing
      control, refused on air with `Not applied`, `Not applied` on A's typed host); the on-open gate ablated, the
      first check carried no host. Chromium `caspar-join.spec.ts` (`— LUFS` → the line fails naming `127.0.0.9` and
      `127.0.0.1` → `Use the Playout's` → the line passes → `−23.2 LUFS`); `station-setup-geometry.spec.ts` measures
      B's two tags. Runtime e2e green locally (Windows; not a discharge).
- [x] C.6 The Playout letter needs no line: the contract is unchanged, and the join it fixes is only reported.
- [x] C.7 Discharged on `35f4a09e`. The Linux `e2e` job RAN (from its log: runtime 341 passed, 2 skipped; designer
      303 passed; `caspar-join.spec.ts` and `station-setup-geometry.spec.ts` passed) —
      https://github.com/yasermostafaee/cg/actions/runs/38116432285/job/114402151711 — and the Desktop run on the
      same commit is green: https://github.com/yasermostafaee/cg/actions/runs/38116432314

## D. A station with no Playout (`R-098`; T4)

- [ ] D.1 Not built — stopped after Part C, as the prompt directs when T4 reaches more places than expected. Beyond
      `cg.runtime.station.v1`, a record with no Playout reaches the check's request schema
      (`ConnectionCheckRequest.playoutAddress` is required, and CG Bridge keys its own Playout on it — a second CG
      Bridge release change with an older-bridge skew), CG Setup (`tools/setup-ui/src/server.rs` reads
      `playoutAddress`), the console's boot gate (`loadStationAddress`), the bridge URL's derivation
      (`bridgeUrlForStation`, `bridgeAddressFor` on the `window.cg` contract), and the desktop acceptance. Already in
      place: with no Playout, CasparCG A is typed and its ports' defaults are placeholders.

## E. Report

- [x] E.1 `Claude outputs/REPORT-SERVERS-SIMPLIFY-01-v1-2026-10-11.md`, with before/after pictures and the owner's
      one check (H1).

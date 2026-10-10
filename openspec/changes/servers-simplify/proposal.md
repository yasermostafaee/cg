# servers-simplify

## Why

The owner's CG Control `0.11.4` on `192.168.21.32` (2026-10-10, `SERVERS-SIMPLIFY-01`, his pictures 1–6). Station
setup's `Servers` tab held three unrelated-looking things: the Playout this console uses, where it reaches CG
Bridge, and the CasparCG engines. He read `Primary server` (a CasparCG engine) as "where the bridge is" and the
serve host's "this machine" as his own PC, and both ended up holding his PC's address, `192.168.21.93`:

- the programme meter read `— LUFS` with picture and sound present. A Playout reading is kept only when the
  Playout's `casparHost` joins a configured CasparCG host (`hostIsOurs`), and `.93` joined nothing. The check
  read all green: the console never sent `casparHost`, and no line reads the join (`B-327`);
- the graphic did not appear: every `CG ADD` carried `http://192.168.21.93:7911/…`, so CasparCG on `.32` fetched
  the page from his PC, and `CG OK` came back each time (`B-326`, `B-162` again);
- typing into the Playout card's CG Bridge field and changing tab dropped what he typed without a word (`B-324`);
- and Station setup kept the first CG Bridge's fields, with no mark, after the console was re-pointed at another
  one, so `Apply servers` sent them there — reproduced by running, the suspected path of `.93` into `.32` (`B-325`).

The owner's direction: a station is ONE Playout, and he gives only its address. CG Bridge is on the Playout's
machine unless he says otherwise; CasparCG is always where the Playout is. Every address that needs a port has its
own port field, and the default is the placeholder.

## What changes

- **Part A — one address to give (`R-095`, `B-324`, `B-325`; T1, T5).** The tab is `Connection`. Its Playout card
  states the two addresses as facts (`192.168.21.32 : 8080`; CG Bridge with `On the Playout machine` or `Separate
server`), each with `Change`. An address is edited as a `Host` and a `Port`, every default a placeholder, a whole
  address pasted into a `Host` filling both. `Connect` is the one commit, offered as soon as a field changed beside
  `Not connected yet`; it runs the check where the fields resolve and saves only where CG Bridge answers (`B-317`).
  The open edit is held by Station setup, survives a tab switch, marks the rail and is discarded on close. A
  reconnect while the dialog is open reads the configuration again, and a draft never crosses to another CG Bridge.
  The Set up page asks with the same fields (`StationAddressFields`, `stationFields.ts`): one set, one rule.
- **Part B — CasparCG, derived (`R-096`, `B-326`; T2, T3).** Not yet built.
- **Part C — a wrong CasparCG host never fails in silence (`B-327`; T6).** Not yet built. `R-097` is filed only.
- **Part D — a station with no Playout (`R-098`; T4).** Not yet built.

## Decisions

- **The tab's id stays `servers`.** It is a deep link, and an id is not an operator's word (golden rule 11). The
  commit keeps its name, `Apply servers`: it applies the CasparCG servers, the graphics address and the redundancy
  — the bridge's half of the tab — while `Connect` is this console's half.
- **`Connect` is offered at once and checks itself.** It replaces "Connect appears once a check found CG Bridge at
  the fields' address" (`B-317`). What `B-317` protects is unchanged and is asserted where it lives: nothing is
  saved unless CG Bridge answered at the address the fields resolve to.
- **A paste splits; typing never moves text.** "Pasting `http://host:8080` into Host fills both" is applied to a
  change that brings more than one character at once (a paste, an autofill, a drop), and to `http://` typed in
  front of a host. A person typing `192.168.21.32:` has not finished. CG Bridge's address never has a scheme, so in
  its field a URL stays as typed and is refused by its one sentence.
- **`https://` is the one scheme a Playout host field shows**, because it is the one that changes what is
  dialled. `http://` is the default and is never kept.
- **The draft follows the CG Bridge it was typed against.** On another CG Bridge it is dropped with its baseline;
  on the same one, a draft being typed stands unless what is stored there changed — a blink of the LAN is not a
  reason to drop an operator's typing.
- **The release guide on `dev` follows the renamed labels.** `guide.test.ts` pins every label the guide quotes
  against the source that renders it, so the 0.11.4 guide on `dev` names `Connection`, `Host` and `Port` now. The
  tagged 0.11.4 is unchanged. Its picture of the Set up page (`img/4-playout-address.png`) shows the old field
  until the next release's pictures are taken.

## Out of scope

- The status bar's own wording (`PRIMARY A`, `A: ANOTHER CG BRIDGE`).
- CasparCG's own log from `.32` (it would show the failed fetch of `http://192.168.21.93:7911/…`); not needed to act.

## Impact

- `apps/runtime/src/renderer/features/firstRun/` — `stationFields.ts` and `StationAddressFields.tsx` (new),
  `PlayoutConnection.tsx`, `PlayoutAddressGate.tsx`.
- `apps/runtime/src/renderer/features/stationSetup/` — `StationSetupDialog.tsx`, `sections.ts`.
- `apps/runtime/src/renderer/theme.ts`, `ui/controls.css` (one geometry token, the field-group rules).
- Tests: `stationFields.test.ts`, `stationSetupConnection.dom.test.ts` (new), `playoutAddressGate.dom.test.ts`,
  `setUpNeverStranded.dom.test.ts`, `stationSetupTabs.dom.test.ts`; e2e `connection-card.spec.ts` (new), the
  fixture `fixtures/cg-control.ts` (shared with `sign-in-gate-escape.spec.ts`), and the specs that open the tab or
  read the Playout card; the desktop acceptance (`release-acceptance.mjs`, `installer-smoke.mjs`).
- `docs/release/0.11.4/install-guide.fa.md` and `tools/release/tests/guide.test.ts`;
  `docs/integration/playout/CG-BRIDGE-FOR-PLAYOUT.md`.

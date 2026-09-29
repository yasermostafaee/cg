# dev-local-caspar — tasks (`P-058`, `DEV-LOCAL-CASPAR-01`)

## 0. Establish

- [x] 0.1 How `dev:station --fake` wires the bridge to the mock, and where a real target plugs in;
      the media folder and a `CLS` entry's absolute path on 2.5.0; OSC to an AMCP client; how the fake
      Playout builds D4 and D11 and the smallest change (`design.md` §0, every claim cited to source).

## 1. `@cg/amcp-mock`

- [x] 1.1 `INFO PATHS` (`201 INFO PATHS OK`, one XML chunk; `paths` option) and `CLS` (the scanner's
      lines, `media` option, `setMedia`; `501` with no scanner) in a 2.5.0 core's dialect.
- [x] 1.2 `tests/media-listing.test.ts` — both replies byte for byte, the no-scanner `501`, `setMedia`.

## 2. The fake Playout

- [x] 2.1 `setMedia(items)`; `beforeMediaSearch`, awaited before a D11 SEARCH only (never `ids=`); a
      media item may be a `still` with no `durationMs` (`media-plates.integration.test.ts` reads the
      optional length).

## 3. The local-core station (`tests/support/local-caspar-station.ts`)

- [x] 3.1 The loopback rule (`parseCasparTarget`), `127.0.0.1`/`::1`/`localhost` on 5250, `.111` and
      `.114` refused by name.
- [x] 3.2 `readCore` — five reads, one connection, refused before connecting for anything else; the
      reply framing (`AmcpReplyReader`, UTF-8 as a stream).
- [x] 3.3 The parsers and builders: `INFO` → D4 rows, `INFO PATHS` → the absolute media folder,
      `INFO CONFIG` → OSC, `CLS` → the D11 library (ids, names, folders, lengths, `updatedAt`).
- [x] 3.4 `startLocalCasparStation` — read, then start the fake Playout shaped from the core; the 30 s
      re-read; one-line refusals; notes.
- [x] 3.5 `tests/local-caspar-station.test.ts` — the rule with its control (`127.0.0.1:5250` accepted,
      `192.168.21.111:5250` refused), the framing (a Persian letter split across two chunks), the
      parsers, the D11 builder from a source-derived `CLS`/`INFO PATHS` fixture (spaces, Persian
      letters, sub-folders), search/sort/paging over it, five reads only, no file API.
- [x] 3.6 `tests/local-caspar-station.integration.test.ts` — against `@cg/amcp-mock` taught `CLS` and
      `INFO PATHS`, and a real bridge: the five reads; D4 and D10 as the console sees them; D11 through
      `sources.media-search`; a take's `PLAY` with the absolute path; the send guard read off the wire
      (with its positive control); the 30 s re-read on a fake clock (shown red with the in-flight share
      and the `ids=` exemption each removed); no scanner; no OSC; nothing answering; not CasparCG.
- [x] 3.7 `tests/desktop-sidecar.test.ts` — the installer's bridge bundle carries none of the mode (four
      ASCII pins, each shown present in a deliberately leaked bundle; a first `' · local'` pin was
      vacuous — the bundle escapes non-ASCII — and was replaced).

## 4. The dev station

- [x] 4.1 `--caspar <host:port>` with `--fake` only; the rule asked before anything runs; the
      `fake-local` state folder; `startLocalCaspar`; the banner's local lines; a start that cannot
      start is one line.
- [x] 4.2 Tests: `station-plan.test.ts` (flags, state folder, banner), `station-sequence.test.ts` (the
      one-line failure, the banner), `local-caspar-cli.test.ts` (the launcher itself refuses `.111`,
      `.114`, another host and another port in one line, exit 2, before its state folder exists).
- [x] 4.3 `turbo.json`: `@cg/dev-station#test` hashes `tools/caspar-bridge/tests/support/**`, which the
      launcher that test spawns loads at run time.

## 5. Gate, CI, the owner's run

- [x] 5.1 `pnpm gate` green, full and uncached (96/96, 0 cached), as the pre-push gate of each push:
      `gate-20260929T083245Z-7860.log` (`84751dfd`, 438.5 s), `gate-20260929T084923Z-8504.log`
      (`40a0cfe4`, 483.6 s), `gate-20260929T093143Z-18284.log` (`ae5e6c32`, 448.5 s).
- [x] 5.2 Pushed; `origin/dev` read back with `git ls-remote` at `ae5e6c32`.
- [x] 5.3 CI — every run COMPLETED `success` on attempt 1, and every job in it RAN (none skipped):
  - `84751dfd` — PR <https://github.com/yasermostafaee/cg/actions/runs/36544178627> (`ci`; `E2E`: runtime
    306 passed, designer 291 passed, 12 skipped); Desktop
    <https://github.com/yasermostafaee/cg/actions/runs/36544178635> (installers + clean-Windows smoke).
  - `40a0cfe4` — PR <https://github.com/yasermostafaee/cg/actions/runs/36546022415> (`E2E`: runtime 306,
    designer 291, 12 skipped); Desktop <https://github.com/yasermostafaee/cg/actions/runs/36546022440>.
  - `ae5e6c32` — PR <https://github.com/yasermostafaee/cg/actions/runs/36550551130> (`E2E`: runtime 306;
    designer 288 passed, 12 skipped, 3 flaky that passed on retry — `preview-field-update.spec.ts:12`,
    `repeater.spec.ts:50`, `sequence-composition-item-fields.spec.ts:13`, none in this diff's reach); Desktop
    <https://github.com/yasermostafaee/cg/actions/runs/36550551264>.
- [ ] 5.4 The owner's local run (bind a real clip to plate 2 of a two-box template on CH 1 and take it;
      switch looks — Paused, then continuing from the same frame; Restart; Ended with Loop off; `INFO 1`
      before and after, our layers 50–99 only). Not run by CC: on 2026-09-29 the owner's own
      `dev:station --fake` held every station port and `127.0.0.1:5250` (its stand-in), and no
      CasparCG process was running.

## 6. Independent review (after the first push)

- [x] 6.1 A failed `--fake` start HUNG instead of exiting: `createMock` left its OSC socket and tick timer
      open when its AMCP listen failed, and 4.1's one-line failure no longer crashed the process out.
      `4414bd3b`: the mock stops them before it rethrows; `tools/amcp-mock/tests/failed-start.test.ts`
      (red on the old mock — one UDP socket still open after 1 s; control: a started mock holds one
      until stopped); the reviewer's real-module probe now exits by itself.
- [x] 6.2 A refusal could still break a line on NEL (U+0085) or U+2028/U+2029 (`40a0cfe4` had covered
      C0 only). `ae5e6c32`: C0, DEL, C1 and both separators show as `?`; red first with the C0-only rule.
      The spec builds those characters from code points — a literal U+2028 had reached its source
      through an edit (`TS1161`).
- [x] 6.3 On Node 23.0–23.5 (TypeScript still behind a flag) `--caspar` died with a stack. `ae5e6c32`: a
      one-line refusal (shown with the load pointed at a missing file: one line, exit 2, no folder).
- [x] 6.4 `oscOf` read `True` as true; the core's boost `bool` takes `1` or `true` exactly. `ae5e6c32`,
      with a spec.
- [x] 6.5 The host-guard spec named the plant's address, which a regressed guard would have dialled.
      `ae5e6c32`: `127.0.0.2:1`.

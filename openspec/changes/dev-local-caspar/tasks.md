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

- [ ] 5.1 `pnpm gate` green (full, uncached).
- [ ] 5.2 Pushed; the `dev` head matches `origin/dev`.
- [ ] 5.3 CI on the pushed commit: `ci` and `e2e` COMPLETED green with both jobs RAN; the Desktop
      installers COMPLETED green.
- [ ] 5.4 The owner's local run (bind a real clip to plate 2 of a two-box template on CH 1 and take it;
      switch looks — Paused, then continuing from the same frame; Restart; Ended with Loop off; `INFO 1`
      before and after, our layers 50–99 only). Not run by CC: on 2026-09-29 the owner's own
      `dev:station --fake` held every station port and `127.0.0.1:5250` (its stand-in), and no
      CasparCG process was running.

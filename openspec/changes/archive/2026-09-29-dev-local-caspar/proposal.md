# dev-local-caspar — the fake Playout in front of this machine's own CasparCG (`P-058`)

Prompt: `DEV-LOCAL-CASPAR-01` (v1), 2026-09-29. Order: after `CHANNEL-TEMPLATES-01` (`79cc861b`).

## Why

`MEDIA-PLATES-01` (Pause, Restart, Loop, Ended, the remaining time) cannot be checked with real video:

- `pnpm dev:station --fake` plays no video — its CasparCG is `@cg/amcp-mock`;
- the test Playout's machine (`.111`) has its engine service stopped and `2.9.0` not installed (the
  Playout's reply of 2026-09-29, `PLAYOUT-CG-RESPONSE-ROUTE-ON-SOURCES-v1.md` §0).

The owner's own CasparCG `2.5.0` runs on `127.0.0.1:5250` with a media folder of real clips;
`LOOK-SWITCH-01` measured on it.

## What changes

The owner's decision (2026-09-29): a DEV-ONLY mode, `pnpm dev:station --fake --caspar 127.0.0.1:5250`.

- The bridge's AMCP and OSC go to that real core instead of `@cg/amcp-mock`. Nothing stands in for
  CasparCG: the bridge learns the core the way it learns any — first-run writes the host D4 names, on
  the standard ports.
- The fake Playout stays in front (sign-in, D4, D10, D11), shaped from the real core:
  - D4 lists the core's channels (from `INFO`), named `CH n · local`, with `output: unknown`;
  - D10 is empty — there are no real inputs to offer;
  - D11 lists the core's media library (from `CLS`), each clip's ABSOLUTE path under the core's media
    folder (from `INFO PATHS`) and its length; search, sort and paging work as on the fake. `CLS` is
    read at the start and again when a D11 search arrives after 30 s.
- PROGRAM: no return feed; the owner watches the core's own screen consumer.
- The start names the core, its version and its channels, and says in one line each what cannot work
  (no media scanner, OSC not reaching the station).

Built as:

- `tools/caspar-bridge/tests/support/local-caspar-station.ts` — the loopback rule, five read-only AMCP
  reads, the parsers, the D4/D11 builders and the composition the dev station runs (loaded by path, as
  `fake-station.ts` is);
- the fake Playout: a replaceable D11 library (`setMedia`), a hook awaited before a D11 SEARCH only, and
  media items that may be stills with no length;
- `@cg/amcp-mock` answers `INFO PATHS` and `CLS` in a 2.5.0 core's dialect;
- the dev station: `--caspar <host:port>` (with `--fake` only), its own `fake-local` state folder, the
  banner lines, and a start that cannot start is one line.

## Hard stops (unchanged by this change)

- Dev-only: nothing of it ships in either installer — pinned by `desktop-sidecar.test.ts`.
- No product behaviour changes when the flag is absent: no file under `tools/caspar-bridge/src`,
  `tools/caspar-bridge/bin`, `apps/*/src` or `packages/*/src` changes.
- Loopback only: `127.0.0.1`, `::1`, `localhost`; `.111` and `.114` refused by name; everything else
  refused — each in one line, at start.
- The bridge's send guard (`amcp-guard.ts`) is untouched: layers 50–99 only; no `CLEAR <ch>`, no
  `SET MODE`, no consumer `ADD`/`REMOVE`.
- The owner's CasparCG is never stopped, started or reconfigured; its config is read only through
  AMCP (`INFO`, `INFO PATHS`, `INFO CONFIG`, `CLS`), and nothing is written into its folder.

## Impact

- `tools/caspar-bridge/tests/**` (support + tests), `tools/amcp-mock/src/**` + a test,
  `tools/dev-station/**`.
- `turbo.json`: `@cg/dev-station#test` hashes `tools/caspar-bridge/tests/support/**`, which the new CLI
  test's launcher loads at run time (shared config).
- `docs/prd/platform.md`: `P-058` filed.

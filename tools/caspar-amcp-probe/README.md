# `@cg/caspar-amcp-probe` — AMCP HTML-producer update-sequence harness (C-001 Phase 3b)

A self-contained spike harness that runs a **matrix of candidate AMCP
load/update/stop sequences** against a **real CasparCG 2.3.2** and reports which
(if any) actually delivers a **Persian-laden JSON payload** to `window.update`.

This resolves [ADR 0006](../../docs/adrs/0006-amcp-update-mechanism-unresolved.md)'s
open question. On the M1 spike, `CG INVOKE 1 "update" "<json>"` delivered an
**empty** param and `CALL … "update"` returned `202 CALL OK` but never invoked
`window.update`. Phase 2's mock-validated bridge path uses `CG UPDATE`. **All three
are unverified on hardware** — this harness tells you which one works.

> ⚠️ It cannot be run in CI — it needs a real CasparCG. You run it against your
> VM and paste the result into ADR 0006 (and then the follow-up change locks the
> verified verb into the command-builder seam).

## How it works

1. The harness **serves an instrumented probe** (`public/probe.html`) over HTTP and
   opens a **WebSocket "beacon"** on the same port.
2. For each candidate it: `CLEAR`s the slot → runs the **load** commands → waits for
   the probe to load (a `hello` beacon) → runs the **update** command → waits for a
   `window.update` **beacon** → runs the **stop** commands.
3. For each candidate it records: the **raw AMCP return codes**, whether
   `window.update` fired, the **exact payload** it received, and whether Persian/UTF-8
   survived. The probe **also renders the payload on the CasparCG output** so you can
   eyeball Persian correctness directly.

The probe reports back two ways, so you're covered even if CEF can't reach the
harness: the **WebSocket beacon** (auto-captured in the table) and the **on-screen
echo** (eyeball + fill the table below).

## Candidates (in `src/candidates.ts` — add your own)

| id                        | load                             | update                         | stop                |
| ------------------------- | -------------------------------- | ------------------------------ | ------------------- |
| `cg-add+cg-update`        | `CG … ADD 0 "<url>" 1 "<j>"`     | `CG … UPDATE 0 "<j>"`          | `CG … STOP`+`CLEAR` |
| `play-html+call-update`   | `PLAY … [HTML] "<url>"`          | `CALL … "update" "<j>"`        | `CLEAR`             |
| `cg-add+cg-invoke-update` | `CG … ADD 0 "<url>" 1 "<j>"`     | `CG … INVOKE 0 "update" "<j>"` | `CG … STOP`+`CLEAR` |
| `cg-add+cg-invoke-inline` | `CG … ADD 0 "<url>" 1 "<j>"`     | `CG … INVOKE 0 "update(<j>)"`  | `CG … STOP`+`CLEAR` |
| `play-html-urlquery`      | `PLAY … [HTML] "<url>?data=<j>"` | (none — payload in the URL)    | `CLEAR`             |

## Run it

```bash
pnpm --filter @cg/caspar-amcp-probe build       # once

# Same machine as CasparCG:
node tools/caspar-amcp-probe/bin/caspar-amcp-probe.mjs --caspar-host 127.0.0.1

# CasparCG on another box — it must be able to reach THIS machine for the probe:
node tools/caspar-amcp-probe/bin/caspar-amcp-probe.mjs \
  --caspar-host 192.168.1.50 --caspar-port 5250 \
  --serve-host 192.168.1.10            # <- THIS machine's IP, as CasparCG sees it
```

Useful flags: `--channel 1 --layer 10`, `--serve-port 7900`, `--settle-ms 400`,
`--load-wait-ms 8000`, `--update-wait-ms 4000`, `--probe-url file:///C:/probe/probe.html`
(serve elsewhere), `--out <prefix>` (results files). The harness writes
`<prefix>.results.json` and `<prefix>.wire.ndjson`.

### What to look for

- **`amcp` = YES** → every command in that candidate returned `2xx`.
- **`update` = YES** + **`match` = YES** → `window.update` received the **exact** sent
  JSON. This candidate **works**. Confirm **`persian` = YES** (no `�`).
- If `update`/`match` are blank but the **CasparCG output** shows the Persian update,
  the page loaded from `file://` or couldn't reach the harness — trust your eyes and
  record it below.
- The winning candidate (or, if none deliver to `window.update`, the URL-query
  fallback) is what goes into ADR 0006 and the command-builder seam.

## Results — fill this in from your run

> CasparCG build: `__________` · date: `__________` · operator: `__________`

| candidate                 | amcp 2xx | window.update fired | exact JSON match | Persian intact | notes (what you SAW on screen) |
| ------------------------- | -------- | ------------------- | ---------------- | -------------- | ------------------------------ |
| `cg-add+cg-update`        |          |                     |                  |                |                                |
| `play-html+call-update`   |          |                     |                  |                |                                |
| `cg-add+cg-invoke-update` |          |                     |                  |                |                                |
| `cg-add+cg-invoke-inline` |          |                     |                  |                |                                |
| `play-html-urlquery`      |          |                     |                  |                |                                |

**Verified sequence (the winner):** `____________________________________________`

Paste this verdict into ADR 0006 → "Phase 3b findings" and tell me — the follow-up
change locks the verb into [`tools/caspar-bridge/src/command-builder.ts`](../caspar-bridge/src/command-builder.ts)
and flips C-001 to done.

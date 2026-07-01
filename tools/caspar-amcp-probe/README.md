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

---

# B-041 — AMCP escape-matrix sweep (`--sweep`)

A second mode of the same harness. The verb sequence is **fixed** (the
hardware-validated `CG ADD` + `CG UPDATE`); the **only variable is how the JSON data
argument is escaped**. It discovers, empirically, which escaping survives CasparCG
2.3.2's quoted-string un-escape so that the served template's `JSON.parse` gets the
value back **byte-exact**.

Why empirical: the on-paper rule is **not derivable** — two hardware data points
contradict every hand-derived un-escape model (quotes-only [#245] AND the original
double-escape both failed; CasparCG was proven to turn backslash-n into a **raw
newline**). See [`openspec/changes/fix-amcp-escaping-v2/design.md`](../../openspec/changes/fix-amcp-escaping-v2/design.md).
So, exactly like ADR 0006, we sweep candidates on real hardware and let the result
pick the rule.

## The hard payload

One field per character class (in `src/escape-candidates.ts` → `HARD_PAYLOAD`): a
double-quote `"`, backslashes ×1/2/3/4, a newline, a tab, Persian, and a combo of
all of them. Each candidate sends this same payload; the table shows PASS/FAIL **per
class** so you see exactly which characters a candidate mangles.

## The candidate escapings (in `src/escape-candidates.ts` — add your own)

| id                                 | escaping of the JSON data arg                                         |
| ---------------------------------- | --------------------------------------------------------------------- |
| `raw-json`                         | none (control — inner quotes break the token)                         |
| `quotes-only`                      | `"`→`\"` only (the failed #245 rule — control)                        |
| `backslash-quote`                  | `\`→`\\`, `"`→`\"` (original double-escape — control)                 |
| `structural-quotes-only`           | escape only bare structural `"`; keep JSON’s `\`-escapes              |
| `quotes-only+uXXXX-controls`       | quotes-only + control chars as `\uXXXX` (pre-compensate `\n`→newline) |
| `backslash-quote+uXXXX-controls`   | double-escape + control chars as `\uXXXX`                             |
| `structural-quotes+uXXXX-controls` | structural-quote-only + control chars as `\uXXXX`                     |

## Run it

```bash
pnpm --filter @cg/caspar-amcp-probe build       # once

# Same machine as CasparCG:
node tools/caspar-amcp-probe/bin/caspar-amcp-probe.mjs --sweep --caspar-host 127.0.0.1

# CasparCG on another box (it must reach THIS machine for the probe):
node tools/caspar-amcp-probe/bin/caspar-amcp-probe.mjs --sweep \
  --caspar-host 192.168.1.50 --caspar-port 5250 \
  --serve-host 192.168.1.10            # <- THIS machine's IP, as CasparCG sees it
```

Same flags as the verb sweep (`--channel/--layer`, `--serve-host/--serve-port`,
`--settle-ms`, `--load-wait-ms`, `--update-wait-ms`, `--out`) plus `--flash-layer`
(default 0). Writes `<prefix>.results.json` + `<prefix>.wire.ndjson`.

### Reading the matrix

The harness prints a row per candidate with columns: `fire` (window.update fired),
`parse` (the template’s own `JSON.parse` succeeded — the exact on-air failure mode),
`bytes` (received === `JSON.stringify(payload)`), then a `✓`/`✗` per character class
(`"`, `\1`–`\4`, `NL`, `TAB`, `FA`, `MIX`), then `ALL`. **The single candidate with
`ALL = PASS` is the canonical rule.** If none pass, add candidates and re-run; if
several pass, pick the simplest.

## Recording the result — paste here, then I lock it in

> CasparCG build: `__________` · date: `__________` · operator: `__________`

| candidate                          | fire | parse | bytes | `"` | `\1` | `\2` | `\3` | `\4` | NL  | TAB | FA  | MIX | ALL |
| ---------------------------------- | ---- | ----- | ----- | --- | ---- | ---- | ---- | ---- | --- | --- | --- | --- | --- |
| `raw-json`                         |      |       |       |     |      |      |      |      |     |     |     |     |     |
| `quotes-only`                      |      |       |       |     |      |      |      |      |     |     |     |     |     |
| `backslash-quote`                  |      |       |       |     |      |      |      |      |     |     |     |     |     |
| `structural-quotes-only`           |      |       |       |     |      |      |      |      |     |     |     |     |     |
| `quotes-only+uXXXX-controls`       |      |       |       |     |      |      |      |      |     |     |     |     |     |
| `backslash-quote+uXXXX-controls`   |      |       |       |     |      |      |      |      |     |     |     |     |     |
| `structural-quotes+uXXXX-controls` |      |       |       |     |      |      |      |      |     |     |     |     |     |

**Winning escaping (the canonical rule):** `____________________________________`

Tell me the winning candidate id. The follow-up change (`fix-amcp-escaping-v2`) then
locks exactly that escaping into the single canonical quoter
[`packages/caspar-client/src/amcp/escape.ts`](../../packages/caspar-client/src/amcp/escape.ts),
re-points `tools/amcp-mock`’s decoder to the matching real-CasparCG rule (and makes
it reject raw control chars), adds the full matrix tests, and you hardware-validate
the whole app. **Until then, production `escape.ts` is unchanged.**

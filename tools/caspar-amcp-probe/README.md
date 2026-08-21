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

| id                                     | escaping of the JSON data arg                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `raw-json`                             | none (control — inner quotes break the token)                                                                                           |
| `quotes-only`                          | `"`→`\"` only (the failed #245 rule — control)                                                                                          |
| `backslash-quote`                      | `\`→`\\`, `"`→`\"` (original double-escape — control)                                                                                   |
| `structural-quotes-only`               | escape only bare structural `"`; keep JSON’s `\`-escapes                                                                                |
| `quotes-only+uXXXX-controls`           | quotes-only + control chars as `\uXXXX` (pre-compensate `\n`→newline)                                                                   |
| `backslash-quote+uXXXX-controls`       | double-escape + control chars as `\uXXXX`                                                                                               |
| `structural-quotes+uXXXX-controls`     | structural-quote-only + control chars as `\uXXXX`                                                                                       |
| `js-escape+amcp-escape`                | double every `\` (JS-literal layer), then AMCP `\`→`\\`, `"`→`\"` — net: each JSON `\` → 4 wire `\` (predicted winner, two-layer model) |
| `js-escape+amcp-escape+uXXXX-controls` | same, with JSON control escapes pre-encoded `\uXXXX` first (robustness variant)                                                         |

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

One filled table per swept build. All prior evidence and the production box are
**2.3.2**, so the **canonical rule comes ONLY from a 2.3.x pass**; results from any
other build are provisional.

### Pass 1 — CasparCG build: `2.5.0 69e8ad5 Stable` · date: `2026-07-07` · operator: `yasere`

| candidate                              | fire | parse | bytes | `"` | `\1` | `\2` | `\3` | `\4` | NL  | TAB | FA  | MIX | ALL      |
| -------------------------------------- | ---- | ----- | ----- | --- | ---- | ---- | ---- | ---- | --- | --- | --- | --- | -------- |
| `raw-json`                             | YES  | no    | no    | ✗   | ✗    | ✗    | ✗    | ✗    | ✗   | ✗   | ✗   | ✗   | fail     |
| `quotes-only`                          | no   | no    | no    | ✗   | ✗    | ✗    | ✗    | ✗    | ✗   | ✗   | ✗   | ✗   | fail     |
| `backslash-quote`                      | no   | no    | no    | ✗   | ✗    | ✗    | ✗    | ✗    | ✗   | ✗   | ✗   | ✗   | fail     |
| `structural-quotes-only`               | no   | no    | no    | ✗   | ✗    | ✗    | ✗    | ✗    | ✗   | ✗   | ✗   | ✗   | fail     |
| `quotes-only+uXXXX-controls`           | no   | no    | no    | ✗   | ✗    | ✗    | ✗    | ✗    | ✗   | ✗   | ✗   | ✗   | fail     |
| `backslash-quote+uXXXX-controls`       | no   | no    | no    | ✗   | ✗    | ✗    | ✗    | ✗    | ✗   | ✗   | ✗   | ✗   | fail     |
| `structural-quotes+uXXXX-controls`     | YES  | no    | no    | ✗   | ✗    | ✗    | ✗    | ✗    | ✗   | ✗   | ✗   | ✗   | fail     |
| `js-escape+amcp-escape`                | YES  | YES   | YES   | ✓   | ✓    | ✓    | ✓    | ✓    | ✓   | ✓   | ✓   | ✓   | **PASS** |
| `js-escape+amcp-escape+uXXXX-controls` | YES  | YES   | no    | ✓   | ✓    | ✓    | ✓    | ✓    | ✓   | ✓   | ✓   | ✓   | **PASS** |

**Provisional winner (build 2.5.0 — NOT canonical):** `js-escape+amcp-escape` — the
only byte-exact candidate (`bytes=YES`); the `+uXXXX-controls` variant passes all
classes but delivers the controls in their six-char `uXXXX` unicode-escape form
(equal after `JSON.parse`, not byte-exact). All 7 pre-existing candidates failed,
exactly as the two-layer model
predicts. Notable wire evidence: `structural-quotes+uXXXX-controls` was received as
`…New text000asecond text…` — the tokenizer DROPPED the unknown `\u` pair, and
`quotes-only`/`backslash-quote` never fired `window.update` at all (V8 script
SyntaxError — the DP1/DP2 signatures reproduced on this build).

### Pass 2 — CasparCG 2.3.x: DEFERRED (no 2.3.2 build available this session; the harness is ready to re-run)

**Winning escaping:** `js-escape+amcp-escape` — empirically confirmed on 2.5.0
(`69e8ad5`); **provisional for 2.3.2**, supported by the source-level finding that
`v2.3.x-lts` and `master` share byte-identical escape semantics in both layers; a
2.3.x hardware pass (sweep, or live special-char validation) remains the gate
before B-041 closes.

Tell me the winning candidate id. The follow-up change (`fix-amcp-escaping-v2`) then
locks exactly that escaping into the single canonical quoter
[`packages/caspar-client/src/amcp/escape.ts`](../../packages/caspar-client/src/amcp/escape.ts),
re-points `tools/amcp-mock`’s decoder to the matching real-CasparCG rule (and makes
it reject raw control chars), adds the full matrix tests, and you hardware-validate
the whole app. **Until then, production `escape.ts` is unchanged.**

---

# The live probes — `bin/live-probe-lib.mjs` + `bin/beacon-probe-lib.mjs`

Two committed harness halves, and one runner that uses both.

| File                         | What it is                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bin/live-probe-lib.mjs`     | the **AMCP** half — one command at a time, any non-`2xx` a hard failure, the 2.5.0 build asserted before every reading, and `PRINT` read back and decoded to RGBA (session AK)                   |
| `bin/beacon-probe-lib.mjs`   | the **PAGE** half — serves instrumented pages that beacon `ready` / `frame` / **`hb` (one per animation frame)** / `update`, timestamped at receipt so every delta shares one clock (session AR) |
| `bin/arrangement-probes.mjs` | the runnable multi-box **arrangement** readings, `design.md` §9.6                                                                                                                                |

🔴 **Why both halves are committed rather than rebuilt each time.** This project has now
reconstructed an AMCP harness from a prose description of the previous one **twice** — one
rule derived twice, in instrument form. And it carries a cost the usual duplication does
not: **a measurement whose instrument cannot be re-run cannot be re-verified.** Plant
readings are among the most expensive artefacts here (plant access, a live channel, an
owner's time), so the instrument lives beside the numbers it produced.

## The control discipline is in the code, not in the reader's memory

- **`assertAlive(harness, id)` THROWS** rather than returning false. A negative observation
  is not a result: reading "no beacon" as "the page died" is only valid once the page has
  been proven to be beaconing, so a probe whose setup cannot be verified reports **VOID**,
  never a value.
- **`negativeControl(command, harness)`** fires a `CG ADD` at a URL the harness 404s and
  checks **three** things: the command was accepted, the plant **did fetch** the bad URL
  from us, and **no beacon fired**. Without the first two, "no beacon" is equally explained
  by a command that never landed or a plant that cannot reach us.
- **`assertProductionBuild`** refuses anything that is not 2.5.0. ⚠ A retired CasparCG
  **2.3.2** sits at `D:\programs\CasparCG` and must never be probed — pointing a probe at it
  and filing the answer as production is how a CEF-71 result becomes a 2.5.0 one.

## Running the arrangement probes

```bash
cd tools/caspar-amcp-probe
node bin/arrangement-probes.mjs cg-layer          # can two templates share one video layer?
node bin/arrangement-probes.mjs replace-gap       # what a template REPLACE costs, in frames
node bin/arrangement-probes.mjs loadbg            # does LOADBG pre-warm, and is the cut gapless?
node bin/arrangement-probes.mjs slots             # how many producers can a layer hold?
node bin/arrangement-probes.mjs cef               # engine version + clip-path interpolation
node bin/arrangement-probes.mjs frame-cost        # what the animated paths cost, isolated
node bin/arrangement-probes.mjs opacity           # does MIXER OPACITY take a duration + tween?
node bin/arrangement-probes.mjs mask-luminance    # the fade-the-mask's-luminance lead
```

Flags: `--host` (plant, default `192.168.21.50`), `--lan` (the address the plant must reach
this harness on, default `192.168.21.93`), `--channel`, `--layer` (default `150`; the page
probes use `layer + 1`).

⚠ **`--lan` must be an address the PLANT can reach**, not `localhost`. The pages are served
from this machine and fetched by the plant's CEF; if it cannot reach you, every probe VOIDs
at its first control — which is the correct outcome, not a bug.

Every run clears its layers afterwards and prints whether the channel came back clean.

## What they measured (2026-08-18, `2.5.0 69e8ad5`, channel 1 `1080i5000`)

Full numbers, controls and caveats are in
[`openspec/changes/multibox-layout-switch/design.md`](../../openspec/changes/multibox-layout-switch/design.md)
§9.6. The headlines:

- 🔴 **A video layer carries exactly ONE html page.** `CG ADD` at a different cg-layer is
  accepted (`202`) and **REPLACES** the page already there; both cg-layer indices then route
  to the survivor. **The cg-layer argument is inert.**
- A replace costs **2.95 frames** median. `LOADBG [HTML]` + `PLAY` removes that gap
  entirely — but a layer has **one** background slot, so only one announced alternative can
  be pre-warmed.
- The plant's CEF is **Chromium 142** and it **interpolates** `clip-path` — `path()`,
  `polygon()` and WAAPI alike.
- Animated cost, isolated: interpolating three plate holes **−4 %** of the frame budget;
  crossfading two full-frame backdrops **−10 %**; fading the **mask's luminance** **−3.4 %**.
- `MIXER … OPACITY` takes a duration and a tween with `FILL`'s exact vocabulary (`linear`
  accepted, `ease` and `cubic-bezier` `403`).

⚠ **No pixels in that session.** `PRINT` writes to the plant's own disk and no share was
readable, so `live-probe-lib.mjs`'s capture half went unused and every reading above is
command- or renderer-side. The `mask-luminance` transfer curve is read through an
**SVG-mask → canvas proxy** in the same engine, and is labelled as a proxy wherever it is
cited.

---

# The confidence-grab measurement kit — `bin/confidence-probe.mjs` (C-016 · C-023)

**For an installer at any station, not only the one this was written at.**

`C-016` (an operator PGM confidence view) requires that the capture mechanism's **cost on the
playout machine has been MEASURED on real hardware BEFORE the mechanism is fixed**. This is the
instrument that obtains those numbers. `C-023` (a confidence thumbnail per live source) rides the
same grab path deliberately rather than forking its own, so §3.4 below is its whole question.

It **chooses nothing and fixes nothing.** Every line it prints is a measurement or a verbatim
server reply.

## Why it is a committed tool rather than a session's scratch script

Owner constraint, 2026-08-21: _"This product is not only for one particular network. It may be sold
to different networks, each of which has different facilities."_ A station with a monitor wall and a
station with none are both targets, so the deliverable could not be "the answer for this plant". If
you are installing at a different box — different channel format, weaker playout machine — **run
this and get your own numbers**; do not inherit ours.

## Safety, because this runs against a machine that may be on air

- It **never `PLAY`s anything on the channel it is measuring.** A grab is a read.
- It **never sends a bare channel-wide `CLEAR`.** Every clear names a layer.
- §3.4 **refuses** to run without a `--probe-channel` that differs from `--channel`, because both
  of its paths `PLAY` a producer. No probe channel ⇒ that phase records itself SKIPPED with the
  reason. This is a branch in the code, not a rule you have to remember.

## 🔴 It does not know a grab verb, and that is the point

The verb is **discovered**: it asks the server (`VERSION`, then `HELP`), filters the server's own
enumeration for grab-shaped tokens, and tries **only tokens the server printed**, in their narrowest
form. If nothing matches, it emits a FINDING and stops.

**A build with no grab command is a real result for C-016.** Guessing an AMCP verb into a procedure
somebody pastes at a live plant is the worst available outcome, so this will not do it — and the
test suite pins that behaviour rather than trusting the comment.

The same discipline covers the **dropped-frame counter**: nothing here knows what one is called on
your build, so it captures `INFO` verbatim plus every OSC address your channel emits, before and
after each phase, and prints the addresses whose value **changed**. A counter gets found, not
assumed.

## Run it

```
pnpm --filter @cg/caspar-amcp-probe build
node tools\caspar-amcp-probe\bin\confidence-probe.mjs --help
```

```
node tools\caspar-amcp-probe\bin\confidence-probe.mjs --caspar-host 127.0.0.1 --caspar-port 5250 --channel 1 --probe-channel 2 --media-root "D:\casparcg\media" --out C:\cg-recon\confidence.json
```

| flag                  | meaning                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| `--channel`           | the channel to MEASURE, normally programme. Never played onto.              |
| `--probe-channel`     | a channel carrying NO air. Needed for the under-load case and for §3.4.     |
| `--route-from-layer`  | the air layer §3.4(a) routes FROM. Omit to skip that path.                  |
| `--input-arg`         | a producer argument for §3.4(b) — the physical input, opened a second time. |
| `--load-template-url` | an html URL to animate for the under-load case. Omit to skip it honestly.   |
| `--cadence-ms`        | default 300000. **Do not shorten it** — see below.                          |
| `--media-root`        | semicolon-separated dirs to look for the produced artifact in.              |
| `--out`               | where to write the machine-readable JSON.                                   |

## What each number means, and what a bad one implies

- **§3.1 ACCEPTED verb.** `NONE` means this build has no grab command the server will admit to.
  C-016 cannot be built on this box as specified; that is a finding, not a bug in the kit.
- **§3.2 latency, at rest vs under load.** How long one grab blocks. If the under-load figure is
  much worse than the at-rest one, a grab competes with rendering and the cadence bar is at risk.
- **§3.2 / §3.3 "OSC addresses that CHANGED".** This is where a dropped-frame counter shows up. **A
  counter that moves during a grab means the grab costs frames on air** — the thing C-016's
  RECON-FIRST clause exists to catch before a mechanism is chosen.
- **§3.3 first-half vs last-half latency, and whether a drop count GROWS.** This decides whether
  C-016's "~1 s" bar is affordable **at all**, which is why the default duration is five minutes.
  A cost that is flat for thirty seconds and climbs at four minutes is the failure mode a short run
  cannot see. **Shortening this measurement destroys its only purpose.**
- **§3.4(b) verdict.** Whether this hardware will open one physical input a SECOND time. It answers
  a question left open since session BM — and it decides whether the `live-source-duplicate`
  refusal is a **hardware fact** or a **policy choice**. A refusal here is as valuable as a success;
  record the verbatim reply either way.
- **§3.5 artifact.** Format, dimensions, bytes. ⚠ And a finding read from the code rather than
  measured: **the bridge's HTTP server has no filesystem root** — `template-http-server.ts` serves
  only `/template/<id>` from memory — so wherever the grab lands, C-016 needs a route that does not
  exist yet.

## The runbook

`docs/recon/2026-08-22-confidence-grab-measurement.md` is the form to fill in at the box, and it
carries two more sections this kit does not drive: the **2× discriminator** (§B) and the **AMCP
probes the repo already owes** (§C — `DEFER`/`COMMIT` scope, `PLAY`-on-occupied, the `CLIP`
intersection probe, and `B-155`'s frame count).

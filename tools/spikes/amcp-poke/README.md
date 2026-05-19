# AMCP Poke — driver for all spikes

A minimal TCP CLI to a CasparCG AMCP port. REPL mode plus a script-from-file mode for repeatable command sequences. Every line in either direction is logged to NDJSON.

## Files

- `amcp-poke.mjs` — the CLI. No dependencies.

## Usage

```pwsh
# Interactive REPL against localhost:5250
node tools/spikes/amcp-poke/amcp-poke.mjs

# Against a remote CasparCG
node tools/spikes/amcp-poke/amcp-poke.mjs --host caspar.lan --port 5250

# Replay a recorded session
node tools/spikes/amcp-poke/amcp-poke.mjs --script spike-b-sequence.txt

# Specify the log file
node tools/spikes/amcp-poke/amcp-poke.mjs --log C:\m1-captures\spike-b\amcp.ndjson

# Suppress logging
node tools/spikes/amcp-poke/amcp-poke.mjs --no-log
```

In REPL, type AMCP commands and Enter. Lines from the server are prefixed with `<`; lines you send are prefixed with `>`. Ctrl+C exits.

## Script files

Plain text, one command per line. Empty lines and `#`-prefixed comments are skipped. Commands are sent at 50 ms pacing so the log stays readable.

Example `spike-b-sequence.txt`:

```
# Spike B — exercise OSC events
VERSION
INFO

# Baseline: idle channel for 5s (no commands here; the *pause* between
# adjacent commands in REPL gives natural idle windows)

# Load + play
LOAD 1-10 [HTML] "file:///C:/code/cg/tools/spikes/frame-counter/index.html"
CG 1-10 PLAY 1

# Update
CG 1-10 INVOKE 1 "update" "{\"foo\":\"bar\"}"

# Stop + clear
CG 1-10 STOP 1
CLEAR 1-10
```

## NDJSON log shape

```json
{ "ts": "2026-05-19T15:42:13.412Z", "dir": "send", "line": "VERSION" }
{ "ts": "2026-05-19T15:42:13.420Z", "dir": "recv", "line": "201 VERSION OK" }
{ "ts": "2026-05-19T15:42:13.421Z", "dir": "recv", "line": "2.3.3.f207a33" }
```

`dir` is `send` for client → server, `recv` for server → client.

## AMCP escape rules

When passing JSON inside a `CG INVOKE` payload, escape both backslashes and inner double-quotes. The Phase 5 §3.2 rules are:

```
escape(s)  =  s.replaceAll('\\', '\\\\')
               .replaceAll('"',  '\\"')
               .replaceAll('\r', ' ')
               .replaceAll('\n', ' ')
quote(s)   =  '"' + escape(s) + '"'
```

In the REPL you type the already-escaped form (this CLI does not auto-escape — that's a deliberate spike choice; production caspar-client will).

Example for Spike D:

```
CG 1-20 INVOKE 1 "update" "{\"headline\":\"خبر فوری\"}"
```

The Persian content does not need additional escaping — UTF-8 bytes pass through TCP fine. Only `"` and `\` and CR/LF need escaping.

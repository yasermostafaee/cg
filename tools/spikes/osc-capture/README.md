# OSC Capture — Spike B

A UDP listener that decodes CasparCG OSC bundles and either prints them or appends them to NDJSON.

## Files

- `osc.mjs` — minimal OSC 1.0 parser. No dependencies.
- `osc-capture.mjs` — the listener. Uses Node's `dgram`.

## Usage

```pwsh
# Default — listen on 0.0.0.0:6250, print to stdout
node tools/spikes/osc-capture/osc-capture.mjs

# Different port (must match the <predefined-client> in casparcg.config)
node tools/spikes/osc-capture/osc-capture.mjs --port 6251

# Write NDJSON for later analysis or fixture replay
node tools/spikes/osc-capture/osc-capture.mjs --ndjson C:\m1-captures\spike-b\session.ndjson

# Only show one channel
node tools/spikes/osc-capture/osc-capture.mjs --filter /channel/1

# Headless (no stdout) — useful for long-running captures
node tools/spikes/osc-capture/osc-capture.mjs --silent --ndjson session.ndjson
```

Stop with Ctrl+C. NDJSON is appended on each line.

## NDJSON shape

One line per OSC address received. Bundles are flattened — a single bundle
containing N messages produces N lines.

```json
{
  "ts": "2026-05-19T15:42:13.412Z",
  "from": "192.168.1.50:51234",
  "address": "/channel/1/stage/layer/20/foreground/file/name",
  "args": ["AMB"]
}
```

- Big-ints serialize as `{ "$bigint": "12345" }`.
- Blobs serialize as `{ "$blob": "<base64>" }`.
- Infinities serialize as `{ "$inf": "+" }` or `"-"`.

## Verifying without CasparCG

The parser has no automated tests (this is throwaway spike code). To smoke-test
it against your own packet, you can build a minimal OSC message inline:

```js
// In node REPL:
const { parsePacket } = await import('./osc.mjs');
const buf = Buffer.from([
  0x2f,
  0x68,
  0x69,
  0x00, // "/hi\0"
  0x2c,
  0x69,
  0x00,
  0x00, // ",i\0\0"
  0x00,
  0x00,
  0x00,
  0x2a, // int32 42
]);
parsePacket(buf);
// → { kind: 'message', address: '/hi', args: [42] }
```

## What this exists for

Spike B observes CasparCG's actual OSC schema and compares against Phase 5 §4.1.
The findings go into ADR 0004 and the captured NDJSON becomes
`fixtures/osc-traces/m1-baseline.ndjson` for replaying against the M4
amcp-mock.

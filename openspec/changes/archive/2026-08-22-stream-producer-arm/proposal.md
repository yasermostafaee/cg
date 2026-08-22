# The `stream` producer arm — the catalog can SAY a live is a URL (C-025)

## Why

The owner proved by hand, on the plant, that `PLAY 1-<layer> "<url>"` plays an internet stream. The
product could not express it — and the shape of that "cannot" is the finding C-025 records: **the
gap was EXPRESSION, not capability.** The `media` arm already carried a URL to the wire unchanged
(`quote()` is the identity for every character a URL contains), so typing a URL into "Media file"
produced exactly the proven command. What was missing was the labelling (nobody discovers the
workaround, and a second operator cannot tell a clip from a feed), the validation (nothing checked a
URL, so a mistyped one was refused BY CASPARCG, AT TAKE, ON AIR — the exact failure the producer
union's own docstring exists to prevent), and the refusal an operator can act on.

## What Changes

- A fifth arm on `SourceProducerSchema`: `{ kind: 'stream', url }`. Its own arm, NOT an extension of
  `media` — `media` is "the one producer that needs no signal" and a stream is its opposite (owner
  decision, C-025).
- A scheme allowlist of exactly nine — `http` `https` `rtmp` `rtmps` `rtsp` `srt` `udp` `rtp`
  `mms` — stated as WHAT THE CLIENT REQUIRES THE PRODUCT TO ACCEPT, never as a claim about CasparCG
  or ffmpeg capability. Enforced ONCE, in `validateSourceCatalog` (`@cg/shared-ipc`), so the bridge
  (at LOAD and at every CHANGE) and the offline mock refuse identically, with the new named code
  `stream-scheme-not-allowed` and an operator sentence keyed off the shared reason union.
- The bridge case: `producerArgument` emits the URL quoted, exactly as `media` is — the proven
  command byte-exact. The method's doc records this arm's standing honestly: one manual run on the
  plant, not a suite.
- `canHoldLivePlate` answers `true` for a stream: a continuous signal with no timeline to run out.
  That a held stream can drop meanwhile is B-086's axis and out of scope.
- The Sources modal's fifth kind: labelled `Internet stream (URL)`, placed with the signal-bearing
  producers (`media` stays last as the odd one out), rendering a URL field whose default passes the
  allowlist.
- v1 scope is "type a URL and it plays". OUT: reconnect, stall detection, stream health, any
  modelling of alive-but-stalled, and any required aspect field — a stream usually states no
  `format`, so `sourceAspect()` falls through to the explicit `aspect` and then `null`, the same
  branch `AUTO` lands on (pinned by test).

## Impact

- Affected specs: `runtime-live-source-routing` (ADDED requirement)
- Affected code: `packages/shared-ipc/src/channels/sources.ts`,
  `tools/caspar-bridge/src/command-builder.ts`, `tools/caspar-bridge/src/live-plate-release.ts`,
  `apps/runtime/src/renderer/features/sources/SourcesModal.tsx`,
  `apps/runtime/src/renderer/ui/sourcesReasonMessage.ts`
- ⚠ `@cg/shared-ipc` changes shape, so every dependent workspace rebuilds; the wire contract change
  is ADDITIVE (a new union arm and a new refusal code) — every persisted catalog still parses,
  confirmed by the untouched pre-existing parse tests staying green.

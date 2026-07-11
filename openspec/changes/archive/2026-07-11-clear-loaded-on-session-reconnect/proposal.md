# Clear producer-existence bookkeeping on AMCP session reconnect (B-054)

## Why

`CasparRuntime.#loaded` — the B-039 bookkeeping that decides whether a take
sends a bare `CG PLAY` or a re-loading `CG ADD` + `CG PLAY` — is
process-lifetime memory. It is cleared by `out()`/`remove()` (and, since
R-010, by a `setConfig` rebuild), but **no AMCP session reconnect touches
it**. When CasparCG itself restarts (the inverse amnesia of B-048: there the
bridge forgot the server; here the server forgets and the bridge's memory
becomes a lie), the `ServerSession` quietly reconnects to healthy, `#loaded`
still holds the itemId, and the next Take sends a bare `CG PLAY` onto the
restarted server's empty layer. Real CasparCG blind-acks `202` and renders
nothing — a blank take on air. Full mechanism with file:line in `design.md`.

## What Changes

- `CasparRuntime.#wireAdapter` subscribes to each declared session's
  `'healthy'` event (emitted only on completion of a full reconnect cycle —
  never on degraded→healthy OSC recovery) and **wholesale-clears `#loaded`**:
  a session that just completed a connect cycle is a server whose producer
  set the bridge cannot vouch for. The next take then re-verifies via the
  existing B-039 re-ADD branch (`CG ADD` then `CG PLAY`) and renders.
- Wholesale (not per-session) because commands fan out to every declared
  server: the re-ADD heals whichever side lost its producers and benignly
  stage-replaces on a side that kept them — per-server precision would have
  to re-ADD in exactly the same cases (see `design.md` §2).
- `#adopted` is deliberately **not** cleared: a restarted server's layers
  are empty, so the skipped adopt-CLEAR is a guaranteed no-op (see
  `design.md` §1).
- The subscription lives in `#wireAdapter` (survives `setConfig` rewiring
  and failover), tears down by object abandonment like every other session
  listener, and carries a staleness guard so a torn-down era's session can
  never touch current bookkeeping.
- The reconnect itself sends **zero** AMCP commands; the only behavior
  change is the verb choice of the next explicit operator take. B-044
  settle semantics, reconnect-reconciliation's WS-keyed re-delivery, and
  the R-009/R-010 machinery are untouched (non-interference proofs in
  `design.md` §3).

## Capabilities

Extends `runtime-caspar-bridge` with an **ADDED** requirement (session
reconnect invalidates producer-existence bookkeeping). Deliberately not a
`MODIFIED` of "Playout verbs are chosen from producer state" — that
requirement's verb-choice rule is unchanged, and its delta is owned by the
held `reconnect-reconciliation` change (archive-ordering hygiene,
`design.md` §6).

## Impact

- `tools/caspar-bridge/src/caspar-runtime.ts` — the subscription in
  `#wireAdapter` (a few lines).
- `tools/caspar-bridge/tests/` — new integration suite: the B-054 repro
  (CasparCG restart simulated as mock stop + re-create on the same ports →
  genuinely empty layers), the transient-blip case, the backup-only-restart
  wholesale-rule case, setConfig/failover survival, clean dispose.
- `packages/caspar-client/tests/` — one trigger-precision unit test:
  degraded→healthy recovery never emits `'healthy'`.
- No schema, wire-protocol, renderer, or `@cg/shared-ipc` changes. No new
  E2E (bridge-internal verb choice; not browser-drivable — an E2E cannot
  restart CasparCG).

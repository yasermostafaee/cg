# runtime-caspar-bridge (B-054 — session reconnect invalidates producer-existence bookkeeping)

## ADDED Requirements

### Requirement: Session reconnect invalidates producer-existence bookkeeping

The bridge SHALL treat a declared session's completion of an AMCP reconnect
cycle (connect → handshake → resync → healthy) as invalidating its
producer-existence bookkeeping (`#loaded`), wholesale across items: a server
that just completed a connect cycle may have restarted, and its producer set
can no longer be vouched for. The next take therefore re-verifies through
the prescriptive re-load path (`CG ADD` then `CG PLAY`) instead of trusting
process-lifetime memory and playing an empty layer. The invalidation itself
SHALL send no AMCP commands and SHALL NOT disturb anything on air; it only
changes the verb choice of the next explicit operator take. A
degraded→healthy recovery (OSC blip with the AMCP connection intact) SHALL
NOT invalidate. Adoption bookkeeping (`#adopted`) is NOT invalidated: a
restarted server's layers are empty, so a skipped adopt-CLEAR is a no-op by
construction. The subscription SHALL survive `setConfig` session rebuilds
and failover, and SHALL die with its session objects on teardown.

#### Scenario: Take after a CasparCG restart re-loads and renders

- **WHEN** an item is loaded and taken on air, CasparCG restarts (its layers
  now empty), the AMCP session reconnects to healthy on its own, and the
  operator takes the item again **THEN** the bridge issues a fresh `CG ADD`
  (re-load, served URL, reconciler-merged fields) before `CG PLAY`, and the
  layer renders (producer exists, on air) — never a bare `CG PLAY`
  blind-acked `202` onto the empty layer

#### Scenario: Adoption memory stays; the re-load is not re-adopted

- **WHEN** the post-restart take re-loads onto a layer this process already
  adopted **THEN** no adopt-`CLEAR` precedes the re-ADD (the restarted
  server's layers are empty; the skipped CLEAR is a no-op) and the re-ADD
  lands directly

#### Scenario: A transient AMCP blip stays on-air-safe

- **WHEN** the AMCP connection drops and reconnects while the same server
  keeps its producers (no restart) **THEN** the reconnect itself sends no
  AMCP commands beyond the session handshake and nothing on air changes
- **AND** the next take conservatively re-loads onto the item's own layer
  (stage-replacing its own producer with the same template and fields) and
  then plays — an extra `CG ADD`, never a blank take

#### Scenario: Any declared session's reconnect invalidates wholesale

- **WHEN** only the backup server of a mirror pair restarts while the
  primary keeps its producers and output **THEN** the next take re-loads
  through the fan-out — recreating the backup's lost producer and benignly
  stage-replacing the primary's — so the pair reconverges instead of
  silently diverging until a failover exposes the empty backup

#### Scenario: The invalidation survives reconfiguration and failover

- **WHEN** a `setConfig` rebuilds the sessions and the newly configured
  server later restarts and reconnects **THEN** the next take still
  re-loads before playing (the subscription is rewired with the sessions)
- **AND WHEN** a failover flips the current primary and a server restart
  follows **THEN** the next take still re-loads (failover replaces no
  session objects and needs no rewiring)
- **AND WHEN** the runtime is stopped **THEN** its sessions never reconnect
  or fire the invalidation again (teardown by session lifetime)

#### Scenario: OSC-degradation recovery does not invalidate

- **WHEN** a healthy session degrades on OSC silence and recovers without
  losing the AMCP connection **THEN** producer-existence bookkeeping is
  untouched and the next take plays without a re-load (the reconnect-cycle
  signal never fires on this path)

# Phase 5 — CasparCG Runtime Architecture

Inside the `CasparClient` box from Phase 2 §8. Contract and algorithm.

---

## 1. Component Zoom-In

```
                         ┌───────────────── CasparClient ─────────────────┐
                         │                                                │
   Runtime State ◄──────►│  Reconciler                                    │
   Machine               │     ▲                                          │
                         │     │ events                                   │
                         │     ▼                                          │
                         │  EventBus  ◄──────────────────────────────────┐│
                         │     ▲                                         ││
                         │     │                                         ││
                         │  LayerManager        HeartbeatService         ││
                         │     ▲                       ▲                 ││
                         │     │ allocations           │ pings            │
                         │     │                       │                  ││
   intents/commands ──►  │  RedundancyAdapter ────────┴──────┐           ││
                         │   (mirror|async|journal)            │           ││
                         │     │                               │           ││
                         │     ▼                               ▼           ││
                         │  ServerSession[PRIMARY]   ServerSession[BACKUP]││
                         │     │   ▲                    │   ▲              ││
                         │     │   │                    │   │              ││
                         │  AMCP  OSC               AMCP  OSC              ││
                         │  Tx    Rx                Tx    Rx               ││
                         │     │   ▲                  │   ▲                ││
                         └─────┼───┼──────────────────┼───┼────────────────┘│
                               ▼   │                  ▼   │                 │
                              TCP UDP                TCP UDP                │
                              :5250 :6250            :5250 :6250            │
                                                                            │
                            ◄────────────────── all events ─────────────────┘
                                                journal
```

Two **ServerSession** instances are symmetric. The **RedundancyAdapter** is the strategy layer above them. The **Reconciler** sees a single unified event stream.

---

## 2. ServerSession Lifecycle FSM

```
                ┌────────────────┐
        init  ──►│ DISCONNECTED   │◄─────────────────┐
                └───────┬────────┘                   │
                        │ connect()                  │ closed/error
                        ▼                            │
                ┌────────────────┐                   │
                │  CONNECTING    │───── fail ────────┤
                └───────┬────────┘                   │
                        │ TCP open + VERSION ok      │
                        ▼                            │
                ┌────────────────┐                   │
                │  HANDSHAKING   │───── fail ────────┤
                │  (INFO query)  │                   │
                └───────┬────────┘                   │
                        │ INFO parsed                │
                        ▼                            │
                ┌────────────────┐                   │
        ┌─────►│   HEALTHY      │                   │
        │      └───────┬────────┘                   │
        │              │                            │
        │              │ OSC silence > 3s           │
        │              │ OR ping miss × 3           │
        │              ▼                            │
        │      ┌────────────────┐                   │
        │      │   DEGRADED     │── stays unhealthy ┤
        │      │ (cmd channel   │     > 10s         │
        │      │  may still ok) │                   │
        │      └───────┬────────┘                   │
        │              │ ping ok + OSC resumes      │
        │              ▼                            │
        │      ┌────────────────┐                   │
        └──────│  RESYNCING     │── fail ───────────┘
               │ (INFO + drain  │
               │  OSC for 2s)   │
               └────────────────┘
```

Re-entering `RESYNCING` after any reconnect is **mandatory** — the Reconciler cannot trust stale state.

**Reconnect backoff:** 250 ms → 500 ms → 1 s → 2 s → 4 s → cap 4 s. Each successful `HEALTHY` resets the clock.

---

## 3. AMCP Transport

### 3.1 Framing

- TCP, persistent connection, no TLS (CasparCG limitation).
- **Outbound:** UTF-8, terminated by `\r\n`. One command per line.
- **Inbound:** UTF-8. Three response shapes:
  - `<code> <command>\r\n` — single-line ack (codes 202, 400, 404, 500…)
  - `<code> <command> OK\r\n<data>\r\n` — single-data ack (codes 201)
  - `<code> <command> OK\r\n<line>\r\n…\r\n\r\n` — multi-line ack terminated by empty line (code 200)

### 3.2 Escaping

```
escape(s)  =  s.replaceAll('\\', '\\\\')
               .replaceAll('"',  '\\"')
               .replaceAll('\r', ' ')
               .replaceAll('\n', ' ')
quote(s)   =  '"' + escape(s) + '"'
```

The transport never sees an unquoted user value. Any unescaped quote → wire desync → connection reset.

### 3.3 Response code groups

| Code | Meaning                      | Reconciler treatment                                      |
| ---- | ---------------------------- | --------------------------------------------------------- |
| 200  | OK, multi-line data          | success + payload                                         |
| 201  | OK, one-line data            | success + payload                                         |
| 202  | OK, no data                  | success                                                   |
| 400  | Bad command                  | hard error; log; do not retry                             |
| 401  | Bad parameter                | hard error; log; do not retry                             |
| 402  | Missing parameter            | hard error; log; do not retry                             |
| 403  | Forbidden                    | hard error                                                |
| 404  | Resource not found           | soft error; depends on command (CLEAR on empty slot = ok) |
| 500  | Internal server error        | retry once; if persists → escalate to failover            |
| 501  | Internal server error (data) | retry once                                                |
| 502  | Resource unavailable         | back off 500 ms; retry up to 3×                           |
| 503  | Insufficient                 | hard error                                                |

**The Reconciler never sees raw codes.** ServerSession maps codes → typed `AmcpAck` events (see Phase 3 §7).

---

## 4. OSC Transport

CasparCG **pushes** OSC; there is no `/subscribe` handshake. The session opens a UDP socket on the configured port and filters by address.

### 4.1 Subscriptions of interest

```
/channel/{ch}/framerate                                       (once at handshake)
/channel/{ch}/stage/layer/{l}/foreground/file/name            (PLAY confirmation)
/channel/{ch}/stage/layer/{l}/foreground/file/frame           (rate-limited; sampled)
/channel/{ch}/stage/layer/{l}/foreground/producer/name        (HTML/etc identification)
/channel/{ch}/stage/layer/{l}/background/producer/name        (next-up tracking)
/channel/{ch}/output/consumer/{i}/dropped-frame               (health)
/channel/{ch}/profiler/time                                   (sampled; used for clock skew)
```

### 4.2 Filtering rules

- **Interest set** = `{ (channel, layer) | LayerManager.isAllocated((channel,layer)) }` ∪ pinned slots.
- Out-of-interest packets are counted (drop counter, for diagnostics) and discarded.
- `frame` and `profiler/time` are **rate-limited** to ≤10 Hz in the EventBus. The wire rate is much higher; lifting it all the way to the Reconciler is unnecessary.

### 4.3 Bundle handling

CasparCG batches OSC into bundles. A bundle is processed **atomically** — all addresses in one bundle become one synchronous burst into the EventBus, with the same `recvAt` timestamp. This avoids partial-state races where one address says "playing" and the next bundle (1 ms later) says "empty".

### 4.4 Health derivation

OSC is the heartbeat for "_is the channel rendering?_":

- Any address under `/channel/{ch}/...` within 3 s → channel healthy.
- Silence > 3 s → `DEGRADED`.
- Silence > 10 s → consider channel down (failover candidate).

AMCP `VERSION` pings cover "_is the command channel reachable?_". Two-axis health (see §9).

---

## 5. Command Queue

Per ServerSession, a **single ordered queue** of pending commands.

### 5.1 Structure

```ts
type QueueEntry = {
  seq: number; // monotonically increasing per session
  cmd: AmcpLine; // already-quoted, ready to write
  priority: 'urgent' | 'normal' | 'low'; // urgent jumps the queue
  enqueuedAt: number; // ms; for timeout & telemetry
  timeoutMs: number; // default 2000; can be overridden
  expectAck: boolean; // PLAY/CG INVOKE always true; INFO true; CLEAR true
  cancel?: AbortSignal; // operator-triggered intents can be aborted
  resolve: (ack: AmcpAck) => void;
  reject: (err: Error) => void;
};
```

### 5.2 Priority

- **urgent:** `CLEAR`, `CG STOP`, `CG REMOVE` — air-safety commands. Always inserted at head.
- **normal:** `PLAY`, `CG ADD`, `CG INVOKE`, `LOAD`. FIFO.
- **low:** `INFO`, `VERSION` (when not heartbeat), telemetry. Yield to anything else.

`VERSION` issued by `HeartbeatService` is **urgent** so it can't be starved by a long INFO.

### 5.3 Pipelining

AMCP responses are ordered. The session pipelines up to **N=4** in-flight commands; the Nth+1 waits.

Pipelining is **disabled** while in `RESYNCING` (one-at-a-time, deterministic).

### 5.4 Timeout & retry policy

| Command class         | Default timeout | Retry policy on timeout                    |
| --------------------- | --------------- | ------------------------------------------ |
| `PLAY ... [HTML]`     | 5 s             | 1 retry, then fail                         |
| `CG INVOKE update`    | 2 s             | 1 retry, then fail; state flips to `error` |
| `CG STOP`, `CLEAR`    | 2 s             | 3 retries (air-safety) — keep trying       |
| `CG REMOVE`           | 2 s             | 3 retries                                  |
| `VERSION` (heartbeat) | 1 s             | no retry; counts toward miss budget        |
| `INFO`                | 3 s             | 1 retry, then `RESYNCING` fails            |

### 5.5 Backpressure

If queue depth > 50, the RedundancyAdapter raises `caspar.backpressure` and the Runtime UI shows a warning. Likely cause: server stuck or network drop. Reaching depth 200 triggers failover.

---

## 6. LayerManager (slot allocator)

CasparCG's coordinate space is `(channel, layer)`. Channels are global; layers within a channel render bottom-up. Two graphics on the same `(ch, layer)` overwrite each other.

### 6.1 Policy

Layers are partitioned by **template type** to prevent operator collisions:

| Type             | Layer range | Notes                                |
| ---------------- | ----------- | ------------------------------------ |
| Logo bug         | 90 – 99     | Pinned; rarely allocated dynamically |
| Lower third      | 10 – 19     | One at a time per type by default    |
| Ticker / crawler | 20 – 29     | One at a time                        |
| Breaking news    | 30 – 39     | Top of stack                         |
| Fullscreen       | 50 – 59     | Above lower third, below breaking    |
| Custom           | 60 – 69     | Operator-assigned                    |

Ranges are **configurable per deployment**. Defaults above are sane.

### 6.2 Allocation

```
allocate(templateType, channel) → LayerSlot:
  range = policy[templateType]
  for layer in range:
    if not occupied(channel, layer) and not pendingAllocation(channel, layer):
      mark pendingAllocation
      return { channel, layer, server: 'both' }
  throw OutOfLayers

deallocate(slot):
  on OSC: layer.empty(slot.channel, slot.layer) → release
  with safety timeout (5 s after CG STOP) → release with warning
```

### 6.3 Collision detection

If `LayerManager` believes a slot is free but OSC reports `foreground/file/name` non-empty on that slot, raise `caspar.collision` and quarantine the slot. The Runtime UI surfaces the conflict and offers "take ownership" (issue `CLEAR`).

### 6.4 Pinning

Always-on graphics (network logo bug) are **pinned** in config:

```yaml
pinned:
  - templateId: 'net-logo-bug'
    channel: 1
    layer: 95
    autoStart: true # play at Runtime startup, after CasparCG reachable
```

Pinned slots survive operator stack changes; only an explicit "pin off" removes them.

---

## 7. RedundancyAdapter

Three strategies, one interface. Choice is **deployment-time configuration**.

### 7.1 Interface (consumed by Reconciler)

```ts
interface RedundancyAdapter {
  send(cmd: AmcpLine, target: 'primary' | 'backup' | 'both', opts): Promise<AmcpAck>;
  on(event: 'osc' | 'health' | 'failover' | 'collision', cb): Unsubscribe;
  failover(reason: 'manual' | 'auto'): Promise<void>;
  currentPrimary: 'A' | 'B'; // which physical server is "live"
}
```

### 7.2 Strategy A — `mirror-sync`

Default for the v1 defaults (single station, both servers up).

```
send(cmd, target='both'):
  p1 = sessionA.send(cmd)
  p2 = sessionB.send(cmd)
  ack = await Promise.allSettled([p1, p2])
  if both ok                    → return ackA
  if A ok, B fail               → log; raise 'backup.degraded'; return ackA
  if A fail, B ok               → raise 'primary.failed'; auto-failover; return ackB
  if both fail                  → raise 'cluster.failed'; throw
```

**Pros:** simplest reasoning, lowest split-brain risk.
**Cons:** slowest command path (limited by slower server); both must be reachable.

### 7.3 Strategy B — `mirror-async`

```
send(cmd, target='both'):
  ackA = await sessionA.send(cmd)
  journal.append(cmd, seq)
  fire-and-forget: sessionB.send(cmd).then(ackB =>
    if ackA.ok != ackB.ok → raise 'mirror.divergence'
  )
  return ackA
```

**Pros:** primary latency unaffected by backup.
**Cons:** backup may lag; failover replays from journal.

### 7.4 Strategy C — `journal-replay`

```
send(cmd, target='primary'):
  ack = await sessionA.send(cmd)
  journal.append(cmd, seq)
  return ack

# backup runs cold (no commands sent in steady state)
# on failover:
  rewind journal to last confirmed-on-air snapshot
  replay all commands to sessionB
  swap currentPrimary = 'B'
```

**Pros:** cheapest in steady state.
**Cons:** failover takes seconds — **not recommended** unless genlock and clean-feed routing handle the gap downstream.

### 7.5 Failover trigger

Auto trigger requires **any** of:

- OSC silence on current primary > 3 s
- AMCP ping miss × 3 (≈ 3 s)
- 3 consecutive command timeouts on current primary
- AMCP code 5xx > 5 occurrences within 30 s

Operator can trigger manually at any time. Auto-failover can be **disabled** in config (some stations prefer human-in-the-loop).

### 7.6 Failover sequence

```
1. raise 'failover.requested' { reason, fromServer: 'A', toServer: 'B' }
2. snapshot current intent state from Reconciler
3. mark currentPrimary = 'B'
4. for each active stack item in snapshot:
     if B already in sync (mirror-sync)   → no-op
     if B may be lagging (mirror-async)   → drain journal tail → B
     if B was cold (journal-replay)       → full replay from last on-air snapshot
5. raise 'failover.complete' (audit, UI banner, tally.emit)
6. start probing A in background; once healthy, remain on B but mark A as standby
```

The **clean-feed switch at the vision mixer** is _not_ the Runtime's job. The Runtime only ensures B is command-coherent.

### 7.7 Split-brain

After both servers recover from a network blip, they may disagree on layer occupancy.

```
detect: for each allocated slot, compare OSC truth from A vs B:
  if disagree for > 1 s after recovery:
    raise 'split-brain'
    truth = journal-derived (intent-side wins)
    issue corrective AMCP to the diverging server:
        if it has extra content   → CLEAR
        if it lacks content       → PLAY [HTML] + CG INVOKE + CG PLAY (from journal)
    audit each correction
```

Journal is **append-only**, kept in WAL'd SQLite, capped at 7 days rolling.

---

## 8. Reconciler

The Reconciler is the only thing the Runtime UI talks to. It produces `StackItemState` (Phase 3 §7) for every stack item.

### 8.1 Inputs (event union)

```ts
type ReconcilerInput =
  | { kind: 'intent'; intent: Intent; intentSeq: number; at: number }
  | { kind: 'amcp.ack'; seq: number; ack: AmcpAck; at: number }
  | { kind: 'osc'; event: OscEvent; at: number }
  | { kind: 'health'; server: 'A' | 'B'; healthy: boolean; at: number }
  | { kind: 'failover'; from: 'A' | 'B'; to: 'A' | 'B'; at: number }
  | { kind: 'collision'; slot: LayerSlot; at: number };
```

### 8.2 Per-item state

```ts
type ItemReconcileState = {
  itemId: Id;
  templateId: Id;
  fields: FieldValues;
  fieldsHash: string;

  intentStatus: StackItemState['status']; // what operator wants
  ackedStatus?: StackItemState['status']; // what AMCP confirmed
  truthStatus?: StackItemState['status']; // what OSC reports

  slot?: LayerSlot;
  lastIntentSeq?: number;
  lastAckAt?: number;
  lastOscAt?: number;

  pendingSince?: number; // when intent flipped without truth catching up
};
```

### 8.3 Merge rule

```
reconciled.status =
  if truthStatus exists and (now - lastOscAt) < 1000 → truthStatus
  else if ackedStatus exists                          → ackedStatus
  else                                                 → intentStatus

reconciled.pending =
  intentStatus != reconciled.status

if pending and (now - pendingSince) > 1000:
  raise 'item.divergent' { itemId, intent, truth }
  UI badge: warning
```

### 8.4 Optimistic UI window

- Operator clicks TAKE → `intentStatus = 'playing'`, UI flips instantly.
- AMCP ack arrives (~10–50 ms) → `ackedStatus = 'playing'`.
- OSC `cg.invoked` (~50–150 ms) → `truthStatus = 'on-air'`. UI flips status indicator from "pending" to "live".

Total perceived latency: < 100 ms with confirmation tick. If OSC truth never arrives, UI surfaces a warning within 1 s.

### 8.5 Resync algorithm

```
1. Suspend new intents (queue them).
2. Issue INFO to learn channel topology.
3. Open OSC drain window for 2 s, collect bundles.
4. For every allocated slot, derive truthStatus from observed addresses.
5. Diff truthStatus vs Reconciler.intentStatus:
     - truth says playing, intent says idle    → adopt truth, raise 'unexpected.onair'
     - truth says idle,    intent says on-air  → operator intent lost; re-issue from journal
6. Drain queued intents in order, with normal pipelining.
```

---

## 9. HeartbeatService & health model

Two-axis health per server:

|                    | OSC fresh (<3s)             | OSC stale (>3s)           |
| ------------------ | --------------------------- | ------------------------- |
| **AMCP ping ok**   | HEALTHY                     | DEGRADED (feedback lost)  |
| **AMCP ping fail** | DEGRADED (cmd channel lost) | DOWN (failover candidate) |

- AMCP `VERSION` ping every **2 s** (urgent priority).
- OSC silence threshold **3 s** for DEGRADED, **10 s** for DOWN.
- 3 consecutive ping misses (~6 s) downgrades AMCP axis to fail.
- TCP `SO_KEEPALIVE` enabled (15 s idle, 5 s interval, 3 probes) — OS-level backstop.

Health badges in the UI distinguish _command channel_ vs _feedback channel_ so operators know whether to expect new commands to land vs whether to trust the displayed state.

---

## 10. Failure Matrix

| Symptom                   | Detection                                          | First response                         | If persists                                           |
| ------------------------- | -------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| AMCP TCP reset            | socket close                                       | enter `CONNECTING`, backoff reconnect  | after 30s of failure: alarm                           |
| AMCP code 500 once        | response parse                                     | retry once                             | escalate to failover if recurring                     |
| AMCP timeout single       | per-cmd timer                                      | retry once (per §5.4)                  | mark cmd failed; UI error                             |
| OSC silence 3 s           | scheduler tick                                     | mark DEGRADED                          | failover after 10 s                                   |
| Split-brain on recovery   | diff A vs B truth                                  | journal-corrective sends               | manual override available                             |
| Layer collision           | OSC says occupied, allocator says free             | raise alarm; allow take-over           | quarantine slot                                       |
| Backpressure (queue > 50) | queue depth check                                  | UI warning                             | failover at depth 200                                 |
| Frame-rate mismatch       | OSC `/channel/n/framerate` vs `template.frameRate` | warn at ingest, log at play            | not a failure — operator decides                      |
| OSC bundle out-of-order   | OSC timestamp comparison                           | log; trust packet recv order           | telemetry only                                        |
| Both servers down         | both sessions in DOWN                              | UI red banner; intents queued          | operator informed; queued intents drained on recovery |
| Audit log write fails     | audit write returns err                            | retry to local file; flag audit health | UNC unreachable → local-only mode                     |

---

## 11. What this phase deliberately does not specify

- **Concrete language/library choices** for the AMCP/OSC parser (`@cg/caspar-client` will likely use Node `net` and `dgram` directly; pinned in Phase 9).
- **Persistence schema for the journal** (a SQLite WAL'd table, columns proposed in Phase 6 with the rest of operator-facing state).
- **OSC schema variations across CasparCG minor versions** — Phase 9 will include a _capability probe_ at handshake that records observed addresses and adapts.
- **TLS / authentication for AMCP** — there is none; this is a deployment requirement (network segmentation), already documented.

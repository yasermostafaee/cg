# Phase 2 — System Architecture

## 0. Defaults adopted

| #   | Question           | Default chosen                                                                | Why                                                 |
| --- | ------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Topology           | Single station, 1 Runtime workstation, 1 CasparCG cluster (primary + backup)  | Smallest credible production deployment             |
| 2   | Failover           | Command-mirroring hot standby; auto-failover on heartbeat loss; manual switch | Genlock not assumed; safe default                   |
| 3   | Workflow           | Direct-take **and** PVW→PGM; operator picks per-stack-item                    | Covers news (direct) and live shows (PVW)           |
| 4   | Hardware surfaces  | Out of v1; designed-in via a control-surface adapter port                     | Defer cost; don't paint into corner                 |
| 5   | Frame rate / color | 1080i50 + 1080p25 as project presets; BT.709; straight alpha                  | Persian-speaking regions are PAL/EBU                |
| 6   | CasparCG version   | 2.3.x LTS (modern CEF)                                                        | Modern CSS, OSC stable, widely deployed             |
| 7   | Fonts              | Bundle **Vazirmatn** + **Noto Sans/Arabic** + **Noto Color Emoji**            | Open licenses, broad coverage                       |
| 8   | Roles / audit      | Single-user v1; **audit log always on**                                       | Audit is cheap to add later only if designed in now |
| 9   | Distribution       | Designer on desk, Runtime on dedicated playout box, same LAN                  | Mirrors how real stations run                       |
| 10  | Ticker data        | File + REST polling v1; RSS/MQTT later                                        | Two source types cover 90% of use                   |

Everything below assumes the above. None of it is hard-coded; each is a configuration concern.

---

## 1. System Topology

```
   ┌──────────────────────────┐         ┌─────────────────────────────┐
   │ Designer Workstation     │         │  Playout Workstation        │
   │  (operator desk)         │         │  (rack / control room)      │
   │                          │         │                             │
   │  ┌────────────────────┐  │   LAN   │  ┌───────────────────────┐  │
   │  │  Designer (Electron)│ │ ─────── │  │ Runtime (Electron)    │  │
   │  │  React + iframe     │ │  .vcg   │  │ React + state machine │  │
   │  │  editor             │ │  files  │  │                       │  │
   │  └────────┬────────────┘ │         │  └────┬──────────┬───────┘  │
   │           │              │         │       │ AMCP TCP │ OSC UDP  │
   │           ▼              │         │       │ :5250    │ :6250    │
   │  ┌────────────────────┐  │         │       ▼          ▼          │
   │  │ SQLite (templates) │  │         │  ┌────────────────────────┐ │
   │  └────────────────────┘  │         │  │  caspar-client         │ │
   └──────────────────────────┘         │  │  (primary + backup)    │ │
                                        │  └────┬───────────────┬───┘ │
                                        │       │               │     │
                                        └───────┼───────────────┼─────┘
                                                ▼               ▼
                                    ┌─────────────────┐ ┌─────────────────┐
                                    │ CasparCG PRIMARY│ │ CasparCG BACKUP │
                                    │ 2.3.x  CEF      │ │ 2.3.x  CEF      │
                                    │ SDI/NDI out     │ │ SDI/NDI out     │
                                    └─────────────────┘ └─────────────────┘
                                            │                  │
                                            └────── to vision mixer ───►
```

- **Shared template store**: a network folder (SMB) or shared SQLite-on-share is _not_ used. Designer exports `.vcg` to a watched directory on the Playout Workstation. Atomic file moves. Avoids file-locking pain.
- **No cross-machine RPC** between Designer and Runtime in v1. The file is the contract.

---

## 2. Process & Runtime Model (per app)

Both apps are Electron with the same hardening:

```
Electron Main (Node)            Renderer (Chromium, sandboxed)
─────────────────────           ───────────────────────────────
• window + lifecycle            • React 18
• file I/O, SQLite              • Zustand stores
• AMCP/OSC sockets (runtime)    • shadcn/ui
• .vcg pack/unpack              • iframe (designer) / status UI (runtime)
• audit log writer              • no Node access
• auto-update opt-out gate      • all I/O via preload bridge

       ▲ contextBridge IPC ▲
       └──────  typed  ─────┘
              channels
```

**IPC contracts are Zod-validated on both ends.** Renderer never touches `fs`, `net`, or `dgram`. `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.

**Designer-specific**: a third process — the **preview iframe** — loads `index.html` of the template-in-progress with a permissive CSP only for `data:` and the local asset dir. It exposes `window.cg = { play, update, stop }` for the editor to drive.

**Runtime-specific**: AMCP + OSC live in the Main process. The Renderer subscribes to a Zustand store mirrored over IPC. No raw sockets in the UI tier.

---

## 3. Data Flow (end-to-end)

```
DESIGNER                                   RUNTIME
────────                                   ───────
[scene graph] ── validate ──► .vcg ──┐    ┌── watch folder ── unpack ──► [template + assets]
   ▲                                 │    │                                    │
   │                                 ▼    ▼                                    ▼
[editor UI] ◄── iframe preview ─────[file]── audit/import ────────► [stack item registered]
                                                                              │
                                                                operator: TAKE / UPDATE / OUT
                                                                              │
                                                                              ▼
                                                                ┌─ AMCP CG ADD / UPDATE / STOP
                                                                │
                                                  state machine ┤
                                                                │
                                                                └─ OSC subscribe ◄── CasparCG
                                                                              │
                                                                              ▼
                                                                  [reconciled on-air state]
                                                                              │
                                                                              ▼
                                                                       UI + audit log
```

---

## 4. Network Protocols & Ports

| Channel     | Protocol             | Port (default) | Direction          | Purpose                            |
| ----------- | -------------------- | -------------- | ------------------ | ---------------------------------- |
| AMCP        | TCP, line-oriented   | 5250           | Runtime → CasparCG | Commands                           |
| OSC         | UDP                  | 6250           | CasparCG → Runtime | State, frame info, layer occupancy |
| Heartbeat   | TCP (AMCP `VERSION`) | 5250           | Runtime → CasparCG | Aliveness, every 2s                |
| Telemetry   | HTTPS                | 443            | Runtime → vendor   | Opt-out; air-gap mode disables     |
| Auto-update | HTTPS                | 443            | Both → vendor      | **Gated**: never during on-air     |

Security: AMCP is plaintext and unauthenticated by CasparCG design — **document VLAN isolation as a deployment requirement**, not a software fix.

---

## 5. On-Air State Machine (one instance per "stack item")

```
                ┌──────────┐  load(template,data)   ┌────────┐
                │   IDLE   │ ─────────────────────► │ LOADED │
                └──────────┘                        └───┬────┘
                       ▲                                │  take()
        remove()       │                                ▼
                       │                       ┌──────────────────┐
                       │      OSC: stopped     │     PLAYING      │
                       └──────────────────────┤  (entry anim)    │
                                              └────┬─────────────┘
                                                   │  OSC: on_air
                                                   ▼
                                       ┌─────────────────────────┐
                                       │      ON_AIR             │
                                       │  ┌──────────────────┐   │
                                       │  │ update(data) ──► │   │  (re-entrant; idempotent;
                                       │  │   UPDATING       │   │   merge-or-replace policy
                                       │  │   → ON_AIR       │   │   declared per template)
                                       │  └──────────────────┘   │
                                       └──┬──────────────────────┘
                                          │ out() / auto-out / cue-out
                                          ▼
                                   ┌─────────────────┐
                                   │   EXITING       │ (exit anim)
                                   └──┬──────────────┘
                                      │ OSC: cleared
                                      ▼
                                   ┌─────────┐
                                   │  IDLE   │
                                   └─────────┘

Out-of-band transitions from anywhere:
  • OSC: error            → ERROR (latched; operator must clear)
  • OSC: silence > 3s     → DISCONNECTED (UI red; auto-resync on reconnect)
  • backup_failover()     → mirrors all current state to backup channel
```

**Reconciliation rule:** operator intent → optimistic UI within 16ms; OSC truth overrides within 100ms of arrival; mismatch >1s = `WARNING` badge, audit-logged.

---

## 6. Redundancy Mechanism

Two CasparCG servers configured as a logical **Output Group**.

```
                                  ┌─ writeQueue ─► CasparCG PRIMARY (AMCP)
                                  │                  ▲
operator intent ─► state-machine ─┤                  │ OSC
                                  │                  │
                                  └─ writeQueue ─► CasparCG BACKUP  (AMCP)
                                                     ▲
                                                     │ OSC

Both queues share one command sequence. Backup runs in lockstep but its
SDI output is *cold* (vision mixer sees primary); on failover, mixer's
clean-feed routing switches to backup. The state-machine does not switch
the *mixer* — it only ensures both servers are command-coherent so the
backup is ready.
```

- **Failover trigger**: 3s OSC silence OR 3 consecutive AMCP timeouts on primary OR explicit operator click.
- **Action on failover**: emit `tally:failover` event (consumed by Tally adapter, post-v1) and surface a banner. Both servers continue receiving commands; only the _labeled_ one changes.
- **Split-brain**: if both servers come back healthy but report divergent layer occupancy, the **state-machine intent journal** is the source of truth — replay the missing commands to the lagging server.

---

## 7. Security Boundaries

| Boundary                       | Threat                               | Control                                                                                      |
| ------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Renderer ↔ Main IPC            | Malicious template / supply-chain JS | `contextIsolation`, sandbox, Zod IPC schemas, allowlist channels                             |
| Template HTML in editor iframe | XSS / data exfil to LAN              | CSP `default-src 'none'; script-src 'self' 'unsafe-eval'; img-src data: file:`, no `network` |
| Template HTML on CasparCG      | Same                                 | Same CSP shipped in `index.html`; documented                                                 |
| `.vcg` import                  | Tampered zip                         | Schema validation + optional Ed25519 signature; reject if signing required and absent        |
| AMCP wire                      | Eavesdrop / inject                   | **Network segmentation** documented as deployment requirement                                |
| Auto-update                    | Update during broadcast              | Update channel **gated** by `on_air==false` for ≥5min; quiet hours config                    |
| Telemetry                      | Data leak from air-gapped site       | Opt-out at install; "Air-gapped" deployment mode disables all egress                         |

Windows code signing (EV cert) is a _release_ concern, but the build pipeline must accommodate it from day one.

---

## 8. Logical Components & Their Contracts

```
┌─────────────────── DESIGNER ──────────────────┐   ┌─────────────────── RUNTIME ──────────────────┐
│                                               │   │                                              │
│  EditorShell                                  │   │  RuntimeShell                                │
│   ├─ SceneStore       (Zustand, validated)    │   │   ├─ StackStore        (Zustand)             │
│   ├─ HistoryService   (undo/redo)             │   │   ├─ ConnectionStore   (caspar health)       │
│   ├─ PreviewBridge ←→ <iframe> via postMsg    │   │   ├─ Reconciler        (state-machine)       │
│   ├─ AssetService     (import, dedupe, hash)  │   │   └─ AuditService      (append-only journal) │
│   ├─ FontService      (bundle + system)       │   │                                              │
│   ├─ ExportService    (.vcg pack + sign)      │   │  CasparClient                                │
│   └─ ImportService    (.vcg unpack + migrate) │   │   ├─ AmcpTransport     (TCP, framed)         │
│                                               │   │   ├─ OscTransport      (UDP)                 │
│                                               │   │   ├─ LayerManager      (slot allocator)      │
│                                               │   │   ├─ RedundancyAdapter (mirror|journal)      │
│                                               │   │   └─ HeartbeatService                        │
└───────────────────────────────────────────────┘   │                                              │
                                                    │  TemplateLoader (.vcg) ←─── watched folder   │
                                                    └──────────────────────────────────────────────┘

                            ┌────────────── SHARED ──────────────┐
                            │  @cg/shared-schema  (Zod)          │
                            │  @cg/vcg-format     (zip + sign)   │
                            │  @cg/template-runtime (browser JS) │
                            │  @cg/text-shaping   (RTL/bidi)     │
                            │  @cg/lottie-bridge                 │
                            │  @cg/telemetry                     │
                            └────────────────────────────────────┘
```

Key interface sketches (TypeScript contracts, not implementations):

```ts
// @cg/shared-schema
type SceneGraph = {
  id;
  name;
  resolution;
  frameRate;
  layers: Layer[];
  fields: DynamicField[];
};
type DynamicField = {
  id;
  type: 'text' | 'multiline' | 'image' | 'color' | 'bool' | 'number' | 'select';
  default;
  constraints?;
};
type Element = TextElement | ImageElement | ShapeElement | LottieElement | ContainerElement;
// every element: { id, transform, opacity, visible, locked, layerIndex, animation: { entry, loop, exit } }

// @cg/template-runtime (loaded inside the broadcast HTML)
window.cg: {
  play(data, opts?: { frame?: number }): Promise<void>,
  update(data, opts?: { mode: 'merge' | 'replace' }): Promise<void>,
  stop(opts?: { immediate?: boolean }): Promise<void>,
  next?(): Promise<void>,
  remove?(): Promise<void>,
};

// CasparClient (consumed by Runtime state machine)
interface CasparClient {
  connect(primary: CasparTarget, backup?: CasparTarget): Promise<void>;
  add(slot: LayerSlot, vcgId: string, data: Record<string, unknown>): Promise<AmcpAck>;
  update(slot: LayerSlot, data: Record<string, unknown>): Promise<AmcpAck>;
  play(slot: LayerSlot): Promise<AmcpAck>;
  stop(slot: LayerSlot): Promise<AmcpAck>;
  clear(slot: LayerSlot): Promise<AmcpAck>;
  on(event: 'osc' | 'health' | 'failover', cb): Unsubscribe;
}
```

---

## 9. Audit Log (always-on)

Append-only newline-delimited JSON, one file per UTC day, in `%LOCALAPPDATA%\BroadcastCG\audit\`.

```json
{
  "ts": "2026-05-19T18:42:11.412Z",
  "actor": "local",
  "action": "take",
  "item": "lt-7",
  "template": "newsroom-lt@2.1",
  "data_hash": "sha256:…",
  "caspar": "primary",
  "slot": "1-20",
  "ack_ms": 12,
  "osc_confirm_ms": 89
}
```

Mirrored to a UNC path if configured. Never blocking — backpressure drops to local-only and flags an audit health warning.

---

## 10. Build, Package, Distribution

- **pnpm + Turborepo** monorepo (already proposed in Phase 1).
- **electron-builder** with two app targets (`apps/designer`, `apps/runtime`), separate code-signing pipelines.
- **Native deps**: `better-sqlite3` (build per Electron ABI), `osc` (pure JS), `node-net` for AMCP (stdlib).
- **CI**: GitHub Actions matrix on `windows-latest`, with a **soak job** (Docker'd CasparCG mock from `tools/amcp-mock`) that runs 30 minutes per PR and 24h nightly.
- **Versioning**: SemVer apps + **independent schema version** for `.vcg` (so a template never has to be re-released because the apps shipped).
- **Distribution**: signed `.exe` installer per app. Air-gapped variant: `.zip` portable build with telemetry compiled out.

---

## 11. What's deliberately deferred (and why)

| Item                             | Why deferred                                                            |
| -------------------------------- | ----------------------------------------------------------------------- |
| Multi-user roles / auth          | Single-user covers v1; audit log captures who-when at the OS-user level |
| Stream Deck / X-keys / GPI tally | Designed as adapter port; not built v1                                  |
| Vertical / OTT outputs           | Out of scope until horizontal is stable                                 |
| HDR / BT.2020                    | Same                                                                    |
| Macro / playlist chaining        | Phase 6+ — depends on Runtime stack model being solid first             |
| Cloud sync of templates          | LAN file-drop is enough; cloud is post-v1 if at all                     |

---

## 12. Risks Phase 2 still leaves open

1. **CasparCG 2.3.x CEF version drift** — exact CSS/JS feature support must be verified against the _deployed_ binary. Mitigation in Phase 9: a "rendering compatibility" test page shipped with the installer.
2. **OSC payload shape varies by CasparCG build/config** — needs a small compatibility layer. Mitigation: build the AMCP+OSC mock against a real instance early.
3. **Persian font fidelity inside CEF** — Vazirmatn is solid but ZWNJ edge cases still need a reference test card. Mitigation: a "Persian Reference Render" `.vcg` shipped as a built-in QA template.
4. **Watched-folder import race** — partial writes can be picked up. Mitigation: atomic `.vcg.tmp` → rename pattern documented and enforced by ExportService.

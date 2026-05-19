# Phase 1 — Requirement Analysis & Architectural Critique

## 1. Critical Risks

### 1.1 Rendering parity gap (Editor ≠ Output)

The editor uses **Konva (Canvas 2D)** but the playout output is **DOM/HTML inside CasparCG's embedded Chromium (CEF)**. These are two fundamentally different rendering pipelines:

- Canvas `fillText` uses the host browser's shaper (Chrome on the operator machine).
- CasparCG's HTML producer uses a pinned, often older Chromium build (CEF, varies by CasparCG version — 2.3.x ships CEF ~90; 2.1 ships much older).
- Text metrics, line-breaking, kerning, sub-pixel positioning, and font fallback **will differ**.

This is the #1 silent failure mode in this class of software: graphics look perfect in the editor and break on-air.

### 1.2 Persian/Arabic shaping is incompatible with the chosen editor stack

The README marks RTL/Persian as **CRITICAL**, but Konva renders text via Canvas 2D, which:

- Does Unicode bidi at the OS shaper level (DirectWrite on Windows) — acceptable for _display_ but problematic for _editing_ (caret positioning, selection, justification, ZWNJ insertion).
- Cannot reliably preview the same shaping CasparCG's CEF will produce.
- Has no first-class story for ZWNJ-aware editing, RTL caret movement, or mixed-direction runs.

**For a Persian-first product this is a blocking architectural concern, not a polish item.**

### 1.3 Mission-critical playout in Electron

Electron + Chromium has memory growth, GC pauses, and renderer crashes. The _Designer_ in Electron is fine. The _Runtime_ in Electron is acceptable only if:

- The actual graphics render _inside CasparCG_, not in the Electron window (the README implies this — good).
- The Electron Runtime is **only a controller**, never the renderer of on-air pixels.
- A watchdog can restart the Runtime without disturbing CasparCG's on-air state.

This boundary is not made explicit in the blueprint and must be.

### 1.4 Redundancy is hand-waved

"Primary + Backup CasparCG" with "heartbeat / auto-reconnect / failover" is one paragraph. Real redundancy demands answers to:

- Are both servers genlocked? (If not, failover causes a frame jump.)
- Are commands mirrored synchronously, or does backup replay from a journal?
- What is the failover trigger (TCP timeout, OSC silence, AMCP error)?
- What's the **split-brain** policy when both report healthy but disagree?
- Does the Runtime app itself have redundancy? (Two operator workstations → one CasparCG cluster is a common topology; this isn't addressed.)

### 1.5 On-air state is not a CRUD problem — it's a state machine

The blueprint treats playing/stopping as commands. Reality:

- AMCP commands are fire-and-forget over TCP; success of a command ≠ success on air.
- OSC (which CasparCG emits) is the only push channel for _actual_ on-air state.
- Operator UI must **reconcile**: optimistic local state ↔ OSC truth ↔ AMCP responses.
- Reconnect must resync: when the Runtime restarts mid-broadcast, it must learn what's currently on-air from OSC, not from its own SQLite cache.

The README never mentions OSC. **This is the largest single gap.**

### 1.6 Realtime field updates while ON AIR

"No stop/replay required for updates" is the right product call, but the implementation has three sharp edges:

1. AMCP `CG UPDATE` ships XML; field schema drift between editor and runtime causes silent failure.
2. Mid-animation updates: if a lower-third is still doing its entry, what does an update do? Interrupt, queue, or merge?
3. Race conditions: two operators (or two clicks) issuing concurrent updates — last-write-wins is not safe for broadcast.

### 1.7 .vcg package format is underspecified

- No schema versioning / migration strategy between editor versions.
- No checksum or signature — operator imports a tampered/corrupt package right before going live.
- `index.html` "must support play/update/stop" but the **JS contract** with CasparCG (global `play()`, `update(data)`, `stop()`, `next()`, `remove()`) isn't pinned.
- Fonts: bundled vs. system, licensing implications, fallback chains all unspecified.

### 1.8 Two products, one repo: scope unclear

Are Designer and Runtime:

- **(a)** one Electron app with two modes,
- **(b)** two Electron apps sharing a monorepo, or
- **(c)** one renderer shell with two BrowserWindows?

Each has different security boundaries, update cadences, and crash isolation. (b) is the right answer for broadcast, but the README hasn't committed.

---

## 2. Missing Requirements

These are absent from the blueprint and _must_ exist before architecture is locked:

| Category        | Missing item                                                                            |
| --------------- | --------------------------------------------------------------------------------------- |
| **Workflow**    | Take / Preview / Program model (PVW→PGM). Most operators expect this.                   |
| **Workflow**    | Auto-out timers (clear lower-third after N seconds).                                    |
| **Workflow**    | Template chains/macros (intro → bug → outro).                                           |
| **Hardware**    | Stream Deck / X-keys / GPI control surface integration.                                 |
| **Hardware**    | Tally out (GPO, OSC, MIDI) to inform vision mixer.                                      |
| **Video**       | Frame rate per project (25 / 29.97 / 50 / 59.94 / 60) — not just resolution.            |
| **Video**       | Color space (BT.709 / BT.2020), alpha mode (premultiplied vs. straight).                |
| **Video**       | 9:16 / vertical / OTT outputs.                                                          |
| **Multi-user**  | Roles (admin, designer, operator, producer).                                            |
| **Multi-user**  | Audit log of on-air actions (legal/compliance requirement at most networks).            |
| **Multi-user**  | Multiple Runtime instances controlling one CasparCG cluster.                            |
| **Reliability** | Crash reporting + telemetry (Sentry-class, with op-out for air-gapped sites).           |
| **Reliability** | Soak test plan (24-hour playout without leak).                                          |
| **Reliability** | Auto-update policy — **never during broadcast**.                                        |
| **Reliability** | "Lock screen" / pin to prevent accidental clicks on-air.                                |
| **Editor**      | Undo / redo, project save vs. template save.                                            |
| **Editor**      | Asset deduplication across templates.                                                   |
| **Editor**      | Template versioning + migration on load.                                                |
| **Fonts**       | Licensing model; bundling vs. system fonts; CasparCG-side font deployment.              |
| **i18n**        | Mixed bidi runs (Persian name in English lower-third, etc.).                            |
| **Data**        | RSS / API ticker source is "future" but determines data layer shape now.                |
| **Security**    | Template HTML is arbitrary JS — sandboxing in editor preview and on CasparCG.           |
| **Security**    | Windows code signing for distribution.                                                  |
| **Network**     | AMCP is plaintext, no auth — network segmentation / VLAN assumption must be documented. |

---

## 3. Hidden Complexity

- **Three rendering engines in the editor preview** (Konva canvas + Lottie SVG/canvas + GSAP DOM) — keeping them visually in sync at the same coordinate system is non-trivial.
- **Lottie's "import from AE" is a minefield** — expressions, layer styles, certain matte modes don't export. You need a vetted AE preset for designers.
- **Dynamic field substitution** must work in three contexts: editor preview, exported HTML, and live `CG UPDATE` — three different code paths sharing one schema.
- **Persian fonts on CasparCG** — CasparCG resolves fonts via Windows GDI; the operator's editor sees fonts a different way. Font mismatch is invisible until on-air.
- **Frame-locked entry animations**: GSAP uses `requestAnimationFrame` (variable). CasparCG renders at a fixed frame rate. Long animations may drift unless duration is expressed in _frames_, not ms.
- **CasparCG channel/layer model**: a single AMCP target is `channel-layer` (e.g., `1-20`). Multiple templates on stack require careful layer allocation; collisions cause silent overwrites.

---

## 4. Weak Decisions to Challenge

| Decision                               | Concern                                  | Suggested change                                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Konva for the editor**               | Canvas ≠ DOM output; weak RTL.           | Use a **DOM-based editor** (custom React/CSS with `transform` for resize/rotate) so editor preview _is_ the output. Or use Konva only for the gizmo layer and a real `<iframe>` rendering the actual template HTML underneath. |
| **AMCP TCP only**                      | No push status, no on-air truth.         | Add **OSC subscribe** alongside AMCP. AMCP = command, OSC = state.                                                                                                                                                             |
| **GSAP exclusive**                     | Fine, but locks you in.                  | Keep GSAP for orchestration; allow CSS keyframes for simple opacity/transform so simple templates have zero JS bundle.                                                                                                         |
| **SQLite for "runtime presets"**       | OK for persistence, wrong for hot state. | In-memory state store (Zustand on the Runtime side, mirrored to SQLite in WAL mode as a journal).                                                                                                                              |
| **Two products implied to be one app** | Different reliability budgets.           | **Two Electron apps in one monorepo**, sharing `@cg/shared` (types, schema, runtime contract).                                                                                                                                 |
| **"DO NOT use Canvas for final"**      | Correct, but the editor _is_ canvas.     | Explicit "editor uses overlay canvas; preview iframe uses DOM" rule.                                                                                                                                                           |
| **Lottie as importable**               | Easy to scope-creep.                     | Constrain to a **vetted AE export preset**; document unsupported features; bake out as `.lottie` (dotLottie) to bundle assets.                                                                                                 |
| **"Bidirectional sync"**               | Underspecified.                          | Specify: AMCP commands → CasparCG; OSC events → Runtime; OSC is single source of truth for on-air state; Runtime UI is _eventually consistent_ with optimistic local overlay.                                                  |

---

## 5. Critical Architectural Questions (for you to answer before Phase 2)

1. **Topology** — One Runtime workstation or many? One CasparCG cluster or many studios?
2. **Failover model** — Genlocked hot standby (mirrored commands), or warm standby (journal replay)?
3. **Operator workflow** — Direct take, or Preview→Program with a TAKE button?
4. **Hardware control surfaces** — Required at v1, or post-v1?
5. **Frame rates / color** — Single project setting, or per-output? HDR?
6. **CasparCG version target** — 2.3.x (modern CEF) or 2.1 (older but stable in many stations)?
7. **Persian fonts** — Bundle which font(s)? Who licenses?
8. **Roles & audit** — Single-user tool, or multi-user with auth + audit log?
9. **Designer / Runtime distribution** — Same machine, or Designer-on-desk + Runtime-in-rack?
10. **Data sources for ticker** — File, REST, RSS, MQTT? Pick now; it shapes the data layer.

---

## 6. Proposed Improved Architecture (v0 sketch)

### 6.1 Repository shape

Monorepo (pnpm + Turborepo):

```
cg/
├── apps/
│   ├── designer/        # Electron app A — visual editor
│   └── runtime/         # Electron app B — playout controller
├── packages/
│   ├── shared-schema/   # Zod schemas: scene graph, .vcg manifest, dynamic fields
│   ├── shared-ui/       # shadcn-derived components used by both apps
│   ├── caspar-client/   # AMCP + OSC client, state machine, redundancy
│   ├── template-runtime/# the JS injected into index.html (play/update/stop/next)
│   ├── vcg-format/      # zip read/write, validation, signing, migrations
│   ├── lottie-bridge/   # constrained Lottie import + dynamic-field bindings
│   ├── text-shaping/    # RTL/bidi helpers, ZWNJ utilities, font metrics
│   └── telemetry/       # crash reporter, opt-out aware
└── tools/
    ├── amcp-mock/       # AMCP+OSC server for integration tests
    └── soak-runner/     # 24h leak test harness
```

Two Electron apps means two crash domains, two update cadences, independent signing.

### 6.2 Editor architecture (Designer)

- **Stage = an `<iframe>` that loads the real template HTML.** This is the preview. WYSIWYG by construction.
- **Overlay = an absolutely-positioned canvas (Konva or vanilla)** that draws selection handles, snap guides, safe areas, alignment helpers — _not_ the content.
- **Scene graph** is the source of truth (Zod-validated); both the iframe content and the overlay derive from it.
- **Dynamic fields** are bound via `data-bind="headline"` attributes; the same code path runs in the editor and in the exported template.
- **Text editing** uses a `contenteditable` shadow DOM in the iframe so Persian shaping is identical to output. Konva is bypassed entirely for text.

This **eliminates rendering parity drift** as a class of bug.

### 6.3 Runtime architecture

- **Controller, not renderer.** The Electron window shows a React UI; pixels live in CasparCG.
- **Core is a state machine per "graphic on stack"**:
  `idle → loaded → playing → on-air → updating → on-air → exiting → idle`
- Transitions are driven by:
  - **AMCP responses** (command ack)
  - **OSC events** from CasparCG (truth)
  - **Operator intents** (optimistic)
- A reconciler merges optimistic + truth; UI shows both with a "pending" indicator until OSC confirms.
- **Persistence** is a WAL'd SQLite journal of intents and confirmed states — survives crash, enables resync on reconnect.

### 6.4 CasparCG integration package

- **Two channels** (primary, backup) abstracted as one logical "output."
- **Three transport concerns**:
  - AMCP (TCP, command, line-oriented)
  - OSC (UDP, push, state)
  - Heartbeat (a lightweight AMCP `VERSION` ping every Ns)
- **Redundancy strategies as adapters** (mirror, journal-replay, manual) — pick per deployment without rewriting code.
- **Layer manager** allocates `channel-layer` slots and prevents collisions.

### 6.5 Template runtime contract (the JS inside index.html)

A small, pinned contract:

```ts
window.cg = {
  play(data: Record<string, unknown>): Promise<void>,
  update(data: Record<string, unknown>): Promise<void>,
  stop(): Promise<void>,
  next?(): Promise<void>,
  remove?(): Promise<void>,
};
```

Exported by `@cg/template-runtime` and **the same module is used by editor preview and final HTML**.

### 6.6 .vcg package

- Zip with `manifest.json` (schema version, integrity hash, signing block), `template.json` (scene graph), `index.html`, `assets/`, **`fonts/`** (explicit), **`thumbnails/`**.
- Loader **validates schema version** and runs migrations before opening.
- Optional Ed25519 signature for trusted-template policy.

### 6.7 What changes about the folder structure in the README

The README's `src/` tree is generic. Replace with the monorepo above; inside each app:

```
apps/runtime/src/
├── app/                 # Electron main, preload, IPC contracts
├── features/
│   ├── stack/           # the on-air list, status, take controls
│   ├── inspector/       # dynamic-field editor for selected graphic
│   ├── connections/     # caspar primary/backup config + health
│   └── playlist/        # macros, auto-out
├── core/
│   ├── state-machine/   # XState (or hand-rolled) reducers
│   ├── reconciler/      # optimistic + OSC merge
│   └── persistence/     # SQLite WAL journal
└── ui/                  # shared shadcn
```

---

## 7. Recommended Next Steps (before Phase 2)

1. **Answer the 10 questions in §5.** They are blockers, not nice-to-haves.
2. **Pick a CasparCG version target** and stand up a local CasparCG so we can verify the HTML producer's Chromium version, OSC port, and AMCP quirks early.
3. **Prototype the RTL/Persian render path in CasparCG's CEF** with one realistic lower-third before committing the editor stack. This is the single highest-risk technical unknown.
4. **Build the AMCP+OSC mock** first — it unblocks Runtime development without a live CasparCG and becomes the integration-test harness.
5. **Decide on Designer ↔ Runtime topology** (same machine vs. separate). It changes the IPC story.

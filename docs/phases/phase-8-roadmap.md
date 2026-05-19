# Phase 8 — Development Roadmap

Sequenced milestones, riskiest paths first. Estimates are in weeks of one senior engineer's time and are **planning ranges, not commitments**.

---

## 1. Sequencing Principles

1. **De-risk before you build out.** The three load-bearing unknowns — Persian rendering inside CasparCG's CEF, OSC schema fidelity, and frame-rate sync — are validated in a spike before any production code.
2. **Schemas before runtime, runtime before UI.** `@cg/shared-schema` and `@cg/template-runtime` underpin everything; the apps consume them.
3. **Mock before real.** `tools/amcp-mock` exists before `apps/runtime` needs to integrate. CI never depends on a live CasparCG.
4. **Round-trip early.** A `.vcg` produced by an empty Designer must load in an empty Runtime and trigger a real `PLAY` against the mock by end of M4. Everything afterward is feature breadth, not architectural risk.
5. **Soak runs from M5 onward.** Once Runtime can play one template, the soak harness starts running nightly.
6. **Air-critical paths are exercised manually every milestone.** A 30-minute "smoke take" by a real operator at the end of each milestone.

---

## 2. Milestone Overview

| #   | Milestone                          | Range (weeks) | Theme                                                     | Exit gate                                    |
| --- | ---------------------------------- | ------------- | --------------------------------------------------------- | -------------------------------------------- |
| M0  | Foundation                         | 1–2           | Repo, tooling, ADRs                                       | `pnpm build` green; CI runs lint+typecheck   |
| M1  | De-risking spike                   | 2–3           | Persian + OSC + CEF + frame sync                          | Three written ADRs; throwaway code retired   |
| M2  | Shared schema & contracts          | 2             | `@cg/shared-schema`, `@cg/shared-ipc`, `@cg/text-shaping` | All types Zod-validated; 90% coverage        |
| M3  | VCG format & template runtime      | 3–4           | `@cg/vcg-format`, `@cg/template-runtime`                  | Hand-written `.vcg` plays in CEF             |
| M4  | CasparCG client                    | 3–4           | `@cg/caspar-client` + `amcp-mock`                         | All AMCP/OSC scenarios pass against mock     |
| M5  | Runtime skeleton                   | 3             | Stack, inspector, take, amcp-mock integration             | Operator can take a hand-built `.vcg`        |
| M6  | Designer skeleton                  | 4             | Canvas + iframe + 3 element types + export                | Designer round-trips simplest LT to Runtime  |
| M7  | Animation presets & bindings       | 3             | Full preset matrix, dynamic-field UI in both apps         | All preset combinations exported & played    |
| M8  | RTL, Lottie, breadth               | 3–4           | Persian polish, Lottie import, all 5 template types       | Persian reference template passes QA card    |
| M9  | Redundancy, audit, lock, hardening | 3             | Two CasparCGs, failover, audit log, lock mode             | Failover under load passes integration tests |
| M10 | Soak, perf, broadcast validation   | 2–3           | 24h soak, perf budgets, on-site validation                | RC1 with sign-off from one pilot station     |
| M11 | Release                            | 1–2           | Code-signing, installers, docs                            | GA installers published                      |

**Total range:** ~30–38 weeks ≈ 7–9 months at one senior FTE. Two engineers in parallel realistically compresses this to **5–6 months**.

---

## 3. M0 — Foundation (1–2 weeks)

### Deliverables

- `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`.
- `.github/workflows/`: PR pipeline (lint, typecheck, unit tests, build).
- `@cg/eslint-config` with tier rules from Phase 7 §10.
- Empty `apps/designer` and `apps/runtime` shells: Electron boots, shows a placeholder window, closes cleanly.
- Initial ADRs.
- `tools/repo-scripts` with changeset orchestrator.

### Exit criteria

- `pnpm install && pnpm build && pnpm test && pnpm lint` is green on a fresh checkout.
- CI on a PR runs the four tasks above in < 5 minutes.
- Forbidden cross-tier import in either app fails lint.
- Two installers (designer + runtime) build locally to working `.exe`, even if they only show "Hello".

---

## 4. M1 — De-Risking Spike (2–3 weeks)

The most important milestone. Three unknowns get answered, on throwaway code, against a real CasparCG 2.3.x.

### Spike A — Persian rendering inside CEF

- Stand up CasparCG 2.3.x on a Windows VM.
- Build a hand-written `index.html` containing the Persian reference render.
- Play via AMCP `PLAY [HTML]`. Capture frame grabs at 1080i50.
- **Output:** ADR documenting font chain, observed shaping behavior, any necessary CSS workarounds.

### Spike B — OSC schema observation

- Run CasparCG 2.3.x; capture every OSC bundle for 5 minutes during representative operations.
- Catalogue every address observed; compare against Phase 5 §4.1.
- **Output:** updated Phase 5 §4 with reality; a `capabilities` map shipped in `@cg/caspar-client`.

### Spike C — Frame-rate sync

- Render a 50-frame counter animation via GSAP inside CEF.
- Inspect actual frame cadence via OSC `/channel/n/profiler/time` and CEF DevTools.
- **Output:** ADR confirming (or refuting) the frame-locked-via-rAF assumption.

### Spike D — `cg.update` round-trip with realistic payload

- Send `CG INVOKE 1 "update"` with a Persian-laden JSON payload.
- Measure latency from AMCP send to first DOM mutation visible on a 1080i50 grab.

### Why this milestone exists

If Persian shaping is broken in CEF, the entire product premise is at risk. Better to know in week 4 than week 30.

---

## 5. M2 — Shared Schema & Contracts (2 weeks)

### Deliverables

- `@cg/shared-schema`: every type from Phase 3, Zod-validated, with inferred TS.
- `@cg/shared-schema/migrations`: empty registry but mechanism in place.
- `@cg/shared-ipc`: channel names + Zod schemas for every IPC the two apps will need.
- `@cg/text-shaping`: pure utilities (`detectDirection`, `insertZWNJ`, `persianDigits`, `latinDigits`, `dateFa`, `dateEn`).
- 90% statement coverage on all three packages.

---

## 6. M3 — VCG Format & Template Runtime (3–4 weeks)

### Deliverables

- `@cg/vcg-format`: pack, unpack, integrity, optional Ed25519 sign/verify. Deterministic zip.
- `@cg/template-runtime`: full bootstrap + window.cg + adapters (Phase 4 §1–§6).
- `@cg/lottie-bridge/runtime`: minimal — just enough to render one Lottie inside a template.
- A hand-written **starter template** round-tripped: hand-author `template.json` + `index.html` → `pack()` to `.vcg` → `unpack()` → manually drop into CasparCG's `templates/` folder → `PLAY [HTML]` → confirm rendering matches M1's reference grabs.

### Exit criteria

- Two engineers, no Designer app yet, can produce a valid `.vcg` by hand-editing JSON and watch it play in CasparCG.
- Re-packing the same Scene twice produces byte-identical `.vcg` files.
- CSP enforcement: a template that tries to `fetch('https://evil')` is blocked.

---

## 7. M4 — CasparCG Client (3–4 weeks; parallelizable with M3)

### Deliverables

- `tools/amcp-mock`: full Phase 5 §3 + §4 behavior. Replays `fixtures/amcp-sessions/` and emits `fixtures/osc-traces/`.
- `@cg/caspar-client`: every component in Phase 7 §4.4 implemented (ServerSession FSM, AmcpTransport, OscTransport, CommandQueue, LayerManager, HeartbeatService, all three RedundancyAdapter strategies, Reconciler).
- Integration tests: every Phase 5 failure-matrix row reproduced in `amcp-mock`.

### Exit criteria

- `mirror-sync` test: command sent → both servers ack → state reflects success.
- Failover test: primary dies mid-command → backup takes over within 3 s of OSC silence threshold.
- Split-brain test: both servers diverge → journal-corrective resends bring them coherent.

---

## 8. M5 — Runtime Skeleton (3 weeks)

### Deliverables

- `apps/runtime` Electron main + preload + renderer wired up.
- IPC channels from Phase 7 §3 implemented.
- UI regions from Phase 6 §2 in place.
- Stack feature with one row per item, the air-state color contract, intent buttons.
- TAKE / UPDATE / OUT flowing through `@cg/caspar-client` to `amcp-mock`.
- Lock mode (Phase 6 §8).

### Exit criteria

- Demo: an engineer launches `apps/runtime`, watches the mock connect, drags a `.vcg` into the watched folder, hits TAKE, sees the OSC confirmation flip the row to ON AIR, hits OUT, sees it return to IDLE.
- Soak runner v1 alive: a 30-minute scripted scenario runs nightly in CI without leaking >50 MB.

---

## 9. M6 — Designer Skeleton (4 weeks; parallelizable with M5 after M3)

### Deliverables

- `apps/designer` Electron shell.
- `cgpreview://` custom protocol (Phase 4 §5).
- Canvas + iframe + gizmo overlay for **three element types** (Text, Shape, Image) — Lottie and Video deferred to M8.
- Inspector: Transform + Style sections; Animation deferred to M7.
- Export pipeline (Phase 4 §7) end-to-end, producing real `.vcg` files.

### Exit criteria

- Designer → Export → drop in Runtime watched folder → operator takes it on air.
- Persian text edits work in the iframe contenteditable (RTL caret, ZWNJ insertion).

---

## 10. M7 — Animation Presets & Bindings (3 weeks)

### Deliverables

- Animation Inspector (Phase 6 §12) with all preset kinds from Phase 3 §5.
- Layer/timeline strip showing entry/loop/exit blocks (Phase 6 §10).
- Dynamic-field panel (Phase 6 §13) with bind-from-canvas workflow.
- Field inspector in Runtime (Phase 6 §4) wired to live updates against the mock.
- Pre-flight validation surfaces (Phase 4 §7 step 1) in Designer.

### Exit criteria

- Every preset combination from Phase 3 §5 has at least one fixture template; all play correctly in CEF.
- A binding with a `persian-digits` formatter applied to a number field renders correctly on air.
- Designer rejects an export with an unbound required field.

---

## 11. M8 — RTL, Lottie, Template Breadth (3–4 weeks)

### Deliverables

- **Persian Reference Render** template finalized, shipped as a built-in QA template in both apps.
- Mixed RTL/LTR ticker with seamless wrap.
- Full Lottie import path (`@cg/lottie-bridge/import`) with feature allowlist.
- All five template types from the blueprint have starter templates.
- Lock screen / pin polish.
- Audit log writer (`@cg/audit`) integrated and surfaced in a settings inspector.

### Exit criteria

- A real broadcast designer can build a complete Persian lower-third in < 15 minutes from a blank Designer.
- Soak runner nightly scenario expanded to cover all five template types; no leaks > budget over 8h.

---

## 12. M9 — Redundancy, Failover, Hardening (3 weeks)

### Deliverables

- Two CasparCG instances integrated end-to-end (no longer just mock).
- All three RedundancyAdapter strategies exercised in integration tests against the real pair.
- Failover banner and manual-failover button.
- Split-brain detection + corrective resend.
- Auto-update gate wired and tested: an update during on-air is refused.
- Telemetry on/off/air-gapped modes.
- Windows code-signing pipeline in release CI (EV cert).

### Exit criteria

- Manual: kill primary CasparCG mid-broadcast; backup takes over within 3 s; operator UI banners appear; audit records the failover.
- Soak runner runs a 24h scenario that includes one scheduled failover; no state divergence at hour 24.
- An installer signed with the EV cert passes Windows SmartScreen on a fresh machine.

---

## 13. M10 — Soak, Perf, Broadcast Validation (2–3 weeks)

### Deliverables

- Performance budgets enforced in CI:
  - Designer: cold start < 3 s; first paint of empty editor < 500 ms; export for 5-element template < 1.5 s.
  - Runtime: AMCP ack p50 < 50 ms; OSC truth p50 < 150 ms; stack row click → take request < 16 ms.
  - Template runtime: bootstrap < 500 ms with 3 fonts and 2 images.
- 24h soak passes: < 50 MB memory growth, no AMCP queue overflow, no OSC drop count > 0 sustained.
- On-site validation at a pilot station.
- Operator documentation (`docs/operator-guide/`).
- Designer documentation (`docs/designer-guide/`).

### Exit criteria

- Pilot station signs off on a daily news segment using the system.
- No P0 / P1 bugs open.

---

## 14. M11 — Release (1–2 weeks)

### Deliverables

- Two EV-signed installers, two portable zips (air-gapped).
- `checksums.txt` published.
- Release notes assembled from changesets.
- License compliance audit (Vazirmatn, Noto, GSAP, lottie-web, shadcn).
- Public docs site (or PDF bundle for stations that prefer offline docs).

---

## 15. Definition of "v1 Release-Ready" (concrete checklist)

A template under each of: logo bug, lower-third, ticker, breaking news, fullscreen, **plus** the Persian reference card, all of:

- [ ] Designed in Designer end-to-end (no hand-edited JSON).
- [ ] Exported deterministically (re-export produces byte-identical `.vcg`).
- [ ] Imported in Runtime via watched folder.
- [ ] Played on a real CasparCG 2.3.x running on Windows.
- [ ] Updated mid-air with Persian text fields without visible glitch.
- [ ] Stopped with exit animation completing cleanly.
- [ ] All actions audited.

Plus, demonstrated on a real pair of CasparCG servers:

- [ ] Mirror-sync mode: command divergence detected within 100 ms.
- [ ] Auto-failover under primary AMCP timeout within 3 s.
- [ ] Manual failover under operator click within 200 ms of intent.
- [ ] Split-brain after primary recovery is detected and reconciled within 5 s.

Plus, operationally:

- [ ] 24h soak with no leak budget breach.
- [ ] Lock mode prevents accidental TAKEs under stress test.
- [ ] Audit log survives Runtime restart mid-broadcast and continues without gap.
- [ ] Telemetry off mode performs **zero** outbound network requests.

---

## 16. Risk Register

| #   | Risk                                              | Likelihood | Impact | Owner                          | Mitigation                                              |
| --- | ------------------------------------------------- | ---------- | ------ | ------------------------------ | ------------------------------------------------------- |
| R1  | Persian shaping in CEF unsatisfactory             | M          | High   | M1 spike                       | Fallback: HarfBuzz-WASM shaper at template-runtime tier |
| R2  | CasparCG OSC schema drifts between minor versions | M          | Med    | M1 spike + M4 capability probe | Adapter layer, version-pinned in manifest               |
| R3  | Frame-rate sync not actually vsync-locked         | L          | High   | M1 spike                       | Explicit clock driven by OSC frame events               |
| R4  | Electron memory growth under 24h playback         | M          | High   | M5 onward soak                 | Per-milestone soak; profile heap snapshots              |
| R5  | Two-app monorepo build complexity                 | L          | Med    | M0                             | Turborepo + project references; CI caching              |
| R6  | EV code-signing supply chain delays               | M          | Med    | M9                             | Order cert at M0; signing pipeline at M5                |
| R7  | Pilot station scheduling slip                     | M          | Med    | M10                            | Identify pilot at M3; preliminary visit at M7           |
| R8  | Lottie features not supported by lottie-web       | M          | Low    | M8                             | Strict allowlist; clear designer guidance               |
| R9  | AMCP wire desync from quoting bugs                | L          | High   | M4                             | Single quoting function; fuzz tests against mock        |
| R10 | OSC packet loss under load                        | L          | Med    | M4 + M9                        | UDP buffer tuning; resync after observed loss           |

---

## 17. What's deliberately out of v1

| Out                                    | Why                                       | When |
| -------------------------------------- | ----------------------------------------- | ---- |
| Macro / playlist chaining              | Not on the air-critical path              | v1.1 |
| Stream Deck / X-keys adapter           | Adapter port exists; UI is keyboard-first | v2   |
| NDI/SDI program monitor                | Software-rendered PGM is enough           | v2   |
| Multi-user roles + auth                | Audit log captures OS user                | v2   |
| Cloud template sync                    | LAN watched folder works                  | v2   |
| Vertical (9:16) outputs                | Horizontal must be rock-solid first       | v2   |
| HDR / BT.2020                          | Not on initial customer ask               | v2   |
| Multi-channel control from one Runtime | Architecture supports it; UI deferred     | v2   |
| RSS / API / MQTT ticker sources        | File + REST polling in v1                 | v1.1 |
| Tally GPO output                       | TallyAdapter emits events; no driver      | v2   |

---

## 18. What Phase 9 Looks Like

**Phase 9 is coding.** The "phases" stop being documents and become PRs. The roadmap above maps directly to milestone branches:

```
main
 ├─ m0/foundation
 ├─ m1/spike-persian-cef       (throwaway; deleted on merge)
 ├─ m1/spike-osc-schema        (throwaway)
 ├─ m1/spike-frame-sync        (throwaway)
 ├─ m2/shared-schema
 ├─ m3/template-runtime
 ├─ m3/vcg-format
 ├─ m4/caspar-client
 ├─ m4/amcp-mock
 ├─ m5/runtime-skeleton
 ├─ m6/designer-skeleton
 ├─ m7/animation-bindings
 ├─ m8/rtl-lottie-breadth
 ├─ m9/redundancy-hardening
 ├─ m10/soak-perf-validation
 └─ m11/release
```

Each milestone ends with a tag and a written milestone retro in `docs/phases/retros/`.

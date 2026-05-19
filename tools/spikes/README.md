# M1 — De-Risking Spikes

This directory is **deliberately throwaway**.

Per `docs/phases/phase-8-roadmap.md` §18, the M1 milestone executes four spikes against a real CasparCG 2.3.x server to validate three assumptions before any production code is written:

1. **Spike A** — Persian/Arabic shaping inside CasparCG's CEF matches modern Chrome.
2. **Spike B** — CasparCG's OSC schema matches Phase 5 §4.1 expectations.
3. **Spike C** — `requestAnimationFrame` inside CEF is vsync-locked to the channel frame rate.
4. **Spike D** — `CG INVOKE update` payloads round-trip through `window.update` intact, with measurable latency.

When all four are answered, this directory's findings are captured as **ADRs 0003–0006**, the useful outputs migrate to `fixtures/`, and **the spike code is deleted from `main`**.

Until then, the contents here are **not** part of the build:

- No `package.json` — turbo doesn't see this dir.
- No `tsconfig.json` — `tsc -b` doesn't see this dir.
- No `eslint.config.mjs` — linting skips this dir.
- Plain `.mjs` files; plain `.html` files; readable as-is.

## Layout

```
tools/spikes/
├── README.md                       ← you are here
├── SETUP.md                        ← how to install CasparCG 2.3.x and reach it
├── PROTOCOL.md                     ← exact spike sequence, what to capture
├── persian-reference/              ← Spike A: the QA card
│   ├── index.html
│   └── README.md
├── osc-capture/                    ← Spike B: UDP listener + minimal OSC parser
│   ├── osc.mjs
│   ├── osc-capture.mjs
│   └── README.md
├── amcp-poke/                      ← All spikes: TCP CLI for AMCP
│   ├── amcp-poke.mjs
│   └── README.md
└── frame-counter/                  ← Spike C: rAF cadence measurement
    ├── index.html
    └── README.md
```

## Prerequisites

- A Windows machine or VM with CasparCG 2.3.x installed (see `SETUP.md`).
- Reachable on a LAN port (AMCP TCP 5250, OSC UDP 6250 by default).
- The operator workstation (where you run `osc-capture` and `amcp-poke`) on the same subnet.

## Order

1. Read `SETUP.md`. Install CasparCG. Verify it boots, shows a 1080i50 channel.
2. Read `PROTOCOL.md`. It tells you exactly what to run for each spike.
3. Run the spikes. Capture frames, NDJSON logs, observations.
4. Drop findings into `docs/adrs/0003-*.md` through `docs/adrs/0006-*.md`.
5. Delete this directory.

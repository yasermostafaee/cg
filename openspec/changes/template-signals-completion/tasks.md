# Tasks

Lane: **FULL LANE** throughout — path to air, a new HTTP route on the bridge, the page runtime.

Each numbered item is its own commit, its own full green gate, and its own step-level Linux
`e2e` discharge. **A ticked box with no run URL beside it is a claim, not a discharge.**

## 1. The page emits

- [ ] 1.1 `CgControl` gains `take`; `readCgControl` lifts it defensively, member by member
- [ ] 1.2 `PlayoutControllerOptions` gains `onSelfEnd`, fired from the two self-end rows only
- [ ] 1.3 The runtime emits `self-end` for the GLOBAL ROOT only, before the settle is announced
- [ ] 1.4 The runtime lifts `control.take` on BOTH doors — `play(data)` and `update(data)`
- [ ] 1.5 A completion-ping adapter posts same-origin, once per token, swallowing every failure
- [ ] 1.6 The served page's CSP gains `connect-src 'self'`; the boot script installs the adapter
- [ ] 1.7 RED FIRST: a spec asserting no emit on operator stop / manual / infinite, before the emit exists
- [ ] Gate green · commit `________` · e2e run `________`

## 2. The bridge receives

- [ ] 2.1 `TemplateHttpServer` accepts an injected completion handler
- [ ] 2.2 `POST /complete` parses a bounded body and answers `404` on anything else
- [ ] 2.3 A rejected report is logged and never acted on
- [ ] 2.4 RED FIRST: GET, malformed body and unknown token each answer `404` with no side effect
- [ ] Gate green · commit `________` · e2e run `________`

## 3. The bridge stops

- [ ] 3.1 `TEMPLATE_ACTOR` beside `UNATTRIBUTED_ACTOR`; `normalizeActor` refuses it from the wire
- [ ] 3.2 The bridge mints a token at `#sendAdd` and keeps the live-take map
- [ ] 3.3 A valid report runs the SAME internal stop, under the template actor
- [ ] 3.4 Two conditions read once: the token names a live take AND the row is on air
- [ ] 3.5 Matching spends the token, so primary + backup produce one stop
- [ ] 3.6 RED FIRST: the wire shows exactly one `CG … STOP` for two reports of one take
- [ ] Gate green · commit `________` · e2e run `________`

## 4. The token rides and is refreshed

- [ ] 4.1 The resident-producer take path tells the page its new token before the play
- [ ] 4.2 The tell is unconditional — a look-less template needs the token too
- [ ] 4.3 A failed tell does not refuse the take
- [ ] 4.4 RED FIRST: a report carrying the PREVIOUS take's token after a re-take is ignored
- [ ] Gate green · commit `________` · e2e run `________`

## 5. Mock and e2e

- [ ] 5.1 `MockRuntime` mints and rotates a token, and models the completion receipt
- [ ] 5.2 A test-only hook simulates "the page finished" — never a timer in product code
- [ ] 5.3 E2E: a self-ending row leaves ON AIR on the simulated signal
- [ ] 5.4 E2E: a `manual` or infinite row does not
- [ ] 5.5 E2E: a stale token does nothing
- [ ] Gate green · commit `________` · e2e run `________`

## 6. The record

- [ ] 6.1 `SECURITY.md` — the relaxation stated where the old claim is
- [ ] 6.2 ADR 0009 — a dated section for the owner's decision of 2026-09-15
- [ ] 6.3 `docs/prd/caspar.md` — `C-013` to `[~]` with this change dir; `C-017` annotated, not rewritten
- [ ] 6.4 `C-035` filed — per-pass reporting, noted and not built
- [ ] Gate green · commit `________` · e2e run `________`

## 7. Owed on the plant — not dischargeable here

- [ ] 7.1 A logo set to 2 passes stops reading ON AIR by itself within about a second; PLAY brings it back at once
- [ ] 7.2 A timed auto-out title: the same
- [ ] 7.3 A template whose authored run is finite: the same
- [ ] 7.4 An infinite loop and a `manual` graphic never stop themselves
- [ ] 7.5 A manual STOP pressed just before the end: one stop, no error
- [ ] 7.6 The bridge restarted mid-run: the row stays as it is today (the lost-signal case)
- [ ] 7.7 With the backup server connected: one stop, not two
- [ ] 7.8 Every template re-imported BEFORE any of the above (`C-034` is not built)

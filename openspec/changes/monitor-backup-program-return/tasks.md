## 1. Contract and authorization

- [x] 1.1 File `R-104`, record the superseded backup-monitor limitation, and strict-validate the design/spec.
- [x] 1.2 Add engine-aware programme ticket, status and meter schemas with compatibility for existing A readings.
- [x] 1.3 Pin ticket authorization: logical N is scoped before B maps to M; stream/engine/channel tickets are not interchangeable.

## 2. Bridge relays

- [x] 2.1 Add server-B picture and sound relays that resolve the current N → M mapping and server-B host without using preview ports.
- [x] 2.2 Publish independent A/N and B/N return states; close B viewers and invalidate state on mapping/host change.
- [x] 2.3 Add the backup-engine meter reader with B's own bearer, M → N mapping, engine-tagged output and per-socket logical-channel filtering.
- [x] 2.4 Cover one-upstream sharing, missing/held mapping refusal, failover/mapping changes and engine-local failure in Bridge tests.

## 3. CG Control

- [x] 3.1 Extend RuntimeBridge, WebSocketRuntime and mocks/fakes for engine-aware picture, sound, status and meters.
- [x] 3.2 Add persisted A/B/A+B display choice, stable physical labels, independent signal tiles and a truthful no-backup fallback.
- [x] 3.3 Add Follow primary/A/B audio-source selection; keep one decoder and bind the one loudness/VU surface to the resolved source.
- [x] 3.4 Add DOM/unit coverage for preference fallback, failover, no mixing, resource release and stale/engine-separated meters.
- [x] 3.5 Keep A/B/A+B and audio-source controls visible without a configured backup; retain a black no-signal B placeholder while opening no B resource.

## 4. End-to-end and release verification

- [x] 4.1 Extend the paired fake station with two programme pictures, sounds and meter streams suitable for independent stopping.
- [x] 4.2 Add Runtime Playwright scenarios for A+B, one-feed stall, absent mapping, single selected sound/meter and stable labels after failover.
- [ ] 4.3 Run targeted typecheck/lint/tests, strict OpenSpec validation, full local gate and local Runtime E2E.
- [ ] 4.4 Push the exact commit to `dev`, record the completed green Linux `ci` and `e2e` run URL here, and complete the 0.12.6 installer candidate only afterward.
- [x] 4.5 Re-run the focused Runtime DOM/E2E coverage for the always-visible reserve controls and no-signal placeholder.

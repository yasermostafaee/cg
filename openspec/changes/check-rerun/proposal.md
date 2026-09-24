# The connection check: a re-check starts clean, and one fault is said once (`CHECK-RERUN-01`)

## Why

The owner, 2026-09-24, on the `3c4d04d0` build with the Playout switched off, pressed **Check**
and pressed it again while the button read **"Checking…"**. The dialog read:

```
✓ No VPN or proxy in the way.
✓ The route to 192.168.21.111 leaves through Ethernet (192.168.21.93).
◷ CasparCG on 192.168.21.111: waiting for sign-in.
✗ No answer from 192.168.21.111 on port 8080.
✗ No answer from 192.168.21.111 on port 8080.
✓ Ports 5174, 5280, 7911 and 6250/udp are free for this station.
✓ The Playout and CasparCG run on other machines.
```

Three faults:

1. **The last run's results stay on screen during a re-check**, and read as current.
2. **One fault is said twice**: the API line and the CORS line both say the Playout does not answer.
3. **"Waiting for sign-in" when nobody can sign in**: with the Playout's API silent, the AMCP line
   still asks for a sign-in that cannot work.

## What changes

1. **A (re-)check starts clean (console).** The moment Check is pressed, every line drops its last
   verdict and shows its SUBJECT beside the pending mark — the layer table's moving loader, in the
   muted ink — until the reply lands (the bridge answers `setup.check` whole; it does not stream).
   Every run is tagged, and only the latest may write its lines, its busy state or its judging: a
   slow reply from an earlier run is dropped. A reply that never comes clears the lines under the
   bridge's error rather than leaving them checking.
2. **A verdict about sign-in needs a Playout that can sign someone in (bridge).** The check's one
   dependency rule, written in one function (`byTheApiLine`) and applied after every line has
   settled; it reads the API line's structured reading, never the words of any line. While the API
   line cannot sign anyone in (no answer, or no signing keys):
   - the CORS line is **not checked** — a new neutral status, `skip` — and says why in a few words:
     _"Sign-in from this console: not checked — the Playout does not answer."_
   - the AMCP line does not wait for a sign-in; it takes its own result — an answer passes, a
     refusal or no answer is a failure said plainly (_"… refused the connection on port 5250."_,
     _"No answer from … on port 5250."_).
3. **Each line's subject is spelled once** (`connectionCheckSubject` in `@cg/shared-ipc`), for the
   console's checking lines and the bridge's not-checked line alike.

## Impact

- `@cg/shared-ipc`: `ConnectionCheckLineSchema.status` gains `skip`; `connectionCheckSubject`.
  A widened enum on a response the console and bridge ship together (CG Control installs both).
- `tools/caspar-bridge`: `connection-check.ts` — the API line carries its reading; AMCP is worded
  after the API line is known; `byTheApiLine`; the C1 timings are read after wording.
- `apps/runtime`: `PlayoutConnection` (the clean start, the run tag), `ConnectionCheckList` (the
  `skip` and `checking` states), `firstRunStation` (`checkingLines`, `ShownCheckLine`).
- Docs: the operator guide's first-run step, the Playout 2.8.54 facts note.
- **Not changed:** the probes, their bounds, the post-sign-in AMCP phases (still waiting for the
  Playout, then the approval), `checkAllowsConnect`'s gate (API and CORS must pass), and nothing
  reaches the wire or the Playout.

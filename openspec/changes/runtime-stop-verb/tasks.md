# Tasks — CG STOP as a distinct operator action (C-012)

## 1. Evidence (done — this is what unblocked it)

- [x] 1.1 C-011's probe (PR #353) on CasparCG 2.3.2 `4de6d18f`: `CG STOP` → 202, OSC still `html`,
      `window.stop` fired; `CG PLAY` with no re-ADD resumed; `CLEAR` → OSC silent.
- [x] 1.2 `window.stop` is wired to `runtime.stop()` — the graceful outro path, NOT `remove()`'s
      synchronous kill.
- [x] 1.3 ADR-0006's freeze was an EVIDENCE rule, not a taste. Record the extension and the
      measurements rather than quietly adding a fifth verb.

## 2. The five design questions (decided and recorded in the proposal)

- [x] 2.1 STATUS — no new one. A stopped item rests at `loaded`, which already means
      resident-not-playing. Twelve files switch on the enum; a new member is a new hole in each.
      The load-bearing part is retracting `played`, or OSC (which reports `html` forever after a
      stop) would derive a permanent on-air claim.
- [x] 2.2 ASYNC — fire and forget. The ack means "accepted", not "the outro finished"; completion
      is unobservable (B-030), so no wait, no chase, no timeout. The ~1 s where the row reads
      `loaded` while the outro animates is stated in the spec, not hidden.
- [x] 2.3 TRANSITIONS — PLAY resumes (no re-ADD); UPDATE reaches the resident producer; CLEAR still
      destroys it; REMOVE unchanged; STOP is not offered again (nothing is playing).
- [x] 2.4 UI — one `rowAction` entry, so the button and the context menu come from one declaration
      (R-013). Not added in two places.
- [x] 2.5 REFUSAL — link-gated exactly like PLAY/UPDATE/CLEAR, refusal to the command toast.

## 3. Implementation

- [x] 3.1 `CommandBuilder.stop()` → `CG <ch>-<layer> STOP <flash>`.
- [x] 3.2 `Intent` gains `stop`; the reconciler settles it to `loaded` and retracts `played`.
- [x] 3.3 `CasparRuntime.stopItem()` — named around the existing `stop()` PROCESS shutdown. Urgent
      lane like `out()`. Does NOT clear `#loaded` (that is what makes the resume work) and does NOT
      mark `#adopted` (a stop proves nothing about the layer being clear).
- [x] 3.4 `stack.stop` channel + bridge route + `RuntimeBridge` contract + `WebSocketRuntime`.
- [x] 3.5 `MockRuntime.stop()` parity — settles to `loaded`, keeps `#loaded`, so test mode cannot
      teach a different mental model from air.
- [x] 3.6 Audit action `stop`.
- [x] 3.7 `StackRow` action entry + `StackPanel` wiring.

## 3b. Safety gap the design panel surfaced (closed)

- [x] 3b.1 A FAILED stop must give back the play evidence it retracted. The stop clears `played` at
      INTENT time (necessary — see 2.1), but `freshTruth` outranks the ack, so if the STOP never
      landed the row would read `loaded` while the graphic is STILL PLAYING: the "hide a live
      graphic" direction. Mirrors B-079's failed-take retraction exactly, on both the failed-ack and
      the expiry path, keyed on `playedBeforeIntent` so a failed `out` (which never records it) is
      untouched.

## 4. Tests

- [x] 4.1 WIRE: STOP sends `CG … STOP` — and neither a `CLEAR` nor a re-ADD.
- [x] 4.2 A stopped item rests at `loaded`, never on-air/playing/idle, with the layer still
      reporting a producer.
- [x] 4.3 PLAY after STOP resumes via a bare `CG PLAY`, with NO re-ADD on the wire.
- [x] 4.4 CLEAR after STOP still destroys the producer.
- [x] 4.5 R-006: STOP refused with `disconnected` while nothing is reachable, like take/out.
- [x] 4.6 STOP on an unknown item is refused and sends nothing.
- [x] 4.6b A successful stop rests at `loaded` with the producer still reported; a FAILED and an
      EXPIRED stop both keep the item ON AIR; a failed `out` is unchanged (3b.1).
- [x] 4.7 UI gating per status, and offline; the context menu mirrors the button (the existing
      mirror test picked STOP up with no new assertion — that is the R-013 structure working).
- [x] 4.8 The B-074 mock↔bridge parity surface updated deliberately (the guard caught the addition,
      which is the guard working).
- [x] 4.9 caspar-bridge green isolated AND under full parallel `pnpm test`; ports/sockets released
      in `afterEach`.

## 5. Gate

- [x] 5.1 `pnpm gate` green (uncached).
- [x] 5.2 `pnpm gate:e2e` with no dev server / mock / bridge competing for CPU.
- [x] 5.3 `pnpm openspec validate runtime-stop-verb --strict`.

## 6. Owner visual confirmation — REQUIRED BEFORE COMMIT

- [x] 6.1 On real CasparCG: stop an on-air item, watch the template's outro RUN, confirm the graphic
      settles rather than vanishing, then PLAY it again and confirm it RESUMES without a reload.

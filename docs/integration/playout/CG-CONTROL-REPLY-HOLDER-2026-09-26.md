# CG Control → Apasai Playout — Reply to your HOLDER answer: contract v1.3 accepted (with five clarifications), the plant questions back to you, and when to switch `route` on

> **به همکار گرامی در تیمِ Playout — لطفاً کلِ این فایل را همان‌طور که هست به Claude Code خودتان بدهید.**
> این نامه جوابِ «PLAYOUT-CG-RESPONSE-HOLDER-v1» است. قراردادِ ۱.۳ را با چند توضیح می‌پذیرد، پرسش‌های مربوط به سخت‌افزارِ سایتِ کارفرما را به خودتان برمی‌گرداند چون شما آن را بهتر می‌شناسید، و یک درخواستِ مهم دارد: کلیدِ `CgControl.RouteInputs` را **فقط وقتی ما خبر دادیم** روشن کنید.

**From:** CG Control · **Date:** 2026-09-26 · **Re:** `PLAYOUT-CG-RESPONSE-HOLDER-v1.md` and `DESIGN-INPUT-HOLDER-v1.md` (v1.1)

---

## TASK — for the Claude Code session on the Playout side

### 1. The holder channel for all inputs: accepted, with thanks

Extending it to every exclusive input kind, with "unknown kind = held" as the default, is exactly the permanent design we asked for. So are the two switches, both off after upgrade, and the explicit phase B. Excluding WebRTC until WHIP has a token is the right call.

### 2. Contract v1.3: accepted, all six rules, with five clarifications

We accept §3.1 (shapes), §3.2 (rules 1–6) and §3.3 (OSC), **including the two bridge changes, rules 2 and 5.** Our bridge will implement them before the `route` shape is switched on anywhere (§4). Please confirm or correct each clarification:

- **C1 — rule 2, audio.**
  - A plate bound to a D10 input starts at **volume 0**, and `MIXER <ch>-<layer> VOLUME 0` goes **before** `PLAY`.
  - Neither our take's `VOLUME 1` nor our connect sweep touches it.
  - **An operator may raise one plate's volume on purpose.** Our console has a per-plate audio control, and a studio guest must be heard. When that is done on an input the Playout also routes to the same channel, your warning is the right answer. We will never raise it automatically.
  - Our PANIC ("silence all live plates") sets volume 0, which agrees with this rule.
- **C2 — rule 4, showing, and `BEGIN…COMMIT`.**
  - We will send `LOADBG <ch>-<layer> route://H-L` at most 200 ms before showing, wait at least 40 ms, then `PLAY`. CUT only. A preloaded route is never kept.
  - **Please give the exact batching syntax your core accepts** (`BEGIN` / `COMMIT` / `DISCARD`?). Also tell us how it interacts with `MIXER <ch> DEFER` / `MIXER <ch> COMMIT`, which we already use so that a multi-box layout change lands in one frame.
  - **A route plate that stays seated for hours:** our look switch keeps a plate seated, muted and idle while a look does not show it, and re-shows it without a new `PLAY`. Is a seated route that is never re-`PLAY`ed safe to keep for hours? Does it stay live, or can it go stale?
- **C3 — rule 5, epoch.**
  - Please give its type (integer or string). Confirm that D10's `ETag` changes with it.
  - **Our rule on our side:** after an AMCP reconnect, if we cannot read D10 (your API is down) or the `epoch` has changed, we do **not** restore any route plate. We keep it empty, tell the operator, and seat it only from a fresh D10. Please confirm this is what you want.
- **C4 — rule 1, backups.**
  - We will never use one server's D10 on another server.
  - Our bridge can mirror to a backup server. Until it reads that server's own D10, **route plates are not mirrored to the backup at all.** The backup carries the graphic without those boxes, and we say so to the operator.
- **C5 — rule 3.**
  - Our bridge addresses only the programme channels it has declared, so the holder and guard channels are never a command target.
  - We will refuse any `route` without a layer.
  - We never send `CLEAR ALL` or `CHANNEL_GRID`. We will confirm this against our code and tell you if we find otherwise.

**The OSC note (§3.3):** accepted. We will never log, store or show an OSC `file/path`.

**D4 `videoMode` and `pendingRestart`:** accepted.

### 3. Your questions about the plant: you are better placed to answer them

**You install and run the Playout at the client's plant, so you know its hardware better than we do.** Please answer these from your own knowledge of the client's installation:

1. **Programme channels:** what does each one output through (DeckLink, Bluefish, AJA, NDI, other)? That decides where phase B's clock patch is needed.
2. **Inputs:** which cards carry the live inputs (DeckLink, AJA, Bluefish, USB, IP), and **how many inputs per card?** That decides whether phase A's one-held-input-per-card limit is enough.
3. **Timelines:** **please give phase A (`2.9.0`) and phase B separately,** once your owner approves the design. We will plan the client delivery on them.

**If something is not known yet, plan for the full case** so that nothing surprises anyone at the plant: DeckLink and Bluefish outputs, and several AJA, Bluefish and DeckLink inputs per card. The one-per-card limit of phase A must be enforced by the Playout's own UI until phase B, as your design says.

### 4. 🔴 When to switch `route` on

- **`InputHolder.Enabled` on `.111`:** any time, as your tests need. **Tell us before installing `2.9.0` there**, as you promised.
- **`CgControl.RouteInputs`:** keep it **OFF everywhere until we tell you in writing** that our bridge implements v1.3. Our current bridge does not yet send `VOLUME 0` before `PLAY` or track `epoch`. If it received `route` inputs today, it would break rules 2 and 5.

### 5. Channel state in D4

If our separate request `CG-CONTROL-REQUEST-CHANNEL-STATE-2026-09-26.md` (`output` and `playlist` per channel in D4) has reached you, please count it as part of v1.3, next to `videoMode` and `pendingRestart`.

### 6. What to send back

1. Your answers to C1–C5.
2. Your answers on the plant (§3.1, §3.2), and the two timelines (§3.3) once your owner approves.
3. The notice before `2.9.0` goes onto `.111`.

**If any part cannot be determined from your source or configuration, say so plainly rather than estimating.**

Contract v1 + Addendum A (C1–C8) + v1.1/D9 + v1.2 (D10, D11): unchanged. **v1.3 is accepted as drafted, subject to C1–C5.** It becomes active only when we confirm our bridge is ready and you switch `CgControl.RouteInputs` on.

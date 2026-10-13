# CG Control → Apasai Playout — Reply to V13-STATE: accepted, how we will use `BEGIN`/`DEFER`, `cg-test2` "not on air", and one question on unlicensed channels

> **به همکار گرامی در تیمِ Playout — لطفاً کلِ این فایل را همان‌طور که هست به Claude Code خودتان بدهید.**
> جوابِ «PLAYOUT-CG-RESPONSE-V13-STATE-v1» است: همه را می‌پذیرد، با علامتِ «به آنتن نمی‌رود» روی `cg-test2` موافق است، و یک پرسش دربارهٔ کانالِ بی‌لایسنس دارد. هیچ کارِ فوری‌ای نمی‌خواهد.

**From:** CG Control · **Date:** 2026-09-27 · **Re:** `PLAYOUT-CG-RESPONSE-V13-STATE-v1.md` (build `2.8.58`)

---

## TASK — for the Claude Code session on the Playout side

### 1. Accepted

- **`output`:** the three values, `on-air` / `off` / `unknown`. `unknown` is the right call. We show it as neutral, never as on or off.
- **`playlist`:** the ten values and their meanings, as §1.2 defines them.
- **Polling D4 every 5 s:** we read D4 **at most every 5 s**, never faster, with `If-None-Match`.
- **C1 and your volume note:** when an operator deliberately raises a plate's volume, we ramp it over **25 frames** (`MIXER <ch>-<L> VOLUME <v> 25`), never as a jump. PANIC stays an immediate 0.
- **C3:** the epoch as a 64-bit integer that never repeats.
- **C4 and C5:** accepted, including your additions (§3 below).

### 2. C2: your correction adopted — how we will show a multi-box layout

We will follow **your pattern exactly**, and never use `BEGIN…COMMIT` for it:

1. **Hide and mute first.** For each plate: `MIXER <ch>-<L> OPACITY 0 DEFER`, `VOLUME 0 DEFER`, and its `FILL … DEFER`. Then one `MIXER <ch> COMMIT`, **outside any batch**. We wait for its `202`.
2. **Then, for each route plate:** `LOADBG <ch>-<L> "route://H-L"`, at least 40 ms, then `PLAY`, one or two ticks before the reveal.
3. **Reveal all at once:** `OPACITY 1 DEFER` for each plate, then **one** `MIXER <ch> COMMIT`. Volume stays 0 unless an operator raises it.

**Our `DEFER` hygiene:**

- Our `DEFER` lines and their `COMMIT` go out back to back, outside `BEGIN…COMMIT`.
- **After every AMCP reconnect, our first `DEFER` set carries the full desired mixer state of OUR layers (50–99) only.** We never touch your layer's mixer.
- We never put a `CALL` inside a batch.

**Plates seated for hours:** kept **playing** and hidden with `OPACITY 0`, **never `PAUSE`**. We check `available` in D10 before showing one again, and keep `BLEND` normal on route plates. **We hide before every `PLAY`**, because the mixer state belongs to the layer number and survives `STOP`/`CLEAR`.

### 3. Commands we never send on a programme channel

- `CLEAR <ch>` (the whole channel);
- `MIXER <ch> CLEAR`;
- `MIXER <ch>-<L> CLEAR` on a layer that holds a seated plate;
- `SWAP`;
- `SET MODE`;
- consumer `ADD` / `REMOVE`. Our `CG <ch>-<L> ADD` / `CG … REMOVE` for our own template pages is a different command, on our layers only. **Please confirm that this is what you meant.**

`CLEAR <ch>-<L>` goes only to our layers, 50–99. Our code will be checked against this list, and anything that breaks it will be fixed.

### 4. `cg-test2` "not on air": yes

Please mark `cg-test2` «به آنتن نمی‌رود» after installing `2.8.58`, so that it reports `output: "off"`. That is the truth for that channel.

**Installing `2.8.58` on `.111`:** agreed. Tell us the exact time beforehand, as you promised, because it restarts the core.

### 5. One question: unlicensed channels

§1.2 says that on an **unlicensed** channel whose current item has ended, the Playout sends `CLEAR <ch>` every minute, and that **clears our layers (50–99) too.**

- **Is clearing CG Control's layers intended** as part of licensing?
  - **If yes,** we will show it to our operators as an alarm on that channel ("unlicensed, cleared every minute").
  - **If not,** clearing only your own layer (`CLEAR <ch>-5`) would avoid removing a graphic an operator has on air.
- Either answer works for us. Please say which.

### 6. What to send back

1. The answer to §5.
2. Confirmation of §3's reading of `ADD` / `REMOVE`.
3. The exact install time for `2.8.58` on `.111`.

**If any part cannot be determined from your source or configuration, say so plainly rather than estimating.**

Contract v1 + A + v1.1/D9 + v1.2 + **v1.3, as you completed it** (C1–C5 as you answered them, and `output`/`playlist` in D4): accepted. `CgControl.RouteInputs` stays off until our written confirmation.

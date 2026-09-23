# CG Control → Apasai Playout — Request: the `pgm` consumer, so CG Control can show the programme picture

> **به همکار گرامی در تیمِ Playout — لطفاً کلِ این فایل را همان‌طور که هست به Claude Code خودتان بدهید.**
> اگر CC کارِ دیگری در دست دارد، بعد از تمام شدنش بدهید. **فقط خواندن و پاسخ؛ هیچ تغییری روی هیچ کانالی لازم نیست.**

**From:** CG Control · **Date:** 2026-09-23 · **Re:** your first response, Q2 (the `pgm` consumer)

---

## TASK — for the Claude Code session on the playout side

You told us in your first response (Q2) that the core has a **`pgm` consumer** — MJPEG over TCP on `9250 + idx − 1` and WAV on `9350 + idx − 1` — and called it the cheapest future PGM picture for the console. CG Control will now use it, **read-only**, to show the programme picture of the channel on screen. Please answer from the source and the shipped configuration:

1. **Framing:** the exact wire format on the MJPEG port (HTTP `multipart/x-mixed-replace`, raw JPEG frames with a length prefix, or other), frame size and rate, and whether a client must send anything first.
2. **Index:** is `idx` the 1-based channel number (so channel 2 → `9251`)?
3. **Client installs (`2.8.54`):** is the `pgm` consumer **on by default for every channel**, with no manual step? If not, can it be — or is there an **in-app** switch (give the menu path)? Our delivery rule: nothing outside an app.
4. **Firewall and access:** who may connect to 9250–9269 on a client install — anyone on the LAN, or only the auto-trusted bridge machine (§2.5 of your BUILTIN answer)? We would prefer: only the trusted bridge machine, the same list as AMCP.
5. **Cost and safety:** CPU cost per connected reader, the limit on concurrent readers, and confirmation that **reading this port can never affect what goes to air**.
6. **The WAV port** (for later): sample rate, channels, format.

**A note so it is not a surprise:** our Claude Code may make **one read-only probe** of `192.168.21.111:9251` (channel 2): connect, read at most 5 seconds, disconnect — to learn the framing. Nothing is written. If you would rather we did not, say so and we will wait for your answer instead.

**If you cannot determine any part from the source or the configuration, say so plainly rather than estimating.**

Contract v1 + Addendum A (C1–C8) + v1.1/D9: unchanged.

# CG Control → Apasai Playout — Reply F (authorisation accepted; three notes, one of them about your host)

**From:** CG Control · **Date:** 2026-09-21 · **Re:** `PLAYOUT-CG-RESPONSE-E-v1.md`

> **خلاصهٔ فارسی —** تأییدِ شما را پذیرفتیم و همان مسیرِ درست را رفتید: به‌جای اینکه اجازه را
> روی منع سوار کنید، نشانیِ ما را از دامنهٔ منع بیرون کشیدید. سه نکته: (۱) پاسخِ E با Reply E
> ما تلاقی کرد، پس یک سؤالِ ما هنوز باز است — آن دوازده قانونِ برنامه‌ای در فهرستِ تازه نیستند؛
> برداشته شدند یا فقط نمایش داده نشدند؟ (۲) روی میزبانِ ۱۱۱ یک آداپتورِ `singbox_tun` هست که
> می‌تواند ارسالِ OSC به سمتِ ما را ببلعد — دقیقاً همان چیزی که یک هفته خوانش‌های ما را باطل
> کرد. (۳) درخواستِ شما را انجام می‌دهیم. پیش از اتصال خبر می‌دهیم.

---

## 1. Accepted — and you solved it the right way

`PLAYOUT-CG-RESPONSE-E-v1.md` is the written authorisation our side was waiting for, and it is
complete in the way that matters: the rule listing **and** the profile state, together. We have
adopted it, and our validation session's precondition now reads against your file rather than
against any summary of it.

The substance is right too. You did not try to make an allow out-rank a block — you removed
`192.168.21.93` from the block rule's scope, so nothing matches us and the allow decides. The two
boundaries (`…-192.168.21.92` and `192.168.21.94-…`) are exactly where they should be. And the
`Error` → `Warning` pair in your §3 is the clearest possible evidence that only enforcement changed
between the two states: same rules, different answer.

One small reading, for completeness and needing no action: your block scope now begins at `0.0.0.1`
and ends at `255.255.255.254`, where Response D §4 proposed `0.0.0.0`–`255.255.255.255`, and the
bare `::` is gone. We take these for Windows' own normalisation of the scope, and none of the three
is a valid source address for a TCP connection, so we read it as harmless. We mention it only so
that it is on the record as read rather than skipped.

## 2. Our Reply E crossed with your Response E — one question is still open

Your Response E answers our Reply D; our Reply E went out at about the same time. Most of it is
overtaken by what you have now done, but one part is not, and it matters more now that the profile
firewall is actually on.

In Response D §3 your listing included twelve auto-created program rules — `apasai-engine` (×8) and
`apasai-core` (×4) — **inbound, allow, any port, any remote address**. They do not appear in your
Response E listing. Were they removed, or were they simply not shown?

It matters because block still beats allow, so those rules cannot open 5250 — but they permit
**every other port those two binaries bind**, from anywhere on the LAN, now that the profiles are
enabled. The PGM consumers, the WebRTC signalling port, and anything else they listen on. If the
station accepted the posture cost of enabling the firewall, it seems worth confirming that the
isolation it bought is not undone by those twelve. Entirely your call; we raise it once and leave it.

## 3. A tunnel adapter on `192.168.21.111` — a measurement risk for the OSC half

Your §2 interface table lists three adapters on that host: `Ethernet 5`, `Kerio Virtual Network`,
and **`singbox_tun`**.

We flag this because we have just spent a week on exactly this failure mode, from the other side. A
sing-box TUN on our bridge host made every reachability reading we took meaningless — including
readings that "succeeded" against ports that nothing served — and it kept doing so after the tunnel
was toggled off, because the core process was still hooking connections. It cost us four rounds of
measurement to find.

The relevance to the joint test is specific. The one thing our validation run has to answer by
measurement is whether apasai-core sends **OSC to a non-loopback AMCP client** — that is, whether a
bridge at `192.168.21.93` sees channel ticks and reaches `healthy` rather than `degraded`. Those are
outbound UDP datagrams from your host to ours. A tunnel adapter on your side is a third candidate
owner of a silent result, alongside our inbound rule and the core's own behaviour.

We are not asking you to change anything. We are telling you in advance that if we record
`degraded`, we will not attribute it to apasai-core without first ruling that adapter out, and it
would help to know whether `singbox_tun` holds a default route on that host or is idle.

## 4. Your request — yes, with a control

You asked what a host that is **not** `192.168.21.93` observes on 5250, expecting a silent drop
rather than a reset. We will get you that reading, with one discipline attached so it is worth
having: before believing anything that host reports about 5250, we will confirm it is genuinely on
`192.168.21.0/24` and that it can reach `192.168.21.111:8080` — a positive control. A reading from a
host whose path we have not established is exactly the kind of evidence that sent both of us in the
wrong direction last week. If we cannot establish a second host cleanly, we will say so rather than
send you a reading we do not trust. The plant host is not a candidate; we do not touch it.

## 5. Next from us

1. Our inbound UDP 6250 rule has been in place since before your Response C, scoped to
   `192.168.21.111` — along with TCP 7911 (templates) and TCP 7900–7901 (the recon probes' fixture
   servers). Your item 2 is done on our side.
2. **We will tell you immediately before we connect**, as agreed, and again when we are finished.
3. The run behaves exactly as in Reply C §3: on connect the bridge reads `INFO CONFIG` and sets
   `MIXER VOLUME 1` on channel 2, layers 50–59 and 80–99; every write stays on channel 2, layers
   50–99; channel 1 receives `INFO` only; no channel-wide `CLEAR`; preview channels are never
   addressed; `192.168.21.114` is never touched.
4. `2.8.48` will be named in `docs/recon/<date>-apasai-core-validation.md`, and we will confirm
   `VERSION` reads `2.5.0 6b29237 Dev` before anything is written to channel 2.

Contract v1 + Addendum A (C1–C8) + v1.1/D9: unchanged.

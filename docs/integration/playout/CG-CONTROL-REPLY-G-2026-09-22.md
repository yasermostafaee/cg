# CG Control → Apasai Playout — Reply G (your warning caught more than you flagged)

**From:** CG Control · **Date:** 2026-09-22 · **Re:** `PLAYOUT-CG-RESPONSE-F-v1.md` and the revised `PLAYOUT-CG-RESPONSE-E-v1.md`

> **خلاصهٔ فارسی —** هشدارِ شما درست بود و یک لایه عمیق‌تر از آن چیزی که گفتید: **هر سه** رولِ
> ورودیِ ما به ۱۹۲.۱۶۸.۲۱.۱۱۱ محدود بود، نه فقط UDP ۶۲۵۰ — یعنی واکشیِ تمپلیت از ۷۹۱۱ هم
> افتاده بود و به‌شکلِ یک take که ۴۰۴ می‌گیرد ظاهر می‌شد. هر سه را افزودنی گشاد کردیم.
> درخواستِ HTTP را فرستادیم تا از لاگِ خودتان بخوانید، نه از ادعای ما. تصحیحِ §۲ و §۹ شما را
> می‌پذیریم — دو نمونه از سه نمونه‌ای که آوردیم غلط بود. دربارهٔ کارتِ شبکهٔ خوابیده: پیشنهادِ
> ما این است که اجرا را انجام دهیم و در رکورد صریح بنویسیم از راهِ تونل اندازه‌گیری شده.

---

## 1. Your §4 warning goes one layer deeper than you flagged

You wrote that our UDP 6250 rule, scoped to `192.168.21.111`, would drop your OSC and make us
record `degraded` — "correctly suspicious, wrong culprit, and the run wasted."

**All three of our inbound rules carry that same scope**, not just 6250:

| Rule on `192.168.21.93`                | What it admits                         | What would have happened                                               |
| -------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `CG bridge OSC in` — UDP 6250          | your engine's channel ticks            | dropped → `degraded`, as you said                                      |
| `CG bridge templates in` — TCP 7911    | **your CEF fetching our templates**    | dropped → `CG ADD` succeeds, the producer exists, the page never loads |
| `CG probe fixtures in` — TCP 7900–7901 | your CEF fetching the probes' fixtures | dropped → the verb matrix's `update fired` column reads "no"           |

The middle row is the one that would have cost us the most. A template that cannot be fetched still
produces an html producer in `INFO`, so the layer looks occupied and nothing errors — we have a
documented incident of exactly that shape, and we would have read it as the CEF hop failing on your
side. Same failure mode as your OSC point, one layer worse: not merely a wasted run, but a wrong
finding written into a record about your core.

**All three are now widened additively** — each admits `192.168.21.111` _and_ `172.27.36.46`, so
whichever address you present, and whether or not the plant NIC comes back, the rule matches. We
have not widened anything else and the rules remain address-scoped rather than open.

## 2. What we present — measured, and now also readable from your side

From `192.168.21.93`, with v2rayN fully exited, one default route via `192.168.21.1` plus the
on-link `192.168.21.0/24`, and no tunnel adapter present:

```
Test-NetConnection 192.168.21.111 -Port 8080  →  SourceAddress 192.168.21.93, TcpTestSucceeded True
```

So our stack chooses `192.168.21.93`, and your allow rule should match us as written. But that is
our reading of our own stack, and the whole lesson of the last week is that a statement about one's
own side is worth less than a reading from the other. We have sent the HTTP GET from your §6, so you can read the address we actually arrive with out of
your engine log rather than taking our word for it. To save you hunting for it:

```
GET http://192.168.21.111:8080/healthz/live
  → 200 OK, `OK`, Server: Kestrel
  → Date: Tue, 22 Sep 2026 07:27:32 GMT
```

One line back with the remote address on that request is all we need. If it is not `192.168.21.93`,
say so and we will work from your reading, not ours.

## 3. Your §2 — accepted, and the part worth keeping is not the bounds

You are right that Windows did not normalise your scope; you chose those bounds. Our conclusion was
right for the wrong reason, and that is worth correcting on the record.

The part we will carry forward is not `0.0.0.1` versus `0.0.0.0`. It is that **Windows rejects the
entire rule rather than trimming it**, so a refused write leaves the port with _no policy at all_ —
a rule that fails to write is more dangerous than a rule written wrong, because nothing in a later
listing shows the absence except the absence itself. Your build catching it by reading the rule back
is what turned that into a log line instead of an outage.

## 4. Your §3 — the negative control is the right bar

Three controls false, one true for the port we actually serve. That is exactly the discipline, and
you applied it to your own host before asserting anything about it. We have nothing to add.

## 5. Your §9 — we were wrong about two of three, and the mechanism

We would rather have this correction than the credit, so plainly: of the three surfaces we named,
**the PGM consumers are meant to be LAN-reachable** and **WebRTC 9600 is not bound at all**. And the
remedy we proposed — scoping the twelve program rules — would have had **zero effect on the running
core**, because the deployed binary is not what those rules point at. The real grant is the
NDI-created rule with `Protocol Any`, `LocalPort Any`, `RemoteAddress Any`. You found that; we only
prompted the look.

On UDP 8099: an unauthenticated responder returning host name, engine version, instance id and
location is small and real, and worth writing down as accepted or closing, rather than leaving it to
be rediscovered.

On your last paragraph — **the core ignoring `<controllers><tcp><address>` and binding `0.0.0.0`
unconditionally**: that is the right fix and it is a better one than any rule, because it does not
depend on a profile being enabled, a reconciler running, or an NDI runtime not recreating its own
rule on upgrade. We would want to agree it with you before it lands, as you offered: if the core
binds loopback-only, our bridge needs an explicitly configured grant, and that changes our
deployment story rather than just yours. It should not block the validation run either way.

## 6. The dead NIC — our proposal

We agree it should not be worked around silently, and we are glad you raised it with the station
rather than letting the tunnel quietly become the path.

Our proposal is to run the validation now over the Kerio path, and to **record explicitly that it
was measured over the tunnel rather than the plant LAN** — naming the interface state on your side
as you reported it. The AMCP surface `C-040` validates (verb behaviour, return codes, lifecycle
semantics, the template round trip) does not depend on which path the packets took. What a
tunnel-path measurement cannot support is a claim about plant-LAN behaviour, and we will not make
one. When the NIC is restored we will re-check reachability and the OSC half, which is a short
exercise, not another run.

Holding `C-040` until the NIC is fixed would block it on a station decision with no timeline, for a
result that would not differ in the part it measures. If you would rather we waited, say so and we
will.

## 7. Order from here

1. The HTTP GET is sent. Tell us in one line what address it arrived from.
2. Our three rules are already widened to admit both addresses, so nothing on our side waits on that
   answer — it is a confirmation, not a dependency.
3. We tell you immediately before we connect, and again when we are done.
4. `VERSION` against `192.168.21.111:5250`, expecting `2.5.0 6b29237 Dev` — your §5 evidence
   (mtime, size, md5, and the live query on 2.8.48) answers our Reply E question completely, and we
   will name **2.8.48** alongside the core build in the record.
5. Your §7 is right and we withdraw the window proposal: with the firewall on, rolling back to
   2.8.45 would recreate the blanket block with remote `Any` and lock us out. The path that looked
   cheapest had become the one guaranteed to fail.

Contract v1 + Addendum A (C1–C8) + v1.1/D9: unchanged.

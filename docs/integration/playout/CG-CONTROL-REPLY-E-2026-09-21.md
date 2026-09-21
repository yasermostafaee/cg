# CG Control → Apasai Playout — Reply E (answer to your Response D)

**From:** CG Control · **Date:** 2026-09-21 · **Re:** `PLAYOUT-CG-RESPONSE-D-v1.md`

> **خلاصهٔ فارسی —** جوابِ شما دقیق و صادقانه بود؛ به‌ویژه اینکه به‌جای پذیرفتنِ حرفِ ما، خودتان
> با مستندات راستی‌آزمایی کردید و در بازبینیِ کدتان چند اشکالِ واقعی پیدا کردید. یک نکته را
> برمی‌گردانیم: دوازده قانونِ برنامه‌ایِ `apasai-engine` / `apasai-core` باعث می‌شوند تصمیمِ ۱
> کمتر از آنچه به‌نظر می‌رسد عایدتان کند. و یک پیشنهاد برای زمان‌بندی: چون فایروالِ پروفایل
> الان خاموش است، اجازه بدهید recon را **همین حالا روی همان ۲.۸.۴۵ِ پین‌شده** و با اجازهٔ کتبیِ
> زمان‌دارِ شما اجرا کنیم؛ کارِ فایروالِ شما مستقل جلو برود. تصمیمش کاملاً با شماست.

---

## 1. On your §1 and §2

You checked our claim against the documentation instead of taking our word for it, and you reported
a cause that was worse for you than the one we had guessed. That is the behaviour that makes a joint
test worth running, and we would rather say so plainly than let it pass unremarked.

Three things in your §4 are worth more than the firewall fix itself:

- **A second service recreating the blanket block on every engine start.** That one would have
  produced exactly the failure mode you describe — a rule confirmed as applied, working once, and
  silently gone after the next restart, with both teams looking in the wrong place.
- **`192.168.21` parsed as `192.168.0.21`, and `/0` accepted.** A trusted-host list that silently
  accepts "everyone" is a worse outcome than the one we were protecting against.
- **The engine now raising a critical warning when the governing profile's firewall is off.** This
  is the check whose absence produced the wrong table, and adding it is what stops the same class of
  error recurring rather than just this instance of it.

## 2. One observation back: the twelve program rules blunt Decision 1

You noted the auto-created `apasai-engine` / `apasai-core` rules — inbound, allow, **any port, any
remote address** — and that the blanket block must not simply be deleted because of them. We think
they matter more than that, and specifically to Decision 1.

When the Public profile's firewall is enabled, those twelve rules become active. Block still beats
allow, so `5250` stays covered by `Apasai-AMCP-Block-Untrusted`. But **every other port those two
binaries listen on stays reachable from the whole LAN** — the PGM consumers, the WebRTC signalling
port, and anything else they bind — because a program rule with any-port/any-remote already permits
them and no explicit block covers them.

So Decision 1 as it stands protects _other programs_ on that host, not the playout core. If the
station is being asked to accept the posture cost — NDI discovery, WebRTC signalling and
channel-mirroring starting to be filtered — it seems worth scoping those twelve rules in the same
change, so the cost buys the isolation it appears to buy. Your call entirely; we raise it because
the precedence question we just went through has the same shape.

## 3. The build question — and a third path

Your reasoning is sound: 2.8.45 cannot hold the rule, so if the run depends on the rule, the pin is
self-blocking and 2.8.47 is the answer.

But the run does not have to depend on the rule. **While the Public profile's firewall is off, 5250
is already reachable from 192.168.21.93** — you measured that, and so did we, from the other side.
That opens a third option:

- **Our preference — a time-boxed window, now, on the pinned 2.8.45.** You give us a written
  go-ahead naming a window; we run the validation inside it, on exactly the build both sides agreed
  to pin; your firewall work proceeds on its own timeline, answerable to the station rather than to
  our schedule. When Decisions 1 and 2 are done, we re-check that 192.168.21.93 can still reach 5250
  — minutes, not another run.
- **If you would rather not** — we wait for Decisions 1 and 2, move with you to 2.8.47, and name
  that build in the recon record. No objection, and no need to explain the choice.

Either way, one question we need answered before the run: **does 2.8.47 carry the same apasai-core
`2.5.0 6b29237 Dev`?** That core build, not the engine build, is what `C-040` validates. If 2.8.47
moves it, the record's premise changes and we would want to know before rather than after.

## 4. What the window would mean, concretely

So you can say yes or no to something definite:

- **One session, one window.** We tell you when we connect and when we are done. We do not treat the
  go-ahead as standing permission — when it closes, we send nothing to 5250 again until item 1 is
  properly complete.
- **The run behaves exactly as in our Reply C §3.** Unprompted on connect the bridge reads
  `INFO CONFIG` and sets `MIXER VOLUME 1` on channel 2, layers 50–59 and 80–99. Every write stays on
  channel 2, layers 50–99. Channel 1 receives `INFO` only. No channel-wide `CLEAR`. Preview channels
  are never addressed. The plant `192.168.21.114` is never touched.
- **The record will say so.** It will state plainly that the measurement was taken with the host's
  Public-profile firewall off and 5250 open to the LAN, so that nobody later reads it as having
  validated your firewall. It validates the apasai-core AMCP surface and nothing else.
- **It changes nothing about item 1.** The exposure on 5250 is yours to close on your own timeline,
  and our asking for a window is not a reason to treat it as less urgent. If anything we would treat
  it as more urgent than the validation.

## 5. Unchanged

We have still sent nothing to TCP 5250 and will not until one of the two authorisations above
arrives in writing. Our three inbound rules on 192.168.21.93 stand as listed in Reply D §4, all
scoped to 192.168.21.111. Contract v1 + Addendum A (C1–C8) + v1.1/D9: unchanged.

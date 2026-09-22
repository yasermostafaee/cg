# Recon — apasai-core `2.5.0 6b29237 Dev` validation on the test Playout (C-040, measurable half)

**Measured 2026-09-22 by `APASAI-CORE-RECON-01 v2`** from the bridge host `192.168.21.93`
against the Apasai test Playout `192.168.21.111`. Companion to
[2026-07-28-casparcg-250-validation.md](2026-07-28-casparcg-250-validation.md), whose shape,
instruments and comparison tables this record reuses so the two can be read side by side.

- **Core build measured:** `2.5.0 6b29237 Dev` — apasai-core, the Playout team's CasparCG fork.
  This is the build `C-040` exists to validate.
- **Engine build at measurement time:** **2.8.48**, named by the Playout team in
  [`PLAYOUT-CG-RESPONSE-E-v1-revised.md`](../integration/playout/PLAYOUT-CG-RESPONSE-E-v1-revised.md)
  §8 — not by us. The 2.8.45 pin was abandoned because that build recreates its blanket firewall
  block on every start and could not hold the allow rule (their Response D §4). Their §5 states
  the core binary is byte-identical across the engine move (mtime, size, md5 and a live `VERSION`
  on 2.8.48), so the premise of this record is the one both sides agreed.
- **Authorisation:** shape **(b)** — item 1 properly complete. The allow rule is in force AND the
  governing profile is enabled. Not a time-boxed window over an unenforced firewall; see §0.3.

**Headline.** Every AMCP behaviour this repo has ever measured against stock CasparCG reproduces
on apasai-core, field for field: the ADR-0006 verb matrix, the subset sweep's return codes and
both of its shared quirks, and the lifecycle three-way diff. OSC reaches a non-loopback AMCP
client, so a bridge at `192.168.21.93` reads **`healthy`**, not `degraded`. A template was served
from our own HTTP server, fetched by their CEF, rendered, updated and removed. **Nothing in the
AMCP surface `C-040` depends on differs from stock 2.5.0.**

---

> 🔴 **CORRECTION — 2026-09-22, `CHANNEL-RESOLUTION-01`. THIS RUN WROTE TO THE PARTNER'S
> PROGRAMME CHANNEL, AND THIS RECORD SAID IT DID NOT.**
>
> §9 below concluded _"their channel 1 is exactly as found"_ and §12 item 6 concluded _"air was
> not disturbed"_. **Both were false.** This bridge **created** six template producers on the
> Playout's channel 1 — layers 59 and 95–99 — at 11:13:36, and cleared them at 12:49:21. The
> six `html` producers §9 describes as ones the bridge _"adopted"_ and _"found"_ on their
> channel were **ours**. The conclusion that their channel was untouched was drawn from a
> baseline sampled **after** our own writes, which is the method failure it was: an `INFO` taken
> after the fact cannot tell a producer we made from one that was already there.
>
> The cause is found, measured and fixed — the restore path took its channel from a console tab
> replaying a stack it remembered from a **different station**, and compared it to nothing. The
> full correction is §9.1; the finding and its fix are `CHANNEL-RESOLUTION-01`.
>
> **Everything in §§1–8 stands.** Those are AMCP behaviour measurements on channel 2 and the
> defect does not touch them. What is retracted is this record's account of what happened to
> channel 1, and nothing else.

---

## 0. Environment — located and verified, not assumed

### 0.1 Our side: no tunnel, one route

The July lesson that a VPN makes every reachability reading void
([caspar.md](../prd/caspar.md) `C-040`'s pre-flight note) is why this section exists. Measured
before anything else:

| check                                | reading                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| adapters `Up`                        | exactly one — `Ethernet`, Realtek PCIe GbE, ifIndex **23** |
| default routes (`0.0.0.0/0`)         | exactly ONE row — ifIndex 23, next hop `192.168.21.1`      |
| `192.168.21.93`                      | ifIndex 23, `AddressState Preferred`                       |
| `Get-Process v2rayN, xray, sing-box` | **none**                                                   |

No `singbox_tun`, no wintun, no TAP. The default route's ifIndex is the LAN adapter's, so there
is no more-specific tunnel route to mislead a probe.

### 0.2 The two controls — and the failure SHAPE that carries the meaning

| probe                          | result                         | elapsed    | reads as                                   |
| ------------------------------ | ------------------------------ | ---------- | ------------------------------------------ |
| `192.168.21.111:8080` positive | `True`, source `192.168.21.93` | **6.8 s**  | the LAN path is real and sourced correctly |
| `192.168.21.111:9999` negative | `False`                        | **26.1 s** | dropped — nothing fakes the handshake      |
| `192.168.21.111:5250`          | `True`, source `192.168.21.93` | **6.5 s**  | the allow rule admits us                   |

⭐ **The negative control's SHAPE is itself a finding, and it is independent evidence for their
§3 claim.** On 2026-09-21 (Reply D §2) port 9999 answered with a `RST` in **3.7 ms** — a live host
with a closed port and no filtering. Today the same port **times out at 26 s**. A fast reset and a
long silence are opposite readings: the reset said "their firewall is not enforcing", the timeout
says "it is". That transition is exactly what their Response E §3 log pair claims happened, read
from the outside and without taking their word for it.

### 0.3 Their side, as they state it in writing

From
[`PLAYOUT-CG-RESPONSE-E-v1-revised.md`](../integration/playout/PLAYOUT-CG-RESPONSE-E-v1-revised.md)
§§1–3 — **quoted, not measured by us**, because a rule listing on their host is not ours to read:

- `Apasai - Allow AMCP from trusted hosts` — enabled, inbound, TCP 5250, remote `192.168.21.93`.
- `Apasai - Block untrusted playout-core AMCP` — the whole address space **minus** `127.0.0.0/8`,
  `::1` and exactly `192.168.21.93`; the bounds stop at `…-192.168.21.92` and resume at
  `192.168.21.94-…`. The old remote-`Any` block no longer exists. They did not out-rank the
  block — they removed our address from it.
- **All three profiles enabled** (Domain/Private/Public `True`), printed beside the listing. This
  is the half that was false in Response C, and §0.2's timeout is our independent read of it.

### 0.4 Our inbound rules — measured, not assumed

Reply G claims all three were widened; verified on this host rather than trusted:

| rule                     | proto / port  | remote scope                         |
| ------------------------ | ------------- | ------------------------------------ |
| `CG bridge OSC in`       | UDP 6250      | `192.168.21.111`, **`172.27.36.46`** |
| `CG bridge templates in` | TCP 7911      | `192.168.21.111`, **`172.27.36.46`** |
| `CG probe fixtures in`   | TCP 7900-7901 | `192.168.21.111`, **`172.27.36.46`** |

All enabled, inbound, Allow. 🔴 **Recording that this was checked is not a formality.** Their
Response F §4 warned that a rule scoped only to `192.168.21.111` would have dropped their OSC and
our template fetches, manufacturing a `degraded` reading and a take-404 shape that both look like
faults in apasai-core. A `degraded` result from a run that had not verified this would have been
worthless.

### 0.5 The path question is OPEN, and this record does not settle it

Their revised Response E §6 and Response F §4 report the plant NIC on `192.168.21.111` as
**down** (`MediaConnectionState Disconnected`, address `Deprecated`), everything routing via the
Kerio tunnel, and `Find-NetRoute` on their host resolving our subnet to source **`172.27.36.46`**.

**What we measured is not obviously consistent with that.** Every TCP connection their host made
to our template server arrived with peer address **`192.168.21.111`** (§7), and our own socket
sourced from `192.168.21.93` throughout. So from our side the two hosts appear to be addressing
each other by their `192.168.21.0/24` addresses.

⚠ **Stated as an open question rather than resolved**, because the two readings are taken from
opposite ends and only one end can see its own routing table. Either the NIC recovered between
their audit and this run, or the Kerio path preserves source addresses. **One line back from them
settles it, and it is worth asking:** the widened rules mean the run was correct either way, but
which address they present decides whether the widening can ever be narrowed again.

⚠ **What this therefore does NOT establish:** any claim about plant-LAN behaviour specifically.
The AMCP surface measured below — verbs, return codes, lifecycle semantics, the template round
trip — is path-independent and stands whichever way the packets travelled. A reachability and OSC
re-check is owed once the NIC state is settled; that is minutes, not another run.

---

## 1. Identity — `VERSION` — **MEASURED: PASS**

Raw AMCP, no bridge, via `tools/spikes/amcp-poke/amcp-poke.mjs` — the same instrument July used
(evidence: `b1-version.ndjson`):

```
> VERSION
< 201 VERSION OK
< 2.5.0 6b29237 Dev
```

The expected build, first contact, ~3 ms. The record's premise holds.

## 2. `INFO` / `INFO CONFIG` — topology, consumers, OSC config

Four channels, all `1080i5000 PLAYING` (evidence: `b2-info-config.ndjson`).

| channel      | consumers declared                                                                                         | ours?                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1 `آپاسای`   | `pgm` 9250 · **`decklink` device 1** (embedded audio) · `ffmpeg` → `rtp://239.20.1.1:20000` · `ndi` APASAI | NO — their programme channel, SDI and RTP live |
| 2 `cg-test2` | `pgm` **9251** · `ndi` APASAI-CGTEST2                                                                      | YES — created for us                           |
| 3            | `pgm` 9350                                                                                                 | preview                                        |
| 4            | `pgm` 9351                                                                                                 | preview                                        |

⭐ **Channel 2 carries no DeckLink and no RTP output** — writes there reach a JPEG stream and an
NDI sender, not SDI. That is what makes it a safe target, and it is worth knowing before anyone
reuses this channel assuming "test" means "harmless".

⚠ **The `pgm` port formula is not uniform.** Channel 1→9250 and 2→9251 follow
`9250 + index − 1`, but channels 3 and 4 use **9350/9351**, which is why their firewall allows
both `9250-9269` and `9350-9369`. Do not compute a preview channel's port from the first rule.

**The `<osc>` block** — the configuration behind §6's question:

```xml
<osc>
  <default-port>6250</default-port>
  <disable-send-to-amcp-clients>false</disable-send-to-amcp-clients>
  <predefined-clients>
    <predefined-client><address>127.0.0.1</address><port>6250</port></predefined-client>
  </predefined-clients>
</osc>
```

`disable-send-to-amcp-clients` is **false**, so the core is configured to send to each connected
AMCP client's own address — their Q4 answer, now read from the running config. The one predefined
client is their own engine on loopback; there is no entry for `192.168.21.114`.

**Modules:** `<html>` present (`enable-gpu` false, `angle-backend` gl); **`<flash><enabled>false`**
— the Flash-off fact, confirmed. Irrelevant to us: every template we serve is HTML.

## 3. ADR-0006 verb matrix — **MEASURED: IDENTICAL to stock 2.5.0**

`node tools/caspar-amcp-probe/bin/caspar-amcp-probe.mjs --caspar-host 192.168.21.111 --serve-host 192.168.21.93 --channel 2 --layer 80`
(evidence: `probe-verbs-2.5.0-6b29237-apasai-core{,-longwait}.results.json` + `.wire.ndjson`).

| candidate                 | codes 2.5.0 Stable | codes apasai-core | update fired            | exact match | Persian |
| ------------------------- | ------------------ | ----------------- | ----------------------- | ----------- | ------- |
| `cg-add+cg-update`        | 202,202            | **202,202**       | YES = YES               | YES = YES   | YES     |
| `play-html+call-update`   | 202,202            | **202,202**       | no = no                 | —           | —       |
| `cg-add+cg-invoke-update` | 202,201            | **202,201**       | YES (empty)             | no = no     | —       |
| `cg-add+cg-invoke-inline` | 202,201            | **202,201**       | YES (`[object Object]`) | no          | —       |
| `play-html-urlquery`      | 202                | **202**           | no = no                 | —           | —       |

A programmatic field-for-field diff over `amcpOk` / `helloObserved` / `updateObserved` /
`payloadMatch` / `persianIntact` / `received` reports **every behavioural field identical**.
`CG UPDATE` remains the one verb delivering byte-exact Persian JSON to `window.update` — on
apasai-core exactly as on 2.3.2 hardware and 2.5.0 Stable.

🔴 **METHOD NOTE, and the reason there are two evidence files: the FIRST run showed a difference
that was not real.** With the probe's default waits (`load-wait-ms 8000`, `update-wait-ms 4000`,
tuned on LOOPBACK in July) the `cg-add+cg-update` row came back `hello=no`, `match=no`, with
`received` holding the **ADD** payload instead of the UPDATE one. Re-run unchanged except
`--load-wait-ms 20000 --update-wait-ms 10000`, it reads YES/YES/YES/YES. The first candidate is
the first to run and therefore pays CEF's cold start, and this path is a LAN round trip rather
than loopback. **Both files are kept**: the short-wait run is the artifact that would have been
mis-recorded as an apasai-core regression, and the long-wait run is the measurement. ⭐ A timing
default carried over from loopback is not a property of the server under test.

## 4. Subset sweep (b2) — **MEASURED: every comparable row identical, both quirks reproduce**

Raw AMCP one line at a time (evidence: `b2-amcp-subset-apasai-core.ndjson`), mirroring July's
script with the substitutions named below.

| command (shape)                       | 2.5.0 Stable           | 2.3.2 plant            | apasai-core                |
| ------------------------------------- | ---------------------- | ---------------------- | -------------------------- |
| `VERSION`                             | `201 VERSION OK`       | `201 VERSION OK`       | **`201 VERSION OK`**       |
| `INFO`                                | `200 INFO OK`          | `200 INFO OK`          | **`200 INFO OK`**          |
| `PLAY 2-80 [HTML] "<http url>"`       | `202 PLAY OK`          | `202 PLAY OK`          | **`202 PLAY OK`**          |
| `CG 2-80 ADD 0 "<http url>" 0 "{…}"`  | `404` (file://)        | `404` (file://)        | **`202 CG OK`** — see ⚠    |
| `CG 2-80 PLAY 0` (nothing on layer)   | `202 CG OK`            | `202 CG OK`            | **`202 CG OK`**            |
| `CG 2-80 UPDATE 0 "{…}"` (no CG page) | `403 CG UPDATE FAILED` | `403 CG UPDATE FAILED` | **`403 CG UPDATE FAILED`** |
| `CG 2-80 INVOKE 0 "update" "{…}"`     | `403 CG INVOKE FAILED` | `403 CG INVOKE FAILED` | **`403 CG INVOKE FAILED`** |
| `CG 2-80 STOP 0`                      | `403 CG STOP FAILED`   | `403 CG STOP FAILED`   | **`403 CG STOP FAILED`**   |
| `CG 2-80 REMOVE 0`                    | `403 CG REMOVE FAILED` | `403 CG REMOVE FAILED` | **`403 CG REMOVE FAILED`** |
| `CLEAR 2-80`                          | `202 CLEAR OK`         | `202 CLEAR OK`         | **`202 CLEAR OK`**         |
| `INFO 1` / `INFO 2-80`                | `201 INFO OK`          | `201 INFO OK`          | **`201 INFO OK`**          |

**Both shared quirks reproduce on apasai-core:**

- **`CG PLAY` acks `202 CG OK` on a layer with no CG page** while UPDATE/INVOKE/STOP/REMOVE all
  fail `403`. Client code still must not read `202 CG OK` from `CG PLAY` as proof a template is
  loaded.
- **`INFO <channel>-<layer>` returns the full stage/layer XML** (format, framerate, mixer, audio,
  foreground/background producers) — the 2.5.0 richness, not the plant 2.3.2 build's bare
  `<channel></channel>`.

⚠ **TWO DELIBERATE SUBSTITUTIONS, so the table is not over-read.**
(1) July's `file:///` URLs pointed at a path on the measuring machine; a path on **their** disk
means nothing and would have been a fabricated test, so both URL rows use an `http://` URL on our
own server. **The `CG ADD` row is therefore NOT comparable to July's `404`** — July's 404 was
`CG ADD` rejecting the `file://` scheme, and `202` here is `CG ADD` accepting an `http://` URL,
which is the same thing the §3 matrix measures. The file-scheme rejection was **not tested** on
apasai-core. (2) A `CLEAR 2-80` was inserted after the `CG ADD` row: because the ADD now succeeds,
the following rows would otherwise have run against a resident producer instead of the empty layer
whose behaviour they exist to measure.

## 5. Lifecycle semantics — **MEASURED: three-way identity holds**

`node tools/caspar-amcp-probe/bin/lifecycle-probe.mjs … --channel 2 --layer 80` (evidence:
`lifecycle-2.5.0-6b29237-apasai-core{,-longobserve}.results.json`). Programmatic three-way diff on
`code` / `oscProducer` / JS-lifecycle per step:

**committed-2.3.2 ≡ 2.5.0-Stable ≡ apasai-core — all 11 steps.**

The C-013-relevant contract holds unchanged on the fork: **`CG STOP` leaves the producer RESIDENT**
(`oscProducer: html`, JS `stop` fires, `CG PLAY` resumes with no re-ADD) and **`CLEAR` destroys it**
(OSC goes silent).

🔴 **METHOD NOTE — the same latency class, caught the same way.** At the probe's default
`observe-ms 1200` the FINAL `CLEAR` reported `oscProducer: html` where both July builds reported
`null`, which reads as "`CLEAR` no longer destroys the producer" — a serious-looking regression.
Re-run with `--observe-ms 5000` it reports `null` and the diff is clean. The OSC "producer gone"
update had simply not arrived within a window tuned on loopback. **Both runs are kept.** Two
anomalies, two builds of the same mistake: on a LAN path, a probe's observation windows are part of
the instrument, not part of the subject.

## 6. OSC to a non-loopback AMCP client — **THE question — MEASURED: YES**

This is the one thing `C-040` had to answer by measurement rather than inference. With the recon
bridge connected from `192.168.21.93`, `connections.health` reads:

```json
{
  "state": "healthy",
  "amcpAxisOk": true,
  "oscFreshAt": "2026-09-22T07:44:30.167Z",
  "channels": [
    { "channel": 1, "ticking": true },
    { "channel": 2, "ticking": true },
    { "channel": 3, "ticking": true },
    { "channel": 4, "ticking": true }
  ]
}
```

**`healthy`, not `degraded`.** apasai-core sends OSC to a connected non-loopback AMCP client, as
`disable-send-to-amcp-clients: false` (§2) says it should. **All four channel indices tick**,
including the Playout's preview channels 3 and 4 — which we observe and never address.

**No axis test was needed**, because the question resolved positive. Had it read `degraded`, four
candidate owners were prepared and only one of them is apasai-core: our inbound rule's source scope
(§0.4), the core not sending to non-loopback clients, a tunnel adapter on **their** host swallowing
the send (their own interface table lists `singbox_tun` on `192.168.21.111`), or a bridge-side
reading defect. Recording that list matters even though it was not used: a `degraded` reading
attributed to the fork without eliminating the other three would have been a false finding about
their software.

**Consumer observation.** Health reported channel 2's declared consumers (`pgm`, `ndi`) as both
running, `missing: []`. The bridge ran with `--create-missing-consumers` absent (OFF), so nothing
would have been created regardless.

**No alarm, orphan or occupancy warning was raised for channels 3–4.** The bridge did quarantine
`layer 1-5` from allocation on finding a foreign `ffmpeg` producer there — their content, on their
programme channel, correctly neither allocated nor cleared.

## 7. One template through the real path — **MEASURED: PASS, with the fetch hop proven**

One real Persian template (`زیرنویس (روی آنتن)`, a `lower-third`, id
`5c084b11-67dc-4e25-9051-383a8670afae`) copied read-only into the recon bridge's scratch library,
then `fixedLayers.load` (channel 2, layer 80) → `stack.take` → `stack.update` → `stack.remove`.
All four accepted.

**What `INFO 2-80` showed while it was up** (evidence: `b3-info-2-80-on-air.ndjson`):

```xml
<foreground>
  <file><path>http://192.168.21.93:7911/template/5c084b11-67dc-4e25-9051-383a8670afae?cw=1920&amp;ch=1080</path></file>
  <paused>false</paused>
  <producer>html</producer>
</foreground>
```

🔴 **THE FETCH HOP, which an html producer alone does NOT prove.** A producer exists even when its
URL 404s — that is the take-404 shape of `B-209`…`B-215`, and it is why this run does not accept
`INFO` as evidence of a render. The proof is our own socket table, sampled through the take:

```
2026-09-22T11:16:13.078  peer=192.168.21.111:51537  state=Established  localPort=7911
2026-09-22T11:16:13.082  peer=192.168.21.111:51536  state=Established  localPort=7911
```

**Their host really did connect to our template server and fetch the page.** Five earlier sockets
in `TimeWait` from the same host record §4's deliberately-unserved URL being fetched and failing —
the negative half of the same evidence, and a live demonstration of the take-404 shape.

⭐ **The peer address was `192.168.21.111`, not `172.27.36.46`.** That is the measurement §0.5
turns on, and it is the answer to the question their revised Response E §6 asked us to settle with
an HTTP GET — obtained here from the production path instead.

**What the audit ledger recorded** (and the resolution of an apparent anomaly):

```
07:46:04  actor=recon     action=load    itemId=recon-item-1  slot 2-80
07:46:12  actor=recon     action=take    itemId=recon-item-1  slot 2-80
07:46:21  actor=template  action=stop    itemId=recon-item-1  slot 2-80
07:49:07  actor=recon     action=update  itemId=recon-item-1  slot 2-80
07:52:08  actor=recon     action=remove  itemId=recon-item-1  slot 2-80
```

⚠ **The stack status read `loaded`, not `on-air`, whenever it was sampled — and that is CORRECT.**
The third line is why: **the template itself fired `stop` nine seconds after the take**
(`actor: template`), its own content-driven completion running to its end. The item was on air from
`07:46:12` to `07:46:21` and settled back to `loaded` exactly as designed. Recorded because
"status is not `on-air`" looks like a defect for as long as it takes to find the line that explains
it — and the explanation is that the template-completion path works end to end on this fork.

**`pgm` frame capture — obtained.** `http://192.168.21.111:9251/` serves
`multipart/x-mixed-replace; boundary=apasaipgm` with `image/jpeg` parts. A plain `Invoke-WebRequest`
never returns (an endless stream); a bounded socket read extracted one complete JPEG (SOI at offset
285, 1582 bytes, saved as `pgm-channel2-frame.jpg`). It is small because channel 2 was empty again
by then — it is evidence the consumer serves frames, not evidence of our graphic.

## 8. Additive verbs — read-only

`MIXER 2-80 AUDIOMAP` in its query form, one line, nothing set (evidence: `b4-audiomap.ndjson`):

```
> MIXER 2-80 AUDIOMAP
< 201 MIXER OK
< 0 0
```

The additive verb their Q2 described is present and answers. `webrtc` and the `pgm` consumer are
recorded in §2 from the live config; neither was exercised.

## 9. Teardown — and the one instruction this run REFUSED

Bridge stopped; no listener left on 5280 / 7911 / 7900 / 7901 and nothing on UDP 6250. Channel 2
carries **no layer entries at all**.

~~Their channel 1 is exactly as found: `layer_5` (`ffmpeg`, mid-`transition`) plus six `html`
producers on layers 59 and 95–99.~~ **RETRACTED — see §9.1. The six `html` producers were OURS.**

🔴 **`stack.remove-all` was NOT run, and running it would have been an incident.** The session
plan described it as "channel 2 only by construction". It is not. On connecting, the bridge held
six stack items on their programme channel 1 (layers 59, 95–99) — ~~adopted from producers it
found there~~ **seated there by this bridge itself, §9.1**. `removeAll` iterates the whole
snapshot and removes every item (`caspar-runtime.ts` `removeAll`, the `R-017` all-or-nothing
block), so it would have cleared six layers of **their** channel 1.

⚠ **The refusal was right for a reason the session did not have.** It declined because those
rows pointed at somebody else's channel — which was true, and enough. It did not know the rows
were ours, so it read the situation as "the bulk verb would clear THEIR graphics" when it was
also "this bridge has already put six producers on their air". The correct instinct, the wrong
model; recorded because a good call made on a wrong picture is not a control that can be relied
on twice.

⚠ **The trap is the name `removeExempt`.** All six published `removeExempt: true`, which reads like
"protected". It means the opposite: exempt from the on-air REFUSAL, i.e. removable _without_ being
refused (`#removeExempt` → `#removeRefusal` returns `null`). A reader who takes it as "protected"
concludes the bulk verb is safe precisely when it is most dangerous. `stack.remove` was used on the
single recon item instead; the six were verified still present afterwards, then verified again on
the wire.

**`~/.cg-runtime/` — NOT untouched, and the reason is a gap in the flag set.** Every persisted path
was pointed at scratch, and every file there is byte-identical afterwards **except
`bridge-audit.ndjson`**, which grew by 1,047 bytes: the five entries quoted in §7. **There is no
audit-path flag among the bridge's twelve**, so a recon run cannot isolate its audit trail from the
owner's. Harmless here and fully attributable — every line carries `actor: recon` — but the next
run will do the same, and a run against the plant would interleave recon entries with operational
ones.

⚠ An earlier draft of this check reported **sixteen** modified files. That was an artifact of the
snapshot method: `ConvertTo-Json` → `ConvertFrom-Json` dropped the `+03:30` offset, shifting every
timestamp by exactly 3.5 hours with byte lengths unchanged. Re-compared on size and it is one file.
A whole-directory "everything changed" reading that is uniform is a bug in the instrument.

⚠ **AND THE REASON GIVEN FOR IT IS WRONG.** "There is no audit-path flag among the bridge's
twelve" is false: `--audit-log-path` exists (`bin/caspar-bridge.mjs`, beside `--live-layers-path`)
and has since B-141. The run could have isolated its audit trail and did not, because the session
did not look for the flag before concluding there was none. The observation stands — the owner's
`bridge-audit.ndjson` did grow by 1,047 bytes — but it is a run that missed a flag, not a gap in
the flag set, and the next reader must not go and add one.

## 9.1 — 🔴 CORRECTION: WE WROTE TO THEIR PROGRAMME CHANNEL

_Added 2026-09-22 by `CHANNEL-RESOLUTION-01`, after the Playout team's core log (their Response K
§§3–4) was read against our own. Nothing in this section was known to the run that produced the
rest of this record._

**What happened.** This bridge, configured for channel 2, seated **six template producers on the
Playout's channel 1** — their live programme output — and did it at boot, in one batch, without
an operator intent.

| time (local) | on their wire                                                              |
| ------------ | -------------------------------------------------------------------------- |
| 11:13:36     | `MIXER 1-59 VOLUME 0` + `MIXER 1-95..99 VOLUME 0` — 6 lines, ONE timestamp |
| 11:13:36     | `CG 1-59 ADD 0 "http://192.168.21.93:7911/template/<uuid>" 0 "{…}"`, ×6    |
| 12:49:21     | `CLEAR 1-59` … `CLEAR 1-99` — our clean-up                                 |

That is 12 lines plus 6 clears = the **18** channel-1 references their log counts, and it is all
of them. The six `<uuid>`s are every record in the owner's template library.

**Five corrections to what this record said, each one narrower than the retraction above:**

1. **Six producers were seated on their channel 1 and cleared by us at 12:49:21.** They were not
   adopted, not found and not theirs.
2. **NOT "roughly thirty `MIXER VOLUME 1` lines to their programme channel"** — an overstatement
   this record made about its own traffic. It was **six lines, all `VOLUME 0`**, the load path's
   mute-before-ADD step. The ~30-line unity sweep (`#reassertDeclaredVolumes`) went to **channel
   2**, correctly, on the same connection.
3. **Their empty bank layers on channel 1 reading `1` is the DEFAULT for an untouched layer, not
   evidence of a write.** The Playout team's own controls settle it: `MIXER 1-70`, `3-70` and
   `4-70` all read `1` and none was ever addressed.
4. **No `CG PLAY` reached channel 1, and the `CG ADD` play-on-load flag was `0`** — two
   independent safeguards, which is why six producers existed on their programme channel for 96
   minutes and nothing rendered. Two, and it took both: the flag alone would have been undone by
   any later take on those rows.
5. **The "their channel 1 is exactly as found" conclusion was drawn from a baseline taken AFTER
   our own writes.** The bridge booted and seated at 11:13:36; every `INFO 1` in this record is
   later than that. A baseline sampled after the instrument has acted measures the instrument.
   It is the method failure that let a write look like a pre-existing condition, and no amount of
   care in reading that `INFO` could have caught it.

⭐ **`CLEAR` DOES NOT RESET A LAYER'S MIXER STATE — record this beside the verb matrix.** After
our six clears, `1-59` and `1-95`…`1-99` still read `MIXER VOLUME 0` with no producer behind them.
Our July validation never measured this. **The consequence is the part that matters: a muted empty
layer is indistinguishable in `INFO` from a clean one.** So a `CLEAR` is not a full undo of a
`CG ADD` — cleaning up after this class of defect has to restore the volume explicitly, and an
`INFO` sweep looking for damage will not find the half that is left. `command-builder.ts` already
records that mixer state is channel state surviving `CLEAR` and `CG REMOVE` — measured on
hardware, and relied upon by the mute-before-ADD ordering. What was missing was anyone connecting
that to what a clean-up leaves behind.

**START-UP, NOT SOMETHING LATER IN THE SESSION — settled by measurement, not by waiting.** The two
candidates are different bugs with different fixes: a connection accepted seconds before
`11:13:36` means a start-up emitter, one accepted well earlier means something later in the session
triggered it. The loopback reproduction answers it directly, since it reproduces the batch exactly:

| event on the reproduction's wire                | offset from the AMCP connection |
| ----------------------------------------------- | ------------------------------- |
| AMCP connection accepted                        | 0.00 s                          |
| **the six `MIXER 1-L VOLUME 0` + `CG 1-L ADD`** | **+3.77 s**                     |
| the channel-2 unity sweep (30 lines)            | +5.00 s                         |

**It is a start-up emitter**, and the run's other probes are not in the frame: they ran on `2-80`
between `11:07:13` and `11:12:06` **with no bridge running at all**, and the bridge started after
them. So the prediction for the Playout team's `11:12:00`–`11:16:00` transcript is specific and
falsifiable: `Accepted connection from 192.168.21.93` at roughly **`11:13:32`–`11:13:33`**. A
connection well earlier than that would contradict this reproduction and would have to be
explained rather than explained away.

⭐ **And note the ORDER, which is the opposite of what this record's own "unprompted on connect"
list would lead you to expect: the channel-1 batch lands BEFORE the connect sweep.** The sweep
waits on `INFO CONFIG`; the restore waits only on the session reading healthy. Anyone reading a
wire capture and looking for the announced 30 `MIXER VOLUME 1` lines as the marker for "the
bridge has finished connecting" will have already missed this.

**The cause, in one sentence.** The restore path took its channel from a console tab that replayed
a retained stack remembered from a **different station** — one whose bank is channel 1 — and
compared it to nothing; `#slotForRestore` read `item.slot.channel` verbatim while, on the same
connection, `#reassertDeclaredVolumes` read the configured bank and correctly said channel 2.

**How a recon run reached a stale console at all.** The bridge binds `ws://127.0.0.1:5280` by
default. A Runtime tab left open from the owner's 2026-09-21 session reconnects to that port the
moment anything binds it, and on connect it re-delivers its template library and replays its
stack. That is also why `recon-templates/` held **six** records at teardown when the run placed
**one**: `--templates-dir` worked exactly as intended — the other five arrived over the WebSocket
seconds after boot and the registry persisted them. Both halves of this incident come through a
door the session did not know was open.

⚠ **For the next recon run: move the WebSocket port.** `--port` is the whole remedy and it is one
flag. Pointing every persisted path at scratch — which this run did, carefully — isolates the
FILES and does nothing about the SOCKET, and the socket is where the other station's state came
in. Verified by measurement: with `--port 5281` and everything else identical, channel 1 receives
nothing at all.

### 9.1.1 — OPEN: the layer band is a CONVENTION on our side, not a rule

_Recorded here, not actioned. It is not `CHANNEL-RESOLUTION-01`'s work._

The Playout team audited their own half after our question and found their output layer
(`PrimaryOutput.LayerNumber`) **completely unbounded**: an operator could have typed
`layerNumber="80"` and seated their live programme item on a layer our bank owns. ⭐ **With this
incident's residue on those layers it would have gone to air SILENT** — because `CLEAR` does not
reset mixer state (above), so `1-95`…`1-99` still carry `VOLUME 0` — **with nothing in `INFO` or
in any log to explain why.** Two independently harmless facts meeting: our leftover mute, and
their unbounded layer.

**They have made it a rule in build `2.8.49`** — refused at the API and at the file-write choke
point, with **reads left permissive**, on the principle that a validation rule must never be the
reason a channel fails to come up. That read/write asymmetry is the part worth carrying across:
it refuses the creation of a bad state without making an existing one unbootable.

**Ours is still opt-in.** The bank accepts any layer and `--reserved-layers` is optional, so
nothing on our side refuses a bank declared over somebody else's band — the `CHANNEL-RESOLUTION-01`
fix fences the CHANNEL a restore may name and says nothing about which LAYERS a bank may claim.
Open; no owner assigned here.

## 10. What this run did NOT measure

- **The sign-in path — the entire authentication half of `C-040`.** The five test users
  (`cg-op1`, `cg-op2`, `cg-admin`, `cg-view`, `cg-noch`), channel-permission refusals, and the D9
  revocation round trip are untouched. They belong to `C-037` / `C-038` / `R-066` and need the
  console, not a bridge.
- **Plant-LAN behaviour specifically** — see §0.5. The path question is open in the way described
  there, and the AMCP findings are path-independent.
- **`CG ADD` with a `file://` URL** on apasai-core — deliberately not tested (§4).
- **The plant `192.168.21.114`** — never addressed, in any step.
- **Their preview channels 3–4** — observed ticking, never addressed.
- **Sustained behaviour.** Every measurement here is a single short run; nothing speaks to
  stability over hours, under load, or across an engine restart.
- **Their firewall as a whole.** §0.2 evidences that filtering is now enforced on 9999; it says
  nothing about the rest of their posture, and their own Response E §9 / Response F §1 document an
  NDI-created rule (`Protocol Any`, `LocalPort Any`, `RemoteAddress Any`) that still grants the
  core blanket inbound reachability.

## 11. Instruments

| instrument                                          | used for                                         |
| --------------------------------------------------- | ------------------------------------------------ |
| `tools/spikes/amcp-poke/amcp-poke.mjs`              | §1, §2, §4, §8 and every raw check — July's tool |
| `tools/caspar-amcp-probe/bin/caspar-amcp-probe.mjs` | §3 verb matrix (fixture server on 7900)          |
| `tools/caspar-amcp-probe/bin/lifecycle-probe.mjs`   | §5 lifecycle (fixture server on 7901)            |
| `tools/caspar-bridge/bin/caspar-bridge.mjs`         | §6, §7 — all persisted paths pointed at scratch  |
| a throwaway WS client + socket poller               | §6, §7 — in scratch, not committed               |

⚠ **The session plan stated `amcp-poke.mjs` "no longer exists in the tree" and prescribed a
throwaway TCP client.** It does exist, tracked, at `tools/spikes/amcp-poke/amcp-poke.mjs`, and
using it rather than a fresh client is what makes §1/§4 directly comparable to July's
`b1-version.ndjson` and `b2-amcp-subset.ndjson` — same instrument, same NDJSON shape, same
reader.

Both probes were read before being aimed at someone else's server: each builds its target as
`` `${channel}-${layer}` `` (`run.ts:163`, `escape-sweep.ts:167`, `lifecycle-probe.ts:136`), so
**every `CLEAR` they emit carries a layer** and a channel-wide `CLEAR` is not expressible. That
reading is what licensed them to run at all.

## 12. What the Playout team should hear

1. **Item 1 works.** `VERSION` answered from `192.168.21.93` on the first attempt; the allow rule
   admits us and the block rule does not match us.
2. **Their firewall change is independently visible from outside** — 9999 moved from a 3.7 ms
   `RST` to a 26 s drop between 2026-09-21 and today.
3. **OSC reaches a non-loopback AMCP client**, so the bridge reads `healthy`. Their Q4 answer is
   confirmed on the running system.
4. **The source-address question (§0.5) can be closed by them in one line.** Their host presented
   `192.168.21.111` to our template server throughout, which does not match the `172.27.36.46`
   their `Find-NetRoute` predicted. Our rules admit both, so nothing is blocked either way.
5. **The `pgm` port formula** is not uniform across channels (§2) — worth stating in the contract
   if anyone derives a preview channel's port from it.
6. 🔴 **RETRACTED AND REPLACED — §9.1.** This said _"air was not disturbed: every write landed on
   channel 2 layers 50–99, channel 1 received `INFO` only"_. **It is false, and it is the one
   thing in this record they must hear from us rather than find themselves.** Six template
   producers were seated on **their channel 1**, layers 59 and 95–99, at 11:13:36, and cleared by
   us at 12:49:21. Nothing rendered — no `CG PLAY` ever reached channel 1 and the `CG ADD`
   play-on-load flag was `0` — but that is why it was harmless, not a reason it was acceptable.
   What IS true of the rest: no channel-wide `CLEAR` was sent, and connecting re-asserted
   `MIXER VOLUME 1` on channel 2 layers 50–59 and 80–99 (30 lines) exactly as announced. The
   cause is found, reproduced on a loopback fixture and fixed (`CHANNEL-RESOLUTION-01`); their
   channel 1 still carries `MIXER VOLUME 0` on those six layers, because `CLEAR` does not reset
   mixer state, and we should say so rather than leave them to discover it.

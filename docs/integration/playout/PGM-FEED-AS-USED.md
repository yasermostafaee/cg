# The Playout's `pgm` feed — as CG Control uses it

**Written:** 2026-09-24 (`PGM-RETURN-01`, `C-016`) · **Source of truth:**
[`PLAYOUT-CG-RESPONSE-PGM-FEED-v1.md`](PLAYOUT-CG-RESPONSE-PGM-FEED-v1.md) (the Playout team, from
their core's source and measured on `192.168.21.111`, build 2.8.54), which answers our
[`CG-CONTROL-REQUEST-PGM-FEED-2026-09-23.md`](CG-CONTROL-REQUEST-PGM-FEED-2026-09-23.md). Where this
page and theirs disagree, theirs wins. This page records what CG Control does with the feed; the
code is `tools/caspar-bridge/src/pgm-return.ts`, the change `openspec/changes/pgm-return`.

## The port rule

Programme channel _n_ → **`9250 + n − 1`**. _n_ is the 1-based `casparChannel` of the D4 catalogue
and the token, so channel 2 → `9251`. The bridge computes it in ONE function, `pgmPort`, and nowhere
else; a test sweeps the product source for any other `925x`/`935x` literal.

🔴 **Never `9350 + n − 1`.** That is the same channel's **preview** — the Playout operator's
source, scrub and live-input check — **not air**. A client that read it as programme would show
preview content as if it were on air. The Playout team's first answer named `935x` for the WAV;
their v1 response corrects that: the programme's audio is on the SAME port as its picture.

## What CG Control sends and reads

- **One request, then nothing:** `GET / HTTP/1.1\r\nHost: <host>\r\n\r\n`. The server sends nothing
  until it has read `\r\n\r\n`, reads only the first line, and serves WAV for any path containing
  `/audio` — so the path is `/`.
- **The answer:** `HTTP/1.0 200 OK`, `multipart/x-mixed-replace; boundary=apasaipgm`; each part is
  `--apasaipgm\r\nContent-Type: image/jpeg\r\nContent-Length: N\r\n\r\n`, N bytes of baseline JPEG,
  `\r\n`. **Parts are split by `Content-Length`, never by scanning for the boundary** — a JPEG may
  contain the boundary text.
- **The host** is the Playout's: the one IPv4 `DESKTOP-APPS-01-C` C6 pins for every Playout-bound
  read and the AMCP session, with the name kept in `Host`.

## 🔴 The well-behaved-client rule, and why

**Why:** the feed's HTTP server runs **inside the playout core's process** and is **not hardened**
— no limit on request size, connection count or idle time — and an unexpected error on its network
thread **stops the whole core: every channel off air** (their §5). A well-behaved reader is safe;
anything else is a risk to air on channels this station does not even drive.

| The rule                           | How CG Control keeps it                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| One well-formed request            | Raw TCP, one write of the exact request — no HTTP agent, no keep-alive, no retry-on-same-socket |
| Nothing sent after it              | The socket is never written again; a test holds the recorded bytes to exactly the request       |
| Parts read by `Content-Length`     | A push parser with hard bounds (head 8 KiB, part head 1 KiB, body 16 MiB)                       |
| Close when no longer watched       | The upstream closes 1.5 s after the last console stops watching                                 |
| No idle or silent connections      | No frame for 8 s → the connection is closed and redialled                                       |
| Reconnect with increasing backoff  | 1 s, 2 s, 4 s, 8 s, then every 10 s — reset only after a connection delivered frames for 5 s    |
| At most one connection per channel | One upstream per channel, shared by every console watching it                                   |

## Readable by the whole LAN

The core listens on `0.0.0.0`; the Playout rewrites its firewall rule on every start to allow TCP
`9250–9269` and `9350–9369` from **any** address (their §4). So **the programme picture of every
channel is readable by anyone on the station's LAN**, whatever CG Control does. Limiting it to the
bridge would break the Playout's own clients; that decision is the owner's and the Playout team's.
CG Control's own relay (`/pgm/<n>` on `127.0.0.1:5174`) adds nothing to that exposure: it serves
loopback peers only.

## What CG Control never does

- **It never changes the Playout's PGM settings** (width, JPEG quality, frame rate) and never asks
  an operator to: they apply only after a **Playout reset, which cuts air on every channel**.
- It never reads `935x`.
- It never dials channels ≥ 21: their ports (`9270+`) are outside the firewall rule. The console
  says "No return signal" and the bridge log names the port and the rule.

## Named, not built

- **Audio** — `GET /audio.wav` on the SAME port, `9250 + n − 1`: a 44-byte RIFF header, then
  endless PCM s16le, 2 channels, 48 kHz (their §6). For a later meter or listen button. **Never
  `935x`.**
- **A backup Playout's return.** The relay reads the primary Playout host only.

## Cost, measured

On the CG Control side — the real bridge CLI as its own process, its console server carrying the
relay, a healthy AMCP mock, and a fake feed at 25 fps of 13,111-byte frames (their measured mean);
the bridge's CPU and memory read from the OS. i5-10400, 12 threads, Node 26, 2026-09-24:

| Phase                    | CPU, % of one core | Working set | Private |
| ------------------------ | -----------------: | ----------: | ------: |
| Hidden (no viewer), 30 s |               0.36 |     67.7 MB | 41.2 MB |
| Shown (one viewer), 30 s |               0.21 |     69.0 MB | 42.0 MB |
| Hidden again, 30 s       |               0.41 |     68.5 MB | 41.3 MB |
| Hidden (no viewer), 60 s |               0.26 |     66.3 MB | 39.5 MB |
| Shown (one viewer), 60 s |               1.12 |     67.6 MB | 41.4 MB |
| Hidden again, 60 s       |               0.13 |     66.8 MB | 40.3 MB |

Relayed while shown: **24.9 fps in, 24.9 fps out, 321 KB/s** — no frame dropped. Hidden, the relay
holds no socket and no timer, so its cost there is zero by construction; the hidden figures are the
bridge's own baseline. Shown, the relay's share is inside that baseline's variance: at most about
**1 % of one core, and 1–2 MB**. On the Playout side, the Playout team measured a reader's cost as
below their measurement's resolution (their §5).

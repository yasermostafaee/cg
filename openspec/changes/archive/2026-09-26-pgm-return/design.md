# Design — the PROGRAM return (`pgm-return`, C-016)

The source of truth for the feed is the Playout team's
`docs/integration/playout/PLAYOUT-CG-RESPONSE-PGM-FEED-v1.md`. Where anything below disagrees with
it, it wins. Nothing in this change connects to a real Playout: every test runs against a fake
that reproduces that document byte for byte.

## 1. The wire, as used

|          |                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------- |
| Port     | programme channel _n_ → `9250 + n − 1` (`pgmPort`, the ONE place the number is written)        |
| 🔴 Never | `9350 + n − 1` — the channel's PREVIEW (the operator's source/scrub/live-input check), not air |
| Request  | the client sends first: exactly `GET / HTTP/1.1\r\nHost: <host>\r\n\r\n`, then nothing         |
| Response | `HTTP/1.0 200 OK`, `Content-Type: multipart/x-mixed-replace; boundary=apasaipgm`               |
| Part     | `--apasaipgm\r\nContent-Type: image/jpeg\r\nContent-Length: N\r\n\r\n` + N bytes + `\r\n`      |
| End      | only when the connection closes (a core restart closes it; the client reconnects)              |

**Framing is by `Content-Length`, never by scanning for the boundary.** A JPEG can contain any
byte sequence, including `--apasaipgm`; a boundary scanner would cut such a frame in two. The
parser reads the part head, takes N, and copies exactly N bytes. After the body it tolerates the
trailing `\r\n` (and any further CRLF) before the next `--boundary` line; anything else is a
protocol error, which closes the connection and reconnects with backoff.

Hard bounds on what the parser will hold, so a confused peer cannot make the bridge buffer without
limit: response head ≤ 8 KiB, part head ≤ 1 KiB, part body ≤ 16 MiB (a 3840-wide quality-100 JPEG
fits; the default 640×360 is ~13 KB).

## 2. Why the bridge relays rather than the browser reading the Playout directly

The Playout team notes that `<img src="http://<host>:9251/">` works (it sends
`Access-Control-Allow-Origin: *`). It is not used, for three reasons the relay gives and a
browser `<img>` cannot:

1. **Status.** An `<img>` cannot say "no frame for 2 s". The relay sees every part and knows.
2. **One well-behaved upstream.** N console windows would be N readers of an unhardened server in
   the core's process. The relay is exactly one reader per channel, whose behaviour we control.
3. **Pull-only-when-watched** is enforced at the one place that holds the upstream socket.

## 3. The relay

**Demand is the console's own HTTP connection.** `GET /pgm/<n>` on the console origin attaches a
viewer to channel _n_'s hub; the response stays open and receives each frame as a part. The
PROGRAM pane mounts its `<img>` only while it is shown (the monitor strip is not rendered while
hidden, and hidden is the boot state), so "watched" and "a viewer is attached" are the same fact,
held by the one component that renders the picture. No second watch signal exists to fall out of
step with it.

**Linger.** When the last viewer of a channel leaves, the upstream closes after `lingerMs`
(1.5 s): within "a couple of seconds" of hiding, and long enough that a channel flicker or a
remount does not reconnect.

**One upstream per channel.** The hub keys upstreams by channel; a second viewer shares the first
one's frames. At most one upstream socket exists per channel at any moment — a reconnect destroys
the old socket before the new one is dialled.

**Relayed bytes are untouched.** The relay re-frames each JPEG in its own part (its own random
boundary, so no JPEG can collide with it in the browser's boundary-scanning parser) and writes the
exact bytes it read. No decode, no re-encode.

**A slow viewer drops frames, never queues them.** If a viewer's socket already holds more than
`MAX_VIEWER_BUFFERED_BYTES`, that viewer skips the frame; the next frame goes when it has drained.
Loopback makes this rare; the Playout does the same to us.

**Loopback only.** The route answers `403` to any client whose socket address is not loopback,
whatever the listener is bound to. The console server already binds `127.0.0.1`; this is the
second fence, and the one a test can exercise.

## 4. States, timers and backoff

| State         | Meaning                                                                                | Operator words      |
| ------------- | -------------------------------------------------------------------------------------- | ------------------- |
| `connecting`  | dialling, waiting for the response head, or waiting out a backoff                      | No return signal    |
| `live`        | a frame arrived within `stallMs`                                                       | (the picture)       |
| `stalled`     | the connection is up and no frame arrived within `stallMs` (2 s — 50 frames at 25 fps) | Return feed stalled |
| `unavailable` | the channel has no programme feed port the Playout opens (≥ 21)                        | No return signal    |

- **Connect** is bounded (`connectTimeoutMs`, 3 s), and so is the wait for the response head
  (`headTimeoutMs`, 3 s: the server answers within ~20 ms of the request).
- **No silent connection.** A connection with no frame for `deadMs` (8 s) is closed and
  reconnected. OSC-style liveness guesses are not used: the axis judged is the feed itself
  (golden rule 8).
- **Backoff** after any close or failure: `1 s, 2 s, 4 s, 8 s, 10 s, 10 s …`. The counter resets
  only once a connection has delivered frames for `healthyAfterMs` (5 s), so a server that accepts
  and immediately closes keeps backing off rather than looping at the base delay.
- A state change publishes the whole list of watched channels (`pgmReturn.status-changed`).

**The console never shows a frame it cannot vouch for.** The `<img>` is mounted while the pane is
shown (it IS the demand) and made visible only while the channel's published state is `live` and
the bridge link is live. Any other state hides it and shows the words.

## 5. Addressing

The host is the Playout's host:

- with a Playout configured (`playout.address` / D4), its host name resolved through
  `pinnedIPv4` — the one IPv4 C6 pins for every Playout-bound read and the AMCP session — with the
  name kept in `Host`;
- with none configured (auth off, development), server A's configured host, through the same
  `amcpAddressFor` the AMCP session dials.

It is resolved at each connect attempt, so a changed connection config is picked up by the next
connect; an applied config change also restarts any running upstream at once.

The channel is the on-screen channel (the declared bank's), so `MULTI-CHANNEL-01`'s switching
inherits the relay with no change: a different channel is a different `/pgm/<n>`.

Channels ≥ 21 map to `9270+`, outside the firewall rule the Playout writes on every start
(`9250–9269`). The relay does not dial them; the state is `unavailable`, and the bridge log names
the port and the rule once per watching episode.

## 6. Findings made while building it

- **A detached `<img>` keeps loading a multipart stream.** Chrome does not abort an image's
  request when React removes the element; the relay then sees a viewer that never leaves and never
  releases the Playout feed. The pane removes `src` on unmount (the HTML spec's abort path).
  Measured, not assumed: with that line planted out, `pgm-return.spec.ts`'s release test went red
  — the feed was still open 6 s after hiding.
- **Windows' timer makes a `setInterval(40)` fake a 21 fps fake.** The cost harness first read
  21 fps "relayed" and the cause was the FAKE (a ~15.6 ms tick), not the relay; a deadline-scheduled
  fake runs 24.9 fps and the relay passes all of it.

## 7. Cost, measured

The real bridge CLI as its own process, a healthy AMCP mock, a fake feed at 25 fps of 13,111-byte
frames, CPU and memory read from the OS (i5-10400, 12 threads, Node 26): hidden **0.13–0.41 %** of
one core (the bridge's own baseline — the relay holds nothing), shown **0.21–1.12 %**, memory
**+1–2 MB** with a viewer; 24.9 fps in and relayed, 321 KB/s. The full table is in
`docs/integration/playout/PGM-FEED-AS-USED.md`.

## 8. Named, not this change

- **PGM audio** — `GET /audio.wav` on the SAME port (`9250 + n − 1`): RIFF, PCM s16le, 2 ch,
  48 kHz, endless. For a later meter or listen button. **Never `935x`**, which is the preview's.
- **A backup Playout's return.** The relay addresses the primary Playout host only.
- **Playout-side hardening** of the feed server is the Playout team's, reported to the owner.

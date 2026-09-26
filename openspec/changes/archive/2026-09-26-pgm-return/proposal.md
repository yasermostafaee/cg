# The PROGRAM monitor shows what is on air, from the Playout's own `pgm` feed (C-016, `PGM-RETURN-01`)

## Why

The PROGRAM monitor has rendered nothing since it was drawn: _"No program return … No return feed
is arriving yet."_ `C-016` owns the feed and was never built, so to see what is actually on air
the owner has to ask the Playout team.

The Playout team has now specified a feed that already exists on every client install
(`docs/integration/playout/PLAYOUT-CG-RESPONSE-PGM-FEED-v1.md`, from their core's source and
measured on `192.168.21.111`, build 2.8.54): the core's `pgm` consumer serves each programme
channel as HTTP MJPEG on `9250 + n − 1`, on by default for every programme channel. **Owner
decision, 2026-09-23:** build the PROGRAM monitor from that feed. This change builds the picture
only; the feed's audio (`GET /audio.wav` on the same port) is named and deferred.

The feed has one property that shapes everything here: its HTTP server runs **inside the playout
core's process** and is **not hardened** (no limit on request size, connection count or idle
time), and an unexpected error on its network thread **stops the whole core — every channel off
air**. A well-behaved reader is safe. So the client this change builds is exactly that, and no
more.

## What changes

1. **The bridge reads the feed; the console displays it.** A relay in the bridge
   (`pgm-return.ts`) opens the programme feed of a channel on the Playout's host (the same IPv4
   `DESKTOP-APPS-01-C` C6 pins), as a well-behaved client: one exact request
   (`GET / HTTP/1.1\r\nHost: <host>\r\n\r\n`), nothing written after it, parts read by
   `Content-Length`, the socket closed when nobody is watching, no silent connection kept, and
   reconnects with increasing backoff. The port comes from ONE function,
   `pgmPort(n) = 9250 + n − 1`; the preview port (`9350 + n − 1`) is never addressed.
2. **Same-origin, loopback-only re-serving.** The console server (`127.0.0.1:5174`) answers
   `GET /pgm/<channel>` as `multipart/x-mixed-replace`, relaying the JPEG bytes untouched, which
   an `<img>` shows natively. Non-loopback clients are refused.
3. **Pulled only while watched, one upstream per channel.** The relay connects only while a
   console holds the picture open (the PROGRAM pane is shown — monitors are hidden by default),
   closes within a couple of seconds of the last viewer leaving or the channel changing, and
   shares one upstream between every console on the same channel.
4. **Honest status, in the operator's words.** A new read + publish pair
   (`pgmReturn.status` / `pgmReturn.status-changed`) carries each watched channel's state —
   `connecting`, `live`, `stalled`, `unavailable`. The PROGRAM pane shows the live picture only
   while `live`; otherwise it shows **"No return signal"** (connecting, unreachable, unavailable)
   or **"Return feed stalled"** (no frame within 2 s), and never a frozen frame as if it were live.
5. **Channels ≥ 21** map outside the Playout's firewall rule for these ports (9250–9269): the
   relay does not connect, the pane says "No return signal", and the log names the reason.
6. **Nothing touches the Playout's PGM settings**, and nothing tells the operator to — changing
   them needs a Playout reset, which cuts air on every channel.

## Impact

- `@cg/shared-ipc`: new `channels/pgmReturn.ts` (the status schema, the two channels, the relay
  path). A new request channel joins `runtimeRequestChannelNames`, so an older bridge reports it
  as skew (`B-153`), which is the intended reading.
- `tools/caspar-bridge`: `pgm-return.ts` (the feed reader, the part parser, the relay hub);
  `bridge.ts` (the hub, its host resolution, the route and the publish); `console-http-server.ts`
  (the `/pgm/<n>` route, loopback-only); the CLI (hands the hub to the console server).
- `apps/runtime`: `window.cg.pgmReturn` on both backends (the mock answers "no relay"); the
  PROGRAM pane (`MonitorPanel`, `MonitorStrip`, `useProgramReturn`).
- Docs: `C-016`, `docs/integration/playout/` (the feed as used), the operator guide.
- **Not changed:** the Playout, its settings, AMCP, the template server's route set (ADR 0010
  rule 13), and the monitors' hidden-by-default boot state.
- **Named, not this change:** PGM audio (`GET /audio.wav` on the same port — never `935x`); a PGM
  return from a backup Playout.

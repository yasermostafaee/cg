# dongle-recover

## Why

The owner pulled the Playout's licence dongle on `.32` and put it back (CG Control and CG Bridge `0.11.4`, Playout
`2.9.8`, 2026-10-11, `DONGLE-RECOVER-01`). The Playout's own license rule cleared the whole channel
(`CLEAR <channel>`, LICENSE §4) while he waited. When it came back, the first Play of a STOPPED multi-frame row put
its plates on air with no template behind them. The bridge's `amcp.log`, `2026-10-11T06:37:24Z`:

```
CG 1-59 UPDATE 0 {"__cg":{"take":…,"look":"look-2"}}   << 403 CG UPDATE FAILED   (no CG ADD)
PLAY 1-60 "…mp4" LOOP / PLAY 1-61 "…mpg" LOOP            << 202
CG 1-59 PLAY 0                                          << 202
```

A second, short outage at ~06:44–06:51Z did the same to the stopped single graphic on `1-98`. The cause was
reproduced on the AMCP mock before any change (`dongle-recover.integration.test.ts`):

- **`B-328` — a resident take onto a layer the Playout emptied.** A stop leaves the page resident (C-012), and
  `#loaded` records that. `B-292`'s silence question repairs only layers held ON AIR, so a stopped page wiped by the
  Playout stayed "resident" in the bridge's belief. The next take skipped the ADD and sent the resident route onto an
  empty layer.
- **`B-330` — the bridge's license lagged the Playout's return by up to a minute.** Measured on the reader:
  60 000 ms from the Playout answering `licensed` to the bridge holding it. During that time every take was refused
  with the old sentence: CG stricter than the Playout.
- **`B-329` — the session-refresh refusal was logged once a minute for hours** (408 identical lines), burying the
  lines that mattered.
- **`R-099` — the bridge logged nothing when the license it holds changed,** so the outage had to be read backwards
  from a count.

## What changes

- **`B-328`.** The resident route's first line, the take tell, is the check. CasparCG answers a `CG UPDATE` `403`
  exactly when the layer holds no CG producer (`get_expected_cg_proxy`, `v2.5.0-stable`). On that answer from the
  primary, the row's page is forgotten and the SAME take goes on by the ADD route. The take is not refused, nothing
  is sent on the bridge's own initiative, and a resident page keeps the resident route.
- **`B-330`.** While the held license reads `licensed:false`, the reader reads at the 5 s floor. While licensed, the
  cadence is unchanged.
- **`B-329`.** The first refusal of a run is logged in full. The run's end logs one count with the last time.
- **`R-099`.** One stderr line per change of the license fields a take reads, and of D4's per-channel `playlist` /
  `cgLicensed`.
- **Test-only:** the AMCP mock's `CLEAR <channel>` clears the channel, and its `CG STOP` / `CG NEXT` answer `403` on
  a layer with no page, as the core does.

## Decisions

- **The take's own `403`, not a wider silence question.** On `.32` the silence question never asked about `1-98`
  after its empty-layer take: amcp.log holds no off-cadence `INFO 1`. It also sees nothing on an OSC-less install.
  The core's answer at the take covers both.
- **No banner for a page that was not on air.** Nothing left air. The re-route is logged in one line.
- **No change to any refusal's condition or wording.** The bridge still refuses exactly while the license it holds
  says `false`. Inside the Playout's window, with no clear, nothing changes (S2, pinned).

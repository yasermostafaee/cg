## Context

CG Control currently has one PROGRAM picture, one optional local speaker, one loudness badge and one VU meter. CG Bridge relays server A's core programme feed on physical channel N and reads one protected meter stream from the primary Playout engine. The redundancy system already knows server B, keeps a separate authenticated backup-engine session, and maps each logical station channel N to B's physical mirror M; the monitor path deliberately did not use that information and therefore disappears after failover.

The requested surface resembles Cinegy's two monitor windows: the operator can compare the primary and reserve output, while audio remains a single deliberate listening path. The existing product supports exactly two physical servers, A and B; three-or-more-server redundancy is outside this change.

## Goals / Non-Goals

**Goals:**

- Show A, B, or both programme pictures for the selected logical channel when B has a valid mapped M.
- Keep physical A/B identity stable across failover and show the actual physical channel on each picture.
- Give each picture an independent live/stalled/unavailable state and never present a stale frame.
- Keep exactly one local audio decoder and one meter/loudness surface, explicitly bound to A, B, or the current primary.
- Reuse the existing backup mapping and the backup engine's own session; preserve channel authorization and the one-upstream-per-watched-feed rule.

**Non-Goals:**

- Adding servers C/D or changing the redundancy/failover model.
- Mixing A and B audio, controlling on-air audio, or changing Playout/CasparCG settings.
- Using Playout PREVIEW ports (935x); both pictures are programme returns from 925x.
- Adding a new Playout API. Backup meters use the existing `/api/cg/meters` endpoint and require the same supported Playout floor as that endpoint.

## Decisions

### 1. Physical engine identity is part of every monitor contract

The shared contract adds `PgmEngine = 'A' | 'B'`. Programme tickets, statuses, and meter readings carry the engine; absence is accepted as A only at compatibility parsing boundaries. The console always addresses a logical channel N. CG Bridge authorizes N first, then maps a B request to physical M internally.

This prevents a B physical channel from becoming an authorization bypass and prevents A/N and B/M statuses from colliding in one list. Passing M from the browser was rejected because it would make a presentation client responsible for the station's security mapping.

### 2. Two independent relays share one logical routing seam

CG Bridge owns separate picture and sound relays for A and B. A uses server A/N. B uses server B and resolves N to the current in-force mapped M before opening the upstream. The HTTP route and ticket remain keyed by engine + logical N; the physical channel is never accepted from the URL.

```text
CG Control (logical CH N)
        │ ticket(engine, N)
        ▼
CG Bridge authorization (N)
        ├─ A ───────────────► server A core : 9250 + N - 1
        └─ B ─ map N → M ──► server B core : 9250 + M - 1
```

When the mapping or server-B host changes, B viewers are disconnected and obtain a fresh ticket so no open stream stays attached to the former physical channel. Keeping one relay with a mutable port was rejected because an already-created upstream stores its port and could silently continue showing the wrong mirror.

### 3. One backup meter reader uses only the backup session

The primary meter reader remains unchanged. A second reader targets the backup engine's `/api/cg/meters`, uses only `backupEngine.accessToken()`, accepts events for B's core host/channel M, maps M back to logical N, and tags the reading `engine: 'B'`. Both readers publish through the same scoped control channel; per-socket filtering remains on logical N.

Using the primary token was rejected because Playout tokens are engine-local and correctly return 401 on the other engine. Deriving levels from the relayed PCM was rejected because the existing meter contract is the Playout's post-processing measurement, not an estimate made by CG Control.

### 4. The monitor has display mode and audio source as separate local preferences

The display choice is `A`, `B`, or `A + B`, persisted per console. B choices exist only while a valid mapping exists; if it disappears, the UI falls back to A/current-primary and releases every B resource. In the combined mode, two equally sized tiles are rendered side by side and stack vertically only at the existing narrow breakpoint. Each tile has its own stable server/channel label and signal state.

Audio has one selector: `Follow primary` (default), `A`, or `B`. The existing speaker on/off preference remains separate. The resolved source owns the one audio decoder, loudness badge and VU meter; changing it tears down the old stream before opening the new one. This is clearer than two speaker buttons and structurally prevents accidental mixing. Cinegy's single meter beside multiple pictures supports this model.

### 5. Current-primary changes roles, never labels

`currentPrimary` resolves the `Follow primary` audio choice and may choose the initial single-picture view, but tile labels remain physical `A · CH N` and `B · CH M`. A failover therefore cannot make the same physical feed appear under a different name.

### 6. No resource without a visible/selected consumer

Only visible picture tiles request picture tickets. Only the selected audible source requests sound, and only the resolved meter source subscribes to its engine/channel. Hiding PROGRAM releases both pictures and the selected sound/meter, preserving the existing demand-driven behavior.

## Risks / Trade-offs

- **[Two visible feeds double picture bandwidth]** → Side-by-side is opt-in, each engine still has one upstream per physical channel shared by consoles, and hidden tiles release immediately.
- **[A mapping changes while B is watched]** → invalidate B tickets/status, close B viewers, and remount against the newly resolved M; never keep a frame from the old mapping.
- **[Backup Playout is old or unsigned-in]** → B picture may still work from the core, while B meter remains unknown; the two states are shown independently and A is unaffected.
- **[Failover changes while audio follows primary]** → close the old decoder first, reset meter/loudness to unknown, then open the new engine; no overlap means no mix.
- **[Existing clients/bridges during rolling upgrade]** → new CG Control requires the matching Bridge version as today; parsers continue treating missing engine on old primary readings/status as A for fake/test compatibility.
- **[More than two servers later]** → transport and tile rendering are keyed by engine rather than hard-wired to one DOM box, but the persisted union and station model intentionally remain A/B until redundancy itself supports more.

## Migration Plan

1. Ship the shared contract and Bridge support first in the same versioned installer set.
2. Keep the default visible behavior equivalent to today's single current-primary/A picture; the operator opts into both.
3. Existing sound-on preference remains valid and resolves through `Follow primary`; new display/audio-source preferences have safe defaults.
4. Rollback to the prior matching CG Control + Bridge pair restores the single A monitor without changing Playout or station data.

## Open Questions

None for A/B delivery. Supporting C/D is a separate station/redundancy feature, not a monitor-only extension.

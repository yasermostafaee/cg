# @cg/skew-harness

`B-174` — measures the **PAGE/MIXER skew `k`** against a real CasparCG, on this machine,
automatically, and prints it as a **distribution** over N runs. `B-155`'s `PLAY`-carrying
window rides along behind a flag. **Measurement only: it implements no fix and changes no
product behaviour.**

## One command

```pwsh
pnpm --filter @cg/skew-harness build
node tools/skew-harness/bin/cg-skew.mjs --media-dir "D:\programs\casparcg-server-v2.5.0-stable-windows\media" --with-play-switch
```

Requires a reachable CasparCG (default `127.0.0.1:5250`) and ffmpeg/ffprobe on `PATH` or in
`CG_FFMPEG_DIR`. Flags: `--mode` (default `1080i5000`, set for the run and **restored**),
`--runs` (default 10), `--out` (default `evidence/<stamp>/`), `--host`, `--port`,
`--channel`, `--settle-ms`, `--tail-ms`, `--with-play-switch`.

**The channel is BORROWED, and both of its facts are put back (`C-033`).** Before the first
command the harness reads what the channel is RUNNING (`INFO <channel>`'s `<output>`) and what it
DECLARES (`INFO CONFIG`). If any running consumer carries the channel off the machine (a DeckLink,
NDI, …) it prints a loud notice naming it and every change the run is about to make — the
`SET MODE` that re-initialises every consumer on the channel, the `ADD`/`REMOVE FILE` cycles, the
final `CLEAR` — and waits five seconds before touching anything. After the mode is restored it
re-reads the running set and re-`ADD`s what did not survive, from a **measured** grammar only (a
DeckLink from its own declaration's tokens via the bridge's `missingConsumerAddCommand`, a
`SCREEN`); anything else is reported as missing with the reason, never guessed at, and a consumer
that survived is never touched (an `ADD` at a running index replaces it — `B-208`). The reading
lands in `report.json` under `consumers` and on stderr, one line per fact.

## What it does

1. Generates two **static** high-contrast pattern clips into the media folder (a moving
   source would defeat first-change detection — see `src/ffmpeg.ts`).
2. Builds a real two-look multibox scene (`src/scene.ts`), renders it with the real
   `@cg/template-runtime` bundled into one HTML page, and registers it with an in-process
   `CasparRuntime` — the bridge's own class — pointed at CasparCG **through a transparent
   TCP tap** (`src/wire-tap.ts`) so every run's window can be classified by its verbs.
3. Takes the row, then per run: attaches a **file consumer** to the channel, waits a settle
   period, drives ONE look switch **through `setActiveLook`** — never hand-typed AMCP —
   waits a tail, and detaches the consumer.
4. Reads two probe regions back out of the recording by pixel comparison (`src/analyse.ts`):
   - **probe A** — inside a box that exists in BOTH looks: fires when the MIXER moves;
   - **probe B** — on the mask-hole edge over painted background: fires when the PAGE moves.
     `k = index(B) − index(A)`, converted to channel frames and milliseconds.
5. Prints per-run rows plus min/median/max, and writes `report.json` (full per-frame series
   included) and the recordings into the evidence directory.

## The two guards that make the number trustworthy

- **Probe placement is checked, not trusted** (`probePlacementIssues`) — a probe touching a
  hole edge fires on both transitions and reads `k = 0` by construction.
- **Cadence is checked per run** — this channel has no genlock here and slips under load on
  windows beyond ~2 s (measured; see `DEFAULT_OPTIONS` in `src/run.ts`), and a dropped tick
  between the transitions would silently shorten `k`. A run whose recording is not
  wall-clock-complete is DISCARDED with its reason, never rounded.

## Results land in `docs/prd/bugs-runtime.md` (`B-174`)

The evidence directory is gitignored except each run's `report.json`; the numbers of record
live in the PRD item.

# CG STOP: a graceful exit that leaves the producer resident (C-012)

## Why

Until now the only way to take a graphic off air was CLEAR, which **destroys the producer**. There
was no way to say "run your outro and stand by" — so an item that came off air had to be fully
re-loaded before it could go back on, and the template's own exit animation was never used.

`CG STOP` is that missing verb, and it is now backed by hardware. [[C-011]]'s probe (PR #353) ran
it against **CasparCG 2.3.2 `4de6d18f`**:

| Command                      | Reply          | OSC after    | Template JS                       |
| ---------------------------- | -------------- | ------------ | --------------------------------- |
| `CG 1-45 STOP 0`             | `202 CG OK`    | still `html` | `window.stop` **fired**           |
| `CG 1-45 PLAY 0` (no re-ADD) | `202 CG OK`    | still `html` | `window.play` fired — **resumed** |
| `CLEAR 1-45`                 | `202 CLEAR OK` | **SILENT**   | —                                 |

So the two verbs reach genuinely different end states, and both are legible to the occupancy tap: a
stopped layer reads OCCUPIED, a cleared one reads silent. `window.stop` is wired to
`runtime.stop()` — the graceful outro path, distinct from `remove()`'s synchronous kill — so STOP
plays the template's exit animation rather than yanking the graphic.

## ADR-0006 is extended deliberately, not violated

ADR-0006 froze the command surface to ADD / PLAY / UPDATE / CLEAR. That freeze was an **evidence
rule, not a taste**: the alternatives were unverified on hardware, and shipping a verb whose real
behaviour nobody had measured is how a playout controller acquires a lie. The measurements above
are exactly what the freeze was waiting for, so this records the extension to a fifth verb and the
evidence that justifies it.

## Design decisions

**No new status. A stopped item rests at `loaded`.** That status already means precisely "a
producer is resident on the layer and it is not playing", which is what the hardware shows and what
the operator can act on (PLAY resumes it). Twelve files switch on `StackItemStatus`; every new
member is a new hole in each of them, and this one would carry no information the operator can act
on differently.

The load-bearing part is **retracting the play evidence**. `freshTruth` derives `on-air` from
(producer present + played), and after a STOP the producer is present **forever** — so leaving
`played` set would make a stopped graphic claim ON AIR indefinitely, off real OSC, with nothing to
ever correct it. Clearing it makes the same observation derive `loaded`, which is the truth.

**Nothing waits on the outro.** The ack means CasparCG accepted the command, not that the animation
finished. Outro completion is **not observable from the bridge** — [[B-030]] is precisely a case
where a template's own completion never resolves while OSC keeps reporting `html` — so no timer
chases it and no mechanism assumes it. The item settles on the ack, exactly as an out does.

The honest consequence, stated rather than hidden: for the ~1 s the outro animates, the row reads
`loaded` while the graphic is still visibly leaving. That is the same shape as the existing out
(which settles to `idle` on its ack) and is bounded by the template's own animation. The
alternative — a timer guessing at outro length — would be an invented number pretending to be
knowledge.

**`#loaded` is NOT cleared, unlike `out()`.** That set means "a live producer exists on this slot",
which after a STOP is still true. Keeping it is what makes the resume work: `take()` sees the
producer and issues a bare `CG PLAY` instead of the B-039 re-ADD. Clearing it would force a
pointless re-load and throw away the entire point of the verb. `#adopted` is likewise untouched — a
STOP proves nothing about the layer being clear, so it must not count as adoption the way a landed
CLEAR does.

**One declaration, two surfaces.** [[R-013]]'s `ui/rowAction.ts` means the row declares its actions
once and renders them as both buttons and menu items, so the context menu mirrors STOP for free —
and the existing mirror test picked it up with no new assertion.

## Transitions from a stopped item

| Action     | Result                                                                |
| ---------- | --------------------------------------------------------------------- |
| PLAY       | **resumes** — bare `CG PLAY`, no re-ADD (hardware-proven)             |
| UPDATE     | reaches the resident producer; values apply and show on the next play |
| CLEAR      | destroys the producer — the escalation path, unchanged                |
| REMOVE     | unchanged (CLEARs and drops the row)                                  |
| STOP again | not offered; there is nothing playing to stop                         |

## Frozen

On-air refusal (R-006) — STOP is link-gated exactly like PLAY/UPDATE/CLEAR and its refusal goes to
the command toast. [[B-085]]'s library, [[B-086]]/[[B-087]]'s `unverified` badge, [[B-092]]'s
restore, [[B-093]]'s blind-tap guard, [[B-094]]'s NO OSC indicator and the adopt-CLEAR safety are
all untouched. **CLEAR's behaviour is unchanged** — this is purely additive.

A stopped item also restores correctly with no change to [[B-092]]: it retains as not-played, so a
restore adopts the occupied layer without clearing and OSC re-derives `loaded`.

## CEF

Verified rather than assumed: this adds **no new template-facing code**. `window.stop` →
`runtime.stop()` already exists and ships today, and the CEF bundle-artifact scan covers the exact
emitted bundles that contain it. (Noted separately: `@cg/template-runtime` does not enable the
source-level `cefCompat` lint — only the artifact scan reaches it. Pre-existing, not widened here.)

## Impact

- **Affected specs:** `runtime-caspar-bridge`.
- **Affected code:** `@cg/shared-schema` (intent + audit action), `@cg/shared-ipc` (`stack.stop`),
  `@cg/caspar-client` (reconciler intent), `tools/caspar-bridge` (`CommandBuilder.stop`,
  `stopItem`, route), `apps/runtime` (bridge contract, `WebSocketRuntime`, `MockRuntime` parity,
  `StackRow`/`StackPanel`).

## Decisions

- **Single out-point, not two markers.** One `outPoint` marks where the entrance
  ends / the hold sits / the exit begins — matching Loopic's single outro frame.
  The earlier two-marker model (intro-end + outro-start) left a never-played dead
  region between the markers; the single marker removes that. `play()` plays the
  full `[activeRange.in → outPoint]` (nothing is skipped), then holds.
- **Absent `outPoint` = implicit out-point at the last active frame.** A
  composition with no marker is treated as `outPoint = activeRange.out`: the whole
  timeline is the entrance, the hold is the last frame, the outro is empty. There
  is no separate "no-lifecycle" code path — one model covers both.
- **The default is play-once-and-hold, never a silent loop.** Earlier the
  no-lifecycle path looped the active range forever; that was wrong for a broadcast
  template and surprising. The default is now: play the entrance once and hold.
  Continuous looping is an explicit opt-in — **`loop-cycle` (or `content-driven`)
  with `repeat: 'infinite'`**, not an implicit default. The absent-lifecycle tests
  were updated from "asserts a continuous loop" to "plays once and holds".
- **No separate continuous-loop mode.** An earlier draft added a standalone `loop`
  override (and a preview "Loop / Play once" toggle) that continuously replayed the
  entrance. That is redundant with `loop-cycle` + `repeat: 'infinite'` (with
  `holdMs: 0` it loops the whole timeline), so it was **removed** from the runtime,
  the override (`PlayoutOverride`), and the preview. Looping is expressed only
  through the `repeat` field.
- **New capability, marker inside `activeRange`.** `designer-animation-timeline`
  (owns `frameRange`/`activeRange` + keyframes) is untouched. The lifecycle
  capability adds `outPoint` **within** the active region, so the two specs
  compose.
- **Frozen hold for v1.** The HOLD freezes at `outPoint`. A looping idle while
  holding is a separate opt-in (D-021, `holdLoopStart`) and is not part of this
  change.
- **`mode` is design-time; `holdMs`/`repeat` are playout-time and
  non-persistent.** The mode (what kind of template this is) is authored in the
  inspector and stored. How long it holds and how many times it repeats are
  operator/run decisions, so they are an **override** the runtime accepts
  (`playoutOverride`) — never written back to the template. The preview is one
  consumer (session-only testing); the rundown is the authoritative consumer later.
  The template stores only the play-once defaults.
- **Authoritative live control belongs to the rundown.** `mode`, `holdMs`, and
  `repeat` are overridable at the runtime seam so the rundown (the control app,
  future) can drive them live on air. We do **not** build rundown control now — we
  only keep the params overridable and the preview override non-persistent.
- **The preview binds to the *effective* playout and re-syncs.** The preview's
  controls read `stored defaults + session override`, so they never show a stale
  value when the composition changes (out-point added/removed, mode changed). With
  no `outPoint` the preview shows "no out-point" and disables `auto-out` /
  `loop-cycle` (they have no exit segment to run).
- **Self-running timing, operator does on/off.** `auto-out`, `loop-cycle`, and
  `content-driven` run inside the runtime from the effective `playout`; a looping
  logo (`loop-cycle` + `repeat: ∞`) just loops once played.
- **One driver, repeated.** `FrameDriver`'s `'once'` mode (play a sub-range once
  and stop) is the only building block the controller needs: the IN→hold, the OUT,
  and every repeated cycle/pass are `'once'` runs. There is no unconditional
  full-range loop default and no continuous-loop driver mode; `loop-cycle` /
  `content-driven` loop by **re-running** the `'once'` cycle until `repeat` is
  exhausted (or forever when `'infinite'`). (`FrameDriver` still carries a generic
  `'loop'` primitive, but the lifecycle no longer uses it.)
- **`content-driven` is repeat-aware, computed by the ticker.** `content-driven`
  honors the same `repeat` field as `loop-cycle`: `repeat: 'infinite'` loops the
  content pass forever, `repeat: N` runs N passes then settles. Each pass takes its
  duration from the runtime `durationHook` (recomputed per pass; the ticker
  supplies the real content→duration), and `holdMs` is ignored for this mode. Outro
  duration is exported so the control layer can later schedule precise timed
  auto-out.

### Preview-modal UX decisions

- **App-local design system, not `@cg/ui`.** `@cg/ui` is token-only and barely
  imported; feature components consume the Designer's own `renderer/theme.ts`
  palette (deliberately a darker/bluer chrome than `@cg/ui.chrome`) via
  vanilla-extract, and interactive states (`:hover`/`:active`/`:focus`/`:disabled`)
  live scattered in global `index.css`. Rather than restyle the palette or grow
  `@cg/ui`, the polish adds a **self-contained `Button`/`Callout` recipe under
  `renderer/ui/`** built on `renderer/theme.ts` — no new colours. It is the single
  source for the interactive-state set the app was missing, and is kept clean enough
  to lift into a shared package later if the Runtime app needs it. (Scope decision
  confirmed with the user.)
- **Transport = separate, momentary playout commands — never a toggle.** Each of
  Play / Pause / Stop / Next is one command the operator issues, mirroring on-air
  AMCP control; conflating Play/Pause into a toggle would misrepresent the
  command model and leave Play looking "engaged" while on air. Play folds **resume**
  in (Play = `play()`, or `resume()` when paused) because to an operator "go" is one
  affordance; it still issues a one-shot command and never stays pressed. **Next** is
  disabled when the template has a single step — there is no pagination model yet
  (`runtime.next()` is a stub), so `steps` is 1 and Next stays disabled until
  multi-step templates land. **Reset** is a preview-only helper, grouped apart so it
  is never mistaken for a command that goes to air.
- **Stage prominent, fields scroll, transport pinned.** With many data keys the
  operator must still always reach the transport, so the data form gets its own
  scroll region while the transport + session timing overrides live in a fixed bar.
  The modal (not the form) owns the field values + paused flag so the pinned
  transport can `play()` with the current data while the form scrolls independently.
- **Problems are callouts, not hints.** A missing out-point, a duplicate data key,
  and field validation errors are surfaced as prominent `Callout`s (`role="alert"`
  for errors) rather than muted paragraphs, so they are not buried.

## Risks

- **Backward compatibility.** Existing scenes have no `lifecycle`/`playout`; they
  must behave exactly as before. Covered by an "absent lifecycle" test.
- **Stop before the hold.** `stop()` during the intro jumps to `outPoint` then
  plays the outro; the jump lands on the fully-formed state (a brief pop on fast
  intros is acceptable). A future per-template "reverse-on-stop" option could
  smooth this.
- **Pause on air.** `pause`/`resume` are sync no-arg so `CG INVOKE "pause"` can
  reach them later; standard AMCP has no CG pause. On-air `holdMs`/`repeat` override
  is a control-layer concern (likely a reserved key in the `update()` payload) —
  out of scope here.

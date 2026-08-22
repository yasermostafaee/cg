# Recon runbook — the confidence-grab measurement kit (C-016 · C-023), plus the 2× discriminator and the AMCP probes the repo owes

**Written:** 2026-08-22 (session BN) · **Performed by:** the owner, at the box ·
**Scope:** MEASUREMENT ONLY — no production code, no fixes, no config changes.

> **This document is a form, not a report.** Every table below is EMPTY on purpose. Fill it in at
> the plant; the numbers, not this page, decide what the next session does.
>
> Precedent for its shape: [`2026-07-28-casparcg-250-validation.md`](2026-07-28-casparcg-250-validation.md)
> — recon lives here, is performed at the box, and precedes the change.

---

## 0. Before you start

- **The shell is PowerShell.** Every command on this page is paste-safe there. Nothing uses
  `sed` / `awk` / `grep` / `cut` / `$(...)` / `|| true` / `2>/dev/null`, and **no command uses `<`
  as a placeholder** (it is a reserved operator). Where a number must be substituted by hand the
  page writes a NAMED WORD like `LAYER` or `PROBECH`.
- **Nothing here writes to the programme channel.** The kit never `PLAY`s onto the channel it is
  measuring, and every clear it sends names a layer — never a bare channel-wide `CLEAR`.
- **Three sections, one visit.** §A is the C-016/C-023 grab measurement. §B is the 2× discriminator.
  §C is the set of AMCP probes the repo has already marked unmeasured in its own code. They are
  independent; run whichever you have time for, in any order.

**Record the build first — every section's numbers are only meaningful against it.**

|                          |     |
| ------------------------ | --- |
| `VERSION` (verbatim)     |     |
| channel 1 video mode     |     |
| channel 1 framerate args |     |
| date / operator          |     |

---

## §A — the confidence-grab measurement (C-016, and C-023 riding it)

### A0. Why this is a committed tool and not a script

Owner constraint, 2026-08-21:

> **"This product is not only for one particular network. It may be sold to different networks,
> each of which has different facilities."**

So the deliverable is not "the answer for this plant" — it is a **re-runnable instrument**. An
installer at another station, on a different channel format and a weaker playout machine, runs the
same kit and gets their own numbers. That is why it lives at
`tools/caspar-amcp-probe/bin/confidence-probe.mjs` with a documented invocation, and why C-016's
_"OFF by default and toggleable"_ acceptance is the mechanism by which one product serves both a
station with a monitor wall and a station with none. **Do not design that away.**

### A1. Run it

From the repo root, with the workspace built once (`pnpm --filter @cg/caspar-amcp-probe build`):

```
node tools\caspar-amcp-probe\bin\confidence-probe.mjs --help
```

The measuring run. `PROBECH` is **a channel that carries no air**; if this install has none, leave
`--probe-channel` off entirely and §A5 records itself as skipped — that is a result, not a failure.

```
node tools\caspar-amcp-probe\bin\confidence-probe.mjs --caspar-host 127.0.0.1 --caspar-port 5250 --channel 1 --probe-channel PROBECH --media-root "D:\casparcg\media" --out C:\cg-recon\confidence.json
```

It prints a human summary and writes machine-readable JSON. **Keep both.**

### A2. 🔴 §3.1 — which grab command does THIS build actually have?

The kit does **not** know a grab verb. It asks the server, then tries only tokens the server
itself printed. **If it reports a FINDING, that finding is the answer** — a build with no grab
command is a real result for C-016, and nobody may fill the gap with a plausible command name.

|                                                        |     |
| ------------------------------------------------------ | --- |
| `HELP` output — did it enumerate anything grab-shaped? |     |
| verbs the server named                                 |     |
| verbatim reply to each attempt                         |     |
| ACCEPTED verb (or NONE)                                |     |

⚠ **You will find `ChannelSnapshot` in this repo. It is NOT evidence, and the temptation to use it
is exactly what §3.1's discipline exists to resist.** `docs/recon/ciab-client-tools.json` lists an
`Add / ChannelSnapshot` tool — but that file is the **CIAB client's** tool definitions, a MODIFIED
CasparCG Client, and its own README says the `Add` folder holds _"that product's own tools"_ and to
_"never read a client tool as a server capability"_. Its capture date is unknown and the owner says
it may be out of date. So it is a **hint about where to look**, and if the server's own enumeration
does not name it, the answer is still NONE.

### A3. §3.2 — the cost of ONE grab

Twice: with the channel at rest, and with a template animating. **Whether a frame was dropped is
read from the server's own counters, never from an eye** — the kit captures `INFO` verbatim and
every OSC address the channel emits, before and after, and prints which ones CHANGED. It does not
know what a drop counter is called on your build; the diff is how one gets found.

|                               | at rest | with a template animating |
| ----------------------------- | ------- | ------------------------- |
| n grabs                       |         |                           |
| min / p50 / p95 / max latency |         |                           |
| non-OK replies                |         |                           |
| OSC addresses that CHANGED    |         |                           |
| any counter that grew         |         |                           |

⚠ If the under-load row says SKIPPED, it is because no `--load-template-url` was given. **A rest
measurement must never be written into the under-load column.**

### A4. 🔴 §3.3 — cadence, ≥5 minutes at ~1 Hz

**This is the measurement that decides whether C-016's "~1 s" bar is affordable at all, so it is
the one that must not be shortened.** The kit defaults to 300 000 ms; leave it.

|                                           |     |
| ----------------------------------------- | --- |
| duration actually run                     |     |
| n grabs                                   |     |
| min / p50 / p95 / max                     |     |
| first-half vs last-half latency           |     |
| OSC addresses that CHANGED across the run |     |
| **does any drop count GROW over time?**   |     |

### A5. §3.4 — does it generalise beyond the programme channel? (C-023's whole ride)

C-016 says it outright: _"if this design turns out not to generalise beyond the programme channel,
that is a finding for THIS item"_ — not a licence for C-023 to fork its own grab path. Two
candidate paths, **distinguished rather than assumed**:

**(a) a second channel carrying a `route://` of the live layer** — costs a channel, opens no input
twice. Add `--route-from-layer LAYER`.

**(b) opening the physical input a SECOND time on a spare layer** — add `--input-arg "ARG"`.

🔴 **(b) is session BM's §2.2, and it has been open since.** BM shipped the `live-source-duplicate`
refusal (§6.2) **standing in for** this answer. What the server does here decides whether that
refusal is a **hardware fact** or a **policy choice** — so the verbatim reply is the result in
either direction, and a refusal is as valuable as a success.

|                                              |     |
| -------------------------------------------- | --- |
| (a) `PLAY … "route://…"` reply               |     |
| (a) grab of the probe channel — worked?      |     |
| (b) `PLAY … "ARG"` reply, VERBATIM           |     |
| **(b) verdict: was the input opened twice?** |     |

⚠ The kit **refuses** to run §A5 on the channel it is measuring, and refuses to run it with no
probe channel named. Both paths `PLAY` a producer, and putting one on the programme channel is not
something this page will do without being asked. If you want it measured on air, that is a decision
to make deliberately, not a flag to add.

### A6. §3.5 — the artifact, and where it lands

|                                                     |     |
| --------------------------------------------------- | --- |
| file path (from the grab's reply, or found on disk) |     |
| format / dimensions / byte size                     |     |

🔴 **A FINDING FOR C-016, read from the code and not measured:** the bridge's HTTP server has **no
filesystem root at all**. `tools/caspar-bridge/src/template-http-server.ts` serves exactly one
route — `/template/<id>` — out of an in-memory map, and 404s everything else. So wherever the grab
lands, **C-016's "served over the bridge's HTTP server" needs a route that does not exist yet.**
That is design work for the C-016 session, not a defect. (That file is on the `never-stage` list;
it was read, not modified.)

---

## §B — the 2× discriminator

> **This section reproduces [`2x-live-source-plant-check.md`](2x-live-source-plant-check.md) so one
> visit discharges both.** The reasoning, and the verification of every code claim behind it, lives
> there — read it there rather than re-deriving it here.

**The report:** a video used as a LIVE SOURCE played at ~2× speed, **from the very first PLAY**.

⚠ **THE HYPOTHESIS IS UNVERIFIED, and this section is written so either answer is recordable.**
The hypothesis is that the 2.3.2 ffmpeg producer maps a 25 fps file 1:1 onto a 50 fps channel
(50 ÷ 25 = exactly 2). It is arithmetically exact and consistent with the symptom appearing on a
producer rather than on a page — **but the mapping behaviour has never been measured on this box**,
and whether a template video ever showed the same 2× is not recorded anywhere. **Do not write it
into a report as a cause. Do not fix anything on its basis.**

> ⚠ Pick a scratch layer **no band owns** — outside the Live Source band and outside the
> fixed-layer band. Check the Runtime's layer table first. Substitute it wherever this page writes
> `LAYER`.

A hand AMCP client, with the bridge out of the picture:

```
node tools\spikes\amcp-poke\amcp-poke.mjs --host 127.0.0.1 --port 5250
```

**B1 — the channel.** Send `INFO 1`.

|                |     |
| -------------- | --- |
| video mode     |     |
| framerate args |     |

**B2 — the file's real rate.**

```
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,avg_frame_rate,codec_name -of default=noprint_wrappers=1 "FILE"
```

| `codec_name` | `r_frame_rate` | `avg_frame_rate` |
| ------------ | -------------- | ---------------- |
|              |                |                  |

**B3 — where the file came from.** Importer-produced (a VP8+alpha `.webm` from an asset import), or
an ordinary file from elsewhere? **If the importer made it, record that project's frame rate** —
the importer conforms every output to the project rate via `-r`, deliberately and with a warning
shown, so the project's setting IS the file's rate.

| origin | project `frameRate` (if importer) |
| ------ | --------------------------------- |
|        |                                   |

**B4 — 🔴 THE DECISIVE ONE.** In the REPL, on a layer the bridge does not own:

```
PLAY 1-LAYER "THE-SAME-FILE"
```

| **is it ~2× fast?** (yes / no) |
| ------------------------------ |
|                                |

- **YES** → `cg` is not in the chain. The follow-up is a new PRD item — _report the mismatch_ —
  and **not** a hunt. Stop; B5 and B6 then only pin the ratio.
- **NO** → `cg` **is** in the chain, the hypothesis is dead, and the next session gets a narrow
  hunt: what a hand-typed `PLAY` sends versus what the bridge sends.

**B5 — the control.** A clip whose rate EQUALS B1's figure.

| 50 fps clip — correct speed? |
| ---------------------------- |
|                              |

_Do not skip this. A zero test without a one test as control has cost this project two sessions._

**B6 — what the server says.** While B4's file plays: `INFO 1-LAYER`.

| verbatim |
| -------- |
|          |

---

## §C — the AMCP probes the repo already owes

### C0. Read these two lines before anything in §C

1. 🔴 **A GREEN SUITE IS NOT EVIDENCE HERE.** `@cg/amcp-mock` is the thing that models `PLAY` on an
   occupied layer as an in-place replace in the first place, so it cannot see C2 by construction.
   Until C1 and C2 are measured, **no session may report the switch flash as gone on the strength
   of a green gate.**

2. ⭐ **`B-155`'s CAUSE HAS BEEN REMOVED — so §C measures the RESIDUAL, which is what makes it
   worth running now.**

   |                         |                                                                                                                                                                   |
   | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | ☑ Has the cause landed? | **YES** — session BP, commit `510ea468` on `dev`.                                                                                                                 |
   | What landed             | A row **FREEZES its template assignment at TAKE**. An edit made while a row is on air reaches it at its next take and never inside a look switch.                 |
   | What that means for §C  | A look press can no longer carry a producer change from a lurking assignment. **Anything you still see is the RESIDUAL** — which is exactly what C1/C2 are about. |

   ⚠ This reverses an instruction in the session prompt that produced this page, which said the
   cause "is being removed in a separate session" and told §C to gate C2 and C4 on it. It has
   landed. **All four probes are worth running.** If you are reading a copy of this that still says
   "wait for the collapse", this table is the current fact.

   🔴 **What is NOT removed: the plant measurement.** `B-155` is still OPEN and `tasks.md` 7.15 is
   deliberately unticked. The cause is gone from the wire; **nobody has watched the plant.** C4
   below is that measurement.

### C1 — `MIXER … DEFER` + a channel-scoped `COMMIT`: whose queue does COMMIT apply?

**Where it is written** (`tools/caspar-bridge/src/command-builder.ts:254-260`, the `mixerFit` doc):

> _"ORDER: `FILL` then `CLIP`. They go out in one batch on one connection, which is as atomic as
> this bridge can be today — **whether they land on the SAME FRAME is a separate, open question**
> (§3b: `MIXER … DEFER` + a CHANNEL-scoped `COMMIT`, which this project forbids until it is known
> whether `COMMIT` applies only the deferring connection's queue; on a plant running several
> stations against one CasparCG, a `COMMIT` that applies everyone's is the same harm the
> channel-scope ban exists to prevent)."_

⭐ **The repo already holds weak evidence that the mechanism EXISTS — and none at all about the
question that matters.** `docs/recon/ciab-client-tools.json` has a `Defer` boolean on its mixer
tools and a `Mixers / Commit` tool, and its README says the **`Mixers` folder** is the one part of
that file that _"tracks AMCP's `MIXER` surface closely enough to be evidence about the server"_. So
`DEFER`/`COMMIT` are probably real verbs. **What no client tool list can ever say is whose queue a
`COMMIT` applies** — which is the entire question, and the only reason the project forbids the
mechanism. Do not let the tool list stand in for the probe.

**The probe — two connections, one COMMIT.** Open `amcp-poke` **twice** (two windows = two TCP
connections; this only works with two).

- In window 1: `MIXER 1-LAYER FILL 0.1 0.1 0.5 0.5 DEFER`
- In window 2: `MIXER 1-LAYER2 FILL 0.6 0.6 0.3 0.3 DEFER`
- In window 1 only: `MIXER 1 COMMIT`

|                                      |     |
| ------------------------------------ | --- |
| did window 1's change land?          |     |
| **did window 2's change ALSO land?** |     |
| verbatim replies                     |     |

**Window 2 landing = `COMMIT` is channel-wide across connections = the ban stands.** Window 2 not
landing = `COMMIT` is per-connection, and §3b's one-frame switch becomes available.

### C2 — is `PLAY` on an OCCUPIED layer really an in-place REPLACE on the production 2.5.0?

(Corrected 2026-08-22 — this heading said 2.3.2. That install is RETIRED at `D:\programs\CasparCG`
and must never be probed; the measurement is owed on the production **2.5.0** `69e8ad5`.)

**Where it is written** (`swapLiveSource`'s doc in `tools/caspar-bridge/src/caspar-runtime.ts`):

> _"⚠ **THAT SUBSTITUTION IS UNVERIFIED ON THE PRODUCTION 2.5.0 (task 6.9a).** The mock models `PLAY`
> on an occupied layer as a replace, so the tests prove this code is self-consistent and prove
> NOTHING about the server. It rides with §3b's `DEFER`/`COMMIT` question and 6.3a's `CLIP` probe —
> all AMCP probes on the same build."_

**The probe.** On a layer the bridge does not own, with something recognisable already playing:

- `PLAY 1-LAYER "FIRST-SOURCE"` — let it settle.
- `PLAY 1-LAYER "SECOND-SOURCE"` — **watch the output at the moment it lands.**

|                                         |     |
| --------------------------------------- | --- |
| in place, or a visible tear-down first? |     |
| if a gap: roughly how long?             |     |
| verbatim replies                        |     |

**A visible tear-down is a second candidate cause of the flash**, independent of the assignment
lurk `B-155` was about — which is why this is worth running now that the lurk is gone.

### C3 — the `CLIP` probe (task 6.3a), which rides on the same build

**6.3a(a) — is `CLIP` purely an INTERSECTION mask under PARTIAL overlap?** The repo's own note:
_"🔴 **The code now DEPENDS on the intersection reading**: `liveSourceFit` emits exactly that
geometry on every cropped plate. The mock models it as an intersection, so the offline tests prove
the code is self-consistent and prove **nothing about the server**. Two `route://` producers settle
it; no capture card needed. Deliberately not reasoned out."_

- `PLAY 1-LAYER "route://2"`
- `MIXER 1-LAYER FILL 0.0 0.0 1.0 1.0`
- `MIXER 1-LAYER CLIP 0.25 0.25 0.5 0.5` — then a CLIP that only PARTIALLY overlaps the fill.

|                                                           |     |
| --------------------------------------------------------- | --- |
| does CLIP mask to the INTERSECTION under partial overlap? |     |
| or does it do something else — what?                      |     |

**6.3a(b) — what precision does AMCP accept?** `CommandBuilder` emits at most 6 decimals and never
exponential notation. ⚠ _"6 was chosen to match the page's `css()` so the two sides round
identically — NOT because the server is known to want it."_

- `MIXER 1-LAYER FILL 0.123456 0.1 0.5 0.5` → accepted?
- `MIXER 1-LAYER FILL 0.1234567 0.1 0.5 0.5` → accepted, or rounded, or refused?

| 6 decimals | 7 decimals | what the server did with the extra digit |
| ---------- | ---------- | ---------------------------------------- |
|            |            |                                          |

### C4 — 🔴 `B-155`'s frame count: the plant measurement the fix does NOT supply

`tasks.md` 7.15 asks for the flash **reproduced twice**, with the frame count at 25 fps and the
channel read **EMPTY before and after**.

⚠ **Run this AGAINST THE FIXED BUILD** (`dev` at `510ea468` or later). The question is no longer
"does an assignment edit flash" — that path is closed — but **"does a look switch flash at all"**,
which is C2's replace timing plus §3b's FILL/CLIP framing showing up on real SDI.

|                                             | run 1 | run 2 |
| ------------------------------------------- | ----- | ----- |
| channel read EMPTY before?                  |       |       |
| frames of wrong/black picture at the switch |       |       |
| channel read EMPTY after?                   |       |       |
| what was visible during them                |       |       |

**If the count is zero on both runs**, that is the result that lets `B-155` close — and it is the
only thing that can, because no suite on any machine can see it.

---

## What to send back

The filled tables, and the two files §A wrote (`confidence.json` and the printed summary). **No
diagnosis is wanted.** Each section's numbers decide the next session on their own.

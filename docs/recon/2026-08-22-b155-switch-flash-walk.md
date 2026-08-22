# B-155 — the switch-flash plant walk (owner-run, one sitting)

**What this settles:** `tasks.md` 7.15 (`multibox-layout-switch`) — whether a look switch can
still show the PREVIOUS source in a new look's hole, and the frame counts that either close
`B-155` or reopen it. The cause (the assignment lurk) was removed in session BP; the live-door
serialization landed 2026-08-22 (session BT). **Everything left is a measurement no suite can
take**, because `@cg/amcp-mock` models `PLAY` on an occupied layer as an instantaneous in-place
replace and cannot see a frame of anything.

**The rule being measured (decided, not open):** the new look's hole must NEVER show the previous
source; if the incoming producer is not ready, BLACK is acceptable and the previous guest is not.

**Rides the same visit as** `docs/recon/2026-08-22-confidence-grab-measurement.md` §C (C1/C2/C3
are raw-AMCP siblings of steps 5–6 here; C4 is the same frame count this walk records).

---

## Before you start

- ⚠ **The channel you use must carry NO air.** Every step below assumes nobody is broadcasting
  from it. If the plant is on air on all channels, stop and do this another day.
- 🔴 **Production is CasparCG 2.5.0** (`69e8ad5`). The 2.3.2 at `D:\programs\CasparCG` is RETIRED
  — step 1 verifies you are not pointed at it. Never probe the retired install.
- You need: CG Control (the Runtime SPA) connected to the bridge, the bridge running `dev` at or
  after 2026-08-22 (session BT), a multi-box template with at least a 2-box look and a solo look,
  and a phone that records slow-motion video.
- **The frame-count instrument is the phone's slow-motion camera pointed at the PGM monitor.**
  Check the camera's slow-mo rate in its settings and write it here before starting:
  `slow-mo rate: ______ fps` (typical: 120 or 240).
  Conversion for every table below: **frames at 25 fps = slow-mo frames × 25 ÷ slow-mo rate.**
- The AMCP console used below (all commands are PowerShell-safe; type them exactly, replacing
  the word CHANNEL with your channel number as a digit):

  ```pwsh
  node tools\spikes\amcp-poke\amcp-poke.mjs --host 192.168.21.50 --port 5250
  ```

  Then type AMCP commands at its prompt and press Enter. Ctrl+C exits.

---

## The walk

### 1. Prove the build (INSTRUMENT: amcp-poke)

Type: `VERSION`

- **Pass:** the reply contains `2.5.0`. **Fail:** anything else — STOP; you are on the wrong
  server (the retired 2.3.2 must never be probed), fix the host and start over.

### 2. Channel reads EMPTY, before (INSTRUMENT: amcp-poke)

Type: `INFO CHANNEL`

- **Pass:** no layer lists a producer (an empty stage). **Fail:** something is seated — this
  walk must not start over someone else's content; clear it or pick another channel.

| verbatim INFO reply (before) |
| ---------------------------- |
|                              |

### 3. Eye check, before (EYE: PGM monitor)

- **Pass:** the monitor shows black/empty. **Fail:** anything visible — do not continue.

### 4. THE ORIGINAL REPORT, exactly (EYE + INSTRUMENT: phone slow-mo on the PGM monitor)

This is the owner's 2026-08-21 sequence, verbatim: 2-box → change `l-1`'s source → press
look-1 → go to solo.

1. In CG Control: load the multi-box row and TAKE it on the **2-box** look.
   **EYE — pass:** both boxes show their sources.
2. Change `l-1`'s source in the row's LIVE PLATES picker (the template assignment — the same
   edit the original report made) and apply it.
   **EYE — pass:** NOTHING on air changes (the row is frozen at its take). **Fail:** any box
   changes or blinks — the freeze is broken; stop and report exactly what moved.
3. **Start the slow-mo recording**, then press **look-1**.
   **EYE — pass:** a cut; every box either keeps showing the source it already showed, or is
   black. **Fail:** any box shows a DIFFERENT guest for any moment — that is the flash.
4. Press **solo** (the original report's final step). Same reading, same pass/fail.
5. Stop the recording. Scrub it frame by frame; count slow-mo frames in which any hole of the
   NEW look shows a wrong source, and (separately) frames of black. Convert to 25 fps.
6. Switch back to 2-box and repeat 3–5 once — every count in this walk is **reproduced twice**.

| step 4 (original report)             | run 1 | run 2 |
| ------------------------------------ | ----- | ----- |
| frames of WRONG SOURCE in a new hole |       |       |
| frames of BLACK in a new hole        |       |       |
| what was visible during them         |       |       |

### 5. The adoption door — a re-take with an edited assignment (INSTRUMENT: phone slow-mo)

Step 4.2's edit is still recorded. With the row still on air:

1. Start the slow-mo recording, then press **TAKE** again on the same row.
2. **What to look at:** the box(es) showing `l-1` at the moment of change. The re-take adopts
   the edit by `PLAY`ing the new producer onto the occupied layer — this is the
   occupied-layer replace (task 6.9a / runbook §C2) seen through the product.
   **Pass:** the picture changes in place, or goes black then to the new source.
   **Fail:** the OLD guest lingers FROZEN for visible frames, or the whole graphic tears down.
3. Count the frames between the last good OLD frame and the first NEW frame; note what filled
   them (frozen old / black / garbage). Convert to 25 fps.
4. Edit `l-1` back to its original source and re-take once more — that is run 2.

| step 5 (re-take adoption)          | run 1 | run 2 |
| ---------------------------------- | ----- | ----- |
| frames between old and new picture |       |       |
| what filled them                   |       |       |

### 6. A seat PLAYed INSIDE the switch — the clip case (INSTRUMENT: phone slow-mo)

A `media` clip is the one producer kind the bridge cannot hold across looks: leaving a look
tears its seat down, so RE-ENTERING that look must `PLAY` it inside the switch. That is §A
case 2 — the hole opens onto a layer whose producer has no frames yet.

1. If the installation's source list has no clip entry, add one in CG Control's Live sources
   modal pointing at any short looping file in the server's media folder (remove it at the end).
2. In the row's Inspector LOOK INPUTS, bind the solo look's plate to the clip source and press
   UPDATE. **EYE — pass:** nothing visible changes.
3. Enter solo. **EYE:** the clip appears. Leave solo (back to 2-box) — the clip seat is torn
   down (that is the named fallback, not a bug).
4. Start the slow-mo recording, then re-enter solo.
   **What to look at:** the solo hole in the instant before the clip's first frame.
   **Pass:** BLACK only. **Fail:** the 2-box guests or any other source visible inside the
   solo hole for any frame.
5. Count black frames until first clip frame; convert to 25 fps. Repeat 3–4 once for run 2.
6. Clear the clip binding (UPDATE with the binding removed); remove the temporary catalog
   entry if you added one.

| step 6 (clip re-entry)            | run 1 | run 2 |
| --------------------------------- | ----- | ----- |
| frames of black before the clip   |       |       |
| frames of any OTHER source (fail) |       |       |

### 7. The preset path (EYE)

1. While on 2-box, bind solo's plate to a DIFFERENT live source (a real feed) via the
   Inspector and UPDATE. **EYE — pass:** nothing visible changes (the seat is parked, muted,
   off-frame).
2. Enter solo. **EYE — pass:** the new feed is there at once, already moving — it has been
   decoding since the UPDATE. **Fail:** black or a visible acquire.
   No frame count owed here; one eye reading, run twice.

### 8. The race, best effort (EYE)

Session BT serialized the live doors, so a swap landing mid-switch now runs after the switch.
This reading confirms it on the plant:

1. Press a look and IMMEDIATELY (same second) apply an R-048 emergency swap on one plate — two
   hands, or a second console if a second station is connected to the same bridge.
2. **EYE — pass:** after both settle (a second at most), every visible box shows its intended
   source at its intended size and position. **Fail:** a box black, or a guest at the wrong
   size/position, that does not self-correct.
3. Run it twice. This is a race; a pass is a confirmation, not a proof — note anything odd.

### 9. Out, and the channel reads EMPTY, after

1. Take the row out in CG Control. **EYE — pass:** PGM is black.
2. INSTRUMENT (amcp-poke): type `INFO CHANNEL` again.
   **Pass:** empty stage, as in step 2. **Fail:** a producer is still seated — note its layer
   and what `INFO` says it is, verbatim; that is its own finding.

| verbatim INFO reply (after) |
| --------------------------- |
|                             |

---

## Where the numbers go

1. Fill the tables above at the box — they are the primary record.
2. Copy the 25 fps counts into `openspec/changes/multibox-layout-switch/tasks.md` **7.15** and
   into `docs/prd/bugs-runtime.md` **B-155**, beside the date and the build string from step 1.
3. **If every "wrong source" count is ZERO on both runs of every step, with steps 2 and 9 both
   EMPTY** — that is the measurement that lets `B-155` close and 7.15 tick. Black-only counts
   do not block closing (the rule accepts black); record them anyway.
4. If any wrong-source count is non-zero: do not diagnose at the box. Bring the slow-mo video
   and the filled tables back; the enumeration in 7.15 says which path each step exercises.

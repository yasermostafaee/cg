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

⚠ **It also carries ONE step that is not about `B-155` at all — step 8b, for `B-158`** (the look
switch is not visually atomic: the plates move and the page’s chrome follows). It rides this visit
because it needs the same room, the same channel and the same slow-mo camera — **but it is scored
on its own tables and it can neither tick nor block 7.15.** Wrong CHROME is not wrong SOURCE.

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

### 8b. `B-158` — does the CHROME move with the pictures? (EYE + INSTRUMENT: phone slow-mo on the PGM monitor)

🔴 **A DIFFERENT QUESTION FROM EVERY STEP ABOVE, and it must not be scored on the same sheet.**
Every other step asks _"is the wrong SOURCE ever visible?"_ This one asks _"do the plates and the
page's decoration change on the SAME FRAME?"_ — the background, the strokes around the boxes, the
frame decoration. **Nobody's face is in the wrong hole here.** A non-zero count in this step is a
`B-158` reading and says nothing about `B-155`; a zero here does not tick 7.15 either. Score it in
its own tables below.

**What is being counted:** `k` — the number of frames for which the plates are already at the NEW
look's geometry while the OLD look's chrome is still drawn. Nothing in the repo can measure this;
it is why the step exists.

1. Take the row into the **2-box** look and let it settle.
2. Start the phone's slow-mo recording on the PGM monitor, then press **solo** in the look picker.
   Stop recording once the picture is settled. **This is the case the owner reported.**
3. Step through the recording and count the frames from **the first frame on which a plate is at
   its new size/position** to **the first frame on which the chrome (background + box strokes) is
   the NEW look's**. Convert: `frames at 25 fps = slow-mo frames × 25 ÷ slow-mo rate`.
   - **EYE — what a FAIL looks like:** the big solo picture is up while the 2-box outlines are
     still drawn around it, for one or more frames. Record `k`.
   - **EYE — what a PASS looks like:** `k = 0` — no frame shows the solo picture with the 2-box
     chrome, and none shows the 2-box pictures with the solo chrome. The switch reads as ONE event.
   - ⚠ If the chrome moves FIRST (`k` negative — the new background is up while the plates are
     still at the old geometry), record it as negative and say so. That would invert the mechanism
     `B-158` describes and is a finding in its own right.
4. **Now the reverse: solo → 2-box.** Same recording, same count. It costs one extra press and it
   tells us whether `k` depends on which direction the layout grows.
5. **Run each direction TWICE.** Two runs per direction, four numbers.

| run | 2-box → solo, slow-mo frames | at 25 fps | solo → 2-box, slow-mo frames | at 25 fps |
| --- | ---------------------------- | --------- | ---------------------------- | --------- |
| 1   |                              |           |                              |           |
| 2   |                              |           |                              |           |

| what the wrong frames actually showed (one line, verbatim) |
| ---------------------------------------------------------- |
|                                                            |

⚠ **If `k` reads 0 on all four runs**, say so plainly — it means the gap is below one frame at the
plant's frame rate and `B-158` can be closed as not-reproducible-on-air, whatever the code path
suggests. That is a real outcome and not a failed measurement.

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
   ⚠ **Step 8b’s four numbers go to `B-158` instead**, never to 7.15 or `B-155` — they answer a
   different question (`k`, the chrome lag) and mixing them into the wrong-source record would
   make a cosmetic reading look like a source reading.
3. **If every "wrong source" count is ZERO on both runs of every step, with steps 2 and 9 both
   EMPTY** — that is the measurement that lets `B-155` close and 7.15 tick. Black-only counts
   do not block closing (the rule accepts black); record them anyway.
4. If any wrong-source count is non-zero: do not diagnose at the box. Bring the slow-mo video
   and the filled tables back; the enumeration in 7.15 says which path each step exercises.

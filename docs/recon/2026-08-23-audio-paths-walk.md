# AUDIO — the audio-paths plant walk (owner-run, one sitting)

**What this settles:** every GATED item in `openspec/changes/add-multibox-audio` — the MONITOR /
PFL channel (§3), template-internal box audio (§4), `MASTERVOLUME` (§5) and per-input VU
metering (§6). **None of them may be built until the tables below are filled in.** The shipped
half of that change (the per-plate PGM audio surface) rests on `MIXER … VOLUME`, which this
plant has already proven, and is **not** waiting on this walk.

**Why a walk and not a test:** every question here is about what **CasparCG 2.5.0 on this
hardware** actually does. `@cg/amcp-mock` models what we told it to model — it cannot discover
that a route carries audio, that `MASTERVOLUME` exists, or what shape a peak payload has. A
green suite here would be a green suite about our own assumptions.

**The one fact the whole VU design rests on (already MEASURED, in the source, not on the
plant):** `src/core/mixer/audio/audio_mixer.cpp` sets `state_["volume"]` to a
`std::vector<int32_t>` of **PEAKS — one per AUDIO channel (L/R), maximum across ALL mixed layers
of that video channel**. It surfaces as `/channel/N/mixer/audio/volume`. There is **no per-layer
variant**, and 2.3 removed the older `…/audio/{n}/dBFS` addresses. **W7 and W8 are what turn
that reading of the source into a fact about this plant.**

---

## Before you start

> 🔴 **PREMISE CORRECTED 2026-08-25 — THE INSTALL PATH IN THE SECOND BULLET BELOW IS WRONG.
> USE THIS ONE:**
>
> ```
> D:\casparcg-server-v2.5.0-stable-windows
> ```
>
> There is **no `programs\` segment**. The owner read the path off the RUNNING PROCESS during the
> DeckLink walk (`2026-08-25-decklink-model-walk.md`, host `192.168.21.114`, `VERSION SERVER` →
> `2.5.0 69e8ad5 Stable`), which settles a conflict this repo had been carrying in three spellings.
> The bullet is left **verbatim** because this is a dated record and editing what a session
> concluded at the time would falsify it — but it must not be followed.
>
> ⚠ **`D:\programs\CasparCG` (the retired 2.3.2) is still correct as written** and still must never
> be probed. It is a DIFFERENT SERVER, not a different spelling of the 2.5.0 path — do not "fix" it
> to match.
>
> The server itself is unchanged: `2.5.0 69e8ad5`, the same build this walk was written against, so
> nothing else on this sheet is affected.

- ⚠ **The channel you use must carry NO air.** Every step assumes nobody is broadcasting from
  it. If the plant is on air on all channels, stop and do this another day.
- 🔴 **Production is CasparCG 2.5.0** (`69e8ad5`), at
  `D:\programs\casparcg-server-v2.5.0-stable-windows\`. **The 2.3.2 at `D:\programs\CasparCG` is
  RETIRED — never probe it.** Step 1 verifies which one is answering.
- ⚠ **Steps 5, 6 and 9 need a CONFIG CHANGE and a server restart.** Do them in one block, at the
  end, and **copy the current `casparcg.config` to `casparcg.config.bak` before you touch it**.
  Step 10 puts it back.
- **You will need:** headphones or a monitor speaker on the playout box, a short media file with
  KNOWN audio in the server's media folder (write its name in the box below), and a `.vcg`
  template containing a `<video>` element with sound for W3.

  ```
  media file with audio (W1/W2/W8):  ______________________________
  template with an internal <video>:  ______________________________
  ```

- **The AMCP console** (PowerShell-safe; type it exactly, and replace the word CHANNEL with your
  channel number as a digit wherever it appears below):

  ```pwsh
  node tools\spikes\amcp-poke\amcp-poke.mjs --host 192.168.21.50 --port 5250
  ```

  Then type AMCP commands at its prompt and press Enter. Ctrl+C exits.

- **The OSC instrument** (a SECOND PowerShell window, on the SAME machine as the AMCP console):

  ```pwsh
  node tools\spikes\osc-capture\osc-capture.mjs --ndjson C:\cg-captures\audio-walk.ndjson
  ```

  🔴 **This plant has NO `<osc>` block**, so OSC is sent to **every connected AMCP client on
  port 6250** and **only while an AMCP connection is open**. Consequences you must respect or
  every OSC step reads as a false negative:
  1. The OSC capture must run on **the same machine whose IP holds the AMCP connection**.
  2. **The amcp-poke console must stay open** for the whole of any OSC step.
  3. If the capture prints nothing, that is **step 9's** finding — not a failure of the step you
     were on.

---

## The walk

### 1. Prove the build (INSTRUMENT: amcp-poke)

Type: `VERSION`

- **Pass:** the reply contains `2.5.0`. **Fail:** anything else — STOP; you are on the wrong
  server (the retired 2.3.2 must never be probed), fix the host and start over.

| verbatim VERSION reply |
| ---------------------- |
|                        |

### 2. Channel reads EMPTY, before (INSTRUMENT: amcp-poke)

Type: `INFO CHANNEL`

- **Pass:** no layer lists a producer (an empty stage). **Fail:** something is seated — this
  walk must not start over someone else's content; clear it or pick another channel.

| verbatim INFO reply (before) |
| ---------------------------- |
|                              |

### 3. Eye/ear check, before (EYE + EAR)

- **Pass:** the monitor shows black and the speakers are silent. **Fail:** anything visible or
  audible — do not continue.

---

### W1. Does `route://1-<layer>` carry that SOURCE LAYER's audio? (EAR + INSTRUMENT)

This is the question the whole MONITOR channel design rests on. A route that carries picture but
not audio makes §3 impossible as specified.

1. Seat the known-audio media on a source layer of **channel 1**:
   `PLAY 1-20 "YOUR_MEDIA_FILE" LOOP`
   **EAR — pass:** you hear it (channel 1 has a `<system-audio/>` consumer). If you do not,
   stop: the fixture has no audio and every reading below would be a false negative.
2. Mute the ORIGINAL so only a route can be the source of any sound you hear next:
   `MIXER 1-20 VOLUME 0`
   **EAR — pass:** silence.
3. Route that ONE LAYER onto another layer of the same channel:
   `PLAY 1-30 "route://1-20"`
   **EAR:** do you hear the media now?
   - **AUDIO CARRIED:** yes, you hear it. The layer route carries audio past a muted source.
   - **AUDIO NOT CARRIED:** silence. §3 cannot be built as specified — record it and say so.
   - ⚠ **If you hear it in step 2 as well**, the mute did not take and this reading is VOID.
4. `MIXER 1-30 VOLUME 0` then `MIXER 1-30 VOLUME 1` — **EAR:** does the routed layer's own
   volume control what you hear?
5. `CLEAR 1-30` and `CLEAR 1-20`.

| W1                                          | run 1 | run 2 |
| ------------------------------------------- | ----- | ----- |
| audible through `route://1-20` (yes/no)     |       |       |
| still audible with the SOURCE layer muted   |       |       |
| `MIXER 1-30 VOLUME` scales the routed audio |       |       |
| anything unexpected (one line, verbatim)    |       |       |

### W2. Does `route://1` (whole channel) carry the channel's SUMMED audio? (EAR)

🔴 **On a single-channel install `route://1` pointed at its own channel is a FEEDBACK LOOP.** Do
this only with the routed layer on a **different** channel (channel 2, from step W5's config) —
or skip it and record it as not-run.

1. With two known-audio clips playing on `1-20` and `1-21`, seat `PLAY 2-10 "route://1"`.
2. **EAR:** on channel 2's output, do you hear **both** clips summed?
3. `MIXER 2-10 VOLUME 0` — does channel 2 go silent while channel 1 keeps playing?
4. `CLEAR 2-10`, `CLEAR 1-20`, `CLEAR 1-21`.

| W2                                     | run 1 | run 2 |
| -------------------------------------- | ----- | ----- |
| both clips audible through `route://1` |       |       |
| channel 1 unaffected by the route      |       |       |
| notes                                  |       |       |

### W3. Does an `html` producer's internal `<video>` audio reach the channel mix? (EAR + INSTRUMENT)

The question behind §4. If CasparCG never hears the template's own `<video>`, a per-box gain
inside the template is the ONLY control there can be. If it does, `MIXER` on the CG layer scales
the whole producer at once — which is exactly why a per-box gain is still needed.

1. `CG 1-70 ADD 0 "YOUR_TEMPLATE_URL" 1` — the template carrying a `<video>` with sound.
   ⚠ Use the URL the bridge serves; do not invent one.
2. **EAR — does the template's video make sound on the channel?**
   - **YES:** the html producer's audio reaches the mix. Continue to 3.
   - **NO:** record it. §4 is then the ONLY path for template-internal box audio and there is no
     `MIXER` half at all. Skip to W4.
3. `MIXER 1-70 VOLUME 0` — **EAR — pass:** the template's video goes silent.
   `MIXER 1-70 VOLUME 1` — **EAR — pass:** it comes back.
4. ⭐ **The one that decides §4's necessity:** with a template carrying **TWO** `<video>` boxes
   playing different material, is there ANY AMCP command that turns down one and not the other?
   (There should not be — one producer, one stream.) Record what you tried.
5. `CLEAR 1-70`.

| W3                                               | run 1 | run 2 |
| ------------------------------------------------ | ----- | ----- |
| template `<video>` audible on the channel        |       |       |
| `MIXER 1-70 VOLUME 0` silences it                |       |       |
| any way to reach ONE box of two (what you tried) |       |       |

### W4. Does `MIXER <ch> MASTERVOLUME <v>` exist and take? (EAR + INSTRUMENT)

🔴 **This verb has NEVER been sent on this plant.** §5 exists only if this step says it does.

1. `PLAY 1-20 "YOUR_MEDIA_FILE" LOOP` — **EAR — pass:** audible.
2. Type: `MIXER 1 MASTERVOLUME 0.2`
   - **Record the REPLY VERBATIM.** A `202` (or `201`) is acceptance; a `400`/`404` is the verb
     not existing on this build, and that is a real answer.
   - **EAR:** does the level drop?
3. `MIXER 1 MASTERVOLUME 1` — **EAR:** does it come back?
4. **Does it affect a LAYER's own volume?** `MIXER 1-20 VOLUME` — read it back and record
   whether MASTERVOLUME changed it (it should not; they should be independent).
5. `CLEAR 1-20`.

| W4                                           | value |
| -------------------------------------------- | ----- |
| verbatim reply to `MIXER 1 MASTERVOLUME 0.2` |       |
| level audibly dropped (yes/no)               |       |
| restored by `MASTERVOLUME 1` (yes/no)        |       |
| layer VOLUME left untouched (yes/no)         |       |

### W5. Two channels — does the MONITOR channel come out independently? (EAR + CONFIG)

🔴 **CONFIG CHANGE + RESTART.** Back up `casparcg.config` first.

**The exact config to paste.** Both channels are at the **same `video-mode`**, and that is not
tidiness — `route://` requires it:

```xml
<channels>
  <!-- Channel 1 — PGM. The plant's own consumers; do not change them for this walk. -->
  <channel>
    <video-mode>720p5000</video-mode>
    <consumers>
      <screen />
      <system-audio />
    </consumers>
  </channel>
  <!--
    Channel 2 — MON (monitor / PFL).
    🔴 THE SAME <video-mode> AS CHANNEL 1, ON PURPOSE: a route between channels requires
    matching video-mode / framerate. A MON channel at a different mode will not carry
    route://1-<layer> at all.
    ⚠ <system-audio/> ALWAYS DOWNMIXES TO STEREO. This is a listening path, never a
    multi-channel monitoring matrix.
    <screen/> is here only so a multiview is possible; remove it if the box has no spare display.
  -->
  <channel>
    <video-mode>720p5000</video-mode>
    <consumers>
      <system-audio />
      <screen />
    </consumers>
  </channel>
</channels>
```

⚠ **`720p5000` is what this 2.5.0 install is running today** (measured 2026-07-28). If the
plant's channel 1 has since been moved to `1080i5000`, put **that same value in BOTH** — the
rule is "identical", not "720p".

1. Save, restart the server, and reconnect amcp-poke.
2. `INFO` — **pass:** two channels are listed. Record the verbatim reply.
3. `PLAY 1-20 "YOUR_MEDIA_FILE" LOOP` — **EAR:** channel 1 audible.
4. `PLAY 2-10 "route://1-20"` — **EAR:** is the routed copy audible on channel 2's output?
5. `MIXER 2-10 VOLUME 0` — 🔴 **the reading the whole PFL idea depends on: channel 2 goes silent
   and CHANNEL 1 IS UNAFFECTED.** **Fail:** channel 1's level changes at all.
6. `MIXER 1-20 VOLUME 0` — is channel 2 still audible? (It tells us whether MON hears the input
   or hears PGM's post-fader mix — a different feature.)
7. `CLEAR 2-10`, `CLEAR 1-20`.

| W5                                         | run 1 | run 2 |
| ------------------------------------------ | ----- | ----- |
| two channels listed by `INFO`              |       |       |
| routed copy audible on channel 2           |       |       |
| MON volume change leaves PGM untouched     |       |       |
| MON still audible with the PGM layer muted |       |       |
| verbatim `INFO` (both channels)            |       |       |

### W6. Lip-sync / latency — routed monitor vs programme (EYE + EAR + INSTRUMENT: phone slow-mo)

A monitor path an operator cannot trust to be in time is a monitor path they stop using.

1. With W5's setup running, put BOTH channels' `<screen/>` outputs where one camera can see
   them, playing the same routed clip.
2. Record slow-motion video of both. Find a sharp visual transient (a cut, a flash) in the
   clip.
3. Count the slow-mo frames between that transient on the PGM screen and on the MON screen.
   Convert: **frames at the channel rate = slow-mo frames × channel fps ÷ slow-mo rate.**
   `slow-mo rate: ______ fps` (typical: 120 or 240)
4. **EAR, separately:** with both audible at once, is there an audible echo/flam? Record yes/no
   — it is a different instrument from the frame count and both readings are wanted.
5. Run twice.

| W6                                    | run 1 | run 2 |
| ------------------------------------- | ----- | ----- |
| slow-mo frames PGM → MON              |       |       |
| at channel rate                       |       |       |
| audible flam between the two (yes/no) |       |       |

### W7. Does 2.5.0 emit `/channel/N/mixer/audio/volume`, and what EXACTLY is the payload? (INSTRUMENT: osc-capture)

🔴 **CAPTURE THE RAW DUMP. DO NOT PARAPHRASE IT.** The design turns on how many values there
are and what they are — count, type and range — and a summary written at the box loses exactly
the part that matters.

1. Start `osc-capture` (see "Before you start" — the AMCP console must stay open).
2. `PLAY 1-20 "YOUR_MEDIA_FILE" LOOP`.
3. Let it run **20 seconds**, then `CLEAR 1-20` and stop the capture.
4. Filter the NDJSON for the address and paste the **first three lines verbatim**:

   ```pwsh
   Select-String -Path C:\cg-captures\audio-walk.ndjson -Pattern "mixer/audio/volume" |
     Select-Object -First 3 | ForEach-Object { $_.Line }
   ```

5. Answer each of these from the raw lines, not from memory:

| W7                                                         | value |
| ---------------------------------------------------------- | ----- |
| address emitted at all (yes/no)                            |       |
| HOW MANY values per message                                |       |
| integer or float (as they appear in the JSON)              |       |
| observed MIN and MAX across the capture                    |       |
| any `dBFS`-style address present (yes/no — 2.3 removed it) |       |
| roughly how many messages per second                       |       |

| first three raw lines, VERBATIM |
| ------------------------------- |
|                                 |
|                                 |
|                                 |

### W8. With ONE routed input alone on a MON channel, does that channel's peak track THAT INPUT and nothing else? (INSTRUMENT: osc-capture)

🔴 **THE STEP THE WHOLE PER-INPUT VU DESIGN RESTS ON.** If a MON channel's peak does not follow
its one routed input, path (a) of §6 does not exist and there is no per-input meter for Live
Source plates at any price.

Needs W5's two-channel config still in place.

1. Start `osc-capture` fresh, into a new file.
2. `PLAY 1-20 "YOUR_MEDIA_FILE" LOOP` — then `PLAY 2-10 "route://1-20"`. **Channel 2 must carry
   NOTHING ELSE.** Confirm with `INFO CHANNEL 2`, and paste the reply.
3. Watch `/channel/2/mixer/audio/volume` for 20 s.
4. Now make the input change in a way you can hear: `MIXER 1-20 VOLUME 0.1`, wait 5 s, then
   `MIXER 1-20 VOLUME 1`, wait 5 s.
   - 🔴 **Does channel 2's peak FOLLOW that change?**
5. Now seat a SECOND, louder clip on channel 1 only — `PLAY 1-21 "OTHER_FILE" LOOP` — which
   channel 2 is NOT routed to. **Does channel 2's peak move?** It must NOT.
6. `CLEAR 1-21`, `CLEAR 2-10`, `CLEAR 1-20`, stop the capture.

| W8                                                       | run 1 | run 2 |
| -------------------------------------------------------- | ----- | ----- |
| ch-2 peak follows the routed input's level change        |       |       |
| ch-2 peak UNMOVED by an unrelated ch-1 clip              |       |       |
| ch-2 peak at silence (the floor value)                   |       |       |
| ch-2 peak at full (the ceiling value)                    |       |       |
| verbatim `INFO CHANNEL 2` proving nothing else is seated |       |       |

### W9. Does this plant need an explicit `<osc>` block? (INSTRUMENT: osc-capture)

The plant's config has **NONE**, and everything above assumed the compiled-in default. That
assumption has to be tested, not carried.

**Form A — as it is today (no `<osc>` block).** Already exercised by W7/W8.

- Did OSC arrive with only the amcp-poke connection open? **yes / no:** **\_\_**
- Did it arrive on port **6250**? **yes / no:** **\_\_**
- Close amcp-poke. Does OSC **stop**? **yes / no:** **\_\_** (it should — that is the
  "AMCP-clients only" default, and it is exactly why `B-101`'s silence-is-not-death rule exists)

**Form B — with an explicit block.** Add this inside the config's root, restart, and repeat W7
step 4 **with amcp-poke CLOSED**:

```xml
<osc>
  <default-port>6250</default-port>
  <disable-send-to-amcp-clients>false</disable-send-to-amcp-clients>
  <predefined-clients>
    <predefined-client>
      <address>192.168.21.93</address>
      <port>6250</port>
    </predefined-client>
  </predefined-clients>
</osc>
```

⚠ Replace `192.168.21.93` with the IP of the machine running the BRIDGE. If that is the playout
box itself, use `127.0.0.1`.

| W9                                                  | value |
| --------------------------------------------------- | ----- |
| Form A: OSC arrives with an AMCP client connected   |       |
| Form A: OSC stops when the AMCP client disconnects  |       |
| Form B: OSC arrives with NO AMCP client connected   |       |
| which form the BRIDGE actually receives on          |       |
| recommendation for the production config (one line) |       |

---

### 10. Put it back, and the channel reads EMPTY, after

1. **Restore `casparcg.config` from `casparcg.config.bak`** (unless W9 recommends keeping the
   `<osc>` block — in which case say so explicitly in the table above, and leave the channel
   block as it was).
2. Restart the server.
3. INSTRUMENT (amcp-poke): `INFO CHANNEL`.
   **Pass:** empty stage, as in step 2. **Fail:** a producer is still seated — note its layer
   and what `INFO` says it is, verbatim; that is its own finding.
4. **EAR — pass:** silence.

| verbatim INFO reply (after) | config restored (yes/no) |
| --------------------------- | ------------------------ |
|                             |                          |

---

## Where the numbers go

1. Fill the tables above at the box — they are the primary record.
2. Copy the verdicts into `openspec/changes/add-multibox-audio/tasks.md` **§1**, ticking 1.11
   only when every table has an answer, and note the date and the build string from step 1.
3. Then, and only then, the gated sections become buildable:
   - **W1 + W2 + W5 + W6 → §3** (the MONITOR / PFL channel).
   - **W3 → §4** (template-internal box audio).
   - **W4 → §5** (`MASTERVOLUME`).
   - **W7 + W8 → §6** (per-input VU metering).
     🔴 **W8 is the load-bearing one.** If a MON channel's peak does not track its one routed
     input, §6 path (a) is dead and only path (b) — the `AnalyserNode` inside the template —
     survives. Say so plainly; that is a real outcome, not a failed measurement.
4. **A "no" is a finding, not a failure.** W1 answering NO, or W4 answering `400`, closes a
   design question rather than leaving one open. Do not soften it — bring the verbatim replies
   back and the spec gets rewritten around what the plant actually does.

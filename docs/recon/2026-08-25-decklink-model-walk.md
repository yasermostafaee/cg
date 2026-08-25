# DECKLINK — the source-model plant walk (owner-run, one sitting)

> ✅ **RUN ON THE PLANT 2026-08-25 BY THE OWNER. ALL FOUR QUESTIONS ANSWERED.**
> Host `192.168.21.114`, install `D:\casparcg-server-v2.5.0-stable-windows`, server
> `2.5.0 69e8ad5 Stable`, startup enumeration at `15:53:18`. Answers are recorded **under each
> question**, in an `ANSWER` block, with the log verbatim.
>
> | Q      | Answer                                         | Where it landed                                              |
> | ------ | ---------------------------------------------- | ------------------------------------------------------------ |
> | **Q1** | **YES** — the producer takes the persistent ID | `command-builder.ts` `playSource`; [[C-021]] arm (a)         |
> | **Q2** | **NO** — nothing enumerates                    | the negative recorded on [[C-021]]; **no picker item filed** |
> | **Q3** | **STRETCH** — no letterbox                     | **[[C-028]]**, filed from this answer                        |
> | **Q4** | **NO** — one input only                        | [[C-027]] **parked**; [[C-021]] arm (c) parked               |
>
> 🔴 **The walk also uncovered a DEFECT that was not one of its questions** — DeckLink
> single-open contention, filed as **[[B-177]]**. See _"The defect this walk uncovered"_ below.
>
> ⚠ **The prose below is left as it was WRITTEN, before the answers were known** — this is a dated
> record and rewriting its reasoning would falsify what was believed at the time. Only the blanks
> are filled and the `ANSWER` blocks added.

**What this settles:** the four things about the `decklink` producer model that **cannot be decided
from source**, now that the card itself is proven. They gate, in order: whether the model may hold a
persistent device identity ([[C-021]] arm (a)), whether CG Control can offer a device **picker**
instead of a bare number, whether `MIXER FILL` may be computed from a source aspect at all, and
whether fill/key seating ([[C-027]]) is buildable on this plant.

**Why a walk and not a test.** Every question here is about what **CasparCG 2.5.0 on this card**
does. `@cg/amcp-mock` models what we told it to model — it cannot discover that a producer parser
accepts a persistent ID, that an AMCP query enumerates devices, or how the server fits a mismatched
raster. A green suite here would be a green suite about our own assumptions.

⚠ **RIDES THE SAME VISIT AS** — batch these, the room and the channel are the same:

- `docs/recon/2026-08-23-audio-paths-walk.md` — the audio walk (W1–W8), gating
  `openspec/changes/add-multibox-audio`;
- `docs/recon/2026-08-22-b155-switch-flash-walk.md` — [[B-155]]'s frame count,
  `multibox-layout-switch` `tasks.md` 7.15;
- `docs/recon/2026-08-22-confidence-grab-measurement.md` §B/§C;
- the page/mixer **skew `k`** — filed as [[B-174]]. ⚠ Sessions have called this `LOOK-SYNC-01`;
  **no such item exists** (nor does `MIRROR-PAGE-01`, nor `FIT-MODE-01` cited at Q3 below). They are
  SESSION-PROMPT labels. `git grep` them and you get nothing — the phenomena are filed as `B-174`
  and, for Q3, nowhere yet. Recorded here so the next reader does not go hunting.

---

## What is ALREADY MEASURED — do not re-run these

Owner, on the plant, **2026-08-24**, from CasparCG's own startup log on the production 2.5.0
(`69e8ad5`). This is the evidence the whole sheet builds on:

```
Decklink devices found:
 - DeckLink SDI 4K [1] (23487013)
```

| Fact                                                                                   | Standing            |
| -------------------------------------------------------------------------------------- | ------------------- |
| Model **DeckLink SDI 4K**, enumeration index **1**, persistent ID **23487013**         | measured            |
| **INPUT:** `PLAY 1-10 DECKLINK DEVICE 1` → `Initialized`, repeatedly, with real signal | measured            |
| **OUTPUT:** `<decklink>` consumer, `<device>23487013</device>` → `Initialized.`        | measured            |
| Both directions at once on the same card                                               | measured            |
| The persistent ID accepted in the **CONSUMER's** `<device>` element                    | measured            |
| The persistent ID accepted as a **PRODUCER** argument                                  | 🔴 **NOT measured** |

🔴 **The consumer and the producer are DIFFERENT PARSERS.** That last row is Q1 and it is the whole
reason this sheet exists — do not let the consumer's success be read as the producer's.

> ✅ **That last row was ANSWERED **YES** on 2026-08-25** — see Q1 below. The table above is the
> 2026-08-24 state and is left as it stood; it is not the current answer.

---

## Three incidentals from the 2026-08-24 run — recorded so they are not re-discovered as defects

1. **`1080i5000` input against a `1080p5000` channel** produced `Input format changed…` and then a
   flood of `in-sync` / `out-sync` drift warnings. **Fix: match the CHANNEL to the incoming signal.**
   Not a defect, and it will reappear at Q3 — set the channel deliberately there.
2. **`Failed to enable external keyer.`** fires on every start on this card, `<keyer>default</keyer>`
   does **not** silence it on 2.5.0, and it is **NON-FATAL** — the consumer initialises and output
   works. **Do not chase it.**
3. **`Reference signal: not detected`** — no genlock on this card today. The knob, if it is ever
   wanted, is `<wait-for-reference>`. Nothing on this sheet depends on it.

---

## Before you start

- ⚠ **The channel you use must carry NO air.** Every step assumes nobody is broadcasting from it. If
  the plant is on air on all channels, stop and do this another day.
- 🔴 **Production is CasparCG 2.5.0** (`69e8ad5`). The 2.3.2 at `D:\programs\CasparCG` is **RETIRED
  — never probe it.** Step 0 verifies which one is answering.
- ⚠ **The install PATH is recorded two ways in this repo** and one of them is a transcription slip:
  the 2026-08-24 note says `D:\casparcg-server-v2.5.0-stable-windows`, the audio walk says
  `D:\programs\casparcg-server-v2.5.0-stable-windows`. Same server. **Write the real one here once
  and for all:** `install path: D:\casparcg-server-v2.5.0-stable-windows`

  ✅ **SETTLED 2026-08-25** — read off the RUNNING PROCESS by the owner, on host
  `192.168.21.114`. **The 2026-08-24 note was right; the audio walk's
  `D:\programs\casparcg-server-v2.5.0-stable-windows` is the transcription slip.** The audio walk
  carries a dated `PREMISE CORRECTED` block saying so rather than being edited in place.
  ⚠ Do NOT confuse this with the **retired 2.3.2 at `D:\programs\CasparCG`**, which must never be
  probed — that path is a different server, not a different spelling of this one.

- **You will need:** a live SDI feed into the card (any camera), one **4:3** or otherwise
  non-16:9 source for Q3 (a camera set to 4:3, or a `1080i` feed into a `720p` channel — anything
  whose aspect differs from the channel's), and physical access to the **back of the box** for Q4.
- **The AMCP console** (PowerShell-safe; type it exactly, replacing the word CHANNEL with your
  channel number as a digit wherever it appears):

  ```pwsh
  node tools\spikes\amcp-poke\amcp-poke.mjs --host 192.168.21.50 --port 5250
  ```

  Then type AMCP commands at its prompt and press Enter. Ctrl+C exits.

- **Keep the server log window visible.** Half of what this sheet reads is in the log, not in the
  AMCP reply. `PLAY` answers `202` long before the producer has decided whether it works.

---

## Step 0 — prove the build (1 minute)

Type: `VERSION`

- **Pass:** the reply contains `2.5.0`. Write it: `VERSION reply: 2.5.0 69e8ad5 Stable`
- **Fail:** anything else — **STOP.** You are pointed at the retired 2.3.2. Fix the host and start
  over; nothing below means anything against the wrong server.

> **ANSWER — 2026-08-25.** `VERSION SERVER` → `#201 VERSION OK` + `2.5.0 69e8ad5 Stable`, typed
> directly into the CasparCG server console.
>
> ⚠ **The build is UNCHANGED, and this matters because a contradicting claim was made.** A chat
> report said the plant was on **2.5.2**. The server's own reply says `2.5.0 69e8ad5`. **The
> server's reply wins** — every measurement on this sheet is against `2.5.0 69e8ad5`, the same
> build as 2026-08-24, so nothing recorded on either date is a cross-version comparison.

---

## Q1 🔴 — does the PRODUCER accept the PERSISTENT ID?

**This is the most valuable question on the sheet.** An index moves when the PCIe order changes or a
second card is fitted; a persistent ID does not. The schema (`SourceProducerSchema`'s `decklink`
arm, `z.number().int().positive()`) **already admits `23487013`**, so a Yes costs no schema change
at all.

**Run, in this order — the known-good FIRST, so a failure at the second is about the ID and not
about the room:**

```
PLAY 1-10 DECKLINK DEVICE 1
```

Confirm `Initialized` in the log and a picture. Then:

```
CLEAR 1-10
PLAY 1-10 DECKLINK DEVICE 23487013
```

**Look at:** the AMCP reply code, AND the server log. Write both down verbatim — a `202` with no
`Initialized` is a FAILURE that looks like a success, and it is the most likely shape of a No here.

```
reply to DECKLINK DEVICE 1        : #202 PLAY OK          log: Initialized (same shape as below)
reply to DECKLINK DEVICE 23487013 : #202 PLAY OK          log: Initialized, then Input format changed
picture on 23487013? (yes / no / black) : YES
```

> ## ✅ ANSWER — **YES. The producer accepts the persistent ID.** (2026-08-25)
>
> The known-good index form was run FIRST, as the sheet instructs, and gave the same shape. Then:
>
> ```
> PLAY 1-10 DECKLINK DEVICE 23487013
> DeckLink SDI 4K [23487013|1080p5000] Initialized
> #202 PLAY OK
> DeckLink SDI 4K [23487013|1080p5000] Input format changed from 1080p5000 to 1080i5000
> ```
>
> 🔴 **The `Input format changed` line is what makes this a PASS rather than a `202` over a dead
> producer** — the exact failure shape this question was written to guard against. A producer that
> had not opened the card could not report the incoming signal's raster changing under it. Note
> also that the log names the device by its **persistent ID**, not by an index, so the server
> resolved the argument as an ID rather than coincidentally matching an index.
>
> **⇒ Decided:** the model may hold an identity that survives a PCIe reshuffle or a second card
> being fitted. `SourceProducerSchema`'s `z.number().int().positive()` already admits `23487013`,
> so this costs **no schema change**. `command-builder.ts`'s `playSource` docstring no longer says
> "unproven"; [[C-021]] arm (a) records the proof.

**What each answer decides:**

- **WORKS** (`202` + `Initialized` + picture) → the model may hold an identity that survives a
  hardware reshuffle. The schema needs no change. CG Control should then offer the persistent ID as
  the preferred value, and Q2's picker (if it lands) should publish it.
- **DOES NOT WORK** (any other outcome) → **the INDEX is the only producer-side handle.** Record
  THAT as the reason, not as a preference: `command-builder.ts`'s `playSource` docstring currently
  says the ID form is "unproven", and a No turns that into "refused", which is a different and
  stronger statement. The operator surface must then say the number is an enumeration index and can
  move — which is a real usability cost, and Q2 is how it gets paid.

---

## Q2 — does any AMCP query ENUMERATE the DeckLink devices?

The startup log clearly knows the names, indices and persistent IDs. If a **query** returns them,
the bridge can publish a real device list and the Sources modal can offer a **picker instead of a
bare numeric input that defaults to `1`** — which is the whole of the defect that today an operator
types a device number with nothing to check it against.

**Try each, and record the RAW response verbatim — including the failures:**

```
INFO SYSTEM
```

```
INFO
```

```
INFO CONFIG
```

```
VERSION SERVER
```

> ## ❌ ANSWER — **NO. Nothing enumerates the devices.** (2026-08-25)
>
> All four were actually typed. The value here is that they were RUN, not reasoned about:
>
> | command tried    | reply                                                                                                  |
> | ---------------- | ------------------------------------------------------------------------------------------------------ |
> | `INFO SYSTEM`    | `#200 INFO OK` + `1 1080p5000 PLAYING` — 2.5.0 **IGNORES the `SYSTEM` token** and answers plain `INFO` |
> | `INFO`           | the same channel line — no device information of any kind                                              |
> | `INFO CONFIG`    | `#201 INFO CONFIG OK` + the configuration XML                                                          |
> | `VERSION SERVER` | `#201 VERSION OK` + `2.5.0 69e8ad5 Stable`                                                             |
>
> 🔴 **`INFO SYSTEM` silently degrading to `INFO` is the trap here.** It answers `#200 INFO OK`, so
> a caller checking only the response CODE would read it as a supported query that found no
> devices. It is not — the token is discarded and a different question is answered.
>
> ⭐ **ONE PARTIAL, and it is not an enumeration.** `INFO CONFIG` **does** return
> `<decklink><device>23487013</device>` — but that is **what the operator wrote into
> `casparcg.config`**, not what the card reports. It can seed a _hint_ (the ID this installation
> already uses for output), never a picker: it cannot list a device nobody configured, cannot give
> a name or an index, and would go stale the moment the config and the hardware disagree — which
> is precisely the case a picker exists to catch.
>
> **⇒ Decided:** the real device list exists **only in the startup log**, and the bridge does not
> read the server's disk and must not start. **No picker item is filed** — there is nothing to
> publish. The modal keeps its bare numeric input, and Q1's YES softens the cost: the number the
> operator types can be a persistent ID that does not move.

**Look for:** the string `DeckLink`, the number `23487013`, or a `<decklink>` / `<devices>` element.

**What each answer decides:**

- **A query lists them** → the bridge gains a `sources.devices` read, the modal gains a picker, and
  Q1's answer decides whether the picker's VALUE is the index or the persistent ID. This is the
  outcome worth wanting.
- **Nothing lists them** → record the negative and the exact commands tried; a query that was
  reasoned about is not a query that was run. The fallback is the bare number the modal has today,
  and the surface must then state what the number MEANS (see Q1's No branch). ⚠ Do **not** propose
  parsing the server's log file for the device list — the bridge does not read the server's disk and
  should not start.

---

## Q3 🔴 — does a mismatched input get LETTERBOXED by CasparCG, or STRETCHED to fill?

⚠ **THIS IS A BLOCKING DEPENDENCY, NOT A NICE-TO-KNOW.** It is the measurement the fit-mode work is
blocked on (the sessions call it `FIT-MODE-01`; **no item of that name exists** — see the batching
note). If the producer **already pillarboxes** a 4:3 source into a 16:9 channel, then computing
`MIXER FILL` from the source aspect **DOUBLE-COUNTS**: the picture ends up smaller than intended,
inside bars, inside a correctly-sized box. Everything about live-plate geometry rests on which of
the two this is, so **do not skip it because Q1 and Q2 are more interesting.**

**Set up deliberately:** put a source whose aspect DIFFERS from the channel's on the card. The
cheapest version is a camera set to 4:3 into your 16:9 channel. (Incidental 1 above will fire — that
is expected, and matching the channel to the signal is NOT the fix here, because the mismatch is the
subject.)

```
CLEAR 1-10
PLAY 1-10 DECKLINK DEVICE 1
```

Then, with NO mixer geometry applied at all, look at the full-frame output.

```
channel video mode : PAL — 720×576, 4:3   (set with `SET 1 MODE PAL`)
source signal      : 1080i5000 — 16:9
```

**Look at the picture and tick ONE:**

- [ ] **PILLARBOXED** — the 4:3 image sits in the middle with black bars left and right; circles are
      round; nothing is distorted.
- [x] **STRETCHED** — the image fills the frame edge to edge; circles are ovals; faces are wide.
- [ ] **CROPPED** — the image fills the frame and the top/bottom (or sides) are cut off.

Then confirm it survives a mixer box — this is the case the code actually emits:

```
MIXER 1-10 FILL 0.25 0.25 0.5 0.5
```

- [ ] the bars **scaled with the box** (the producer letterboxes, and `FILL` moves the letterboxed
      result) — this is the DOUBLE-COUNT case
- [x] the box is **filled edge to edge** by the image

> ## ✅ ANSWER — **STRETCH. CasparCG does NOT correct aspect.** (2026-08-25)
>
> **Setup**, deliberately mismatched: `SET 1 MODE PAL` (720×576, 4:3) with a `1080i5000` (16:9)
> input; `PLAY 1-5 #FF0000` on a LOWER layer as a transparency probe; then
> `MIXER 1-10 FILL 0.25 0.25 0.5 0.5`. Measured off the screen-consumer output:
>
> ```
> picture rect as a fraction of the channel frame
>    x  0.2500 .. 0.7500      width  0.5000
>    y  0.2497 .. 0.7503      height 0.5006
> MIXER FILL 0.25 0.25 0.5 0.5 expects exactly 0.2500..0.7500 on both axes
> ```
>
> **The picture fills the FILL box edge to edge on BOTH axes. There are no bars inside the box.**
>
> 🔴 **The discriminating arithmetic, so this is not an eyeball verdict.** Had the producer
> letterboxed the 16:9 source into the 4:3 channel first, the picture would have occupied
> 405/576 = **70.31 %** of the box height — **291 px** against a measured **415 px**. The two
> hypotheses are 124 px apart on a 415 px box; nothing about this is a close call.
>
> **The red probe layer showed in the margin OUTSIDE the box**, which proves the plate does not
> paint outside its own rect — the `CLIP` is doing its job and the measurement is of the fill, not
> of a spill.
>
> **⇒ Decided:** the source-aspect correction in `MIXER FILL` is **REQUIRED**, and there is **NO
> DOUBLE-COUNT**. This is the branch the "What each answer decides" list below calls _"the case
> the current model assumes"_ — it is now **measured** rather than assumed, and that is the whole
> value of having run it. **Filed as [[C-028]]**, which this answer is the premise of.

**What each answer decides:**

- **PILLARBOXED / letterboxed** → the producer has ALREADY corrected the aspect. `MIXER FILL` must
  then be computed from the CHANNEL raster and **must not** apply a second source-aspect correction,
  or every mismatched live plate renders too small with bars inside its box. The `expectedAspect`
  the source catalog carries becomes a DISPLAY fact, not a geometry input.
- **STRETCHED** → the producer does nothing about aspect, and the source-aspect correction is
  **required** in `MIXER FILL` or every mismatched plate is distorted on air. This is the case the
  current model assumes; confirming it turns an assumption into a measurement.
- **CROPPED** → a third behaviour neither half of the model expects. **Stop and record it in full**
  (which axis, how much) — it changes the design rather than picking a branch of it.

---

## Q4 — is a SECOND SDI input physically available for a fill/key pair?

This is the gate on [[C-027]] (fill/key seating) and on [[C-021]] arm (c). A fill/key pair is **two
physical SDI inputs**; the card is a **DeckLink SDI 4K**, and how many inputs it exposes has never
been checked.

**Look at the back of the box, and at the card's own connectors.** Then confirm it from the server
rather than from the metalwork alone:

```
CLEAR 1-10
CLEAR 1-11
PLAY 1-10 DECKLINK DEVICE 1
PLAY 1-11 DECKLINK DEVICE 2
```

(If Q2 gave you an enumeration, use the real second device number it reported instead of `2`.)

```
physical SDI IN connectors on the card : ONE (DeckLink SDI 4K is a single-channel card)
reply + log for DECKLINK DEVICE 2      : NOT RUN — the command never executed, see below
second picture? (yes / no)             : NO
```

> ## ❌ ANSWER — **NO. There is one input, and only one.** (2026-08-25)
>
> The startup enumeration at `15:53:18` lists **exactly one device**:
>
> ```
> Decklink devices found:
>  - DeckLink SDI 4K [1] (23487013)
> ```
>
> A DeckLink SDI 4K is a **single-channel card**. One device enumerated, one SDI input.
>
> ⚠ **DISCLOSED HONESTLY: the `PLAY 1-11 DECKLINK DEVICE 2` probe NEVER EXECUTED.** The console
> concatenated the pasted lines into `CLEAR 1-10PLAY 1-11 DECKLINK DEVICE 2` and ran only the
> `CLEAR`. **Do not cite a `DEVICE 2` result — there isn't one.** The question is nonetheless
> ANSWERED, because the enumeration is the stronger evidence and it is same-day, same-boot: a
> device the server did not enumerate is not a device a `PLAY` could have opened. Recorded rather
> than quietly rounded up, because "the command was run and failed" and "the command never ran"
> are different facts and only one of them is true here.
>
> ⚠ **A lesson for every sheet in this folder:** multi-line paste into the CasparCG server console
> can SILENTLY CONCATENATE lines. Paste one command at a time, or check the echo before trusting a
> result — a step that never ran looks exactly like a step that produced nothing.
>
> **⇒ Decided:** [[C-027]] (fill/key seating) is **PARKED — unverifiable on this plant**, per this
> sheet's own instruction below. [[C-021]] arm (c) is parked for the same reason. The `keyDevice`
> field, the schema arm and the modal's honesty notice are **unchanged**.

**What each answer decides:**

- **A second input exists and plays** → [[C-027]] is **unblocked** and can be built and verified
  here. [[C-021]] arm (c) then has something to look at, and its alpha check ("confirmed by looking
  at the switcher, never inferred from the format's specification") becomes runnable.
- **Only ONE input** → [[C-027]] does **not** become wrong, it becomes **unverifiable on this
  plant**. Re-scope or park it rather than building two-layer seating whose second layer can never
  carry a real signal. **Do not delete the `keyDevice` field or the schema arm** — an operator may
  already have configured a pair, and the modal already says plainly that it is stored and not sent.
  Record the finding on [[C-027]] as the reason it was parked.

---

## 🔴 The defect this walk uncovered — DeckLink single-open contention

**Not one of the four questions.** It fell out of running them, and it is filed as **[[B-177]]**
(`docs/prd/bugs-runtime.md`). Recorded here because this is where the evidence was taken.

**Instance 1 — a `CLEAR` immediately followed by a `PLAY` on the same layer:**

```
16:01:05.594  CLEAR 1-10                    -> #202 CLEAR OK
16:01:05.604  PLAY 1-10 DECKLINK DEVICE 1
16:01:05.617  [error] EnableVideoInput - DeckLink SDI 4K [1|1080p5000] Could not enable video input.
16:01:05.631  DeckLink SDI 4K [23487013|1080i5000] Destroyed.      <- 14 ms AFTER the failure
```

**Instance 2 — a plain re-`PLAY` over a decklink producer already live on that layer:**

```
16:10:15.776  PLAY 1-10 DECKLINK DEVICE 1   (a decklink producer was ALREADY live on layer 1-10)
16:10:15.858  [error] EnableVideoInput - DeckLink SDI 4K [1|PAL] Could not enable video input.
```

Runs with a **~5 s gap** between `CLEAR` and `PLAY` initialised cleanly **every time**. Three facts:

1. **`CLEAR` answers `202` BEFORE the producer is destroyed** — it is an acknowledgement, not a
   destruction receipt. The `Destroyed.` line lands 14 ms after the `202` and, in instance 1,
   **after** the failure it caused.
2. **CasparCG constructs the NEW producer before destroying the OLD one** on the same layer, so
   even a plain re-`PLAY` of the same device collides with itself (instance 2 — no `CLEAR`
   involved at all).
3. ⇒ **Two producers cannot hold one physical input.** So **the same live source cannot be seated
   on two boxes at once** on this hardware. That is a product-level constraint, not a timing bug.

🔴 **And the failure DOES NOT LOOK LIKE ITSELF.** The console answered:

```
#404 PLAY FAILED
File not found.
```

When the decklink producer throws, CasparCG's producer registry **falls through to the FILE
producer** and reports _that_ one's error. **Any code that reads a `404` from a live-source `PLAY`
as "media missing" will mis-diagnose DeckLink contention** — and will tell the operator to check a
file path when the real answer is to wait for a destroy.

---

## When you are done

- [x] Fill the blanks **in this file** and commit it — an answer that lives only in someone's memory
      is an answer this sheet will ask for again. **DONE 2026-08-25.**
- [x] Q1 → update `command-builder.ts`'s `playSource` docstring and [[C-021]] arm (a).
      ⚠ The real path is `tools/caspar-bridge/src/command-builder.ts` — there is no
      `command-builder.ts` under `packages/caspar-client`.
- [x] Q2 → if positive, it becomes a new item (bridge read + modal picker); if negative, record the
      commands tried on [[C-021]]. **Negative — recorded on [[C-021]]; no picker item filed.**
- [x] Q3 → record it wherever the fit-mode work lands, and **file an item for it if none exists** —
      as of 2026-08-25 nothing in the tree holds this question, which is exactly how a blocking
      dependency goes missing. **Filed as [[C-028]].**
- [x] Q4 → flip [[C-027]] off `[!]`, or record why it is parked. **Parked — reason recorded on
      [[C-027]] and on [[C-021]] arm (c).**
- [x] The contention defect the walk uncovered → filed as **[[B-177]]**.

### What this visit did NOT produce

- **The audio walk (`docs/recon/2026-08-23-audio-paths-walk.md`) was NOT run.** W1–W9 remain
  unanswered and `add-multibox-audio` `tasks.md` **1.11** stays unticked. ⚠ **W5 cannot be run on
  the current configuration at all:** `INFO CONFIG` shows a **single `<channel>`** (`1080p5000`;
  consumers `<decklink>` `23487013` with `embedded-audio`, `<screen/>`, `<system-audio/>`; **no
  `<osc>` block**). A second channel is a **config edit plus a restart**, not a console command.
- **`B-155`'s frame count was NOT measured** — `multibox-layout-switch` `tasks.md` **7.15** still
  owes it.
- **[[B-174]]'s skew `k` was NOT measured.**

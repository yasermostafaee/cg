# DECKLINK — the source-model plant walk (owner-run, one sitting)

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
  and for all:** `install path: ______________________________________`
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

- **Pass:** the reply contains `2.5.0`. Write it: `VERSION reply: ____________________`
- **Fail:** anything else — **STOP.** You are pointed at the retired 2.3.2. Fix the host and start
  over; nothing below means anything against the wrong server.

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
reply to DECKLINK DEVICE 1        : ____________________  log: ____________________
reply to DECKLINK DEVICE 23487013 : ____________________  log: ____________________
picture on 23487013? (yes / no / black) : ____________
```

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

```
                                    (paste raw replies here — verbatim, including errors)



```

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
channel video mode : ____________________
source signal      : ____________________
```

**Look at the picture and tick ONE:**

- [ ] **PILLARBOXED** — the 4:3 image sits in the middle with black bars left and right; circles are
      round; nothing is distorted.
- [ ] **STRETCHED** — the image fills the frame edge to edge; circles are ovals; faces are wide.
- [ ] **CROPPED** — the image fills the frame and the top/bottom (or sides) are cut off.

Then confirm it survives a mixer box — this is the case the code actually emits:

```
MIXER 1-10 FILL 0.25 0.25 0.5 0.5
```

- [ ] the bars **scaled with the box** (the producer letterboxes, and `FILL` moves the letterboxed
      result) — this is the DOUBLE-COUNT case
- [ ] the box is **filled edge to edge** by the image

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
physical SDI IN connectors on the card : ______
reply + log for DECKLINK DEVICE 2      : ____________________________________
second picture? (yes / no)             : ____________
```

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

## When you are done

- Fill the blanks **in this file** and commit it — an answer that lives only in someone's memory is
  an answer this sheet will ask for again.
- Q1 → update `command-builder.ts`'s `playSource` docstring and [[C-021]] arm (a).
- Q2 → if positive, it becomes a new item (bridge read + modal picker); if negative, record the
  commands tried on [[C-021]].
- Q3 → record it wherever the fit-mode work lands, and **file an item for it if none exists** — as
  of 2026-08-25 nothing in the tree holds this question, which is exactly how a blocking dependency
  goes missing.
- Q4 → flip [[C-027]] off `[!]`, or record why it is parked.

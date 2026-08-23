# Design — multi-box audio, metering, and what is deliberately NOT built yet

## 1. The one decision that shapes everything: PER-PLATE, not per-look

**One volume per plate, identical in every look.** A `(look, plate) → volume` axis was
considered and **rejected**. Recorded here so it is not re-litigated:

- Resolution is already **four levels deep** for a plate's SOURCE (catalog → template
  assignment → per-look binding → emergency override, `live-source.ts`). Audio does not need a
  fifth, and the four exist because each answers a question a human actually asks. "How loud is
  guest-2 in the 2-box look, as against the solo look" is not one of them.
- The audio intent already **belongs to the plate** (`C-015` 6.9c), which is what lets a raised
  plate stay audible across an on-air source swap. Keying it by look would undo that property
  for the swap case as a side effect.
- A held plate — seated, but with no hole punched in front of it by the active look — is
  **muted by the hold**, not by its intent. That is the mechanism that already makes "audio
  follows the look" true without a per-look axis, and re-implementing it as a second axis is the
  `B-100` / `P-012` two-spellings class.

## 2. Golden rule 10 — where the gate lives, and why there is exactly one

Setting a volume is a **CONFIGURATION** verb. `UPDATE` puts values IN FORCE; only a **take**
puts content ON AIR. `B-161` measured what happens when a configuration verb reaches a row that
owns no live seats: four `PLAY`s, four `MIXER VOLUME` and eight `MIXER FILL`/`CLIP` on a
`loaded` row, and the guest videos went to air with **no template above them**.

Audio is coupled into that same accident by one field: the seat is written at
`record.intendedVolume`, so a plate raised while the row was off air would have been **seated
audible** by whatever seated it next.

**The gate goes inside `setLivePlateVolume`, the one writer every audio path shares** — not
into each of the four verbs, and not into the new map method. That is the shape `B-161` itself
chose (`gate the one path the verbs share rather than making two paths agree`), and it means:

- the existing single-plate channel is gated by the same code as the new map channel;
- a fifth verb added later inherits the gate by construction rather than by remembering;
- there is exactly one place to read to know what the rule is.

**The predicate is `#ownsLiveSeats`, not `isOnAirStatus`.** A REHEARSING row is deliberately not
on air and yet owns its plates on PVW, so the air question alone would silently break rehearse —
`B-161`'s own warning, and it applies here unchanged.

**What the gate skips is BOTH halves of the send path**: the `MIXER … VOLUME` and the ledger's
`intendedVolume` write. Skipping only the send would leave the ledger claiming a volume the
layer never received, which is the standing-lie failure the method's existing comment already
guards against in the failed-send case.

**What it does NOT skip is the intent.** `#plateVolumes` is written exactly as before, so
arming a plate's audio ahead of the take still works — that is the whole affordance the mute
rule exists to preserve, and this must not take it away.

### The state where the gate actually bites, named

After `exitRehearse`. `out` and `stopItem` both call `teardownLiveLayers`, which releases the
ledger — so records and a not-on-air row do not coexist through those doors. `exitRehearse`
does **not** tear plates down: it drops the row from `#rehearsing` and restores the template
layer's own volume, leaving the plate records seated. That row owns seats by neither test, and a
raise there would put a guest's microphone on air with no graphic above it.

## 3. Does the map verb need `#withLiveSeatLock`? — YES, once per item

**The answer is yes, and it is a change in kind rather than in degree.**

`setLivePlateVolume` alone is not locked today, and that is defensible: it is one send and one
ledger write. The map verb makes **N** of them, and SOLO's contract is a **cross-plate**
statement — one plate at 1 and every sibling at 0 — that is only true if nothing reseats
between them.

Two concrete failures the lock closes, both of them golden rule 7's two-reads-with-an-await:

1. **Stale-intent clobber.** `#applyLivePlates` reads `#plateVolumes` at PLAN time and asserts
   it at SEAT time. A reconcile that planned before our write and seats after it sends the OLD
   volume, leaving the plate silent while the published intent says otherwise. The window is one
   `await` wide for a single plate and N awaits wide for a map.
2. **Half-applied SOLO.** A look switch interleaving between the raise and the mutes leaves two
   plates audible with nothing in the ledger or the intent map saying so.

**Why the take/out exemption does NOT extend to these verbs.** `take` and `out` are exempt
because a wedged switch must never be able to hold a row OFF AIR — the take is the operator's
repair verb. An audio verb queueing behind a switch is _correct_: the switch's own tail
re-asserts every plate's intent from `#plateVolumes`, so the result converges either way, and
the queued verb lands on the seats that actually exist rather than on the ones that were there
when it was pressed.

**And PANIC is not made unsafe by queueing**, which is the objection worth answering out loud:
the status-blind emergency remedy is `CLEAR ALL` / the row's own `CLEAR`, both un-gated by this
lock, both of which kill the layer and its audio outright. PANIC's job is to be the _gentle_
version, and a gentle verb may wait.

The lock is taken **once per item, around that item's whole map** — not per plate, or the
cross-plate property is lost again. `setLivePlateVolume` is not itself locked, so there is no
re-entrancy.

## 4. OFF-then-ON returns to 100 %, deliberately

OFF writes `0`. ON writes `1`. **ON does NOT restore the fader value that was in force before
OFF**, and the UI says so in words rather than leaving the operator to discover it.

Restoring the previous value requires a **second store of intent** — "what the volume was
before it was zeroed" — living beside `#plateVolumes` and answering the same question a second
way. That is the `B-100` / `P-012` class this repo has now paid for five times, and the failure
it produces here is specific: the two stores disagree after a bridge blip (only one of them is
retained), and the plate comes back at a volume nobody chose.

`0` remains a **real authored value** throughout — "the operator muted this plate" — and is
never folded together with the key being absent, which means "nobody has said".

## 5. SOLO and PANIC have no restore, and the UI must not imply one

Same argument as §4, one scope wider. SOLO writes `1` to one plate and `0` to every sibling of
the same item in ONE call; PANIC writes `0` to every plate the bridge holds a seat for. Neither
remembers what it overwrote, so neither offers an "un-solo" — the operator raises what they
want back, on the same faders.

**SOLO's sibling set is the item's SEATED plates, as the bridge's own ledger reports them** —
not the template's declaration and not the active look's membership. Three reasons: only a
seated plate can be audible; the pre-seat is the UNION of every look, so a held plate is in the
set and correctly receives a recorded-only `0`; and the ledger is the same array the panel is
already rendering, so what SOLO addresses and what the operator sees cannot disagree.

### PANIC's scope is the LEDGER — `B-122`, applied one verb along (`PATCH-BX-01` B)

**PANIC addresses every plate the BRIDGE holds a seat for, whatever any status says.** It is a
bridge verb (`stack.silence-all-live-plates`) that takes **no arguments**, because the scope is
not the caller's to choose.

⚠ **This section previously recorded the opposite, and the reversal is the point.** PANIC's
first cut resolved its scope in the BROWSER, from `features/stack/onAir.ts`'s `isOnAir`. That
was accepted here as a tension with two containments — and the tension was real: `onAir.ts`'s
own header says _"it must never gate a clear path again"_, because gating an emergency control
on believed status gates it on **exactly the values that may be wrong in the emergency**. It
cost two concrete cases:

- **A row holding seats while not reading on air was never reached.** The bridge routinely holds
  confirmed seats for such a row — `B-145`'s boot adoption restores the persisted ledger while
  the browser re-delivers its stack intent separately, so _"after a restart EVERY row arrives in
  this state"_. If a plate on one was raised, it is audible, and the panic button pointed
  elsewhere.
- **A browser whose ledger snapshot had not yet arrived would have silenced nothing** and
  reported a success for it — `B-122`'s failure verbatim.

⚠ **The earlier write-up named `exitRehearse` as the cause of the first case. That is wrong and
is corrected here:** a rehearsing row's plates are never seated in the first place
(`enterRehearse` seats nothing; `setActiveLook` returns early for a row that is neither on air
nor already seated; a `swapLiveSource`/`update` on one was probed and left the ledger empty).
**Boot adoption** is what produces a seated off-air row; rehearse is only a way of passing
through it. The window is real — the mechanism named for it was not.

`CLEAR ALL` is the precedent and the shape is copied from it deliberately: the one filter that
remains is about OWNERSHIP, not belief — a plate with no seat has nothing to silence — and that
is a structural fact the bridge wrote itself when it sent the `PLAY`.

#### 🔴 It does NOT weaken golden rule 10, and the sentence lives beside the code too

Rule 10 stops a **configuration** verb putting content **ON AIR**. Its own words are _"no
`PLAY`, no un-mute and no fill"_. PANIC does none of those three: it only ever LOWERS a volume,
on layers that already exist, and it **seats nothing, un-holds nothing, fills nothing and
creates nothing**. There is no state of the plant in which `MIXER … VOLUME 0` puts a frame or a
sample on air that was not already there.

That is why the gate inside `setLivePlateVolume` is now **DIRECTIONAL** rather than carrying a
PANIC exemption: a **raise** still requires `#ownsLiveSeats`, and a **silence** never does. And
gating the silence was a defect in its own right, not a conservative choice — OFF and a fader
dragged to zero were refused the wire on exactly the rows where a guest could actually be
audible, recorded an intent, and answered `ok`.

`the wire carries ONLY MIXER … VOLUME 0` in `live-plate-panic.integration.test.ts` is that
claim measured rather than argued, and the raise half is pinned beside it.

#### HELD plates: intent recorded, nothing sent

A held plate is seated but the active look punches no hole for it, and §12.4's hold is _"muted
and idle"_ — it is **already silent**, so there is nothing for a panic to take off air. Its
recorded intent still goes to `0`, because the reconcile that eventually un-holds it asserts
that intent: a plate silenced during a panic stays silent when its look comes back, instead of
returning at whatever it was before. This is the existing held rule inherited, not a second one
written for PANIC — which is why `silenced` (reached the wire) and `recorded` (intent written)
are reported as **two different numbers**, both true.

## 6. The metering ceiling is MEASURED, and it is why the design is what it is

`src/core/mixer/audio/audio_mixer.cpp` sets `state_["volume"]` to a `std::vector<int32_t>` of
**PEAKS — one per AUDIO channel (L/R), maximum across ALL mixed layers of that video channel**.
It surfaces as `/channel/N/mixer/audio/volume`. There is **no per-layer variant**, and 2.3
removed the older `…/audio/{n}/dBFS` addresses.

⇒ **A per-input meter cannot come from PGM's OSC.** That is not a limitation to work around
with cleverness; it is the shape of the data, and every design below follows from it:

- **(a) Live Source plates → ONE CasparCG channel per metered input.** The R2 MON channel array
  **IS** the metering array. Specified as one feature so the install is never asked to pay for
  the same channels twice.
- **(b) Template-internal `<video>` → a Web Audio `AnalyserNode`** inside `template-runtime`,
  pushed up the existing `__cg` seam. No CasparCG involvement, and it works with no MON channel
  at all.

**Extension points already in the tree**, named so the spec does not invent new ones: a new
`osc.channel.audio.peak` variant on `OscEventSchema`, and a **channel-only** case in
`OscInterestFilter.shouldEmit` alongside `osc.framerate` (today the only channel-only case).

**Pacing is its own budget.** Meters need ~25 Hz with peak-hold and decay. They must NOT ride
the `OscRateLimiter` allowance that protects state events — `osc.framerate` is budgeted at 1 Hz
there precisely because state events are what tally and occupancy are derived from. **A meter
that starves tally is worse than no meter.**

🔴 **An intent pill is NOT a meter.** "We asked for 100 %" and "sound is present" are different
claims, and a surface that merges them tells the operator the second when it only knows the
first. They are specified as visually distinct and merging them is forbidden.

## 7. Constraints on the MON channel, recorded before anything is built

- **`route://` requires the same video-mode / framerate on both channels.** A MON channel at a
  different mode will not carry a route from PGM.
- **`<system-audio/>` always downmixes to stereo.** A MON channel is a listening path, never a
  multi-channel monitoring matrix.

Both are recorded as _known constraints_, not as measurements — W5 and W6 in the runbook are
what turn them into facts about this plant.

## 8. What this change does NOT touch

- **The row's six-column verb block.** `layerTable.ts` fixes `VERB_COUNT = 6` and the sticky
  header prints the word above each glyph; a seventh button or a conditional inline control
  would put every header word above the wrong glyph, and this product's STOP and CLEAR are the
  inverse of the reference product's. The row's audio summary is **read-only and outside that
  grid**, in the alias cell beside the existing draft chip, adding no column.
- **`MASTERVOLUME`.** Never sent on this plant. W4 is what would change that.
- **The mute-on-create rule, the hold's mute, or the per-take re-assert.** All three are the
  mechanism this change feeds; none of them is duplicated or replaced.

# Design — `output-card-addressing` (C-030)

Session brief `CARD-ADDRESSING-01`, 2026-09-04, on tip `89811577`. Source quoted from CasparCG
`v2.5.0-stable` (the build the plant runs, `2.5.0 69e8ad5 Stable`). The plant was read only
(`VERSION`, `INFO 1`, `INFO CONFIG`); its config still names `23487013` and its channel 1 still runs
only `system-audio` and `screen`, so the `C-029` fixture stands. The dev host's own 2.5.0 was
started as the wire instrument and stopped; its config was not touched.

## §0 — settled, and re-checked rather than re-litigated

Nothing in the current tree or on the wire contradicts §0. `INFO CONFIG` on the plant still
echoes the declaration; the bridge sends no discovery command; `ADD` at a running index still
replaces (measured last session, `B-208`). Not a finding.

## §1 — where the operator gets the number

**The line, from source** (`src/modules/decklink/decklink.cpp`, `init`, lines 83–89):

```cpp
auto devices = device_list();
if (!devices.empty()) {
    CASPAR_LOG(info) << L"Decklink devices found:";
    for (const auto& device : devices) {
        CASPAR_LOG(info) << L" - " << device;
    }
}
```

and each entry (`device_list`, lines 60–68): `get_model_name(decklink) + L" [" + n + L"] (" + id + L")"`,
where `n` is the 1-based enumeration ordinal and `id` is `BMDDeckLinkPersistentID`. With the
logger's prefix, a real line reads:

```
[2026-08-25 15:53:18.xxx] [info]     - DeckLink SDI 4K [1] (23487013)
```

`[1]` is the **slot index**; `(23487013)` is the **persistent hardware ID**. ⚠ The block is printed
**only when at least one card was found** — a box with no card, or no driver, prints NOTHING, not
"no devices": an absence is the whole finding. **Read-from-source, not observed here:** the dev
host has logged `Decklink drivers not found.` at every start since 2026-08-24 (14 lines across 15
logs, 0 enumeration lines). The observed instance is the plant's, recorded 2026-08-25
(`docs/recon/2026-08-25-decklink-model-walk.md:53-54`), and it matches the source shape exactly.

**The recipe** (also in `docs/operator-guide/README.md` "Program output"):

1. File: on the playout machine, `D:\casparcg-server-v2.5.0-stable-windows\log\caspar_<date>.log`.
2. In a PowerShell window ON THE PLAYOUT MACHINE — not the CasparCG console, not the AMCP console
   — one line:
   `Select-String -Path 'D:\casparcg-server-v2.5.0-stable-windows\log\caspar_*.log' -Pattern 'Decklink devices found' -Context 0,4 | Select-Object -Last 1`
3. Copy `[slot]` for a slot index or `(persistent ID)` for a hardware ID into `<device>` in a text
   editor; restart CasparCG. Nothing found ⇒ the server saw no card, or no driver.

## §2 — does `<device>` accept an index? Yes, and both forms through one field

**Source.** `src/modules/decklink/consumer/config.h:34`:

```cpp
int64_t  device_index = 1; // Either an index, or a persistent id
```

`config.cpp:39` reads the element as one integer: `port_config.device_index = ptree.get(L"device", static_cast<int64_t>(-1));`
and `:134-135` defaults an absent element to **index 1**. The lookup, `src/modules/decklink/util/util.h:222-245`:

```cpp
for (int n = 1; pDecklinkIterator->Next(&current) == S_OK; ++n) {
    // Match index
    if (n == device_index) return decklink;
    // Match persistent id
    ... attributes->GetInt(BMDDeckLinkPersistentID, &id);
    if (id != 0 && id == static_cast<int64_t>(device_index)) return decklink;
}
CASPAR_THROW_EXCEPTION(user_error() << msg_info("Decklink device " + ... + " not found."));
```

**How CasparCG tells them apart: it does not.** Per card, in enumeration order, the slot ordinal
is tried first and the persistent ID second, through the same number. There is no magnitude
threshold and no separate element. A value equal to some card's ordinal IS that slot, whatever else
it might also be; a persistent ID that happened to equal a small ordinal would be shadowed by the
slot. In practice persistent IDs are long (the plant's is eight digits) and slots are single digits,
so the two never collide — but that is a property of the numbers, not of the parser. 🔴 **This is
the "distinguishes by guessing" case the brief flagged, and it is said loudly here and in the
operator guide.** One more sign that the field's native meaning is the SLOT: with
`keyer = external_separate_device` and no `<key-device>`, the key device defaults to
`primary.device_index + 1` (`config.cpp:146-148`) — arithmetic that only makes sense on an index.

**The prediction** — _small integer ⇒ slot index, large value ⇒ persistent ID, same field_ — held
in substance and failed in one word: CasparCG never DECIDES which form it was handed; it tries
both. The repo's own record already had the consumer half measured (`caspar.md:1031-1036`, the
2026-08-24 boot with `<device>23487013</device>` reaching `Initialized`, logged as
`[1-23487013|1080p5000]`) and the producer half (`caspar.md:1071`, "`DECKLINK DEVICE <n>` accepts
EITHER handle"); this session adds the mechanism.

**The bridge (§2b).** `command-builder.ts:458-460` emits `DECKLINK DEVICE ${producer.device}` for
the producer; `output-check.ts` `missingConsumerAddCommand` emits `ADD <ch> DECKLINK ${declared.device}`
for the consumer. Both pass the value through as an opaque token; neither assumes a form. The
producer's docstring (`:228-232`) already records both forms as measured and prefers the ID.

**The wire (§2c).** Dev host, nothing on air, each `ADD` bracketed by `INFO 1`:

| command                   | reply                   | `INFO 1`               | log                                      |
| ------------------------- | ----------------------- | ---------------------- | ---------------------------------------- |
| `ADD 1 DECKLINK 1`        | `403 ADD FAILED` (2 ms) | identical before/after | " Check syntax.", proxy `Uninitialized.` |
| `ADD 1 DECKLINK 23487013` | `403 ADD FAILED` (3 ms) | identical before/after | same                                     |

The two forms behave identically HERE because `create_iterator()` fails before any comparison
(no driver), so this host's wire cannot separate them; the source above does. On the plant the
index form would almost certainly SUCCEED — its card is at slot 1 — and put the channel on the SDI
output, which is an intervention, not a probe, and exactly the edit the owner is holding. Not run.
If the owner wants that measurement, it is: in the AMCP console, one line at a time, `INFO 1`,
`ADD 1 DECKLINK 1`, `INFO 1`, then `REMOVE 1 DECKLINK 1` and `INFO 1` — knowing that the middle
step puts the channel on air for the seconds between.

## §3 — is index addressing the right default HERE? A recommendation

**Failure under each scheme.** With a persistent ID, a swapped card gives **no output and the red
`C-029` banner** — the plant's last five days. With a slot index, a swapped card in the same slot
gives **output from the new card with no edit**, and on a multi-card box a card that moves slots
gives **the wrong card's output with no alarm** — the one failure this product treats as the
worst class, a confidently wrong picture on air.

**Which is safer for a broadcast plant.** In general, the ID's: fail-closed and loud beats
silently wrong. **For THIS plant, the index's**, because the general risk requires a second card
and this box has exactly one slot in use (`DeckLink SDI 4K [1]`, the 2026-08-25 record, not
re-verified from here): with one card, `<device>1</device>` cannot address a different card than
the one installed — a substitution would need someone to physically fit a different card, which is
not silent — and an empty slot still fails closed with the banner (`Decklink device 1 not found.`).
The persistent-ID scheme, on this box, buys no protection and costs an edit-and-restart at every
swap, which is the failure that just happened.

**Recommendation (not a decision):** `<device>1</device>` for this plant, on the condition that
the moment a second DeckLink is fitted the declaration goes back to the persistent ID and the
`C-029` banner is the safety net. The trade-off in one paragraph is in the operator guide.

**Prepared, not applied** — the file is `D:\casparcg-server-v2.5.0-stable-windows\casparcg.config`
on the playout machine, edited in a text editor (never a console), followed by a CasparCG restart
(consumers are created at boot; there is no reload):

- Index: change `<device>23487013</device>` to `<device>1</device>`.
- ID: change `<device>23487013</device>` to `<device>NNNNNNNN</device>`, NNNNNNNN being the number
  in `( )` on the new card's `Decklink devices found` line (§1).

## §4 — the alarm names the form

`describeDeviceAddressing` (`@cg/shared-ipc` `outputs.ts`): digits `1…64` ⇒ `slot-index`,
`≥ 1000` ⇒ `persistent-id`, else `unknown` — a READING for the operator, never a claim about the
parser, which is why `DEVICE_ADDRESSING_RULE` ("slot position first, persistent ID second, no
marker") travels with it everywhere. `DEVICE_NUMBER_RECIPE` is §1 in one sentence. The banner adds
one line per missing device plus the recipe line; `describeMissingOutput` appends the same. The
limit on what the alarm knows is unchanged and asserted (`not.toMatch(/reference signal|dropping
frames|unhappy/)`). Red-first: `device-addressing.test.ts` (5/5 red), `outputMissingBanner.addressing.dom.test.ts`
(4/5 red, the boundary case green by construction), `output-addressing.test.ts` (3/3 red), then green.

## §5 — not in scope, and not touched

Discovery or probing; `--create-missing-consumers`; `<device>` itself; the mixer `DEFER` exposure;
`B-192` term (b); the orphan html layer (the plant's `INFO 1` no longer showed layer 96 tonight — a
dirty plant getting cleaner, not this subject).

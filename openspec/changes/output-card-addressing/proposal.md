# The output card's addressing is settled, and the alarm says where the number comes from (C-030)

## Why

`C-029` made the missing program output LOUD and told the operator to _"read the CasparCG log on
the playout machine"_. That is true and not yet actionable: which log, what to search for, which
of the two numbers on the line to copy. And underneath the owner's original wish — _"the output
card must be auto-detected"_ — sits a question `PGM-OUTPUT-ALARM-01` settled only half of: discovery
is impossible over AMCP, but **why must a number be typed at all?** If `<device>` addresses the
card by SLOT rather than by hardware ID, a same-slot card swap needs no edit, which is what the
owner meant by auto-detection, achieved by addressing rather than by discovery.

## What changes

1. **The log recipe, concrete.** Three lines an operator can follow — the file, the one search
   command with the window it goes in, and which bracket on the line is which — in the operator
   guide, in the banner, and in the bridge's stderr line. The line shape comes from the 2.5.0
   source (`decklink.cpp` `init`: `Decklink devices found:` then ` - <model> [n] (id)` per card)
   and matches the plant's observed line of 2026-08-25 (`- DeckLink SDI 4K [1] (23487013)`). It is
   printed only when at least one card was found: no line means no card, or no driver.

2. **The addressing question, answered from source and recorded.** `<device>` accepts BOTH a
   1-based slot index and a persistent ID through ONE `int64_t` field (`config.h:34`, "Either an
   index, or a persistent id"); `get_device` walks the cards in order and matches the slot ordinal
   FIRST and the persistent ID SECOND, with no threshold and no marker on the number. The
   prediction held, in its uncomfortable form: CasparCG does not distinguish the forms — it tries
   one, then the other. The bridge passes the value through untouched in both places it emits it.

3. **The alarm names the form in force** — "declared as hardware persistent ID 23487013 (a slot
   index would be a small number such as 1)" — followed by the rule sentence and the recipe. It
   claims nothing new about a consumer's health. Pinned red-first by tests in three workspaces.

4. **A recommendation for this plant, not a decision**, with the trade-off and both prepared
   one-line edits, filed under `C-030`; the config edit and the restart stay the owner's.

## Capabilities

- `runtime-ui` — ADDED: the output alarm names the addressing form of the declaration and where
  the number comes from.

## Impact

- `@cg/shared-ipc`: `describeDeviceAddressing`, `DEVICE_ADDRESSING_RULE`, `DEVICE_NUMBER_RECIPE`
  beside the `C-029` parsers; no schema change.
- Runtime: `OutputMissingBanner` gains one line per missing device plus the recipe line.
- `@cg/caspar-bridge`: `describeMissingOutput` carries the same two facts; no wire or behaviour
  change, no new command.
- Docs: `C-030` (caspar.md), the operator guide's recipe and trade-off, the registry entry.
- Not touched, by rule: `casparcg.config`, CasparCG on the plant, `--create-missing-consumers`,
  discovery or probing of any kind.

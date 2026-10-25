# Design — Clock custom UTC offset (D-134)

## Data model

`utcOffsetMinutes?: number` is additive and stores the signed fixed offset as an integer number of
minutes. Minutes avoid decimal-hour ambiguity and preserve offsets such as `+03:30`, `+05:45` and
`+12:45` exactly. The accepted range is the civil UTC-offset envelope `-14:00…+14:00`.

Presence selects Custom offset; absence selects Local in new authoring. The schema/runtime continue
to accept D-084's `timezone` for old scenes, while the Inspector no longer offers it. The schema
refuses `timezone` and `utcOffsetMinutes` together, and either visible mode clears legacy zone data
when committed, so new authoring has no hidden precedence rule.

## Runtime arithmetic

For a fixed offset, the formatter adds `utcOffsetMinutes * 60_000` to the instant and reads the
result with UTC getters. This produces the requested fixed wall components independently of the
playout machine's own zone and DST. IANA zones continue through `Intl.DateTimeFormat`; local time
continues through local `Date` getters.

The format-token engine and digit mapping run after component selection exactly as before. Countup
and countdown do not read either `timezone` or `utcOffsetMinutes`.

## Authoring control

Wall mode shows a `time source` select with only `Local` and `Custom offset`. Custom offset shows a
fixed-width `±HH:MM` mask. The sign and colon are structural; digit keys overwrite the four numeric
slots, non-digit keys do nothing, and paste/automation input is accepted only when the whole value
is valid. The parser accepts Latin, Persian or Arabic-Indic digits, requires a sign, rejects invalid
minutes and values beyond `±14:00`, and keeps the last valid value when an edit is refused.

Switching into Custom offset seeds `+00:00` when no offset exists. Switching to Local clears both
optional fields. A legacy scene that still carries `timezone` continues to render it until the
author chooses Custom offset (and may then switch back to Local); the Inspector names the legacy
state rather than silently rewriting the project on open.

## Compatibility

No migration or schema-version bump is needed. Existing clocks have neither field or only
`timezone` and therefore keep their exact runtime meaning. Export embeds the scene JSON and boots
the same runtime, so no separate exporter implementation is required.

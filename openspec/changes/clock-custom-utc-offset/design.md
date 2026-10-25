# Design — Clock custom UTC offset (D-134)

## Data model

`utcOffsetMinutes?: number` is additive and stores the signed fixed offset as an integer number of
minutes. Minutes avoid decimal-hour ambiguity and preserve offsets such as `+03:30`, `+05:45` and
`+12:45` exactly. The accepted range is the civil UTC-offset envelope `-14:00…+14:00`.

Presence selects Custom offset. `timezone` presence selects Time zone. Neither present selects
Local. The schema refuses both at once, and every Inspector mode change clears the other field, so
there is no hidden precedence rule.

## Runtime arithmetic

For a fixed offset, the formatter adds `utcOffsetMinutes * 60_000` to the instant and reads the
result with UTC getters. This produces the requested fixed wall components independently of the
playout machine's own zone and DST. IANA zones continue through `Intl.DateTimeFormat`; local time
continues through local `Date` getters.

The format-token engine and digit mapping run after component selection exactly as before. Countup
and countdown do not read either `timezone` or `utcOffsetMinutes`.

## Authoring control

Wall mode shows a `time source` select with `Local`, `Time zone`, and `Custom offset` choices.
Time zone keeps the existing curated picker. Custom offset shows a text field formatted as
`±HH:MM`; the parser accepts Latin, Persian or Arabic-Indic digits, requires a sign, rejects invalid
minutes and values beyond `±14:00`, and resets an invalid draft to the last committed value.

Switching into Time zone seeds `UTC` when no zone exists. Switching into Custom offset seeds
`+00:00` when no offset exists. Switching to Local clears both optional fields.

## Compatibility

No migration or schema-version bump is needed. Existing clocks have neither field or only
`timezone` and therefore keep their exact meaning. Export embeds the scene JSON and boots the same
runtime, so no separate exporter implementation is required.

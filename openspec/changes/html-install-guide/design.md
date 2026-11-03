## Decisions

HTML is the canonical help artifact and is self-contained for offline delivery. Release automation passes `--playout-version`; interactive builds prompt only when a TTY is available, while CI fails clearly if it is omitted. The current release value is 2.17.1.

# Program output missing is SAID — the declared-versus-running output check, its banner, and a bounded, off-by-default re-creation (C-029)

## Why

The plant lost its program output on 2026-09-01 and **nothing said so.** The DeckLink card was
replaced; `casparcg.config` kept the old card's persistent ID (`<decklink><device>23487013</device>`);
the consumer failed at boot and never appeared in `INFO`. AMCP answered, OSC ticked, every pill
read `HEALTHY`, and the station had no SDI output. The absence was discoverable only by reading
`INFO 1`'s XML and noticing that `<output>` listed `system-audio` and `screen` and nothing else.

That is the `B-141` / `B-143` / `B-144` family — _the system knows something and does not say
it_ — one layer further out than any of them: here the system did not even look. `R-058`'s
`NOT PRODUCING` chip cannot help, by construction: it reports a channel that ticked and STOPPED,
and a channel whose consumer failed at boot ticks normally on its remaining consumers. The
recorded decision under `R-058` (_"the console does not read casparcg.config … AMCP does not
expose it"_) was also **wrong on the fact**: the 2026-08-25 walk had already measured that
`INFO CONFIG` returns the parsed configuration, and the same walk's Q2 correctly recorded that
this is _what the operator wrote_, not what the card reports. Both facts are what this change is
built on: the declaration is the boot-time baseline the operator intended; `INFO <channel>` is
what runs; the difference is the alarm.

## What changes

1. **The bridge reads two documents over the AMCP axis and publishes one verdict.**
   `INFO CONFIG` once per connection (what each channel DECLARES), and the `<output>` block of
   the `INFO <channel>` reply the `R-030` mode read already sends (what RUNS), re-read every
   60 s while reachable and again after a reconnect. A declared consumer kind with fewer
   running instances than declared is `missing`; the verdict travels in `ServerHealth.outputs`
   and is kept across a disconnect so its last value is never silently lost.

2. **A full-width alarm banner in the Runtime**, in the same strip language as
   `ConnectionBanner` and `RasterMismatchBanner`: it names the channel, the declared consumer
   and its device, what IS running, and the next action. When the bridge cannot reach CasparCG
   after a `missing` verdict, the banner stays and re-labels itself UNVERIFIED rather than going
   quiet. `outputVerdictOf` in `@cg/shared-ipc` is the one authority for every arm.

3. **The honest limit is stated where an operator reads it.** Nothing enumerates DeckLink
   devices over AMCP (measured: `INFO SYSTEM` degrades to `INFO`; `INFO CONFIG` echoes the
   config; the device list exists only in the startup log, which the bridge does not read). So
   "auto-detect" cannot mean discovery. What it means here: **the operator names the device in
   `casparcg.config`; the bridge verifies that the declared consumer is running and complains
   when it is not.** Probing with `ADD` is not a substitute for enumeration (measured — see
   `design.md` §3).

4. **A bounded re-creation behind `--create-missing-consumers`, OFF by default.** On, the
   bridge sends ONE `ADD` per connection per channel, built from the declaration's OWN
   parameters (never a different device), records the wire's answer in the health snapshot,
   and verifies a `202` by re-reading `INFO`. A test reddens if the default flips.

5. **Two lying errors on the consumer side are filed as `B-208`**, measured on the plant and the
   dev host: an `ADD` for a device CasparCG cannot open answers `403 ADD FAILED` with
   " Check syntax." in the log (the same code as a bad parameter), and the prompt's spelling
   `ADD 1 DECKLINK DEVICE <n>` is itself a grammar error that answers `404 ADD FAILED` exactly
   like `ADD 1 FOOBAR`. `REMOVE`'s `202` precedes the consumer's destruction by 13–16 ms, and an
   `ADD` at an index that is already running REPLACES it (old destroyed ~28 ms after the new
   one's `202`).

## Capabilities

- `runtime-caspar-bridge` — ADDED: the declared-versus-running output check; ADDED: bounded,
  off-by-default missing-consumer creation.
- `runtime-ui` — ADDED: a declared output that is not running is a full-width alarm that does
  not go quiet when its source dies.

## Impact

- `@cg/shared-ipc`: `ServerHealth.outputs?` (additive, optional), `outputVerdictOf`, and a new
  `outputs.ts` with the two parsers and the per-kind diff. No channel is added or renamed.
- `@cg/caspar-bridge`: the check in `CasparRuntime` (two reads, one verdict, reconnect reset,
  the slow re-read), `output-check.ts` (policy + the `ADD` builder), `--create-missing-consumers`,
  a boot line that reads the default back. The integration harness's quiescence control now
  also waits for the check's first latch.
- `@cg/amcp-mock`: `INFO CONFIG` answered in the real dialect; `INFO <channel>` carries a
  realistic `<output>`; top-level `ADD`/`REMOVE` refuse with the measured codes by default.
- Runtime: `OutputMissingBanner` mounted beside the other banners; the `R-058` chip's last
  sentence no longer claims the console cannot read the config.
- Docs: `C-029` (caspar.md), `B-208` (bugs-runtime.md), an addendum under `R-058`, the operator
  guide's new "Program output" section.
- Out of scope, deliberately (the brief's §5): `B-192` term (b), the mixer `DEFER` exposure, the
  orphan html layers 95–99 on the plant, and `B-204`/`B-205` (already closed 2026-09-02).

# playout-sources — plates take their sources from the Playout

Prompt `PLAYOUT-SOURCES-01` (v5). PRD `C-044`. Filed alongside: `B-286`.

## Why

CG Control kept its own list of live inputs, typed by an operator: a second copy of something the Playout already
owns, wrong the moment the two disagree. Contract v1.2 gives the Playout's own lists — **D10**, the station's
inputs, and **D11**, its media library, searched and paged on the Playout's side — and v1.3 adds the shapes of the
holder channel. From now on the Playout is the one place inputs and media are defined.

## What changes

- The bridge reads D10 (a small list it keeps) and D11 (searched and paged there), and builds the catalogue every
  plate resolves against from those reads — plus the media items actually bound. The last good lists are
  persisted and stay in force across a Playout outage and a restart.
- What the Playout stops offering is **unavailable, never deleted**: the binding is kept and tagged, a take that
  would seat it is refused in one sentence before any AMCP, and air is untouched.
- **One picker** with two tabs, Inputs · Media, replaces the three native selects that bind a plate. Media search is
  fast and paged; media never mix with inputs.
- CG Control's own source catalogue editor goes. Station setup keeps the plate band and lists the Playout's inputs
  read-only.
- The NDI producer's wire spelling becomes the one the Playout's core accepts: `[NDI] "HOST (Cam 1)"`.
- A stream URL is never shown in the console, and its credentials are written `scheme://***@` in the log and audit.
- v1.3's shapes parse and show; a `route` input is gated "Not supported yet." until `ROUTE-PLATES-01`.
- Every plate from a D10 input starts silent and is only ever raised by a 25-frame ramp.

## Impact

- `@cg/shared-ipc`: the D10/D11 shapes, the catalogue builder, `redactUrlCredentials`, the route gate, the band-only
  `sources.set-config`, `sources.media-search`, `sources.refresh`; optional entry fields on `SourceDefinition`.
- `@cg/shared-schema`: `TakeRefusal.sourceOrigin`.
- `tools/caspar-bridge`: `PlayoutSources` readers and stores, the take refusal, the one retry, the NDI arm,
  redaction, the OSC path drop, the D10 audio rule, D4 `videoMode`/`pendingRestart`.
- `@cg/caspar-client`: the OSC mapper drops `file/path`'s value.
- `apps/runtime`: `Popover`, `VirtualList`, `SourcePicker`, `SourceLabel`; Station setup's read-only list;
  `LiveSourceDialog` removed; the mock fed through the same builder.
- The fake Playout serves D10/D11 as their answer describes; the AMCP mock accepts the new NDI spelling.
- ADR 0010 gains rule 14. `C-021` annotated.

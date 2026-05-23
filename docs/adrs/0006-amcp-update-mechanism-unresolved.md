# ADR 0006 — AMCP update mechanism for HTML producer (unresolved; deferred to M4)

- **Status:** Accepted (with open question)
- **Date:** 2026-05-23
- **Spike:** M1 Spike D
- **CasparCG version observed:** 2.3.2 Dev (`4de6d18f`)

## Context

Spike D set out to verify that an `update` command sent over AMCP
reaches `window.update` on a running HTML producer with its Persian
JSON payload intact, and to measure the latency from AMCP send to
visible DOM mutation. Two AMCP patterns were attempted:

1. **`CG ... INVOKE 1 "update" "<json>"`** (per Phase 4 §9, modeled on
   Flash-template conventions).
2. **`PLAY [HTML]` + `CALL ... "update" "<json>"`** (the more
   HTML-producer-native command per CasparCG community docs).

## Findings

### What is known to work

- **AMCP wire transport is reliable.** `VERSION` returns `201 OK` with
  the build identifier. `PLAY` returns `202 OK`. The TCP socket
  delivers our bytes verbatim — CasparCG echoes them back in its log
  (with Persian characters displayed as `?` because the Windows
  console uses code page 1252, but the underlying bytes on the wire
  are UTF-8; this is a log display artifact, not a transport bug).
- **PLAY 1-N [HTML] "file:///..."** loads and renders an HTML
  producer — Spike A proved this end-to-end with the Persian
  reference render.
- **`CG ... PLAY 1`** returns `202 CG OK` against a live HTML layer.
- **`CALL ... "update" "<json>"`** returns `202 CALL OK` on a live
  HTML page, **but `window.update` is never invoked** — the page
  continues to display its initial state ("…waiting for first
  update…") indefinitely. Either CALL on HTML producer in 2.3.2
  routes to a different handler than the on-page `window.<method>`,
  or the syntax needs different framing than we tried.
- **End-to-end command latency** (amcp-poke → CasparCG receive):
  consistently under 5 ms over localhost — well within the
  Reconciler's optimistic-UI budget (Phase 5 §8.4).

### What did NOT work as Phase 4 §9 described

- **`CG INVOKE 1 "update" "<json>"`** returns `202 CG OK` (when timed
  after page load) but **`window.update` is called with an empty
  payload**. The update-probe page received the function call (its
  internal counter incremented) but the parameter was empty.
  Conclusion: **`CG INVOKE 1` on an HTML producer does not relay its
  string parameter to the JS function.** Phase 4 §9 is wrong on this
  point.
- (Initial concern that `PLAY [HTML]` destroyed the page immediately
  was a red herring — the "html ... Destroyed" log line referred to
  a prior layer-30 instance being cleaned up by the new PLAY. The
  new page persists indefinitely. PLAY [HTML] keeps the page alive
  on its own.)

### Unresolved

- **The correct AMCP command sequence** to: (a) load an HTML
  producer, (b) keep it alive, (c) push a JSON payload to
  `window.update`, and (d) cleanly stop it.
- **Whether Persian UTF-8 reaches `window.update` intact** when (a)–(c)
  are correctly sequenced. The bytes definitely arrive at CasparCG;
  whether CasparCG forwards them to the JS layer correctly is the
  open question.

## Decision

Spike D's headline question — "is the AMCP update path safe for
Persian payloads?" — splits into two:

1. **AMCP transport is safe.** UTF-8 bytes survive the wire.
   `@cg/caspar-client` can send Persian-laden JSON without further
   investigation needed at the transport layer.
2. **The correct command sequence for "update an HTML template" is
   unresolved.** Deferred to M4 (`@cg/caspar-client`), where a proper
   investigation has tooling (typed responses, OSC observation, a
   replay loop against the live server) that bare amcp-poke lacks.

## Consequences

- **Phase 4 §9 needs revision.** The current "CG INVOKE 1 update"
  example doesn't work as documented for HTML producers. Update the
  doc once M4 finds the right sequence.
- **M3.4 starter template** (Persian lower-third) **does not depend
  on AMCP-driven updates.** The starter renders with declared field
  defaults from the scene's `fields[]` table — no INVOKE/CALL
  required to see Persian on air. The "live update" path is
  exercised separately by M4's integration tests once we know what
  AMCP sequence works.
- **M4 (`@cg/caspar-client`) acceptance criterion adjusted:** one of
  its first tasks is to nail down the AMCP update sequence for HTML
  templates against a real CasparCG 2.3.2 (the same VM we used
  here), test variants of `CG ADD`/`CG INVOKE`/`CALL`/`PLAY
[HTML]`/`MIXER`, and codify the working pattern as the public
  `client.update(slot, fields)` method.
- **Risk:** if no AMCP sequence reliably delivers JSON to
  `window.update` in 2.3.2, fallback options include: (a) using
  CasparCG's HTML producer's URL query string for initial data
  (`PLAY 1-20 [HTML] "file:///...?data=..."` — page reads
  `location.search`), (b) running a tiny WebSocket sidekick from the
  template HTML that reconnects to the Runtime directly. Both add
  complexity; we hope option (a)/(b) aren't needed.

## Open follow-ups

- **M4.A** — empirical AMCP update-sequence investigation. Spend the
  first M4 day with this harness; document the working sequence.
- **Phase 4 §9 update** — apply the M4 finding back to the export
  architecture doc.
- **OSC update confirmation** — once the right AMCP sequence is
  found, verify that the corresponding OSC event signals the update
  is complete (Spike B saw no `cg.invoked` event; the right marker
  might be a `/foreground/file/path` change or no marker at all).

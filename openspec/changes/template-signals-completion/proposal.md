# A template that finishes by itself takes its row off air

## Why

The operator's complaint, recorded in `C-013` and unchanged since: after a while the stack
shows several rows as ON AIR while only one thing is actually on output. A logo set to two
passes has played its two passes and gone; a title has run its few seconds and closed. The
picture is gone and the row still claims air, so ON AIR has lost its information value and
the operator cannot tell which row corresponds to what the viewer sees.

It is not a reporting bug. A finished graphic has hidden itself but its HTML producer
remains RESIDENT on the layer, so OSC honestly reports `html`. Residency is deliberate —
it is what lets a lower-third be UPDATEd for the next guest without a reload. **Nothing
tells the bridge the CONTENT finished**, and the only party that knows is the template.

`C-013` names that missing channel as its whole substance. `C-017` proposes a concrete
shape for it — the served page pings its own origin. This change builds the ONE channel
and serves both items with it.

## What Changes

**A per-take token rides the road that already exists.** `CgControl` — the `__cg` reserved
key inside the field payload that `CG ADD` and `CG UPDATE` already carry — gains a `take`
member. The bridge mints one per take and the page echoes it back. The token is what makes
a signal name the TAKE rather than the template or the layer, which is the difference
between stopping the run that finished and stopping a newer one that had not.

**The page emits once, at its own full settle.** The runtime already knows the moment: the
root scope's self-settle, the same moment `Root self-settle takes every nested scope off
air` is written about. A self-ending lifecycle reaching it emits a new `self-end` lifecycle
event; an operator-driven `stop()` / `out()` / `remove()` does not, because the bridge
asked for those and does not need telling.

**The served page's CSP gains `connect-src 'self'`, and that is a deliberate relaxation.**
`SECURITY.md` says templates ship blocking outbound network calls and "do not relax this
without strong justification". The justification is `C-017`'s own direction and the owner's
decision of 2026-09-15. The relaxation is the narrowest one that exists — SAME ORIGIN only,
which for a served page is the bridge that served it and nothing else — and the page opens
no connection at all unless it was handed a take token, which only this bridge sends.

**The bridge answers on a new route and reuses the stop it already has.** `POST /complete`
on the template HTTP server, validating the token against the live take; a valid signal
calls the same internal stop the operator's STOP calls, recorded under a non-operator
actor. Anything else is a `404` with no side effect.

**`C-017`'s terminal verb is superseded.** That item proposed a hard CLEAR. The owner's
decision of 2026-09-15 is that the terminal verb is `C-012`'s graceful **STOP**: the row
leaves ON AIR and lands exactly where a manual STOP leaves it — producer resident, a later
PLAY instant. One transport, one verb, both items.

## Impact

- **Affected specs:** `designer-playout-lifecycle` (the emission half),
  `runtime-caspar-bridge` (the receipt and the stop), `runtime-onair-cef-compat` (what the
  served page is allowed to do on the network).
- **Affected code:** `@cg/shared-schema` (`control-payload.ts`), `@cg/template-runtime`
  (`runtime.ts`, `playout-controller.ts`, a new completion-ping adapter),
  `@cg/single-file-export` (the boot script and the CSP), `tools/caspar-bridge`
  (`template-http-server.ts`, `caspar-runtime.ts`), `apps/runtime` (`MockRuntime` parity).
- **Affected docs:** `SECURITY.md` (the relaxation, stated where the old claim is),
  ADR 0009 (a dated section), `docs/prd/caspar.md` (`C-013` to `[~]`, `C-017` annotated).

⚠ **Every template must be re-imported.** This changes the page runtime, and a template's
page is BAKED AT IMPORT (`C-034`). A template imported before this change has a page that
cannot signal, and its row will go on claiming ON AIR exactly as it does today.

⚠ **The CEF half is owed on hardware.** `fetch` from a served page inside CasparCG's CEF is
the `B-066` class — verify, never assume. This change measures the CSP and the round trip in
a real browser engine; only the plant can measure CEF.

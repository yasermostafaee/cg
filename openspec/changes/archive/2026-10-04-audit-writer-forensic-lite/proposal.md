# B-141 — wire the audit writer, forensic-lite

## Why

The Audit log is empty after a whole session because the bridge's audit was an **in-memory array
with exactly ONE append site** (`caspar-runtime.ts`, writing `action: 'reconnect'`), under a section
header that called itself an in-memory stub. A record a process restart erases is not a forensic
record.

Meanwhile `@cg/audit` — an `AuditWriter` with `lastError` and a `readRecentEntries` tail reader —
was **dead code**: the only reference to it outside the package was `eslint-config`'s
`MAIN_ONLY_PACKAGES` entry, a rule forbidding browser code from importing something nothing imports.

And the panel's filter list had drifted from the schema it filters.

## What changes

- **`--audit-log-path`**, defaulting to `~/.cg-runtime/bridge-audit.ndjson`, following the existing
  store precedent exactly rather than inventing a convention. Never under `templatesDir` (B-116).
- **The writer becomes the source of truth**; `auditRecent` reads its tail.
- **ONE definition of the action set** — the panel's options are derived from
  `AuditEntrySchema.shape.action`, which had silently drifted to eleven against the schema's fifteen.
- **Every append site wired**, each at the point its outcome is known: the seven playout verbs
  (`load` · `take` · `update` · `out` · `stop` · `next` · `remove`), through a structural wrapper,
  plus `import`.
- **The panel's three empty states**, backed by a new `audit.health` channel.
- 🔴 **A failed audit write can never take the station off air.** Fire-and-forget appends; the writer
  reports and keeps trying. The contrast with the config stores is deliberate: those are
  preconditions for correct playout, an audit entry is a record of what happened.

## The append sites are STRUCTURAL, not disciplined

The seven playout verbs have between three and eight exits each — every refusal is its own `return`
— so "remember to append before each one" is a rule that holds until the next branch is added, and a
single append at the end of each would record `ok` for every refusal. That is the reason session B
left them unwired rather than wiring them quickly, and it is the specification for how they are
wired now.

So the public method of each verb IS the wrapper (`#audited`), the real body is a private impl it
calls exactly once, and every path out of that impl — including a **throw** — passes through one
place that derives the outcome from what the operation ANSWERED. The same move as B-139: an API that
cannot be called wrong beats a call site that happens to be correct today.

Three consequences worth stating, because each is a property the naive version loses:

- **The `errorCode` travels.** A refused take is `failed` + `rehearsing` / `live-source-unassigned` /
  `disconnected`, never a bare "failed". The refusals are the entries a dispute turns on.
- **`ts` is stamped at the OUTCOME**, so file order is outcome order rather than invocation order:
  two concurrent takes appear in the order they finished, which is the order air saw them. ⚠ That
  needs BOTH halves — see "the ordering claim was false" below.
- **The pre-state is what gets named.** `remove` deletes the slot and `out` empties the layer, so the
  item / template / layer are read BEFORE the impl runs — otherwise the record would name the layer
  the item is on now (none) instead of the one the operator acted on.

## Two things this turned up, fixed here rather than filed

- 🔴 **`timeout` was unreachable.** `#send`'s catch flattened every throw — `AmcpTimeoutError`
  included — into `amcp-send-failed`, whose operator sentence is "The command never reached
  CasparCG". A timeout means the command LEFT and nothing came back: a different machine, a
  different remedy, and the schema's third outcome had nothing that could produce it. Now
  `amcp-timeout` is its own code, with its own sentence, and it is what makes `outcome: 'timeout'`
  real. Same class as `mute-failed` (DEBT.md §5): a wrapper may add context, it may not replace the
  cause.
- **The audit file handle was never closed.** `AuditWriter` holds one open for its whole life and
  offers `close()`; nothing called it, so every runtime leaked a descriptor that node destroys at GC
  — a hard `ERR_INVALID_STATE` since node 22. `CasparRuntime.stop()` now closes it.
- 🔴 **THE ORDERING CLAIM WAS FALSE WHEN FIRST MADE, AND CI IS WHAT CAUGHT IT.** `#recordAudit` is
  fire-and-forget by contract, so two `handle.write`s were in flight at once. Each is atomic under
  `O_APPEND`, but two concurrent ones dispatch to different threadpool threads and complete in
  EITHER order — so a refusal landed ahead of the accepted action that preceded it. The local
  Windows gate had agreed with the claim; the Linux run did not.

  `AuditWriter` now CHAINS its appends, which makes the claim true rather than retracting it. ⚠ The
  chain's tail can NEVER reject (`link.then(noop, noop)`): a plain `tail = tail.then(write)`
  short-circuits, so one rejected link would poison the chain and drop every later append in
  silence — a fix that becomes a no-op at exactly the moment the thing it guards starts failing.
  `close()` awaits the tail, so the rows queued as a process goes down still land.

## Scope, decided

**Forensic-lite.** The record goes on disk and survives a restart. **File rotation, the UNC fallback
and any retention policy are DEFERRED** and are not built here — and the writer's docstring, which
promised the first two, is corrected rather than left as a warning that outlives its truth.

## 🔴 The one thing this does NOT deliver: `actor`

Every entry carries `actor: 'operator'`, a constant. The control WebSocket is unauthenticated
loopback and carries no identity, so nothing anywhere distinguishes two people driving the same
rundown. The record therefore answers _what happened_ honestly and answers _who did it_ with a
placeholder — which is half of what a forensic log is for, and on a shared console the half a dispute
turns on.

It is a **constant rather than N literals** so that the day an identity scheme is decided there is
exactly one place that learns about it. Choosing that scheme is an owner decision and is deliberately
not taken here.

## Impact

| Area                  | Effect                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `tools/caspar-bridge` | `#audited` wrapper + 9 append sites; `amcp-timeout`; two missing refusal codes; handle close |
| `@cg/audit`           | source of truth; docstring corrected to what it actually does                                |
| `@cg/shared-ipc`      | `audit.health` — the positive control for the panel's empty state                            |
| `apps/runtime`        | the panel's three empty states; two new operator sentences                                   |

Capability: `runtime-ui` (ADDED — the audit record, its append sites and its three empty states).

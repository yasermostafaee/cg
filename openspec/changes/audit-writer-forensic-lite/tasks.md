# Tasks — B-141, wire the audit writer (forensic-lite)

> ✅ **COMPLETE.** Session B wired the foundation (§1–§4) and deliberately left the append sites
> for their own pass; §5 records why, and §5 is now done. Nothing in this change is outstanding
> except the three capabilities DEFERRED by owner decision (rotation, UNC fallback, retention) and
> the `actor` identity scheme, which is an open owner question rather than an omission.

## 1. Where the record lives

- [x] 1.1 `--audit-log-path`, defaulting to `~/.cg-runtime/bridge-audit.ndjson` — the SAME shape as
      `--source-assignments-path` → `~/.cg-runtime/bridge-source-assignments.json`, not a new
      convention.
- [x] 1.2 ⚠ **NOT under `templatesDir`** — `TemplateRegistry` reads every `*.json` there as a
      template (B-116). Stated at the flag.
- [x] 1.3 Plumbed `bin/caspar-bridge.mjs` → `createBridge` → `CasparRuntime`.

## 2. The writer becomes the source of truth

- [x] 2.1 `CasparRuntime` constructs an `AuditWriter` when a path is configured. Constructing opens
      nothing; the first append creates the directory and the file. Deliberately NOT probed at boot.
- [x] 2.2 `auditRecent` reads the tail via `readRecentEntries` when a path is configured, falling
      back to the in-memory tail otherwise. A read failure does NOT return an empty log — "nothing
      here" and "I could not look" must not look the same.
- [x] 2.3 `#recordAudit` — one append helper, keeping an in-memory tail in BOTH modes so the read
      path always has something coherent to answer with.
- [x] 2.4 🔴 **A failed audit write can never take the station off air.** Every append is
      fire-and-forget and its rejection is swallowed at the call site; the writer records
      `lastError` / `errorCount` and keeps trying. The contrast with the config stores is stated
      where the field is declared: those files are PRECONDITIONS for correct playout, so an
      unusable one is a hard boot failure; an audit entry is a RECORD OF what happened and nothing
      downstream reads it to decide what to send.
- [x] 2.5 `auditHealth()` exposes `{ configured, path, errorCount, lastError }` — the three states
      the panel needs to tell apart.

## 3. ONE definition of the auditable action set

- [x] 3.1 **The panel's list is DERIVED**, not hand-kept:
      `['all', ...AuditEntrySchema.shape.action.options]`.
- [x] 3.2 **The disagreement it had drifted into, recorded:** the literal held ELEVEN actions while
      `AuditEntrySchema` enumerates **FIFTEEN**. `stop`, `next`, `update-deferred` and
      `update-installed` could never be isolated by the filter even once written. **The schema is
      the one that is right** — it is what entries are parsed against.

## 4. Append sites wired

- [x] 4.1 `reconnect` — the pre-existing site, moved onto `#recordAudit`.
- [x] 4.2 `lock-engage` / `lock-release`, including BOTH refusal paths (`not-engaged`,
      `pin-mismatch`). The refused release is the entry most likely to be asked about later. ⚠ The
      PIN is never recorded, only that the lock was engaged or released.
- [x] 4.3 `failover`, recording which machine is primary AFTER the switch.

## 5. The remaining append sites and the panel's empty states

### 5a. The seven playout verbs — wired STRUCTURALLY

`load`, `take`, `update`, `out`, `stop` (`stopItem`), `remove`, `next` (`nextItem`).

**Why they were not wired in the first pass, kept here because it is the specification for how they
are wired now:** each is a multi-branch method with several refusal returns (`disconnected`,
`unknown-item`, `rehearsing`, layer refusals, the all-or-nothing plate refusal…), and an audit line
is only worth having if its `outcome` and `errorCode` are the ones the operation actually took.
Placing a single append at the end of each would record `ok` for paths that refused. That is worse
than no entry: a forensic record that misreports an on-air action is a record nobody can trust the
next day.

- [x] 5.1 **`#audited` — the wrapper each verb's PUBLIC method now consists of.** The real body is a
      private impl called exactly once, so every exit — including a **throw**, which records
      `internal-error` and re-throws untouched — passes through one place. The outcome is DERIVED
      from what the operation answered (`auditVerdict`), never from position. The same move as
      B-139: an API that cannot be called wrong beats a call site that happens to be correct today.
- [x] 5.2 **NINE entry points for eight actions.** `loadFixed` is audited at its OWN entry point,
      not in the shared `#loadOnto`: every refusal it owns (`unknown-template`, `not-fixed`,
      `slot-bound`) returns before `#loadOnto` is reached, so auditing the shared tail would have
      recorded nothing for any of them.
- [x] 5.3 **The PRE-STATE is what gets named.** `#itemDetail` reads item / template / slot BEFORE
      the impl runs, because `remove` deletes the slot and `out` empties the layer — read after,
      the record would name the layer the item is on now (none) instead of the one the operator
      acted on.
- [x] 5.4 **`ts` is stamped at the OUTCOME**, so file order is outcome order rather than invocation
      order. Two concurrent takes appear in the order they finished, which is the order air saw.
- [x] 5.5 🔴 **`remove` — the one verb whose response cannot carry its own outcome.** It answers
      `{ accepted: true }` unconditionally, which is right for the caller (the row leaves the stack
      either way) but wrong for the log: a CLEAR that did not land leaves a graphic ON AIR with its
      row gone from every browser. The failure is handed to the wrapper (`AuditDetail.wireFailure`)
      rather than to the response, so the SPA contract is untouched and the record still says what
      happened. The ONLY sanctioned use of that field.
- [x] 5.6 **Tests — the refusals are the point**, in
      `tools/caspar-bridge/tests/audit-append-sites.integration.test.ts` (12 tests). One accepted
      run per verb, then `unknown-item` (×5), `unknown-template`, `disconnected` (×5),
      `rehearsing`, `not-fixed`, `slot-bound`, the timeout, and `remove`'s failed CLEAR — each
      asserting EXACTLY ONE row with the right `errorCode`. Read back from the NDJSON on disk, not
      from the in-memory tail: an in-memory assertion would pass on a build whose writer never
      opened the file, which is the state B-141 found the product in.

### 5b. Two things this turned up, fixed here rather than filed

- [x] 5.7 🔴 **The `timeout` outcome was UNREACHABLE.** `#send`'s catch flattened every throw —
      `AmcpTimeoutError` included — into `amcp-send-failed`, whose operator sentence is "The command
      never reached CasparCG". A timeout means the command LEFT and nothing came back: a different
      machine to go and look at, and a different remedy. `amcp-timeout` is now its own code with
      its own sentence, and it is what makes `outcome: 'timeout'` real. Same class as `mute-failed`
      (DEBT.md §5) — a wrapper may add context, it may not replace the cause.
- [x] 5.8 **The audit file handle was never closed.** `AuditWriter` holds one open for its whole
      life and offers `close()`; nothing called it, so every runtime leaked a descriptor that node
      destroys at GC — a hard `ERR_INVALID_STATE` since node 22, and seven uncaught exceptions in
      an otherwise-green run of 5.6's suite. `CasparRuntime.stop()` now closes it, last and
      awaited.
- [x] 5.9 **Two refusals that returned without a code now carry one** — `out`'s slotless refusal
      (`unknown-item`, the code its five siblings already answered) and `#loadOnto`'s
      ownerless-producer bail (`item-removed`). Both reached the operator as "Not accepted." and
      would have reached the log as a bare failure, which reads as an AMCP problem and sends
      someone to the playout machine for something that happened here.

### 5c. Actions with NO operation in the bridge — do not invent them

- **`export`** — export happens in the Designer, not here. There is no bridge-side operation to
  record, and inventing one would put a line in the log for something this process never did.
- **`update-deferred` / `update-installed`** — application-update actions; the bridge has an
  `UpdateRequestChannel` stub but no install path. Same reasoning.

- [x] 5.10 ⚠ **`import` was the FIFTEENTH action, and this list had lost it** — it appeared
      neither in 5a's seven nor among the three above, so it read as accounted for while being
      accounted for nowhere. It HAS a bridge operation (`templateImport`), and it is now wired.
      **A REDELIVERY writes no row:** that is the SPA replaying its whole library after every
      reconnect (B-085) — a burst of entries, on a schedule nobody chose, for something nobody did.

### 5d. The panel's three empty states

- [x] 5.11 **`audit.health` over IPC** (`@cg/shared-ipc` → bridge route → `WebSocketRuntime` →
      `MockRuntime` parity), read BESIDE the tail on every refresh — a health reading from before
      the entries were fetched could report a writer that has failed since.
- [x] 5.12 **Four distinguished states**, not three: **no writer configured** · **the writer is
      failing** (its `lastError` and path) · **a filter that matches nothing** · **genuinely
      readable and genuinely empty**. _"No audit entries yet."_ appears ONLY in the last.
      **This is the positive-control rule applied to our own UI** — a negative observation ("no
      entries") is not a result until the instrument is proven live, and the panel was asserting a
      fact it could not know. Pinned by
      `apps/runtime/tests/auditPanel.emptyStates.dom.test.ts` (8 tests).
- [x] 5.13 The two fault states render through the shared `Notice` (`refusal` role, the palette's
      ATTENTION treatment) with `aria="status"` rather than its `alert` default: an alert is for
      the consequence of something the operator JUST DID, and this is a standing fact about the
      instrument. **No local style object** — that is precisely what `Notice`'s header forbids.
- [x] 5.14 Corrected `packages/audit/src/writer.ts`'s docstring, which promised the UNC fallback
      and a disk-full banner this change defers. All three deferrals (rotation, UNC, retention) are
      now stated there as deferrals.

⚠ `AuditPanel.tsx` was otherwise NOT touched — its raw `<select>` is [[B-142]] and belongs with
R-054.

### 5e. 🔴 STILL OPEN — `actor`, and it is an owner question

Every entry carries `actor: 'operator'`, a constant, because the control WebSocket is
unauthenticated loopback and carries no identity: nothing anywhere distinguishes two people driving
the same rundown. The record answers _what happened_ honestly and answers _who did it_ with a
placeholder — half of what a forensic log is for, and on a shared console the half a dispute turns
on.

It is a single `OPERATOR_ACTOR` constant rather than N literals so the day a scheme is decided there
is exactly one place that learns about it. **Making it meaningful needs a decision, not an
implementation** — the plausible shapes (a per-browser operator name in Settings, sent on each
request; a PIN-backed sign-in reusing the lock's PIN; a per-connection client id that identifies a
BROWSER rather than a person) differ in what they are worth in a dispute, and the last one is worth
almost nothing. Posed, not chosen.

## 6. Gate

- [x] 6.1 `pnpm openspec validate audit-writer-forensic-lite --strict`.
- [x] 6.2 `@cg/caspar-bridge` typecheck / lint / test green (68 files, 446 tests);
      `@cg/runtime` typecheck + 769 tests green.
- [x] 6.3 Full green gate — see the session's commit.
- [x] 6.4 PRD item `[~]` with this change dir.
- [x] 6.5 **Linux `e2e` DISCHARGED** — https://github.com/yasermostafaee/cg/actions/runs/32054398518, commit `56c0799f`, `conclusion: success`, and the **`E2E (Playwright)` job RAN** (`conclusion: success`, not skipped — P-029). Runtime **81 passed**, Designer **267 passed, 1 flaky**.
      `56c0799f` is the batch tip and a descendant of every commit in it, and the `e2e` job is
      whole-tree (`pnpm test:e2e`, no filter), so a green run there verifies the tree that carries
      this change.
      ⚠ The one flaky is `apps/designer/tests/e2e/video-import.spec.ts:291` — "a premultiplied-alpha
      source imports WITHOUT the black fringe (D-128 un-premultiply)" — which failed on its first
      attempt and passed on retry. It is unrelated to this change and is recorded as the SECOND
      occurrence under [[P-034]].

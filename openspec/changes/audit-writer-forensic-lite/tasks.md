# Tasks — B-141, wire the audit writer (forensic-lite)

> ⚠ **PARTIAL. The foundation is wired and green; the append sites and the panel's three empty
> states are NOT complete.** §5 lists exactly what is missing and why, rather than leaving it to be
> discovered.

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

## 5. 🔴 NOT DONE — the remaining append sites and the panel's empty states

### 5a. Actions with a real operation, not yet wired

`load`, `take`, `update`, `out`, `stop` (`stopItem`), `remove`, `next` (`nextItem`).

**Why they are not wired here rather than wired quickly:** each is a multi-branch method with
several refusal returns (`disconnected`, `unknown-item`, `rehearsing`, layer refusals, the
all-or-nothing plate refusal…), and an audit line is only worth having if its `outcome` and
`errorCode` are the ones the operation actually took. Placing a single append at the end of each
would record `ok` for paths that refused. That is worse than no entry: a forensic record that
misreports an on-air action is a record nobody can trust the next day.

- [ ] 5.1 Wire each at its real outcome points, with `itemId` / `templateId` / `slot` populated.
- [ ] 5.2 A test per action asserting BOTH an accepted and a refused run produce the right row.

### 5b. Actions with NO operation in the bridge — do not invent them

- **`export`** — export happens in the Designer, not here. There is no bridge-side operation to
  record, and inventing one would put a line in the log for something this process never did.
- **`update-deferred` / `update-installed`** — application-update actions; the bridge has an
  `UpdateRequestChannel` stub but no install path. Same reasoning.

These are named rather than silently skipped, per the brief.

### 5c. The panel's three empty states

- [ ] 5.3 Surface `auditHealth()` over IPC and render three distinguished states: **no writer
      configured** · **the writer is failing** (its `lastError` / error count) · **genuinely
      readable and genuinely empty**. _"No audit entries yet."_ appears ONLY in the third.
      **This is the positive-control rule applied to our own UI** — a negative observation ("no
      entries") is not a result until the instrument is proven live, and today the panel asserts a
      fact it cannot know.
- [ ] 5.4 Correct `packages/audit/src/writer.ts`'s docstring where it still promises the UNC
      fallback and the disk-full banner, which this change defers.

⚠ `AuditPanel.tsx` was otherwise NOT touched — its raw `<select>` is [[B-142]] and belongs with
R-054.

## 6. Gate

- [x] 6.1 `pnpm openspec validate audit-writer-forensic-lite --strict`.
- [x] 6.2 `@cg/caspar-bridge` typecheck / lint / test green (67 files, 434 tests);
      `@cg/runtime` typecheck + 759 tests green.
- [ ] 6.3 Full green gate — at the end of the session.
- [x] 6.4 PRD item `[~]` with this change dir.
- [x] 6.5 **Linux `e2e` DISCHARGED** — https://github.com/yasermostafaee/cg/actions/runs/32054398518, commit `56c0799f`, `conclusion: success`, and the **`E2E (Playwright)` job RAN** (`conclusion: success`, not skipped — P-029). Runtime **81 passed**, Designer **267 passed, 1 flaky**.
      `56c0799f` is the batch tip and a descendant of every commit in it, and the `e2e` job is
      whole-tree (`pnpm test:e2e`, no filter), so a green run there verifies the tree that carries
      this change.
      ⚠ The one flaky is `apps/designer/tests/e2e/video-import.spec.ts:291` — "a premultiplied-alpha
      source imports WITHOUT the black fringe (D-128 un-premultiply)" — which failed on its first
      attempt and passed on retry. It is unrelated to this change and is recorded as the SECOND
      occurrence under [[P-034]].

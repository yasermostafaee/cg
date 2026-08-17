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
- 🔴 **A failed audit write can never take the station off air.** Fire-and-forget appends; the writer
  reports and keeps trying. The contrast with the config stores is deliberate: those are
  preconditions for correct playout, an audit entry is a record of what happened.

## Scope, decided

**Forensic-lite.** The record goes on disk and survives a restart. **File rotation, the UNC fallback
and any retention policy are DEFERRED** and are not built here.

## 🔴 Status: PARTIAL

The foundation is wired and green. **Seven append sites and the panel's three empty states are
not.** `tasks.md` §5 says which, and why each was left rather than done quickly — in short, an audit
line is only worth having if its outcome is the one the operation actually took, and the remaining
methods are multi-branch. Two schema actions (`export`, `update-deferred` / `update-installed`) have
**no operation in this process** and are named as unwireable rather than invented.

## Impact

| Area                  | Effect                                                              |
| --------------------- | ------------------------------------------------------------------- |
| `tools/caspar-bridge` | the flag, the writer, `#recordAudit`, `auditHealth`, 3 append sites |
| `@cg/audit`           | goes from dead code to the source of truth                          |
| `apps/runtime`        | the filter list is derived from the schema (no other panel change)  |

Capability: `runtime-ui` (ADDED — the audit record and its three empty states).

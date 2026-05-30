# Bugs — backlog

Bug reports. Unlike features, every bug needs a **repro** — that's what lets
Claude reproduce, fix, and add a regression test. See `README.md` for IDs and
statuses.

## Bug format

Copy this block per bug (use `B-` IDs):

```md
## [ ] B-001 — Short title   ⟨priority: high⟩
**Repro:**
1. Step …
2. Step …
**Expected:** What should happen.
**Actual:** What happens instead (error text / screenshot path if any).
**Env:** Browser + app (e.g. Chrome / Designer dev) — and whether it reproduces
in the latest `main`.
**Notes:** Suspected file/area if known.
```

Claude's loop for a bug (per `README.md` processing contract): reproduce →
diagnose → fix → **add a regression test** that fails before and passes after →
green gate → commit. Track it as an OpenSpec change only if the fix changes
spec-level behavior; otherwise a focused fix + test is enough (note that in the
proposal/commit).

---

<!-- No open bugs yet. Add them above this line using the format. Example:

## [ ] B-001 — Export blocked dialog shows wrong error count
**Repro:**
1. Open a scene with 2 unbound required fields
2. Click Export
**Expected:** "Export blocked: 2 validation errors"
**Actual:** Shows "1 error"
**Env:** Chrome / Designer dev, reproduces on main
**Notes:** apps/designer/src/renderer/features/status/StatusBar.tsx

-->

# Tasks — set the template serve address in the app

## 1. The contract

- [x] 1.1 `ConnectionConfigSchema` gains `templateServeHost?: string` and
      `templateServePort?: number` (0–65535). 🔴 `templateServeHost` is
      `z.string().optional()` — NOT `.min(1)` — so an EMPTY STRING is a legal stored value that
      round-trips. Rejecting it at the schema would make the panel unable to CLEAR the field, and
      folding it to `undefined` at the edge is the confusion `1d` forbids.
- [x] 1.2 `TemplateServeInfoSchema` gains `flagOverrides` (which fields a CLI flag is forcing, and
      to what) and `candidates` (this machine's non-internal IPv4 addresses). Both optional, so the
      browser mock stays valid.
- [x] 1.3 New read channel `connections.template-serve` → `TemplateServeInfo`, so the panel can
      show the masking and the candidates ON OPEN rather than only after an Apply.

## 2. The bridge

- [x] 2.1 New module `tools/caspar-bridge/src/serve-host-config.ts` — the ONE normalizer
      (`normalizeServeHost` / `normalizeServePort`: trim, empty → undefined), the ONE precedence
      merge (`resolveServeOverride`: flags last, so flags win), and `detectServeHostCandidates()`.
      ⚠ A NEW module rather than an addition to `template-http-server.ts`, which is in
      `.claude/never-stage` and must not be edited from this checkout.
- [x] 2.2 `CasparRuntime` keeps the FLAG override separately from the config-derived one and merges
      them at every derivation point (construction and `#applyConfig`), flags last. One merge
      helper, called from both — two spellings of a precedence rule is how one comes to disagree.
- [x] 2.3 `CasparRuntime` exposes `templateServeInfo()` carrying the address in force, `unreachable`,
      `flagOverrides` and `candidates`.
- [x] 2.4 `bridge.ts` routes `connections.template-serve`.
- [x] 2.5 `bin/caspar-bridge.mjs` — the boot provenance line names the CONFIG FILE layer, so the
      three layers are readable from the terminal. ⚠ Changing that string obliges the tree-wide
      `git grep` of golden rule 9 BEFORE the commit.

## 3. The panel

- [x] 3.1 The serve host + port land BESIDE the server hosts, not in their own section — they are a
      fact about how those servers reach this machine.
- [x] 3.2 The masking surface: flag named, effective value shown, stored value struck through and
      labelled _not in force_. 🔴 NOT greyed and NOT disabled.
- [x] 3.3 Candidates offered as buttons beside the field, with a sentence stating they are
      candidates and not a verdict.
- [x] 3.4 Apply's success/refusal messages carry `unreachable` (already returned) and stay within
      `B-163`'s limit: a configuration warning is not a measurement of a fetch.
- [x] 3.5 `MockRuntime` parity for the new channel.

## 4. Tests — RED first, chain rebuilt before each reading

- [x] 4.1 A stored serve host survives a bridge restart and reaches the `CG ADD` URL.
- [x] 4.2 A flag overrides the stored value, and the reported `flagOverrides` names the flag rather
      than the stored value.
- [x] 4.3 Empty stored value ⇒ derived; empty and absent produce a BYTE-IDENTICAL result.
- [x] 4.4 Apply with a loopback address while a remote server is configured ⇒ the response's
      `unreachable` names that server, and the panel renders its name.
- [x] 4.5 The port field: empty ⇒ ephemeral; pinned ⇒ that port appears in the served URL.
- [x] 4.6 Panel DOM: the masked field shows the flag's value, strikes the stored one, and the input
      is NOT disabled.
- [x] 4.7 E2E covering the panel's scenarios —
      `apps/runtime/tests/e2e/server-settings.spec.ts`, second test. Discharged by the Linux run in
      5.2 below.

## 5. Records

- [x] 5.1 `C-024` updated — this is its remaining half; state whether the `.claude/never-stage`
      entry can be dropped.
- [x] 5.2 ✅ **Linux `e2e` DISCHARGED** —
      <https://github.com/yasermostafaee/cg/actions/runs/32713285569> — head `2c009507`, the commit
      that carries the change, `completed` + `success`, with the **`E2E (Playwright)` job RUN, not
      skipped** (checked in the run's job list, not inferred from the run's own conclusion). The
      local Windows `gate:e2e` was green too (93 passed) and is noted only as a local signal: it is
      non-authoritative by the very rule that owes this debt, and never discharges it.
- [x] 5.3 ✅ **The `.claude/never-stage` entry WAS dropped — 2026-09-04, `LAN-DEV-ACCESS-01`.**
      The uncommitted edit turned out to be ONE line, the pin already commented out by the owner
      (`// return '192.168.21.93';`); it was deleted, the never-stage entry dropped, and
      `templateServeUnreachableWarning`'s flag-only sentence completed to name the panel — all in
      ONE commit, per `C-024`'s "never before" rule. Task 2.1's "must not be edited from this
      checkout" no longer applies; the module split it produced stays because it is the right seam.

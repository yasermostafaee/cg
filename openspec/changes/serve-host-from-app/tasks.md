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
- [~] 4.7 E2E covering the panel's scenarios. **WRITTEN** —
  `apps/runtime/tests/e2e/server-settings.spec.ts`, second test. Green on Windows locally, which
  is NOT a discharge (a Windows run is non-authoritative by the rule that owes the debt).

## 5. Records

- [x] 5.1 `C-024` updated — this is its remaining half; state whether the `.claude/never-stage`
      entry can be dropped.
- [ ] 5.2 Linux `e2e` run URL written beside 4.7 when it completes green. A ticked box with no URL
      is a claim, not a discharge. 🔴 **STILL OWED** — this change alters UI and rendering, so the
      debt is real; it discharges only on a COMPLETED, GREEN `e2e` job for the commit that carries
      it, cited by run URL.

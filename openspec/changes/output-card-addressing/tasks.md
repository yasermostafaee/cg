# Tasks — the output card's addressing (C-030)

## 0. Premises (session `CARD-ADDRESSING-01`, 2026-09-04, tip `89811577`)

- [x] 0.1 Tip `89811577` == `origin/dev`; `pnpm install` up to date.
- [x] 0.2 §0 re-checked, not re-litigated: the plant's `INFO CONFIG` still echoes
      `<device>23487013</device>`, its channel 1 runs only `system-audio` + `screen`; the bridge sends
      no discovery command. Config untouched; CasparCG on the plant untouched.
- [x] 0.3 The dev host cannot produce a real enumeration line (0 lines in 15 logs; 14 × "Decklink
      drivers not found."). The line shape is quoted from source and matched against the plant's
      observed 2026-08-25 line.

## 1. The recipe (the deliverable that stands alone)

- [x] 1.1 The literal print, from `decklink.cpp` `init` + `device_list`: `Decklink devices found:`
      then ` - <model> [n] (id)` per card, printed only when a card was found. `[n]` = slot index,
      `(id)` = `BMDDeckLinkPersistentID`.
- [x] 1.2 Three lines in the operator guide: the file, the one PowerShell line (window named), what
      to copy — and that no line means no card or no driver.

## 2. The addressing question

- [x] 2.1 Source quoted (`config.h:34`, `config.cpp:39,134-135`, `util.h:222-245`): both forms
      through one `int64_t`, slot ordinal matched first, persistent ID second, no threshold. 🔴 Said
      loudly: CasparCG does not distinguish the forms.
- [x] 2.2 The bridge passes the value through untouched at both emit sites
      (`command-builder.ts:460`, `output-check.ts` `missingConsumerAddCommand`).
- [x] 2.3 Wire on the dev host, bracketed by identical `INFO 1`: `ADD 1 DECKLINK 1` and
      `ADD 1 DECKLINK 23487013` both `403` in 2–3 ms — the driver fails before any comparison, so
      this host cannot separate the forms. The plant measurement would be an intervention (its card
      IS slot 1) and was declined; the exact console lines are prepared in `design.md` §2.
- [x] 2.4 The prediction held in substance (both forms, one field) and failed in one word: CasparCG
      never decides which form it was handed.

## 3. The recommendation (not a decision)

- [x] 3.1 Failure under each scheme stated; the safer failure in general is the ID's (fail-closed,
      loud); for THIS one-card plant it is the index's (no different card to substitute; an empty
      slot still fails closed with the banner). Recommendation: `<device>1</device>`, revert to the
      persistent ID the day a second card is fitted.
- [x] 3.2 Both one-line edits prepared, with the file, the editor-not-console rule, and the restart.
      Not applied — the owner's action.

## 4. The alarm names the form — red-first

- [x] 4.1 `@cg/shared-ipc`: `describeDeviceAddressing`, `DEVICE_ADDRESSING_RULE`,
      `DEVICE_NUMBER_RECIPE` beside the `C-029` parsers.
- [x] 4.2 `OutputMissingBanner`: one line per missing device (form + counter-example + rule) and the
      recipe line. `describeMissingOutput`: the same two facts on stderr.
- [x] 4.3 🔴 Red first, measured (⚠ the banner test named here was FOLDED into
      `apps/runtime/tests/outputsSection.dom.test.ts` by `B-223` on 2026-09-05 — the words moved to
      the technical surface, every assertion kept): `device-addressing.test.ts` 5/5 red, `outputMissingBanner.addressing.dom.test.ts`
      4/5 red (the health-boundary case green by construction), `output-addressing.test.ts` 3/3 red —
      then 25/25, 17/17, 12/12 green after the words were added.
- [x] 4.4 Nothing widened: the health-boundary assertion (`not.toMatch(/reference signal|dropping
frames|unhappy/)`) stays green; the operator guide's "What the check cannot see" paragraph is
      unchanged.

## 5. Docs and filing

- [x] 5.1 `docs/prd/caspar.md` — `C-030` filed `[~]` with the recommendation marked pending the owner.
- [x] 5.2 `docs/prd/b-number-registry.md` — the session entry; `C-030` derived from headings
      (highest `C-029`), pointer agrees; no `B-` taken.
- [x] 5.3 `docs/operator-guide/README.md` — the recipe, how CasparCG reads the number, the trade-off.

## 6. Gate and evidence

- [x] 6.1 `pnpm gate` green uncached — `Tasks: 93 successful, 93 total · Cached: 0 cached, 93 total ·
Time: 2m59.8s`, openspec `73 passed, 0 failed`; green again in the pre-push hook.
- [x] 6.2 Linux `gate:e2e` — **DISCHARGED** for `ca3cc1e6` (the docs commit on top of `a9f507eb` /
      `f04f4f59` / `eb264cbf`, the commits carrying this change):
      <https://github.com/yasermostafaee/cg/actions/runs/33826394983> — run conclusion `success`;
      job `E2E (Playwright)` **RAN** (not skipped), started `2026-09-04T01:36:24Z`, completed
      `2026-09-04T01:47:44Z`, **11m20s**, conclusion **`success`**
      (<https://github.com/yasermostafaee/cg/actions/runs/33826394983/job/100879891581>); the
      `Lint • Typecheck • Test • Build` job also ran, 6m43s, `success`.
- [x] 6.3 The plant left as found (read only). The dev host's 2.5.0 was STARTED for §2c and STOPPED;
      its config untouched (`casparcg.config` 2877 bytes, 2026-08-24 15:48).

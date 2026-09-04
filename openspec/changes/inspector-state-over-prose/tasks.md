# Tasks — `DESIGNER-FIX-0905`

## 1. §1 Truth first — the retired hole

- [x] 1.1 Enumerate every Designer string describing the retired mechanism. `D-158`'s six
      (`ArrangementsSection.tsx` ×5 — compiled but UNREACHABLE, `InspectorPanel` does not mount
      it, and the transition modes are implemented nowhere — and `StyleSection.tsx` ×2, the two
      the owner photographed). ADDITIONAL: `live-source-preflight.ts` — the stamped-scope
      refusal ("declares no hole … punches none"), the animated refusal ("a moving hole"), the
      three overlap refusals ("overlapping holes").
- [x] 1.2 Rewrite each against `single-clock-look-switch`: the page below the plates, the picture
      drawn into the plate's rect, the frame painted just outside it. Relocated and corrected,
      not deleted — the mechanism now lives behind the Live Source `i` (`LivePlateTip`).
- [x] 1.3 Verdict on "still accurate": the move-easing hint (_"drifts the picture off its
      hole"_) was accurate in substance (the CSS box and the CasparCG tween must share a curve)
      with the wrong noun — corrected to "away from its frame and title". None described a hole
      the Designer still composes with: the Designer never composed with one; the mask was the
      runtime's.
- [x] 1.4 The refusal no longer repeats the kind as a name: `plateRef` (`DEFAULT_LIVE_SOURCE_NAME`
      exported from `element-defaults.ts`).

## 2. §2 State over prose — Live Source and Frame

- [x] 2.1 `withheldReason` in `field-registry.ts`, beside `LIVE_SOURCE_STATIC`.
- [x] 2.2 Rotation / opacity rendered WITHHELD (disabled, reason as tooltip, row dimmed) in
      `TransformSection`; `fieldScrub` refuses a disabled input.
- [x] 2.3 `CollapseSection` `withheld` — the Filter section as a withheld header.
- [x] 2.4 Frame colour withheld at width 0, value kept; the sentence under the fields deleted.
- [x] 2.5 `InfoTip` + `StateLine`, `prose.css.ts` (§4's legible default).
- [x] 2.6 Tests: `live-source-inspector.dom.test.ts` (withheld rows, the withheld header, the `i`
      content, the frame at 0), `e2e/live-source.spec.ts` updated to the same.

## 3. §2 State over prose — Playout, Video, Sequence, Repeater, Looks, cards

- [x] 3.1 Playout: `HoldLoopCaption` → `HoldLoopRow` (`active` / `inert` / `empty`), short
      remedy inline, the three-loops teaching behind the `i`; a degenerate range reads `empty`.
      `Pin content start` stays enabled (design §1). The static caption → a state line + `i`.
- [x] 3.2 Video: provenance → four labelled rows; `FollowNoAnchors` → a state line with the
      remedy inline and the mechanism behind the `i`; `drives hold` withheld with no out point;
      "No phase marks" → the state inline, the consequences behind the `i`.
- [x] 3.3 Sequence: the sentence duplicating the per-item data-key placeholder deleted; the
      composition-item teaching behind the Items section's `i`; the three "Time-driven" captions
      (ticker, clock, sequence) → one state line each and one shared `i` (`TimeDrivenTip`).
- [x] 3.4 Repeater: `max items` 0 reads `unlimited` on the field; the stamping mechanism behind
      the `i`.
- [x] 3.5 Looks: the summary and the two hints behind the section's `i` (`LooksTip`); the empty
      states one line each; the refusal block a step ABOVE the inline default (0.8rem heading,
      0.76rem rows) where it was a step below.
- [x] 3.6 Home cards: `StarterEntry.playout` derived by `describePlayout`
      (`@cg/starter-templates`); `playoutBadge` in `features/shell`; descriptions one line each.
- [x] 3.7 §4: `dds.hint`, `cls.caption`, the Looks / Arrangements `hint` / `empty` / `summary`
      re-pointed at `prose.css.ts`'s default; `lt.muted` and the callout bodies raised.
- [x] 3.8 Tests: `loop-range-authoring.dom.test.ts` (the tag, the `empty` case, the `i`),
      `describe-playout.test.ts`, `playout-badge.test.ts`, `e2e/starter-landing.spec.ts` (the
      badges); `video-inspector.test.ts` / `follow-phase-source.dom.test.ts` / `e2e/loop-range`
      / `e2e/clock|ticker|sequence` green unchanged (their test ids and phrases were kept).

## 4. §3 The sweep

- [x] 4.1 Every explanatory prose block enumerated and classified — recorded under `D-159` in
      `docs/prd/designer.md`: 61 reachable blocks (Inspector 33, Playout 7, Looks 6, home cards
      5, Preview / fields 5, left-rail panels 5) plus 22 in the unreachable Arrangements section
      — against the 35–60 prediction, the reachable count lands at its upper edge and the
      unreachable section is what carries it past.

## 5. §5 The orphan composition

- [x] 5.1 ESTABLISHED by test before fixing (`looks-orphan.test.ts`, first version, run against
      `e02215c5`): case 1 — a SECOND empty `look-1`; not a reuse (2), not an adoption (3).
- [x] 5.2 The namer avoids existing composition names and ids (`look-4`, never a second `look-1`).
- [x] 5.3 `addLookFromComposition`, `detachedLookCompositions`, `registerLook` (the one path);
      the Looks panel's **Make it a look** rows; the notice on remove.
- [x] 5.4 Tests: `looks-orphan.test.ts` (8 store pins), `looks-orphan.dom.test.ts` (the panel),
      `e2e/look-orphan.spec.ts` (the walk).

## 6. Filing and gate

- [x] 6.1 `B-219` (the orphan), `B-220` (the retired-hole strings, additional to `D-158`),
      `D-159` (state over prose) filed; registry entry; numbers derived from headings and
      cross-checked against the dated pointer — they AGREE this time (`B-219`, `D-159`).
- [x] 6.2 Full green gate — `pnpm gate`, `93 successful, 93 total`, `0 cached` (2026-09-05). ⚠ The
      FIRST run was red on `@cg/single-file-export#typecheck` with an `EPERM: rename` of the
      generated `cg-runtime-bundles.ts` — `prebuild`, `pretypecheck` and `pretest` each run the
      same generator and two of them renamed onto one file at once; filed as `P-042`, not fixed
      here (platform tooling, outside the Designer boundary). The rerun was green.
- [x] 6.3 Linux `gate:e2e` DISCHARGED for `c305f9ad` (the `dev` tip that carries `cc13abca`,
      `c0c9eab6`, `158022fd`, `ff66b210` and itself):
      **https://github.com/yasermostafaee/cg/actions/runs/33921378832** — run conclusion
      `success`; `E2E (Playwright)` job conclusion `success`, its `E2E` step RAN (`success`, not
      skipped), 621 s; `Lint • Typecheck • Test • Build` `success`, its `Test` step RAN, 369 s.
      Recorded 2026-09-05.
      ⚠ The FIRST run (`ff66b210`, https://github.com/yasermostafaee/cg/actions/runs/33919147452)
      was RED and discharged nothing: `E2E (Playwright)` ran (883 s) and failed five specs, all
      this change's own — `duration-guard.spec.ts` asserting `/following nothing yet/i` (the
      state line had dropped the "yet"; the pre-push sweep was case-SENSITIVE and missed the
      lowercase regex), and the four Live Source frame specs whose `setFrame` helper filled the
      hex colour before the width (withheld at 0 now). Fixed in `c305f9ad`. Its `ci` job was
      red on `@cg/caspar-bridge`'s `owned-slot-occupancy` integration test — a `waitFor`
      timeout, the B-073 flake family, untouched here. 274 other specs passed on Linux.
      ⚠ Windows-LOCAL observation, not filed: `live-source.spec.ts` "MULTIPLE independent Live
      Sources" (and once the `1.5g` frame-overlap spec) lose a `fill` on this host — the typed
      value never reaches the store when the fill follows a selection or edit closely — 2 of 3
      runs alone at one worker, NOT reproduced under instrumentation (event log, focus log,
      added pacing: 4/4 green), unchanged by reverting this change's Transform rendering (3/3
      red) or the coordinate-bearing refusal (1/3 red), and GREEN on Linux in run 33919147452.
      Non-authoritative host; recorded so the next local red is read as this and not as a
      product regression.

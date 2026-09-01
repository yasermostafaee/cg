# Tasks — the single-clock look switch

## 1. SPEC — the amendments, quoted (landed 2026-09-01)

- [x] 1.1 **`C-015` — "a dedicated layer BELOW the template's layer" INVERTS for a plate-bearing
      package.** The acceptance sentence today reads _"the bridge allocates a dedicated layer below
      the template's layer, plays the mapped producer there, and applies MIXER FILL derived from the
      Live Source's scene-px geometry"_, and `design.md §4` states the constraint as _"Templates sit
      on 70–99; C-015 needs sources BELOW the template's layer."_
      **The new rule:** a template that declares live plates is placed on a SECOND DECLARED BANK,
      **layers 1–9**, BELOW every live-source layer; a template that declares none keeps the operator
      bank at 70–99, above them. The live band itself does not move.
      **Why 1–9:** they are free — `DEFAULT_LAYER_POLICY` spans 10–69, the bank is 70–99, playout owns
      60–69, and the suggested Live Source band starts at 10 — and they are below every live band a
      station can declare, because `LiveSourceLayerRangeSchema` is validated disjoint from the bank
      and the reserved range. Layer 0 is excluded: it is legal but reads as "unset" in too many
      places to spend the ambiguity on one slot.
- [x] 1.2 **`design.md §9a` — "painting nothing is not the same as ERASING" no longer costs
      anything.** The punch exists because _"The whole HTML page is ONE CasparCG layer, sitting above
      the Live Source layers … painting nothing is not the same as ERASING what is beneath it in the
      same page."_ **That sentence is still true and stops applying**: with the plate-bearing page
      BELOW the plates there is nothing above the live layer to erase. The argument is not refuted —
      its premise is removed. What made removing it affordable is `B-195`: across the client's twelve
      packages and the repo's nine, **no element draws over a live picture**, so nothing on that page
      needed to survive above a plate.
- [x] 1.3 **`design.md §9a-Z` (`:2628`) — RE-SCOPED, with the flip-back shape recorded verbatim.**
      The 2026-08-15 ruling stands as written — _"Name supers over a live guest are ordinary
      broadcast, not an edge case"_ — and is satisfied by SEPARATE ROWS rather than by elements inside
      a plate-bearing template; `B-195` found zero CLASS 1 elements in either population.
      🔴 **The flip-back shape, verbatim from `B-195`:** _"A name super **positioned under a
      particular guest BOX** is CLASS 1: its geometry follows the box, so it must move on the frame
      the fills move. Nothing in the client's set does that today … but it is the obvious next thing
      to author for a multibox layout."_ **Authoring guidance follows from the audit rather than from
      taste: a super that must sit under a box re-imposes frame alignment; a super at a fixed place
      on its own row never does.**
- [x] 1.4 **`design.md §9b.5` — its 2026-08 rejection, and whether the reorder is that shape.**
      Quoted: _"**two artifacts to coordinate instead of one.** The backdrop's geometry and the holes'
      geometry would live in two places that can drift, and the export would have to emit a backdrop
      artifact CasparCG can play — which `proposal.md` currently rules out."_
      **The objection does NOT transfer, on both halves.** (i) There are no holes to drift against —
      the mask is retired, so the only geometry is the plate rects, computed once by
      `collectLiveSources` and consumed once by `MIXER FILL`/`CLIP`. §9b.5's two geometries become
      one. (ii) The export emits no new artifact: the backdrop stays INSIDE the template's own page,
      which is simply placed lower. `.vcg` is unchanged.
      ⚠ **And the objection IS honoured where it does apply** — it is exactly why `design.md §1`
      rejects the "item's slot ≠ its row" shape, which would put one layer coordinate in two places.
- [x] 1.5 `openspec validate --all --strict` clean.

## 2. THE REORDER — NOT STARTED (next session)

- [ ] 2.1 A second declared bank, low, defaulting to 1–9: schema, validation disjoint from the
      existing bank, the live band and the reserved range, and the boot read-back.
- [ ] 2.2 Classification at import, derived from whether the package declares plates. No operator
      choice, no flag.
- [ ] 2.3 Refusal by name on the wrong bank, both directions.
- [ ] 2.4 Restore: MIGRATE a retained plate-bearing item to a low slot and report it; refuse with a
      reason only when none is free.
- [ ] 2.5 `B-039`'s pre-roll `CG ADD` (`caspar-runtime.ts:2008-2011`), the union pre-seat, the take
      path, `setActiveLook`, `#tellPageLook`, `#recordActiveLook`, the level-2 freeze and
      `reconcileLivePlates` all keep working — the page is still told the look, it just no longer has
      to land on any particular frame.
- [ ] 2.6 `C-028` re-proved with a pixel probe on the real template, not inherited from `B-194` §3.

## 3. RETIRE THE MASK — NOT STARTED, and it lands WITH section 2

🔴 **It must not land alone.** A maskless page under plates that are still BELOW it puts black on air
for every plate.

- [ ] 3.1 Remove `liveSourceMask` and `MaskHole[]` (`scene.ts`), `sceneMaskHoles` and
      `intersectPunches` and `ArrangementView.transitionFrom` (`scene-flatten.ts`),
      `live-source-punch.ts` entire, `scene-builder`'s build-time punch and `punchTargets`,
      `runtime.ts`'s re-punch.
- [ ] 3.2 Remove the intersection-mask work shipped at `a7656b05`: `CgControl.from`, the narrow /
      settle pair in `setActiveLook`, `--look-transition-lead-ms`, `--look-transition-tail-ms` and
      `--no-look-transition-mask`. ⚠ `CgControl.look` SURVIVES — the page still flips its own
      decoration. `CgControl.plates` goes with the mask, since the fit is applied by the bridge.
- [ ] 3.3 Name any second consumer found and keep only that.
- [ ] 3.4 Prove the export format is unchanged by round-tripping one package.

## 4. PROVE ZERO — NOT STARTED. This decides whether the change ships.

- [ ] 4.1 Same file-consumer harness that produced the 20 / 30 / 60 ms numbers. No new probe.
- [ ] 4.2 `1↔2`, `1↔3`, `1→2→3`, `3→2→1`; ≥10 recordings each; per recording report BLACK frames,
      HOLE-misalignment frames and DROPPED frames.
- [ ] 4.3 **Acceptance: zero black and zero hole-misalignment in EVERY recording.** Any non-zero
      recording STOPS the change and is reported as a failure. An improvement is not a fix.
- [ ] 4.4 Reported separately, NOT folded into the acceptance: per-look decoration skew on the
      plate-bearing page. `B-195`'s audit found `3ghab`'s decoration is one shared ROOT image below
      all three looks, so it should be zero for the real template — verify from the audit data, and
      give a measured frame count for any per-look-decoration case found anywhere.
- [ ] 4.5 State that term (b), producer start latency (`B-192`), survives untouched, with its current
      measured value (**+2 … +4 fields, 40–80 ms**), so the owner is not told a residual he can still
      see was fixed.

## 5. `B-196` — WIRE `minRuntimeVersion` (landed 2026-09-01)

- [x] 5.1 `CG_RUNTIME_VERSION` + `parseSemver` / `compareSemver` / `runtimeShortfall` /
      `runtimeShortfallMessage` in `@cg/shared-schema`'s `runtime-version.ts`, with the direction and
      the fail-open decision argued in the header.
- [x] 5.2 The exporter writes the real contract version instead of the literal `'0.0.0'`.
- [x] 5.3 The Runtime app compares at import, before the render, and refuses with one sentence naming
      the package and BOTH versions.
- [x] 5.4 Tests, RED-FIRST: neutering the comparison reddens the two guard tests.

## 6. Border-radius — written answer (landed 2026-09-01)

- [x] 6.1 Filed as `B-197`. Under the reorder a rounded plate has nothing above it to hide its square
      corners, so the home §9a.1 recorded ("the CSS hole rounds") disappears with the punch. The only
      home that does not re-impose frame alignment is producer-side, via a keyer layer — unmeasured.
      The overlay-row alternative is CLASS 1 by construction and must not be used.

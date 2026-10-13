# Session BA — LOOKS phase 1: the adoption recorded; schema, carrier and runtime switch built

**Read at `5659ca5e`** — `HEAD == origin/dev`, exactly the prompt's expected tip. Delta from
`c8d9c07b`: one commit, the flake-family-3 test fix. Working tree clean except the owner's known
`template-http-server.ts` advertise-host hack — untouched, unstaged.

**Build links rebuilt, in order:** `@cg/shared-schema` → `@cg/template-runtime` →
`@cg/single-file-export` → `@cg/designer`.

**Five commits, one per phase plus one ripple-chase:**

| Commit     | Phase                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `0e7278b3` | **A** — §14 marked ADOPTED; halt lifted; `tasks.md` §1b (phases + P2.DEL); R-057/D-152 re-keyed; 6-box + C-023 lines |
| `17a55dc4` | **B** — `looks.ts` (the group schema), the refusal family, D4 parked with reason                                     |
| `0eeb8689` | **C** — the source-keyed carrier: deduped `sources[]`, per-look `{routeKey → rect}`                                  |
| `b7b0dfe1` | **D** — `setActiveLook` (visibility flip + re-punch), the pin test, the 6-box fixture                                |
| `0836d1e8` | the ripple `editSceneOf` was about to drop: `lookGroups` now rides the projection the export path reads              |

## 1. What exists now — and what still runs on A′

- **Schema** (`packages/shared-schema/src/looks.ts`): sources declared ONCE (`{routeKey,
expectedAspect, dynamic}`), looks referencing real composition INSTANCES by element id, cut-only
  `entered`, `defaultLookId` required once a look exists. Illegal states unparseable: duplicate
  source, duplicate look id, one instance in two looks, dangling default.
- **Preflights** (one family, per-look VISIBLE SET = the look's plates + every root-level plate):
  `look-source-undeclared` (names the source and the declared list), `look-source-duplicate` (the
  message teaches that ACROSS looks it is the identity mechanism), the visible-set overlap pass
  (cross-boundary pairs only — the per-document loop already covers the rest), `look-second-group`
  (v1). The stamped-scope refusal was CONFIRMED to reach inside a look, pinned.
- **Carrier**: with a group, `TemplateInfo.liveSources` is SOURCE-KEYED — one declaration per
  declared source, `expectedAspect`/`dynamic` from the declaration, per-look rect maps, NO
  zero-area entries ever (the bridge refuses them), the empty look `{}`-valid. Absent-vs-empty
  contract matches the arrangements field.
- **Runtime**: `createRuntime` enters the DEFAULT look synchronously with the build;
  `setActiveLook(lookId): boolean` flips instance visibility and re-punches — no geometry
  machinery. `activeLookId()` is the readout.
- ⚠ **The Designer still runs on A′** — the arrangements UI (C2/AX/AY) is untouched and the owner
  can keep authoring. Coexistence is ONE session wide by plan: `tasks.md` §1b's **P2.DEL** task
  deletes the whole A′ column in the same session that lands the looks UI.

## 2. What phase 2 needs from this session's API — precisely

1. **Author side**: write `Composition.lookGroups` (`LookGroupSchema`; the projection to the
   working `Scene` is wired and pinned). Create each look as a composition instance at ROOT level
   (a direct child of a scene layer — the v1 constraint is documented at the schema), register it
   in the group with `instanceId`, set `defaultLookId` on first look.
2. **Preview side**: post `{ action: 'look', lookId }` on the existing preview `postMessage`
   channel — retained and re-asserted across rebuilds exactly like `'arrangement'`. 🔴 **Phase 2's
   UI is this seam's FIRST production caller; in phase 1 it is exercised by tests only** (said in
   `types.ts` and at the handler, so nobody takes it for dead).
3. **Surfacing refusals**: the four codes above arrive through the ordinary `liveSourceIssues`
   path — no new plumbing.
4. **The deletion**: run `tasks.md` §1b P2.DEL in the SAME session — §14.4's DIES table is the
   checklist (~15 production surfaces, ~88 test cases).

## 3. What to check — nothing visual this session

- **The pin test AZ found missing**: `packages/vcg-format/tests/hidden-look-suppression.test.ts` —
  a plate inside a HIDDEN composition instance stops punching AND stays declared, at a
  moved-and-resized instance so a broken ancestor chain cannot hide.
- **The 6-box fixture**: `packages/template-runtime/tests/looks-switch.test.ts` — six declared
  always (carrier side: `look-carrier.test.ts`), only the active look punches, six→solo flips
  visibility and moves NO geometry, solo-and-back restores **byte-identically**.
- ⚠ A finding the fixture surfaced, kept as a documented behaviour rather than "fixed": the ACTIVE
  look's plate legitimately punches INTO the hidden plates below it in z-order (suppression
  governs the PUNCHER, never the punched); the masks are transient and the round trip clears them.

## 4. Report lines the prompt asked for

- **Representation choices** (recorded as `design.md` §14.9): `lookGroups` array + v1 refusal
  (not a singular field); `defaultLookId` required-when-nonempty; `entered` as an object for
  format-stable widening; root plates in every look's visible set; cross-boundary-only overlap
  pass with the §14.3-claim-3 residual restated; root-level instances in v1.
- **The overlap finding HELD**: each look is its own composition document, so the per-document
  loop gives within-look checking structurally; cross-look overlap is accepted (⭐ pinned) and the
  visible-set pass covers exactly what the partition cannot see.
- **D.5's production caller**: phase 2 — there is none today, stated explicitly.
- **Prompt vs `design.md` §14**: no disagreement found.
- **Anchor drift**: none — every anchor verified before editing.
- **D.6**: no bridge tests were added, so no new silence-baseline boots exist;
  `awaitChannelModeRead` has no new call sites to cover.

## 5. Flags

- 🔴 **A Linux `gate:e2e` is OWED** — `@cg/template-runtime` (the render engine) and the Designer
  changed. The push's CI run is the discharge; its URL is quoted in the session report and should
  be written into `tasks.md` §1b next session.
- **Shared config**: none touched (no `package.json`/`turbo.json`/lock changes).
- **On-air/export source touched**: the carrier and the runtime switch are export/product source —
  flagged per P-014; everything is behind "does the scene carry `lookGroups`", which nothing
  authors until phase 2, so shipped templates are behaviourally unchanged (pinned by the
  coexistence control test).

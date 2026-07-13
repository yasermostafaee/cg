# Tasks — rebuild-starter-templates (D-119)

## 1. Recon + architecture

- [x] 1.1 Recon the starter package, landing wiring, schema (ticker/clock/sequence/path), runtime lifecycle semantics
- [x] 1.2 Trace the export root: per-composition scoping, downward `compositionClosure`, runtime root = `scene.layers`, `entryCompositionId` editor-only
- [x] 1.3 Trace the nested lifecycle cascade (child controllers, loop-cycle no-replay, root-settle timing) — decides where lifecycle/keyframes live

## 2. Starters (owner-approved style bar: ticker + logo-bug, 2026-07-12)

- [x] 2.1 `ticker` — full-bleed strap, flush red plate, content-driven RTL crawl, ever-blinking dot (nested loop-cycle pulse comp), manual + authored exit; owner style notes applied
- [x] 2.2 `logo-bug` — pen-path mark morphing square → circle → compass star (D-110 track), loop-cycle sting on the footprint comp (~10.4 s cadence), wordmark «شبکه جدید»
- [x] 2.3 `title` — two-tier guest title, auto-out 6 s self-close
- [x] 2.4 `sequence` — finite sequence strap (first in / last out per D-116), content-driven auto-out self-close
- [x] 2.5 `irib-news` — two-deck composite; right panel = sequence of composition items rotating Tehran clock / Greenwich clock / @IRIBNEWS one at a time (owner correction 2026-07-12); manual hold
- [x] 2.6 Two-comp structure on all five: footprint comp («… (روی آنتن)», `onair:` tag, own lifecycle/playout) inside a full 1920×1080 entry comp (envelope track, outro outlasts the footprint exit)
- [x] 2.7 Catalog: exactly the five, `irib-news` first, no `isNew`, real posters captured from live runtime renders

## 3. Platform ripple + dependents

- [x] 3.1 `rewriteAssetRefs` seeds fonts on ticker/clock/sequence elements (not only text)
- [x] 3.2 Delete the 8 legacy scene files, their posters, and orphaned seed assets (`showcase/`, `irinn/`)
- [x] 3.3 Update dependents: `starters.test.ts` (rewritten for the new set), `ProjectStore.test.ts`, `apps/runtime` seed stack + `MockRuntime.test.ts`
- [x] 3.4 File B-068 (ensureCompositions lifecycle drop — filed as B-066, renumbered: main's #289 took
      B-066 for the CEF `replaceAll` fix) and B-067 (Runtime inspector flat-fields gap)
- [x] 3.5 Rebase collision with B-056 (#287, landed on main after this branch started): its owned-slot
      occupancy seed + E2E name the stack row `item-lower-third`, a starter D-119 deletes, so the mock
      seeded a warning against a row `seedStack()` no longer creates and the E2E's REMOVE remedy could
      never resolve it. Repointed the seed + its specs at `item-irib-news` (a real seeded row) and added
      a unit guard that the warned itemId IS in the stack — the invariant only the E2E was catching.

## 4. Bound-field defaults (owner polish, 2026-07-13)

- [x] 4.0.1 Recon: confirmed the binding OVERLAYS a data key onto real base text —
      `placeholder` absent = replace full text (`bindings.ts` `applyOne`), and the
      Designer's own bind action (`bind-resolver.ts` / `fields.ts`) writes NO
      placeholder. The starters had inverted this: base text WAS the `{{token}}`.
- [x] 4.0.2 All five starters: every bound text element's base text is now a real
      Persian value, shared with the field's `default` via one const per field, and
      the binding's `placeholder` is dropped (8 fields: irib-news program/brand,
      logo-bug channel/tag, ticker label, sequence label, title name/role).
- [x] 4.0.3 Side-effect fixed: a placeholder-carrying text binding is NOT recognised
      by the inspector's Data-key control (`DynamicDataSection` treats only
      `placeholder === undefined` as an element's convenience binding), so every
      starter's bound field previously read "(static)" in the Designer.
- [x] 4.0.4 Guards: `starters.test.ts` (no `{{` in any element text; no text binding
      carries a placeholder; base text === field default) + new
      `starter-render.test.ts` — each starter through the REAL engine, scoped the
      way the Designer exports: play with no value → the Persian default renders;
      play with an operator value → it substitutes. E2E: the loaded `logo-bug`
      canvas shows «شبکه جدید» / «پخش زنده» and no `{{`.

## 5. Verification

- [x] 5.1 Package tests: schema validity, exact catalog, no-New-badge, two-comp structure invariants, ticker/list binding, morph anchor-id stability
- [x] 5.2 Playwright drive of the real app: entrances, holds, stop/out exits, sting replay, self-closes, rotator states, live clocks (timezone math + colon blink), crawl advance
- [x] 5.3 Boundary test `apps/runtime/tests/import-starter-vcg.test.ts`: every starter, scoped the way the Designer exports, through the runtime's real verify → unpack → render
- [x] 5.4 Landing E2E `starter-landing.spec.ts`: five cards in order, posters, no New badge, first card loads the Studio
- [x] 5.5 Full uncached green gate — 2026-07-13, post-rebase, with §4's polish and §3.5's fix in:
      `turbo --force` typecheck/lint/test/build 79/79, `format:check` clean, `openspec validate --strict` valid,
      and `pnpm test:e2e` fully green (202 designer + 22 runtime; the flakiness seen on 2026-07-12 did not
      recur, and the one hard failure it had been masking — §3.5 — is fixed).
- [x] 5.6 Owner visual confirmation of all five — Designer-side CONFIRMED 2026-07-12; real-CasparCG import
      CONFIRMED 2026-07-13 (the Runtime track's CEF fix — ES2021 `replaceAll` in `@cg/template-runtime`
      bindings — works; the earlier hold is lifted).

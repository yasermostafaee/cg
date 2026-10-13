# Session AZ — DESIGN ONLY: the LOOKS pivot evaluated, priced, and put under ONE gate (§14)

**Read at `956c6992`** — which is `origin/dev` (`f5c547bf`) **plus one local, unpushed commit**:
session AW's §0.4/§0.5 docs commit (the `P-027` addendum + the AY-handoff correction), which rides
along with this session's single push. Delta from the prompt's expected `039fe2b5`: `6bfd3d75`
(`B-149`'s fix), `f5c547bf` (AY patch handoff), then the local `956c6992`. Working tree clean except
the owner's known `template-http-server.ts` advertise-host hack — untouched, unstaged.

**No product code changed. Nothing minted.** The whole session is `design.md` §14, the stage-D halt
in `tasks.md`, and this file.

---

## 1. What exists now

- **`design.md` §14** — the LOOKS pivot: ONE owner gate at the top (_adopt — yes/no_, with the term
  sub-decision folded under it), the model, all seven §2b claims verified against `HEAD` with
  file:line, the survives/dies/parked table, the §12 reversal record, the animated-door paragraph,
  the priced tasks delta, and the compat-window statement. The §12.9 candidate tables are kept,
  un-edited; §12.9's header gained a two-line pointer to §14 so nobody builds against A′ while the
  gate is open.
- **`tasks.md` §5** — 🔴 **STAGE D IS HALTED** until the gate is answered. The reconcile is the one
  stage the pivot changes at the INPUT and not the mechanism, so waiting costs nothing and not
  waiting could cost the stage.

## 2. The claims — what was CORRECTED (the part worth reading twice)

- **"Both grounds are gone" was an undercount.** §0.5's refusal had THREE grounds. The third —
  every declared plate is seated, so N looks = N producers for one source, and a DeckLink cannot be
  opened three times — is dissolved by the model's own amendment (sources declared ONCE, plates
  reference), **not** by today's news. The owner's raw sketch would still be refused today.
- **Carrier (claim 1): CONFIRMED, sharper.** The collision is DOUBLE-SEAT + FIRST-MATCH addressing,
  not a map overwrite — and the bridge never reads `elementId` at all, so dedup-at-export alone is
  collision-safe; the per-look `{routeKey → rect}` is needed for GEOMETRY (the fit path), which is
  stage D's job anyway.
- **Punch (claim 2): true in code, UNVERIFIED by test.** No test anywhere pins a plate inside a
  COMPOSITION instance punching, or stopping when that instance is hidden — the flagship
  suppression test uses a `container`. New tests are priced into C′ as a precondition.
- **Overlap (claim 3): "retired rather than rescoped" is the wrong half.** Within-look checking IS
  free (each look = its own document in the per-document loop, anchor drifted `:315` → `:329`), but
  AV's pass is the ONLY cross-composition-instance check; pure retirement leaves root-plate-vs-look
  and two-multi-frame-elements checked by nothing. v1 answer: refuse those configurations
  (two cheap preflights), or a visible-set pass.
- **Exclusivity + ledger (claim 4): CONFIRMED** — nothing keys on arrangements; the bridge consumes
  ZERO of the arrangement carrier (the 6.4 compose never landed), so killing the carrier strands
  exporter + shared-ipc only.
- **Animated door (claim 5): MIXED** — `MIXER FILL` is per band layer (per source-seat) today, but
  mask holes carry no source identity and the zero-area rule is spec-only; the bridge explicitly
  refuses zero-area rects. The door is ajar at the SEAT level; the page half was equally unbuilt
  under A′.

## 3. What the owner must answer

**§14's gate: adopt the LOOKS model — yes or no.** (Recommended: yes; recommended term: LOOK.)

## 4. Flags

- **Docs-only diff** (`openspec/**` + `docs/**`) ⇒ the carve-out gate applies:
  `pnpm openspec validate --all --strict` = **58/58 passed**, plus `format:check`. No Linux
  `gate:e2e` is owed by this session, and CI will rightly classify the push as unable to affect
  rendering.
- **Session AW is still mid-flight**: its §0.4/§0.5 landed as `956c6992` (in this push); its
  §2–§7 (the bridge-up/Caspar-down alarm) remain to be done in a future session.
- **The single biggest cost the AZ brief understated**: the **source-declaration surface**. Today
  "declare a source" IS "draw a plate"; declare-once demands a source LIST on the multi-frame
  element, a membership preflight, and its refusal family — a new concept with its own UI, priced
  in §14.7 as C′'s item (a).
- `D-153`/`D-154`/`B-149` are superseded-if-YES, **not wrong** — recorded that way in §14.4 so
  their history stays readable.

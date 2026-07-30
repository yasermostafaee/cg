# DEBT.md — what fast mode on `dev` deferred

Written as work happens, never reconstructed afterwards. This file is the INPUT to
going back to normal mode: full `pnpm gate`, `openspec validate --all --strict`, the
numbered items filed in one sweep, and the owner's hand-merge of `dev` into `main`.

Do not start that reconciliation without the owner asking for it.

---

## Findings to file

### ⛔ CHAIN STOPPED AFTER `dev-clear-bank-scoped` — two queued tasks are UNTOUCHED

The owner queued four units to run unattended, in order. **Two are done and pushed; two
were never started.** Stopped at a clean task boundary per the chain's own rule ("a clean
stop after task 2 is a good outcome; a broken tree after 2½ tasks is not"), because neither
remaining task can be done well in what was left — and both are on-air paths that REQUIRE an
adversarial self-review, which is the one thing that must not be done badly.

| #   | task                      | state                        |
| --- | ------------------------- | ---------------------------- |
| 1   | `dev-r028-b4`             | ✅ done, pushed (4 commits)  |
| 2   | `dev-clear-bank-scoped`   | ✅ done, pushed              |
| 3   | `dev-r022-rehearse`       | ⛔ **NOT STARTED** — no code |
| 4   | `dev-r030-channel-raster` | ⛔ **NOT STARTED** — no code |

Nothing was half-written for either: no files added, no signatures changed, no
partially-wired channels. A later session starts from their prompts with a clean tree.

### ⚠ A LIVE ON-AIR DEFECT IS NOW KNOWN AND STILL UNFIXED — non-1080 channels mis-place every graphic

This is the most important thing in this entry, and it is worth filing as a BUG in its own
right rather than only as the preview task it was bundled into. It was to be fixed by
`dev-r030-channel-raster`, which was not started.

`OUTPUT_FRAME` is hardcoded 1920×1080 at `packages/template-runtime/src/position.ts:25` (the
comment above it already calls this future work), and `applyOutputPosition` forces
`html`/`body` to that size at `:110-111`. **On a channel that is not 1080 the anchor maths
computes against the wrong raster and the page overflows** — the owner reports this is
exactly what the C-018 recon hit when it had to `scrollTo(0, 360)` on a 720p channel. It is
an air defect, not a preview nicety.

The fix is decided and recorded by the owner, so it does not need re-deriving: keep the
reference frame at 1920×1080 and apply a UNIFORM SCALE `min(cw/rw, ch/rh)` to the root at
play-out, leaving the whole anchor maths untouched. The seam already exists —
`outputTranslate` takes a `frame` parameter with a default at `position.ts:80`. Non-16:9
letterboxes (accepted edge case). **Reflow was explicitly REJECTED** (pixel-authored
keyframes, line-breaking and kerning shift, air becomes non-deterministic and preview==air
parity breaks). Geometry resolution order: the bridge's appended query first, then
`window.innerWidth/innerHeight`, then a fallback.

Two constraints for whoever does it: **a 1080 channel must render byte-identically to today**
(scale 1.0, nothing shifts), and the **operator placement override** (R-011, bridge-appended)
is what persists — never the authored scene position, which belongs to the Designer.

### b4 — two same-named sequences still produce IDENTICAL Inspector headings

Found while answering b4 item 2, and now ASSERTED rather than assumed away
(`packages/shared-schema/tests/composition-fields.test.ts`, the "TWO same-named sequences"
case).

A sequence composition item's display label is built from the sequence ELEMENT's name
(`sequenceItemNamespace`), so two sequences both called `Sequence`, each with an item at
position 1, both render the heading `Sequence — item 1`. The value KEYS are distinct and
id-based, so nothing collides or collapses in the data — this is purely that the operator
cannot tell the two headings apart from the Inspector.

The old test comment claimed "the operator disambiguates by element". He cannot: the
element name is not shown in the Inspector, only the label. That comment is now corrected
to state the real limit.

**Not fixed here.** Making sibling labels unique needs a de-dup pass over the aggregate
(the shape of `uniqueInstanceName`, but applied to labels and producing something better
than `Sequence — item 1 2`). It is a Designer-facing authoring nicety as much as a Runtime
one, and it deserves its own decision about the wording. The workaround today is to rename
one of the two sequence elements in the Designer.

### b4 — `Reload` and `Grant access` are still ACCENT-coloured affordances

Item 5 named Discard and `From file…`; both are `neutral` now, as is `Add item` in the list
editor (it was in the same file being rebuilt). `FromFileControl`'s `Reload` and
`Grant access` remain `variant="secondary"` — a sky-accent outline
(`apps/runtime/src/renderer/features/inspector/FromFileControl.tsx:154,170`).

Left deliberately, flagged rather than swept: by the strict reading of the neutral rule
they are affordances and should carry no hue, but `Grant access` in particular only appears
in an attention state (a restored file source whose read permission the browser did not
carry over), so its accent is arguably state-adjacent. It is a one-word `variant` change
per button if the owner wants them neutral too — the same shape as the still-coloured bulk
verbs recorded further down.

### ⚠ VOID — the CasparCG 2.5.0 conclusion below is WRONG. 2.5.0 works.

**Struck through, not deleted, because the mistake is more instructive than the
conclusion was.** Do not act on the entry that follows it.

The real cause was that **CEF was dead in that CasparCG instance**
(`cef_executor Could not post task`). Adding an `<html>` block with a writable
`cache-path` to `casparcg.config` fixed it, and the same 2.5.0 now shows
`occupied — html producer` rows and a row `ON AIR`. `CG ADD` with a bridge-served
http URL is fine.

**Why the probe misled, which is the part worth keeping.** The one result that looked
like it exonerated the environment — bare `PLAY "<url>"` returning `202 OK` while both
`[HTML]` forms returned `404` — was almost certainly the **ffmpeg** producer answering,
because ffmpeg accepts http URLs too. That reading turned "the HTML producer is broken"
into "CG ADD cannot take a URL", and the invented mechanism then sounded plausible
enough to write up with a recommendation attached.

The lesson is specific and worth carrying: **a control test that reaches a different
implementation than the one under test is not a control test.** The probe needed to
establish WHICH producer answered before drawing any conclusion from the fact that one
form succeeded. Confidence came from the crispness of the table, not from its validity.

### ~~CasparCG 2.5.0 cannot load our templates at all — `CG ADD` with an http URL is refused~~ (VOID — see above)

**This entry is retained only as the record of a wrong diagnosis. Its conclusion and
its recommendation are both void.**

Observed 2026-07-30 against the CasparCG the owner has installed here
(`D:\programs\casparcg\casparcg-server-v2.5.0-stable-windows`, `VERSION` → `2.5.0
69e8ad5 Stable`). The bridge sends the documented sequence and CasparCG refuses the
second half of it:

```
CLEAR 1-71                                    → 202 CLEAR OK
CG 1-71 ADD 0 "http://127.0.0.1:53285/template/8beea7b2-…" 0 "{…}"
                                              → 404 CG ADD FAILED   ("File not found.")
```

Probed directly over AMCP on layer 80 (outside the 70–73 bank and outside the 60–69
reservation, cleared afterwards):

| command                                  | result                |
| ---------------------------------------- | --------------------- |
| `CG 1-80 ADD 0 "<http url>" 0 "{}"`      | **404 CG ADD FAILED** |
| `PLAY 1-80 [HTML] "<http url>"`          | **404 PLAY FAILED**   |
| `PLAY 1-80 [HTML] "https://example.com"` | **404 PLAY FAILED**   |
| `PLAY 1-80 "<http url>"` (bare, no tag)  | **202 PLAY OK**       |

What that isolates:

- The bridge side is HEALTHY. The template HTTP server serves that exact URL —
  `HTTP 200`, 768 KB of HTML — so this is not a serving, port or firewall problem.
- The `[HTML]` producer TAG does not resolve in this build at all (it fails even for
  `https://example.com`), so this is not about our URL.
- A BARE URL does load (`202 PLAY OK`), so the HTML producer exists and accepts URLs
  — the install has its CEF binaries (`libcef.dll`, `resources.pak`, `icudtl.dat`),
  and 2.5.0's changelog lists "HTML: Update CEF to 142".
- Therefore: in 2.5.0, `CG ADD` resolves its template argument as a FILE under the
  `template/` directory and will not take a URL. Our whole control model is the CG
  template protocol (`CG ADD` / `CG UPDATE` / `CG PLAY` / `CG STOP`), served over
  http. On 2.5.0 that can never resolve.

Why this is not a quick fix, and why nothing was changed: a bare `PLAY <layer>
"<url>"` loads the page but gives up `CG UPDATE` field injection and the CG
intro/outro lifecycle — i.e. it would replace this product's data and lifecycle model,
which is on-air behaviour. That is a scope decision for the owner, not a fast-mode
edit.

**Recommendation, for the owner to confirm:** run **2.3.2**, which every `.vcg`
manifest already declares (`compatibility.minCasparCGVersion: '2.3.0'`) and which is
recorded as the authoritative target. 2.5.0 on this machine is what is new, not the
code. If 2.5.x has to be supported, that is its own item with a bridge-protocol
design, not a patch.

Secondary observation from the same log, worth its own item: **the adopt-`CLEAR`
succeeded and the `CG ADD` after it failed, so layer 71 was left empty.** The row
reported `ERROR` honestly and the description column read `empty`, so the UI did not
lie — but this is the B-100 shape (a destructive step committed before the
constructive step that repairs it is known to succeed) arriving via a NEW route: not a
re-read boolean, but CasparCG rejecting the `ADD`. Worth deciding whether the load
path should probe-then-clear, or restore on ADD failure.

### CLEAR ALL is always ENABLED but is not always EFFECTIVE — a bridge change is owed

**Found by the adversarial self-review that item 3 required, not by a test.** This is the
most important open item in this file.

The owner's decision was that CLEAR and CLEAR ALL are always enabled, because refusing
the remedy when the state model is confused strands a graphic on air. The UI now does
that. The two halves do not deliver it equally:

- **The per-row CLEAR is genuinely effective.** `caspar-runtime.out(itemId)` requires
  only that the item has a bound slot — it does NOT inspect the status — so pressing
  CLEAR on a row sends `CLEAR <ch>-<layer>` whatever the status claims. The escape hatch
  works where it matters most.
- **CLEAR ALL is not.** `caspar-runtime.clearAll()` filters
  `status !== 'idle' && status !== 'loaded'` before sending anything — i.e. it is gated on
  precisely the statuses that might be WRONG in the situation the escape hatch exists
  for. If every item wrongly reads `idle`, CLEAR ALL sends nothing and returns
  `{ ok: true, cleared: 0 }`: a success report for a no-op, which is the failure mode
  worse than a disabled button.

**Not fixed here, deliberately.** Making the bulk verb a true escape hatch means changing
`clearAll`'s predicate to "every item with a slot", which is on-air bridge behaviour and
well outside a UI-review session's remit — and it needs a decision about whether
Clear-All should hard-cut rows the model believes are merely loaded.

**Mitigated in the meantime, honestly:** the confirm dialog no longer promises that
everything comes off. When nothing reads as on air it says so, warns that the action may
send no commands, and points the operator at the per-row CLEAR, which is not status-gated.
The button stays available per the decision; only the false promise is gone.

### R-006 and B-087 are anchored on "red" and on-air is now GREEN — PRD re-wording owed

Owner decision this session: **on air is green, and red means error or destructive intent
only.** The code and the tokens moved; the PRD wording did not.

`R-006` is recorded as "a simulation may never wear the broadcast **red**" and `B-087`'s
"a frozen air claim is demoted" sits beside it. Those sentences now protect nothing — they
forbid wearing a colour the product no longer uses for air.

**The trap, which is why this needs a human sweep rather than a test run:** the tests
assert the ROLE (`data-row-state`, `cg-badge--onair`, `badgeTone`), not the hex. That is
the more durable form and was kept deliberately — but it means every test stayed GREEN
through a change that emptied the rule of meaning. A green suite is not evidence here.

Owed: re-word R-006 and B-087 in `docs/prd/*` to name the air colour by role rather than
by hue, and audit the surface for reds that no longer mean danger. Two were already caught
and fixed in code in b3 (`.cg-btn--air`'s hard-coded rose tint and text, which would
have left a red control claiming to be the on-air family). `theme.ts`'s header and
`tests/theme.test.ts`'s prose were corrected in place; the PRD was not touched, per fast
mode.

**Re-confirmed as a PRD edit owed (2026-07-30, owner).** ON AIR is GREEN, per the
mock-up — closed, not open for revisiting. The consequence to RECORD rather than solve is
exactly this entry: R-006's sentence "a simulation may never wear the broadcast **red**"
is now anchored to the wrong colour. `docs/prd/*` was deliberately NOT edited (fast mode
forbids it).

**b4 update:** the `air` VARIANT is now gone entirely, not merely retinted — the Inspector's
UPDATE was its last caller and went `neutral`, so the type, the class map, the accent map
and the CSS block were all deleted. That removes the last control wearing an air hue, which
narrows the audit this entry asks for but does not discharge the re-wording.

**And the trap is worth restating, because it is the reason this needs recording at all:**
the tests assert the ROLE (`data-row-state`, `cg-badge--onair`, `badgeTone`), never the hex.
That is the durable form and was kept deliberately — but it means the suite stays GREEN
while the PRD wording drifts away from the code. A green suite is not evidence here.

### The `#` column and the default alias are ONE number by construction — keep it that way

Recorded because the invariant is easy to break by accident. `#` and the default row name
(`Layer 1`, `Layer 2`, …) both read `bankPosition` from `@cg/shared-ipc`, so they cannot
disagree. Two derived integers on one row disagreeing about which row it is was the hazard
the owner identified: "fire layer 2" becomes a coin flip.

It is bound to the BANK, not to the rendered list — the owner's added constraint. Hiding a
row leaves a GAP in the sequence rather than renumbering the rows past it, because a
positional handle that silently renumbers is worse than none. There is no test on the
gap-not-renumber property yet; worth one when the numbered items are filed.

### Item numbers were claimed on `dev` while fast mode forbids it

`B-113`, `B-114` and `R-034` appear in commit messages on `dev` (`f57774f`,
`e1bc851`). Fast mode suspends number claiming because a claim made without the
full-ref sweep races anything else that files.

They have deliberately NOT been un-claimed and nothing has been renumbered. Before
fast mode ends, **all three must be verified against `origin/main` and every ref** —
`git for-each-ref` plus the `docs/prd/*` files on `main`, not just `cg`'s working
copy.

Note specifically that **`R-034` skips past the last known `R-030`**, so `R-031`,
`R-032` and `R-033` need checking too: either they exist somewhere unmerged and
`R-034` is a genuine collision, or the numbering jumped and the gap should be
recorded as intentional.

### The Description column could drop the wire's own report — found by the E2E gate, fixed

Worth filing as a near-miss, because it is the B-094 honesty class and a test caught what
manual review did not.

The review specified the narrow-panel drop order as description → template name → layer
number, so the "Description" column — which carries CasparCG's own account of the layer,
verbatim from `occupancyLabel` — is the FIRST thing to go. At the E2E viewport (1280px)
it is already gone. For an UNBOUND row that was harmless: the state mark IS the wire's
verdict there, because there is nothing else it could be showing. For a BOUND row it was
not: the mark shows the ITEM's status, so "what does CasparCG actually report about layer
70?" had nowhere left to live. An operator on a perfectly ordinary screen size could no
longer tell an `unknown` layer from an `empty` one for any row with a template on it —
the precise confusion the honesty rules exist to prevent.

Fixed in code, not by relaxing the assertion: the state cell's tooltip now ALWAYS ends
with CasparCG's report, reusing the canonical `occupancyLabel` wording verbatim so the
column and the tooltip cannot drift. The drop order the review asked for is unchanged;
the fact is now one hover or one keyboard focus away at every density.

The E2E assertions moved from the column's visible text to the state cell's label and
tooltip, which is strictly stronger — the old form only held at the widest density and
said nothing about what the operator sees at 1280px.

### The row's LOAD/REMOVE toggle fights the column-header model

The verb block is icon-only, made safe by the sticky header printing each verb's word
above its glyph. The first verb column is the LOAD/REMOVE toggle, and one header word
cannot name both halves. It currently reads `LOAD`, with the header cell's tooltip
stating the toggle outright and each button naming itself exactly via its own
`aria-label` and tooltip.

That is defensible but it is a compromise the owner should look at. The alternatives
are splitting the toggle back into two columns (costs 44px and re-introduces a control
that appears/disappears, which `layerRowActions` documents as deliberately avoided) or
a header word that changes with the rows (a moving label).

### Bulk verbs in the panel header are still coloured

Item 10 moved colour off the ROW verbs. `STOP ALL` (amber outline), `CLEAR ALL`
(filled amber) and `REMOVE ALL` (red outline) in the Layers header keep theirs. That
was read as deliberate — they are rare, bulk, and destructive, and there is one of
each rather than one per row, so they do not drown the state signal the way 30 coloured
rows did. If the owner wants the neutral treatment to extend to them, it is a
`variant` change per button and nothing else.

### Retired M0–M12 milestone references still in the source

The PGM/PREVIEW placeholder copy cited `(M9)`, a milestone from the retired
Electron-era M0–M12 roadmap — a numbering scheme that no longer drives work and that
means nothing to an operator. Fixed: the visible copy now just says what each output
is, and the pointer moved into a code comment naming `C-016` (operator PGM confidence
view), which actually owns the feature.

One more is left in the tree deliberately: `FailoverBanner.tsx` carries a
`Phase 8 §12 / M9.0` provenance note. It is a comment rather than visible copy and
belongs to a different feature, so it was not touched. Worth a sweep for other
`M<n>` references in comments when the numbered items are filed.

### PREVIEW and PROGRAM are empty for different reasons — now encoded, worth keeping

A first draft labelled BOTH monitor boxes "NOT CONNECTED". That is a category error for
PREVIEW: `R-022` specifies it as a LOCAL browser render of the loaded template through
`@cg/template-runtime` — "no CasparCG involvement, no second channel", "nothing is ever
sent to CasparCG" — so it has nothing to connect to, ever, and a connection state
would send an operator hunting for a link that is not part of the design. Only PROGRAM
awaits a real feed (`C-016`, the program-channel return).

Fixed: the empty state is now per-panel (`icon` + `emptyLabel` + `detail`) — PREVIEW
reads "Nothing to preview", PROGRAM reads "No program return". Recorded because the two
boxes look interchangeable and the next person to touch them will be tempted to share
one placeholder again; the reasoning is in `MonitorPanel`'s header comment.

### The failover banner overlays the monitor strip

`FailoverBanner` is `position: fixed` (per `layout.ts`, deliberately, so it is not a
grid item), so when `PRIMARY A unhealthy (degraded)` is showing it covers the top of
the PREVIEW/PROGRAM panels rather than pushing them down. Visible in the first
screenshot of this session. Pre-existing, unrelated to this work, and now more
noticeable because there is real content under it instead of a placeholder line.

### `clampInspector` ignores the shell's own chrome

`MIN_WORKSPACE_PX` is treated as "viewport minus Inspector", but the shell also spends
~54px on padding, the gap and the divider, so the workspace COLUMN is that much
narrower than the floor implies. Harmless now (the table's `tight` density fits in
~360px, far below any reachable width) but the constant does not mean quite what its
name says. Pre-existing.

---

## Skipped process

Per the fast-mode contract, all of this was deliberately not done.

**b4 (the Inspector task) specifically:**

- **No `pnpm gate`.** Ran the affected workspaces' own tasks instead, all green before
  hand-off: `@cg/runtime` `typecheck`, `lint` (**0 errors**; the same 6 pre-existing
  warnings, none introduced), `test` (**391 passed, 55 files**), `build` (succeeds);
  `@cg/shared-schema` `test` (**21 passed** in the touched file) and `build`. NOT run: the
  full turbo fan-out, `format:check` beyond what the pre-commit `lint-staged` prettier pass
  covers, and any uncached cross-workspace run.
- **E2E: RUN and GREEN on Windows (superseding this entry's original "not run at all"), still
  owed on Linux.** The committed Stop hook ran `pnpm gate:e2e` at turn end and it went RED,
  which is how the b4 + clear-bank-scoped E2E debt actually got discharged — the gate found
  exactly what this entry predicted it would. After the fix: **22/22 turbo tasks, 0 cached,
  `@cg/runtime` 31 passed, `@cg/designer` 231 passed.**
  - The **three Designer assertions edited blind** are now VERIFIED:
    `sequence-composition-item-fields.spec.ts` passes against the new `Sequence — item 1`
    label, so the em-dash concern is closed.
  - Because b4 alters UI, layout and rendering, a **Linux `gate:e2e` is still owed** — a
    green Windows run is a useful signal and never discharges that debt (`CLAUDE.md`).
- **Item 6 is asserted in jsdom, which has NO bidi engine.** The tests pin what this repo
  controls — the attribute is `auto`, no editor pins a literal `rtl`/`ltr`, and values
  round-trip byte-identically — and deliberately do NOT claim to have verified the browser's
  first-strong-character resolution. The `@IRIBNEWS`-stays-LTR behaviour is the browser's
  UAX #9 implementation and needs a real browser (or the owner's eye) to observe.
- **No OpenSpec anything, no `docs/prd/*` edits, no item numbers claimed.** The R-028 spec
  does not describe the Inspector as it now is.
- **Engine doc-sync not done** for the two new UI extension points (`AutoGrowTextarea`,
  `editorTextDirection`).
- **No hardware verification.** Nothing in b4 reaches an on-air path, so the adversarial
  review requirement did not fire — with the one exception the task itself named, item 6,
  which was held to the editor/value separation and is covered by the round-trip test rather
  than by review.

**`dev-clear-bank-scoped` specifically:**

- **No `pnpm gate`.** Affected workspaces' own tasks, all green before hand-off:
  `@cg/caspar-bridge` `typecheck`, `lint` (`--max-warnings 0`, clean), `test`
  (**236 passed, 46 files**), `build`; `@cg/runtime` `typecheck`, `lint` (0 errors),
  `test` (**391 passed, 55 files**), `build`; `@cg/shared-ipc` `build`.
- **E2E: RUN and GREEN on Windows; Linux still owed.** The row's CLEAR gate changed on every
  row, and the Stop hook's `gate:e2e` caught the one spec that pinned the OLD behaviour:
  `apps/runtime/tests/e2e/fixed-layers.spec.ts` asserted CLEAR was DISABLED on an unbound
  row. Re-expressed rather than loosened — PLAY/NEXT/STOP are still asserted disabled there
  (that half is unchanged), and CLEAR is now asserted ENABLED, which is STRONGER for the case
  that matters: the fixture's row 73 has UNKNOWN occupancy, so the spec now pins that the
  escape hatch is reachable exactly when the console cannot say what is on the layer. No
  product code changed to make it pass.
- **NOT VERIFIABLE ON AIR from this machine**, and this one matters more than usual: the
  whole point of the command is to send a real `CLEAR` to a real layer. The 8 integration
  tests assert it against `@cg/amcp-mock` (including reading the AMCP wire trace to prove
  the command was or was not sent), which is a strong check of the GUARD but not of
  CasparCG's response to it.
- **The bound-row race seam is left open** (see the adversarial-review findings under the
  DONE entry below) — worth filing as an item.
- **No OpenSpec, no `docs/prd/*` edit, no item number claimed** for the new capability,
  the new channel, or the two re-expressed row assertions.

**Earlier tasks (b3 and before):**

- **No `pnpm gate`.** Ran the affected workspace's own tasks instead, and all were
  green before hand-off: `@cg/runtime` `typecheck`, `lint` (0 errors; 6 warnings, all
  pre-existing — the 2 this work introduced were fixed), `test` (**375 passed, 54
  files**), `build` (succeeds). NOT run: the full turbo fan-out across every
  workspace, `format:check`, and any uncached cross-workspace run.
- **E2E: run and GREEN on Windows, still owed on Linux.** The committed Stop hook ran
  `pnpm gate:e2e`, which went red on `@cg/runtime#test:e2e` exactly as this entry
  predicted. It was fixed rather than deferred, and the full gate now passes — 22/22
  turbo tasks, `@cg/runtime` 31 passed, `@cg/designer` 231 passed. Because this change
  alters UI, layout and rendering, a **Linux `gate:e2e` is still owed**: a green
  Windows run is a useful signal and never discharges that debt (`CLAUDE.md`).
  What the red run caught is recorded under "Findings" as a real defect, not a stale
  test — see "The Description column could drop the wire's own report".
- **No OpenSpec anything.** No `openspec validate`, no change directory, no spec
  delta, no `tasks.md` reconciliation for the R-028 items this touches. The R-028 spec
  now describes a row that no longer exists in that form.
- **No PR, no merge, no branch cleanup, no archive.**
- **No `docs/prd/*` edits** and no item numbers claimed for any of the 13 items in
  this task or the findings above.
- **Engine doc-sync not done.** `Panel`, `Tooltip` and the `layerTable` column model
  are new extension points; `docs/engines/overview.md` says nothing about them.
- **No hardware verification of on-air behaviour.** See the CasparCG 2.5.0 finding: on
  this machine nothing can be put on air at all, so no load, take, update, stop or
  clear was verified end to end. Occupancy read `unknown` for the whole session.

---

## Decisions taken fast

Each of these was an open design question. The simplest reversible option was taken
and recorded here rather than blocking on the owner.

### b4 — WIDE vs COMPACT field rows is decided by field KIND, not by width alone

Item 1 asked for the layout to stop starving the textareas. Two mechanisms were possible:
a pure width rule, or a per-kind rule. Both are in, and the split is:

- **text / multiline / list / image** stack their label ABOVE the control and take the
  panel's full width. Chosen because a 160px value column was never enough for a Persian
  headline **at any panel width** — widening the screen does not fix a fixed 120px label
  column plus in-line buttons.
- **boolean / number / colour / select** keep the compact two-column row: they have a small
  intrinsic width and the denser form is easier to scan.
- A **container query** then collapses even the compact rows below 15rem.

The alternative — collapse everything on width alone — was rejected because it makes a
checkbox row as tall as a headline row on a normal-width panel for no gain. Reversible: it
is one predicate (`isWideKind`) and one CSS class.

### b4 — the container query is on the PANEL, not the viewport (and this one is not really optional)

Recorded because a future reader may be tempted to "simplify" it to a media query. The
Inspector is a draggable column, can go fullscreen, and below the narrow breakpoint becomes
a right-pinned overlay at `min(24rem, 82vw)`. Its width is therefore NOT a function of the
viewport's, so a media query gets the answer wrong in precisely the two cases the owner
named as constraints. `container-type: inline-size` on `.cg-inspector-body` asks the panel
about its own width — the same "probe the axis you intend to judge" rule CLAUDE.md states
for liveness, applied to layout.

### b4 — auto-grow textareas have NO resize handle

`AutoGrowTextarea` owns the height and re-measures on every value change, so a manual drag
would be silently undone by the next keystroke. A handle that quietly stops working is
worse than no handle, so `resize: none` plus a ~200px cap with internal scrolling. If the
owner wants manual resize back, the cap is the thing to raise instead.

### b4 — the drag handle is `aria-hidden`, and the arrows are the accessible path

Native drag is pointer-only. Rather than announce a control a keyboard or screen-reader user
cannot operate, the grip is `aria-hidden` + `tabIndex={-1}` and the labelled ↑/↓ buttons —
which the owner explicitly required be kept — remain the complete, keyboard-reachable route
to the same result. The alternative (a full ARIA drag-and-drop pattern with keyboard pickup)
is a much larger surface and would duplicate what the arrows already do correctly.

### b4 — the sequence label was fixed at the SOURCE, so the Designer's wording changed too

`ROTATOR[0]` → `ROTATOR — item 1` was applied in `sequenceItemNamespace`
(`@cg/shared-schema`) rather than by reformatting the string inside the Runtime Inspector.
That means the Designer's preview form and the GDD now show the new wording as well.

Chosen deliberately: it is ONE display string with one definition, and having the Runtime
and the Designer disagree about what the same group is called is worse than a wider diff.
Munging `"ROTATOR[0]"` back into a friendly form at the display site would also mean parsing
a label, which is fragile. Cost: three Designer E2E assertions and one shared-schema unit
assertion were updated (values and keys untouched — the KEY is `name`, which did not
change).

### The real layer number STAYS on the row (a documented softening of task 4.2)

Task 4.2 says "REAL layer number (always)". The row number (1..n) is now the primary
identifier, and the real CasparCG layer number is kept as a **small, fixed-width
secondary column** — not moved to the Inspector alone.

Reasoning, recorded so a later reader does not "fix" it back: layer numbers are the
vocabulary shared with the playout side (the reservation is _60–69_, not _rows 1–4_),
so an operator and a playout engineer need to be able to say the same thing out loud at
2 a.m. Putting it only in the Inspector would also collide with a decision already made
in this same surface — on a narrow screen the Inspector is an overlay behind a
hamburger, so the layer number would become unreachable exactly while somebody is
troubleshooting. It is therefore the THIRD column to drop as the panel narrows, and the
Inspector shows it too. **If the owner still wants it off the row, that is his call.**

### Row number counts from the TOP of the list as displayed

Rows are ordered by DESCENDING layer (the list mirrors on-air z-order), so row 1 is the
highest layer, not the bank's first layer. A positional index is the only
self-consistent reading of "the number you can point at"; numbering from the bank's
start would display `4, 3, 2, 1` downwards.

### Template name and description became COLUMNS, not stacked under the alias

Item 2 asks for template name and description "secondary beneath" the alias; item 11
asks for a table with column headers and a declared drop order of "description →
template name (keep the alias)". Those pull apart — you cannot drop something that is
stacked under the alias without dropping the alias. Item 11 was taken as the governing
one: alias is primary by being the leftmost, boldest text column, and the other two are
their own droppable columns. Item 2's actual requirement (the alias outranks the
template name) holds.

### Verbs are icon-only at EVERY width, not only when narrow

Item 5 says to collapse verbs to icon-only when narrow; item 11 says the sticky header
is what makes icon-only safe and to ship them together. Always-icon-only was chosen
because it also makes the verb column a fixed width at every density, which is what
gives item 3 ("nothing moves when text changes length") for free. Verb columns are
44px — wider than the 34px hit-target floor — because the header has to fit the word
`REMOVE` above the glyph.

### The channel tab strip renders even with ONE channel

Channel is the outer axis, LAYERS/PLAYOUT sit inside it. With one channel the strip
shows a single `CHANNEL 1` tab rather than hiding itself: it says which channel the
rows belong to, and it means adding a second channel is a longer array rather than a
new layout. Costs ~28px of vertical space.

### `Panel` outside its provider DEGRADES rather than throws

`useShellLayoutContext` first threw when no provider was found, on the theory that a
panel silently missing its fullscreen button is the bug the primitive exists to
prevent. That was reversed: a throw during render with no error boundary unmounts the
tree, and trading "one button is absent" for "the operator's whole surface is blank" is
not a trade worth making on a playout console. The original failure mode is closed
structurally anyway — the button lives inside `Panel`, so it cannot be forgotten per
panel.

### PGM/PVW placement is NOT RTL-flipped

Persian/RTL is a core requirement and text reverses throughout, but PREVIEW-left /
PROGRAM-right is a hardware convention shared with the mixer, the multiviewer and the
rack, and those do not flip.

### Two tests were updated to the new row structure

Not loosened — re-expressed. The layer row no longer renders a `.cg-badge` pill (the
badge became the state column when the verbs went neutral), so three assertions that
read `.cg-badge` / `cg-badge--onair` now read a `data-row-state` attribute carrying the
same ROLE. The claims are unchanged and still fail if violated: R-006's "a simulation
may never wear the broadcast red" (`testModeHonesty.dom.test.ts`) and B-087's "a frozen
air claim is demoted" (`layerRow.dom.test.ts`). Asserting the role rather than a hex
colour is also the more durable form. `StatusBadge` itself is untouched and its own
test still passes; the `unverified` safety wording was extracted to
`ui/airStateWording.ts` so the badge and the row share ONE copy.

### ✅ DONE (`dev-clear-bank-scoped`) — CLEAR on an EMPTY row now has its layer-scoped capability

**Closed.** The design below was implemented as specified; what follows is what shipped and
what its guard is, so the entry stays useful rather than merely ticked.

**The guard, which is the whole feature.** `CasparRuntime.clearBankLayer(channel, layer)`
sends `CLEAR <ch>-<layer>` when TWO structural facts hold, both required, both
config-derived so no UI state can bypass them:

1. the layer is inside the DECLARED bank — `LayerManager.isFixed({channel, layer})`, which
   is channel-aware and enumerated from `start`/`count`, **never from visibility ticks**
   (the owner's constraint: a tick is a display concern, membership is not);
2. the layer is NOT reserved — `#reservedSet`, channel-agnostic, as everywhere else.

It consults NO occupancy, NO OSC freshness, NO item status and NO binding. That
indifference is the point: those are the things that may be wrong when an operator reaches
for this.

**Reserved is checked FIRST, deliberately.** Boot already refuses a bank overlapping the
reservation (`validateFixedBank` throws before the WebSocket binds) and so does every live
change — so the two sets cannot currently intersect. Checking reserved first means the
reservation would still WIN if they ever did, by construction rather than by a proof about
another module. `clear-bank-scoped.integration.test.ts` asserts the ORDER by using a layer
both halves would refuse and checking which reason comes back.

**Wire:** `fixedLayers.clear-layer` (reasons `not-in-bank` / `reserved` / `amcp-error`),
routed in `bridge.ts`, mirrored in `MockRuntime.clearBankLayer` with the same guard, and in
the mock-bridge parity guard — it is a SAFETY surface, so a mock that cleared where the
bridge refuses would teach test mode a more dangerous model than air.

**Row:** CLEAR is now enabled on every row. Bound → `stack.out` (unchanged, keeps the B-039
producer bookkeeping); unbound → the new layer clear. Its confirm gate is per-case: the
bound wording says what is being destroyed, the unbound wording promises only what is
certain and never implies the console knows the layer is empty.

**8 integration tests**, covering the cases the owner named: one below the floor and one
above the ceiling both refused; the same layer number on a DIFFERENT channel refused; a
reserved layer refused with `reserved` rather than `not-in-bank`; an UNTICKED in-bank layer
still clearable; `unknown` occupancy does NOT block (asserted directly — it is the
requirement); no bank → everything refused; a bank overlapping the reservation cannot boot.
Every refusal also asserts NOTHING reached the wire.

#### What the required adversarial review found

Three things, none of them a hole in the guard, all recorded rather than left implicit:

1. **A bound-row race leaves STALE ITEM STATE (a real seam, not fixed).** The row routes on
   `item === null` at click time. If an item is loaded onto a row in the instant between
   render and click, the unbound branch sends a layer CLEAR that destroys the just-loaded
   producer **without** going through `stack.out`, so the item's state machine still reads
   `loaded` while the layer is empty. It is not a SAFETY hole — the layer is in the bank,
   not reserved, and the operator asked for a clear — but the row will misreport until the
   operator hits REMOVE. Refusing when the layer is owned was considered and REJECTED: that
   reintroduces dependence on the very bookkeeping this exists to bypass. The proper fix is
   to reconcile any item bound to the layer after a successful bank clear, which is on-air
   bookkeeping and wanted its own diff. **Worth filing.**
2. **With NO reservation declared, the bank is the only guard.** `reservedLayersPath`
   pointing at an absent file means "nothing reserved", so a bank declared over real
   playout layers would boot without complaint and those layers would be clearable. This is
   PRE-EXISTING and identical for `layers.clear`, the orphan sweep and the playout tab — it
   is a config-truth problem, not a guard bug, and this change does not widen it. Recorded
   because the guard's strength is exactly the strength of the declared reservation.
3. **The mock models "reserved" as an OBSERVATION map, not a config list.** `MockRuntime`
   tests `#playoutObservations.has(layer)`, which is how `playoutClear` already decides
   `not-reserved`. Unseeded there are no reserved layers at all, so offline every bank layer
   clears freely — consistent with a bridge that has no reservation declared. Test-mode
   only, and it matches the existing mock convention, but it is not a config-derived guard
   the way the bridge's is.

**What this does NOT close: `stack.clearAll` is still not a true escape hatch.** See "CLEAR
ALL is always ENABLED but is not always EFFECTIVE" above — it still filters on
`status !== 'idle' && status !== 'loaded'` before sending, so it can still return
`{ ok: true, cleared: 0 }` when every item wrongly reads idle. The PER-ROW hatch is now
complete; the BULK one is not, and that entry stays open.

---

**The original design note follows, retained because it records the reasoning.**

**Open, and the owner has asked for it explicitly: "the Clear buttons must enable even for
empty layers, for unknown errors and wrong occupied layers."** It is not done, and this
entry says exactly what closing it takes so the next session does not have to re-derive it.

Why it is not a flag. The row's CLEAR calls `stack.out(itemId)`, which is ITEM-scoped —
with no bound item there is nothing to address, so simply enabling the button produces a
no-op that reports success. That is the one outcome worse than a disabled control, and it
is the failure the owner's own reasoning argues against.

Why the existing channels cannot serve it:

- **`layers.clear`** refuses `'foreign'` unless the occupancy tap has a FRESH `html`
  observation, and `'owned'` for layers the bridge owns. So it is refused in the two cases
  the owner named — `unknown` occupancy (no fresh observation at all) and, depending on
  ownership bookkeeping, a declared bank layer. It would work for a wrongly-occupied row
  with a live html observation and nothing else.
- **`playoutLayers.clear`** is for the RESERVED range only, html-only, by design.

**What it needs**, and the shape that keeps every current guarantee:

1. A bridge method that sends `CLEAR <ch>-<layer>` for a layer in the DECLARED CANDIDATE
   BANK, without consulting occupancy or item status — that indifference is the whole
   point, since those are what may be wrong.
2. TWO structural guards, both config-derived so no UI state can bypass them: the layer
   must be IN the declared bank (`fixedSlots()`), and must NOT be in the reserved set. The
   reserved refusal stays absolute.
3. A `fixedLayers.clearLayer` channel, its route, the mock, and the browser client.
4. The row then routes CLEAR by binding: bound item → `stack.out` (unchanged, keeps the
   B-039 producer bookkeeping); no item → the new layer clear.

It was NOT rushed into this commit because it is a new capability on the clear path — the
one path this surface treats as on-air — and it deserves its own diff with its own
adversarial review, not a late addition to a UI pass. Nothing about it is verifiable on air
from this machine either.

### CLEAR is DISABLED on a genuinely unbound row today — the interim state, not the intent

The owner said CLEAR is always enabled, including when "the row looks empty". Implemented
as: enabled whenever an ITEM is bound, whatever its status claims, and disabled on a row
with no item at all.

The reason is the one the decision itself rests on. With no item there is nothing for
`stack.out` to address, so an enabled CLEAR would be a **no-op that reports success** —
the outcome the owner's own argument rules out, and worse than a disabled control because
it looks like it worked. `layers.clear` is no substitute: it refuses `'owned'` for our own
layers by design, and `'foreign'` without a fresh html observation, so it is refused in
exactly the cases this would need it. An unbound row the wire says is occupied is the R-009
orphan case, which already has a surfaced banner with its own confirm-gated Clear, properly
fenced (html-only, fresh observation, never the reserved range).

Flagged rather than buried: if the owner wants a layer-scoped clear reachable from the row
itself, that is a bridge capability, not a flag.

### `#` is display order, the default alias is the layer's fixed bank place — they can diverge

Owner's final resolution, after two earlier readings were superseded. They are two different
questions and they are answered separately:

- **`#` is plain DISPLAY ORDER** — 1 at the top of the rendered list, counting down.
- **the default alias is `Layer <bankPosition>`** — the layer's FIXED place in the bank,
  counting down from its highest layer, so `Layer 1` is always layer 99.

With the shipped bank (70–99 declared, the top five ticked) they read identically, because
the shown rows are the top five in order: `#1` is layer 99 which is `Layer 1`.

**They diverge if a NON-CONTIGUOUS set is ticked.** Untick 97 and the third visible row is
`#3` while still being `Layer 4`. That is the accepted cost of the stability constraint the
owner set explicitly — the alias must never renumber when rows are ticked or unticked,
because "`Layer 2` would mean different rows on different days" — and it is worth knowing
before someone reports it as a bug. There is no test on the divergence or on the
stability property yet; both are worth one when the numbered items are filed.

### The candidate bank is now 70–99, which required MOVING a dynamic allocation range

Owner decision: the bank is layers 70–99 (thirty rows) with the top five ticked. It could
not simply be configured, because the bridge refused it **twice** — and both refusals were
correct:

- `exceeds-ceiling` — `MAX_FIXED_LAYER` was 89, since design.md (e) recorded 70–89 as the
  free space.
- `overlaps-policy` — `DEFAULT_LAYER_POLICY['logo-bug']` held **90–99**, and the bank must
  be disjoint from every dynamic allocation range.

So two constants moved together: the ceiling to 99, and `logo-bug` to **40–49**, the one
unused decade. Moving the range rather than deleting it keeps dynamic allocation working
for that template type instead of quietly retiring it.

**Why they had to move together, recorded because either half alone is a trap.** Raising the
ceiling alone yields a bank the ceiling check accepts and the overlap check then refuses —
a config nobody can boot with. Moving `logo-bug` alone leaves the ceiling blocking the space
it just freed. And "fixing" the first case by weakening the overlap check would let the
bank share layers with automatic allocation, which is exactly the cross-subsystem
destruction the disjointness rules exist to prevent. `T10b` in
`tools/caspar-bridge/tests/fixed-layers-store.test.ts` now pins the pairing, asserting the
full 70–99 bank validates AND that no dynamic range overlaps 70–99.

**RE-SCOPED by the owner (2026-07-30) — this is NOT a hardware debt.** The b3 session
recorded "a hardware pass is owed" for the `logo-bug` move to 40–49. The owner has closed
it: **`logo-bug`'s dynamic range stays at 40–49**, and his reasoning is that the bank is
70–99 and **the operator picks the row**, so a template type's range no longer decides
where a logo lands. Section 6 of R-028 will make those ranges DESCRIPTIVE anyway.

So this belongs to **part C's** job, not to a hardware verification queue. Nothing about
it needs a CasparCG to confirm. The paragraph below is kept for the record of what moved
and why; treat its "hardware pass is owed" as superseded by this note.

It alters where dynamically-allocated `logo-bug` graphics land — 40–49 instead of 90–99 —
on any install that uses dynamic allocation. One test moved with it (`layer-manager.test.ts`'s pinned-slot skip pinned layer 95 and
expected an allocation at 90; both were inside the old range and neither is inside the new
one, so the assertion had stopped testing the skip — it now pins 40 and expects 41).

### The code landed as one commit

The pieces are mutually dependent — the `Panel` primitive, the shell layout, the
context, the table and the panel body all reference each other — so splitting them
would have produced intermediate commits that do not build. The DEBT.md update is its
own commit.

---

## Environment notes (this machine, not debt)

- **The saved aliases on this machine now contradict the `#` column, and the fix is one
  action in the UI.** `~/.cg-runtime/bridge-fixed-layers.json` holds explicit aliases
  written under the earlier count-up-from-the-bottom numbering — layer 70 is stored as
  `Layer 1`. After the direction flip, layer 70 is row `#4`, so that row displays `#4`
  named `Layer 1`: the exact contradiction the correction was made to remove.
  **Deliberately not rewritten** — it is the owner's stored config, and clearing names he
  may have chosen is not this session's call. To restore the intended behaviour: open
  Configure, clear the four Name fields, Apply. The placeholder then shows the correct
  default (`Layer 1` = layer 73, the top row) and the rows track the bank automatically.

- The bridge's fixed-layers bank did not exist here, which is why the panel read "No
  layers are declared". Created `~/.cg-runtime/bridge-fixed-layers.json` with channel
  1, layers 70–73, aliases `logo` / `clock` / `breaking` / `lower third`, all shown.
  Not in git by design — bridge state lives in the home directory per machine.
- The bridge runs from `dist/`; it was rebuilt (`pnpm --filter @cg/caspar-bridge
build`) before starting, and is started with `--reserved-layers 60-69`.
- A bridge from an earlier session was already holding port 5280 without a bank
  (it booted before the file existed) and was restarted to pick it up.

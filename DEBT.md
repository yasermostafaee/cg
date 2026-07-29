# DEBT.md — what fast mode on `dev` deferred

Written as work happens, never reconstructed afterwards. This file is the INPUT to
going back to normal mode: full `pnpm gate`, `openspec validate --all --strict`, the
numbered items filed in one sweep, and the owner's hand-merge of `dev` into `main`.

Do not start that reconciliation without the owner asking for it.

---

## Findings to file

### CasparCG 2.5.0 cannot load our templates at all — `CG ADD` with an http URL is refused

**This is the most important entry in this file. It is not a UI issue and it blocks
on-air use on this machine.**

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

Per the fast-mode contract, all of this was deliberately not done:

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

### The code landed as one commit

The pieces are mutually dependent — the `Panel` primitive, the shell layout, the
context, the table and the panel body all reference each other — so splitting them
would have produced intermediate commits that do not build. The DEBT.md update is its
own commit.

---

## Environment notes (this machine, not debt)

- The bridge's fixed-layers bank did not exist here, which is why the panel read "No
  layers are declared". Created `~/.cg-runtime/bridge-fixed-layers.json` with channel
  1, layers 70–73, aliases `logo` / `clock` / `breaking` / `lower third`, all shown.
  Not in git by design — bridge state lives in the home directory per machine.
- The bridge runs from `dist/`; it was rebuilt (`pnpm --filter @cg/caspar-bridge
build`) before starting, and is started with `--reserved-layers 60-69`.
- A bridge from an earlier session was already holding port 5280 without a bank
  (it booted before the file existed) and was restarted to pick it up.

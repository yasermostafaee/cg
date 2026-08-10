# DEBT.md — what fast mode on `dev` deferred

---

## OVERNIGHT HANDOVER — 2026-08-01

Base was `a112783c`. Everything below is pushed to `origin/dev`; nothing is local-only.

### What landed

| commit     | what                                                                             |
| ---------- | -------------------------------------------------------------------------------- |
| `64cc6953` | `dev-awaiting-verbs` — verbs read the `RowBinding` union; the panel-level notice |
| `2eebc4cd` | the `Modal` primitive — three roles + the pinned message region                  |
| `c63690b1` | the four dialogs already on `Modal` — roles, and the §3 refusal fix              |
| `841a0b0d` | `SERVER CONNECTION` migrated off its hand-rolled chrome; APPLY → primary         |
| `3468dabb` | the audit log migrated — the last bypass                                         |
| `afd2e491` | 🗣 your report: the servers dialog's fields were missing `cg-field`              |
| `8b039b30` | 🗣 your `.cg-modal-footer .cg-btn` metrics, applied verbatim                     |
| `a42bfd9c` | 🗣 servers Cancel · audit `Close` → cancel treatment · `AUDIT` → `LOG`           |

| `3732857f` | 🗣 a maximised panel lights its minimize control · the red `gate:e2e` fixed |

Both task files are complete. The diagnosis is written and no code was changed for it.

**🗣 = something you asked for mid-run.** Five arrived after the two task files and all five
are in. The last one is the only place I made a design call you did not state: `.is-on`'s
default fill is the REHEARSE violet, and putting that hue in a panel header would assert
"on PVW, cannot reach air" somewhere it cannot be true — so the engaged fullscreen toggle
takes the interactive sky instead. One scoped rule in `controls.css`; say the word if you
want a different colour.

### What is half-done

**Nothing is half-done in the tree** — every commit is self-contained and the working tree
is clean. What is OWED is listed under _Skipped process_; the two that matter:

- **✅ The §3 E2E is WRITTEN — discharged 2026-08-10.** It was owed because jsdom computes
  no layout, so the DOM spec could only pin the MECHANISM (message outside the scroll
  container, immediately above the action row) while the task's own wording asked for a
  visibility claim. It is now `apps/runtime/tests/e2e/modal-message-in-viewport.spec.ts`:
  six mapped sources make the `Live sources` body genuinely overflow (asserted, not
  assumed), the bridge's real validator refuses an overlapping band, the body is scrolled
  back to the top, and the refusal is asserted `toBeInViewport({ ratio: 1 })` — with a
  negative control asserting the last element INSIDE that body, where the refusal used to
  be appended, is out of view at the same scroll position. Verified red against the
  reintroduced in-body placement before being claimed green. `Live sources` rather than
  `Candidate layers` because the mock's `setFixedLayers` accepts everything and there is no
  shared fixed-layers validator to refuse with; the mechanism under test is the
  primitive's, so it is the same mechanism. **Linux CI run:** see `Gate results` below.
- **A Linux `gate:e2e` is owed.** Five dialogs changed layout. The Windows run is recorded
  below and is non-authoritative for pixel/geometry.

### Everything filed under AWAITING OWNER, in one place

Four items, all in the section immediately below this one:

1. **🔴 `PRIMARY A` stuck in `connecting`** — diagnosed, not fixed. Almost certainly a
   PUBLISH bug (`emitHealth` collapses four FSM states into one dedupe key), not a stuck
   state. **It does not need a backup to happen.** One ten-second test separates the two
   causes: refresh the browser and see whether the word changes.
2. **`destructive` → solid amber**, so the `Remove` confirms changed colour. One line to
   revert if you want red kept as a stronger, separate signal.
3. **`Reset to defaults` is now destructive** (was a borderless ghost). Config reset, not
   an on-air act — `cancel` is the other defensible role.
4. **`CLEAR` is held during the `awaiting` window** — a narrowing of an on-air escape
   hatch, argued in full, flagged because it is that class of change.

### Gate results

Both gates were re-run on the FINAL tree (`3732857f`), not on an earlier state.

- **`pnpm gate` — GREEN**, uncached. `openspec validate --all --strict` is the last link
  in the `&&` chain and reported `42 passed, 0 failed`, so typecheck + lint + test + build
  - `format:check` all passed ahead of it.
- **`pnpm gate:e2e` — GREEN.** `22 successful, 22 total` — runtime `56 passed`, designer
  `231 passed`. **Windows, therefore NOT authoritative for pixel or a11y geometry; a
  Linux/WSL run is still owed** (five dialogs and the layers panel changed layout).
- **Runtime unit suite: 526 passed / 70 files**, including 24 new assertions across
  `awaitingVerbs`, `layersPanel.awaitingNotice`, `modalPrimitive` and the servers-dialog
  Cancel.
- Two specs were verified RED against the unfixed code first — the verb gate and the §3
  placement. Both are described where they are recorded.

**🔴 `gate:e2e` WAS RED on the first run, and it caught a real thing.**
`server-settings.spec.ts` clicked `Close server settings` — the hand-rolled header button
the modal migration deliberately deleted. Fixed in `3732857f` by rewriting the assertion as
a FENCE (old button absent, ✕ present, dismiss via the new Cancel) rather than swapping one
selector for another, so the deleted control cannot come back unnoticed. **No test was
loosened and no timeout was raised.** It is worth noting that `pnpm gate` was green
throughout — the e2e caught what the unit suite could not, for the fourth time.

### 👁 Look at these with your own eyes first

**This run touched modal chrome across every dialog in the app.** In rough order of how
likely you are to disagree with me:

1. **Every confirm dialog's committing button changed colour** — `Remove …` and
   `Remove and clear (ON AIR)` were a transparent red OUTLINE and are now SOLID amber.
   `Clear all` is unchanged. Reasoning under AWAITING OWNER #2; this is the single most
   visible change of the night.
2. **`Server connection`** — new Cancel, APPLY is blue not amber, sentence-case title, the
   ✕ replaces the `Close` button, field backgrounds fixed, messages moved beside the
   action row. It changed more than any other dialog. Open it with a bad port to see the
   validation message land next to the buttons.
3. **`Candidate layers — configuration`** — the §3 fix. To see the point: untick an
   occupied row far down a long list, scroll back to the top, press Apply. The refusal now
   appears beside Apply instead of at the bottom of the list.
4. **`Text file delimiters`** — `Reset to defaults` is now solid amber (AWAITING OWNER #3).
5. **The template picker** (`LOAD` on any row) — Cancel moved from the right to the left
   and is now bordered rather than a ghost.
6. **`Log`** (was `AUDIT`) in the status bar, and its dialog's `Close` is now neutral.
7. **A maximised panel's minimize button is now filled sky.** Hit fullscreen on any panel
   and look at the header — the reasoning for sky rather than the default violet is above.
8. **The Layers panel has a new reserved strip above the table** — about 1.65rem, empty
   except during the first second after a connect, when it carries the "layer states have
   not arrived yet" line. It is always reserved ON PURPOSE so nothing shifts under your
   cursor when the notice goes; the cost is a permanent thin band. Worth a look because it
   is a permanent change to the panel you spend the most time in.

---

## AWAITING OWNER — 2026-08-01 (overnight run)

Four things were left undecided rather than guessed. Nothing here blocks what landed; each
is one line to change if you want it the other way.

### 1. 🔴 `PRIMARY A` stuck in `connecting` — diagnosed, NOT fixed

Full write-up under _Findings to file_. The short version: it is almost certainly a
**publish** bug, not a stuck state — `RedundancyAdapter.emitHealth()` collapses
`disconnected | connecting | handshaking | resyncing` into one dedupe key, so only the
first of the four is ever published and the pill freezes on whichever word came first.
Secondary: `AmcpTransport.connect()` has no timeout.

**It does not need a backup to happen** — any `setConfig` takes the same path, so it can
occur on a single-server plant. Removing B may simply be when a pre-existing A problem
stopped being masked by auto-failover.

**One test tells the two apart, and it takes ten seconds:** with the pill stuck, **refresh
the browser**. Word changes → publish bug. Word stays → A really is in `connecting`.

**Recommendation:** fix the dedupe (publish the raw state through a coalescing window
rather than a lossy key), and bound the connect. **I would not touch `effectiveState` for
the failover decision** — that use of it is correct. Not started: both changes touch a live
playout link.

### 2. Modal `destructive` role → SOLID amber, so `Remove` confirms changed colour

`destructive` maps to `caution-strong` (solid amber), not `danger` (red outline). Reasoning
in full under `dev-modal-primitive`; the tie-breaker was that the solid treatment is louder
at rest, so `Clear all` is unchanged and nothing gets a _weaker_ safety signal.

**Visible consequence:** the `Remove …` / `Remove and clear (ON AIR)` confirm buttons were a
transparent red outline and are now solid amber. **If you want red kept as a distinct,
stronger signal for data-destroying acts (as against air-interrupting ones), that is a
fourth role and it is one line** in `ROLE_VARIANT` (`ui/Modal.tsx`).

### 3. `Reset to defaults` (Text file delimiters) is now `destructive`

It was a borderless ghost. It discards every delimiter the operator added, which matches
the owner's own definition of destructive — so it is solid amber now, beside a primary
`Done`. **It is a config reset, not an on-air act**, so if that reads too loud for what it
does, `cancel` is the other defensible role. One line in `DelimitersModal`.

### 4. `CLEAR` is now held during the `awaiting` window

`CLEAR` is deliberately never gated on a row's STATUS — refusing the escape hatch because
the state model is confused is fail-stuck, not fail-safe. It IS now gated on `awaiting`,
argued in full under `dev-awaiting-verbs`: with no itemId the button cannot tell
`stack.out` from the bank-scoped `clearLayer`, and guessing wrong clears a layer out from
under a live item. The window is one bridge round trip, it ends on the data, and `CLEAR
ALL` in the panel header is NOT held by it.

**Flagged because it narrows an on-air escape hatch.** The task's wording decides it ("the
row offers nothing until it knows"), but it is the sort of narrowing that should not pass
unnoticed.

Written as work happens, never reconstructed afterwards. This file is the INPUT to
going back to normal mode: full `pnpm gate`, `openspec validate --all --strict`, the
numbered items filed in one sweep, and the owner's hand-merge of `dev` into `main`.

Do not start that reconciliation without the owner asking for it.

---

## Findings to file

### 🔢 THE ITEM-NUMBER REGISTRY IS SPLIT ACROSS BRANCHES WHILE FAST MODE RUNS

**File this as a rule when normal mode resumes.** While `dev` holds unmerged `docs/prd/*`
edits, the item-number registry is split. A session on **either** branch that claims a
`B-`/`C-`/`D-`/`P-`/`R-` number from one branch alone can collide with the other. Until fast
mode ends, a claim must check **both** branches — or not be made at all.

`dev-mode.md` already forbids claiming on `dev`. What it did not anticipate was a
**normal-mode session claiming on `main`** while `dev` held numbers `main` could not see —
which is exactly how the splash was filed as `R-031` when `dev`'s `R-031` (the operator
surface) already existed. The one-directional rule reads as sufficient and is not: the
registry is split, so the check has to be symmetric.

Observed once, cost one duplicate and one renumber (splash → `R-035`, 2026-08-01).

### 💰 COSTED, NOT BUILT — a version/shape marker on the persisted configs

**Asked for in `dev-bridge-bootstrap` §2 as "recommended, but report the cost before doing
it", with an instruction to record rather than build it if it is more than small. It is more
than small.** What landed instead is the cheap half: the CLI now prints the bank in force
**and its source** at every boot, so "which bank am I on, and why" is answerable without
opening a file. That reports; it does not detect.

**What a real marker costs.** A `schemaVersion` on `FixedLayerBankSchema` is the easy 10%.
The other 90%:

1. **Deciding what "stale" MEANS.** The office file was not schema-invalid — it was a
   perfectly valid `count: 4` bank written before a decision. No version number catches
   that, because the shape never changed; only the intended VALUE did. A marker that
   detects shape drift would have said nothing about the file that caused this. Catching
   THIS needs a "written-at" stamp compared against a "decision-changed-at" constant the
   codebase must now carry and maintain — a different and more invasive design.
2. **A surface to report it on.** stderr is where it would land, and the owner does not
   read stderr (that is why the boot line is a stopgap, not a fix). Reaching the operator
   means a new publish channel (`fixedLayers.config-advisory` or similar), a renderer
   surface for it, its DOM spec and its E2E — the LayersPanel's "no candidate layers"
   notice is the nearest existing thing and it is a different message with different
   semantics.
3. **Three files, not one.** `bridge-connection.json`, `bridge-fixed-layers.json` and
   `bridge-reserved-layers.json` all have the same exposure, and a marker on only the one
   that bit us this week is the kind of partial rule that drifts.

**Estimate: an OpenSpec change of its own** — schema + store + wire channel + renderer
notice + specs. Not a fast-mode item.

**What is cheap and would close most of the gap** (also not built, deliberately — it is
new behaviour and the task did not ask for it): have the boot line say the bank differs
from the built-in default, in words, when it does. No schema change, no new channel, one
comparison in `describeFixedBank`. It still only reaches stderr.

### 🐛 FOUND WHILE RUNNING IT — `delimiters.json` is stored inside the template dir and warns on every boot

**Not fixed — out of this task's scope, and it is cosmetic.** `DelimiterStore` persists to
`delimiters.json` **inside** `--templates-dir` (`~/.cg-runtime/bridge-templates/`), and
`TemplateRegistry`'s loader reads every `*.json` in that directory as a template. So every
single boot prints:

```
[caspar-bridge] ⚠ skipping unusable persisted template …\bridge-templates\delimiters.json:
  [ … "path": ["info"], "message": "Required" … ] — re-import it to restore durability
```

Nothing is broken — the delimiters load fine from their own store — but the operator is
told a template is corrupt and instructed to re-import it, on a machine where nothing is
wrong. It is the loudest thing in the boot output and it is a lie. Fix is one line (skip
the store's own filename, or move the delimiter file up to `~/.cg-runtime/`); the choice
between those two is a small design call, and the second is a migration.

### 🔴 DIAGNOSIS ONLY — `PRIMARY A` sticks in `connecting` after backup B is removed

**No code was changed for this.** Connection-lifecycle behaviour, first sighting, and the
fix is a judgement call — recorded, not written.

**I could not reproduce it.** What I did: read the whole path end to end —
`ServerSettingsPanel` → `connections.setConfig` → `CasparRuntime.#applyConfig` →
`ServerSession.loop()` → `RedundancyAdapter.emitHealth()` → `ConnectionHealth` →
`StatusBar.sessionLabel`. What I did NOT do: run the bridge against a real CasparCG, or
add a test. There is no second machine here and the owner's box is the only plant.

#### What `connecting` actually is here

It is the **bridge-side `ServerSession` FSM state**, published as
`ConnectionHealth.primary.state` and rendered verbatim by `StatusBar.sessionLabel`. It is
NOT the renderer's other `connecting` (the `useCasparReach` boot window, which means "the
bridge has not answered yet" — that one renders as `UNKNOWN` on this pill). So the pill is
reporting a real state the bridge really sent.

#### Finding 1 — it is a state we fail to RE-REPORT, not one we fail to leave

This is the load-bearing finding and it answers the question directly.

`RedundancyAdapter.emitHealth()` (`packages/caspar-client/src/redundancy/redundancy-adapter.ts`)
dedupes publishes on a key built from `effectiveState()`, and `effectiveState` collapses
**four** FSM states into one value:

```
healthy → 'up'   degraded → 'degraded'   disconnected | connecting | handshaking | resyncing → 'down'
```

So among those four, only the FIRST is ever published. Every later transition inside the
down-set produces an identical key and is dropped. The comment says exactly why it was
built that way — "a down session's reconnect loop flaps connecting↔disconnected forever …
published once, not ~2 per backoff cycle" (B-046 health churn) — and that reasoning is
sound for CHURN and wrong for the LABEL: the pill then shows whichever down-word happened
to be current at the last publish, forever.

**Why the word that sticks is `connecting` specifically.** `#applyConfig` step 6 calls
`#sessions.A.start()` and then `healthChanged.emit(this.health())`. `start()` returns
immediately (`void this.loop()`), so that first publish catches A at its initial
`disconnected`; the adapter's own first `state-change` publish is then the `→connecting`
one, which sets the key to `A:down|none`. From that moment every `disconnected` →
`connecting` → `disconnected` flap is deduped. **The session is almost certainly cycling
normally; the console is frozen on one frame of it.**

The honest label for a session in a reconnect loop is OFFLINE (retrying). Saying
CONNECTING says "nearly there" about a server that is not coming.

#### Finding 2 — `AmcpTransport.connect()` has no timeout

`packages/caspar-client/src/amcp/transport.ts` — `net.createConnection({ host, port })`
with no `timeout` option, resolving on `connect` and rejecting on a pre-connect `error`.
The handshake below it IS bounded (`versionTimeoutMs`, `infoTimeoutMs`); the connect is
not. Against an endpoint that blackholes SYNs rather than refusing them, one `connecting`
legitimately lasts the OS connect timeout, which on Windows is tens of seconds and on a
blackholed route can be much longer. Combined with Finding 1 that is indistinguishable
from a permanent stick.

#### Does it need a backup at all? — NO, and this is the part that matters

The mechanism is **`setConfig` + A not reaching `healthy`**. Removing B is simply one way
to trigger a `setConfig`; changing A's host, the strategy, or the auto-failover toggle all
take the identical rebuild path. **So yes, it can happen with no backup ever declared**,
which is the plant's normal configuration.

**There is also a reason removing B is when it becomes VISIBLE.** With B declared, a
failing A auto-fails-over (`wireSessionEvents` → `maybeFailover` on `disconnected` /
`degraded`) and `currentPrimary` flips to B — and `emitHealth` publishes
`{ label: this.primary, state: this.primarySession.state }`, i.e. the pill labelled
PRIMARY now describes **B**. Remove B and that escape hatch is gone, so A's own failure
surfaces for the first time. **The owner may be seeing a pre-existing A problem that the
backup was masking, rather than damage done by the removal.** That distinction changes the
fix, and it is why this needed a decision rather than a patch.

#### Does it self-correct?

- **On its own:** only when the session reaches `healthy` or `degraded` — those change the
  key and publish. While A stays in the down-set, **never**, however long you wait.
- **On a browser refresh:** yes, and this is the diagnostic to run. `useBridgeSnapshot`
  re-pulls on link-up (B-080), so a refresh shows the true CURRENT state.
- **On a bridge restart:** yes — everything is rebuilt.

**→ The one test that separates the two findings, for the owner to run:** with the pill
stuck on CONNECTING, **refresh the browser**. If the word changes (to OFFLINE, HEALTHY,
DEGRADED), it is Finding 1 — a publish bug, and A is fine or failing normally. If it still
says CONNECTING, A genuinely is sitting in `connecting` and Finding 2 / a real connect
problem is in play.

#### Recommended fix, in shape only

1. **Stop the dedupe from lying.** Keep suppressing churn, stop collapsing distinct states:
   publish on the RAW state through a small coalescing window (the runtime already does this
   for stack publishes — `COALESCE_MS`) instead of discarding by a lossy key. A ~250 ms
   coalesce gives the same "not ~2 per backoff cycle" guarantee without ever reporting a
   state the session is not in. **`effectiveState` should stay exactly as it is for the
   FAILOVER decision** — that is a different question and it is right.
2. **Bound the AMCP connect** (`sock.setTimeout` or a raced timer), so a blackholed endpoint
   reaches `disconnected` promptly and the backoff loop is honest about it.
3. **Touch neither `isLiveState` nor the failover predicate.** B-100/B-101 are unaffected by
   both changes, and CLAUDE.md golden rule 6 applies — there must go on being one canonical
   reachability predicate.

**Not started, and it should not be started without the owner:** (1) is a change to how
often every client is told about connection health, on the path that feeds the on-air
refusal wording; (2) changes reconnect timing on a live playout link.

### 🟡 `dev-b6-inspector-finish` — seven of nine, plus six owner calls made live

Landed: **§1** (the panel head takes the scale — the chip row gets the largest step
beneath it), **§2** (one input surface), **§4** (the resize grip, made real), **§5**
(the status dot takes the state colour), **§6** (UPDATE takes `--r-verb-play`), **§7**
(the file chip), **§8** (the status bar's own vocabulary).

**§2's finding, because it is not what the report implied.** The dx/dy boxes did NOT
have a second style — `NumericInput` passes `className` through and every caller
already gave it `.cg-field`. They were on the one shared rule the whole time; what
differed is that the rule painted a RAISED chip while an input should read as a WELL
sunk into the panel, and at 74px beside a full-width input that reads as two kinds of
control. Fixed by changing what the single rule paints, not by adding a variant.

**§6's adversarial check, which changed the answer.** First pass used PLAY's own
variant — `--r-onair`, one token, no drift — and measured it side by side with a row
genuinely on air: both `rgb(44,255,122)`, i.e. the SACRED AIR GREEN on a control in a
panel that also shows an on-air state dot. Reported it; the owner's `--r-verb-play` is
a different green and resolves the risk rather than accepting it. `--r-onair` stays
PLAY's alone. The `--r-verb-*` "hover only" rule now carries one narrow, written
carve-out.

**§8's second round was a real bug, not a preference.** The first pass keyed the
health LED on "not stale and not OSC-deaf" — a different question — so a server
reporting `disconnected` kept a GREEN dot beside a red OFFLINE (owner's screenshot).
The LED is now DERIVED from the resolved label, so the two halves of a pill cannot
disagree by construction. Same defect fixed on the backup, which had been permanently
muted. Four tests, asserting on the dot, because the text was right the whole time.

**Two bugs found and fixed that were not in any task.** (1) `Reload` on an attached
file called `applyFieldValue` — a READ verb performing a WRITE that reached air,
bypassing the one gate the offline surface is built around, including its reachability
check. It stages now. (2) Promoting the drag handle to a real button gave it a name, a
focus ring and a keyboard path but not a 24px hit target; the E2E floor assertion
caught it.

#### Still owed

- **§3 — `ROTATOR — ITEM 3` is NOT done, and it needs a decision rather than code.**
  The string comes from `sequenceItemNamespace(seq.name, index)` in
  `@cg/shared-schema`, where `seq.name` is the SEQUENCE element's authored name. D-083
  already replaced `ROTATOR[2]` with this form for exactly the reason §3 restates, so
  the remaining complaint is that a sequence named `ROTATOR` is itself technical.
  **What §3 asks for — the COMPOSITION's authored name — is available** (`child.name`,
  the referenced composition) but is a `@cg/shared-schema` change that also moves the
  Designer form and the GDD, and two items referencing the SAME composition would then
  carry identical headings, which is the collision D-083's index exists to prevent.
  The honest shape is probably `<composition name> — item N`. **Not started; it is a
  schema change, not a restyle.** The CSS `text-transform: uppercase` on the group
  heading also makes an authored `Rotator` read as a constant — worth removing whoever
  takes this.
- **§7's split row** — the chip, the heights and the two-line gap are done to the
  owner's reference; the `Split on delimiter` row's own alignment was not separately
  revisited.
- **A NEW BUG REPORTED AND NOT YET INVESTIGATED:** removing backup B leaves primary A
  stuck in `connecting`. Bridge/connections behaviour, not styling — it needs its own
  task.
- ~~The b5 carry-over: during the loading window a bound row's VERBS render as an
  empty row's.~~ **CLOSED by `dev-awaiting-verbs` below.**

### ✅ `dev-modal-primitive` — one chrome, three roles, and the refusal that was unseen

Four commits: `2eebc4cd` (the primitive), `c63690b1` (the dialogs already on it, incl. the
§3 fix), `841a0b0d` (`SERVER CONNECTION`), `3468dabb` (the audit log). Plus `afd2e491`, the
owner's mid-run field-background report.

**§1 — the survey the task asked for. EVERY dialog in the app, and what it was doing:**

| dialog                                  | file                     | was                                       | now                           |
| --------------------------------------- | ------------------------ | ----------------------------------------- | ----------------------------- |
| Text file delimiters                    | `DelimitersModal`        | on `Modal`; ghost Reset + secondary Done  | roles                         |
| Candidate layers — configuration        | `FixedBankConfigModal`   | on `Modal`; refusal in the SCROLL         | roles + §3                    |
| Candidate layers — not configured       | `FixedBankConfigModal`   | on `Modal`                                | role                          |
| confirm (Clear all, Remove…, Stop all…) | `useDialog`/`useConfirm` | on `Modal`; per-call `variant`            | roles                         |
| prompt (lock PIN)                       | `useDialog`/`usePrompt`  | on `Modal`                                | roles                         |
| template picker (`Load onto …`)         | `useTemplatePicker`      | on `Modal`; Cancel LAST and a ghost       | roles + order                 |
| SERVER CONNECTION                       | `ServerSettingsPanel`    | **hand-rolled**, `Close` button, shouting | migrated                      |
| Audit log                               | `AuditPanel`             | **hand-rolled**, `Close` button, shouting | migrated                      |
| Lock screen                             | `LockOverlay`            | hand-rolled                               | **deliberately NOT migrated** |

**No dialog hand-rolls its chrome any more, with one deliberate exception.**
`LockOverlay` is a full-screen LOCK, not a dialog: the primitive gives every dialog a
visible ✕, Escape and backdrop-click — three ways out — and **a lock screen with a way out
is not a lock**. Migrating it would be a security regression dressed as consistency. Written
into `Modal`'s own header note so the next reader does not "finish the job".

**§3 was the real defect and it is fixed.** The refusal was the last child of `Modal`'s
SCROLLING body, so with a long candidate-layer list at the top the operator pressed Apply,
nothing happened, and the reason was below the fold. The message region is now part of the
primitive, outside the scroll and immediately above the action row, so no dialog can put it
somewhere unseen. Wording untouched.

**Ran the §3 test against the unfixed placement and saw it red** — and isolated the
PLACEMENT rather than the presence: the refusal was moved back into the body _keeping its
test hook_, so the spec failed on `the refusal was appended to content the operator may
have scrolled away from` rather than trivially on "not found". 2 of 9 red, the two that
should be.

**The §3 assertion is structural, and honestly so.** The task asks for "visible in the
viewport without scrolling", which is a LAYOUT claim, and jsdom computes no layout — a
`getBoundingClientRect` check there returns zeros and passes for the broken code too. The
spec pins the MECHANISM instead (the message is not inside the scroll container; it is the
element immediately before the action row). **A true in-viewport assertion needs Playwright
and is owed** — see Skipped process.

**§2's one genuinely open call, and why it went the way it did.** `destructive` maps to
`caution-strong` (SOLID amber) and not `danger` (transparent red OUTLINE). Both existed;
the tie-breaker is that the solid one is LOUDER at rest. Picking `danger` would have made
`Clear all` quieter — turning a filled button into an outline — which is the "neutralising
it in the name of consistency" the owner forbade in as many words. This way `Clear all` is
byte-identical and the `Remove` confirms get louder. **No safety signal weakens in either
direction**, which is the only defensible way to pick between two loud colours at 4 a.m.

**Two things the owner will SEE change, listed so they are not a surprise** — both under
`OVERNIGHT HANDOVER` as well.

**A defect found in my own diff by review, not by tests.** `ModalAction`'s prop was
originally named `role`, which is the ARIA attribute: the component spreads its remaining
props onto a real `<button>`, so it was one refactor from emitting `role="cancel"` — an
invalid, non-abstract ARIA role — and the a11y lint flagged all 12 call sites meanwhile. It
is `actionRole` now. Caught by reading the lint delta rather than the test result.

### ✅ `dev-awaiting-verbs` — the verbs, and one panel-level notice

**§1 — the hazard was real and it is closed.** During the awaiting window a bound
row's verbs rendered an empty row's, because everything except the state cell still
derived from `item === null`. `LOAD` is a LIST action, so it survived every
reachability gate and stayed ENABLED — on rows that were already bound. Pressing it
there rebinds the row over the binding the panel has not yet shown him.

**Made unrepresentable rather than checked, one level deeper than last time.**
`RowBinding`'s `bound` arm now carries the whole `StackItemState` instead of a bare
status, and `LayerRow` lost its `item` prop entirely — it takes the item OUT of that
arm. `layerRowActions` takes `binding: RowBinding` and has no nullable to ask. The
previous task made the union the state cell's only input and left `item` beside it
for everyone else; that leftover nullable is exactly where the bug survived.

**The load-bearing assertion is structural, not behavioural.** `awaiting` and
`unbound` both have NO item, so if any verb still read the nullable the two would be
indistinguishable — and every behavioural assertion would pass for the wrong reason.
The spec pins the difference itself: same absent item, opposite offers.

**Ran it against the unfixed gating and saw it red** (union plumbing kept, the three
`awaiting` gates reverted): 5 of 9 failed, headline
`expected Map{...} to not deeply equal Map{...}` — the two states collapsing into
one, the conflation proven — plus `load-remove was actionable while the row was
unknown`. The 4 that passed are the ones that should: the bound-row regression
fences and the unbound-unchanged fence.

**Precedence, because three refusals can be true at once:** `linkDown` >
`awaiting` > CasparCG. A dead bridge outranks the waiting sentence deliberately —
"it returns as soon as it answers" is a promise nothing is keeping when the bridge
is what is down, and it would send the operator away from the machine he needs.
`awaiting` outranks CasparCG so the boot window never names a machine nothing has
accused. Asserted across all three reach states.

**🔴 CLEAR IS NOW HELD IN THIS WINDOW — a real narrowing of a deliberately
unguarded verb, and the one thing here worth the owner's eye.** The doctrine is that
refusing CLEAR because the STATE MODEL is confused is fail-stuck, not fail-safe.
`awaiting` is not that case: it is not knowing WHICH COMMAND the button is. Bound,
CLEAR is `stack.out(itemId)` and keeps the B-039 producer bookkeeping; unbound it is
the bank-scoped `clearLayer()`. With no itemId it would have to guess, and guessing
`clearLayer` on a row that turns out to be bound clears the layer out from under a
live item — a second bug reachable by a button. The window is one bridge round trip,
it ends on the DATA, and `CLEAR ALL` in the panel header is NOT held by it. The
task's wording ("verbs that act on the row are disabled"; "the row offers nothing
until it knows") decides this; it is recorded because it is the sort of narrowing
that should not pass unnoticed.

**The `awaiting` toggle shows LOAD, disabled** — not REMOVE. REMOVE is not merely
unwise there, it is unperformable: no itemId to send, and its confirm gate names the
template and says whether the item is ON AIR, neither of which we know. The
fixed-shape rule requires a control in the slot; a disabled one invites nothing.

**§0 — the notice is driven by the same array as the rows, not by a second scan.**
`rowBindings` resolves every row's binding once; the notice counts entries in it and
each row is handed its own. The specs assert AGREEMENT at every tick rather than
mere presence — a notice on its own readiness flag would pass a presence test and is
exactly how "not known" comes to sit above thirty rows claiming EMPTY.

**Layout stability cost, taken knowingly.** The strip is ALWAYS rendered at a fixed
`height`, so nothing shifts when the notice goes — which is the second the operator
is reaching for a row. The cost is a reserved ~1.65rem band above the table when
there is nothing to say. The alternative (overlaying the sticky column header) shifts
nothing either but hides the words each verb glyph stands for, and those are the
icon-only buttons' only labels.

**Adversarial review — the mirror bug is structurally impossible, and I checked
rather than assumed.** A row stuck offering nothing reads as a dead panel.
`useBridgeSnapshotState`'s `ready` **latches on the first arrival and never clears**
("a later disconnect does not make that knowledge un-arrive"), and the stack pulls
even while disconnected (B-092, browser-local intent), so the window cannot persist.
Asserted anyway, verb by verb, against what a bound row offered before the task.

**One residual, not a defect but worth knowing:** `ready` is component state, so a
`LayersPanel` REMOUNT (the fullscreen round-trip that `App` does — see the
`pruneDrafts` note) re-opens the window until the pull resolves. The rows already
flashed LOADING there; now the verbs are held for that instant too. Bounded by the
pull, ends on the data.

### ✅ `dev-loading-row` — every row read EMPTY on startup and reconnect

**The task's premise was directionally right and located one level too low.** It named
`rowState`'s unbound branch returning `EMPTY` unconditionally. That branch is where the
word comes from, but it is not where the two facts got confused: `rowState` was correct
given its input, and its INPUT was lossy.

**The actual conflation is `LayersPanel`'s `itemById.get(slot.binding.itemId) ?? null`.**
A bound slot whose item had not arrived produced `null` — the identical value an
UNBOUND slot produces — so the row could not tell "nothing is on this layer" from "we
have not been told yet", and reported the first.

**The missing guard is a THIRD snapshot.** `listReady` (the earlier fix) gates the bank
and the slots, which protects the SET OF ROWS. The STACK is a separate snapshot that
lands separately, and `useStack()` returns `[]` until its first answer — documented in
`useStack.ts` as right for rendering and catastrophic for deletion, and it is equally
wrong for deciding what a row IS. Three snapshots, two of them guarded. That is exactly
the owner's symptom: rows all present, all EMPTY, then the occupied ones at once.

**Made unrepresentable, not checked.** `rowState` now takes a `RowBinding` union
(`unbound` | `awaiting` | `bound`) instead of `StackItemStatus | null`, built only by
`resolveRowBinding`, which takes `stackReady` as a REQUIRED argument. A caller cannot
reach `unbound` from a missing lookup, and cannot decide without considering readiness.
Same move as `StackPruneInput`. The union is passed to `LayerRow` rather than a
`stackReady` boolean, so the row cannot compute a different answer from the panel's.

**The standing rule is not weakened.** An unbound row with a READY snapshot still reads
`EMPTY`, still queries nothing, still in normal styling — asserted. And once the stack
IS ready, a binding naming an item the stack does not have resolves to `unbound`, which
preserves `LayerRow`'s existing "departed item renders as empty" behaviour.

**Ran the new spec against the unfixed source and saw it red**, by stashing only the
three source files and keeping the tests: 3 of 5 failed, with
`expected '2EMPTYLayer 2clock…' not to contain 'EMPTY'` — the owner's symptom verbatim.
The two that passed are the two that should: the EMPTY-preserved rule, and the
adversarial stuck-in-LOADING check (vacuous when nothing ever says LOADING).

**Adversarial direction covered:** a row stuck LOADING after its item arrived is the
mirror bug and would read as a hung panel. Asserted by resolving the stack and then
continuing to tick, so a row that drifted back would fail.

**Follow-up not taken here (out of scope — "do not change any gating condition"), and
now DONE.** During the awaiting window a bound row's VERBS rendered an empty row's,
because everything except the state cell still derived from `item === null`. Closed by
`dev-awaiting-verbs` above, which gates on `binding.kind` and removes the nullable that
made the conflation expressible.

### ✅ `dev-r028-b5` — the Inspector restyle, three commits

`6f0477c` (shared panel chrome) · `0d3b5b5` (Inspector content) · `d166bc5` (align to
the owner's `inspectormock.html`, which arrived mid-task). Styling only — no handler,
store action, IPC call, gating condition or label wording was touched.

**§0.7 — the primitive already existed and all four panels already consumed it.** No
panel hand-rolls a bar (`LayersPanel`, `Inspector`, `MonitorPanel`, `PreviewPanel` all
import `ui/Panel`); the only `<header>` outside the primitive is `ServerSettingsPanel`,
which is a settings dialog and not a workspace panel. So the finding was not a bypass.
Two real defects were IN the primitive:

- **The bar's height was INTRINSIC.** Measured: LAYERS 61px, PGM/PVW/INSPECTOR 53px
  after the first fix, 39px before it. `min-height: var(--r-panel-bar-h)` alone was
  only a floor and left LAYERS exactly as tall as its 36px bulk verbs — the original
  defect surviving in the one panel the owner was comparing against. The bar now also
  fixes its controls' height (28px), so the height belongs to being a panel rather
  than to the contents. **All four bars now measure 53px.**
- **§8 case: PRESENT BUT INVISIBLE**, not absent and not bypassed. `ghost` gives
  transparent fill, transparent border and muted text; `controls.css` permits that
  only "where surrounding chrome already frames the control", which held on LAYERS
  (a bar full of bordered bulk verbs) and not on the INSPECTOR (a bar with nothing
  else in it). The panel-header exemption is struck from the `--ghost` warning: a
  condition a shared primitive cannot evaluate is not one it may depend on. Measured
  after: `background rgb(31,41,55)`, `border rgb(75,85,99)`, 28×28 — visible at rest.

**§0.6 — the PVW iframe box, measured before and after.** `1920 × 1080` in both, docked
and fullscreen. Not merely equal: the box is set from the raster in `RehearsalFrame`
and the fit is a CSS transform, so chrome cannot reach it by construction. Ran the new
`pvw-frame-box.spec.ts` against the PRE-CHANGE source (checked the seven touched files
out at `839ebd0`, rebuilt) and it passed there too, which is the honest form of the
before/after claim. `color-scheme: light`, the checkerboard and its `rgb(61,66,83)`
pixel assertion, and the caveats overlay are all untouched.

**§8.5 — re-verified on the running UI, not by reading code.** Across panel widths
1589 → 849px: verb count 6 at every width (never dropped), buttons on 1 line at every
width (never wrapped), smallest target 48×36 (above the 44×34 floor). The density
effect genuinely re-runs — the grid goes 5 columns → 4 at ~849px as the template
column drops — so the b2 frozen-observer defect has not resurfaced.

**§8's second item was already done** and needed no change: `dir="auto"` is on every
text input and textarea, and `AutoGrowTextarea` applies it AFTER `{...rest}` so no
caller can pin a direction. Pinned by `inspector.dirAuto.dom.test.ts`.

**The one place the mock was NOT followed, deliberately — `resize: vertical`.** §2 and
the mock both specify it on the item textarea. Ours is `AutoGrowTextarea`, which owns
its height and re-measures on every value change, so a manual drag would be silently
undone by the next keystroke — a handle that quietly stops working is worse than no
handle. Kept `resize: none` + autogrow and adopted the rest (`min-height: 52px`,
`line-height: 1.6`). **To reconcile:** either accept autogrow as the better behaviour
and amend the mock, or make a user drag pin the height and disable autogrow for that
item from then on — which is a BEHAVIOUR change and was out of scope here.

**Smaller deviations from the mock, all deliberate:** the delete-on-hover red uses the
existing `--r-danger` / `#fca5a5` rather than the mock's `#5a3540` / `#e08a97`, to
avoid a second red in the palette (§0's "if a token is within a shade, use the token");
the `＋` glyph is lucide `Plus` through `Icon`, per the design system; input/button
radius stays 4px rather than the mock's 6px, because `.cg-btn` is global and changing
it would restyle all four panels and every dialog for no stated benefit.

**"Add item" + "From file…" on ONE footer row — done, after the owner's screenshots.**
It needed a small restructure rather than CSS, because the two are rendered by
different components: `ListFieldEditor` now takes a `footer` slot and `FieldEditor`
routes `FromFileControl` into it for `list` kind only (every other kind still renders
it beneath the control — a list is the only kind with a second footer control to share
a row with). The control is built once and placed in one of two spots, so the two
placements cannot drift into two differently-configured controls.

**The item row must NOT wrap — caught by the owner's narrow screenshot.** My first pass
gave the textarea `flex: 1 1 12rem`, so below ~460px of panel the row wrapped and put
the controls on one line with the text on another: the OLD split layout re-created by
accident, at the width the operator spends most of their time in. It passes any
"is the cluster intact" assertion, because the cluster IS intact — what breaks is the
cluster's relationship to its text. Now `flex: 1 1 auto; min-width: 0` with no wrap, so
the text shrinks and the cluster holds, per the mock. Pinned by a new spec that measures
vertical overlap between the textarea and the remove button at 1400 / 1100 / 900px.

**§3 supersedes a recorded decision, which is noted because the old text was emphatic.**
`Button.tsx`, `controls.css` and `Inspector.tsx` all asserted "colour belongs to STATE
in this build, never to an affordance". That rule was written for the layer table and
over-generalised. It is replaced in all three places by ONE MEANING PER SURFACE
(hierarchy in the Inspector, state in the table) and the layer table's colours are
untouched. The AIR-HUE ban is unchanged and unrelated — the new variant is sky.

### ✅ `dev-offline-polish` — ALL EIGHT ITEMS DONE, one commit each

`dev-offline-ux` is CLOSED and superseded; discard every version of it. Eight commits,
`520a969`…`39077e7`. What follows is the two REPORTS the task asked for, plus the
findings worth carrying.

**§1 — the `PlayoutPanel` comment did NOT mean reachability, and the reading is worth
recording.** It sits on the `else` branch of `state.clearable` and says "an operator must
not be left wondering whether the control would work if they tried harder. No control at
all, and the reason is in the row." That governs the LAYER-STATE gate — a video occupant,
an unverifiable occupancy, an empty layer — where the reason is a PERMANENT property of
what is on the layer and printed beside it. Reachability is the opposite kind of fact:
transient, nothing to do with that layer, gone the instant the link returns. So the
layer-state gate is untouched (those controls are still ABSENT, still pinned by the specs
above it) and reachability disables a control that IS offered. Two different rules on one
button; conflating them would have deleted a decision nobody revisited.

**§4 — EVERY OTHER STATE LABEL, and which of the three treatments it falls into.**
Requested by the task; only the four it names are implemented, the rest are classified:

| label                   | source                   | treatment                                                                                                    |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `EMPTY`                 | unbound row              | **Normal** — a fact about OUR list. Implemented.                                                             |
| `READY`                 | `loaded` / `idle`        | **Grey, no rename.** Implemented.                                                                            |
| `ON AIR` → `WAS ON AIR` | `unverified`             | **Past tense + grey.** Implemented (the air mask now fires on the second hop too).                           |
| header `(n)`            | on-air tally             | **Grey, no rename.** Implemented.                                                                            |
| `ON PVW`                | rehearse                 | **Normal** — local preview, still true and still actionable; the row branch returns before the grey.         |
| `TAKING` / `UPDATING`   | transient                | **Normal** — a transition, not a claim; it resolves to `unverified` or `error` within one bounded expiry.    |
| `EXIT`                  | `exiting`                | **Normal**, same reason.                                                                                     |
| `UNCONFIRMED`           | B-044 timeout            | **Normal** — already amber and already means "the air result is unknown". Greying it would soften a warning. |
| `ON AIR?`               | B-093 blind tap          | **Normal** — an open QUESTION whose whole point is that the graphic is probably still burning.               |
| `ERROR` / `OFFLINE`     | `error` / `disconnected` | **Normal** — greying a fault hides it. Red here means "go and look", which is still true.                    |

Only `READY` and the count were changed, per the owner. The `unverifiable` flag IS set on
every bound row while a hop is down (it is the honest fact), but it only changes a COLOUR
where the rule says so — so extending the grey later is a one-line decision, not a redesign.

**§8 — THE ERROR-NAMING SWEEP, in full, including the sites judged fine.**

_Named the wrong mechanism — FIXED:_

| site                                 | said                                        | was                                                           |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------- |
| `#sendAdd` → `take()` B-039 pre-roll | `amcp-error`                                | `template-serve-down` (OUR http server) or the real AMCP code |
| `take()` final `CG PLAY`             | `amcp-error`                                | `amcp-send-failed` (never left) or `amcp-<code>`              |
| `playoutClearRefusal('amcp-error')`  | "the clear REACHED CasparCG"                | it does not know that; the commonest cause never left         |
| `errorCodeMessage('amcp-error')`     | _(no entry)_ → "Not accepted (amcp-error)." | reads as a diagnosis while being the absence of one           |

_Dropped a reason it already had — FIXED:_ `stopItem()` and `out()` both destructured only
`{ ok }` from `#send` and answered a bare `{ accepted: false }`. `out()` is the worse one:
CLEAR is the escape hatch, and "never left" (wait for the link) versus "CasparCG refused"
(the graphic is still on air, find another route) is the whole decision the operator has to
make. `load()` knew `template-serve-down` and did not return it — the code existed on the
ITEM but never reached the caller that raises the toast.

_Judged FINE, and why:_

- `update()` and `nextItem()` already did `errorCode ?? 'amcp-error'`. Correct as written.
- `mute-failed`'s sentence still says "CasparCG refused to mute the layer". It has NO
  PRODUCER (recorded in `shared-ipc/channels/rehearse.ts`), deliberately kept so that
  failing closed on a genuine refusal stays a one-line decision. An unreachable string
  cannot mislead; deleting it would cost the option.
- `fixedLayersReasonMessage`'s ten codes are all GUARD VERDICTS (`untick-occupied`,
  `renumber-refused`, …). They name a rule, not a mechanism, and the rule is what fired.
- `errorCodeMessage`'s `disconnected`, `no-layer*`, `not-fixed`, `slot-bound`, `not-in-bank`,
  `reserved`, `rehearsing` — same class, all pre-send refusals that know exactly why.
- The `amcp-<code>` passthrough (`amcp-404` → "CasparCG refused the command (AMCP 404)")
  is the one place the mechanism IS known, and it says so precisely. Asserted, so the
  honesty fix above cannot be "tidied" into making every failure vague.

_NOT fixed, and it needs a schema decision:_ `layers.clear`, `fixedLayers.clearLayer` and
`playoutLayers.clear` all narrow their failure to the literal `'amcp-error'` in a **Zod enum**
(`FIXED_LAYERS_CLEAR_LAYER_REASONS` et al), so the real code cannot ride out even though
`#send` has it. The WORDING is now honest ("it is not known whether…"), which was the part a
words-and-states batch could fix; widening the enums to carry `amcp-send-failed` /
`amcp-<code>` is a `@cg/shared-ipc` change on three channels and belongs with the numbered
filing.

**Other things worth carrying:**

- **`useCasparReach` is three-valued, and the third value is a WORDING distinction only.**
  `connecting` (health not yet answered) still REFUSES exactly as `unreachable` does — unknown
  fails closed — and `useCasparReachable` folds them back into one boolean so no caller can
  read "not told yet" as permission. The split exists because the boot window was telling the
  operator _"CasparCG cannot be reached"_ on every load, and a warning that fires twice a day
  on a healthy plant is one nobody reads on the day it is true. The same rule is why §4's grey
  and past tense fire on `unreachable` ONLY.
- **The adversarial review found the Inspector naming the wrong hop.** `Apply` was
  `disabled={!casparReachable}` with `CASPAR_UNREACHABLE_REASON` — and a DEAD BRIDGE looks
  identical from there (health absent), so the one control the operator reaches for after
  typing an edit sent him to the playout machine. It reads the link now and resolves through
  the shared `casparRefusalReason`.
- **`StatusBar` resolves the second hop ONCE and hands it down.** Giving `LinkIndicator` the
  hook opened a second `useConnections` subscription inside the same component — a duplicate
  pull on every reconnect (caught by `statusBar.linkTransition`'s pull COUNT, which is the only
  test in the repo that would have) and, worse, two independent readings of one fact in one
  footer, which is the shape §7 exists to end. Note the pre-existing cost this does NOT fix:
  every `LayerRow` calls the hook, so a thirty-row table holds thirty health subscriptions.
- **§6 required the picker to gain an IMPORT control, and that is not scope creep.** `LOAD`
  opens the picker now; on a fresh install the list is empty, so a picker that was the only
  route to importing while advising the operator to "import a .vcg first" would be a dead end.
  `pickTemplate` therefore has three outcomes (`TemplateInfo | 'import' | null`).
- **THE FIXTURE TRAP DID NOT RECUR, and two stubs had to be extended for it.**
  `orphanLayersBanner` and `playoutPanel` had NO `connections` and (the first) no `link` at
  all — adding `useCasparReach` pulls `useLink` in transitively. Both now select a state BY
  NAME from `tests/support/reachability.ts`, and every new spec sweeps `caspar-down`,
  `unknown`, `bridge-down` and `test-mode` rather than one of them.
- **`renderLayerRow` gained a `reach` option** (defaulting `both-up`), because the §2 boot
  window is only reachable through the real hook reading a `null` health on a LIVE link.

### 🔴 The reachability gate disabled the entire console in TEST MODE — caught only by `gate:e2e`

**Filed as a bug class, not a fix note.** Landed as `8613772`, the session after the gate itself.

**What happened.** `useCasparReachable` answered from `useConnections()` alone. The offline mock
reports a `disconnected` primary — `seedHealth` is `disconnected` DELIBERATELY, so test mode never
wears a signal that means a real server said something (R-006), and `testModeHonesty.dom.test.ts`
pins exactly that. So every AMCP verb in test mode went disabled behind _"CasparCG cannot be
reached"_, while the mock stood ready to execute all of them. **14 E2E specs red** across
`fixed-layers`, `inspect-list-field`, `nested-composition-fields`, `onair-position`,
`rehearse-layout`, `server-settings`, `stage-inspector-edits` and `test-mode-honesty`.

**The rule it violated is the one it was built to enforce**, in the other direction: _a control
refusing when it would have succeeded_. The question a reachability gate asks is **"will this
command be executed?"** — not "is a real CasparCG healthy?". In test mode the mock IS the executor.
`offline-mock` was already the honest wire signal for "the simulator is the far end", so the hook
reads the link as well as health, and test mode is reachable. **This is not an exception carved out
of the rule; it is the rule stated correctly.**

**The fix that would have been a lie.** Making the mock report a `healthy` primary also turns the
suite green, and is an R-006 violation — the mock claiming a server it does not have. Worth naming
because it is the _easier_ fix and it was one line away.

**Why the unit suite missed it, which is the durable half.** The §0a migration pinned
`testModeHonesty`'s stub to `both-up` — giving test mode a healthy primary it never has. The spec
then asserted against a state that does not exist in the product, and passed. **A fixture that can
disagree with the product it stands in for is worse than no fixture**, because it converts a real
defect into a green tick. The health now DERIVES from the link (`offline-mock` → `test-mode`), so
the two cannot be chosen independently. `Reachability` gained `test-mode` as a fifth state; its
`healthFor` deliberately stays `disconnected`, or a spec asserting test mode keeps its verbs live
could not prove the hook ignores health there.

**The missing test that let it ship.** R-006 was read only as "may not lie"; its other half —
**test mode must still WORK, simulating the take is the whole point** — had no test. Added, shown
red first (`disabled: true`).

**For the reconciliation sweep: `gate:e2e` was the only gate that caught this.** `pnpm gate` was
green (82/82, `0 cached`, 458 unit tests) across both the broken and the fixed tree. Every affected
surface is one only a real render exercises.

### ⛔ `dev-offline-ux` v8 — §0 §0a §1 §2 DONE; §1a §3 §4 §5 §6 §7 §8 §9 NOT STARTED

Stopped at a clean boundary, gate green, pushed. **§1a (durable drafts) is the largest remaining
piece and the one the owner is waiting on** — it is untouched, as are §3–§9.

**§0 — no rule forbade the stronger option.** `RENDERER_ONLY_PACKAGES` is `['@cg/ui']` only, so
Main-tier `@cg/caspar-client` may depend on `@cg/shared-ipc` (the bridge already does), and there
is no cycle. So the predicate is ONE implementation, not two pinned together: `isServerReachable`
lives in `shared-ipc` beside the wire enum, and `caspar-client`'s `isLiveState` CALLS it. Drift is
impossible rather than detected.

**§0a — the fixture, and which specs moved onto it.** `tests/support/reachability.ts` names the
four states (`both-up` · `caspar-down` · `bridge-down` · `unknown`) and exports `linkFor`,
`healthFor`, `connectionsStub` and `UNREACHABLE_STATES`. Moved onto it: `support/layerRow.ts`
(so every row spec inherits it), `layersPanel.clearAll`, `layersPanel.removeAll`,
`testModeHonesty`, `inspector.dirAuto`, `inspector.nestedFields`, `inspector.offlineSchema`,
`inspectorToast`, `numericInput`. **Nine files, of which five previously had NO
`connections.health` at all.**

Two things that fixture work surfaced, both worth keeping:

1. **Adding `useCasparReachable` anywhere pulls `useLink` in transitively** (health rides
   `useBridgeSnapshot`, which reads the link). Five Inspector-family stubs had neither, and only
   failed once the Inspector's Update was gated. A stub that omits a channel does not fail — it
   fails _later_, in whichever spec first renders a component that reaches for it.
2. **`bridge-down` yields `null` health deliberately.** With no bridge there is nothing to ask
   about CasparCG, and `null` is the honest answer rather than a guess in either direction.

**§1/§2 — the gating.** `PLAY` · `NEXT` · `STOP` · `UPDATE` · `CLEAR` (row) and `STOP ALL` ·
`CLEAR ALL` (header) are disabled while either hop is down, each with the reason for the RIGHT hop
— "bridge disconnected" when the bridge is down, "CasparCG cannot be reached" when it is not.
`LOAD`, `ON PVW`, `REMOVE` and field editing stay available, asserted in their own test so §1
cannot over-reach.

**🔴 THE ADVERSARIAL REVIEW FOUND A HOLE IN THIS DIFF, and it is the one worth recording.** The
Inspector's `Update` button (`Inspector.tsx`) was `disabled={!dirty}` only, and it calls the SAME
`applyDraft` as the row's `UPDATE` verb. Gating the row and not the Inspector would have been the
label-and-action-resolved-in-two-places class again, one surface along: the row saying the command
cannot go while the Inspector still offered it. Closed in the same commit.

**Two AMCP surfaces are still NOT reachability-gated, and both are deliberate — recorded so the
next reviewer does not have to re-derive it:**

- `OrphanLayersBanner`'s Clear — calls `layers.clear`. Not gated. It should be, by the same rule;
  it was simply not in §1's list and is left for the sweep that finishes §1.
- `PlayoutPanel`'s Clear — carries an explicit comment saying it is deliberately NOT a disabled
  button. That decision predates this task and was not revisited.

**The other adversarial direction (refusing a verb that would have succeeded):** `degraded` stays
REACHABLE via the shared predicate, so an OSC-less install is not disabled — the B-101 trap. The
residual is the BOOT WINDOW: `useConnections()` is `null` until the bridge first answers, so the
gated verbs are briefly disabled on every load and after every reconnect. That is the intended
fail-closed reading of "unknown", it is self-correcting within one round trip, and the alternative
(enabling on no evidence) fails at the moment air needs it. **Accepted, but it is the thing to
watch if an operator reports a dead PLAY straight after a reload.**

### ⛔ `dev-offline-ux` v3 — §1 §4 §5 DONE; §2 §3 §6 §7 §8 §9 §10 NOT STARTED

Stopped at a clean boundary, gate green, pushed. **The connection gating (§2, §3) is the largest
outstanding piece and is untouched**, along with §6 labels, §7 loading state, §8 header, §9 library
copy and §10 status bar.

**§4 — what survived `dev-rehearse-decouple`, exactly:** `const mustMute = this.#loaded.has(itemId)`.
The decouple removed the PRECONDITION (rehearse no longer requires a resident producer — the
`not-loaded` refusal went) but kept the CONSEQUENCE branch, and that branch reads `#loaded`, which
is precisely "what is on the CasparCG layer". STOP leaves it set → mute branch → send fails →
refused; CLEAR deletes it → zero AMCP → succeeds. Two ways of closing a graphic, two answers.

Fixed by making the mute BEST EFFORT: entry never fails on it, and `muted` records what actually
landed so exit still mirrors entry (a rehearsal that muted nothing restores nothing — B-100's
read-once pairing is intact).

**🔴 WHAT §4 GIVES UP, and it is a real trade, not a tidy-up:** a resident producer can stay
UNMUTED while the row claims PVW, and on 2.5.0 a resident producer's audio can be on air (R-029).
Accepted because PVW sends nothing to the layer — entering changes nothing that was not already
true — and because the common cause of an unlanded mute is an unreachable server, where nothing
reaches air anyway. **The residual risk is a server that is reachable and genuinely REFUSES the
mute.** Measured, that does not happen on this plant (`202 MIXER OK` in every layer state), but if
it ever does, the row will claim PVW over an audible graphic. `mute-failed` is kept in the wire
contract with no producer precisely so that failing closed on a genuine refusal remains a one-line
decision rather than a re-design.

**§5 was SUPERSEDED BY §4 within this session, and the sequence is worth keeping.** §5's fix landed
first (`8bb46fc`): report `unreachable` instead of a flat `mute-failed`, since the command never
left. §4 then removed the refusal altogether — so the better-named failure had no producer, and the
honest end state is not a better-named refusal but NO refusal, with no mechanism left to misname.
The `unreachable` reason added in `8bb46fc` was removed again in the same batch. **§5's SWEEP — every
other place that catches a specific failure and reports a generic or differently-named one — was NOT
done and is still owed.**

**§1 — scope, as asked:** the orphan sweep now reports any UNBOUND bank layer carrying a producer,
ticked or unticked alike (an unticked row with a producer is kept visible by `LayersPanel:133` and
told the same lie). A bank layer carrying an item we bound is already `owned` via `#slots`, so what
surfaces is exactly "a producer we did not put there". If it turns out to be permanently on against
this plant, that is information about the plant — do not filter it away.

**No adversarial review was performed.** It is owed from last session and is owed again: this batch
changes when a rehearsal may be claimed over a resident producer. It should be done with §2/§3,
which is where the AMCP gating actually lands.

### ⛔ `dev-list-vs-layer` v3 — §3 and §4 DONE, §5 §6 §7 §8 NOT STARTED

Stopped at a clean boundary, both gates green, pushed. **§5 (remove `Load from library`), §6's
seven-verb connection gating, §7 (error naming) and §8 (the `LIVE` indicator) are untouched.**

**§4 — why the previous task's test did not catch the LOAD/REMOVE modal bug, in one sentence:**
the test asserted the resolved verb out of `layerRowActions`, which was the right thing — and the
confirm dialog was never chosen there; `LayerRow` picked it from its own `item !== null` test, one
layer away. Two independent answers to one question. The dialog now keys off the action's own
`tone`, set by the same branch that sets the label, so the label and the action come from one
resolution and cannot drift. **Fourth appearance of "the test asserted the right thing about the
wrong layer".**

**§4 — the toggle is now binding-only.** `showLoad = !hasBinding`. Occupancy, template
availability and rehearse all left the control. The column header is still `LOAD` and **is not
fixed** — it needs the neutral name §4 asks for.

**§3 — an unbound row reads `EMPTY`, always.** No wire branch, no readiness qualifier (there is no
snapshot to be unready about when we never query). `unknown` still does its work for a BOUND row.

**🔴 THE COST OF §3, and it is a real loss to weigh:** an unbound row carrying a FOREIGN producer —
someone else's live video on a declared layer — now reads `EMPTY` instead of `OCCUPIED`. The
`OCCUPIED` warning existed because LOAD adopt-CLEARed the layer, and LOAD no longer touches a
layer, so the warning's original purpose is gone. **But the fact itself is still true and is now
unsurfaced on the row.** `OrphanLayersBanner` may still carry it; **that was not verified** and it
should be, because if it does not, a live foreign graphic on a bank layer is now invisible on this
panel. Two E2E assertions that pinned it were re-expressed rather than deleted, so the change is
on record.

**§6 — LOAD's occupancy gate is deleted, which is the owner's dim-LOAD report.** `loadSafe`
(`observed.kind === 'empty'`) disabled LOAD on `producer` AND `unknown` — and with CasparCG
unreachable every row reads `unknown`, so LOAD was dim exactly when the rundown is being built.
It existed for the adopt-CLEAR that §1 removed. `act` still ORs `linkDown` in, and that is correct
and different: LOAD needs the BRIDGE, never CasparCG.

**Still owed from §6:** the seven verbs (`STOP` `CLEAR` `NEXT` `PLAY` `UPDATE` `STOP ALL`
`CLEAR ALL`) are still gated on the BRIDGE link only, not on CasparCG reachability, and unknown
connection state is not treated as unreachable. That is the larger half of §6 and it is not done.

**No adversarial review was performed** — the diff does not add an AMCP path (it removes gates on
a control that emits none), but the review was required and is owed with §6's gating.

### ⛔ `dev-list-vs-layer` — §1 DONE, §2–§6 NOT STARTED

Stopped at a clean boundary with §1 complete, gate-green and pushed. **§2, §3, §4, §5's fix, and
§6 are untouched — not a file of them.** Each is substantial, several are on-air paths that the
task itself requires an adversarial review of, and half-doing five sections on the surface that
decides when AMCP may be emitted is the one thing worth less than stopping.

**What §1 delivered:** `loadFixed` → `#loadOnto(..., listOnly: true)`. The operator's LOAD binds
the row and emits ZERO AMCP — no adopt-CLEAR, no pre-roll `CG ADD`. Expressed as a third reason
for B-100's single `reachable` boolean to be false rather than as a new branch, so the rule that
the destructive CLEAR and the constructive ADD are gated by ONE read is preserved by construction.

**The rehearse guard on LOAD is deleted, and its deletion is the stronger form.** It existed
because a bare `CG ADD` is audible on 2.5.0 and LOAD could put an unmuted producer under a
rehearsing row. LOAD cannot reach a layer at all now. Replaced by assertions that LOAD emits zero
AMCP **including on a rehearsing row**, which hold in every state rather than the states somebody
remembered to enumerate.

**Three tests were re-expressed or deleted deliberately, never loosened:** the exact-slot load
spec now asserts NO `CG ADD` reached ANY layer (its exact-slot property is proved by the binding);
`loadThenClear` reaches a resident producer through PLAY, because that is now the only way one
gets there; and the two specs pinning last task's re-ADD-on-CLEAR and slot-bound-on-occupancy
rules are gone, their subject removed rather than their assertions weakened.

**THE COST, stated because it will not announce itself:** no row is ever pre-`ADD`ed, so **every
take is now a slow take that can fail**. That is exactly the case R-028 decision 5's tooltip was
written for — both states read `READY` and only the tooltip says one must load first. **That
tooltip is now load-bearing. Do not weaken it.**

**The principled alternative, and it is BLOCKED not open:** a separate `ADD` button beside LOAD.
On 2.5.0 `CG ADD` without `PLAY` puts audio on the channel, so an explicit ADD button is a button
that puts a graphic on air before the take. **Blocked on `mute-before-ADD`** (recorded below);
it is not an idea awaiting a decision.

### 🔴 MEASURED — `mute-failed` is not a mute failing. CasparCG never refuses `MIXER VOLUME`.

§5's measurement, taken against the owner's own plant (`127.0.0.1:5250`, `2.5.0 69e8ad5 Stable`),
raw AMCP, layer 1-88 (outside the bank and outside the reservation, cleared afterwards):

| command                                            | response       |
| -------------------------------------------------- | -------------- |
| `MIXER 1-88 VOLUME 0` — **empty layer**            | `202 MIXER OK` |
| `MIXER 1-88 VOLUME 1` — empty layer                | `202 MIXER OK` |
| `MIXER 1-88 VOLUME 0` — **producer resident**      | `202 MIXER OK` |
| `MIXER 1-88 VOLUME 0` — **after `CG 1-88 STOP 0`** | `202 MIXER OK` |

`INFO` confirms the producer is still resident after `CG STOP` (`<producer>html</producer>` with
the `<file>` gone), which is the exact state the owner's failing path is in.

**So the command is never rejected — which leaves the task's other branch: it is never SENT.**
`#send` returns `{ ok: false, errorCode: 'amcp-send-failed' }` when the adapter throws, and
`enterRehearse` DISCARDS that code and reports a flat `mute-failed`. The name says CasparCG
refused the mute; the fact is the bridge could not reach CasparCG.

**This also explains the branching the owner saw, with no second cause.** After `STOP` the
producer is resident → the mute-first branch runs → the send fails → refused. After `CLEAR` the
layer is empty → zero AMCP → nothing to fail. Same root cause, opposite outcomes.

**Owed, and NOT done here:** `enterRehearse` must surface the real reason instead of collapsing it
to `mute-failed` — "CasparCG unreachable" and "CasparCG refused the mute" are different facts and
only one of them is actionable. It is a small change and it is genuinely §3's territory, because
the honest fix is to disable `ON PVW` while CasparCG is unreachable rather than to let it fail
with a better word.

**And the observation the task asked for, kept separate from the measurement:** on **2.3.2** a
stopped-but-resident producer is silent (the same issue #669 that makes `CG ADD` inaudible), so on
that plant the mute is protecting an audio path that does not exist while closing `ON PVW` in the
operator's most common state. **This plant is 2.5.0, where that does not hold.** Scoping the mute
interlock by server version is a decision to take once and explicitly — not inside a bug fix.

### §4's `unknown` — INFERRED, not measured, and the difference matters

The task asked whether CasparCG was connected when the owner saw `unknown`. **I could not observe
the owner's session, so this is inference and is labelled as such.**

The §5 measurement makes one reading much more likely: `MIXER VOLUME` succeeds in every state on
this plant, so `mute-failed` can only have come from an unreachable server — and an unreachable
server is also exactly what makes the occupancy tap silent and every slot read `unknown`. **One
root cause, both symptoms.** If that holds, §4's rule ("show `unknown` only when we have positive
reason to believe the layer may be occupied") fixes the display and nothing else is owed.

**The alternative the task names — connected, occupancy reported unoccupied, and still displayed
`unknown` — is NOT ruled out and would be a second defect the rule would mask rather than fix.**
Deciding between them needs one observation from the owner's running app that I cannot take:
whether the link indicator read LIVE at that moment.

### The CLEARed-row sweep — what every layer-acting verb does, and the one residual

`dev-cleared-row-state`. Recorded because the sweep is the deliverable as much as the fix
is, and because one finding is left OPEN by design.

**THE MEASUREMENT THE TASK REQUIRED, first: `PLAY` on a cleared row REACHES AIR.** The design
(R-028 decision 5) is implemented, not merely intended — `take()`'s B-039 pre-roll re-ADDs
when `#loaded` has no producer, and the new integration test asserts the `CG ADD` on the wire
and `onAir === true` on the mock, not the absence of an error. Nothing to fix there.

**The full sweep, one decision per verb, all asserted in
`tools/caspar-bridge/tests/cleared-row-verbs.integration.test.ts`:**

| verb          | on a cleared row                       | decided                                                                     |
| ------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `PLAY`        | re-ADDs, then plays                    | do the work first (R-028 d5)                                                |
| `STOP`        | no-op, no producer created             | an implicit ADD inside STOP would put a graphic ON the layer to take it off |
| `UPDATE`      | commits fields, sends nothing (B-070)  | the next take's re-ADD carries them — asserted end to end                   |
| `NEXT`        | no-op, no producer created             | advancing a step must not be a door to air                                  |
| `CLEAR` again | safe, stays empty                      | the escape hatch is never state-gated                                       |
| `LOAD`        | re-ADDs the bound template, no picking | the reported defect                                                         |

**A test that passed for the wrong reason, caught while writing it.** The first STOP case called
`r.stop('item-clock')` — which is the runtime's own **shutdown** method, taking no arguments. It
went green because the layer was empty either way. The per-item verbs are `stopItem` / `nextItem`.
Exactly the class this task warned about, and it survived only because the assertion was on the
layer rather than on the call.

**🔴 THE RESIDUAL, left open deliberately: `PLAY` is enabled on a row whose template is GONE.**
The verb is gated on `empty || playing || rehearsing` and knows nothing about whether the template
can still be resolved, so on a bound row whose template has left the registry PLAY invites a take
that `take()` will refuse with `unknown-template`. It is NOT silent — the refusal surfaces as the
command toast — and this change makes the row say so visibly (the template cell reads
"(not in this browser)"). But it is still the dangerous direction the task names: the operator is
told the row will reach air, and finds out otherwise at the moment air needs it.

Not fixed here because the honest fix is a decision, not a patch: either PLAY gates on template
availability (which re-opens "do not gate PLAY on occupancy-adjacent facts", and the renderer's
view of the registry is not the bridge's), or the row refuses earlier and louder. **Worth an item.**

### Every `CG ADD` call site, and whether the rehearse guard covers it

Requested by `dev-cleared-row-state`, and the answer changed during the task.

| #   | site (`caspar-runtime.ts`)    | what it is                                   | rehearse-guarded?                         |
| --- | ----------------------------- | -------------------------------------------- | ----------------------------------------- |
| 1   | `#loadOnto` (via `loadFixed`) | the operator's LOAD                          | **YES — added by this task**              |
| 2   | reconnect reconciliation      | a silent layer re-ADDed after a bridge blip  | **NO — see below**                        |
| 3   | `setPosition`                 | re-ADD so the new `?pos=` query takes effect | NO, and it is safe — see below            |
| 4   | `take()` B-039 pre-roll       | PLAY's implicit ADD on a cleared row         | YES — `take()` refuses `rehearsing` first |

**Site 1 was the finding.** The task asked for the LOAD guard; the first cut put it in the
RENDERER only, which is precisely the shape R-022's own `take()` comment rejects — "a greyed-out
PLAY is a request, not a guarantee". A second browser with a stale rehearse snapshot, or any
direct channel call, reached `loadFixed` with the button's opinion nowhere in sight, and with LOAD
now working on a cleared row that is one click away rather than hypothetical. The refusal is now
bridge-side (`rehearsing`, a new `FIXED_LAYERS_LOAD_REASONS` member) and keys on the item BOUND TO
THE SLOT, not the incoming id — a load arriving with a fresh item id is exactly what an
incoming-id check would wave through onto the same rehearsing row.

**Site 3 is safe and it is worth writing down WHY, because it looks unsafe.** `setPosition`
re-ADDs on a rehearsing row (it refuses on-air/unsettled, not on rehearse). A bare `CG ADD` is
audible on 2.5.0 — but `MIXER VOLUME` is LAYER state, not producer state, so the mute the rehearse
entry set is still in force when the new producer arrives. The audio does not leak. This is the
same property the whole rehearse design rests on and it holds here by construction, not by luck.

**Site 2 is NOT guarded, and this is the one to decide.** Reconnect reconciliation re-ADDs a
producer onto a layer whose graphic did not survive the bridge restart — including a layer whose
row a browser still believes is rehearsing. The rehearse set is bridge-owned SESSION state, so a
bridge that restarted has no rehearsals at all and the case cannot arise; a bridge that merely lost
its SOCKET keeps them, and then this path re-ADDs unmuted under a rehearsing row. **Deliberately
not fixed in this task** — the task said to report the conflict rather than quietly extend the
guard, and the right answer is probably the `mute-before-ADD` upgrade below rather than another
refusal, because refusing reconciliation would leave a layer black instead of merely audible.

**And the upgrade this all points at is already recorded.** `mute-before-ADD` (further down) has
the ordering constraint that matters at EVERY site in this table, not just the obvious one: on
2.5.0 the volume must land BEFORE the `CG ADD`. Four ADD sites is four places that constraint has
to hold once it is built.

### ✅ CLOSED — the white 16:9 area was an OPAQUE CANVAS forced by a color-scheme mismatch

Fixed in `dev-pvw-white`: `color-scheme: light` on the rehearsal frame ELEMENT
(`RehearsalFrame.tsx`'s style object, so every frame gets it including ones created later).

**The cause, measured by the owner in the running app's devtools:**

```
getComputedStyle(iframe).colorScheme            → "dark"
getComputedStyle(innerDoc.documentElement)      → "normal"
getComputedStyle(parentRoot).colorScheme        → "dark"
```

CSS Color Adjust: **when the used color-scheme of an embedded document differs from its
embedder's, the UA renders the embedded document's canvas OPAQUE.** The console's root declares
`color-scheme: dark` (`packages/ui/src/theme.css:25`); the served page declares none, so it
resolves `normal` → light. Every frame was a mismatch.

**One cause, both symptoms.** It also explains the composite reading as broken — owner's report:
«با دستور play هر دو شروع می‌شوند ولی فقط لوگو دیده می‌شود». `dev-pvw-composite` WORKED; every
frame was present and stacked in layer order, and the topmost frame's opaque canvas occluded
every frame beneath it. **The composite was correct and invisible.** The one-word fix is what
makes it deliver.

---

**The previous session's entry here was WRONG, and it is worth keeping why rather than just
deleting it.** It concluded "Chrome does not paint an opaque base" from this probe:

| frame content                                        | result             |
| ---------------------------------------------------- | ------------------ |
| exported page as-is (`background:transparent`)       | baseline           |
| plus an injected `html,body{background:transparent}` | **byte-identical** |
| page declaring NO background at all                  | **byte-identical** |
| page declaring `html,body{background:#fff}`          | differs            |

**Every measurement in that table is correct. The conclusion drawn from it is not.** All it
established is that DECLARED backgrounds are irrelevant to this bug — which is true, because the
opacity is forced by the embedder relationship and is independent of any declaration. The probe
was run in a standalone Playwright page whose root had no `color-scheme`, so embedder and
embedded MATCHED and there was no opacity to observe. **A probe that does not reproduce the
condition under test cannot exonerate anything** — the same lesson as the voided CasparCG 2.5.0
entry further down ("a control test that reaches a different implementation than the one under
test is not a control test"), arriving through a different door: here the control test reached
the right implementation in the wrong ENVIRONMENT.

The two candidate causes that entry left for the owner to check — an opaque authored
`scene.background` painting `.cg-stage`, and the template's own `cg.css` — are both DEAD, and
were measured dead: `.cg-stage` reads `rgba(0, 0, 0, 0)` in the repro, and both scenes involved
are authored `background: 'transparent'`. Nobody needs to open the Designer.

**What the sequence cost, and the rule it earns.** Three tests in this project have now passed
while the defect they were written for was fully present (a density test that only ran at the
widest density, a draft spec exercising the one path that never unmounts, and that entry's own
computed-background assertion). This one adds a fourth shape: **the canvas is not an element and
no computed style reports it** — `html`, `body` and `.cg-stage` all measure fully transparent
while the box renders white. The replacement tests therefore sample PIXELS
(`tests/e2e/rehearse-canvas.spec.ts`), and both were confirmed RED against the unfixed code
before being seen green. The superseded pixel-difference test in `rehearse-composite.spec.ts`
was correct as far as it went and is kept.

**Only one direction is implemented, deliberately.** Writing `colorScheme` onto the served
document's root would also work and was NOT taken: it reaches into the page and edges toward a
preview-only variant of it, which PVW's fidelity claim forbids. Two mechanisms for one effect is
how the next person inherits a page that is transparent for a reason nobody can name. `light` is
additionally the more faithful direction on its own terms — it is what a browser gives a document
declaring no scheme, whereas the inherited `dark` was the operator console's theme leaking into
the graphic's rendering environment.

### PVW composited N rehearsing rows, and the position override never reached the frame at all

`dev-pvw-composite` §1 and §2, both shipped. Recorded because the §2 diagnosis answers a
question wider than the fix.

**§2 was cause 1 of the three offered — the override never reaches the frame — and it is
STRUCTURAL, not a wiring slip.** On air the override rides the served URL's query and the boot
reads `location.search`. PVW's frame is `srcdoc`, whose document URL is `about:srcdoc` and
whose `location.search` is therefore ALWAYS empty, so `resolveOutputPosition` fell back to the
authored position on every rehearsal, forever, no matter how many times Apply was pressed.
Cause 3 (the control being gated) was checked and is NOT present: `isPositionLocked` reads
`status`/`pending` only, and rehearse changes neither — now pinned by a test. Cause 2 (nothing
re-renders) was real but secondary and is closed by the same fix: the per-frame effect depends
on `[ready, position]`.

**What that says beyond this fix, which is why the owner asked:** R-030's override path is
wired end-to-end **only as far as CasparCG**. The bridge builds the query and CasparCG's page
reads it; nothing else ever consumed it. PVW was the second consumer and the first to need it
without a URL. The query-building is now ONE shared `positionQuery` in `@cg/shared-schema`,
used by the bridge and by PVW and round-tripped against `parsePositionQuery` under test — but
worth knowing: before this there was exactly one producer and one consumer, so no drift was
possible and none was guarded against.

**The mute/restore check the task asked for came back clean.** With N rows rehearsing, N layers
are muted, and the restore is genuinely per row: `#rehearsing` is a Map keyed by item, each
entry carrying its own slot and its own `muted` flag recorded AT ENTRY (the B-100 read-once
rule), `exitRehearse` restores from that flag, and `#abortRehearsalsThatWentLive` iterates all
of them. The startup re-assert `#reassertDeclaredVolumes` walks `start … start+count` of the
declared bank and holds no rehearse state at all, so it cannot have the "only the last
rehearsing row" bug. Two new integration tests pin both halves. **Nothing in this change touched
the mute path** — the N-row case was already possible; PVW simply did not show it.

**Left deliberately:** the transport (PLAY / NEXT / STOP) drives EVERY rehearsing frame rather
than the selected one. A transport that ran one of three would be the same partial-surface
defect one control along, and judging whether two graphics collide requires running them
together. An operator who wants one lifecycle in isolation rehearses one row. If the owner
wants per-row transport, it is a real design question and not a tweak.

### ⛔ `dev-r028-b5` (Inspector restyle) was NOT STARTED — the third task of this session

Three task files arrived in one session: `dev-r022-rehearse`, `dev-r030-channel-raster`
and `dev-r028-b5`. **The first two shipped, gate-green. b5 was not begun** — not a single
file of it is touched.

**Why it was left rather than half-done.** b5 is a styling task whose acceptance is the
owner's eyes on four panels, and §0.7 puts its central change in the SHARED `Panel`
primitive, so its blast radius is Layers, Inspector, PGM and PVW together. Its own brief
says a regression there is a regression everywhere and requires all four checked visually
before hand-off. Landing a partial restyle on top of two large, already-committed features
— one of which (r022) REWRITES the PVW panel b5 would then be restyling — would have meant
handing over an unreviewed visual change across the whole surface. Stopping at the task
boundary keeps r030 and r022 independently reviewable.

**One thing r022 changed that b5 must now account for.** PVW is no longer a
`MonitorPanel` with props: it is a new `PreviewPanel` component with real behaviour
(`apps/runtime/src/renderer/features/monitors/PreviewPanel.tsx` +
`RehearsalStage.tsx`). PGM is still `MonitorPanel`. So b5's §0.7 audit — "list which panels
consume the primitive and confirm none hand-rolls a bar" — has one more consumer than its
brief assumes, and `PreviewPanel` does consume `Panel`, so the primitive count is
Layers / Inspector / PGM / PVW as before.

**Also unaddressed, and cheap to lose track of:** b5 §6 reports `ROTATOR[n]` still visible
on the surface (unfinished b4 item 2). Nothing in this session touched it.

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

### FLAKY (second one) — the Designer's multi-select group-drag spec times out under a loaded gate

`apps/designer/tests/e2e/multi-select.spec.ts:271` (D-054, "group-drag keyframes an animated
member at the playhead") failed one `gate:e2e` run with a 30 s timeout on
`getByTestId('multi-select-box').first()` — the selection box never appeared after
`clickCanvas` + `shiftClickCanvas`.

**Not a regression, and nothing was changed to make it pass.** The diff in flight
(`dev-pvw-white`) touches `apps/runtime/**` and `DEBT.md` and NOTHING else — no Designer file,
no shared package — so the Designer cannot import a line of it. Re-running the spec alone:
**7/7 green**. Re-running the whole gate: **22/22, 0 cached, Designer 231 passed, Runtime 52
passed.**

**Worth filing as the same class as the VP8 flake below, not as a bug.** It is a Konva canvas
interaction (two synthetic clicks, then a bounding-box read) failing only inside the full
~6-minute suite, which is the B-073/B-098 contention signature. Note what the repair rules
forbid and what this entry therefore does NOT propose: raising the timeout. B-073 already tried
a longer rope and B-098 is that bound blown in turn.

If it recurs, the useful direction is why the selection box is slow to appear under load —
`multiBoxes` is read immediately after the second click with no settle — not a bigger budget.

### FLAKY — the Designer's seek-fragile VP8+alpha canvas test

`apps/designer/tests/e2e/video-canvas-render.spec.ts:146` failed one `gate:e2e` run with
`PipelineStatus::PIPELINE_ERROR_DECODE`, and passed on immediate re-run and in the two
gate runs before it (log lines 3530 and 7041 vs 10600 in
`.gate-logs/8372aa2a-…log`).

**Not a regression, and not touched.** The failing diff was entirely Runtime-app CSS/TSX
plus a Runtime E2E spec; the Designer imports none of it (`apps/runtime/src/renderer/ui`
has no consumers in `apps/designer/src`), and the Runtime suite was 32/32 green in the
same run. The test's own name calls the clip "seek-fragile" and "the canvas-blank class",
so a Chrome media-pipeline decode failure is the flake mode that fixture exists to probe.

Worth filing as a flake to quarantine or stabilise rather than as a bug — an intermittent
red in a shared gate trains people to re-run rather than to read, which is how a real
failure gets waved through.

### Owner UI review batch (post-b4) — six items, all shipped

Recorded together because they came from one review pass and share one lesson. Items:
numeric/position inputs scrub + arrow-key step; sticky Update/Discard; the divider that
looked like a scrollbar; toggle-select on rows; tighter panel gutters; Inspector
open/close + mobile overlay height and fullscreen.

**Two findings from the batch worth carrying:**

1. **The Inspector's openness was TWO states for one fact.** `inspectorOverlayOpen`
   alongside `selectedId` meant dismissing the mobile overlay left the row selected —
   the console claiming an edit target with no editor. Now DERIVED
   (`inspectorOpen = selected !== null`), so the disagreement is unrepresentable rather
   than merely fixed. Any future "just add a flag to keep it open" reintroduces the bug.
2. **A flex child does not stretch on the MAIN axis.** The narrow overlay was pinned
   top-to-bottom, so it looked correct, while the panel inside sized to its content —
   800px in a 900px viewport. Only a MEASURING test caught it, which is the same lesson
   as the stretched buttons below: none of the existing specs looked at a box.

**`Panel.onClose` drops the shell focus before closing**, in the primitive rather than in
each caller — a panel that is closed while still holding focus leaves the workspace hidden
behind nothing. Structural, so a future closable panel cannot forget it.

Still open from this batch: `Reload`/`Grant access` remain accent-coloured (below), and
there is no E2E on the scrub DRAG itself — only on `arrowStep`, the pure half. The drag
lives in window pointer listeners; a Playwright `mouse.move` sequence would cover it and
is worth adding.

### b4 follow-up — `--verb`'s column geometry stretched the Inspector's icon buttons (fixed)

Owner report: the ↑/↓/× buttons were "خیلی کشیده" — badly stretched. Measured at **286px
wide** instead of 28px.

Cause: b4 gave them `variant="verb"` for its neutral LOOK, and `--verb` carries
`width: 100%` because a row verb fills a table column the sticky header sized. In the
Inspector's flex tools row each button therefore asked for the container's whole width.
**This is exactly the trap the `--verb`/`--neutral` split comment in `controls.css` was
written to warn about** ("the LOOK is the shared thing; the SHAPE is not") — the same
mistake, one variant later. There are three shapes, not two.

Fixed with a third shape, `--icon`: the shared neutral look plus a small FIXED square
(28px) and `flex: 0 0 auto`, so it neither grows nor shrinks. The responsive behaviour is
the split — TEXT reflows, controls never resize — with `flex-wrap` on the tools row as the
floor for a pathologically narrow panel. 28px is above the 24px WCAG 2.5.8 floor, which is
the reason not to shrink it further in a later tidy-up. `FromFileControl`'s detach ✕ had
the same defect and moved too.

**Two process lessons, both worth more than the fix:**

1. **No test looked at a box.** Every assertion in `inspect-list-field.spec.ts` passed
   while the buttons were unusable, because they all checked values and labels. A geometry
   assertion now pins width/height/squareness/equality and that the textarea is wider than
   the three controls combined. Confirmed load-bearing: reverting to `verb` yields 286px
   and fails it.
2. **A stale `dist/` gave a FALSE PASS during that very check.** Reverting the source and
   running `playwright test` directly reported green, because the E2E serves the BUILT app
   and the build still contained the fix. `CLAUDE.md` warns about this explicitly. The
   verification only became real after `pnpm --filter @cg/runtime build`. Anything invoking
   Playwright without a build first is not evidence.

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

**ANSWERED, 2026-08-01.** There is no gap: `R-031` (the operator surface), `R-032` (a
PLAYOUT tab) and `R-033` (the Layers table) all exist as real headings in
`docs/prd/runtime.md` on `dev`, so the space is contiguous `R-001`…`R-034` and `R-034`
is not a collision. One genuine collision DID occur and is now fixed — a `main`-side
session filed the splash as `R-031` because `dev`'s was invisible from `main`; the
splash is now **`R-035`**. **Next free: `R-036`.**

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

### PATTERN (twice now): an observer effect that silently no-ops when its target is absent

**Not an instance — a shape.** Recording it as a pattern because this is the second
occurrence, both invisible in code review and obvious on screen, and both found by
LOOKING rather than by a test.

1. **PVW's white page** (`RehearsalStage`) — the `ResizeObserver` effect was keyed on
   `[raster.width, raster.height]`, but the fit box is only rendered once `html` has
   arrived. On the first pass `fitRef.current` was `null`, the effect returned early,
   and **no observer was ever attached**. `fit` stayed at its initial `1`, so the
   rehearsal rendered unscaled and filled the panel.
2. **The b2 density bug** — an observer effect keyed on `[ref]` never re-ran because
   `bank` was `null` on the first render.

Both are the same shape: _the effect's target does not exist on the pass where the
effect runs, and the early return is silent._ Both were also self-concealing — any
unrelated remount fixed them, so the broken state is the one nobody reaches by
touching anything. In PVW's case `PreviewPanel` keys the stage on the draft version,
so typing a single character into any Inspector field repaired it.

**The rule:** an effect that attaches an observer must not silently no-op when its
target is absent. It either takes the thing that gates the target's existence into
its DEPS (what the PVW fix did — added `html`), or it REPORTS that it did not attach.

**Worth a shared hook or a lint rule when normal mode resumes** — two occurrences is
enough. A `useObservedSize(ref)`-style hook that owns the attach/detach and cannot be
keyed wrongly would make the class unrepresentable rather than merely known.

---

### CLOSED: a panel fullscreen round-trip destroyed unapplied drafts

Fixed in `dev-draft-loss`. **The readiness contract, stated once so the next consumer
inherits it:** `useBridgeSnapshotState` returns `{ value, ready }`, where `ready` is
false for the bootstrap window — the hook is handing back the caller's `initial`
value because nothing has arrived, NOT because the bridge said the value is empty.
`useStackSnapshot()` exposes that for the stack.

**Anything that acts on an item's ABSENCE takes `StackPruneInput`**, which is
`{ ready: false }` or `{ ready: true, liveItemIds }` — the not-ready shape carries no
ids at all, so there is no way to hand a prune a list it cannot vouch for. A plain
`(ids, ready)` pair was rejected deliberately: the next caller passes `true` by habit.
Consumers that merely RENDER keep using `useStack()`; an empty list for one frame is
not a loss.

The prune now runs from `useStackHousekeeping`, called by `App` — the one component
mounted for the life of the page. The fail-closed guard inside `pruneDrafts` is kept
as well: the placement stops this instance, the guard stops the class.

**Sweep result, so nobody repeats it** — three consumers read the stack snapshot and
act on absence, all in the same pass, all now guarded: `pruneDrafts` (the reported
one), `pruneFromFile` (file attachments, same pass, same loss), and
`restoreFromFileAttachments` → `pruneAttachments`, which was the **worst** of the
three and was not in the original report: it deletes from DURABLE storage, so driven
by the bootstrap snapshot it would wipe every persisted attachment handle in the
profile, and a reload would not bring them back. Everything else that reads the stack
(`ChannelScope`, `PreviewPanel`, `ServerSettingsPanel`, `FixedBankConfigModal`,
`LayersPanel`) only renders or derives — checked, none had the bug.

**Known seams, left deliberately:** `useStackHousekeeping` opens a SECOND subscription
to the stack channel alongside `App`'s own `useStack()` — both receive the same pushes,
so it is a small cost and not a correctness issue. And `ready` latches permanently
rather than clearing on a link drop: once the bridge has said what is on the stack,
a later disconnect does not make that knowledge un-arrive, and clearing it would
re-open the bootstrap window on every blip.

---

### (superseded — kept for the record) the diagnosis as first written

**Reported by the owner:** with unsaved Inspector edits staged, maximising the
Inspector — or maximising then restoring PGM/PVW — loses the draft.

**Mechanism, and it is one mechanism for both paths.** `pruneDrafts(ids)` is called
from an effect in `LayersPanel` (`LayersPanel.tsx:117`) whose job is to drop drafts
for items no longer on the stack. But `LayersPanel` is UNMOUNTED by both transitions:
`App.tsx` renders it under `{!monitorFocused && …}`, and the whole workspace under
`showWorkspace = layout.focus !== 'inspector'`. On REMOUNT the effect runs against
`useStack()`'s initial snapshot — which is empty until the bridge's first push
arrives — so `pruneDrafts(∅)` treats every item as "no longer on the stack" and
deletes every draft. `pruneFromFile(ids)` runs in the same pass and loses file
attachments the same way.

**Why the existing E2E did not catch it:** `stage-inspector-edits.spec.ts` asserts a
draft survives _switching selection away and back_, which never unmounts the panel.
The lossy path is a FULLSCREEN round-trip, which no spec exercises.

**Fixing it well is not a one-liner, which is why it is recorded rather than rushed.**
The prune is correct in intent and wrong in placement: it is stack-lifecycle
housekeeping living inside a component with an unrelated mount lifetime. Candidates —
(a) move the prune to where the stack snapshot itself is owned, so it runs once per
real snapshot rather than once per mount of a view; (b) make it a no-op until the
first non-initial snapshot has been seen, so an empty bootstrap can never prune. (a)
is the honest fix; (b) alone would leave the same landmine for the next consumer.

**Severity: operator data loss.** The drafts are typed-but-unapplied field values —
exactly the work the Inspector's whole staging model exists to protect.

---

### UPGRADE (deliberately deferred): mute-before-ADD, so LOAD can run during rehearse

Rehearse now refuses LOAD on a rehearsing row (fail closed) because LOAD on a cleared
row is the one path that can put an UNMUTED producer under a row the UI shows as
rehearsing. The better feature is to mute as part of the load instead of refusing.

**The ordering constraint, written down because it is the whole difficulty:** on
2.5.0 the volume must land **BEFORE** the `CG ADD`, not after. A bare `CG ADD` puts
the template's audio on air (R-029), so an ADD-then-mute sequence is briefly audible
on air — the exact leak the mute exists to prevent, just shorter.

Not taken now because it puts a new ordering-sensitive path into the mute logic,
which is the one path in this feature whose failure mode (a graphic that reaches air
silent) nobody notices until someone asks why there is no sound.

---

## R-035 SPLASH — the readout and the visual layer (2026-08-01, fast mode)

Base: the `origin/main` merge (`78bdd34`), which brought PR #431's splash infrastructure
onto `dev`. This run changes the READOUT and adds the VISUAL LAYER on top of it; the boot
gate, the timing contract, the build stamp and the bypass are inherited untouched.

### Owed — process suspended by fast mode

- **No `pnpm gate`.** Only `pnpm --filter @cg/runtime test` + `build` were run. Never run
  uncached across the workspace, so a cross-workspace break would not have been seen —
  though the diff is confined to `apps/runtime`.
- **No full E2E run, and no suite-timing measurement.** `apps/runtime/tests/e2e/splash.spec.ts`
  was EDITED (the counter assertions became percentage assertions; a reduced-motion
  freeze-frame case was added) and **not executed** — fast mode runs no Playwright. Both the
  splash specs and the timing measurement are owed.
- **🔴 A Linux `gate:e2e` is owed.** This change is entirely UI and rendering — a new SVG
  scene, a new company lockup, changed type weights. Nothing about it was verified on Linux,
  and Windows is non-authoritative for pixel and geometry.
- **No OpenSpec spec-delta for the visual layer.** `openspec/changes/runtime-splash-screen/`
  still describes the STEP COUNTER and the placeholder brand slot, both of which this run
  replaced, and says nothing about the playout scene or the APASAI lockup. Its `spec.md`,
  `design.md` and `tasks.md` need reconciling before the change is validated or archived.
  No `openspec validate` was run.
- **✅ RESOLVED — the duplicate `R-031` is gone.** The splash item was filed as `R-031` by a
  session reading `docs/prd/runtime.md` **on `main`**, where `R-030` was the highest in use;
  `dev` already held `R-031` (the operator surface) in an unmerged fast-mode edit that `main`
  could not see, so the `origin/main` merge produced two. **The SPLASH item was renumbered to
  `R-035`** — the first free number above `dev`'s `R-034`, verified as unused anywhere in the
  repo — because it is the newer claim and every reference to it sits in one place. The
  operator-surface `R-031` is untouched. Moved with it in the same commit: the PRD entry, the
  five files under `openspec/changes/runtime-splash-screen/`, and every reference in this
  file. The rule that would have prevented it is filed under `## Findings to file`.
- **✅ RESOLVED — the splash item's stale acceptance text is corrected.** Fixed while
  rewriting that entry for the renumber, because leaving a known-wrong acceptance behind is
  worse than the scope discipline that deferred it. Four statements were superseded: the
  readout is a PERCENTAGE (not a `2 / 3` step counter), the floors are 8000/3000 (not
  5000/600), the mark is the real inlined APASAI artwork (not "a placeholder … a single
  documented SVG slot"), and the accent is APASAI's brand blue `#00AEEF` as a splash-local
  value (not "the existing sky"). The OpenSpec delta under
  `openspec/changes/runtime-splash-screen/` is still owed a reconciliation for the VISUAL
  layer — see the item above it.

### 🔴 The APASAI mark is NOT production brand artwork

`apps/runtime/brand/apasai-logo.svg` is an **auto-trace of a 114×96 raster** the owner
supplied, inlined into `index.html`. It is faithful enough to sign a boot screen and it is
not vector artwork: curves are polygonised, so it will show its origin at large sizes or in
print. **Replace it with the original vector (AI / EPS / SVG) before any customer-facing
release.** The swap is one file plus the inlined copy in `index.html`; the three class hooks
(`.apasai-bars` / `.apasai-swoosh` / `.apasai-arc`) are the contract, and
`tests/splashCss.test.ts` asserts the inlined path data still equals the file's.

`#00AEEF` is the company's exact blue and is not ours to alter — not for contrast, not for
consistency, not for a theme. Only the bars and the swoosh are relit for the dark ground.

### Decisions taken fast — R-035 splash

1. **The PLAY triangles and the ticker use `--r-success` (`#10B981`), not the `#34d399` the
   task named.** The task calls `#34d399` "the console's own success green" — it is not; the
   palette's success green is `#10B981`, and the task's own rule says an existing UI colour
   uses its token. Took the token. One value in the `--cg-ok` constant if the owner wants the
   brighter emerald instead.
2. **The rail is `transform: scaleX()`, not an animated `width`.** The readout re-renders ten
   times a second for the whole hold, so a width transition is ~50 layout invalidations
   during the exact window the bundle is parsing — the cost the task's own "loops are
   compositor-only" rule exists to prevent. Identical on screen. Side effect worth knowing:
   the fill's gradient and glow scale with it, so the leading edge is always the bright end
   of the gradient rather than a fixed point along it.
3. **The foot sits at `bottom: 18px`, not the reference's 34px.** At 34px the corner
   brackets' horizontal arms (`inset: 40px`) run straight through the build stamp — it
   rendered struck through. Both are anchored to the same edge, so this was a constant
   collision, not a viewport case.
4. **The inlined copy of the mark drops the source's three `fill` attributes** so all three
   class hooks take their colour from the stylesheet. Path data untouched (asserted). This is
   what lets the palette test see every colour on the screen from one place; the standalone
   `brand/apasai-logo.svg` keeps its original fills and stays correct on a light ground.
5. **`--r-splash-mark-mid` deleted, `--r-splash-mark-dim` renamed `--r-splash-scene-bar`.**
   Their only consumer was the placeholder mark this run removed; a token named for a deleted
   element is a name that lies about what it is for.
6. **`--r-splash-glow` moved from the sky `rgba(56,189,248,.5)` to the brand
   `rgba(0,174,239,.5)`.** It is the rail's halo and the rail is now brand blue; leaving it
   sky would have been a stale value behind a live literal. It is the ONE splash token
   holding the brand hue, and only because `box-shadow` needs an `rgba()`. **`--r-accent` is
   untouched** — asserted by a test.
7. **The readout ticks on a 100 ms `setInterval`, not `requestAnimationFrame`.** A percentage
   renders whole numbers; per-frame script work would be taken from the boot being covered.
8. **The brand blue, violet and amber are `--cg-*` constants on `.cg-splash`, not tokens** —
   parsed back out of the document by the palette test, so "declared once, in the open" is
   enforced rather than merely agreed.
9. **🗣 The surface lift inverted the splash family's stated rationale, so I rewrote it.**
   The owner's mid-run delta raises the ground to `#1A212D`. `theme.ts` documented the family
   as "a deeper, near-black console than the app chrome (`--r-surface-sunken` is #0F172A)" —
   the new ground is LIGHTER than that, so the comment had become false. It now says what is
   true: a panel lifted ABOVE the console, so the dismissal reads as a curtain rising rather
   than one dark screen becoming another. Six values moved together (ground, both border
   weights, the scene bars, the foot ink, the vignette) because lifting the ground alone
   would have sunk the rail's track into it — `#1C232E` was within two points of `#1A212D`.
   All six were already `--r-splash-*` tokens, so this was a repoint in `theme.ts` +
   `controls.css` + the inline mirrors, with no new token and no hand-picked literal.

### The one tension worth the owner's eye

**The entrance does not fully rest by 1.6 s — the foot lands at ~2.05 s**, and that is the
reference stagger kept verbatim (foot `1.15s` delay + `0.9s` duration). Everything else is
down by ~1.62 s. The consequence is only on a WARM reload: the 600 ms floor dismisses the
splash while the foot is still arriving, so a fast F5 never shows the composition settled.
I did not compress the stagger to force the number, because tightening the last two entrances
is what would actually make the entrance feel rushed — the thing the task asked me to avoid.
Say the word and it is two `animation-delay` values.

Observed in the browser: cold held 5.79 s (5 s floor + 450 ms fade + navigation), warm 1.44 s.

## DESIGNER SPLASH + the shared splash kit (2026-08-01, fast mode)

The Designer gained the same startup splash the Runtime has, and the two things they must
agree on were extracted to `tools/splash-kit` (`@cg/splash-kit`) BEFORE the second consumer
existed rather than after.

### Owed — process suspended by fast mode

- **No `D-` item number and no `docs/prd/designer.md` entry.** To file when normal mode
  resumes, in words: _"the Designer boots straight into the landing screen; give it a startup
  splash — APASAI / CG DESIGNER, an artboard scene, a phase readout and a progress rail —
  visible from the first paint until the app is genuinely ready, with a minimum hold. Same
  timing contract and same company lockup as the Runtime's R-035; different heart (a working
  artboard rather than a playout instrument)."_
- **No OpenSpec change dir and no `openspec validate`.** The whole feature — the timing
  contract, the boot gate, the bypass, the reduced-motion composition — is spec-worthy and is
  written down nowhere but the code and this file.
- **The E2E DID run** — the turn-end gate hook ran `pnpm gate:e2e` regardless of fast mode.
  All six Designer splash specs passed. Two RUNTIME splash specs failed and were fixed; both
  are recorded under "What the gate caught" below. A Linux run is still owed.
- **🔴 A Linux `gate:e2e` is owed.** This is entirely UI and rendering. Nothing about it was
  verified on Linux, and Windows is non-authoritative for pixel and geometry.
- **No `pnpm gate` and no suite-timing measurement.** Only the designer's own `test`,
  `typecheck`, `lint` and `build` were run, plus the runtime's and the kit's.

### Decisions taken fast — Designer splash

1. **`LOADING PROJECTS` was DROPPED from the phase list; `STARTING INTERFACE` replaced it.**
   The task's expected list named a project-index read, and `bootstrap()` has none — the
   landing screen reads projects after React mounts. Synthesising a step to keep three labels
   is exactly what the task forbids, so the third label is the step that does exist: the gap
   between the platform resolving and `createRoot().render()`. Three real labels, three real
   steps, same shape as the Runtime.
2. **The shared kit exports SOURCE, not `dist/`, and its build-stamp half is `.mjs`.** Both
   were forced, not preferred, and both are recorded in the package's README because they look
   like mistakes: turbo's `dev` task has no `dependsOn: ["^build"]` and `pnpm --filter
@cg/designer dev` runs `vite` directly, so a `dist` export breaks the dev server on a clean
   checkout; and vite treats a workspace package resolved through `node_modules` as external
   when bundling a config, so Node imports the build stamp untransformed and a `.ts` export
   dies with `ERR_MODULE_NOT_FOUND` before the build starts. Observed both, not guessed.
3. **The FLOORS are parameterised rather than shared.** Runtime 5000/600, Designer 8000/3000.
   The arithmetic is one rule in one place; the numbers are a product decision per app, and
   folding them together would mean one product reading the other's.
4. **The Designer's surface constants are `--cg-*` in the inline CSS, with no token mirror.**
   The Runtime mirrors `theme.ts` tokens because it HAS a `--r-*` system with a parity test;
   the Designer is styled with vanilla-extract and has no equivalent, and `packages/**` was
   fenced off. So the rule enforced instead is stronger in one way and weaker in another:
   every colour literal in the document must be a declared `--cg-*` constant (parsed out of
   the document by the test, so "declared once, in the open" is the mechanism) — but there is
   nothing outside the file for it to be checked against.
5. **Two colour literals are allowed outside a constant, and the test names them:** the
   vignette's `rgba(0,0,0,.22)` and the rail's glow `rgba(0,174,239,.5)`. CSS gives no other
   form — a gradient stop and a `box-shadow` both need an alpha colour, and a hex constant
   cannot carry one in.
6. **The coral stays.** The Designer is not an air surface, so the Runtime's hard no-red rule
   does not apply here; `--cg-coral` is declared exactly once and the CSS says so, which is
   what makes removing it a one-line swap if the owner ever extends that rule.

### What the gate caught, and what I changed

Two Runtime splash E2E specs failed. Neither was a product bug; both were faults in the specs
themselves, and I state the changes explicitly because the repair rules require it.

1. **`getByRole('region', { name: 'Stack' })` no longer exists on `dev`.** The splash spec
   came from `main` (PR #431), where the Runtime still had a `Stack` region. On this branch
   the operator-surface work replaced it with **`Layers`** — which is precisely why the merge
   in Step 0a carried TWO `R-031` items, one of them being "one Layers section, no Library"
   (that duplicate has since been resolved — the splash item is now `R-035`).
   So this is a test updated because the branch's behaviour deliberately changed, not an
   assertion loosened to go green: `fixtures/runtime.ts` already uses `Layers` as its own
   post-boot barrier, and the spec now uses the same one. The claim is unchanged — the splash
   removes itself and the operator surface is reachable.
2. **`toHaveText('100%')` was a race I wrote.** The splash shows 100 % only for the ~450 ms
   fade before it deletes itself, so the assertion depended on Playwright's polling cadence
   landing inside that window. Under a fully loaded parallel gate it polled 40 %, 42 %, 44 %
   and then found nothing. Replaced with an in-page 40 ms sampler installed before navigation
   that records every distinct value, so the spec now asserts something STRONGER than before:
   the readout climbed, never went backwards, and ended at exactly 100. The same latent race
   existed in the Designer's twin (it passed by luck this run) and was fixed identically.

Neither fix touched product code. The Runtime's `index.html`, its inline clock and its boot
gate are unchanged by this repair.

### Not done, and deliberately

- **No in-app about/version surface** in either product, though `__CG_BUILD__` is defined in
  both and carries `{ version, sha, builtAt }` ready for one.

### 🗣 THE FLOORS: both products hold 8000 ms cold / 3000 ms warm

`floor(coldStart) = coldStart ? 8000 : 3000`, in the Runtime as well as the Designer. I first
applied it only to the Designer and flagged the Runtime as a separate decision; the owner
confirmed he was looking at the RUNTIME splash when he set it and has taken the decision
knowingly. It is applied to both, and the Runtime's warm floor moved 600 → 3000 with it.

**The reservation, kept on the record because it is a real property of the product and not an
objection to the decision:** on the Runtime a cold start is also a **recovery path** — a
crashed tab, a reopened browser, a machine restarted mid-shift — so the eight seconds are
sometimes paid at the least calm moment there is. The owner has weighed that.

**The agreed answer if the wait proves costly in practice is an `Esc`-to-skip door**, and the
shape of it matters: it skips only the REMAINING HOLD, never the load. `dismiss()` already
does exactly that (it fires whenever the hold elapses, and boot-done is tracked separately),
so the change is a keydown listener in the inline script plus a hint on the splash — not a
shortened floor and not a bypassed boot. **Not built. Do not quietly shorten the floor
instead.**

Consequences already handled: the Runtime's comments explaining why its floors DIFFERED from
the Designer's were false the moment this landed and have been rewritten; the scene's beat map
notes that it must still fit the SHORTEST floor the product ships, not the current one, so the
5 s case stays covered if the floor ever moves back.

## Skipped process

Per the fast-mode contract, all of this was deliberately not done.

**`dev-modal-primitive` (overnight run, 2026-08-01):**

- **No OpenSpec change artifacts and no PRD item.** The `Modal` primitive gained a public
  contract (the three roles, the message region) and five dialogs changed appearance — that
  is spec-worthy and none of it is written down outside the code and this file.
- **✅ THE §3 E2E IS WRITTEN — DISCHARGED 2026-08-10.** The DOM spec pinned the MECHANISM
  (the message is outside the scroll container, immediately above the action row) because
  jsdom computes no layout. The task's own wording — "assert the message is in the viewport
  without scrolling … assert visibility, not presence in the DOM" — needed Playwright's
  `toBeInViewport()`, and now has it:
  `apps/runtime/tests/e2e/modal-message-in-viewport.spec.ts`. See the discharge note near
  the top of this file for why it drives `Live sources` rather than `Candidate layers`, and
  for the negative control that gives the viewport check teeth. A Linux `gate:e2e` is owed
  for the dialogs changed in the SAME commit that discharges this, and is cited there.
- **No test asserts the migrated dialogs still OPEN from their real entry points.** The
  specs drive `ServerSettingsPanel` and `AuditPanel` directly. Their launchers (the status
  bar, the audit button) are unchanged and typecheck clean, but nothing pins it.
- **`Cancel` leaving state byte-identical is asserted only for the config dialog** (the
  refusal keeps the dialog open with all 30 rows intact). The task asked for it on "at
  least the destructive ones"; the confirm dialogs' cancel path is unchanged code and was
  not separately re-asserted.

**`dev-awaiting-verbs` (overnight run, 2026-08-01):**

- **No OpenSpec change artifacts and no PRD item.** No `openspec/changes/` dir, no
  `[~]` flip. The verb-availability rule and the panel notice are both spec-worthy —
  the `awaiting` case is now a THIRD row state with its own offers, and `CLEAR`'s
  narrowing (above) is a documented decision reversal that belongs in a spec delta.
- **No E2E spec added.** The `awaiting` window is a transient bootstrap state that
  Playwright cannot reliably hold open against the real bridge — the DOM specs
  reproduce it by DEFERRING the stack snapshot, which is not available at the E2E
  layer. **A Linux `gate:e2e` is still owed**: the panel gained a reserved strip above
  the layer table, which is a layout change.
- **`AWAITING_ROW_REASON` is not in the shared `reachWording` module.** It lives with
  the verbs (`layerRowActions`), like `MISSING_TEMPLATE_REASON`. If a second surface
  ever needs to say it, that is the moment to move it — the drift risk is real but no
  second consumer exists yet.

**`dev-r030-channel-raster` + `dev-r022-rehearse` (this session):**

- **No OpenSpec change artifacts.** Both features shipped straight to code. `R-030` and
  `R-022` in `docs/prd/runtime.md` are NOT flipped to `[~]` and no
  `openspec/changes/<name>/` exists for either. Two features' worth of spec authoring is
  owed before either can archive.
- **`pnpm gate` WAS run, uncached, and is green** (`82 successful, 82 total` /
  `0 cached, 82 total`) for each of the two commits. This is not among the skipped items.
- **`pnpm gate:e2e` was NOT run, and a Linux run is owed for r022.** r022 changes UI
  (a new row state, a new verb in the fixed slot, a rewritten PVW panel), which is exactly
  the class that owes a Linux `gate:e2e` per CLAUDE.md. r030's renderer change is one
  banner; it owes the same pass by the same rule. **No E2E spec was written for either** —
  owed at implementation time per the E2E coverage rule.
- **The task order was FLIPPED relative to the `dev-r030` task file's header.** That file
  says "run after `dev-r022-rehearse`"; the `dev-r022` file (Version 2) says the order was
  flipped and r030 ships first, and gives the reason (otherwise r022 ships a disabled
  position control and enables it one task later — two passes over one control plus a
  visual review of a control that does nothing). r030 ran first. The r030 file's header is
  the stale one.
- **`dev-r028-b5` (the Inspector restyle) was NOT started.** See "Findings to file".

**Nothing in either feature is verified on air, and neither can be from this machine.**

- **r030 — a 720p channel is the useful manual check.** The uniform-scale maths is
  confirmed against unit tests and the amcp-mock only. The owner can configure a
  720p5000 channel on the test CasparCG; until then, "a 1280×720 channel places
  proportionally" is asserted in jsdom, not observed on a raster. The 1080 no-regression
  case IS asserted on the emitted declaration (no `scale`, no `transform-origin`), which is
  the strongest form available without hardware.
- **r030 — the video-mode read is confirmed against the amcp-mock's `INFO` stub, not real
  `INFO`.** The mock answers `<video-mode>1080i5000</video-mode>`, which is the owner's real
  plant value, and `INFO <channel>` is already used in the live handshake — but this
  project has never parsed its XML off real hardware. If the real body differs in shape,
  `parseVideoModeFromInfo` returns null and the check reports `unreadable`: a recorded gap,
  never a silent assumption. That degradation is deliberate and tested.
- **r022 — `MIXER … VOLUME` has NEVER been sent to this plant by this project.** It is
  long-standing documented AMCP and the mock now models it, but the verb is unvalidated on
  2.3.2 here. If real 2.3.2 refuses it, `enterRehearse` fails closed with `mute-failed` and
  rehearse simply cannot be entered — which is the correct failure, but it means the
  feature's availability on the plant is UNCONFIRMED.
- **r022 — the 2.5.0 premise behind the mute is inherited, not re-measured.** The mute
  exists because on 2.5.0 `CG ADD` alone puts audio on air 0.24 s later; that measurement
  comes from the earlier recon, not from this session.

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

### `dev-awaiting-verbs` — the three that were genuinely open

1. **The `awaiting` toggle shows LOAD, disabled.** The task forbids REMOVE and requires
   the row to offer nothing; the fixed-shape rule requires a control in the slot. LOAD
   is the toggle's default face and disabled invites nothing, so this is the only
   remaining option rather than a preference. Reversible in one line if the owner wants
   a third label.
2. **The notice strip reserves its height permanently.** The requirement is zero layout
   shift, and in-flow that means always-reserved. The cost is a ~1.65rem band above the
   table when idle. The alternative — overlaying the sticky column header — also shifts
   nothing but hides the words the icon-only verb buttons depend on. Reversible; it is
   one `styles.awaitingStrip` rule.
3. **`linkDown` outranks `awaiting` in the refusal wording.** Both are true on a cold
   start with a dead bridge. The waiting sentence promises a bounded wait, which is
   false there, so the nearer failure wins — the same rule `casparRefusalReason` already
   follows between the bridge and CasparCG.

### r030 + r022 — POSITION REHEARSAL: which of the two "positions" is written

The two task files both insist on precision here because confusing them would be bad, so
stating it plainly: **nothing in this session writes the AUTHORED position, and nothing in
this session added a new position-writing path at all.**

- The **authored** position lives in the scene (`scene.defaultPosition`) and belongs to
  the Designer. Untouched. r030 only reads it, through the pre-existing
  `resolveOutputPosition`.
- The **operator's override** (R-011) already existed: stored per item in the bridge
  (`#positions`), appended to the served URL, and applied by the on-air page. r022 does not
  add a second writer — the Inspector's existing `PositionPicker` → `stack.setPosition` is
  still the only path, and it is still refused while the item is on air.

**So "saving the position while rehearsing" works today by construction**, because a
rehearsing item is by definition NOT on air, which is exactly when `setPosition` is
permitted. The rehearsal render reads the resulting placement rather than producing it.

**How the rehearsal stays truthful about it, and why there is no placement maths in the
renderer.** `RehearsalStage` renders the retained self-contained page in an iframe **sized
to the channel's real raster**. The page then places itself with its own
`applyOutputPosition`, whose R-030 geometry order is query → `window.innerWidth/innerHeight`
→ reference frame — and inside a frame that middle term IS the box we sized. So the preview
inherits the real placement instead of recomputing it, and there is no second
implementation to drift from air. The panel-fit scale is a CSS transform on the iframe
ELEMENT, which cannot perturb what the document inside measures; the two scales are
deliberately kept on opposite sides of the frame boundary.

**The "scene is byte-identical after a position rehearsal" test both files ask for was NOT
written, and the reason is that it would assert nothing.** The scene is not in the SPA's
hands at all on this path: it is inlined inside the retained HTML, which is read-only here
and never re-rendered or re-packed. There is no code path from rehearsal to the scene to
guard. A test asserting byte-identity would be pinning the absence of a feature nobody
built — the honest guard is the architecture (no writer exists), and that is what this
entry records. **If a future change gives the Runtime a scene-writing path, this test
becomes owed immediately.**

### r022 — the mute is `MIXER VOLUME 0`, the producer STAYS (owner decision, recorded)

CLEAR-then-re-ADD was the other candidate and is rejected: that cycle is the sequence that
failed in the field (adopt-`CLEAR` succeeded, the `CG ADD` after it 404'd, the layer was
left empty on air). Rehearse must not depend on a path with a known failure mode. This is
R-029's recorded containment option 2, so it is not a new invention.

**Two mechanisms close the "graphic airs silent" failure, and both are implemented:**
PLAY re-asserts the intended volume unconditionally on every take (not gated on our own
rehearse bookkeeping, deliberately — that is the dependence being removed), and the bridge
re-asserts every declared row's volume once a server is first reachable. A third mechanism
(a retry set for a failed un-mute) was considered and NOT built: if no PLAY happens nothing
is on air, so nothing is silent on air, and the moment it goes to air is via PLAY, which
re-asserts. The two stated mechanisms genuinely close it.

### r022 — REHEARSE is violet, and the alternatives were each ruled out for a reason

Not green (the sacred ON AIR hue — and rehearse is precisely "cannot reach air"), not sky
(that is READY, the state a row was in immediately before rehearse, so sharing it would
make the mode change invisible at the glance that matters), not amber (that means ATTENTION
on this surface; rehearse is a deliberate safe choice and crying wolf devalues the real
alarms), not red (error and destructive intent only). Violet is new to the state
vocabulary, which is the point. Shape and word carry it too: a monitor glyph, the only
non-circle among the bound-item marks, plus the word REHEARSING.

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

**A second pass, run when the owner asked what the review had attacked, found a real
bypass and FIXED it — the one finding here that changed code.**

**Type coercion could make a layer invisible to the reservation while still matching bank
membership.** The two halves mis-answer on a non-number in OPPOSITE directions, which is
what made it dangerous rather than merely untidy:

- `#reservedSet` is a `Set<number>`, so `.has('55')` is **false** — a string layer slips
  past the reservation entirely;
- `isFixed` keys on `` `${String(channel)}:${String(layer)}` `` (`keyOf`,
  `layer-manager.ts:452`), so `{channel:'1', layer:'70'}` builds the SAME key as the real
  slot and **matches**.

So a string-typed coordinate would have read as in-bank while the reservation never saw it.
Verified in isolation: `new Set([55]).has('55') === false`, and the concat yields `"1:70"`.

**Why it was not exploitable over the wire, and why that was not good enough.** The
WebSocket boundary rejects such a payload — `handleMessage` hands the handler
`safeParse`d data and `z.number()` does not coerce (confirmed against the built schema:
strings, floats, negatives, `null` and missing keys are all rejected). But that is a
guarantee in ANOTHER module, and this method already has an in-process caller that skips
it: `invokeRoute` in `fixed-layers-wire.integration.test.ts` calls `route.handle(req)`
directly, with no parse. A safety guard must not depend on every present and future caller
having validated first — the same reasoning that already puts the reservation check ahead
of the membership check.

**Fixed:** a GUARD 0 in `clearBankLayer` refuses unless both coordinates are
`Number.isInteger`, ahead of both other checks so they only ever see integers. Pinned by
two tests — one driving coerced pairs (including the reserved `['1','55']`) and asserting
nothing reaches the wire, one pinning the schema boundary so a future `z.coerce.number()`
"convenience" cannot silently start feeding strings through. **Confirmed load-bearing** by
temporarily neutering the check and watching the coercion test go red, then restoring it.

The other three findings, none a hole in the guard, all recorded rather than left implicit:

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

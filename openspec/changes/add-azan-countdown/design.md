# Design — azan countdown: time-of-day target + composition-deep colour zones (D-141)

Design-only. Every claim below is anchored to disk at `file:line` as read on 2026-07-28 at
`78dbcc7`. Requirements source: `docs/prd/designer.md:3707-3786` (D-141), with
`docs/prd/designer.md:3641-3670` (D-139) read first per §1.

---

## 1. Relationship to D-139 — the boundary

The owner's decision (the two stay SEPARATE mechanisms) is implemented here. The decision was
verified against the D-139 text on disk before being written down, per the stop condition.

### What the disk says

|              | D-139 (`designer.md:3641-3670`)                                                                   | D-141 zones (`designer.md:3707-3786`)                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Effect reach | "overrides exactly ONE property of ONE target element" (`:3646-3647`)                             | "any element in that composition's subtree can OPT INTO per-zone overrides" (`:3727-3728`)                                                                         |
| Cascade      | "NO cross-element cascades in v1 — the rule list is the whole surface" (`:3664-3665`)             | "This crosses nested-composition-instance boundaries: an element inside a nested composition restyles from the ENCLOSING composition's active zone" (`:3729-3731`) |
| Scoping      | none — a rule names its target element by id                                                      | "Inheritance is nearest-wins — a nested composition with its own zoned countdown governs its own subtree" (`:3731-3733`)                                           |
| Selection    | ordered rule list, FIRST MATCH WINS (`:3643`)                                                     | ordered thresholds on remaining time (`:3721-3722`)                                                                                                                |
| Inputs       | a bound field's value (number or string) **OR** a countdown clock's remaining time (`:3644-3645`) | a countdown clock's remaining time only                                                                                                                            |
| Properties   | colour/fill, image assetId, **visibility** (`:3646`)                                              | colour only (text / background / fill / stroke) — no image, no visibility                                                                                          |

**The boundary holds, and zones are not a subset.** D-139's own Notes forbid cross-element
cascades entirely (`:3664`); it therefore cannot express "one countdown restyles nine elements,
three of them inside a nested composition instance", which is D-141's whole point
(`:3726-3734`). Conversely D-139 owns two things zones do not: non-time inputs (a bound field's
number/string) and non-colour effects (image assetId, visibility). Neither mechanism contains the
other.

Read the other way round: implementing zones ON TOP of D-139 would require one D-139 rule list
per opted-in element, each duplicating the same thresholds, each needing a cross-composition
element address D-139 has no syntax for — and re-authoring all of them whenever a boundary moves.
That is the "expression engine" complexity D-139's Notes explicitly reject (`:3664-3665`).

### What each mechanism owns

- **D-139 owns:** the rule LIST — arbitrary comparators (`=, ≠, <, ≤, >, ≥, between`) over
  arbitrary inputs, targeting ONE property of ONE named element, with image and visibility
  effects. Precision, no reach.
- **D-141 owns:** the SCOPE — one countdown broadcasting one named zone down a composition
  subtree, crossing instance boundaries, nearest-enclosing-wins, colour only. Reach, no
  arbitrary predicate.

### Shared semantics — what D-139 must REUSE, not re-invent

D-139's v1 input list includes "a countdown clock's remaining time" (`:3644-3645`) and its Why
cites this exact azan colour case (`:3649-3650`). The two mechanisms will therefore read the same
quantity and compare it the same way. CLAUDE.md golden rule 6 applies literally: a second local
copy of a threshold predicate is how a name comes to lie about what it tests. This change
therefore lands these as SEPARATELY EXPORTED, dependency-free helpers in
`@cg/template-runtime`, deliberately reusable by D-139:

1. **`remainingMsOf(driver)`** — the ONE source of a countdown's remaining ms. Today the
   computation is `private remainingMs()` (`packages/template-runtime/src/clock-driver.ts:231-236`);
   this change promotes it to a public read so nothing outside the driver ever re-derives
   `Date.parse(target) - now`.
2. **`resolveTimeOfDay(time, nowMs)`** — next-local-occurrence resolution (§3). Any future
   feature that names a time of day resolves it here.
3. **`pickByThreshold(steps, remainingMs)`** — first-match-wins over strictly-decreasing
   `atOrBelowMs` steps, with the boundary rule of §5.3. D-139's `≤ 60min` / `≤ 10min` threshold
   rules are exactly this function with a different payload.
4. **`zoneColorTargets(element)`** — element kind → the CSS property each colourable slot writes
   (§2.4). D-139's `colour/fill` effect must paint the SAME property on the SAME node, or a
   rectangle would recolour differently depending on which feature drove it.
5. **The write discipline** — a `lastKey` latch so a crossing writes the DOM exactly once
   (§5.4). D-139's live re-evaluation inherits the same rule.

**Deliberately NOT shared:** the scope-root broadcast and the custom-property publication (§5).
D-139 has no scope concept and must not grow one here — that IS the boundary.

### Consequence for sequencing

Neither item blocks the other. If D-139 lands first, zones still need §5 wholesale (D-139
contributes nothing to reach). If D-141 lands first, D-139 gets helpers 1–5 for free and its rule
engine reduces to `pickByThreshold` + an effect applier. The second ordering is cheaper, which is
consistent with D-141 being `priority: high` (`:3707`) and D-139 `priority: medium` (`:3641`).

---

## 2. Schema shape

### 2.1 The target union (additive)

`ClockTargetSchema` (`packages/shared-schema/src/elements.ts:242-248`) gains a third member:

```ts
z.object({
  kind: z.literal('timeofday'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
});
```

The pattern is the existing `Time (HH:MM)` preset regex
(`apps/designer/src/renderer/features/inspector/pattern-presets.ts:65` —
`^([01][0-9]|2[0-3]):[0-5][0-9]$`) with an optional `:ss` group. Two spellings of the same
constraint would drift; the shared-schema regex is the canonical one and the preset stays the
Designer-side authoring aid for the operator-facing FIELD (§4).

### 2.2 Zones on the clock

```ts
const ZoneKeySchema = z.string().min(1); // free-form; see §6

const ClockZoneStepSchema = z.object({
  atOrBelowMs: z.number().int().nonnegative(), // remaining ≤ this ⇒ this zone
  key: ZoneKeySchema,
  color: HexColorSchema, // the zone's canonical colour
});

const ClockZonesSchema = z
  .object({
    base: z.object({ key: ZoneKeySchema, color: HexColorSchema }).optional(),
    steps: z.array(ClockZoneStepSchema).min(1),
  })
  .superRefine(/* strictly decreasing atOrBelowMs; keys unique across base + steps */);
```

`ClockElementSchema` (`elements.ts:261-340`) gains `zones: ClockZonesSchema.optional()`.

- **Ordered thresholds on REMAINING time, strictly decreasing, at least one** — `.min(1)` plus a
  `superRefine` that rejects a non-decreasing pair, satisfying D-141's
  "boundaries validate (strictly decreasing, at least one)" (`designer.md:3763-3764`).
- **`base` is the zone ABOVE the highest threshold.** The 4-zone 60/30/10 preset
  (`designer.md:3722-3724`) is `base` = green plus three steps (60 min amber, 30 min orange,
  10 min red) — 3 boundaries, 4 zones, exactly as the client's case reads. `base` is OPTIONAL:
  absent ⇒ no zone is active above the first threshold and every override is inert there (the
  same code path as §5.5), so a designer who only wants "red under 10 minutes" writes one step
  and nothing else.
- **Each zone carries a colour**, honouring D-141's "each opening a named zone with a color"
  (`:3721-3722`) verbatim. §2.4 explains how an element consumes it.
- **Countdown-only, two layers.** The existing `superRefine`
  (`elements.ts:332-339`) already enforces "countdown requires a target"; it gains a second
  issue: `zones` present with `mode !== 'countdown'` is a validation ERROR, so it cannot be
  authored. The runtime ALSO ignores `zones` for non-countdown modes, so a hand-edited `.vcg`
  degrades to base styles rather than misbehaving. D-141's acceptance says wall/countup "ignore
  zones" (`:3769`); both statements hold — the schema refuses to write it, the runtime refuses to
  act on it.

### 2.3 Per-element opt-in overrides

```ts
const ZoneColorSchema = z.union([HexColorSchema, z.literal('zone')]);

const ZoneOverrideSchema = z
  .object({
    zone: ZoneKeySchema,
    textColor: ZoneColorSchema.optional(),
    backgroundColor: ZoneColorSchema.optional(),
    fill: ZoneColorSchema.optional(),
    stroke: ZoneColorSchema.optional(),
  })
  .superRefine(/* at least one of the four present */);
```

`ElementBaseSchema` (`elements.ts:23-51`) gains
`zoneOverrides: z.array(ZoneOverrideSchema).optional()`, with a per-element `superRefine` that
rejects duplicate `zone` keys.

- **Why `ElementBaseSchema` and not each element type:** it is already this repo's home for
  optional cross-cutting element properties applied "to every element type by the runtime when
  present" — `filter` (`elements.ts:32-36`), `lifespan` (`:37-44`), `timelineColor` (`:45-50`).
  One edit covers every kind, including the clock itself.
- **The minimum colourable set is exactly the four the prompt names** — text colour, background
  colour, shape fill, shape stroke — and it maps 1:1 onto the properties the existing `color`
  binding target already writes: `fill` → `style.background`, `stroke` → `style.borderColor`,
  `text` → `textRenderNode(el).style.color`
  (`packages/template-runtime/src/bindings.ts:157-173`). Reusing that map is what keeps a
  rectangle recolouring identically whether a zone or an operator's colour field drove it.
- **`'zone'` is the ergonomic default value.** The common case — "in the danger zone I take the
  danger colour" — is one word; an element that wants a DIFFERENT colour in that zone writes its
  own hex. Without it, the 4-zone preset would have to stamp four hex values onto every opted-in
  element and a later palette change would have to walk them all.
- **The clock restyles through the SAME mechanism.** D-141 says "The clock's own band/text
  restyles per zone" (`:3724`); the clock is an element in its own subtree, so it opts in with
  `zoneOverrides` like anything else. D-056 removed the clock's box styling
  (`openspec/specs/designer-clock-element/spec.md:130,142-145`), so the clock's own slot is
  `textColor`; a "band" is a separate shape layer with its own override. The preset seeds both in
  one action (§7). One mechanism, no special case.

### 2.4 The colourable-property map

| Element kind                                                   | `textColor`        | `backgroundColor`      | `fill`                     | `stroke`                      |
| -------------------------------------------------------------- | ------------------ | ---------------------- | -------------------------- | ----------------------------- |
| `text`, `ticker`, `clock`, `sequence`                          | glyph node `color` | box `background-color` | —                          | —                             |
| `shape`, `path`                                                | —                  | —                      | `background` / shape paint | `border-color` / stroke paint |
| everything else (`image`, `video`, `lottie`, `composition`, …) | —                  | box `background-color` | —                          | —                             |

Slots a kind does not own are INERT, never an error — the same stance `filter` takes
(`elements.ts:32-36`, applied "when present"). This table is helper 4 of §1 and is the contract
D-139's colour effect must also honour.

### 2.5 Binding target (additive)

`BindingTargetSchema` (`packages/shared-schema/src/bindings.ts:17-78`) gains
`z.object({ kind: z.literal('clock-target'), elementId: IdSchema })`. Directly precedented: the
union has been widened five times already for driver-routed targets — `ticker-items` (`:51-55`),
`sequence-items` (`:56-60`), `sequence-item-text` (`:61-72`), `repeater-items` (`:73-77`),
`lottie-override` (`:45-50`).

### 2.6 Is the whole widening additive? Yes — no schema-version bump

- Every new FIELD is `.optional()`: `zones` on the clock, `zoneOverrides` on the element base. A
  scene authored before this change parses byte-identically — the same argument D-103 recorded
  for `blinkColon` (`elements.ts:311-315`) and D-084 for `timezone` (`:303-310`).
- Both UNION widenings are additive: a value that validated against the old union still validates
  against the superset. `discriminatedUnion` on a new literal cannot collide with an existing
  member.
- `SceneSchema.schemaVersion` stays `z.literal(1)`
  (`packages/shared-schema/src/scene.ts:246`); `CURRENT_SCHEMA_VERSION = 1` and the migration
  registry stays empty (`packages/shared-schema/src/migrations/index.ts:19-31`). A migration
  exists to let an OLD document parse against a NEW schema; nothing here makes an old document
  unparseable, so there is nothing to migrate.

**The one honest caveat, stated rather than hidden:** forward compatibility is not symmetric. A
`.vcg` that USES `timeofday` or `clock-target` will not load in a build predating this change —
the old union rejects the new literal. That is true of every union widening this repo has shipped
(D-028/D-029/D-030 each did it without a bump) and the version field does not currently encode
it. Not a reason to bump: bumping to `2` would demand a migration that has no work to do, and
would make every scene written after this change unreadable by older builds even when it uses
none of the new members.

---

## 3. `timeofday` semantics

### 3.1 Next-local-occurrence, on the rendering machine's clock

```
resolveTimeOfDay(time, nowMs) -> epochMs
  d = new Date(nowMs)
  candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, ss ?? 0, 0)
  if candidate.getTime() <= nowMs: candidate.setDate(candidate.getDate() + 1)
  return candidate.getTime()
```

- **Local-field construction is the point.** `new Date(y, m, d, hh, mm, ss)` builds from LOCAL
  calendar fields, so DST transitions are resolved by the platform rather than by arithmetic on a
  fixed 86 400 000 ms day. `setDate(+1)` likewise rolls the local calendar day, not 24 hours.
- **`<=` not `<`:** at exactly the target instant the countdown has arrived, not restarted.
- **The machine's clock is deliberate.** `wall` mode takes an optional IANA `timezone`
  (`elements.ts:303-310`) but "`countup`/`countdown` ignore it" (`:307`), and the driver honours
  that (`clock-driver.ts:44-47`). `timeofday` keeps the countdown family's rule: the operator
  types the OFFICIAL local announced time and the playout machine is in the broadcast's zone.
  A per-target zone would be a NEW axis on a family that has never had one; it is recorded as a
  future widening, not smuggled in here.

### 3.2 An absolute time base, pinned once per run

`timeofday` joins `datetime` on the ABSOLUTE side:

- `ClockDriver.isAbsolute` (`clock-driver.ts:135-139`) returns true for it, so the clock ticks
  from the play cascade onward like a real deadline (`:130-134`).
- `remainingMs()` (`:231-236`) returns `pinnedDeadlineMs - clock.now()`.
- `clockInitialText` (`:75-85`) resolves against `nowMs` for the static build-time paint, exactly
  as the existing comment already anticipates for time-dependent targets (`:68-73`).
- A pause never delays it (`:16-18`).

**The pin is the load-bearing decision.** The resolved epoch deadline is computed ONCE, at
`start()` / `reset()` (`:146-154`, `:199-214`), and held for the whole run. It is NOT re-resolved
per paint. Two reasons, both from the driver's own contract:

1. **A per-paint resolve can never reach zero.** The moment `remaining` hits 0 the "next
   occurrence" becomes tomorrow, so the very next frame would paint `23:59:59` — a countdown that
   jumps from 00:00 to a full day, on air.
2. **`whenComplete()` must resolve exactly once per run** (`:20-23`, `:160-161`,
   `:259-266`) and a countdown clamped at zero is what closes a `content-driven` hold
   (`runtime.ts:664-674`). A target that silently re-arms would keep the hold open forever — the
   graphic never leaves air.

Re-resolution therefore happens at exactly two moments: a fresh run (`reset()`/`start()`), and an
explicit re-target (§4.3). Both are events, never a side effect of a paint.

### 3.3 At and after zero

Unchanged from the existing countdown contract, which is the acceptance
(`designer.md:3746-3748`): the display clamps at zero and never goes negative
(`clock-driver.ts:84`, `:247`), `whenComplete()` fires once, the driver stops itself
(`:261-266`), and hold / auto-out semantics are untouched. A `timeofday` whose next occurrence is
somehow already past at run start behaves like a past `datetime`: paints 0 and completes
immediately (`:22-23`) — with the pin, `resolveTimeOfDay` cannot actually produce that, which is
a property worth asserting in a test rather than assuming.

**Zones at zero:** the last step wins and STAYS. `pickByThreshold` is evaluated on the clamped
remaining, so remaining 0 selects the lowest `atOrBelowMs` step and holds there while the display
sits at 00:00. The graphic does not flip back to base the instant it arrives.

---

## 4. Playout data path — a scene field drives the target

### 4.1 Field representation: an existing `text` field + `pattern`. No new field type.

**Settled: reuse `text`.** Evidence, in the order that decides it:

- **GDD has no time type and never will at v1.** `GddProperty.gddType` is exactly
  `'single-line' | 'multi-line' | 'color-rrggbb'`
  (`packages/vcg-format/src/gdd.ts:44`). A new `time` DynamicField would have to be emitted as
  `type: 'string'` with a `pattern` anyway — which is precisely what a `text` field with a
  `pattern` ALREADY emits (`gdd.ts:172-181`, passing `minLength`/`maxLength`/`pattern` straight
  through). The new type would buy zero GDD expressiveness and would owe a preflight warning, the
  way `image` and `list` do (`exporter-single-file.ts:284-304`).
- **The Runtime Inspector renders `text` today, and a new kind needs a new branch in a second
  app.** `FieldControl` is an explicit per-kind branch chain — `boolean` (`Inspector.tsx:366`),
  `number` (`:377`), `color` (`:380`), `select` (`:391`), `image` (`:408`), `multiline` (`:426`) —
  with text as the fallthrough. A `time` kind would render as an unstyled fallthrough until
  `apps/runtime` grew a branch, turning a Designer-track change into a cross-app one for no
  operator-visible gain. With `text`, **`apps/runtime` needs no change at all.**
- **The validation preset already exists, vetted and anchored.**
  `pattern-presets.ts:65` ships `Time (HH:MM)` = `^([01][0-9]|2[0-3]):[0-5][0-9]$`, example
  `21:30`, and the living spec requires every preset be anchored, flagless, and Persian/Arabic-
  Indic tolerant where relevant (`openspec/specs/designer-dynamic-fields/spec.md:211-228`). The
  operator gets input validation with zero new code.
- **R-018 "from file" comes free.** Text-carrying fields already accept a file source
  (`apps/runtime/src/renderer/features/inspector/Inspector.tsx:321-323`), so a station that keeps
  today's azan time in a text file can already wire it — which is the R-track schedule-import
  follow-up's cheapest possible interim answer, with no work here.

**Rejected: a new `time` DynamicField type.** Costs a `fields.ts` union member
(`packages/shared-schema/src/fields.ts:98-107`), a `FieldValue` story, a GDD mapping that
degrades to string+pattern regardless, an `apps/runtime` Inspector branch, and a compatibility
story for older GDD clients — in exchange for nothing the `pattern` does not already give.
Recorded here so it is not re-proposed.

**Consequence to accept openly:** `text` + `pattern` is a CONSTRAINT, not a guarantee. GDD
clients are not obliged to enforce `pattern`, so the runtime must treat the incoming value as
untrusted and validate it itself (§4.2). That is true of every string field today.

### 4.2 Binding application — a driver seam, not the DOM walk

`clock-target` is applied through the driver, NOT by `applyOne`'s DOM walk. The precedent is
exact: `sequence-item-text` returns from `applyOne` with a comment saying the value flows through
the driver's own seam instead (`packages/template-runtime/src/bindings.ts:265-271`), and the
runtime re-applies it via `reapplySequenceItemFields()` (`runtime.ts:1541-1544`) called from both
`play()` (`:1713`) and `update()` (`:1794`).

This change adds the sibling `reapplyClockTargets()`, called from the same two places:

```
for each scope subtree, for each clock driver with a bound clock-target:
  raw = the binding's current value (field default when absent — bindings.ts:84)
  parsed = parseTimeOfDay(raw)          // the §2.1 regex
  if parsed === undefined: KEEP the current target, report once, do nothing else
  else: driver.retarget({ kind: 'timeofday', time: parsed })
```

- **An unparseable value applies NOTHING.** The current, possibly on-air target is kept. This is
  the house rule for operator input reaching air, already spelled out for R-018's failed read:
  "A failed read applies NOTHING — the current (possibly on-air) value is kept"
  (`openspec/changes/runtime-field-from-file/proposal.md`, "Missing-file safety"). Never a
  countdown blanked or reset to zero because of a typo.
- **`retarget()` is a no-op when the resolved deadline is unchanged**, so the repeated
  `CG UPDATE`s a control app sends cost nothing.

### 4.3 `retarget()` — the driver contract

New method on `ClockDriver`. **What it does:**

| Resets                                                                                                 | Does NOT reset                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| the stored `target` and the pinned deadline (re-resolved from `clock.now()`)                           | the RUN — `running` / `paused` stay exactly as they were; no replay, per acceptance `designer.md:3751-3753`         |
| the completion latch + a FRESH `whenComplete()` promise, **only if** the new deadline is in the future | `pausedAccumMs` and `startedAt` — a `timeofday` target is absolute and never reads them (`clock-driver.ts:231-236`) |
| `lastText`, forcing an immediate repaint so the operator sees the new value at once                    | the colon-blink phase (`:287`), which is `now`-derived, not run-derived                                             |
| the active zone — re-evaluated immediately, one attribute write (§5.4)                                 | the scope's lifecycle, other elements, other drivers                                                                |

**The boundary that must be stated, not discovered on air:** re-targeting a countdown that has
ALREADY completed re-arms the DISPLAY, but cannot re-open a `content-driven` hold that has already
closed. `contentDrivers` registers a thunk `() => driver.whenComplete()` (`runtime.ts:672`), so a
LATER read does see the fresh promise — but the scope's aggregation awaited the OLD one and has
already moved on; a resolved gate is not un-resolved by minting a new promise. Operator-facing
consequence: re-target a LIVE countdown freely; to re-run one that already hit zero, replay. This
is a documented limit of this change, not a defect to paper over.

**Pause interaction:** `retarget()` while paused updates the pinned deadline and repaints once
(the driver already repaints the true value on `resume()` for absolute clocks —
`clock-driver.ts:174-184`). An absolute deadline keeps approaching while paused; that is the
existing, correct `datetime` behaviour and `timeofday` inherits it unchanged.

---

## 5. Zone application mechanism

D-141's Notes offer a shape and explicitly leave it to design: "a suggested shape — per-zone style
overrides compiled to CSS rules plus a scope-root attribute flipped by the ClockDriver, CSS
transition for the morph — is design's to accept or replace" (`designer.md:3772-3774`).

**Verdict: ACCEPT the scope-root attribute, the compiled CSS, and the CSS transition. REPLACE the
"compiled to CSS rules" half with compiled CSS CUSTOM PROPERTIES.** The plain-rule form cannot
express nearest-wins on this engine; the custom-property form gets it for free.

### 5.1 Why the plain-rule form fails

The natural compilation of "element E is red in zone `danger`" is

```css
[data-cg-zone='danger'] [data-cg-zone-el='E'] {
  color: #ff0000;
}
```

Now take D-141's own nearest-wins case (`:3731-3733`, acceptance `:3761-3762`): a host in zone
`warning` containing a nested composition in zone `danger`, with E inside the nested composition.
E is a descendant of BOTH zone roots, so it matches BOTH rules. The two selectors have
**identical specificity** (0,2,0), so the winner is source order — whichever rule the compiler
happened to emit last. Source order has no relationship to DOM nesting, so the result is
arbitrary, and stable-looking in whatever case you test first.

The CSS features that fix this are all past the engine floor:

- `@scope (…) to (…)` — the exact donut-scope primitive — is Chrome 118.
- `:is()` / `:where()` specificity control is Chrome 88.

The floor is **Chromium 71**: "Every CasparCG-facing JS artifact SHALL run on the CEF baseline —
**Chromium 71** (CasparCG 2.3 LTS, the declared support floor)"
(`openspec/specs/runtime-onair-cef-compat/spec.md:11-12`), and the exported page says the same for
CSS in its own head comment: "CEF-compat: keep CSS within common CasparCG builds (CEF 63=2.2,
71=2.3.x, 117=2.4.x) — avoid bleeding-edge properties"
(`packages/single-file-export/src/exporter-single-file.ts:403-404`). Note the low end is **63**.

Emitting per-nesting-depth selectors to force specificity is the other escape, and it is worse: it
needs a compile-time depth bound, it re-breaks the moment the same composition is instanced at two
depths, and it multiplies rule count by depth.

### 5.2 The mechanism — custom properties, inheritance does the scoping

**CSS custom properties are Chrome 49** — under even the 63 low end — and they INHERIT, which
means a nearer declaration wins over a farther one by construction. That is nearest-wins, spelled
in the cascade instead of in a selector.

Compiled once per scene, into a single `<style id="cg-zones">`:

```css
/* PUBLICATION — every zone root currently in zone K publishes zone K's palette. */
[data-cg-zone='danger'] {
  --cgz-7-text: #ff0000;
  --cgz-12-fill: #ff0000;
}
[data-cg-zone='warning'] {
  --cgz-7-text: #ffa500;
  --cgz-12-fill: #ffa500;
}

/* CONSUMPTION — each opted-in element reads its slot, falling back to its authored value. */
[data-cg-zone-el='7'] {
  color: var(--cgz-7-text, #ffffff);
}
[data-cg-zone-el='12'] {
  background-color: var(--cgz-12-fill, #202020);
}

/* MORPH */
[data-cg-zone-el] {
  transition:
    color 400ms ease,
    background-color 400ms ease,
    border-color 400ms ease,
    fill 400ms ease;
}
```

Walk the hard case through it: host root `[data-cg-zone="warning"]` sets `--cgz-7-text` to amber
and it inherits down; the nested root `[data-cg-zone="danger"]` re-declares it red on its own
subtree; E reads the nearest declaration and paints **red**. Nearest enclosing zoned scope wins —
`designer.md:3762` — with no selector gymnastics and nothing newer than Chrome 49.

**The transition works on the PROPERTY, not the variable.** `transition: color` animates whenever
`color`'s used value changes, including when the change came through `var()`. No `@property`
registration (Chrome 85) is needed — which matters, because that too is past the floor.

### 5.3 Threshold and boundary semantics

`pickByThreshold(steps, remainingMs)`: walk `steps` in authored order (strictly decreasing
`atOrBelowMs`) and take the FIRST step whose `atOrBelowMs >= remainingMs`; if none matches, the
zone is `base` (or none, when `base` is absent).

**Evaluated on the DISPLAYED quantum, not the raw ms.** The countdown paints
`ceil(max(0, remaining) / 1000)` seconds (`clock-driver.ts:245-247`), so zones compare
`ceil(remaining/1000) * 1000` against `atOrBelowMs`. Reason: with raw ms, a 60-minute boundary
flips while the digits still read `60:00` (they read `60:00` for the whole final millisecond-run
of that second) — the colour would visibly lead the number by up to a second, on the one frame
an operator is looking at. Sharing the driver's own quantum makes the colour change on exactly
the frame the digits reach the boundary. This rule is part of helper 3 (§1) so D-139 inherits it.

**Exactly once at a boundary** (`designer.md:3754-3756`): the driver holds `lastZoneKey` and
writes only on change (§5.4). Because the comparison is on a monotonically decreasing quantised
value, there is no oscillation to debounce — the sequence of selected keys is monotone by
construction. Worth an explicit test at the exact boundary ms, and at ±1 ms either side.

### 5.4 Who writes what, and how often

The **ClockDriver** owns the zone, because it already owns the remaining time and already runs
the only loop:

```
paint():                                  // clock-driver.ts:251-267, unchanged in shape
  … existing text repaint (only when the string changed) …
  if zones configured:
    next = pickByThreshold(steps, quantisedRemaining)
    if next !== lastZoneKey:               // the latch
      scopeRoot.setAttribute('data-cg-zone', next)   // or removeAttribute for "no zone"
      lastZoneKey = next
```

- **The ~1-DOM-write/second discipline is intact and then some.** The text write is already gated
  on a changed string (`clock-driver.ts:250-258`, doc comment `:8-10`). The zone write is gated on
  a changed KEY — for the client's 4-zone case that is **three writes in an entire hour**, not one
  per second. Zone evaluation itself is pure arithmetic on a value `paint()` already computes.
- **One attribute on one node** flips arbitrarily many elements, because the cascade does the
  distribution. No per-element write, no walk, no `querySelectorAll` per frame.
- **The scope root is the driver's own scope container.** `FieldScope.container` is "This scope's
  container (root stage, or an instance's inner box)" (`packages/template-runtime/src/types.ts:328-329`)
  — the root stage for the scene, and the `.cg-comp-inner` div for a nested instance
  (`scene-builder.ts:237-238,252`). The driver is constructed per scope
  (`runtime.ts:635-654`), so the container is already in hand; it gains
  `data-cg-zone-root=""` at build time and `data-cg-zone` at run time.
- **`reset()` clears the zone** (`clock-driver.ts:199-214`) alongside the text and blink state, so
  a fresh run re-enters at the correct zone rather than inheriting the last run's colour.
- **`destroy()` removes the attribute**, so a torn-down scope leaves no stale zone behind.

### 5.5 Nested reach, inertness, mismatch

- **Nested instances react through the same DOM.** Verified: `buildComposition` creates `inner`
  in the SAME `ctx.doc`, appends every child layer into it (`scene-builder.ts:272-274`) and
  appends `inner` into the instance box (`:275`) — one document, one cascade, no iframe, no shadow
  root. Descendant inheritance therefore reaches an element inside a nested composition instance
  with nothing extra. (Depth and cycles are already bounded at `:229-235`.)
- **Inert with no enclosing zone** (`designer.md:3759-3760`): no ancestor sets `--cgz-N-*`, so
  every `var()` falls back to its authored value. This is the SAME code path as a standalone
  preview of the nested composition — there is no separate "unzoned" branch to get wrong.
- **A key mismatch is inert, by the same fallback.** If a nested element overrides `danger` but
  the enclosing countdown's zones never emit `danger`, nothing ever publishes that element's
  slot and it renders authored. Free-form keys are therefore SAFE at runtime, which is what let
  §6 settle the vocabulary as an authoring affordance rather than a validation boundary. This
  runtime inertness is deliberate and permanent — never fail on air — and it is precisely why the
  DESIGNER must not be silent about the same mismatch (§7.3).

### 5.6 Compiled-CSS hygiene

- **Slots are keyed by a per-scene INDEX, not by the element id.** `IdSchema` is
  `z.string().min(1)` (`packages/shared-schema/src/primitives.ts:7`) — an arbitrary string, with
  no guarantee of being a CSS ident or of surviving quoting inside an attribute selector. The
  compiler assigns a deterministic index per opted-in element (stable scene walk order) and emits
  `--cgz-<n>-*` / `data-cg-zone-el="<n>"`, so no author-controlled string ever reaches a selector
  or a property name. Same class of care as the exporter escaping `</` before embedding scene text
  (`exporter-single-file.ts:378-380`) and B-066's literal replace-all
  (`packages/template-runtime/src/bindings.ts:134-140`).
- **Zone KEYS do appear in `[data-cg-zone="…"]` selector values**, so the compiler escapes them
  (and the driver writes them through `setAttribute`, which never parses). An unescapable key is
  dropped with a build warning rather than emitted.
- **Colours are `HexColorSchema`-validated** (`primitives.ts:14-16`), so no arbitrary text reaches
  a declaration value.

### 5.7 Preview / export parity — structurally, not by discipline

The zone CSS is emitted **by the runtime, from the scene**, in a `<style id="cg-zones">` injected
beside the baseline block — `ensureBaselineCss(doc)` at `runtime.ts:397` is the injection-site
precedent, and `css.ts:28-35` the idempotent-inject pattern to copy.

That single placement gives parity for free: the single-file export embeds the scene JSON and
boots `CG.createRuntime(scene, …)` (`exporter-single-file.ts:421-423`), so the exported page runs
the same compiler over the same scene and gets byte-identical rules. **Neither exporter changes.**
`cgCss` stays what it is — "Minimal broadcast baseline CSS" (`exporter-single-file.ts:37-38`), a
static string — and is not taught about scenes.

This is why D-141's "Preview and single-file export behave identically (same runtime source)"
(`:3735-3736`) is a structural property here rather than a thing to remember to keep true.

---

## 6. The host ↔ nested zone-key contract

**Settled at the schema and runtime layers** (which the prompt requires be settled):

- **Schema:** `ZoneKeySchema = z.string().min(1)` — free-form. Not an enum.
- **Runtime:** the contract is a NAME MATCH, and a mismatch is INERT (§5.5) — the unmatched
  element renders its authored style. Never an error, never a fallback colour, never a crash.

The precedent is D-025's composition-scoped namespaces: fields are owned per composition
(`packages/shared-schema/src/scene.ts:184-192`) and a nested instance's values are addressed by
its user-editable NAME, resolved by string match at runtime — `values[child.name]`
(`packages/template-runtime/src/bindings.ts:95-101`), with a missing namespace falling back to the
child's own defaults (`openspec/specs/designer-dynamic-fields/spec.md:203`). Zone keys are the
same kind of object: a small string contract between a host and a shared child definition, matched
by name, degrading to the child's authored state when absent.

An enum was considered and rejected at the schema layer: D-141's own Notes leave "fixed semantic
set vs. free names" open (`designer.md:3777-3779`), a fixed set cannot express a template that
wants five or two zones, and — decisively — the custom-property mechanism makes an unknown key
harmless, so the schema has no safety reason to restrict it. Restricting it would be taste
enforced by validation error, which is the wrong layer.

### The Designer's key input: a PICKER with a Custom escape (CLOSED — owner decision)

The one question this design left open — free-text box vs. a picker over a fixed vocabulary —
is **closed: the picker**, over four canonical keys `normal` / `caution` / `warning` / `critical`,
with a "Custom…" option revealing free text.

The reasoning it was accepted on: the whole VALUE of the contract is that a shared nested
composition (D-107 — compositions are shared definitions, edited by drilling in,
`openspec/specs/designer-compositions/spec.md:46`) restyles under ANY host using the same
vocabulary. Free text with no default guarantees that two templates authored a week apart use
`danger` and `critical` and silently never match; a picker makes agreement the default and
disagreement deliberate. This is exactly how the pattern presets solved the same
"vetted-default vs. Custom (advanced)" problem for regexes
(`openspec/specs/designer-dynamic-fields/spec.md:211-228`), and that requirement's companion rule
applies verbatim: **Custom is a DISPLAY state, not a stored value** — the picker shows the
canonical key a stored value spells, and Custom otherwise, so a key authored before the picker
existed (or hand-edited in a `.vcg`) loads as Custom with its string intact.

**Note what did NOT change when this closed.** The schema stays `ZoneKeySchema =
z.string().min(1)` and the runtime stays name-match-with-inert-mismatch. The picker is an
authoring affordance over a free-form field, NOT a validation boundary: a scene carrying a custom
key remains valid, parses, and renders. Had the decision instead been "restrict the schema to
four keys", it would have moved both layers and broken every hand-authored key — which is why the
question was safe to leave open in the first place, and why closing it costs one component (§7.2).

The four canonical keys are also the 4-zone preset's keys (§7.1), so the preset and the picker
agree by construction rather than by two lists kept in sync.

---

## 7. Designer UX surface (design-level; no pixel specs)

### 7.1 The zones editor — on the clock inspector

Lives in the clock's inspector section, directly under the existing countdown target editor
(`apps/designer/src/renderer/features/inspector/StyleSection.tsx:1248-1290`, the `kind`
select + per-kind inputs at `:1264-1290`), and appears ONLY for `mode: 'countdown'` — the same
gate the target editor already uses (`:1248`).

- The target `kind` select gains a third option, `timeofday`, whose input is an `HH:mm` /
  `HH:mm:ss` text control. `DEFAULT_CLOCK_TARGET` (`StyleSection.tsx:1122-1123`) stays
  `duration`; switching to `timeofday` seeds a sensible time the same way switching to countdown
  seeds a target today (`:1178-1184`).
- The zones editor is an ordered, reorderable step list: `atOrBelowMs` (authored in minutes,
  stored in ms), key, colour swatch. It validates live — strictly decreasing, at least one, keys
  unique — with the offending row marked rather than the whole section refused.
- An optional base-zone row sits above the steps.
- **"Azan preset (60 / 30 / 10)"** is one action that stamps `base` + three steps AND the clock's
  own `zoneOverrides` (`textColor: 'zone'` for all four keys) as a SINGLE undo entry, so the
  preset produces something visibly working rather than a configured-but-inert clock.
- The section states, next to the target, that the countdown reaches zero at the next LOCAL
  occurrence — consistent with the existing inspector's habit of stating a clock's time-driven
  nature in place (`openspec/specs/designer-clock-element/spec.md:128-135`).
- The clock gains a **Dynamic / Data** affordance for its target. This SUPERSEDES the living
  spec's "The clock has NO dynamic fields in v1 (no data-key section)"
  (`openspec/specs/designer-clock-element/spec.md:130`) — see the MODIFIED delta.

### 7.2 The per-element zone-override section

A collapsible inspector section on any element, following the existing `CollapseSection`
convention (`apps/designer/src/renderer/features/inspector/CollapseSection.tsx`).

- **Shown only when an enclosing zoned countdown exists** — i.e. the element's own composition
  (the one currently open) contains a countdown with `zones`. Absent that, the section is hidden
  entirely rather than shown disabled: an override authored with no zone to react to is inert, and
  a control that does nothing is worse than no control.
- **Configured by drilling INTO the composition that owns the element**, never from the parent.
  This is D-107's precedent as stated in the living spec: compositions are shared definitions with
  no parent breadcrumb (`openspec/specs/designer-compositions/spec.md:46`), and D-141 restates it
  for zones (`designer.md:3775-3777`). Editing a nested comp's element from its host would edit
  the SHARED definition through a lens that hides that fact.
- **Only the slots the element's kind owns are offered** (§2.4) — a text element shows text +
  background, a shape shows fill + stroke.
- Each slot defaults to the zone's own colour (`'zone'`) with a swatch showing the resolved
  result, and an explicit-hex escape.
- **The zone key is chosen through the §6 picker** — `normal` / `caution` / `warning` /
  `critical` plus a "Custom…" escape, with Custom as a DISPLAY state so a stored custom key loads
  intact and re-displays as Custom.
- The nested case adds a line naming the enclosing composition's zone keys, so an override in a
  nested comp is authored against the vocabulary that will actually reach it (§7.3).

### 7.3 An unmatched zone key warns at author time

**Runtime behaviour does not change: inert-on-mismatch stays exactly as §5.5 specifies.** An
element whose zone key no enclosing zoned countdown defines renders its authored style — never an
error, never a fallback colour, never a crash. That is the correct behaviour on air and this
section does not touch it.

**But it must not be silent in the Designer.** When an element declares a zone key that NO
enclosing zoned countdown defines, the Designer SHALL surface a non-blocking authoring warning at
the override that declared it, naming the unmatched key and listing the keys the enclosing
countdown actually defines.

**Rationale, recorded because it is the whole point:** a typo is free to fix while authoring and
becomes an INVISIBLE NO-OP otherwise — the graphic renders, nothing errors, and the missing
restyle is discovered at 2 a.m. on air. The mechanism's greatest strength (a mismatch degrades
silently instead of breaking the render) is exactly what makes the mistake undetectable at the
one moment it is cheap to correct. The warning puts the cost back where it belongs. This is the
same instinct as the exporters' preflight, which WARNS rather than blocks for cases a client
cannot honour (`packages/single-file-export/src/exporter-single-file.ts:284-304`): non-blocking,
author-time, and about a silent degradation rather than a failure.

**PER-KEY, not per-element.** The check fires for EVERY unmatched key, not only when an element's
keys have empty intersection with the enclosing countdown's. The narrower empty-intersection form
misses the case that actually happens: overrides for `{warning, dangre}` under a countdown
defining `{warning, danger}` intersect non-emptily, so a whole-element check stays quiet while
the typo'd half never fires. The picker (§6) makes such a key rare; the warning is what catches
it when a Custom escape, a hand-edited `.vcg`, or a renamed zone on the countdown produces one.

**Where it appears:**

- On the element's own override row, in its own composition — the place the key was typed and
  the only place it can be fixed (compositions are shared definitions; §7.2).
- Also on the clock's zones editor when RENAMING a zone key would orphan existing overrides, so
  the rename is the moment the consequence is seen rather than the moment it is hidden.

**Non-blocking, and it cannot become blocking.** It never refuses a save, an export, or a play,
and it is not a schema error — a custom or currently-unmatched key stays valid (§6). An element
inside a composition previewed STANDALONE is not warned about: with no enclosing countdown at all
every override is legitimately inert (`designer.md:3759-3760`), which is a supported authoring
state, not a mistake. The warning is about a key that misses a zone set that EXISTS.

**Cost of ownership: none beyond the Designer.** No schema field, no runtime branch, no exporter
change, no effect on the compiled CSS. It is a pure author-time read over data the Designer
already has in hand — the open composition's clock `zones` and its elements' `zoneOverrides`.

### 7.4 Demonstrating zone flips without waiting an hour

**Settled — two mechanisms with distinct jobs, both session-only, neither persisted, neither
reaching an exporter.**

**(a) Primary: a preview time-compression factor on the injectable `RuntimeClock`.**
`RuntimeBootOptions.clock` already exists precisely so timing can be driven deterministically
(`packages/template-runtime/src/types.ts:169-174`, `:291-298`), and the clock driver already
normalises `raf` / `cancel` / `now` from it (`clock-driver.ts:117-122`). A preview control
("Rehearse zones ×N") supplies a clock whose `now()` advances N× real time. An hour of countdown
replays in a minute, through the REAL driver, over the REAL thresholds, in the REAL order, with
the real transitions — and, because the same code path runs on air, a rehearsal that looks right
IS evidence about air. D-141 names this shape itself ("mechanism decided in design — e.g.
injectable/mock clock", `:3765-3766`).

Two consequences to state rather than discover: the injected clock is the runtime's ONE clock, so
compression also speeds lifecycle timing for that preview run (acceptable, and honest — it is a
rehearsal, not playout); and the DISPLAYED digits tick N× too, which is what makes the boundary
visible in the first place.

**(b) Secondary: a static zone picker.** A preview control that forces `data-cg-zone` on the
previewed scope root, with no driver involvement, so a designer can check each zone's colours
while styling without running anything. The D-102 preview panel is the precedent for session-only
preview knobs that never touch the stored template
(`packages/template-runtime/src/types.ts:239-247,266-275`).

**Rejected: reusing D-102's `CountdownTimingOverride.durationMs` alone.** It replaces the target
with a short duration (`runtime.ts:636-643`), which is the right tool for rehearsing COMPLETION —
but a 90-second rehearsal sits entirely inside the last zone and demonstrates no boundary at all.
It remains available and untouched; it is simply not an answer to this acceptance.

---

## 8. What this design does NOT change

Recorded so review can confirm the blast radius:

- `apps/runtime` — no change. A `text` field already renders (§4.1).
- Both exporters — no change. The runtime emits the CSS from the embedded scene (§5.7).
- `schemaVersion`, `CURRENT_SCHEMA_VERSION`, the migration registry — no change (§2.6).
- The text-repaint path, colon blink, `drivesHold`, hold aggregation, `timezone`, digit mapping —
  untouched. Zones add one gated attribute write inside the existing `paint()`.
- `wall` / `countup` — untouched, and refused zones at the schema layer (§2.2).
- Runtime mismatch behaviour — unchanged by §7.3. The author-time warning is a Designer-only
  read; the runtime still renders an unmatched key's element with its authored style (§5.5).

## 9. Open questions

**None.** The one question this design opened — the Designer's zone-key input — was closed by the
owner in favour of the PICKER with a Custom escape (§6), and the author-time unmatched-key warning
it implied is specified in §7.3. Everything in §§2–7 is settled.

Two decisions were closed after the initial design and folded in; they are recorded here so a
later reader can see they were decided rather than assumed:

1. **Zone-key input = a picker** over `normal` / `caution` / `warning` / `critical` with a
   "Custom…" escape, on the pattern-preset precedent (§6). Schema and runtime unchanged — the
   picker is an authoring affordance over a still-free-form key, not a validation boundary.
2. **An unmatched zone key warns at author time** (§7.3), PER KEY. Runtime inert-on-mismatch
   stays exactly as it was (§5.5) — never fail on air — but the Designer stops being silent about
   a typo that is free to fix now and an invisible no-op at 2 a.m. otherwise. No schema field, no
   runtime branch, no exporter change.

# Design — Live Source multi-box

Evidence gathered 2026-08-03 against `dev` @ `a65383c`. Every `file:line` is as the file reads on
that commit; line numbers quoted inside PRD items and inside `DEBT.md` were re-located by symbol and
are **not** trusted.

**A convention used throughout.** Wherever this document asserts that something **does not exist**,
the assertion is followed by a `SEARCH:` line giving the exact command, the scope and the result.
An unevidenced absence gets re-derived by the next session; this repo has paid for that twice
(`DEBT.md:1301-1303`, `docs/prd/runtime.md:1302`).

---

## 0. Already settled — do not relitigate

D-137 (`docs/prd/designer.md:3557-3605`) and C-015 (`docs/prd/caspar.md:365-425`) fix the following,
and this design takes them as given: the user-facing name **Live Source**; the schema type stays
`video-placeholder`; the element carries a source id, an optional key source id, an
`expectedAspect` and an optional poster; the id is bindable through the existing fields/bindings
model; the authoring surfaces show **procedural SMPTE bars** plus the id label; both exports render
a **fully transparent hole**; **axis-aligned only in v1**, because `MIXER FILL` is axis-aligned.

## 0b. Measured on hardware, 2026-08-03 — the two facts the design rests on

Against CasparCG `2.5.0 69e8ad5`, `1080i5000` channel, two `route://1-1` producers read off the
screen consumer. **Both facts were subsequently re-confirmed QUALITATIVELY on the target build,
2.3.2 — see §3's cross-build check.** The pixel-accurate placement below is a 2.5.0 measurement and
was deliberately not repeated; what the design needs from 2.3.2 is the semantics, and it has them.

1. **`MIXER FILL x y x-scale y-scale` normalizes PER AXIS against the channel raster** — `x` and
   `x-scale` against width, `y` and `y-scale` against height. `FILL 0.1 0.2 0.3 0.4` on 1920×1080
   produced a box at ≈(192, 216) sized ≈576×432. The competing hypothesis (both axes against width)
   predicts 576×768 and was falsified.
   **Re-measured independently and to the pixel from a second screenshot:**
   `FILL 0.5 0.5 0.5 0.5` placed the box at exactly **(960, 540)** sized **960×540** on a 1920×1080
   channel. Two measurements, different argument values, same conclusion — this is the one term the
   whole geometry chain rests on, so it is recorded twice deliberately.
2. 🔴 **`MIXER FILL` STRETCHES.** It does not letterbox, pillarbox or crop. A 4:3 rect and a 16:9
   rect fed from the same route showed identical framing edge to edge — nothing was cropped, so the
   image was scaled non-uniformly to fill the rect.

Also confirmed on the wire: the producer form is `PLAY <ch>-<layer> "route://CHANNEL-LAYER"`;
**there is no `ROUTE` verb**; and `MIXER … CLEAR` is required to reset mixer state, because mixer
state survives `CLEAR` (the doctrine is already written down for `VOLUME` at
`tools/caspar-bridge/src/command-builder.ts:128-130`).

**Fact 2 is a design input, not a footnote.** It is why §3 and §6 below exist.

---

## 1. The carrier — how a declaration reaches the bridge

### The constraint, established before choosing

Three facts close off most of the option space:

- **No `.vcg` ever reaches the bridge.** The only production `unpack()` is in the browser
  (`apps/runtime/src/renderer/features/library/templateDelivery.ts:154`); what crosses the wire is
  `{ template: TemplateInfo, html }` (`:238`), stored opaquely
  (`tools/caspar-bridge/src/template-registry.ts:112-116`).
- **The bridge parses no HTML.**
  `SEARCH:` `git --no-pager grep -rn -e "JSDOM" -e "parse5" -e "cheerio" -e "DOMParser" -e "matchAll" -e "<script" -- tools/caspar-bridge/src` over all 12 bridge source files → the only regex-ish hits are a URL route (`template-http-server.ts:155`) and a layer-range parser (`reserved-layers-store.ts:76`). No parser, and no parser dependency in `tools/caspar-bridge/package.json`.
- **The scene is discarded after import.** `LibraryEntry` is `{ template, html }` and nothing else
  (`apps/runtime/src/platform/library/LibraryStore.ts:10-13`).

So anything the runtime will ever need must be **captured at the one import moment** or re-derived
from the retained HTML.

### DECISION — a `liveSources` declaration block on `TemplateInfo`, derived once at import

A new optional array on `TemplateInfoSchema` (`packages/shared-ipc/src/channels/templates.ts:14-70`),
populated in `produceTemplateDelivery` (`templateDelivery.ts:177-189`) beside the existing derived
facts, carried by `TemplatesImportChannel`, persisted by the bridge registry
(`template-registry.ts:168-193`) and by the browser's OPFS copy.

**The precedent is exact and shipped: `hasNext`** (`packages/shared-ipc/src/channels/templates.ts:53-69`),
derived once at import by a canonical predicate (`templateDelivery.ts:188`). Its docstring already
argues this case in full — a bit kept per browser "would light NEXT for the operator who imported
and hide it for everyone else, and would be lost on a bridge restart."

**Templates imported before this change** carry no `liveSources` block. Absent ⇒ **the template
declares no Live Sources** ⇒ the take behaves exactly as it does today: the template plays, and
nothing is composited. This is the same safe direction `hasNext` chose ("absent means NO",
`templates.ts:66-68`). It is not silent: a template whose scene contains a `video-placeholder` but
whose declaration block is absent is **re-import-required**, and the Runtime says so on the row.

### Rejected

| Option                                                                | Why not                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — a `.vcg` manifest section**                                     | The manifest never reaches the bridge, so a second carrier hop would still be needed. Also `ManifestSchema` is a plain `z.object` with no `.passthrough()` (`packages/shared-schema/src/manifest.ts:53-76`), so a new section is **silently stripped** at unpack — an added key would look like it worked. |
| **C — a browser-local side store** (the `defaultPositionStore` shape) | The bridge is a **separate process** and cannot read a browser store. It is the party that must place the layers (`docs/prd/caspar.md:382-386`).                                                                                                                                                           |
| **D — a `<script type="application/json">` block parsed bridge-side** | The bridge would have to start parsing HTML, which it does none of, and it would put a parse on the serve path that `template-http-server.ts:153-170` keeps free of work. Kept as a **fallback if §12.2 forces a separate render path**, since the block would then already exist.                         |
| **E — the served-URL query**                                          | It works (`caspar-runtime.ts:3678-3692` appends `cw`/`ch`) but it is **bridge → page**. This is page → bridge.                                                                                                                                                                                             |
| **F — a scene collector**                                             | Not an alternative — it is the _producer_ of the data. It combines with the chosen option: a `collectLiveSources(scene)` mirroring `collectVideoElements` feeds the derivation at import.                                                                                                                  |

---

## 2. ⭐ How `guest-1` becomes a real producer

Today this is **two English sentences** (`docs/prd/caspar.md:371-373` and its acceptance
restatement at `:379-381`) and nothing else.

`SEARCH:` `git --no-pager grep -rn -i -e "source-mapping" -e "sourceMapping" -e "sourceId" -e "source-id" -e "sourceMap" -e "producerMap" -e "inputMap" -e "keySourceId" -- packages tools apps` → **0 hits** for every mapping-shaped name. `git --no-pager grep -rn -e "routeKey" -- packages tools apps` → **3 hits**: the declaration (`packages/shared-schema/src/elements.ts:1019`) and two test fixtures (`packages/shared-schema/tests/elements.test.ts:299,311`). `Glob **/*store*.ts` under `tools/caspar-bridge/src` → exactly five stores, none of them a sources store. And `packages/shared-ipc/src/channels/` contains 19 channel files, none defining such a channel.

### DECISION — a bridge-owned `SourceMappingStore`, with a **deliberately split doctrine**

| Axis                    | Doctrine followed   | Mechanism                                                                                                                                                                 |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Writability**         | **fixed-layers**    | A `sources.*` IPC channel (`config` / `setConfig` / `onConfigChanged`), edited in a CG Control settings modal. The operator must be able to say what each id resolves to. |
| **Absent file**         | **reserved-layers** | Absent ⇒ **NO MAPPINGS**. **No built-in default.**                                                                                                                        |
| **Present but invalid** | both agree          | **HARD boot failure**, before the WebSocket binds.                                                                                                                        |

**Path:** `~/.cg-runtime/bridge-source-mappings.json`, resolved by a **new `--source-mappings-path`
flag** in `tools/caspar-bridge/bin/caspar-bridge.mjs` beside the existing four.

⚠ **It must NOT live in `templatesDir`.** `TemplateRegistry.loadPersisted` reads **every** `*.json`
there as a template — `tools/caspar-bridge/src/template-registry.ts:75` `fs.readdirSync(this.#persistDir)`
and `:87` `if (!name.endsWith('.json')) continue;` is the _only_ filter.
`SEARCH:` `git --no-pager grep -rn -i -e "skipFiles" -e "IGNORED_FILES" -e "isTemplateFile" -- tools/caspar-bridge/src` → **1 hit**, which is that `.endsWith` include-filter itself. There is no exclusion list. Two files already trip it (`delimiters.json`, `channel-settings.json`), producing the false _"skipping unusable persisted template … re-import it to restore durability"_ on every boot (filed as B-116, which names only `delimiters.json` — the `channel-settings.json` instance is **wider than the filed bug** and is listed in the PR under _Findings to file_).

### 🔴 The inversion, stated because it will be mis-copied

**Both stores say "absent = nothing". The safety direction is opposite.**

- **Reserved layers — "absent = nothing reserved" is FAIL-OPEN.** With no file, the bridge happily
  allocates onto the playout system's layers. The doctrine is chosen anyway because the alternative
  (guessing a reservation) is worse, and `tools/caspar-bridge/src/reserved-layers-store.ts:15-18`
  records the reasoning.
- **Source mappings — "absent = no mappings" is FAIL-CLOSED.** With no file, nothing resolves and
  **nothing reaches air.**

**Why no built-in default, explicitly.** A default fixed-layer bank is safe because 70–99 is empty
— a default is a guess about _our own_ layer numbering. A default **input** mapping is a guess about
**hardware nobody in this project can see**, and a wrong guess puts the wrong source on air. C-015's
own acceptance already prescribes the right behaviour for the empty case
(`docs/prd/caspar.md:396-397`): _"WHEN a declared source id has no mapping THEN the take refuses
legibly with a distinct errorCode (never a silent empty hole on air)."_ The absent file is simply
the case where **every** id is unmapped, and it resolves through that same rule.

### Shape

```
SourceMappingsSchema = {
  mappings: Array<{
    id: string,                     // symbolic, e.g. "guest-1" — see §3
    label?: string,                 // operator-facing, e.g. "Studio camera 2"
    producer:
      | { kind: 'route',    channel: number, layer?: number }
      | { kind: 'decklink', device: number, format?: string }
      | { kind: 'ndi',      source: string, lowBandwidth?: boolean }
      | { kind: 'media',    file: string },
  }>,
}
```

A **discriminated union on `kind`**, not a free string, so an unreachable producer form is a parse
error at the boundary rather than an AMCP `400` at take time. `route` carries an optional `layer`
because the measured grammar `route://(?<CHANNEL>\d+)(-(?<LAYER>\d+))?` makes it optional.

### Following the store precedent exactly

- **Atomic write** — mkdir → tmp → rename, mirroring `fixed-layers-store.ts:305-310`.
- **Boot order** — loaded and validated in `tools/caspar-bridge/src/bridge.ts` **before**
  `new WebSocketServer(...)`, so a conflict resolves loudly at startup rather than at a take. The
  pinning-test shape already exists: `tools/caspar-bridge/tests/fixed-layers-boot.integration.test.ts:134-165`
  asserts a conflicting bank throws before binding _and_ that no port is left listening.
- **Provenance on stderr** — the store returns `{ value, source }` and the boot line prints where
  the mapping came from, following `describeFixedBank` (`bin/caspar-bridge.mjs:162-182`), whose own
  header records why: on 2026-08-01 two machines ran different banks and nothing anywhere said so.
  A source mapping is _exactly_ the class of install config that differs silently between machines.
- **Refusal wording** — reason codes derived from a wire const so store and channel cannot drift,
  as `FIXED_LAYERS_SET_CONFIG_REASONS` already does.

### The settings surface

Modelled on **`DelimitersModal`** (`apps/runtime/src/renderer/features/inspector/DelimitersModal.tsx`)
rather than `FixedBankConfigModal`, because a mapping table is a list editor, not a read-only
ceiling. Two behaviours copied deliberately:

- **No optimistic local update** — _"The local cache is NOT updated optimistically. The bridge is
  the owner and can refuse"_ (`delimiterStore.ts:134-140`).
- **`describeCommitFailure`'s older-bridge translation** (`:162-171`) — a station whose bridge
  predates this feature will hit `unknown channel: sources.set`, and the operator must be told that
  rather than shown a generic failure.

`SEARCH:` `git --no-pager grep -rn -e "channelSettings.set" -- apps/runtime/src` → **0 renderer call sites** (the three repo-wide hits are the channel-name literal, the bridge calling its own store, and a `.settings.find` false positive). So `channelSettings` is **not** a usable settings-surface precedent; `FixedBankConfigModal` and `DelimitersModal` are the only two.

---

## 3. Symbolic versus concrete — and the stretch problem

`routeKey` is `z.string().min(1)` (`packages/shared-schema/src/elements.ts:1019`). `'guest-1'`,
`'DECKLINK DEVICE 3'` and `'C:\media\guest.mp4'` all parse identically, and **nothing anywhere
validates it** — no schema refinement, no preflight, no lint, no UI (there is no UI: see §9).

### DECISION — a scene may NOT name a device. Enforced in two places.

1. **Schema** — the id gets a format refinement: a symbolic identifier
   (`/^[a-z0-9][a-z0-9_-]*$/i`), which rejects `DECKLINK DEVICE 3` (spaces), `route://1-1` (colon,
   slashes) and a file path (backslashes, colon) **by construction**.
2. **Preflight** — a new `live-source-*` issue code. This costs **no wire change**:
   `ExportIssue.code` is `z.string().min(1)`, an open string
   (`packages/shared-ipc/src/channels/export.ts:16-24`).

The template therefore stays portable: it names sources by id only, and the id → producer binding is
an **installation** concern, which is what both items promise (`docs/prd/caspar.md:374-376`).

### 🔴 The aspect decision, forced by hardware fact 2

`MIXER FILL` **stretches**. `expectedAspect` exists and has **zero consumers**.
`SEARCH:` `git --no-pager grep -rn -e "expectedAspect" -- packages tools apps` → **3 hits**: the declaration (`elements.ts:1018`) and two round-trip test fixtures (`elements.test.ts:298,310`). No renderer, exporter, bridge or runtime reads it.

So today, if a source's real aspect differs from the authored hole, **a face goes on air stretched
and nothing prevents it.**

**A correction to how this was first weighed.** The first three options below all answer _"how do
we PREVENT a mismatch?"_. Only the last two answer _"a mismatch has happened — how do we RESOLVE
it?"_, which is the question that actually matters, because the mapping is an installation fact the
author never sees and therefore a mismatch is always possible.

| Option                                                                                               | Verdict                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Constrain the hole at authoring time** — the Inspector locks the hole's aspect to `expectedAspect` | **Rejected.** It forbids a legitimate design (a deliberately non-16:9 window) and it cannot help at all when the _source_ is not what the author expected.                                                                                                                       |
| **Warn at preflight**                                                                                | **Kept as a supplement, not the answer.** It checks an _authored_ value against nothing at author time, and — decisively — **a warning does not block**: only `severity: 'error'` gates export (`apps/designer/src/renderer/features/compositions/CompositionActionBar.tsx:41`). |
| **Stretch (do nothing)**                                                                             | **Rejected.** This is today's behaviour, and it puts a distorted face on air.                                                                                                                                                                                                    |
| **Pillarbox** — fit the source inside the hole, preserving aspect, leaving margins                   | **REJECTED — see below.**                                                                                                                                                                                                                                                        |
| **Crop-to-fill** — scale to cover the hole, preserving aspect, clip the overflow                     | **ADOPTED.**                                                                                                                                                                                                                                                                     |

### DECISION — crop-to-fill

**The rule:** scale the source so it **covers** the hole with its proportions intact — matched
scale factors on both axes, sized by the _larger_ of the two required ratios — and clip the
overflow to the hole rect.

**Why not pillarbox, which an earlier draft of this document adopted.** A pillarbox is honest, but
it puts **black bars inside a frame the designer drew**. A multi-box guest window is a designed
graphic element, not a video player viewport: bars inside it do not read as "the source is 4:3",
they read as **a fault on air**. Crop-to-fill preserves proportions _and_ fills the window, which
is the ordinary broadcast convention for a multi-box. The cost of crop-to-fill — losing the edges
of the source frame — is the cost every broadcaster already accepts for this shot, whereas the cost
of pillarbox is a graphic that looks broken.

### The mechanism — `FILL` + `CLIP`, MEASURED 2026-08-03

`MIXER CLIP` and `MIXER CROP` are both registered on the plant's 2.3.2 binary, in the **same
contiguous command block** as `FILL` — verified by a read-only UTF-16LE scan of
`D:\programs\CasparCG\casparcg.exe` at `0x68a018`:

```
… MIXER CONTRAST | MIXER LEVELS | MIXER FILL | MIXER CLIP | MIXER ANCHOR | MIXER CROP | MIXER ROTATION …
```

**The chosen composition is `FILL` + `CLIP`:** emit a `FILL` whose rect is aspect-matched and
therefore _oversized on one axis_, then `MIXER CLIP` to the hole rect so the overflow is not drawn.
`CLIP` is chosen over `CROP` because `CLIP` takes a rect in the **same channel-normalized
coordinate space as `FILL`**, which is the space §6's chain already derives — so it composes with
arithmetic already being computed, and needs no second coordinate model.

**MEASURED, CasparCG `2.5.0 69e8ad5`, `1080i5000`.** From a clean reset (`CLEAR` + `MIXER CLEAR` on
both layers first — mixer state survives `CLEAR`, so an unclean frame is how this gets misread),
one command at a time with a look between each:

| step                             | observed                                         |
| -------------------------------- | ------------------------------------------------ |
| `PLAY 1-1 "m" LOOP`              | full-frame background                            |
| `PLAY 1-2 "route://1-1"`         | no visible change — identical full-frame overlay |
| `MIXER 1-2 FILL 0.5 0.5 0.5 0.5` | box appears bottom-right                         |
| `MIXER 1-2 CLIP 0 0 0.5 0.5`     | **box disappears entirely, nothing elsewhere**   |

**CONFIRMED, and it is exactly what this design assumed: `CLIP`'s rect is in CHANNEL-NORMALIZED
space, the same space as `FILL`, and it MASKS — it does not travel with `FILL`.** A top-left clip
window and a bottom-right fill box do not intersect, so the layer renders nothing. That last row is
the whole proof: had `CLIP` been source-relative, or had it moved with the fill rect, the box would
have survived in some form.

**`MIXER CROP` is therefore no longer needed as a fallback** for coordinate space or composition
order. It stays recorded only as the alternative if the partial-overlap question below resolves
against `CLIP`.

🔴 **The coupling this creates, stated because it is the failure mode.** Because `CLIP` masks in
channel space and does **not** travel with `FILL`, the two rects are **not independent** — they are
two outputs of the same §6 derivation and must be emitted together from one computation. Changing
one without the other does not degrade gracefully: a fill box that moves out from under its clip
window renders **nothing at all**, which on air is a black hole where a guest should be. The spec
delta therefore requires them emitted as a pair, and `tasks.md` 6.1 builds them as one call rather
than two independent builder methods.

⚠ **Still owed, and 6.3a is narrowed to exactly this** — coordinate space and composition order are
settled, so what remains is:

1. **Is `CLIP` purely an intersection mask under PARTIAL overlap?** The measurement above tests
   disjoint rects (renders nothing) and, implicitly, containment. The crop-to-fill case is neither:
   the fill rect is _larger_ than the clip rect on one axis, so the expected result is the
   intersection. That specific geometry has not been looked at.
2. **What rounding and precision does the server accept for the four arguments?** §6 emits computed
   fractions, not round numbers, and no recorded precision exists. `css()` uses 6 decimals for the
   CSS side (`packages/template-runtime/src/position.ts:202-204`); whether AMCP accepts the same is
   unknown.

Neither needs capture hardware — two `route://` producers reproduce both.

### ✅ Cross-build check — DONE. Both facts hold on the target build.

The measurements above were taken on the side-by-side **2.5.0** install, while C-015's target plant
is **2.3.2**. That gap is now closed. **Measured 2026-08-03 on the plant build itself** —
CasparCG **2.3.2** at `D:\programs\CasparCG`, same machine, same clean-reset procedure (`CLEAR` +
`MIXER CLEAR` on both layers), one command at a time:

| step                             | observed on 2.3.2        |
| -------------------------------- | ------------------------ |
| `MIXER 1-2 FILL 0.5 0.5 0.5 0.5` | box appears bottom-right |
| `MIXER 1-2 CLIP 0 0 0.5 0.5`     | box disappears entirely  |

**Same behaviour as 2.5.0.** So both load-bearing mixer facts now hold on the build the feature
actually targets, not only on the side-by-side install: `FILL` places per-axis against the channel
raster, and `CLIP` is a channel-space intersection mask that does not travel with `FILL`.

🔴 **The distinction that must survive this, because it is the kind of thing a later reader
flattens.** The 2.3.2 check is **QUALITATIVE** — box present, then absent, by eye. **What carried
across builds is the SEMANTICS. The ARITHMETIC was not re-measured on 2.3.2**: the pixel-accurate
placement in §0b — `FILL 0.5 0.5 0.5 0.5` landing at exactly (960, 540) sized 960×540 — was
measured on **2.5.0 only**.

**Nothing in this design depends on it having been.** §6's chain needs the _normalization basis_
(per-axis against the raster) and the _masking semantics_, both of which are confirmed on 2.3.2.
It does not need the pixel measurement repeated; that measurement's job was to falsify the
competing basis hypothesis, and it did.

### ⭐ What `expectedAspect` MEANS under this decision

The two readings are different fields that happen to share a name, and this design picks one:

> **`expectedAspect` is a DECLARATION to validate the mapped source against. It is NOT the input to
> the fit computation.**

- **The fit input is the MAPPING's aspect** — an installation fact, recorded beside the producer in
  §2's `SourceMappingsSchema` (an optional `aspect` on each mapping entry). The operator configuring
  `guest-1` knows what the plant delivers; the author does not.
- **`expectedAspect` is the author's assertion** — "this window is designed for a 16:9 feed". The
  bridge compares it against the mapping's aspect and **refuses the take with a distinct errorCode
  when they disagree**, rather than silently cropping something the author never anticipated.
- **Fallback, recorded as a fallback:** where a mapping states no aspect, the fit uses
  `expectedAspect` as the assumed source aspect. This keeps the feature usable before every mapping
  is fully described, and it degrades to the author's best guess rather than to a stretch.

This is what makes the decision coherent: crop-to-fill _discards picture_, so it must be driven by
what the source actually is, not by what the author hoped. Driving a crop from an authored guess
would silently cut the wrong part of a face.

**`expectedAspect` therefore acquires its first consumer and becomes load-bearing** — which is why
§3's schema work and §6's geometry work sit in the same phase.

**Open residual, unchanged:** whether the producer's real raster can be read back at run time (so
the fit could use measured truth rather than the mapping's declared aspect) is unknown — §12.3. If
it can, it supersedes the mapping's `aspect` as the fit input and `expectedAspect` stays exactly
what it is here: a declaration to validate against.

---

## 4. 🔴 R-028 — the collision, and the landing order

### The state of R-028

`openspec/changes/runtime-unified-layer-rows/tasks.md` — **22 checked, 14 open**. Section 6 is
**entirely open** (6.1–6.4 at `:140-147`); task 1.2 (`:27-33`) is `[x]` and is C-015's own seam.

### R-028's own doctrine is the thing to extend, not to fight

`design.md:185` (§i) states it: **"Declared, never detected"** — because OSC carries producer _kind_,
not identity, so "a playout graphic and one of ours are both `html`", and _"without declaration,
R-009's orphan sweep flags healthy playout graphics as ORPHANS."_

A Live Source layer is the **same problem one step further out**: a layer whose owner cannot be
inferred from the wire. The answer is therefore the same answer — **declare it** — and this design
does not invent a new mechanism so much as add a third member to an existing set.

### What section 6 would cement if it landed first

| Task                         | Verbatim                                                                                                         | Effect on a Live Source layer                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6.2** (`tasks.md:142-143`) | _"R-009 orphan sweep NARROWED, still running: candidates become layers nobody declared."_                        | A Live Source layer **is** a layer nobody declared, under a two-class model. It becomes a reclaim candidate — the exact opposite of C-015's _"never an R-009 reclaim target"_ (`caspar.md:403-404`).            |
| **6.3** (`:144`)             | _"R-015's foreign refusal unchanged outside declared ranges; regression-test the boundary."_                     | The Live Source range would be outside every declared range, so a **bridge-owned non-html producer** meets a refusal built for foreign ones. This is C-015's own _"THE structural risk"_ (`caspar.md:409-413`). |
| **6.1** (`:140-141`)         | _"`LayerManager.allocate()` … MUST have no caller that puts an operator graphic on air. Assert that in a test."_ | Written first, the test fixes the allocation story before Live Source allocation is designed. Written after, it can be written to permit a **declared, non-operator** allocation.                               |
| **6.4** (`:145-147`)         | _"`LayerPolicy` ranges become DESCRIPTIVE."_                                                                     | **This is the opportunity.** It frees 10–59.                                                                                                                                                                    |

### DECISION — landing order

> **This design lands FIRST, as a design. R-028's section 6 then implements a THREE-class declared
> model, and this change's implementation phases follow it.**

Concretely:

1. **This change merges as a design** (no product code — see `tasks.md` §0).
2. **R-028 section 6 is amended before implementation** to narrow the R-009 sweep against
   _three_ declared classes, and to write 6.1's test so it permits a declared non-operator
   allocation. That amendment is task **6.5** in R-028, defined in this change's `tasks.md` §7 as a
   cross-change obligation.
3. **This change's implementation phases** (§10) land after R-028 section 6.

**Why this order and not the reverse.** R-028's section 6 is a _narrowing_ — it removes candidates
from a sweep and asserts an absence in a test. A narrowing written against an incomplete class list
is not a bug that shows up in review; it is a **silently correct-looking test** that forbids the
third class. The reverse order (build Live Sources first, then narrow) would mean the sweep flags
live guest boxes as orphans in the window between them, which is an operator being invited to clear
a face off air.

### The layer range — 10–59, freed by R-028's own 6.4

Under R-028 the map is: playout **60–69** declared, operator rows **70–99** declared, and
**10–59 released** when `LayerPolicy` becomes descriptive (`design.md:57-84` §c). Templates sit on
70–99; C-015 needs sources _below_ the template's layer. **10–59 is directly below 70–99, is fifty
layers wide, and is freed by R-028 itself.**

This supersedes the recon's "1–9 is the only free band", which was measured against **today's**
policy. Under R-028's own §k that policy is descriptive, and 1–9 (nine layers, enough for four
fill+key boxes on the whole channel) is not a viable address space.

**The Live Source range is declared config**, in the same file as the mapping (§2), validated
disjoint from the fixed bank and the reserved range at load **and** at change — extending the
existing `validateFixedBank` checks (`tools/caspar-bridge/src/fixed-layers-store.ts:145-166`),
which already do exactly this for two of the three classes.

### ⚠ The `reservedLayers` trap — and a correction to the code's own comments

**Do not put Live Source layers in `reservedLayers`.** It fixes the R-009 line and breaks three
others:

- `allocate()` skips reserved layers — `packages/caspar-client/src/layers/layer-manager.ts:210`
  `if (this.reservedLayers.has(layer)) continue;`
- `reserve()` refuses them — `:246` `if (this.reservedLayers.has(slot.layer)) return false;`
- `clearLayer` refuses them as `reserved` — `tools/caspar-bridge/src/caspar-runtime.ts:2679-2681`

A Live Source on a reserved layer is **unplaceable and unclearable through every existing door.**

**The correction, and it matters because the code invites the mistake.**
`tools/caspar-bridge/src/caspar-runtime.ts:295-300` tags `#reservedLayers` as _"R-028 / C-015"_, and
`tools/caspar-bridge/tests/fixed-layers-store.test.ts:76` calls it _"the C-015 Live Source seam"_.
**The code says otherwise:** `packages/shared-ipc/src/channels/fixedLayers.ts:161-166` defines
reserved layers as _"the layer numbers the **company's playout system** owns"_, and
`reserved-layers-store.ts:5-10` restates it. `reservedLayers` is a **fence AWAY from a foreign
owner** — the exact inverse of a record of layers **we** own. R-028's task 1.2 wired it as "C-015's
seam" and marked it done with the list empty; that satisfied the _disjointness_ half of C-015 and
none of the _ownership_ half. The comments are corrected as part of this change's phase 2.

### DECISION — the ledger

`#slots` is `Map<itemId, CommandSlot>` — **one** coordinate per item
(`tools/caspar-bridge/src/caspar-runtime.ts:310`), mutated at exactly three sites (`:1073`, `:1211`,
`:2799`), every entry created from an operator stack item. An item owning N layers is
**unrepresentable**.
`SEARCH:` `git --no-pager grep -rn -i -e "ledger" -e "ownedLayers" -e "bridgeOwned" -e "layerOwner" -- packages tools apps` → ~40 hits, **zero in `tools/caspar-bridge/`**; every one is the unrelated outro ledger in `@cg/template-runtime` or one prose simile. A full enumeration of `CasparRuntime`'s 46 private fields finds no per-layer owner record.

A **new** `#liveLayers: Map<string, LiveLayerRecord[]>` keyed by itemId, each record
`{ slot, sourceId, role: 'fill' | 'key', producer, fill }`. It is **added beside `#slots`, not
folded into it** — `#slots` answers "where does this item's _template_ live", which every verb
depends on, and widening its value type would touch all nine read sites for a reason none of them
share.

**The three exemptions, each targeting the right door:**

| Door                      | Current gate                                                                                                                 | Live Source treatment                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **R-009 sweep**           | `owned` = the values of `#slots` only (`caspar-runtime.ts:2390-2393`); exemptions are reserved layers and `#slots`           | `owned` gains the `#liveLayers` coordinates. One line, and it is the whole fix.                                                          |
| **C-014 quarantine**      | `#reconcileForeignQuarantine` tests `occ.producer === 'html'` **first** (`:3520`), with `isAllocated` a later veto (`:3532`) | Live Source coordinates are skipped **before** the kind test, since the kind test is exactly what a bridge-owned non-html layer defeats. |
| **R-015 foreign refusal** | see below — **not** a simple exemption                                                                                       | see below                                                                                                                                |

### C5 — why C-015's R-015 exemption cannot be applied as worded

C-015 asks that Live Source layers be _"exempt from R-015's foreign-refusal (the bridge may CLEAR
what it owns)"_ (`caspar.md:401-403`). Applying that literally is **backwards**:

- `clearLayer` is the **operator-facing `layers.clear` path only**. Its own docstring says
  _"clearing owned layers is Out/Remove's job"_ (`caspar-runtime.ts:2649-2651`), and it refuses an
  owned layer with `reason: 'owned'` at `:2682-2686` — **before** the `producer !== 'html'` test at
  `:2690`.
- So the bridge needs **no exemption** to clear what it owns: its own teardown calls
  `#builder.out(slot)` directly and never routes through `clearLayer`.
- Granting the exemption as worded would make Live Source layers **operator-clearable** — inverting
  the protection.

**DECISION:** Live Source layers are refused by `clearLayer` with a **new, distinct reason**
(`live-source`, not `foreign` and not `owned`), so the operator is told _what_ the layer is and
_why_ it is not theirs to clear. Teardown remains the bridge's own path.

**The precedent for a config-declared carve-out already exists and is owner-approved:**
`docs/prd/runtime.md:882-885` records that inside the fixed range, operator Clear works on **any**
producer including non-html — _"a deliberate, owner-approved carve-out of R-015's foreign-refusal"_
— implemented as `clearBankLayer` (`caspar-runtime.ts:2577-2643`), whose guards are purely
config (`:2615` reserved, `:2628` bank membership) and which **never consults producer kind**. That
is the shape this design follows.

### C6 — "sole discriminator" is already stale

C-015 says non-html producer kind is _"the SOLE foreign/owned discriminator"_ (`caspar.md:409-411`).
It is not: `clearLayer` evaluates **reserved** then **owned** before kind, and `clearBankLayer`
consults no kind at all. `docs/prd/runtime.md:886-888` already names three composing ownership
notions _including_ C-015's ledger. The risk C-015 flags is real; its framing understates the
precedent. Corrected in the PRD as part of this change.

---

## 5. The producer verb

`SEARCH:` `git --no-pager grep -rn -i -e "MIXER FILL" -e "mixerFill" -e "MIXER_FILL" -e "MIXER KEYER" -- packages tools apps` (including `--untracked`) → **0 hits**, no spelling, no casing. A second search for `MIXER ` returns 40 hits, all `VOLUME` or `CLEAR`. The only AMCP MIXER construction anywhere is `command-builder.ts:141`.

`tools/caspar-bridge/src/command-builder.ts` is 154 lines and emits **seven** commands
(`:56, :61, :66, :87, :102, :107, :140`) — all `CG …`-scoped or `MIXER … VOLUME`, all through
`target()` at `:146-148` which unconditionally produces `<channel>-<layer>`. **`take()` is
`CG … PLAY 0`** — it plays a template _inside_ an already-ADDed html producer and cannot start any
other kind. There is no escape hatch.

Corroborating evidence that the absence is real rather than unsearched:
`tools/caspar-bridge/tests/clear-all-broadcast-safety.integration.test.ts:62-76` defines its own raw
TCP `sendRaw()` — documented _"This is deliberately NOT the bridge"_ — because the bridge exposes no
way to send `PLAY 1-1 "program-feed.mov"`. The test is itself evidence of the gap.

### DECISION — three new builder methods, all layer-scoped

```
playSource(slot, producer)   →  PLAY  <ch>-<layer> "<producer-argument>"
mixerFit(slot, fit)          →  MIXER <ch>-<layer> FILL x y sx sy
                             +  MIXER <ch>-<layer> CLIP x y sx sy      ← ALWAYS both
mixerClear(slot)             →  MIXER <ch>-<layer> CLEAR
```

- `playSource` takes the **discriminated union from §2**, never a string, so the argument is built
  from a parsed shape. All user-supplied values go through `quote()` exactly once, as the class's
  existing contract requires (`command-builder.ts:44-52`).
- 🔴 **`mixerFit` emits the `FILL` and the `CLIP` as a PAIR, from one computation — deliberately
  NOT two independent methods.** Measured (§3): `CLIP` masks in channel space and does not travel
  with `FILL`, so a caller that set one without the other could put the fill box outside its clip
  window, and the layer would render **nothing at all**. Two methods make that a caller mistake;
  one method makes it unrepresentable. This is the same reasoning as Golden Rule 7 — a single
  condition that governs two commands is evaluated once.
- `mixerClear` is **not optional tidiness**. Mixer state survives `CLEAR`
  (`command-builder.ts:128-130`, and measured on hardware), so a Live Source teardown that omits it
  leaves a `FILL` **and now a `CLIP`** on the layer that a later, unrelated graphic inherits — and
  an inherited `CLIP` is the worse of the two, because it makes an otherwise-correct graphic
  invisible with nothing on the wire explaining why.

### The channel-scoped safety doctrine applies unchanged

`caspar-runtime.ts:2718-2724`: _"**BROADCAST SAFETY — this is per-LAYER, never per-channel.** … It
MUST NEVER emit a channel-level `CLEAR <channel>` — that wipes the ENTIRE channel, including the
program/background signal this app does not manage and must never touch."_

All three new methods route through `target(slot)` and are therefore **layer-scoped by
construction**, exactly like the existing seven. `MIXER <ch> …` (channel-scoped) and `CLEAR ALL` are
**forbidden**, and this is stated in the spec delta so a future "simplification" cannot introduce
one. The bridge's complete channel-scoped surface stays at exactly one command — the read-only
`INFO <channel>` (`caspar-runtime.ts:3309`).

---

## 6. Geometry

### The chain is fully determined by hardware fact 1

For a hole at scene-px `(px, py)` with size `(pw, ph)`, on a channel raster `R`:

```
s      = min(R.w/1920, R.h/1080)                       position.ts:174-176
pad    = ((R.w − 1920·s)/2, (R.h − 1080·s)/2)          position.ts:185-194
(ax,ay)= ANCHOR_FRACTIONS[position.anchor]             position.ts:56-66
Tx     = ax·(1920 − scene.w) + offset.x                position.ts:112
Ty     = ay·(1080 − scene.h) + offset.y                position.ts:113

X = pad.x + s·(Tx + px)    W = s·pw
Y = pad.y + s·(Ty + py)    H = s·ph

FILL = [ X/R.w , Y/R.h , W/R.w , H/R.h ]               ← per axis (fact 1)
```

then **fitted** for aspect per §3 before emission.

🔴 **The naive form is wrong and must not be used.** Normalizing by `scene.resolution` alone — which
is C-015's own wording at `caspar.md:384` — omits `s`, `pad` and the anchor translate. Worked
example: a 960×540 scene, centred, on a 1440×1080 channel, hole at x=100 → the chain gives
`x = 0.302083`; the naive form gives `100/960 = 0.104` — **wrong by a fifth of the frame width**.
The `s = 0.75`, `pad = (0,135)` values are the ones
`packages/template-runtime/tests/output-position.test.ts:162,169` already asserts.

**A second mismatch, from hardware fact 2:** the page scales **uniformly** and letterboxes
(`outputScale` is a single `Math.min`), while `MIXER FILL` normalizes **per axis** and stretches.
They agree only on a 16:9 raster. The chain above reproduces the page's transform exactly, which is
what makes them agree on every raster.

### DECISION — the derivation lives in the BRIDGE, and TWO terms must be added to the wire

Most of the right-hand side is already bridge-resolvable — `R` from
`ChannelSettingsStore.rasterFor(channel)` (`channel-settings-store.ts:131-134`), the operator's
override from `#positions.get(itemId)` (`caspar-runtime.ts:3680`), `REFERENCE_FRAME` a constant.

`SEARCH:` `TemplateInfoSchema` (`packages/shared-ipc/src/channels/templates.ts:14-70`) read field by field: `templateId`, `name`, `sourceFileName`, `templateType`, `fields`, `groups`, `hasNext` — **no resolution, no defaultPosition**. `defaultPosition` is extracted in the browser (`templateDelivery.ts:209`) into a browser-local `Map` (`apps/runtime/src/renderer/features/stack/defaultPositionStore.ts:13-26`).

So **`resolution` AND `defaultPosition` both join the `liveSources` declaration block** on
`TemplateInfo` (§1) — they ride the same carrier, derived at the same moment, for the same reason.

🔴 **CORRECTION — an earlier draft of this document said `defaultPosition` was "deliberately not
added", on the grounds that the bridge holds the operator's effective position in `#positions` and
would otherwise use the same `centred` default the page does. That was WRONG, and it would have put
the live box in a different place from its hole on every template whose author set a position.**

The bridge appends the position query **only when an override exists** —
`caspar-runtime.ts:3685`: `if (position !== undefined) params.push(positionQuery(position));`. With
no override, no `pos` rides the URL, and the page then resolves its own fallback chain:

```
query override ?? scene.defaultPosition ?? centered        position.ts:92-97
```

So for an item with **no operator override on a template with an authored `defaultPosition`**, the
page uses `scene.defaultPosition` while a bridge assuming `centred` would compute a different
`Tx/Ty` — and the composited source lands somewhere the hole is not. The code already says as much
one comment above: _"a graphic with no operator override still has an authored position"_
(`caspar-runtime.ts:3672-3673`).

The bridge therefore resolves the **same three-step chain the page does**, from the same inputs:
`#positions.get(itemId)` ?? the carried `defaultPosition` ?? centred.

### 🔴 The duplication guard — one arithmetic, not two copies

Deriving the FILL bridge-side means the placement arithmetic exists on both sides of the seam. **If
`position.ts` changes and the bridge copy does not, nothing errors: the live box simply slides off
its hole on air.** There is no test that would catch it, and no operator signal — the hole is
transparent, so the failure looks like a mis-authored template.

**This repo has already solved this exact class once, in this exact code path, and wrote down why.**
`caspar-runtime.ts:3681-3684`, on why the bridge calls `positionQuery` from `@cg/shared-schema`
rather than formatting the string itself:

> _"`positionQuery` (@cg/shared-schema), never a local spelling: PVW's rehearsal frame now hands the
> SAME string to the page's own `applyOutputPosition`, and two spellings of one override is how a
> preview comes to place a graphic differently from air."_

**DECISION — the same remedy, applied to the arithmetic instead of the string. Two guards, both in
the geometry phase:**

1. **ONE IMPLEMENTATION.** The pure, DOM-free half of `position.ts` — `REFERENCE_FRAME`,
   `ANCHOR_FRACTIONS`, `outputTranslate`, `outputScale`, `outputLetterbox` — moves into
   `@cg/shared-schema` beside `positionQuery` (`packages/shared-schema/src/scene.ts:260`, already
   the home of `PositionSchema` and `PositionAnchorSchema`). `@cg/template-runtime` re-exports them
   so no page-side import churns, and the bridge imports them directly — **it already depends on
   `@cg/shared-schema`** (`tools/caspar-bridge/package.json`), so this adds no dependency.
   Only `applyOutputPosition` and `resolveChannelRaster` stay behind: they touch `document` and
   `window` (`position.ts:246-247`, `:257-259`, `:274`) and are the page's alone.
2. **A CONTRACT TEST** pinning the two computations to each other over a fixed table of
   `(scene.resolution, channel raster, hole rect, position)` triples, asserting that the bridge's
   normalized FILL and the page's composed CSS transform place the same scene-px point at the same
   raster pixel. The table MUST include **at least one non-16:9 raster** — on a 16:9 raster `s = 1`
   and `pad = (0,0)`, so every term collapses and the test would pass against a _wrong_
   implementation. `1440×1080` is the case already pinned page-side at
   `packages/template-runtime/tests/output-position.test.ts:162,169` (`s = 0.75`, `pad = (0,135)`),
   which gives the test a known-good anchor on both sides. `720×576` (`pal`) is included as a second
   non-16:9 case with a different pad axis.

Guard 1 makes divergence impossible for the shared terms; guard 2 catches divergence in the
_composition_ of them, which is the part that cannot be shared because one side emits CSS and the
other emits AMCP. Both land in **phase 6 with the geometry work** (`tasks.md` 6.2a, 6.2b) — a guard
written a phase later is a guard that was absent exactly when the arithmetic was first written.

### The hole's rect must be computed at IMPORT, not at take

`SEARCH:` `git --no-pager grep -rn -i -e "frameAabb" -e "localToScene" -e "absoluteRect" -e "worldRect" -e "boundingBox" -- apps packages` → the only ancestor-composing function is `frameAabb` (`apps/designer/src/renderer/state/off-frame.ts:74-97`), which is **Designer-renderer code**, exported from no package, imported only by `scene-doc.ts:17`.

And it composes less than is needed. It folds `position`, `anchor`, `size`, `scale`, `rotation`
through **container** ancestors only (`off-frame.ts:117-151`). It does **not** compose:

1. **Composition-INSTANCE scale** — a `composition` element hits the "static leaf" branch and its
   children are never walked, so the instance's inner
   `scale(size.w/comp.resolution.width, …)` (`packages/template-runtime/src/scene-builder.ts:258-260`)
   is never applied. This is precisely the D-119 shape a Live Source will sit in.
2. **`skew`** — carried by `TransformSchema` and emitted at `scene-builder.ts:455-463`.
3. **Animated values** — `frameAabb` reads `el.transform` statically.
4. The composition instance's own clip box (`overflow:hidden`, `scene-builder.ts:239`).

**DECISION:** a **new** `collectLiveSources(scene)` in `@cg/vcg-format` (isomorphic, beside
`buildPlayoutMetadata`) composes the full ancestor chain including composition instances, and emits
one flattened axis-aligned scene-px rect per Live Source. It runs at import, feeding §1's carrier.
`frameAabb` is **not** reused — it is renderer-local and composes the wrong set — but its
`localToParent` arithmetic (`off-frame.ts:50-60`) is the correct per-level kernel and is lifted.

**Clamping:** `.cg-stage` has `overflow: hidden` (`packages/template-runtime/src/css.ts:8-13`), so a
hole partly outside the scene rect is clipped on the template layer — but the live source behind it
would **not** be. The bridge therefore clamps the FILL to the scene rect.

### Animation — refused in v1, with the reason

`position.x/y`, `size.w/h` and `scale.x/y` are all keyframable
(`packages/shared-schema/src/animation.ts`, `AnimatablePropertySchema`); `anchor` and `skew` are
not. A static `FILL` behind an animated hole **desyncs**, and the hole is transparent, so the
failure mode is a live face sliding out from behind its frame on air.

**v1 refuses it**: a Live Source carrying any geometry keyframe is a preflight **error**
(`severity: 'error'`, which blocks export — unlike a warning, see §3). Animating the hole is
recorded as a later phase requiring per-frame `MIXER FILL` emission at the channel frame rate, which
is a different and much larger problem.

---

## 7. ⭐ The on-air audio cluster — one rule

R-029, R-042 and Live Source audio are one problem. The evidence:

- **`CG ADD` has exactly one construction site** (`command-builder.ts:56-58`) and one emit
  chokepoint, `#sendAdd` (`caspar-runtime.ts:3644`, sending at `:3693-3697`). It has **four**
  callers: `#loadOnto` (`:1121`), `#decidePendingRestores` (`:1394`), `setPosition` (`:1436`), and
  `take()`'s pre-roll (`:1550`). **Only `take()` is rehearse-guarded** (`:1527`).
- **The `load()` gap is live.** `#loadOnto` is reached from `loadFixed` with `listOnly = true`
  (`:1013`) — which emits nothing — and from the dynamic `load()` at `:897` with `listOnly`
  **unset**, which emits. `#loadOnto` has no rehearse guard of its own.
  `SEARCH:` `git --no-pager grep -n "#rehearsing" -- tools/caspar-bridge/src/caspar-runtime.ts` → the only reads are `take()`'s at `:1527` and `enterRehearse`'s idempotence check at `:1673`. None is inside `#loadOnto`.
  The renderer is fenced (`apps/runtime/tests/dynamicLoadUnreachable.test.ts:45-54` scans for
  `stack.load(`), but **that test binds the renderer only** — `stack.load` is still a live routed
  channel (`tools/caspar-bridge/src/bridge.ts:516-518`) reachable by any WebSocket client.
- **Every mute path is keyed on a stack item or the bank range.** All four `mixerVolume` call sites:
  `take()` `:1597-1601` and `enterRehearse` `:1714-1718` and `exitRehearse` `:1794-1801` all resolve
  through `#slots.get(itemId)`; `#reassertDeclaredVolumes` `:1875-1879` walks
  `bank.start … bank.start+count-1`.
  **A Live Source layer is not a stack item, so it can never be a `#slots` value** — which makes the
  first three structurally incapable of touching one.
  `SEARCH:` `git --no-pager grep -rn -e "mixerVolume" -- packages tools apps` → exactly four call sites, all listed above. No other code anywhere sends a `MIXER … VOLUME`.

### DECISION — mute at creation, unmute only by explicit intent

> **Every producer the bridge creates is created muted. Audio is raised only by an explicit,
> recorded intent naming the layer. This applies to Live Source layers and to template layers
> alike.**

For a Live Source layer that means: `playSource` is **immediately followed** by
`MIXER <ch>-<layer> VOLUME 0`, in the same command batch, before the layer can be composited. A live
guest feed carries the guest's live audio; a pre-rolled box must be silent until the take.

Three consequences, each deliberate:

1. **It closes R-042 for Live Sources by construction** — there is no window in which an unmuted
   live producer exists, because the mute is part of creation rather than a follow-up. R-042's
   `mute-before-ADD` for _template_ layers remains its own item; this rule is stated so the two
   cannot diverge.
2. **It requires a per-layer volume ledger.** `INTENDED_VOLUME = 1` is a single global constant
   (`caspar-runtime.ts:117`) whose own comment calls it _"the seam a future per-layer volume feature
   would replace"_. `#liveLayers` (§4) carries the intended volume per record; this is that feature,
   scoped to Live Sources.
3. ⚠ **It constrains the layer range choice.** `#reassertDeclaredVolumes` blankets
   `bank.start … bank.start+count` with `VOLUME 1` once per process, consulting nothing about what
   is on those layers (`:1872-1879`). **Had the Live Source range been carved inside 70–99, that
   walk would have unmuted every live box at first reachability, with nothing recording it.**
   Choosing 10–59 (§4) avoids it. This is recorded because it is a non-obvious second reason for the
   range choice, and a future move of the range would silently reintroduce it.

**Not fixed here, recorded:** `caspar-runtime.ts:1646-1650` still asserts the rehearse mute _"IS the
safety condition … if it does not land, rehearse is REFUSED"_, flatly contradicted by the code ~64
lines below where entry proceeds with `muted: false`. Product code is out of scope for this change;
it is listed in the PR under _Findings to file_.

---

## 8. Testability — the mock must gain three things

`tools/amcp-mock` is what most tests run against, and it **fails silently** for exactly the forms
this feature needs:

- Its whole producer model is `producerFor` (`tools/amcp-mock/src/handlers.ts:100-104`): two
  outcomes, `'html'` or `'ffmpeg'`. `PLAY 1-11 "route://1-10"` returns **`202`** and is recorded as
  **`ffmpeg`**; `PLAY 1-11 DECKLINK DEVICE 1` returns `202` with the device number discarded.
- `LayerState.producer` is `'empty' | 'html' | 'ffmpeg'` (`tools/amcp-mock/src/types.ts:44`), and
  carries **no fill geometry** — only `volume` (`:85`).
- `handleMixer` implements **only** `VOLUME` (`:45-60`); everything else is `400`.

**This violates the mock's own written doctrine** (`handlers.ts:36-38`): _"an unimplemented sub-verb
that silently `202`s would let a wrong command look correct, which is the one thing a mock must
never do."_ `handleMixer` obeys it; `handlePlay` does not — it refuses only on **addressing**
(`401` bad slot `:111`, `404` bad channel `:112`) and then `202`s any producer argument.

**The load-bearing consequence:** a routed Live Source layer reports `ffmpeg`, which is
indistinguishable from a foreign video layer — **the very discriminator §4's ownership work turns
on.** Without the mock changes, none of §4 is testable.

### DECISION — three additions, in this order

1. **Widen the producer union** to include `'route' | 'decklink' | 'ndi'` (`types.ts:44`) and
   replace `producerFor` with a real first-argument classifier. One site; `PLAY` and `LOAD` both
   inherit it.
2. **Make an unrecognised producer form a REFUSAL**, restoring `handlers.ts:36-38`'s doctrine to
   `handlePlay`. Without this a typo reads as success.
3. **Model `MIXER … FILL`** and add fill geometry to `LayerState`, so a test can assert the
   normalized rect the bridge derived — which is the only way §6's arithmetic is checkable offline.

`SEARCH:` `git --no-pager grep -rn -i -e "fill" -e "geometry" -e "transform" -- tools/amcp-mock/src` → no fill/geometry/transform state of any kind. And every existing test needing a foreign kind bypasses AMCP entirely, injecting it on the OSC wire via `MockHandle.emitOsc` (e.g. `tools/caspar-bridge/tests/protect-video-layers.integration.test.ts:153-156`) — which is itself evidence that the AMCP door does not exist.

**A fidelity gap to fix while there:** `producerFor` compares `a.toUpperCase() === 'HTML'`, so
CasparCG's real `[HTML]` tag never matches; every mock-facing test therefore uses a non-CasparCG
argument order. It has never mattered because the bridge only ever emits `CG ADD` — **it starts
mattering the moment §5 makes the bridge emit `PLAY`.**

---

## 9. Rehearse / preview rendering — and the seam that does not exist

### C3 — there is no render-mode seam

D-137 requires SMPTE bars on the canvas and preview, and zero painted pixels in export. **The code
has no seam to hang that on.** `buildScene(scene, doc)` takes **no mode argument**
(`packages/template-runtime/src/scene-builder.ts:81`), and its only production caller is
`createRuntime` (`packages/template-runtime/src/runtime.ts:420`), which every surface boots. The
Designer canvas's "authoring" difference is achieved entirely by **CSS injected into the page**
(`apps/designer/src/platform/preview.ts:66,110,131-164`), never by a builder flag.

Worse, the surfaces receive **different scenes**: the canvas gets `editSceneOf`, while the Preview
modal gets the **export-scoped, off-frame-filtered** scene
(`apps/designer/src/renderer/features/compositions/CompositionActionBar.tsx:44-52` →
`apps/designer/src/renderer/state/scene-doc.ts:158-170`). D-137 treats "the canvas or Designer
preview" as one bucket opposite export; the code splits three ways.

**DECISION:** add an explicit `mode: 'author' | 'output'` to `RuntimeBootOptions`
(`runtime.ts:394`), threaded to `buildScene`. Every boot site names its mode: the canvas and the
Preview modal pass `'author'`; `packages/single-file-export/src/exporter-single-file.ts:429` and the
`.vcg` boot (`apps/designer/src/platform/Exporter.ts:636-649`) pass `'output'`.

**Rejected: CSS-only bars** (matching how the canvas already differs). The bars would then ship
inside both exports' stylesheet and be one selector away from painting on air — for an element whose
entire contract is that it paints nothing. A mode the exporters _declare_ is auditable; a mode
inferred from which stylesheet won is not.

### The zone-css hazard, closed at the same time

`packages/template-runtime/src/zone-css.ts:159-169` gives `video-placeholder` a `background-color`
zone slot, compiled into an `!important` rule shipped by both exporters (`:330-332`). Fallback is
`transparent`, so it is inert until opted into — and `zoneOverrides` is reachable from no UI
(`SEARCH:` `git --no-pager grep -rn "zoneOverrides" -- apps/designer/src` → **0 hits**) — but it is
representable in a hand-edited scene. In `'output'` mode a Live Source is excluded from zone
compilation, so the hole cannot be filled.

### C8 — out-of-frame silently deletes, it does not warn

D-137 says out-of-frame **warns** (`designer.md:3590-3591`). The shipped behaviour is the opposite:
`dropFullyOffFrameForExport` **removes** fully-off-frame static elements from both exports and from
the Preview modal (`apps/designer/src/renderer/state/off-frame.ts:186-197`, reached from
`scene-doc.ts:170`, the one function `CompositionActionBar.tsx:46` calls). A Live Source dragged
fully off-frame would vanish from the `.vcg` with no message — **and its declaration with it**, so
the bridge would place nothing and say nothing.

**DECISION:** a Live Source is **exempt from the off-frame drop** and is instead a preflight
**error**. An element that is a contract with the runtime must never be silently removed from the
artifact that carries the contract.

---

## 10. Phasing — each phase landable and verifiable without capture hardware

Only `route://` is provable on a dev machine (`route` needs no card; DECLINK has no card in this
plant per C-020, and NDI is module-gated). Every phase below is verifiable with a looping media file
plus two `route://` producers.

| Phase                                    | Content                                                                                                                         | Verifiable how                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **1 — Schema + authoring**               | additive schema fields, the id refinement (§3), the creation path (C2), SMPTE bars behind the §9 mode seam, preflight codes     | unit + Designer E2E; no bridge                                 |
| **2 — Declaration + carrier**            | `collectLiveSources`, `resolution` + `liveSources` on `TemplateInfo`, the ledger type, the `reservedLayers` comment corrections | unit + integration against the mock                            |
| **3 — Mock**                             | §8's three additions                                                                                                            | the mock's own suite; **blocks phase 4**                       |
| **4 — Mapping store + settings surface** | `SourceMappingStore`, `sources.*` channel, CG Control modal, boot validation                                                    | integration + DOM tests                                        |
| **5 — Ownership**                        | `#liveLayers`, the three door exemptions, the `live-source` clear reason                                                        | integration against the mock — **only possible after phase 3** |
| **6 — Producer + geometry + audio**      | `playSource` / `mixerFit` / `mixerClear`, the §6 chain, the §7 mute rule                                                        | integration; then the two-box `route://` demo on real hardware |
| **7 — Hardware**                         | fill+key, DECKLINK, NDI                                                                                                         | **cannot be closed on this installation** — see §12.1          |

---

## 11. Contradictions carried by the filed items

Corrected in the PRD as part of this change: **C1** (C-015's migration-cost evidence — the type
appears in **no** living spec and **no** stored scene; `SEARCH:` `git --no-pager grep -rn "video-placeholder" -- openspec/specs` → 0 hits, and a byte-scan of all six tracked `.vcg` archives finds none), **C2** (D-137's "standalone creation unchanged" — there is no creation path to leave unchanged; `SEARCH:` `DesignerTool` at `apps/designer/src/renderer/state/store-core.ts:19-30` lists 11 tools, none of them a Live Source, and `element-defaults.ts` has 13 factories, none for `video-placeholder`), **C5** and **C6** (§4), and **C8** (§9).

**Recorded, not corrected** (out of scope): `DEBT.md:1301-1303`'s `OUTPUT_FRAME` prose is stale —
the constant was renamed `REFERENCE_FRAME` and moved to `packages/template-runtime/src/position.ts:41`
by `3e9bbc9` — but **`DEBT.md` is a frozen evidence archive and must not be edited**. Likewise
`caspar-runtime.ts:1646-1650` (§7) is product code.

---

## 12. Open questions — owner decisions, deliberately not guessed

### 12.1 C-015's acceptance cannot be discharged on this installation

C-015 makes real-hardware verification part of done (`docs/prd/caspar.md:405`, and the Notes at
`:404`: _"On-air behavior throughout ⇒ real-hardware verification is part of done."_). But
**this plant has no Decklink card** — C-020 records the config declares `<system-audio />` +
`<newtek-ivga />` + `<screen />`, and fill+key reaches air over NewTek iVGA into a TriCaster
(`docs/prd/caspar.md:753-754`). C-020 is itself **deferred** pending that integration. So the
DECKLINK arm can only ever be parse-verified here, and fill+key cannot be validated at all.

**Either the acceptance narrows to parse-verification for DECKLINK, or the item stays open
indefinitely on a card that is not coming.** This design's phase 7 is written to be _skippable_
without blocking phases 1–6, but the item's own done-condition is the owner's to set.

**What is NOT in this question, so the owner is deciding the smallest real thing.** The two mixer
facts the geometry rests on — `FILL`'s per-axis normalization and `CLIP`'s masking semantics — are
**confirmed on 2.3.2** (§3's cross-build check), so **phases 1–6 carry no 2.3.2 hardware debt at
all**. What remains un-dischargeable here is exactly the DECKLINK arm, fill+key, and NDI live use.
That is a narrower question than "C-015's hardware acceptance", and it is the one worth answering.

### 12.2 The rehearse contradiction (C4)

`apps/runtime/src/renderer/features/monitors/RehearsalStage.tsx:95-96` and
`packages/shared-ipc/src/channels/rehearse.ts:55-56` both state, in identical words, that _"after
C-015 a Live Source region renders as a labelled placeholder rather than video"_. But rehearse
renders the **retained exported page verbatim** (`RehearsalFrame.tsx:236`, `srcDoc={html}`), and
D-137 requires that page to paint nothing.

**Either the operator sees an empty transparent region in PVW, or a separate render path must be
built.** The design does not pick. §9's `mode` seam is written so that a third mode (`'rehearse'`)
could be added without reopening the decision, and §1's rejected option D is retained as the
fallback carrier if a separate render path is chosen.

### 12.3 Can the true producer aspect be read at run time?

§3's pillarbox fit uses `expectedAspect` — an **authored guess** about a source the author cannot
see. Whether CasparCG reports a producer's real raster (via `INFO <ch>-<layer>` or OSC) is
**unknown**, and nothing in this repo records it. If it can, the fit should use truth and
`expectedAspect` becomes a fallback. This is a hardware recon question, answerable with
`amcp-poke` in the same session as phase 6.

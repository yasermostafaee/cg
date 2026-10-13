# `CONSOLE-LOOK-06` — overnight run, 2026-09-13

**Written BEFORE the big builds and kept current as each lands**, per the work order: a session
that stops leaves its measurements behind so the next one measures nothing twice.

Branch `dev`. One host: **Windows / Chromium via Playwright** — every visual claim below says
how it was seen, and a green gate is never the evidence (golden rule 12).

---

## 1. Status of the list

| #   | item                            | state                                 | commit            |
| --- | ------------------------------- | ------------------------------------- | ----------------- |
| 0a  | red correction into §29.2       | **landed**                            | `a0c4abf1`        |
| 0b  | §B4 reconciliation              | **PARKED, deliberately**              | —                 |
| 1   | DELTA 11 — green selected look  | **landed**                            | `a0c4abf1`        |
| 2   | DELTA 9 — PENDING doctrine + §2 | **landed**                            | `cdb3529f`        |
| 3   | this handover                   | **landed**                            | —                 |
| 4   | DELTA 7 — Live plates tab       | **landed**                            | `d202afd6`        |
| 5   | DELTA 8 — per-action toasts     | **landed (audio half)**               | `c06b9d4b`        |
| 6   | D8b / D9.1–9.9 — audio modal    | **7 of 9 already done**               | docs only         |
| 7   | D7 — channel combobox           | **superseded** by `CHANNEL-PICKER-09` | —                 |
| 8   | closing order 1–4               | **landed**                            | `148fda82` + docs |

---

## 2. 🔴 Open questions for the owner — nothing below was guessed

### 2.1 §B4 — SETTLED 2026-09-13: the middle option

**Each surface keeps its own approved geometry.** Station setup's nine pinned files are
untouched and `SETTINGS-MATCH-02`'s sign-off stands. What unified is the INK.

⚠ **It was a real decision, not drift, and the owner overruled it knowingly:**
`--r-setup-caution-ink` `#f5c879` came from `SETTINGS-POLISH-04` §3 — the settings drawing's
own `--amber`. Retired in favour of `--r-caution-text` `rgb(243 205 136)`, which is already
role-named, is the console drawing's ink, and is the more legible of the two on **both**
grounds: **8.99:1** on `#352d1e` and **10.19:1** on `#29241c` (the retired value read 8.68 and
9.84). The contrast guard now carries the setup ground as a seventh class.

`Notice` gained `icon` and `title` as OPTIONAL props, both defaulting to absent, so
`SetupNotice`'s capability can move later without its appearance moving now.

### 2.2 `S.14` — the focus ring is the LEGACY sky

Every focused input in **both apps** rings `--cg-accent` `#38bdf8` while the Runtime's accent
moved to `#74cdf6`. Changing it is a `@cg/ui` PALETTE edit. **Filed, deliberately not taken.**

### 2.3 A UUID message with no code, parked

`Template "<uuid>" is not registered.` has no `errorCode` to key an operator sentence on, and
DELTA R §3(a) says stop rather than invent a lookup. Unchanged by ADDENDUM B.

---

## 3. Shared config that moved this session — the next pull picks these up

- **`packages/ui/src/theme.css`** — the global `input:focus` halo lost its plain-`:focus`
  selectors and now rings on `:focus-visible` only. 🔴 **The finding worth keeping:** a pressed
  range input reports `:focus` TRUE and `:focus-visible` FALSE in Chrome, so `:focus-visible`
  was already correct and the plain-`:focus` rules were overriding it. There were TWO painters;
  the loud one was this global, which is also why the ring was the legacy sky. Both suites
  re-run after: runtime 194, designer 279.
- **`CLAUDE.md`** — the sweep PROCEDURE now sits beside golden rule 9 (two passes on different
  axes, prove every pathspec, never narrow by one runner's vocabulary, scan multi-line).

⭐ **Before asserting any colour, look for a GLOBAL painter in `@cg/ui` first.** A component-level
decision can be silently overruled by a package-wide selector, and it looks like a token error
when it is a specificity one.

---

## 4. Measurements already taken — do not re-measure these

### 4.1 The message grammar, settled (`design.md` §29)

```
green  = ON AIR, now
mint   = confirmation
blue   = declared / selected, not on air
amber  = ATTENTION — refused, or declared and not yet applied;
         told apart by SHAPE and PLACE, never by hue
red    = DESTRUCTIVE ACTION CONTROLS ONLY — never a message class
```

Measured classes (live where they render; mounted where they only appear with a message):

| class                  | for                          | ink                                        | ground          |
| ---------------------- | ---------------------------- | ------------------------------------------ | --------------- |
| console refusal banner | refusal                      | `rgb(243 205 136)`                         | `rgb(53 45 30)` |
| its dismiss control    | —                            | `rgb(243 205 136)` (the message's own ink) | transparent     |
| success toast          | confirmation                 | `rgb(214 243 227)`                         | `rgb(29 59 48)` |
| `cg-setup-notice`      | setup refusal                | `rgb(245 200 121)`                         | `rgb(41 36 28)` |
| `cg-modal-message`     | modal message                | `rgb(229 231 235)`                         | —               |
| `cg-plate-help`        | info                         | `rgb(142 158 175)`                         | —               |
| row `attention`        | pending · occupied · unknown | `rgb(245 158 11)`                          | —               |
| row `ready`            | declared, not on air         | `rgb(116 205 246)`                         | —               |
| row `idle`             | empty                        | `rgb(91 93 96)`                            | —               |

⚠ **Red was DECLINED, not ruled out** — the reference's `.notice.error` is a legible pair. "Red
is not free" is true of this palette's `alarmFill` used as an ink (**2.08:1 on the modal
surface**, **1.64:1 on the notice's amber ground**), not of red in general.

⚠ **A ratio is a property of TWO values — never quote one without its ground.**

### 4.2 Console chrome already measured (`design.md` §26–§27)

`.app-head .btn` 32 / `5px 9px` / 12 / r5 · `.layer-subbar` 40 / `5px 10px` / gap 12 ·
search input 29 / `4px 8px 4px 30px` / r5 · `.pill-count` 10 px, 38.52 × 15 ·
`#onair-count` 11 / 500, `2px 6px`, r5 · `.layer-toolbar .btn` 32 / `5px 8px` / **12** / 550 /
r4 (its candidate said 11 — the measurement won) · `.layer-footer` 24 / 10 / icon 12 ·
tabs 13 / 550 / `letter-spacing: normal`, gap 22, `padding: 12px 0 9px` ·
`.layer-table th` 9.92 / 700 / uppercase / `.0595em`, `rgb(156 163 175)` on `rgb(45 55 69)`,
sticky, 25.77 tall · `.pvw-transport .btn` 25 / `2px 7px` / 11 / 550 / r3, svg 12 ·
`.plate-gain input[type=range]` — **still to measure, DELTA 7 §7**.

### 4.3 The reference's four-wave hazard, twice confirmed

Both `display:none` rules on the monitors are `@media`-only. And the `.notice` rule at document
position #5 (`15px 17px`, `#29241c`) does **NOT** paint at 1280 — position #1 does. **Read the
rendered value; never trust document order in that file.**

---

## 5. D7 — the channel combobox: establish answers already gathered

- **What it is today:** NOT a `<select>` and NOT a styled label. It is a
  `role="tablist"` of `role="tab"` buttons — `ChannelStrip` renders `TabStrip` at
  `level="outer"`, one tab per channel, labelled `CHANNEL N`.
- **Where the options come from:** `channelIds(bank, settings)` — already built for this in
  Phase 7. Two declared sources (`channelSettings.settings[].channel` and `bank.channel`);
  `observed` deliberately excluded; defaults to `[1]`.
- **What `change` does today:** `selectChannel(id)` writes `channelStore`. Two readers —
  `ChannelScope` (which only labels the tabpanel) and **Station setup's Channel section**, which
  keys its per-channel tab to the selection. **That is the only thing that re-scopes.** The
  layer list, PGM and PVW are single-channel by the bridge.
- **The owner's choice of a COMBOBOX is a deliberate DIVERGENCE from the reference**, recorded
  as such: the reference's picker is the tablist above. It is a UI SHAPE only — `R-062` still
  records the three real gaps (five `z.void()` bulk verbs, no discovery call, the bank as the
  only channel authority) and none of them is touched.
- ⚠ **A tablist → combobox swap leaves `ChannelScope`'s `TabPanel` labelled by a tab that no
  longer exists.** That must move with it or it is an a11y defect.

---

## 6. Constraints standing over every remaining item

- 🔴🔴 `silenceAllLivePlates` **STAYS UNSCOPED**. Its label may describe that scope; it may not
  narrow it.
- `add-multibox-audio` keeps its **ONE-CALL MAP** contract — SOLO and PANIC are cross-plate
  statements and a sequence of per-box calls cannot make one.
- Every frame stays reachable, **hidden ones included**.
- `#reassertDeclaredVolumes` stays **ONE-SHOT PER PROCESS**.
- No refusal CONDITION changes; no wire, IPC schema, or persisted-key changes.
- `prefersOwnMessage` stays **PER-CODE** — the wire's sentence sometimes carries the only
  operator-actionable word (`guest-3`).

---

## 7. What items 4–6 found, in one paragraph each

- **DELTA 7** — the Live plates tab already matched the drawing on all seven columns (text AND
  width), the toolbar, the 42 px rows and the three-part count. What moved: the verb family as
  role tokens on both surfaces, the panic treatment, and DELTA 8 §0's two verified strings.
- **DELTA 8** — the audio half landed behind ONE announcer both call paths share; SOLO is
  detected from the map's own shape, so `add-multibox-audio`'s one-call door is untouched. The
  LAYER-LEVEL verbs (bed/template, apply/revert) do NOT toast yet.
- **D9** — seven of nine were already delivered before tonight. D9.2 is not reproducible (the
  two numbers come from two sources; a look literally named "3 frames" explains it) and D9.9's
  width claim is false (measured 860 × 790, body 614 = its own scrollHeight). `design.md` §31.

⭐ **D9.4's persistence clause was PROVED rather than left standing:** the intent rides the item
(`StackItemStateSchema.plateVolumes`) and the bridge's restore re-applies it, with a comment
naming that exact failure — _"a dropped volume shows the right picture in silence"_.

## 8. 🔴 THE NEXT SESSION'S ITEM — `CHANNEL-PICKER-09`

D7 is superseded by a standalone prompt, **`CHANNEL-PICKER-09`**, written for a fresh session.
Everything §5 above banked still applies and must not be re-derived. Two things that prompt adds
and this session did NOT do:

- **A channel NAME may not exist.** Before building, find out whether `channelSettings` carries
  one. If it does, render `CH <id> · <name>` with the name in a `<bdi>`; if it does not, render
  the id alone and say so — **inventing a name field is a schema change and is out of scope.**
- **Look across all NINE reference pages** for one that draws the channel scope as a SELECT
  rather than a tablist. The measurement banked in §5 read one file. If such a page exists it
  changes what "the reference does" here.

⚠ And the reason this was not landed unattended still stands: a combobox DELETES the tab that
`ChannelScope`'s `TabPanel` takes its accessible name from. The panel must still be named
afterwards — a panel with no accessible name is a regression even though nothing looks
different.

## 9. Filed this session

- **`P-047`** — `live-look-reconcile` fails under gate load and passes **66/66** alone. The
  `B-098` class. Filed with its acceptance; **not** answered with a longer timeout.
- **`P-044`** gained a second note: `git add <dir>` **is** `git add -A` wearing a narrower
  path. Stage by explicit file.
- **`B-168` is ANNOTATED, not rewritten** — the owner reversed option (b) on 2026-09-13. A look
  press will DECLARE an intent; nothing is built for it, and it gets `LOOK-INTENT-08` in a fresh
  session. ⚠ The premise that raised it was wrong: the `PENDING` screenshot was the REFERENCE,
  ours says `TAKING` / `UNCONFIRMED`, and our `pending` is a confirmation gap. `R-063` stands.
- **D9.4's CAPS claim is FALSIFIED** (`design.md` §31.4). The reference is sentence case; ours
  keeps CAPS deliberately, because the vocabulary is shared across four surfaces.

## 9. Reverted commits

_None._ Every item that landed did so on its own green gate.

⚠ One in-flight revert worth naming: while adopting DELTA 8 §0's owner-link string I also folded
the owner's name into the button's ACCESSIBLE NAME, which no delta asked for and which
`live-source-layers.spec` pins. The suite caught it and it was reverted to the original string
verbatim before the commit. The lesson is in that commit's message: the sweep covered the two
strings I set out to change and not the third I changed in passing.

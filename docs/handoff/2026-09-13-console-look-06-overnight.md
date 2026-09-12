# `CONSOLE-LOOK-06` — overnight run, 2026-09-13

**Written BEFORE the big builds and kept current as each lands**, per the work order: a session
that stops leaves its measurements behind so the next one measures nothing twice.

Branch `dev`. One host: **Windows / Chromium via Playwright** — every visual claim below says
how it was seen, and a green gate is never the evidence (golden rule 12).

---

## 1. Status of the list

| #   | item                            | state                    | commit     |
| --- | ------------------------------- | ------------------------ | ---------- |
| 0a  | red correction into §29.2       | **landed**               | `a0c4abf1` |
| 0b  | §B4 reconciliation              | **PARKED, deliberately** | —          |
| 1   | DELTA 11 — green selected look  | **landed**               | `a0c4abf1` |
| 2   | DELTA 9 — PENDING doctrine + §2 | **landed**               | `cdb3529f` |
| 3   | this handover                   | **landed**               | —          |
| 4   | DELTA 7 — Live plates tab       | _in progress_            | —          |
| 5   | DELTA 8 — per-action toasts     | _not started_            | —          |
| 6   | D8b / D9.1–9.9 — audio modal    | _not started_            | —          |
| 7   | D7 — channel combobox           | _not started_            | —          |

---

## 2. 🔴 Open questions for the owner — nothing below was guessed

### 2.1 §B4 — which DRAWING governs the notice? (PARKED by the work order)

The measurement that settles the framing, taken in Chromium at 1280 × 800 on
`04-playout-layers.html` by mounting each class and reading `getComputedStyle`:

| class           | pad         | radius | ground          | ink                |
| --------------- | ----------- | ------ | --------------- | ------------------ |
| `.notice`       | `13px 15px` | 8      | `rgb(23 39 54)` | `rgb(190 214 229)` |
| `.notice.warn`  | `13px 15px` | 8      | `rgb(53 45 30)` | `rgb(243 205 136)` |
| `.notice.error` | `13px 15px` | 8      | `rgb(58 36 42)` | `rgb(255 170 167)` |

⭐ **`.notice.warn` IS our `Notice` refusal byte for byte.** The console banner is the drawing,
not a fourth spelling. The outlier is `SetupNotice` (`rgb(245 200 121)` on `rgb(41 36 28)`,
pad `15px 17px`, radius 10), whose geometry traces to the **Station setup** drawing — a
different approved design, signed off by `SETTINGS-MATCH-02`.

**The one-word answer needed:** does the console drawing govern Station setup's notice too
(pad 15→13, radius 10→8, ground `#29241c`→`#352d1e`, across nine pinned files), or do we merge
the COMPONENT and keep two measured skins? The component merge — moving `SetupNotice`'s icon
and bold-title-over-body onto `Notice` — is uncontroversial either way.

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

## 7. Reverted commits

_None so far._

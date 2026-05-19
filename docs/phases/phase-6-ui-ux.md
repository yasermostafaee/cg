# Phase 6 — UI / UX System

Two products, two UI dialects. Both follow the same design principles. Layout regions, interaction specs, color contracts, keyboard maps.

---

## 1. Design Principles (apply to both apps)

| #   | Principle                                                              | What it forbids                                                                                                                              |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **State must be visible, never inferred.**                             | Hidden modes, gestural state, modals that hide the live stack.                                                                               |
| 2   | **One action, one click — air-safety always one key.**                 | Multi-step confirmations on routine ops; modal dialogs blocking TAKE.                                                                        |
| 3   | **No element of UI relies on hue alone.**                              | Color-only status (always: color + icon + word).                                                                                             |
| 4   | **Legible in a darkened control room.**                                | Light grey on grey, ≤16 px body text, hairline borders.                                                                                      |
| 5   | **Keyboard parity for every air-critical action.**                     | Mouse-only PLAY/UPDATE/STOP.                                                                                                                 |
| 6   | **Operator can never lose the "now on air" view.**                     | Full-screen overlays without an explicit dismiss + escape key.                                                                               |
| 7   | **Destructive ops require deliberate effort, never confirmation.**     | Pop-up "Are you sure?" boxes during live broadcast — they're worse than the mistake. Use guards (hold-shift, lock screen, command grouping). |
| 8   | **Errors surface where the action was, not in a notification corner.** | Toasts for failed TAKEs. The stack item is the source of truth.                                                                              |
| 9   | **No surprise re-flow.**                                               | Auto-sort, auto-collapse, "smart" reordering of live items.                                                                                  |
| 10  | **Air-state colors are sacred** and used **nowhere else**.             | Decorative red anywhere in the UI; informational green.                                                                                      |

### Air-state color contract

| State                           | Color                         | Hex               | Icon | Word     |
| ------------------------------- | ----------------------------- | ----------------- | ---- | -------- |
| Idle                            | neutral-700                   | `#3F3F46`         | ○    | IDLE     |
| Loaded (ready to take)          | sky-500                       | `#0EA5E9`         | ▸    | READY    |
| Pending (intent ahead of truth) | amber-500                     | `#F59E0B`         | ⟳    | …        |
| On Air                          | rose-600                      | `#E11D48`         | ●    | ON AIR   |
| Updating on Air                 | rose-600 + amber pulse        | `#E11D48` + pulse | ⟳    | UPDATING |
| Exiting                         | amber-500                     | `#F59E0B`         | ◐    | EXIT     |
| Error                           | red-800                       | `#991B1B`         | ✕    | ERROR    |
| Disconnected                    | slate-400 with diagonal hatch | `#94A3B8`         | ⚠    | OFFLINE  |

The on-air rose and the error red are **deliberately different** — you should never confuse "this graphic is on air" with "this graphic failed."

### Typography

- **Body:** Inter at 15 px, weight 500. (Inter has good Persian fallbacks via Noto chain.)
- **Status labels:** 13 px, weight 700, tracked +1.
- **On-air ticker (status bar):** 18 px, weight 700.
- **Field labels:** 13 px, weight 500.
- **Field values (inspector):** 16 px, weight 500.
- All text supports Persian shaping via the bundled font chain (Vazirmatn → Noto Sans Arabic → Inter → Noto Color Emoji).

Avoid any text < 13 px in the Runtime app. Operators may sit 80 cm from a 24" display.

---

## 2. Runtime — Top-Level Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Sidebar (240)   │            Main Workspace                       │ Inspector│
│                  │                                                  │  (320)   │
│  ┌────────────┐  │  ┌──────────────────────────────────────────┐    │          │
│  │  Library   │  │  │ Monitor / PVW–PGM strip          [⌘P]   │    │  Fields  │
│  │  (search)  │  │  │                                          │    │          │
│  │            │  │  │   PVW                  PGM               │    │          │
│  │  Templates │  │  │  ┌────────┐         ┌────────┐           │    │          │
│  │  • LT      │  │  │  │preview │  TAKE→  │  live  │           │    │          │
│  │  • Logo    │  │  │  │        │  [SP]   │ on air │           │    │          │
│  │  • Ticker  │  │  │  └────────┘         └────────┘           │    │          │
│  │  • Break   │  │  └──────────────────────────────────────────┘    │          │
│  │  • Full    │  │                                                  │          │
│  │            │  │  ┌──────────────────────────────────────────┐    │          │
│  │  Playlists │  │  │ Stack                          + Add ▾   │    │          │
│  │  • Today   │  │  │                                          │    │          │
│  │            │  │  │  ●   LT-1   Anchor — "Sarah Lee"  [⌘1]  │    │          │
│  │            │  │  │  ▸   LT-2   Guest  — "Dr. Naderi" [⌘2]  │    │          │
│  │            │  │  │  ○   BRK-1  Breaking — "..."      [⌘3]  │    │          │
│  │            │  │  │  ⚠   TIK-1  Ticker  — offline     [⌘4]  │    │          │
│  │            │  │  │                                          │    │          │
│  │            │  │  └──────────────────────────────────────────┘    │          │
│  └────────────┘  │                                                  │          │
├──────────────────┴──────────────────────────────────────────────────┴──────────┤
│ Status bar:  ● PRIMARY  ○ BACKUP (standby)  •  1080i50  •  Audit OK  •  17:42 │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Sidebar (240 px):** Library and saved playlists. Collapsible to a 56 px rail.
- **Main workspace:** Monitor strip on top, Stack below. Both resize via a horizontal splitter (operator preference saved per workstation).
- **Inspector (320 px):** Always visible. Bound to the currently selected stack item.
- **Status bar:** Health, channel, audit, clock. Never hidden.

The four regions are **fixed in spatial position** across all Runtime states. No region "takes over" the screen. Modal dialogs do not exist; secondary panels open inside a region.

---

## 3. Runtime — Stack Component

The stack is the spine of the operator's day. One row per stack item:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ●  LT-1   Anchor — "Sarah Lee"                            ON AIR    ⌘1      │
│      Lower Third • 1080i50 • slot 1-12                                       │
│                                                                              │
│      [PVW]   [TAKE]   [UPDATE]   [OUT]   [REMOVE]                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Row height: 80 px (two text lines + button row). Comfortable for click-through.
- Status circle on the left uses the air-state color contract.
- Hotkey badge (`⌘1`) on the right.
- Action buttons are persistent — never hidden in a menu.
- A row in `error` state pushes a 24 px expandable banner with the error code, last action, and a `Retry` button.

### Row anatomy by state

| State               | Visible buttons       | Disabled buttons                 |
| ------------------- | --------------------- | -------------------------------- |
| `idle` (just added) | TAKE, PVW, REMOVE     | UPDATE, OUT                      |
| `loaded` (PVW)      | TAKE, OUT, REMOVE     | (UPDATE applies to PVW, allowed) |
| `playing` (entry)   | UPDATE, OUT           | TAKE, PVW                        |
| `on-air`            | UPDATE, OUT           | TAKE, PVW                        |
| `exiting`           | —                     | TAKE, UPDATE, OUT                |
| `error`             | Retry, Reload, REMOVE | TAKE, UPDATE                     |
| `disconnected`      | REMOVE                | everything else                  |

**Reorder**: drag handle on hover. Reordering an `on-air` item is a no-op (Principle 9). Reordering off-air items shifts only the off-air section.

**Duplicate**: right-click → Duplicate. New item inherits fields; gets a fresh `itemId`.

---

## 4. Runtime — Inspector (Dynamic Fields)

- Each field row uses the appropriate input (text/multiline/image/color/boolean/number/select).
- **Dirty indicator** per field: a dot on the label when local value differs from on-air. The bottom "Update" button is disabled when no field is dirty.
- For Persian text fields with `direction: rtl`, the input is right-aligned and bidi-aware. ZWNJ insertable via `Ctrl+Shift+2` (Persian keyboard convention).
- **Image fields** open a chooser that points at the workstation's media folder. Drag-drop also accepted.
- **Multiline** fields auto-expand to 6 lines max, then scroll.

### Update semantics

- Editing a field on an **idle** or **loaded** item updates its stored fields.
- Editing a field on an **on-air** item is **local** until the operator hits `Update`. The on-air graphic is unchanged.
- `Update` button triggers `CG INVOKE update` with **merge** semantics. (Replace is available via `Ctrl+Update`.)
- Visible status during update: button → spinner → ✓ on OSC confirm. If OSC doesn't confirm in 1 s, button becomes ⚠ with a tooltip.

---

## 5. Runtime — Monitor & PVW/PGM Strip

- **PVW** renders the currently selected stack item using the same template runtime in a sandboxed iframe at scaled-down resolution. Reflects pending field edits — operator sees their changes before they take.
- **PGM** is **derived from OSC truth**, not local intent. If the operator hits TAKE and OSC doesn't confirm, PGM does not visually flip to "live" — only the indicator goes amber.
- PGM is a representation, not a video feed. There is **no SDI capture in v1**. The "live" rendering shows the same template runtime with the same data the operator believes is on air; OSC frame events are used to keep loop animations roughly in sync.
- A switch in settings can replace PGM with an NDI receiver if the station has NDI output from CasparCG — deferred to v2.

### PVW→PGM mechanics

Two **workflow modes** per stack item (default = Direct; switchable per template via the inspector header):

- **Direct take:** clicking TAKE puts the graphic straight on air. PVW shows what _would_ happen if you took.
- **PVW→PGM take:** clicking PVW _loads_ the graphic into PVW (issues `CG ADD` with `play=0` and seeds fields). Clicking TAKE then plays it. Subsequent TAKE auto-loads the next stack item into PVW. This is the news-broadcast convention.

Mode is per item because (e.g.) the logo bug is always Direct; lower thirds in a long interview are PVW→PGM.

---

## 6. Runtime — Status Bar

```
●  PRIMARY caspar-a.lan  ○ BACKUP caspar-b.lan (standby)  •  1080i50  •  Audit OK  •  17:42:08
```

- Two health dots, one per server. Click opens a popover with detail (uptime, ping ms, OSC freshness, last failover).
- Channel + frame rate.
- Audit health: `Audit OK` (writing both local + UNC) / `Audit Local` (UNC unreachable) / `Audit STALLED` (write errors).
- Clock: NTP-synced if available; warning indicator if drift > 200 ms.

When either CasparCG drops, the status bar **expands** to a 64 px banner offering manual failover.

---

## 7. Disconnect, Failover, and Error Surfaces

Three tiers of surface, by severity:

1. **Inline (preferred):** the failing element shows its own error. (Stack row, field row, inspector header.) Most errors live here.
2. **Status-bar banner:** server health, audit health, schema-version mismatches.
3. **Full-screen takeover:** **only** when the Runtime cannot reach _any_ CasparCG and the operator must decide whether to continue working offline.

Even the full-screen takeover is not a modal — it's a region overlay above the workspace. Status bar and stack remain visible underneath.

---

## 8. Lock Screen / Pin (anti-accident)

Operators can engage `Lock` (status bar button, or `Ctrl+L`). When locked:

- All air-state-changing actions require **press-and-hold for 600 ms**.
- The lock indicator pulses in the status bar.
- Adding/removing stack items is disabled.
- Field edits remain enabled (operator can prepare next graphic) but `Update` requires hold.
- Unlock = `Ctrl+L` again, or `Esc Esc Esc` (three escapes within 1 s).

Lock is a **soft guard, not a security feature.**

---

## 9. Keyboard Map (Runtime, defaults)

| Action            | Default                      | Notes                        |
| ----------------- | ---------------------------- | ---------------------------- |
| Take selected     | `Space`                      | hold-to-fire when Lock is on |
| Update selected   | `U`                          | merge mode                   |
| Update (replace)  | `Shift+U`                    | replace mode                 |
| Out selected      | `O`                          | exit animation               |
| Out immediate     | `Shift+O`                    | skip exit animation          |
| Cue to PVW        | `P`                          | loads to PVW slot            |
| Remove            | `Delete`                     | confirms on locked screen    |
| Select stack 1–9  | `1`–`9` or `Ctrl+1`–`Ctrl+9` | matches `⌘n` badges          |
| Next / Prev item  | `J` / `K`                    | vim-style                    |
| Add from library  | `A`                          | opens fuzzy-search modal     |
| Focus inspector   | `I`                          | tab into first field         |
| Focus library     | `L`                          |                              |
| Failover now      | `Ctrl+Shift+F`               | always confirms              |
| Lock              | `Ctrl+L`                     |                              |
| Help / cheatsheet | `?`                          | overlay                      |

Every air-critical action has a key. Stream Deck mapping (deferred v1) reuses these as commands; the keymap is the API.

---

## 10. Designer — Top-Level Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Tools(56)│           Canvas                              │  Inspector (320)   │
│           │                                               │                    │
│  ╔═══╗    │   ┌─────────────────────────────────────┐     │  ┌──────────────┐ │
│  ║ V ║ →  │   │   safe areas overlay                │     │  │ Selection    │ │
│  ╠═══╣    │   │                                     │     │  │  • Transform │ │
│  ║ T ║    │   │   ┌──────────────────────────┐      │     │  │  • Style     │ │
│  ╠═══╣    │   │   │   element bounding box   │      │     │  │  • Animation │ │
│  ║ ▭ ║    │   │   │                          │      │     │  │  • Binding   │ │
│  ╠═══╣    │   │   └──────────────────────────┘      │     │  └──────────────┘ │
│  ║ ▣ ║    │   │                                     │     │                    │
│  ╠═══╣    │   │                                     │     │                    │
│  ║ ▶ ║    │   │                                     │     │                    │
│  ╚═══╝    │   └─────────────────────────────────────┘     │                    │
│           │                                               │                    │
│           │   1920×1080 • 50fps • 100%   [▶ play preview] │                    │
├───────────┴───────────────────────────────────────────────┴────────────────────┤
│  Layers / Timeline                                                             │
│                                                                                │
│   ◉ Layer "Background"                                                         │
│      ─ Rectangle  ──┤entry: fade 10f├───────────────                            │
│   ◉ Layer "Text"                                                               │
│      ─ "Anchor"   ──┤entry: slide-right 12f├──────┤exit: fade-out 8f├          │
│      ─ "Role"     ──┤entry: slide-right 14f (delay 2f)├─────────────           │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Tools rail (56 px):** Select / Text / Shape / Image / Lottie / Preview-play. Single-letter shortcuts (`V/T/R/I/L/Space`).
- **Canvas:** the iframe-of-the-real-template with the gizmo overlay (Phase 2 §6.2). Safe areas drawn as outline rectangles per `scene.safeAreas`.
- **Inspector:** four collapsible sections (Transform / Style / Animation / Binding). Animation section is **preset-driven**, not free timeline.
- **Layers / Timeline (bottom):** a constrained timeline showing entry / loop / exit blocks per element. **It is not a keyframe editor.** Duration is dragged at block edges; delay is dragged at block left; that's it.

### Designer-specific principle

The Designer is a **template authoring tool**, not a motion editor. Anything that would require an After-Effects-class timeline is excluded by design (Principle from the blueprint: "DO NOT create a complex After Effects clone"). When an animation can't be expressed via the preset system, the answer is **import a Lottie**, not "add a keyframe editor."

---

## 11. Designer — Canvas Interactions

| Gesture                           | Action                                                          |
| --------------------------------- | --------------------------------------------------------------- |
| Click element                     | Select; show gizmo                                              |
| `Shift+Click`                     | Add to selection                                                |
| `Cmd/Ctrl+Click`                  | Toggle in selection                                             |
| Drag element                      | Move; snap to: scene center, sibling edges, safe area, grid     |
| Drag handle                       | Resize; `Shift` to constrain aspect, `Alt` to scale from center |
| Drag rotate handle                | Rotate; `Shift` snaps to 15°                                    |
| Arrow keys                        | Move 1 px; `Shift+Arrow` 10 px; `Alt+Arrow` 0.1 px              |
| `Cmd/Ctrl+D`                      | Duplicate (no offset; lives on top of original)                 |
| `Cmd/Ctrl+G`                      | Group into container                                            |
| `Cmd/Ctrl+Shift+G`                | Ungroup                                                         |
| `Cmd/Ctrl+]` `[`                  | z-order ± 1                                                     |
| `Cmd/Ctrl+Shift+]` `[`            | z-order to front / back                                         |
| Double-click text                 | Inline edit (uses contenteditable in iframe)                    |
| `Space` (canvas focus)            | Play preview from frame 0                                       |
| `Shift+Space`                     | Play preview from current scrub position                        |
| `K`                               | Stop preview (calls `cg.stop`)                                  |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` | Undo / redo                                                     |

**Snap toggles** in canvas footer: `Snap to safe areas`, `Snap to siblings`, `Snap to grid (8 px)`. Operators using a fine-tune workflow can disable all snapping with `;`.

---

## 12. Designer — Animation Inspector

The animation section enforces the preset system from Phase 3 §5. **No free curves.**

- Durations shown in **frames** with **ms equivalent** in muted text — operators understand frames; designers understand ms; nobody is forced to learn both.
- Each preset's parameter list is generated from its `kind` (Phase 3 §5). Switching `kind` resets sub-parameters to sensible defaults.
- "Preview just this animation" plays from the relevant phase (entry plays from a hidden state, loop plays from the loop start, exit plays from on-air).

---

## 13. Designer — Dynamic Field Panel

A dedicated panel (toggle with `F`), opens as a sliding column right of the inspector. Shows the **scene-level** field declarations and bindings.

**Binding workflow:**

1. Select an element on the canvas (a text, image, or shape).
2. In the field panel, click `Bind` on a field.
3. Inspector switches to "binding mode": click the element property you want bound (text content, fill color, visibility, etc.).
4. Click to confirm; the field row now lists this binding.

This avoids a separate "bindings tab" UI. Bindings live where the operator's eyes already are.

**Pre-flight badges** in the panel:

- `Unbound` (warning): a declared field with no targets.
- `No fields` (info): the scene has no dynamic fields — likely a static template like a bumper.
- `Type mismatch` (error): an image field bound to a text target. Export blocked.

---

## 14. Designer — Keyboard Map (defaults)

| Action                                      | Default                     |
| ------------------------------------------- | --------------------------- |
| Tool: Select                                | `V`                         |
| Tool: Text                                  | `T`                         |
| Tool: Shape                                 | `R`                         |
| Tool: Image                                 | `I`                         |
| Tool: Lottie                                | `L`                         |
| Play preview                                | `Space`                     |
| Stop preview                                | `K`                         |
| Scrub +1 frame                              | `→` (when timeline focused) |
| Scrub -1 frame                              | `←`                         |
| Open fields panel                           | `F`                         |
| New layer                                   | `Shift+L`                   |
| Save (designer doc, not export)             | `Cmd/Ctrl+S`                |
| Export `.vcg`                               | `Cmd/Ctrl+E`                |
| Toggle safe areas                           | `'`                         |
| Toggle gizmos                               | `;`                         |
| Cycle resolution preview (1080/2160/custom) | `Cmd/Ctrl+Shift+R`          |

---

## 15. Accessibility & Hardware Surface Readiness

- **Tab order** follows visual order in every region. Air-critical buttons (TAKE/UPDATE/OUT) are reachable in ≤ 3 tabs from the stack focus.
- **Focus ring** is high-contrast amber (`#F59E0B`) on a 2 px outline. Never removed by CSS.
- **Screen-reader labels** declare the air state in words: `"LT-1, Anchor, Sarah Lee, ON AIR. Buttons: Take, Update, Out, Remove."`
- **High-contrast theme** ships as the default. A "Light" theme exists for daytime control rooms but uses the **same air-state palette** — only the chrome inverts.
- **Hardware adapter port** (deferred v1, designed-in v0):
  - Every air-critical action is a named **Command** (e.g., `runtime.take`, `runtime.update`, `runtime.outImmediate`, `runtime.failoverNow`, `runtime.lockToggle`, `runtime.selectStack:1`).
  - A `ControlSurfaceAdapter` consumes events from any source (Stream Deck plugin, X-keys driver, OSC, MIDI) and emits Commands. Keyboard handler is one such adapter.
  - Adding a Stream Deck in v2 means writing one adapter, not changing UI.
- **Tally output** (deferred v1, designed-in v0):
  - Every state transition on the stack emits a `TallyEvent` (already in Phase 3 §7). v1 logs them; v2 routes to GPO / OSC / NDI tally.

---

## 16. Loading, Empty, and Cold-Start States

Three states often handled badly:

| State                                     | UI shape                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **First launch, no CasparCG configured**  | Workspace shows a single onboarding card: "Connect a CasparCG server to begin." Library and stack are visible but disabled. |
| **No templates imported yet**             | Library has a "Drop a .vcg here or watch a folder" card. Stack shows "Add a template to start."                             |
| **CasparCG configured, nothing on air**   | Stack is empty; PGM monitor shows a "Off air" placeholder with the channel name. No errors — this is normal.                |
| **Runtime started, server still booting** | Sidebar usable; stack usable; air actions disabled with a tooltip "Connecting to caspar-a.lan…".                            |

Operators arrive in cold-start during every shift change. These states must feel like the app, not like an error.

---

## 17. Settings (Runtime)

A single Settings panel, opened from the gear icon in the sidebar. Sections:

- **Servers** — Primary / Backup addresses, AMCP port, OSC port, channel.
- **Watched folders** — paths to monitor for `.vcg` imports.
- **Redundancy** — strategy (mirror-sync / mirror-async / journal-replay), auto-failover on/off, thresholds.
- **Layer policy** — per-template-type layer ranges (defaults from Phase 5 §6.1).
- **Workflow** — default workflow mode (Direct / PVW-PGM), per-template overrides.
- **Audit** — UNC path, retention, redaction.
- **Telemetry** — opt-out, air-gapped mode.
- **Lock** — duration of press-and-hold (default 600 ms).
- **Appearance** — theme, font size scale (100/110/125%).

Settings open in a **region overlay** (not a modal). Stack and status bar remain visible — operator can still see if something just went on air.

---

## 18. Open Issues / Deferred to Later Phases

| Item                                                 | Phase deferred to                                    |
| ---------------------------------------------------- | ---------------------------------------------------- |
| Multi-language operator UI (en/fa)                   | v1.1 (string table exists, no translation yet)       |
| Per-operator preferences (sync across machines)      | v2 (depends on multi-user, not in v1)                |
| Templates folder structure / tagging / search facets | Phase 7 (folder structure) gives storage; UI is v1.1 |
| Stream Deck adapter                                  | v2                                                   |
| NDI/SDI PGM monitor                                  | v2                                                   |
| Macros / sequences                                   | v1.1 — UI placeholder in Library                     |
| Tally GPO integration                                | v2                                                   |
| Multi-channel control from one Runtime               | v2                                                   |
